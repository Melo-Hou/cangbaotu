/**
 * 云函数 analyzeVideo — 视频建图的 AI 识别核心
 *
 * 输入：{ frames: [{time, base64}, ...] }  （客户端 videoframes.js 抽好的帧）
 * 输出：结构化布局 JSON → 客户端渲染草稿（isomap.js 引擎直接可画）
 *
 * 实现：调用多模态视觉大模型（OpenAI 兼容接口，可对接混元/GLM-4V/GPT-4o 等）。
 * 部署前在云函数控制台配置环境变量 VISION_API_URL / VISION_API_KEY。
 */

const https = require('https');

const SYSTEM_PROMPT = `你是室内布局分析助手。用户给你一段环视住宅的视频抽帧。
请识别房间结构和家具，输出严格的 JSON（不要 markdown 代码块）：

{
  "rooms": [{ "name": "卧室|客厅|阳台|厨房|书房|卫生间", "confidence": 0-1 }],
  "furniture": [{
    "type": "wardrobe|bed|sofa|shelf|tvcab|desk|box|fridge|cabinet",
    "name": "简短中文名",
    "room": "所属房间名",
    "position": "房间内相对方位：左|中|右|左前|右前|靠墙",
    "confidence": 0-1,
    "subLocations": ["可能的子存储位置，如：上层/中层/床底/抽屉/箱内"]
  }]
}

规则：
1. 只输出 JSON 本身；
2. 家具按出现顺序编号；
3. 收纳箱/纸箱单独列出（type=box），这是本产品最重要的实体；
4. 置信度低于 0.5 的家具不要输出；
5. 看不清的细节用合理的常见值填充，confidence 如实打低。`;

function callVisionApi(apiUrl, apiKey, frames) {
  const content = [
    { type: 'text', text: '这是同一段环视住宅视频按时间顺序抽取的帧，请分析布局：' },
    ...frames.map((f) => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${f.base64}` },
    })),
  ];
  const body = JSON.stringify({
    model: 'vision-model', // 按所选服务商替换
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    temperature: 0.2,
    max_tokens: 2000,
  });
  const url = new URL(apiUrl);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 60000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function safeParseJson(text) {
  try { return JSON.parse(text); } catch (e) { /* 忽略 */ }
  const m = text.match(/\{[\s\S]*\}/); // 模型偶尔包 markdown，提取首个 JSON 块
  return m ? JSON.parse(m[0]) : null;
}

exports.main = async (event) => {
  const { frames } = event;
  if (!frames || !frames.length) return { code: 1, msg: 'no frames' };
  if (frames.length > 8) frames.length = 8; // 控制成本

  const apiUrl = process.env.VISION_API_URL;
  const apiKey = process.env.VISION_API_KEY;
  if (!apiUrl || !apiKey) return { code: 2, msg: 'missing VISION_API_URL / VISION_API_KEY env' };

  let resp;
  try {
    resp = await callVisionApi(apiUrl, apiKey, frames);
  } catch (e) {
    return { code: 3, msg: 'vision api error: ' + e.message };
  }

  const text = resp.choices && resp.choices[0] && resp.choices[0].message
    ? resp.choices[0].message.content : '';
  const layout = safeParseJson(text);
  if (!layout) return { code: 4, msg: 'model returned invalid json', raw: text.slice(0, 500) };

  return { code: 0, layout };
};
