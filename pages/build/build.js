// pages/build/build.js — AI 建图向导：上传户型图 + 视频 → 智能生成布局 → 拖拽校准 → 保存
const store = require('../../utils/store.js');
const planmap = require('../../utils/planmap.js');
const { extractFrames } = require('../../utils/videoframes.js');

const DW = 400, DH = 560;

// 演示用「AI 返回结果」（真实实现 = 云函数 analyzeHome 的返回，结构完全一致）
const SAMPLE = {
  plan: {
    outer: [20, 80, 360, 400],
    partitions: [[210, 84, 210, 260], [24, 262, 376, 262]],
    doors: [
      { x: 92, y: 257, w: 48, h: 10 },
      { x: 150, y: 152, w: 10, h: 46 },
    ],
  },
  zones: [
    { name: '卧室', x: 24, y: 84, w: 182, h: 176 },
    { name: '客厅', x: 214, y: 84, w: 162, h: 176 },
    { name: '阳台', x: 24, y: 264, w: 352, h: 212 },
  ],
  furniture: [
    { id: 'f1', type: 'wardrobe', label: '衣柜',   x: 32,  y: 94,  w: 70, h: 32, color: 'blue',   conf: 0.92 },
    { id: 'f2', type: 'bed',      label: '床',     x: 120, y: 94,  w: 62, h: 84, color: 'amber',  conf: 0.9 },
    { id: 'f3', type: 'box',      label: '收纳箱A', x: 46,  y: 200, w: 50, h: 30, color: 'teal',   conf: 0.74 },
    { id: 'f4', type: 'sofa',     label: '沙发',   x: 228, y: 96,  w: 64, h: 30, color: 'coral',  conf: 0.68 },
    { id: 'f5', type: 'tvcab',    label: '电视柜', x: 238, y: 216, w: 74, h: 18, color: 'purple', conf: 0.87 },
    { id: 'f6', type: 'shelf',    label: '置物架', x: 40,  y: 306, w: 84, h: 26, color: 'gray',   conf: 0.9 },
    { id: 'f7', type: 'box',      label: '纸箱B',  x: 190, y: 340, w: 46, h: 32, color: 'teal',   conf: 0.63 },
  ],
};

