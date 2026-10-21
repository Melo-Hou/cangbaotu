/**
 * store.js — MVP 数据层：位置树 + 物品，本地存储持久化
 * 接入云开发时只需替换本文件的 load/save 与各写操作，页面代码不用动。
 */
const KEY = 'cangbaotu_data_v2'; // v2：底图改为户型图（矩形坐标）
const SEASON_LABEL = { winter: '冬', summer: '夏', spring: '春', autumn: '秋', all: '四季' };

const SEED = {
  style: 'plan', // 底图风格：plan=户型图（俯视） / iso=2.5D 等轴测
  plan: {
    outer: [20, 80, 360, 400],
    partitions: [
      [226, 84, 226, 260],   // 卧室 | 客厅 隔墙
      [24, 262, 376, 262],   // 上排房间 | 阳台 隔墙
    ],
    doors: [
      { x: 96,  y: 257, w: 48, h: 10 },  // 卧室 → 阳台
      { x: 286, y: 257, w: 48, h: 10 },  // 客厅 → 阳台
      { x: 15,  y: 150, w: 10, h: 46 },  // 入户门（卧室左墙）
    ],
  },
  zones: [
    { name: '卧室', x: 24,  y: 84,  w: 200, h: 176 },
    { name: '客厅', x: 228, y: 84,  w: 148, h: 176 },
    { name: '阳台', x: 24,  y: 264, w: 352, h: 212 },
  ],
  furniture: [
    { id: 'wardrobe_b', x: 32,  y: 94,  w: 84, h: 34, type: 'wardrobe', color: 'blue',   label: '衣柜B' },
    { id: 'bed',        x: 140, y: 94,  w: 64, h: 86, type: 'bed',      color: 'amber',  label: '床' },
    { id: 'box_bed',    x: 146, y: 196, w: 52, h: 30, type: 'box',      color: 'teal',   label: '床底塑料箱1' },
    { id: 'sofa',       x: 240, y: 96,  w: 66, h: 30, type: 'sofa',     color: 'coral',  label: '沙发' },
    { id: 'tvcab',      x: 250, y: 218, w: 78, h: 18, type: 'tvcab',    color: 'purple', label: '电视柜' },
    { id: 'shelf',      x: 36,  y: 300, w: 88, h: 26, type: 'shelf',    color: 'gray',   label: '储物架' },
    { id: 'box_c',      x: 180, y: 336, w: 48, h: 34, type: 'box',      color: 'teal',   label: '纸箱C' },
  ],
  root: {
    id: 'home', name: '我的家', children: [
      { id: 'wardrobe_b', name: '衣柜B', children: [
        { id: 'wb_top', name: '上层', children: [
          { id: 'box_blue', name: '蓝色收纳箱2号', children: [
            { id: 'l_blue', name: '箱内', items: [
              { id: 'it1', name: '羽绒服', qty: 3, season: 'winter', status: 'stored' },
              { id: 'it2', name: '羊绒衫', qty: 4, season: 'winter', status: 'stored' },
            ] },
          ] },
        ] },
        { id: 'wb_mid', name: '中层', items: [
          { id: 'it3', name: '床单被套', qty: 2, season: 'all', status: 'stored' },
        ] },
      ] },
      { id: 'bed', name: '床', children: [
        { id: 'under_bed', name: '床底', children: [
          { id: 'box_bed', name: '床底塑料箱1', children: [
            { id: 'l_bed', name: '箱内', items: [
              { id: 'it4', name: '手套', qty: 2, season: 'winter', status: 'stored' },
              { id: 'it5', name: '取暖器', qty: 1, season: 'winter', status: 'stored' },
              { id: 'it6', name: '电热毯', qty: 1, season: 'winter', status: 'stored' },
            ] },
          ] },
        ] },
      ] },
      { id: 'sofa', name: '沙发', children: [
        { id: 'sofa_box', name: '沙发底储物格', items: [
          { id: 'it7', name: '凉席', qty: 1, season: 'summer', status: 'stored' },
        ] },
      ] },
      { id: 'tvcab', name: '电视柜', children: [
        { id: 'tv_drawer', name: '抽屉', items: [
          { id: 'it8', name: '风扇', qty: 1, season: 'summer', status: 'stored' },
          { id: 'it9', name: '数据线合集', qty: 1, season: 'all', status: 'stored' },
        ] },
      ] },
      { id: 'shelf', name: '阳台储物架', children: [
        { id: 'shelf_s1', name: '第一格', children: [
          { id: 'box_c', name: '纸箱C', children: [
            { id: 'l_c', name: '箱内', items: [
              { id: 'it10', name: '落地灯灯罩', qty: 1, season: 'all', status: 'stored' },
              { id: 'it11', name: '备用灯泡', qty: 4, season: 'all', status: 'stored' },
            ] },
          ] },
        ] },
        { id: 'shelf_s2', name: '第二格', items: [
          { id: 'it12', name: '工具箱', qty: 1, season: 'all', status: 'stored' },
        ] },
      ] },
    ],
  },
};

