/**
 * 云函数 analyzeHome — 户型图图片 + 环视视频 → 智能生成物品存储布局
 *
 * 输入：{ planImage: base64|null, frames: [{time, base64}]|[] }
 * 输出：{ code:0, layout:{ plan, zones, furniture } }（坐标为 400×560 画布像素，客户端可直接渲染）
 *
 * 与 analyzeVideo 的区别：同时接受户型图图片与视频抽帧，直接产出可保存的完整布局。
 * 部署：环境变量 VISION_API_URL / VISION_API_KEY（OpenAI 兼容多模态接口）。
 */

const https = require('https');

const SYSTEM_PROMPT = `你是室内布局分析师。用户会提供两类素材（可能只有其一）：
① 住宅户型图图片 —— 请识别房间结构：房间名称、位置、隔墙走向、门洞位置；
② 环视住宅的视频抽帧 —— 请识别家具与收纳容器及其相对方位。

输出严格的 JSON（禁止 markdown 代码块）：
{
  "plan": {
    "outer": [20, 80, 360, 400],
    "partitions": [[x1,y1,x2,y2]],
    "doors": [{"x":..,"y":..,"w":48,"h":10}]
  },
  "zones": [{"name":"卧室|客厅|阳台|厨房|书房","x":24,"y":84,"w":200,"h":176}],
  "furniture": [{
    "id": "f1",
    "type": "wardrobe|bed|sofa|shelf|tvcab|box|fridge|cabinet",
    "name": "简短中文名",
    "x": 32, "y": 94, "w": 80, "h": 34,
    "color": "blue|amber|teal|gray|coral|purple",
    "confidence": 0.92
  }]
}

规则：
1. 全部坐标基于 400×560 画布，户型绘制在 [20,80]~[380,480] 区域内；
2. 房间矩形必须铺满 outer 且互不重叠；partitions 用线段表示隔墙；
3. 家具/收纳箱放在所属房间矩形内，不得相互重叠；
4. 收纳箱、纸箱、储物箱必须单独列出（type=box），这是本产品最重要的实体；
5. confidence < 0.5 的家具丢弃；颜色只能从枚举中选；
6. 只输出 JSON 本身。`;

function callVisionApi(apiUrl, apiKey, images) {
  const content = [
    { type: 'text', text: '请根据以下素材生成住宅布局与家具存放位置：' },
    ...images.map((b64) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } })),
  ];
  const body = JSON.stringify({
    model: 'vision-model', // 按所选服务商替换
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    temperature: 0.2,
    max_tokens: 3000,
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
      timeout: 90000,
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
  try { return JSON.parse(text); } catch (e) { /* ignore */ }
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

exports.main = async (event) => {
  const { planImage, frames } = event || {};
  const images = [];
  if (planImage) images.push(planImage);
  (frames || []).slice(0, 6).forEach((f) => images.push(f.base64));
  if (!images.length) return { code: 1, msg: 'no images: need planImage or frames' };

  const apiUrl = process.env.VISION_API_URL;
  const apiKey = process.env.VISION_API_KEY;
  if (!apiUrl || !apiKey) return { code: 2, msg: 'missing VISION_API_URL / VISION_API_KEY env' };

  let resp;
  try {
    resp = await callVisionApi(apiUrl, apiKey, images);
  } catch (e) {
    return { code: 3, msg: 'vision api error: ' + e.message };
  }
  const text = resp.choices && resp.choices[0] && resp.choices[0].message
    ? resp.choices[0].message.content : '';
  const layout = safeParseJson(text);
  if (!layout || !layout.zones || !layout.furniture) {
    return { code: 4, msg: 'model returned invalid layout', raw: text.slice(0, 500) };
  }
  return { code: 0, layout };
};
