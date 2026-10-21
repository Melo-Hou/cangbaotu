/**
 * store.js — MVP 数据层：位置树 + 物品，本地存储持久化
 * 接入云开发时只需替换本文件的 load/save 与各写操作，页面代码不用动。
 */
const KEY = 'cangbaotu_data_v3'; // v3：导入用户真实户型（两室一厅一厨一卫双阳台）
const SEASON_LABEL = { winter: '冬', summer: '夏', spring: '春', autumn: '秋', all: '四季' };

const SEED = {
  style: 'plan', // 底图风格：plan=户型图（俯视） / iso=2.5D 等轴测
  plan: {
    // 用户真实户型：总宽 9590mm（3225+3340+3025），进深 5655 + 阳台 1093mm
    outer: [20, 153, 360, 253],
    partitions: [
      [20, 194, 380, 194],   // 阳台行 | 主区 隔墙
      [141, 194, 141, 406],  // 卧室A | 厨房/客餐厅
      [266, 194, 266, 406],  // 厨卫/客餐厅 | 卧室B
      [203, 194, 203, 299],  // 厨房 | 卫生间
      [141, 299, 266, 299],  // 厨卫行 | 客餐厅
    ],
    doors: [
      { x: 52,  y: 189, w: 44, h: 10 },  // 阳台A ↔ 卧室A
      { x: 296, y: 189, w: 44, h: 10 },  // 阳台B ↔ 卧室B
      { x: 136, y: 350, w: 10, h: 46 },  // 卧室A ↔ 客餐厅
      { x: 261, y: 340, w: 10, h: 46 },  // 卧室B ↔ 客餐厅
      { x: 150, y: 294, w: 48, h: 10 },  // 厨房 ↔ 客餐厅
      { x: 225, y: 294, w: 44, h: 10 },  // 卫生间 ↔ 客餐厅
      { x: 180, y: 401, w: 52, h: 10 },  // 入户门（客餐厅南墙）
    ],
  },
  zones: [
    { name: '阳台',   x: 20,  y: 153, w: 121, h: 41 },
    { name: '阳台',   x: 267, y: 153, w: 113, h: 41 },
    { name: '卧室',   x: 20,  y: 194, w: 121, h: 212 },
    { name: '厨房',   x: 141, y: 194, w: 62,  h: 105 },
    { name: '卫生间', x: 203, y: 194, w: 63,  h: 105 },
    { name: '客餐厅', x: 141, y: 299, w: 125, h: 107 },
    { name: '卧室',   x: 267, y: 194, w: 113, h: 212 },
  ],
  furniture: [
    { id: 'wardrobe_a',    x: 30,  y: 200, w: 84, h: 34, type: 'wardrobe', color: 'blue',   label: '衣柜A' },
    { id: 'box_bed1',      x: 80,  y: 362, w: 52, h: 30, type: 'box',      color: 'teal',   label: '床底塑料箱1' },
    { id: 'wardrobe_b',    x: 275, y: 200, w: 80, h: 32, type: 'wardrobe', color: 'blue',   label: '衣柜B' },
    { id: 'box_bed2',      x: 300, y: 362, w: 58, h: 30, type: 'box',      color: 'teal',   label: '床底收纳箱2' },
    { id: 'shelf_ba1',     x: 30,  y: 160, w: 70, h: 26, type: 'shelf',    color: 'gray',   label: '阳台A储物架' },
    { id: 'box_c',         x: 285, y: 158, w: 46, h: 28, type: 'box',      color: 'teal',   label: '纸箱C' },
    { id: 'shelf_kitchen', x: 145, y: 202, w: 54, h: 22, type: 'shelf',    color: 'gray',   label: '厨房置物架' },
    { id: 'tvcab',         x: 150, y: 372, w: 80, h: 18, type: 'tvcab',    color: 'purple', label: '客餐厅电视柜' },
    { id: 'shoebox',       x: 146, y: 340, w: 56, h: 22, type: 'cabinet',  color: 'purple', label: '玄关柜' },
  ],
  root: {
    id: 'home', name: '我的家', children: [
      { id: 'wardrobe_a', name: '衣柜A', children: [
        { id: 'in_wardrobe_a', name: '箱内', items: [
          { id: 'it1', name: '羽绒服', qty: 3, season: 'winter', status: 'stored' },
          { id: 'it2', name: '羊绒衫', qty: 4, season: 'winter', status: 'stored' },
          { id: 'it3', name: '床单被套', qty: 2, season: 'all', status: 'stored' },
        ] },
      ] },
      { id: 'box_bed1', name: '床底塑料箱1', children: [
        { id: 'in_box_bed1', name: '箱内', items: [
          { id: 'it4', name: '手套', qty: 2, season: 'winter', status: 'stored' },
          { id: 'it5', name: '取暖器', qty: 1, season: 'winter', status: 'stored' },
          { id: 'it6', name: '电热毯', qty: 1, season: 'winter', status: 'stored' },
        ] },
      ] },
      { id: 'wardrobe_b', name: '衣柜B', children: [
        { id: 'in_wardrobe_b', name: '箱内', items: [
          { id: 'it7', name: '夏凉被', qty: 2, season: 'summer', status: 'stored' },
          { id: 'it8', name: '凉席', qty: 1, season: 'summer', status: 'stored' },
        ] },
      ] },
      { id: 'box_bed2', name: '床底收纳箱2', children: [
        { id: 'in_box_bed2', name: '箱内', items: [
          { id: 'it9', name: '风扇', qty: 1, season: 'summer', status: 'stored' },
        ] },
      ] },
      { id: 'shelf_ba1', name: '阳台A储物架', children: [
        { id: 'in_shelf_ba1', name: '架内', items: [
          { id: 'it10', name: '行李箱', qty: 1, season: 'all', status: 'stored' },
        ] },
      ] },
      { id: 'box_c', name: '纸箱C', children: [
        { id: 'in_box_c', name: '箱内', items: [
          { id: 'it11', name: '落地灯灯罩', qty: 1, season: 'all', status: 'stored' },
          { id: 'it12', name: '备用灯泡', qty: 4, season: 'all', status: 'stored' },
        ] },
      ] },
      { id: 'shelf_kitchen', name: '厨房置物架', children: [
        { id: 'in_shelf_kitchen', name: '架内', items: [
          { id: 'it13', name: '清洁用品', qty: 1, season: 'all', status: 'stored' },
        ] },
      ] },
      { id: 'tvcab', name: '客餐厅电视柜', children: [
        { id: 'in_tvcab', name: '抽屉', items: [
          { id: 'it14', name: '数据线合集', qty: 1, season: 'all', status: 'stored' },
          { id: 'it15', name: '遥控器收纳', qty: 1, season: 'all', status: 'stored' },
        ] },
      ] },
      { id: 'shoebox', name: '玄关柜', children: [
        { id: 'in_shoebox', name: '柜内', items: [
          { id: 'it16', name: '工具箱', qty: 1, season: 'all', status: 'stored' },
          { id: 'it17', name: '手电筒', qty: 1, season: 'all', status: 'stored' },
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
