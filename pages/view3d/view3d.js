// pages/view3d/view3d.js — 3D 视图：环绕视角（单指旋转 / 双指缩放 / 点家具看内容）
const store = require('../../utils/store.js');
const p3 = require('../../utils/plan3d.js');
const { PLAN_PAL } = require('../../utils/planmap.js');

const S = 100; // 户型图坐标 → 世界坐标缩放
const HEIGHTS = { wardrobe: 0.6, bed: 0.35, box: 0.28, sofa: 0.42, shelf: 0.55, tvcab: 0.24, fridge: 0.65, cabinet: 0.5 };

Page({
  data: { info: null },

  onReady() {
    wx.createSelectorQuery()
      .select('#c3d')
      .fields({ node: true, size: true, rect: true })
      .exec((res) => {
        const r = res[0];
        this.rect = { left: r.left, top: r.top, width: r.width, height: r.height };
        const canvas = r.node;
        const dpr = wx.getWindowInfo().pixelRatio;
        canvas.width = r.width * dpr;
        canvas.height = r.height * dpr;
        this.ctx = canvas.getContext('2d');
        this.ctx.scale(dpr, dpr);
        this.cam = p3.makeCam();
        this.buildScene();
        this.render();
        this.timer = setInterval(() => { if (this.data.info) this.render(); }, 140);
      });
  },

  onUnload() { clearInterval(this.timer); },

  buildScene() {
    const floors = store.zones.map((z) => ({ x: z.x / S, z: z.y / S, w: z.w / S, d: z.h / S, fill: '#efede6' }));
    const walls = [];
    const T = 0.09, H = 1.1, WC = '#dedbd2', WC2 = '#e5e2d9';
    const p = store.plan || { outer: [20, 80, 360, 400], partitions: [] };
    const [ox, oy, ow, oh] = p.outer;
    walls.push({ x: ox / S, z: oy / S, w: ow / S, d: T, h: H, fill: WC, stroke: '#8a8880' });
    walls.push({ x: ox / S, z: (oy + oh - T) / S, w: ow / S, d: T, h: H, fill: WC, stroke: '#8a8880' });
    walls.push({ x: ox / S, z: oy / S, w: T, d: oh / S, h: H, fill: WC, stroke: '#8a8880' });
    walls.push({ x: (ox + ow - T) / S, z: oy / S, w: T, d: oh / S, h: H, fill: WC, stroke: '#8a8880' });
    (p.partitions || []).forEach(([x1, y1, x2, y2]) => {
      if (x1 === x2) walls.push({ x: x1 / S - T / 2, z: Math.min(y1, y2) / S, w: T, d: Math.abs(y2 - y1) / S, h: H, fill: WC2, stroke: '#9a988f' });
      else walls.push({ x: Math.min(x1, x2) / S, z: y1 / S - T / 2, w: Math.abs(x2 - x1) / S, d: T, h: H, fill: WC2, stroke: '#9a988f' });
    });
    const cuboids = store.furniture.map((f) => ({
      id: f.id, pick: true, label: f.label,
      x: f.x / S, z: f.y / S, w: f.w / S, d: f.h / S,
      h: HEIGHTS[f.type] || 0.4,
      fill: (PLAN_PAL[f.color] || PLAN_PAL.gray).fill,
      stroke: (PLAN_PAL[f.color] || PLAN_PAL.gray).stroke,
    }));
    this.scene = { floors, walls, cuboids };
  },

  render() {
    if (!this.ctx) return;
    const sel = this.data.info && this.data.info.id;
    p3.renderScene(this.ctx, this.rect.width, this.rect.height, this.scene, this.cam, sel, (Date.now() % 1100) / 1100);
  },

  onTS(e) {
    if (e.touches.length === 1) {
      this.moved = 0;
      this.last = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    } else if (e.touches.length === 2) {
      this.pinch0 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      this.dist0 = this.cam.dist;
    }
  },

  onTM(e) {
    if (e.touches.length === 1 && this.last) {
      const dx = e.touches[0].clientX - this.last.x;
      const dy = e.touches[0].clientY - this.last.y;
      this.moved = (this.moved || 0) + Math.abs(dx) + Math.abs(dy);
      this.cam.azim -= dx * 0.008;
      this.cam.elev = Math.max(0.15, Math.min(1.35, this.cam.elev + dy * 0.006));
      this.last = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this.render();
    } else if (e.touches.length === 2 && this.pinch0) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (d > 0) {
        this.cam.dist = Math.max(3.5, Math.min(14, (this.dist0 * this.pinch0) / d));
        this.render();
      }
    }
  },

  onTE(e) {
    if (this.last && (this.moved || 0) < 6 && Date.now() - this.last.t < 350) {
      const t = e.changedTouches[0];
      const id = p3.hitTest3d(this.scene, this.cam, this.rect.width, this.rect.height, t.clientX - this.rect.left, t.clientY - this.rect.top);
      this.select(id);
    }
    this.last = null; this.pinch0 = null;
  },

  select(id) {
    if (!id) { this.setData({ info: null }); this.render(); return; }
    const found = store.findById(id);
    const node = found && found.node;
    const items = ((node && node.items) || []).map((i) => ({ id: i.id, name: i.name, qty: i.qty }));
    this.setData({
      info: {
        id,
        name: (node && node.name) || id,
        path: found ? found.path.map((n) => n.name).join(' / ') : '',
        items,
        subs: ((node && node.children) || []).map((c) => c.name),
      },
    });
    this.render();
  },

  closeInfo() { this.setData({ info: null }); this.render(); },
  resetCam() { this.cam = p3.makeCam(); this.render(); },
  goPlan() { wx.navigateTo({ url: '/pages/map/map' }); },
  goBuild() { wx.navigateTo({ url: '/pages/build/build' }); },
});
