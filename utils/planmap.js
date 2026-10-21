/**
 * planmap.js — 户型图（平面俯视）风格渲染 + 命中检测
 * 调用约定与 isomap.js 一致：
 *   drawMap(ctx, zones, furniture, highlights, plan)
 *   hitTest(furniture, px, py) → 家具 id | null
 * 坐标体系：家具/房间均为矩形 {x, y, w, h}（俯视 footprint）
 */

const WALL = '#4a4a47';
const FLOOR = '#f3f1ea';
const PARTITION = '#c9c7be';

const PLAN_PAL = {
  blue:   { fill: '#cfe3f7', stroke: '#185fa5' },
  amber:  { fill: '#fde3b8', stroke: '#a8650f' },
  teal:   { fill: '#c2ead9', stroke: '#0f6e56' },
  gray:   { fill: '#e0ded6', stroke: '#5f5e5a' },
  coral:  { fill: '#f9d5c6', stroke: '#993c1d' },
  purple: { fill: '#dcd8f6', stroke: '#534ab7' },
};

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 门洞：底色矩形盖住墙体 + 门扇线 + 开合弧 */
function drawDoor(ctx, d) {
  ctx.fillStyle = '#fbfaf7';
  ctx.fillRect(d.x, d.y, d.w, d.h);
  ctx.strokeStyle = '#8a8880';
  ctx.lineWidth = 1.2;
  if (d.w >= d.h) {
    // 水平墙上的门：铰链在左，门扇向上开
    const cy = d.y + d.h / 2, r = d.w;
    ctx.beginPath();
    ctx.moveTo(d.x, cy);
    ctx.lineTo(d.x, cy - r);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(d.x, cy, r, -Math.PI / 2, 0);
    ctx.stroke();
  } else {
    // 垂直墙上的门：铰链在上，门扇向右开
    const cx = d.x + d.w / 2, r = d.h;
    ctx.beginPath();
    ctx.moveTo(cx, d.y);
    ctx.lineTo(cx + r, d.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, d.y, r, 0, Math.PI / 2);
    ctx.stroke();
  }
}

/** 俯视家具图形 */
function drawFurniture(ctx, f, pulse) {
  const c = PLAN_PAL[f.color] || PLAN_PAL.gray;
  const { x, y, w, h } = f;
  const r = Math.min(4, w / 4, h / 4);

  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = c.fill;
  ctx.fill();
  ctx.strokeStyle = c.stroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.strokeStyle = c.stroke;
  ctx.lineWidth = 1;
  if (f.type === 'bed') {
    // 枕头 + 被沿
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillRect(x + 5, y + 4, w - 10, h * 0.16);
    ctx.beginPath();
    ctx.moveTo(x + 3, y + h * 0.32);
    ctx.lineTo(x + w - 3, y + h * 0.32);
    ctx.stroke();
  } else if (f.type === 'wardrobe') {
    // 双开门缝 + 把手
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 3);
    ctx.lineTo(x + w / 2, y + h - 3);
    ctx.stroke();
    ctx.fillStyle = c.stroke;
    ctx.fillRect(x + w / 2 - 5, y + h / 2 - 1, 3, 3);
    ctx.fillRect(x + w / 2 + 2, y + h / 2 - 1, 3, 3);
  } else if (f.type === 'box') {
    // 纸箱打叉
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + w - 3, y + h - 3);
    ctx.moveTo(x + w - 3, y + 3); ctx.lineTo(x + 3, y + h - 3);
    ctx.stroke();
  } else if (f.type === 'sofa') {
    // 靠背
    ctx.fillStyle = c.stroke;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x + 2, y + 2, w - 4, 6);
    ctx.globalAlpha = 1;
  } else if (f.type === 'shelf') {
    // 格子分隔线
    for (let i = 1; i <= 3; i++) {
      const gx = x + (w * i) / 4;
      ctx.beginPath();
      ctx.moveTo(gx, y + 2);
      ctx.lineTo(gx, y + h - 2);
      ctx.stroke();
    }
  } else if (f.type === 'tvcab') {
    ctx.beginPath();
    ctx.moveTo(x + 4, y + h / 2);
    ctx.lineTo(x + w - 4, y + h / 2);
    ctx.stroke();
  }

  // 标签：矮图形放下方，高图形放内部
  ctx.fillStyle = '#444441';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  if (h >= 26) ctx.fillText(f.label, x + w / 2, y + h / 2 + 3.5);
  else ctx.fillText(f.label, x + w / 2, y + h + 13);

  // 搜索命中：红色虚线框 + 脉冲
  if (pulse) {
    ctx.save();
    ctx.strokeStyle = '#a32d2d';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(pulse * Math.PI));
    roundRectPath(ctx, x - 7, y - 7, w + 14, h + 14, 6);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * 绘制一帧户型图
 * @param plan { outer:[x,y,w,h], partitions:[[x1,y1,x2,y2]...], doors:[{x,y,w,h}] }
 */
function drawMap(ctx, zones, furniture, highlights = [], plan = null) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // 房间地板 + 名称
  zones.forEach((z) => {
    ctx.fillStyle = FLOOR;
    ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.fillStyle = '#a8a69d';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(z.name, z.x + 8, z.y + 16);
  });

  // 内墙
  ctx.strokeStyle = PARTITION;
  ctx.lineWidth = 3;
  (plan.partitions || []).forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });

  // 外墙（厚）
  if (plan && plan.outer) {
    ctx.strokeStyle = WALL;
    ctx.lineWidth = 7;
    ctx.strokeRect(plan.outer[0], plan.outer[1], plan.outer[2], plan.outer[3]);
  }

  // 门洞（画在墙之上）
  (plan.doors || []).forEach((d) => drawDoor(ctx, d));

  // 家具（无遮挡关系，顺序无影响）
  const t = (Date.now() % 1100) / 1100;
  furniture.forEach((f) => drawFurniture(ctx, f, highlights.includes(f.id) ? t : 0));
}

/** 命中检测：点是否在某个家具矩形内 */
function hitTest(furniture, px, py) {
  for (let i = furniture.length - 1; i >= 0; i--) {
    const f = furniture[i];
    if (px >= f.x && px <= f.x + f.w && py >= f.y && py <= f.y + f.h) return f.id;
  }
  return null;
}

module.exports = { drawMap, hitTest, PLAN_PAL };
