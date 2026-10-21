/**
 * store.js — MVP 数据层：位置树 + 物品，本地存储持久化
 * 接入云开发时只需替换本文件的 load/save 与各写操作，页面代码不用动。
 */
const KEY = 'cangbaotu_data_v1';
const SEASON_LABEL = { winter: '冬', summer: '夏', spring: '春', autumn: '秋', all: '四季' };

const SEED = {
  zones: [
    { name: '卧室', pts: [[140, 88], [272, 154], [140, 220], [8, 154]] },
    { name: '客厅', pts: [[285, 242], [392, 296], [285, 350], [178, 296]] },
    { name: '阳台', pts: [[148, 356], [258, 410], [148, 464], [38, 410]] },
  ],
  furniture: [
    { id: 'wardrobe_b', cx: 100, cy: 152, h: 62, color: 'blue',   label: '衣柜B' },
    { id: 'box_blue',   cx: 52,  cy: 196, h: 18, color: 'teal',   label: '蓝色收纳箱2' },
    { id: 'bed',        cx: 196, cy: 188, h: 26, color: 'amber',  label: '床' },
    { id: 'box_bed',    cx: 136, cy: 224, h: 20, color: 'teal',   label: '床底塑料箱1' },
    { id: 'sofa',       cx: 250, cy: 296, h: 30, color: 'coral',  label: '沙发' },
    { id: 'tvcab',      cx: 322, cy: 322, h: 22, color: 'purple', label: '电视柜' },
    { id: 'shelf',      cx: 126, cy: 418, h: 52, color: 'gray',   label: '储物架' },
    { id: 'box_c',      cx: 196, cy: 434, h: 22, color: 'teal',   label: '纸箱C' },
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

function reset() { cache = JSON.parse(JSON.stringify(SEED)); save(); }

module.exports = {
  SEASON_LABEL,
  get zones() { return load().zones; },
  get furniture() { return load().furniture; },
  get root() { return load().root; },
  findById, search, addItem, addSubLocation, setItemStatus, removeItem, reset,
};