let cache = null;

function load() {
  if (cache) return cache;
  try { cache = wx.getStorageSync(KEY) || null; } catch (e) { cache = null; }
  if (!cache || !cache.root) {
    cache = JSON.parse(JSON.stringify(SEED));
    save();
  }
  return cache;
}
function save() { try { wx.setStorageSync(KEY, cache); } catch (e) { /* 存储满忽略 */ } }

function walk(node, path, id) {
  if (node.id === id) return { node, path };
  for (const c of node.children || []) {
    const r = walk(c, path.concat(c), id);
    if (r) return r;
  }
  return null;
}
function findById(id) { return walk(load().root, [load().root], id); }

function collect(node, path, out) {
  const p = path.concat(node);
  for (const it of node.items || []) out.push({ item: it, container: node, path: p });
  for (const c of node.children || []) collect(c, p, out);
  return out;
}

/** 物品所在容器 → 地图上最近的有图形的祖先 id（用于高亮） */
function geoIdFor(path) {
  const furns = load().furniture;
  for (let i = path.length - 1; i >= 0; i--) {
    const f = furns.find(g => g.id === path[i].id);
    if (f) return f.id;
  }
  return null;
}

/** 搜索：物品名模糊匹配 或 季节词（冬/夏/…） */
function search(q) {
  q = (q || '').trim();
  if (!q) return [];
  const seasonKey = Object.keys(SEASON_LABEL).find(k => SEASON_LABEL[k] === q || k === q);
  const lower = q.toLowerCase();
  return collect(load().root, [], [])
    .filter(x => seasonKey ? x.item.season === seasonKey : x.item.name.toLowerCase().includes(lower))
    .map(x => ({
      containerId: x.container.id,
      containerName: x.container.name,
      item: x.item,
      geoId: geoIdFor(x.path),
    }));
}

function addItem(locationId, item) {
  const found = findById(locationId);
  if (!found || !item.name) return null;
  const rec = { id: 'it' + Date.now(), qty: 1, season: 'all', status: 'stored', ...item };
  found.node.items = found.node.items || [];
  found.node.items.push(rec);
  save();
  return rec;
}

function addSubLocation(parentId, name) {
  const found = findById(parentId);
  if (!found || !name) return null;
  const node = { id: 'loc' + Date.now(), name, children: [] };
  found.node.children = found.node.children || [];
  found.node.children.push(node);
  save();
  return node;
}

function setItemStatus(locationId, itemId, status) {
  const found = findById(locationId);
  if (!found) return;
  const it = (found.node.items || []).find(x => x.id === itemId);
  if (it) { it.status = status; save(); }
}

function removeItem(locationId, itemId) {
  const found = findById(locationId);
  if (!found) return;
  found.node.items = (found.node.items || []).filter(x => x.id !== itemId);
  save();
}

/** 用 AI 生成/校准后的布局替换底图与家具图形；位置树按家具 id 复用旧节点（保留已录物品） */
function saveLayout(layout) {
  const data = load();
  data.plan = layout.plan;
  data.zones = layout.zones;
  data.furniture = layout.furniture;
  const oldRoot = JSON.parse(JSON.stringify(data.root));
  data.root = {
    id: 'home', name: '我的家',
    children: layout.furniture.map((f) => {
      const found = walk(oldRoot, [oldRoot], f.id);
      if (found) {
        found.node.name = f.label || found.node.name;
        return found.node;
      }
      return {
        id: f.id, name: f.label || '未命名位置',
        children: [{ id: 'in_' + f.id, name: '内部', items: [] }],
      };
    }),
  };
  save();
}

function reset() { cache = JSON.parse(JSON.stringify(SEED)); save(); }

module.exports = {
  SEASON_LABEL,
  get style() { return load().style; },
  get plan() { return load().plan; },
  get zones() { return load().zones; },
  get furniture() { return load().furniture; },
  get root() { return load().root; },
  findById, search, addItem, addSubLocation, setItemStatus, removeItem, saveLayout, reset,
};
