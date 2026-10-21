// pages/map/map.js — 藏宝图 MVP 首页
// 地图浏览 + 搜索高亮 + 点击下钻 + 物品录入/取出/放回/删除
const { drawMap, hitTest } = require('../../utils/planmap.js'); // 户型图（俯视）风格
const store = require('../../utils/store.js');

const DW = 400, DH = 560; // 地图设计坐标（viewBox 逻辑尺寸）
const SEASONS = [
  { v: 'all', l: '四季' }, { v: 'winter', l: '冬' }, { v: 'summer', l: '夏' },
  { v: 'spring', l: '春' }, { v: 'autumn', l: '秋' },
];

Page({
  data: {
    query: '', results: [], highlights: [],
    sheet: null,
    adding: false, subAdding: false,
    newName: '', newQty: '1', newSeason: 'all', subName: '',
    seasons: SEASONS,
  },

  onReady() {
    wx.createSelectorQuery()
      .select('#map')
      .fields({ node: true, size: true, rect: true })
      .exec((res) => {
        const r = res[0];
        this.rect = { left: r.left, top: r.top, width: r.width, height: r.height };
        const canvas = r.node;
        const dpr = wx.getWindowInfo().pixelRatio;
        canvas.width = r.width * dpr;
        canvas.height = r.height * dpr;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.dpr = dpr;
        this.render();
        // 高亮脉冲动画
        this.timer = setInterval(() => {
          if (this.data.highlights.length) this.render();
        }, 140);
      });
  },

  onUnload() { clearInterval(this.timer); },

  scale() { return Math.min(this.rect.width / DW, this.rect.height / DH); },
  offX() { return (this.rect.width - DW * this.scale()) / 2; },
  offY() { return (this.rect.height - DH * this.scale()) / 2; },

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.scale();
    ctx.setTransform(this.dpr * s, 0, 0, this.dpr * s, this.dpr * this.offX(), this.dpr * this.offY());
    drawMap(ctx, store.zones, store.furniture, this.data.highlights, store.plan);
    ctx.restore();
  },

  /* 点击家具 → 下钻 */
  onTouchStart(e) {
    const t = e.touches[0];
    const s = this.scale();
    const x = (t.clientX - this.rect.left - this.offX()) / s;
    const y = (t.clientY - this.rect.top - this.offY()) / s;
    const id = hitTest(store.furniture, x, y);
    if (id) this.openLocation(id);
  },

  openLocation(id) {
    const found = store.findById(id);
    if (!found) return;
    const n = found.node;
    this.setData({
      adding: false, subAdding: false, newName: '', subName: '',
      sheet: {
        id: n.id,
        name: n.name,
        path: found.path.map(p => p.name).join(' / '),
        subs: (n.children || []).map(c => ({ id: c.id, name: c.name })),
        items: (n.items || []).map(it => ({
          ...it,
          seasonLabel: store.SEASON_LABEL[it.season] || '四季',
          statusLabel: it.status === 'taken_out' ? '已取出' : '',
        })),
      },
    });
  },

  onSubTap(e) { this.openLocation(e.currentTarget.dataset.id); },
  closeSheet() { this.setData({ sheet: null }); },

  goBuild() { wx.navigateTo({ url: '/pages/build/build' }); },
  go3d() { wx.navigateTo({ url: '/pages/view3d/view3d' }); },

  /* ---- 录入 ---- */
  toggleAdd() { this.setData({ adding: !this.data.adding, subAdding: false }); },
  toggleSubAdd() { this.setData({ subAdding: !this.data.subAdding, adding: false }); },
  onName(e) { this.setData({ newName: e.detail.value }); },
  onQty(e) { this.setData({ newQty: e.detail.value }); },
  onSubName(e) { this.setData({ subName: e.detail.value }); },
  pickSeason(e) { this.setData({ newSeason: e.currentTarget.dataset.v }); },

  saveItem() {
    const name = (this.data.newName || '').trim();
    if (!name || !this.data.sheet) return;
    store.addItem(this.data.sheet.id, {
      name,
      qty: Number(this.data.newQty) || 1,
      season: this.data.newSeason,
    });
    wx.showToast({ title: '已添加', icon: 'success' });
    this.openLocation(this.data.sheet.id);
    this.setData({ adding: true }); // 保持表单展开，方便连续录入
  },

  saveSub() {
    const name = (this.data.subName || '').trim();
    if (!name || !this.data.sheet) return;
    const sub = store.addSubLocation(this.data.sheet.id, name);
    wx.showToast({ title: '已添加位置', icon: 'success' });
    this.openLocation(sub.id);
  },

  /* ---- 取出 / 放回 / 删除 ---- */
  onItemTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !this.data.sheet) return;
    wx.showActionSheet({
      itemList: ['取出（带走了）', '放回原位', '删除记录'],
      success: (res) => {
        if (res.tapIndex === 0) store.setItemStatus(this.data.sheet.id, item.id, 'taken_out');
        if (res.tapIndex === 1) store.setItemStatus(this.data.sheet.id, item.id, 'stored');
        if (res.tapIndex === 2) store.removeItem(this.data.sheet.id, item.id);
        this.openLocation(this.data.sheet.id);
      },
    });
  },

  /* ---- 搜索 ---- */
  onSearch(e) {
    const q = (e.detail.value || '').trim();
    this.setData({ query: q });
    if (!q) { this.setData({ results: [], highlights: [] }); this.render(); return; }
    const hits = store.search(q);
    const geoIds = [...new Set(hits.map(h => h.geoId).filter(Boolean))];
    this.setData({
      results: hits.map(h => ({
        key: h.containerId + '-' + h.item.id,
        locationId: h.containerId,
        geoId: h.geoId,
        label: `${h.item.name} ×${h.item.qty} · 在「${h.containerName}」`,
      })),
      highlights: geoIds,
    });
    this.render();
  },

  clearSearch() {
    this.setData({ query: '', results: [], highlights: [] });
    this.render();
  },

  onResultTap(e) {
    const { locationId, geoId } = e.currentTarget.dataset;
    if (geoId) this.setData({ highlights: [geoId] });
    this.openLocation(locationId);
  },
});