Page({
  data: { planImg: '', frameCount: 0, running: false, log: [], draft: false },

  onLoad() {
    wx.createSelectorQuery()
      .select('#draft')
      .fields({ node: true, size: true, rect: true })
      .exec((res) => {
        const r = res[0];
        if (!r) return;
        this.drect = { left: r.left, top: r.top, width: r.width, height: r.height };
        const canvas = r.node;
        const dpr = wx.getWindowInfo().pixelRatio;
        canvas.width = r.width * dpr;
        canvas.height = r.height * dpr;
        this.dctx = canvas.getContext('2d');
        this.dctx.scale(dpr, dpr);
        this.dcanvas = canvas;
        this.ddpr = dpr;
        if (this.draft) this.renderDraft();
      });
  },

  log(s) { this.setData({ log: this.data.log.concat(s) }); },

  /* ① 上传户型图图片 */
  pickPlan() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'],
      success: (r) => {
        const f = r.tempFiles[0];
        this.setData({ planImg: f.tempFilePath });
        try {
          wx.getFileSystemManager().readFile({
            filePath: f.tempFilePath, encoding: 'base64',
            success: (d) => {
              this.planB64 = d.data;
              this.log(`户型图已就绪（${Math.round(d.data.length / 1024)}KB，真实模式传给视觉模型识别房间结构）`);
            },
            fail: () => this.log('户型图读取失败，将仅用视频生成'),
          });
        } catch (e) { this.log('户型图读取异常：' + e.message); }
      },
    });
  },

  /* ② 上传环视视频 → 客户端抽帧 */
  pickVideo() {
    wx.chooseMedia({
      count: 1, mediaType: ['video'], maxDuration: 60,
      success: async (r) => {
        const p = r.tempFiles[0].tempFilePath;
        this.log('视频已选择，抽帧中…');
        try {
          const frames = await extractFrames(p, 6);
          this.frames = frames;
          this.setData({ frameCount: frames.length });
          this.log(`抽帧完成：${frames.length} 帧（320×180 jpg，直接可传视觉模型）`);
        } catch (e) {
          this.frames = null;
          this.setData({ frameCount: 0 });
          this.log('抽帧失败（' + e.message + '），真实环境可降级为云函数 ffmpeg 抽帧');
        }
      },
    });
  },

  /* ③ 智能生成 */
  runAI() {
    this.setData({ running: true });
    this.log('提交视觉大模型分析（户型图 ' + (this.planB64 ? '有' : '无') + ' + 视频 ' + (this.frames ? this.frames.length + ' 帧' : '无') + ')…');
    if (!wx.cloud) { this.log('当前未接入云环境，自动切换演示数据'); return this.demo(); }
    wx.cloud.callFunction({
      name: 'analyzeHome',
      data: { planImage: this.planB64 || null, frames: this.frames || [] },
    })
      .then((r) => {
        const res = r.result;
        if (res && res.code === 0) { this.log('AI 返回布局 ✓'); this.applyLayout(res.layout); }
        else { this.log('AI 返回异常（' + ((res && res.msg) || '未知') + '），使用演示数据'); this.demo(); }
      })
      .catch(() => { this.log('云函数 analyzeHome 未部署，使用演示数据（部署方法见 README）'); this.demo(); });
  },

  demo() {
    this.setData({ running: true });
    const steps = [
      '识别户型图：3 个房间、2 处内门、1 处入户门 ✓',
      '视频抽帧分析：识别 7 件家具（含 2 个收纳箱）✓',
      '生成 400×560 布局坐标，低置信度已标黄 ✓',
    ];
    steps.forEach((s, i) => setTimeout(() => this.log(s), 600 * (i + 1)));
    setTimeout(() => this.applyLayout(SAMPLE), 2200);
  },

  applyLayout(layout) {
    this.draft = layout;
    this.setData({ draft: true, running: false });
    // 等画布查询回调完成后渲染
    setTimeout(() => this.renderDraft(), 100);
  },

  /* ④ 拖拽校准 */
  renderDraft() {
    if (!this.dctx || !this.draft || !this.drect) return;
    const ctx = this.dctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.dcanvas.width, this.dcanvas.height);
    const s = Math.min(this.drect.width / DW, this.drect.height / DH);
    this.ds = s;
    this.dox = (this.drect.width - DW * s) / 2;
    this.doy = (this.drect.height - DH * s) / 2;
    ctx.setTransform(this.ddpr * s, 0, 0, this.ddpr * s, this.ddpr * this.dox, this.ddpr * this.doy);
    const low = this.draft.furniture.filter((f) => (f.conf || 1) < 0.8).map((f) => f.id);
    planmap.drawMap(ctx, this.draft.zones, this.draft.furniture, low, this.draft.plan);
    ctx.restore();
  },

  onTS(e) {
    if (!this.draft || !this.drect) return;
    const t = e.touches[0];
    const x = (t.clientX - this.drect.left - this.dox) / this.ds;
    const y = (t.clientY - this.drect.top - this.doy) / this.ds;
    this.dragId = planmap.hitTest(this.draft.furniture, x, y);
  },

  onTM(e) {
    if (!this.dragId || !this.draft) return;
    const t = e.touches[0];
    const x = (t.clientX - this.drect.left - this.dox) / this.ds;
    const y = (t.clientY - this.drect.top - this.doy) / this.ds;
    const f = this.draft.furniture.find((g) => g.id === this.dragId);
    if (f) {
      f.x = Math.max(24, Math.min(376 - f.w, x - f.w / 2));
      f.y = Math.max(84, Math.min(476 - f.h, y - f.h / 2));
      this.renderDraft();
    }
  },

  onTE() { this.dragId = null; },

  /* ⑤ 保存 → 3D 视图 */
  saveDraft() {
    store.saveLayout(this.draft);
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.redirectTo({ url: '/pages/view3d/view3d' }), 500);
  },
});
