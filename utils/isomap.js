/**
 * isomap.js — 2.5D 等轴测地图绘制与命中检测核心
 * 纯 Canvas 2D 实现，可直接用于微信小程序（type="2d" canvas）
 * 与交互原型 HTML 使用同一套数学：cx/cy 为底面中心，h 为高度
 */

const W = 24, H2 = 12; // 单元格半宽/半高

const PAL = {
  blue:   { top: '#B5D4F4', left: '#85B7EB', right: '#378ADD', stroke: '#185FA5' },
  amber:  { top: '#FAC775', left: '#EF9F27', right: '#BA7517', stroke: '#854F0B' },
  teal:   { top: '#9FE1CB', left: '#5DCAA5', right: '#1D9E75', stroke: '#0F6E56' },
  gray:   { top: '#D3D1C7', left: '#B4B2A9', right: '#888780', stroke: '#5F5E5A' },
  coral:  { top: '#F5C4B3', left: '#F0997B', right: '#D85A30', stroke: '#993C1D' },
  purple: { top: '#CECBF6', left: '#AFA9EC', right: '#7F77DD', stroke: '#534AB7' },
};

/** 等轴测体的三个可见面顶点 */
function isoFaces(cx, cy, h) {
  return {
    top:   [[cx, cy - h], [cx + W, cy - h + H2], [cx, cy - h + 2 * H2], [cx - W, cy - h + H2]],
    left:  [[cx - W, cy - h + H2], [cx, cy - h + 2 * H2], [cx, cy + 2 * H2], [cx - W, cy + H2]],
    right: [[cx, cy - h + 2 * H2], [cx + W, cy - h + H2], [cx + W, cy + H2], [cx, cy + 2 * H2]],
  };
}

function fillPoly(ctx, pts, fill, stroke) {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

/** 射线法：点是否在多边形内 */
function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * 绘制一帧地图
 * @param ctx canvas 2d context
 * @param zones  房间地板 [{name, pts:[[x,y]...]}]
 * @param furns  家具 [{id, cx, cy, h, color, label, name}]
 * @param highlights 命中高亮的家具 id 数组
 */
function drawMap(ctx, zones, furns, highlights = []) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // 地板
  zones.forEach((z) => {
    fillPoly(ctx, z.pts, '#EFECE4', '#D3D1C7');
    ctx.fillStyle = '#A8A69D';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    const lx = (z.pts[2][0] + z.pts[3][0]) / 2;
    const ly = (z.pts[2][1] + z.pts[3][1]) / 2 - 6;
    ctx.fillText(z.name, lx, ly);
  });

  // 家具（按 cy 排序保证遮挡关系正确）
  [...furns]
    .sort((a, b) => a.cy - b.cy)
    .forEach((g) => {
      const c = PAL[g.color] || PAL.gray;
      const f = isoFaces(g.cx, g.cy, g.h);
      fillPoly(ctx, f.left, c.left, c.stroke);
      fillPoly(ctx, f.right, c.right, c.stroke);
      fillPoly(ctx, f.top, c.top, c.stroke);

      ctx.fillStyle = '#5F5E5A';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(g.label || g.name, g.cx, g.cy + H2 + 16);

      // 搜索命中：红色虚线圈 + 脉冲
      if (highlights.includes(g.id)) {
        const t = (Date.now() % 1100) / 1100;
        ctx.save();
        ctx.strokeStyle = '#A32D2D';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * Math.PI));
        ctx.beginPath();
        ctx.ellipse(g.cx, g.cy + 2, 36, 19, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
}

/** 触摸命中检测：返回被点击的家具 id 或 null */
function hitTest(furns, px, py) {
  // 从绘制顺序的顶层往下找（cy 大的在上层）
  const sorted = [...furns].sort((a, b) => b.cy - a.cy);
  for (const g of sorted) {
    const f = isoFaces(g.cx, g.cy, g.h);
    if (pointInPoly(px, py, f.top) || pointInPoly(px, py, f.left) || pointInPoly(px, py, f.right)) {
      return g.id;
    }
  }
  return null;
}

module.exports = { drawMap, hitTest, isoFaces, pointInPoly, PAL };
