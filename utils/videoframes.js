/**
 * utils/videoframes.js — 小程序端视频抽帧（真实实现）
 *
 * 流程：chooseMedia 选视频 → VideoDecoder 解码 → 指定时间点取帧
 *      → 帧数据(RGBA)画到离屏 canvas → 导出 jpg → 返回 base64 数组
 * 传给云函数 analyzeVideo 做视觉识别。
 *
 * 注意：VideoDecoder 的 frameData 为 ArrayBuffer(RGBA)，需转为 ImageData 绘制。
 * 若机型兼容性有问题，降级方案：视频上传云存储 → 云函数 ffmpeg 抽帧。
 */

function createOffscreen() {
  // 离屏 canvas 用于 RGBA → jpg
  return wx.createOffscreenCanvas({ type: '2d', width: 320, height: 180 });
}

/**
 * 从视频抽 n 帧，返回 [{time, base64}]
 * @param {string} src 视频临时路径（wx.chooseMedia 返回 tempFilePath）
 */
async function extractFrames(src, count = 6) {
  const decoder = wx.createVideoDecoder();
  decoder.start({ src });

  await new Promise((resolve, reject) => {
    decoder.on('ready', resolve);
    setTimeout(() => reject(new Error('decoder start timeout')), 8000);
  });

  const meta = await new Promise((resolve) => {
    decoder.on('metadata', resolve);
  });
  const duration = meta.duration; // 秒

  const canvas = createOffscreen();
  const ctx = canvas.getContext('2d');
  const frames = [];

  for (let i = 0; i < count; i++) {
    const t = Math.min(duration * ((i + 0.6) / count), duration - 0.1);
    decoder.seek(t);
    // eslint-disable-next-line no-await-in-loop
    const frame = await new Promise((resolve) => {
      decoder.on('frameData', (d) => resolve(d));
      setTimeout(() => resolve(null), 5000);
    });
    if (!frame) continue;

    // RGBA buffer → ImageData → canvas → jpg base64
    const imageData = canvas.createImageData({
      width: frame.width, height: frame.height,
      data: new Uint8ClampedArray(frame.data),
    });
    // 缩放绘制到 320x180，控制上传体积
    const tmp = wx.createOffscreenCanvas({ type: '2d', width: frame.width, height: frame.height });
    tmp.getContext('2d').putImageData(imageData, 0, 0);
    ctx.clearRect(0, 0, 320, 180);
    ctx.drawImage(tmp, 0, 0, frame.width, frame.height, 0, 0, 320, 180);

    const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
    frames.push({ time: t, base64 });
  }

  decoder.stop();
  decoder.destroy();
  return frames;
}

module.exports = { extractFrames };
