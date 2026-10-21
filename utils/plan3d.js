/**
 * plan3d.js — 轻量 3D 场景渲染器（Canvas 2D 光栅化，零依赖）
 * 把户型图（俯视矩形）挤出成 3D 小屋；相机支持方位角/俯仰/距离（环绕视角）
 *
 * 坐标系：世界 y 轴向上；户型图 (px,py) → 世界 (px/S, 0, py/S)，S=100（页面层换算）
 * renderScene(ctx, w, h, scene, cam, selectedId, t)
 *   scene = { floors:[{x,z,w,d,fill}], walls:[cuboid], cuboids:[cuboid] }
 *   cuboid = { id?, pick?, label?, x, z, w, d, h, fill, stroke }
 * hitTest3d(scene, cam, w, h, px, py) → 被点的家具 id | null
 */

function hexRgb(h) {
  h = h.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function shade(hex, k) {
  if (!hex || hex[0] !== '#') return hex;
  const c = hexRgb(hex).map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

function makeCam(over) {
  return Object.assign(
    { target: [2, 0.25, 2.6], azim: 0.65, elev: 0.52, dist: 7.5, focalK: 1.05 },
    over || {}
  );
}

function camBasis(cam) {
  const [tx, ty, tz] = cam.target;
  const ce = Math.cos(cam.elev), se = Math.sin(cam.elev);
  const ca = Math.cos(cam.azim), sa = Math.sin(cam.azim);
  const eye = [tx + cam.dist * ce * sa, ty + cam.dist * se, tz + cam.dist * ce * ca];
  let f = [tx - eye[0], ty - eye[1], tz - eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]) || 1;
  f = [f[0] / fl, f[1] / fl, f[2] / fl];
  let r = [-f[2], 0, f[0]];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  r = [r[0] / rl, r[1] / rl, r[2] / rl];
  const u = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ];
  return { eye, f, r, u };
}

function project(p, cam, B, w, h) {
  const d = [p[0] - B.eye[0], p[1] - B.eye[1], p[2] - B.eye[2]];
  const z = dot(d, B.f);
  if (z < 0.15) return null;
  const x = dot(d, B.r), y = dot(d, B.u);
  const focal = Math.min(w, h) * cam.focalK;
  return [w / 2 + (focal * x) / z, h / 2 - (focal * y) / z, z];
}

function cuboidFaces(c) {
  const { x, z, w, d } = c, y = 0, h = c.h;
  const b = [[x, y, z], [x + w, y, z], [x + w, y, z + d], [x, y, z + d]];
  const t = b.map((p) => [p[0], y + h, p[2]]);
  return [
    { pts: t, n: [0, 1, 0], k: 1.02 },
    { pts: [b[3], b[2], t[2], t[3]], n: [0, 0, 1], k: 0.86 },
    { pts: [b[1], b[0], t[0], t[1]], n: [0, 0, -1], k: 0.76 },
    { pts: [b[0], b[3], t[3], t[0]], n: [-1, 0, 0], k: 0.68 },
    { pts: [b[2], b[1], t[1], t[2]], n: [1, 0, 0], k: 0.9 },
  ];
}

function poly(ctx, pts, fill, stroke, lw) {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 0.8; ctx.stroke(); }
}

/**
 * 渲染一帧 3D 场景
 * @param selectedId 高亮的家具 id（红色线框脉冲）
 * @param t 0~1 脉冲相位（传 Date.now()%1100/1100）
 */
function renderScene(ctx, w, h, scene, cam, selectedId, t) {
  ctx.clearRect(0, 0, w, h);
  const B = camBasis(cam);
  const P = (p) => project(p, cam, B, w, h);

  // 地板
  scene.floors.forEach((fl) => {
    const q = [
      [fl.x, 0.005, fl.z], [fl.x + fl.w, 0.005, fl.z],
      [fl.x + fl.w, 0.005, fl.z + fl.d], [fl.x, 0.005, fl.z + fl.d],
    ].map(P);
    if (q.some((p) => !p)) return;
    poly(ctx, q, fl.fill, '#c9c7be', 0.7);
  });

  // 收集所有可见面（画家算法：按深度排序）
  const faces = [];
  scene.walls
    .concat(scene.cuboids)
    .forEach((c) => {
      cuboidFaces(c).forEach((fc) => {
        const ctr = [
          (fc.pts[0][0] + fc.pts[2][0]) / 2,
          (fc.pts[0][1] + fc.pts[2][1]) / 2,
          (fc.pts[0][2] + fc.pts[2][2]) / 2,
        ];
        const toEye = [B.eye[0] - ctr[0], B.eye[1] - ctr[1], B.eye[2] - ctr[2]];
        if (dot(fc.n, toEye) <= 0) return; // 背面剔除
        const pts = fc.pts.map(P);
        if (pts.some((p) => !p)) return;
        const depth = pts.reduce((s, p) => s + p[2], 0) / 4;
        faces.push({
          pts, depth,
          fill: shade(c.fill, fc.k),
          stroke: c.stroke || '#9a988f',
          id: c.id || null,
        });
      });
    });
  faces.sort((a, b) => b.depth - a.depth);
  faces.forEach((f) => poly(ctx, f.pts, f.fill, f.stroke, 0.8));

  // 标签（始终最上层）
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  scene.cuboids.forEach((c) => {
    const p = P([c.x + c.w / 2, c.h + 0.18, c.z + c.d / 2]);
    if (!p) return;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.strokeText(c.label, p[0], p[1]);
    ctx.fillStyle = '#333331';
    ctx.fillText(c.label, p[0], p[1]);
  });

  // 选中高亮：红色线框脉冲
  if (selectedId) {
    const c = scene.cuboids.find((x) => x.id === selectedId);
    if (c) {
      const { x, z, w: cw, d: ch } = c, hh = c.h + 0.06;
      const y = -0.02;
      const b = [[x, y, z], [x + cw, y, z], [x + cw, y, z + ch], [x, y, z + ch]];
      const tp = b.map((p) => [p[0], y + hh, p[2]]);
      const edges = [
        [b[0], b[1]], [b[1], b[2]], [b[2], b[3]], [b[3], b[0]],
        [tp[0], tp[1]], [tp[1], tp[2]], [tp[2], tp[3]], [tp[3], tp[0]],
        [b[0], tp[0]], [b[1], tp[1]], [b[2], tp[2]], [b[3], tp[3]],
      ];
      ctx.save();
      ctx.strokeStyle = '#a32d2d';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 3]);
      ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(t * Math.PI));
      edges.forEach(([a, b2]) => {
        const pa = P(a), pb = P(b2);
        if (!pa || !pb) return;
        ctx.beginPath();
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0], pb[1]);
        ctx.stroke();
      });
      ctx.restore();
    }
  }
}

/** 点击拾取：投影家具顶面中心，取屏幕距离最近者 */
function hitTest3d(scene, cam, w, h, px, py) {
  const B = camBasis(cam);
  let best = null, bd = 32 * 32;
  scene.cuboids.forEach((c) => {
    if (!c.pick) return;
    const p = project([c.x + c.w / 2, c.h / 2, c.z + c.d / 2], cam, B, w, h);
    if (!p) return;
    const dist = (p[0] - px) * (p[0] - px) + (p[1] - py) * (p[1] - py);
    if (dist < bd) { bd = dist; best = c.id; }
  });
  return best;
}

module.exports = { renderScene, hitTest3d, makeCam, PLAN3D_DEFAULT: makeCam() };
