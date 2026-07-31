/* ============================================================
   HAPPY 4 MONTH ANNIVERSARY — a love letter in six acts
   Vanilla canvas 2D for the tree + GSAP for the orchestration.

   ACT 1  a real recurve bow with a Cupid's arrow nocked — you
          DRAW the string down and RELEASE to fire (pointer drag,
          or keyboard). A softly beating heart waits above as the
          target.
   ACT 2  the arrow flies up and strikes the heart; the heart
          jolts, falls, and bursts into a flood of rose that
          swallows the frame (no cross-fade). The title hinges up
          out of that colour, glyph by glyph.
   ACT 3  the same rose, but counting: nine months of knowing
          each other, five of talking every day, four of this.
   ACT 4  three chapters of photographs fly in, settle into a
          pile, and lift away again.
   ACT 5  a gold light blooms, and the tree grows into one heart
          of lit blossoms.
   ACT 6  the light returns, and opens onto two pairs of shoes
          standing side by side under a sky that fills with
          hearts and never empties.

   Acts 1–2 are one paused GSAP timeline built at release time (it
   needs the shot geometry). Everything after is a chain: each act
   builds its own timeline and calls the next one, so nothing is
   measured before the frame it lives in. The tree owns a separate
   rAF because it is simulated, not tweened.
   ============================================================ */

/* gsap arrives as a global from vendor/gsap.min.js — see index.html */

/* the pen-stroke plugin: a `drawn` 0..1 property for the underline */
gsap.registerPlugin({
  name: 'drawn',
  init(target, value) {
    const len = target.getTotalLength();
    target.style.strokeDasharray = len;
    this.target = target; this.len = len; this.value = value;
  },
  render(ratio, data) {
    data.target.style.strokeDashoffset = data.len * (1 - data.value * ratio);
  },
});

const $ = (id) => document.getElementById(id);

const canvas = $('tree');
const ctx    = canvas.getContext('2d');
const wishEl = $('wish');

const hero       = $('hero');
const eyebrow    = $('eyebrow');
const hint       = $('hint');
const motes      = $('motes');
const target     = $('target');
const targetHeart= $('targetHeart');
const heartGlow  = target.querySelector('.heart__glow');
const aim        = $('aim');

const archery = $('archery');
const bow     = $('bow');
const arrow   = $('arrow');
const strL    = $('strL');
const strR    = $('strR');
const serving = $('serving');

const flood   = $('flood');
const field   = $('field');
const camera  = $('camera');
const fgrid   = $('fgrid');
const kEyebrow= $('kEyebrow');
const kSub    = $('kSub');
const barTop  = $('barTop');
const barBot  = $('barBot');
const uline   = $('uline').querySelector('.uline__path');
const bloom   = $('bloom');
const replay  = $('replay');

/* --- Act 3: the count --- */
const chrono       = $('chrono');
const chronoHearts = $('chronoHearts');
const chEyebrow    = $('chEyebrow');
const chNote       = $('chNote');
const chLine       = $('chLine');
const chRows       = [...chrono.querySelectorAll('.chrono__row')];

/* --- Act 4: the memories --- */
const gallery  = $('gallery');
const galChaps = [...gallery.querySelectorAll('.gal__ch')].map((ch) => ({
  el:    ch,
  polas: [...ch.querySelectorAll('.pola')],
  title: ch.querySelector('.gal__title'),
  sub:   ch.querySelector('.gal__sub'),
}));

/* --- Act 6: the ending --- */
const finale         = $('finale');
const finHearts      = $('finHearts');
const finHeartsFront = $('finHeartsFront');
const finFrame       = finale.querySelector('.fin__frame');
const finHero        = $('finHero');
const finSub         = $('finSub');
const finSig         = $('finSig');

/* --- the song --- */
const bgm      = $('bgm');
const soundBtn = $('sound');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isRecord     = new URLSearchParams(location.search).has('record');

/* --- cue log for the recorder: the page stays muted, but it timestamps every
   beat the film crosses, and the offline sound synth fires foley at those exact
   times so the audio can never drift from the picture. --- */
if (isRecord) window.bdayCues = [];
let recT0 = 0;
function cue(name){ if (isRecord && recT0) window.bdayCues.push({ cue: name, t: (performance.now() - recT0) / 1000 }); }

/* ============================================================
   MATH HELPERS
   ============================================================ */
const rand  = (a, b) => a + Math.random() * (b - a);
const pick  = (a)    => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp  = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack  = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

function shade(hex, amt){
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/* ============================================================
   TREE ENGINE (Act 4) — canvas
   ============================================================ */
const BLOSSOM = [
  { c0: '#ffe1ec', c1: '#ff80aa' },
  { c0: '#ffd0e0', c1: '#f4577f' },
  { c0: '#ffc4d2', c1: '#e23b67' },
  { c0: '#ffd9c4', c1: '#ff8a5b' },
  { c0: '#ffeec2', c1: '#f6b13e' },
  { c0: '#ffd2e6', c1: '#e84d9a' },
];

/* timeline (seconds, relative to the tree's own start) — brisk */
const T = {
  trunkStart: 0.10,
  branchSpan: 1.80,
  bloomT0:    1.25,
  bloomSpan:  2.00,
  petalT0:    2.45,
  noteStart:  0.45,
  done:       4.60,
};

const SS = 168;

function heartShape(c, x, top, w, h){
  c.beginPath();
  c.moveTo(x, top + h * 0.28);
  c.bezierCurveTo(x, top, x - w * 0.5, top, x - w * 0.5, top + h * 0.28);
  c.bezierCurveTo(x - w * 0.5, top + h * 0.60, x - w * 0.16, top + h * 0.80, x, top + h);
  c.bezierCurveTo(x + w * 0.16, top + h * 0.80, x + w * 0.5, top + h * 0.60, x + w * 0.5, top + h * 0.28);
  c.bezierCurveTo(x + w * 0.5, top, x, top, x, top + h * 0.28);
  c.closePath();
}

function makeBlossom({ c0, c1 }, soft){
  const cv = document.createElement('canvas'); cv.width = cv.height = SS;
  const c = cv.getContext('2d');
  const w = SS * 0.62, h = SS * 0.58, x = SS / 2, top = SS * 0.17;

  c.save();
  c.shadowColor = 'rgba(150,38,72,0.32)';
  c.shadowBlur = SS * 0.085; c.shadowOffsetY = SS * 0.05;
  c.fillStyle = c1; heartShape(c, x, top, w, h); c.fill();
  c.restore();

  const g = c.createRadialGradient(x - w * 0.20, top + h * 0.20, h * 0.04, x, top + h * 0.42, h * 0.92);
  g.addColorStop(0, c0); g.addColorStop(0.55, c1); g.addColorStop(1, shade(c1, -26));
  heartShape(c, x, top, w, h); c.fillStyle = g; c.fill();

  c.save(); heartShape(c, x, top, w, h); c.clip();
  const g2 = c.createLinearGradient(0, top, 0, top + h);
  g2.addColorStop(0, 'rgba(255,255,255,0)');
  g2.addColorStop(0.65, 'rgba(110,16,46,0)');
  g2.addColorStop(1, 'rgba(110,16,46,0.26)');
  c.fillStyle = g2; c.fillRect(0, 0, SS, SS);
  c.globalAlpha = 0.55; c.fillStyle = '#ffffff';
  c.beginPath(); c.ellipse(x - w * 0.15, top + h * 0.24, w * 0.17, h * 0.11, -0.5, 0, Math.PI * 2); c.fill();
  c.restore();

  if (!soft) return cv;

  const cv2 = document.createElement('canvas'); cv2.width = cv2.height = SS;
  const c2 = cv2.getContext('2d');
  c2.filter = 'blur(2.6px)'; c2.drawImage(cv, 0, 0); c2.filter = 'none';
  c2.globalCompositeOperation = 'source-atop';
  c2.globalAlpha = 0.42; c2.fillStyle = '#fff3ea'; c2.fillRect(0, 0, SS, SS);
  return cv2;
}

function makeBokeh(rgb){
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, `rgba(${rgb},0.9)`); g.addColorStop(0.45, `rgba(${rgb},0.22)`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  return cv;
}

function makeSparkle(){
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'); const m = S / 2;
  const g = c.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.25, 'rgba(255,236,200,0.5)'); g.addColorStop(1, 'rgba(255,236,200,0)');
  c.fillStyle = g; c.beginPath(); c.arc(m, m, m, 0, 6.2832); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.translate(m, m);
  for (let k = 0; k < 2; k++){
    c.beginPath();
    c.moveTo(0, -m); c.quadraticCurveTo(0, 0, m, 0); c.quadraticCurveTo(0, 0, 0, m); c.quadraticCurveTo(0, 0, -m, 0); c.quadraticCurveTo(0, 0, 0, -m);
    c.fill(); c.rotate(Math.PI / 4); c.scale(0.5, 0.5);
  }
  return cv;
}

let SPR = { crisp: [], soft: [] }, BOKEH = [], SPARKLE = null;
function buildSprites(){
  SPR = { crisp: BLOSSOM.map((b) => makeBlossom(b, false)), soft: BLOSSOM.map((b) => makeBlossom(b, true)) };
  BOKEH = [makeBokeh('255,224,188'), makeBokeh('255,196,214'), makeBokeh('255,238,210')];
  SPARKLE = makeSparkle();
}

function drawSprite(sprite, x, y, size, rot, alpha){
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, -size * 0.5, -size * 0.47, size, size);
  ctx.restore();
}

let heartPoly = null;
function buildHeartPoly(){
  const raw = []; let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i <= 160; i++){
    const t = (i / 160) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    raw.push([x, y]);
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2, hw = (maxX - minX) / 2, hh = (maxY - minY) / 2;
  heartPoly = raw.map(([x, y]) => [(x - midX) / hw, (y - midY) / hh]);
}
function pointInPoly(x, y){
  let inside = false; const p = heartPoly;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++){
    const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

let W = 0, H = 0, dpr = 1;
let cx = 0, cy = 0, rx = 0, ry = 0, groundY = 0;
let branches = [], hearts = [], petals = [], rested = [], orbs = [], floaters = [], twinkles = [];
let bgGrad = null, glowGrad = null, groundGrad = null;

const quad = (b, t) => { const m = 1 - t, a = m * m, k = 2 * m * t, d = t * t; return { x: a * b.x1 + k * b.cx + d * b.x2, y: a * b.y1 + k * b.cy + d * b.y2 }; };

function barkGrad(x1, y1, x2, y2, depth){
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  g.addColorStop(0, `hsl(348 26% ${26 + depth * 3}%)`);
  g.addColorStop(1, `hsl(346 24% ${40 + depth * 5}%)`);
  return g;
}

function buildScene(){
  branches = []; hearts = []; petals = []; rested = []; twinkles = []; orbs = []; floaters = [];
  buildHeartPoly();

  const wide = W / H > 1.2;
  cx = W * (wide ? 0.57 : 0.5);
  cy = H * (wide ? 0.37 : 0.38);
  ry = Math.min(H * (wide ? 0.33 : 0.33), W * 0.34);
  rx = ry * 1.16;
  groundY = H * 0.93;

  bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#fff3e9');
  bgGrad.addColorStop(0.46, '#ffe7d6');
  bgGrad.addColorStop(0.78, '#fcd9c4');
  bgGrad.addColorStop(1, '#f3c4b5');
  glowGrad = ctx.createRadialGradient(cx, cy, ry * 0.1, cx, cy, ry * 1.55);
  glowGrad.addColorStop(0, 'rgba(255,219,170,0.6)');
  glowGrad.addColorStop(0.5, 'rgba(255,170,150,0.2)');
  glowGrad.addColorStop(1, 'rgba(255,170,150,0)');
  groundGrad = ctx.createRadialGradient(cx, H * 1.02, ry * 0.2, cx, H * 1.02, ry * 1.6);
  groundGrad.addColorStop(0, 'rgba(255,205,165,0.5)');
  groundGrad.addColorStop(1, 'rgba(255,205,165,0)');

  for (let i = 0; i < 11; i++){
    orbs.push({ x: rand(0, W), y: rand(0, H), r: rand(W * 0.05, W * 0.17), vy: rand(-6, -16), drift: rand(-0.3, 0.3), phase: rand(0, 6.28), alpha: rand(0.05, 0.13), sprite: pick(BOKEH) });
  }

  const FN = wide ? 18 : 15;
  for (let i = 0; i < FN; i++){
    const depth = Math.random();
    floaters.push({
      x: rand(0, W), y: rand(-H * 0.1, H * 1.1), depth,
      idx: (Math.random() * BLOSSOM.length) | 0,
      box: lerp(Math.min(W, H) * 0.025, Math.min(W, H) * 0.075, depth),
      vy: lerp(7, 20, depth), sway: rand(8, 22), phase: rand(0, 6.28),
      rot: rand(-0.4, 0.4), vrot: rand(-0.5, 0.5),
      baseA: lerp(0.16, 0.5, depth), soft: depth < 0.45,
    });
  }

  const baseX = cx, baseY = H * 1.0;
  const trunkTopY = cy + ry * 0.62;
  const trunkW = Math.max(9, W * 0.024);
  const limbLen = ry * 0.6;
  const insidePx = (x, y, m = 0.9) => pointInPoly((x - cx) / (rx * m), (cy - y) / (ry * m));

  function addBranch(x, y, ang, len, w0, depth, t0){
    let ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len, clipped = false;
    if (!insidePx(ex, ey)){
      let lo = 0, hi = 1;
      for (let k = 0; k < 12; k++){ const mid = (lo + hi) / 2; (insidePx(x + Math.cos(ang) * len * mid, y + Math.sin(ang) * len * mid) ? lo = mid : hi = mid); }
      ex = x + Math.cos(ang) * len * lo; ey = y + Math.sin(ang) * len * lo; clipped = true;
    }
    const mx = (x + ex) / 2, my = (y + ey) / 2, perp = ang + Math.PI / 2, bend = rand(-1, 1) * len * 0.12, w1 = w0 * 0.66;
    branches.push({ x1: x, y1: y, cx: mx + Math.cos(perp) * bend, cy: my + Math.sin(perp) * bend, x2: ex, y2: ey, w0, w1, t0, dur: Math.max(0.14, 0.32 - depth * 0.03), depth, grad: barkGrad(x, y, ex, ey, depth) });
    return { ex, ey, w1, clipped };
  }
  function grow(x, y, ang, len, w, depth, t0){
    const r = addBranch(x, y, ang, len, w, depth, t0);
    if (r.clipped || depth >= 6 || len < ry * 0.06) return;
    const childT0 = t0 + (0.32 - depth * 0.03) * 0.6;
    const n = Math.random() < 0.55 ? 2 : 3;
    for (let i = 0; i < n; i++){
      const spread = 0.6 * (i - (n - 1) / 2) + rand(-0.22, 0.22), lift = -0.06 + rand(-0.05, 0.05);
      grow(r.ex, r.ey, ang + spread + lift, len * rand(0.74, 0.84), r.w1, depth + 1, childT0 + i * 0.03);
    }
  }
  addBranch(baseX, baseY, -Math.PI / 2, baseY - trunkTopY, trunkW, 0, T.trunkStart);
  branches[0].dur = 0.55;
  const limbT0 = T.trunkStart + 0.36, L = 3;
  for (let i = 0; i < L; i++){
    const ang = -Math.PI / 2 + 0.62 * (i - (L - 1) / 2) + rand(-0.12, 0.12);
    grow(baseX, trunkTopY, ang, limbLen, trunkW * 0.7, 1, limbT0 + i * 0.05);
  }
  const maxT0 = branches.reduce((m, b) => Math.max(m, b.t0 + b.dur), 0);
  const sc = (T.branchSpan - T.trunkStart) / (maxT0 - T.trunkStart);
  for (const b of branches) b.t0 = T.trunkStart + (b.t0 - T.trunkStart) * sc;

  const COUNT = Math.round(clamp(rx * ry / 56, 250, 440));
  const baseBox = clamp(Math.min(W, H) * 0.115, 30, 74);
  let guard = 0;
  while (hearts.length < COUNT && guard < COUNT * 50){
    guard++;
    const u = rand(-1.06, 1.06), v = rand(-1.06, 1.06);
    if (!pointInPoly(u, v)) continue;
    const x = cx + u * rx, y = cy - v * ry;
    const d = clamp01(Math.hypot(u, v + 1) / 2.4);
    const t0 = T.bloomT0 + d * (T.bloomSpan * 0.82) + rand(0, T.bloomSpan * 0.18);
    const soft = Math.random() < 0.42;
    hearts.push({ x, y, idx: (Math.random() * BLOSSOM.length) | 0, soft, box: baseBox * (soft ? rand(0.6, 0.85) : rand(0.78, 1.12)), rot: rand(-0.55, 0.55), sway: rand(0, 6.28), t0 });
  }
  hearts.sort((a, b) => (a.soft === b.soft ? a.y - b.y : a.soft ? -1 : 1));
}

function drawBackground(){
  ctx.globalAlpha = 1;
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1; ctx.fillStyle = groundGrad; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawGodRays(t, intensity){
  if (intensity <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const ox = cx, oy = cy - ry * 0.35, R = Math.hypot(W, H) * 1.1;
  const rays = 9, sweep = Math.sin(t * 0.07) * 0.18;
  for (let i = 0; i < rays; i++){
    const a = -Math.PI / 2 + sweep + (i - (rays - 1) / 2) * 0.2;
    const hw = 0.035 + 0.02 * (0.5 + 0.5 * Math.sin(t * 0.5 + i * 1.7));
    const a1 = a - hw, a2 = a + hw;
    const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(a) * R, oy + Math.sin(a) * R);
    g.addColorStop(0, `rgba(255,232,190,${0.10 * intensity})`);
    g.addColorStop(0.5, `rgba(255,214,170,${0.05 * intensity})`);
    g.addColorStop(1, 'rgba(255,214,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(a1) * R, oy + Math.sin(a1) * R);
    ctx.lineTo(ox + Math.cos(a2) * R, oy + Math.sin(a2) * R);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawGlow(t){
  const gi = clamp01((t - T.bloomT0) / (T.bloomSpan * 0.9));
  if (gi <= 0) return;
  ctx.save(); ctx.globalAlpha = gi; ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glowGrad; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawBokeh(t, dt){
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const o of orbs){
    o.y += o.vy * dt; o.x += Math.sin(t * 0.3 + o.phase) * o.drift;
    if (o.y < -o.r){ o.y = H + o.r; o.x = rand(0, W); }
    ctx.globalAlpha = o.alpha;
    ctx.drawImage(o.sprite, o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
  }
  ctx.restore();
}

function drawFloaters(t, dt, front){
  const appear = clamp01((t - 0.2) / 1.4);
  if (appear <= 0) return;
  for (const f of floaters){
    if ((f.depth >= 0.6) !== front) continue;
    f.y -= f.vy * dt;
    f.x += Math.sin(t * 0.5 + f.phase) * f.sway * dt;
    f.rot += f.vrot * dt;
    if (f.y < -f.box){ f.y = H + f.box; f.x = rand(0, W); }
    drawSprite((f.soft ? SPR.soft : SPR.crisp)[f.idx], f.x, f.y, f.box, f.rot, f.baseA * appear);
  }
}

function drawBranches(t){
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const b of branches){
    const f = clamp01((t - b.t0) / b.dur);
    if (f <= 0) continue;
    const e = easeOutCubic(f);
    ctx.strokeStyle = b.grad;
    const steps = 12, last = Math.max(1, Math.ceil(steps * e));
    let prev = quad(b, 0);
    for (let i = 1; i <= last; i++){
      const tt = Math.min(e, i / steps), p = quad(b, tt);
      ctx.lineWidth = lerp(b.w0, b.w1, tt);
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      prev = p;
    }
  }
}

function drawHearts(t){
  const breathe = 1 + Math.sin(t * 0.8) * 0.012;
  for (const h of hearts){
    const p = clamp01((t - h.t0) / 0.6);
    if (p <= 0) continue;
    const scale = Math.max(0, easeOutBack(p));
    let alpha = clamp01(p * 1.7); if (h.soft) alpha *= 0.8;
    const settled = clamp01((t - h.t0 - 0.6) / 0.7);
    const sway = settled * Math.sin(t * 1.5 + h.sway) * (h.box * 0.05);
    const rise = (1 - easeOutCubic(p)) * h.box * 0.45;
    const hx = cx + (h.x - cx) * breathe + sway;
    const hy = cy + (h.y - cy) * breathe - rise;
    drawSprite((h.soft ? SPR.soft : SPR.crisp)[h.idx], hx, hy, h.box * scale, h.rot + sway * 0.012, alpha);
  }
}

function updateTwinkles(t, dt){
  const active = t > T.bloomT0 + T.bloomSpan * 0.45;
  if (active && twinkles.length < 9 && Math.random() < 0.5){
    const h = hearts[(Math.random() * hearts.length) | 0];
    if (h) twinkles.push({ x: h.x, y: h.y, size: rand(0.6, 1.3) * (Math.min(W, H) * 0.05), age: 0, life: rand(0.7, 1.2), rot: rand(0, 6.28) });
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = twinkles.length - 1; i >= 0; i--){
    const s = twinkles[i]; s.age += dt;
    const k = s.age / s.life;
    if (k >= 1){ twinkles.splice(i, 1); continue; }
    const a = Math.sin(k * Math.PI);
    drawSprite(SPARKLE, s.x, s.y, s.size * (0.6 + 0.4 * a), s.rot + k * 1.2, a);
  }
  ctx.restore();
}

function spawnPetal(){
  const h = hearts[(Math.random() * hearts.length) | 0];
  if (!h) return;
  petals.push({ x: h.x + rand(-8, 8), y: h.y + rand(-8, 8), vy: rand(14, 30), vx: rand(-8, 8), sway: rand(0.6, 1.4), phase: rand(0, 6.28), box: h.box * rand(0.34, 0.6), idx: h.idx, rot: rand(0, 6.28), vrot: rand(-1.4, 1.4), age: 0, land: groundY + rand(-6, H * 0.05) });
}
function drawPetals(t, dt){
  for (let i = petals.length - 1; i >= 0; i--){
    const p = petals[i]; p.age += dt; p.vy += 8 * dt;
    p.x += (p.vx + Math.sin(t * p.sway + p.phase) * 16) * dt;
    p.y += p.vy * dt; p.rot += p.vrot * dt;
    if (p.y >= p.land){
      rested.push({ x: clamp(p.x, 6, W - 6), y: p.land, box: p.box, idx: p.idx, rot: p.rot, a: rand(0.7, 0.95) });
      if (rested.length > 90) rested.shift();
      petals.splice(i, 1); continue;
    }
    const a = p.age < 0.3 ? p.age / 0.3 : 1;
    drawSprite(SPR.crisp[p.idx], p.x, p.y, p.box, p.rot, a);
  }
}
function drawRested(){
  for (const r of rested) drawSprite(SPR.crisp[r.idx], r.x, r.y, r.box, r.rot, r.a);
}

function showWish(on){ wishEl.classList.toggle('is-in', on); }

/* the tree's own rAF: plays once from treeStart(), then holds, living */
let treeStartT = 0, treeLastT = 0, treeRAF = 0, lastPetal = 0, replayArmed = false;
let finaleArmed = false;
window.bdayDone = false;

function treeFrame(now){
  if (!treeStartT){ treeStartT = now; treeLastT = now; }
  const t  = (now - treeStartT) / 1000;
  const dt = Math.min(0.05, (now - treeLastT) / 1000); treeLastT = now;

  const rays = clamp01((t - T.bloomT0) / T.bloomSpan);

  drawBackground();
  drawGodRays(t, rays);
  drawGlow(t);
  drawBokeh(t, dt);
  drawFloaters(t, dt, false);
  drawBranches(t);
  drawHearts(t);
  updateTwinkles(t, dt);
  if (t > T.petalT0 && now - lastPetal > 150){ spawnPetal(); spawnPetal(); lastPetal = now; }
  drawPetals(t, dt);
  drawRested();
  drawFloaters(t, dt, true);

  showWish(t >= T.noteStart);

  if (!window.bdayDone && t >= T.done) window.bdayDone = true;
  // the tree is no longer the last thing — once it has bloomed and held for a
  // beat, the light takes over one final time and opens onto the ending
  if (!finaleArmed && t >= T.done + 1.8){ finaleArmed = true; startFinale(); }

  treeRAF = requestAnimationFrame(treeFrame);
}

function treeStart(){
  treeStartT = 0; treeLastT = 0; lastPetal = 0; replayArmed = false; finaleArmed = false; window.bdayDone = false;
  cue('grow');
  buildScene();
  if (!treeRAF) treeRAF = requestAnimationFrame(treeFrame);
}
function treeStop(){
  if (treeRAF){ cancelAnimationFrame(treeRAF); treeRAF = 0; }
  ctx.clearRect(0, 0, W, H);
}

function drawFinal(){
  buildScene();
  drawBackground(); drawGodRays(0, 1); drawGlow(T.done); drawBokeh(0, 0); drawFloaters(99, 0, false);
  drawBranches(99); drawHearts(99);
  for (let i = 0; i < 40; i++){ const h = hearts[(Math.random() * hearts.length) | 0]; if (h) rested.push({ x: clamp(h.x + rand(-W * 0.3, W * 0.3), 6, W - 6), y: groundY + rand(-6, H * 0.05), box: h.box * 0.5, idx: h.idx, rot: rand(0, 6.28), a: 0.85 }); }
  drawRested(); drawFloaters(99, 0, true);
  showWish(true);
  // reduced motion still gets the ending — it is the whole point of the page,
  // so it is handed over finished rather than skipped along with the film
  gsap.set(finale, { autoAlpha: 1 });
  gsap.set([finHero, finSub, finSig], { opacity: 1, y: 0, scale: 1 });
  gsap.set(finFrame, { opacity: 1, y: 0, scale: 1, rotation: -2.2 });
  window.bdayDone = true;
}

/* ============================================================
   ACTS 1–3 (GSAP) — the bow, the shot, the wish
   ============================================================ */

/* the two headline words become per-glyph spans so each hinges up on its own */
function splitWord(el){
  const chars = [...el.textContent];
  el.textContent = '';
  return chars.map((c) => {
    const s = document.createElement('span');
    s.className = 'hl__ch';
    // a plain space inside an inline-block collapses to nothing, which welded
    // "4 Months" into "4Months" — the headline needs a hard space
    s.textContent = c === ' ' ? ' ' : c;
    el.appendChild(s);
    return s;
  });
}
const line1Chars = splitWord($('wLine1'));
const line2Chars = splitWord($('wLine2'));
const kChars = [...line1Chars, ...line2Chars];

/* drifting light motes behind the scene */
function buildMotes(){
  motes.innerHTML = '';
  for (let i = 0; i < 12; i++){
    const m = document.createElement('span');
    m.className = 'mote';
    const s = rand(4, 12);
    m.style.width = m.style.height = `${s}px`;
    m.style.left = `${rand(4, 96)}%`;
    m.style.top  = `${rand(10, 96)}%`;
    motes.appendChild(m);
    gsap.set(m, { opacity: rand(0.25, 0.7) });
    gsap.to(m, { y: -rand(40, 140), x: rand(-30, 30), duration: rand(7, 14), repeat: -1, yoyo: true, ease: 'sine.inOut', delay: -rand(0, 8) });
    gsap.to(m, { opacity: rand(0.1, 0.5), duration: rand(2.5, 5), repeat: -1, yoyo: true, ease: 'sine.inOut' });
  }
}

/* --- bow geometry (measured; re-measured on resize) -------------------------
   The rig lives lower-left and is rotated so its local "up" axis points at the
   heart; the shot therefore travels on a diagonal. The draw + arrow math all
   live in the rig's LOCAL space (offset geometry is transform-independent, so
   rotation never corrupts it); only the aim ANGLE and the flight DISTANCE come
   from screen measurements. */
const tip = $('tip');
let svgScale = 1, arrowBaseX = 0, arrowBaseY = 0, maxDraw = 120, curDraw = 0;
let pullUX = 0, pullUY = 1;                               // screen unit: string pull-back
const REST_NOCK = 96;                                    // string nock, in bow viewBox units
const nockProxy = { val: REST_NOCK };

function applyNock(){
  const y = nockProxy.val;
  strL.setAttribute('y2', y); strR.setAttribute('y2', y); serving.setAttribute('cy', y);
}

function refreshRig(){
  // the grip is anchored here, and the heart sits at its layout centre (33% down,
  // centred) — using the layout point, not a live rect, keeps the aim steady even
  // while the heart is scaling in.
  const gripX = W * 0.24, gripY = H * 0.76;
  const heartX = W * 0.5, heartY = H * 0.33;
  // rotation so local "up" (0,-1) maps to the grip→heart direction
  const aimRad = Math.atan2(heartX - gripX, gripY - heartY);
  pullUX = -Math.sin(aimRad); pullUY = Math.cos(aimRad);  // opposite of aim = pull-back

  // #bow / #arrow are SVG — no offset* — so measure rects in the rig's LOCAL
  // frame: neutralise the rig transform first (getBBox-style, sync, no paint).
  nockProxy.val = REST_NOCK; applyNock();
  gsap.set(archery, { rotation: 0, scale: 1, x: 0, y: 0 });
  archery.style.left = '0px'; archery.style.top = '0px';
  gsap.set(arrow, { x: 0, y: 0 });
  const aR = archery.getBoundingClientRect();
  const bR = bow.getBoundingClientRect();
  const sR = serving.getBoundingClientRect();
  const rR = arrow.getBoundingClientRect();
  svgScale = bR.width / 460;
  const gripLX = (bR.left - aR.left) + 0.5 * bR.width;
  const gripLY = (bR.top  - aR.top ) + (240 / 300) * bR.height;   // grip ~y240 in viewBox
  const nockLX = (sR.left - aR.left) + 0.5 * sR.width;
  const nockLY = (sR.top  - aR.top ) + 0.5 * sR.height;
  arrowBaseX = nockLX - ((rR.left - aR.left) + 0.5 * rR.width);
  arrowBaseY = nockLY - ((rR.top  - aR.top ) + (205 / 220) * rR.height);

  // anchor the grip at (gripX,gripY) and rotate the rig around it
  archery.style.left = (gripX - gripLX) + 'px';
  archery.style.top  = (gripY - gripLY) + 'px';
  gsap.set(archery, { transformOrigin: `${gripLX}px ${gripLY}px`, rotation: aimRad * 180 / Math.PI });
  gsap.set(arrow, { x: arrowBaseX, y: arrowBaseY });
  maxDraw = Math.min(bR.height * 0.72, H * 0.16, 132);
  curDraw = 0;
}

function setDraw(d){
  curDraw = clamp(d, 0, maxDraw);
  gsap.set(arrow, { x: arrowBaseX, y: arrowBaseY + curDraw });   // local +Y = pull back
  nockProxy.val = REST_NOCK + curDraw / svgScale; applyNock();
  gsap.set(aim, { opacity: 0.55 * (curDraw / maxDraw) });
}

/* the target heart's beat — gentle, alive; killed the instant we fire */
let beatTL = null;
function startBeat(){
  gsap.set(targetHeart, { scale: 1 });
  gsap.set(heartGlow, { scale: 1, opacity: 0.7 });
  beatTL = gsap.timeline({ repeat: -1, repeatDelay: 0.5 });
  beatTL.to(targetHeart, { scale: 1.07, duration: 0.13, ease: 'power2.out' }, 0)
        .to(heartGlow,   { scale: 1.15, opacity: 0.9, duration: 0.13, ease: 'power2.out' }, 0)
        .to(targetHeart, { scale: 1.0, duration: 0.2, ease: 'power2.in' }, 0.13)
        .to(targetHeart, { scale: 1.05, duration: 0.12, ease: 'power2.out' }, 0.3)
        .to(targetHeart, { scale: 1.0, duration: 0.5, ease: 'power2.inOut' }, 0.42)
        .to(heartGlow,   { scale: 1.0, opacity: 0.7, duration: 0.7, ease: 'power2.inOut' }, 0.3);
}
function stopBeat(){ if (beatTL){ beatTL.kill(); beatTL = null; } gsap.set(targetHeart, { scale: 1 }); }

/* a little burst of hearts + sparks where the arrow strikes */
function miniHeartSVG(fill){
  return `<svg viewBox="0 0 24 22" width="100%" height="100%"><path d="M12 20C5.5 15 1.5 11.4 1.5 6.9 1.5 3.6 4 1.5 7 1.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3 0 5.5 2.1 5.5 5.4C23.5 11.4 19.5 15 12 20Z" fill="${fill}"/></svg>`;
}
function burstHearts(){
  const r = target.getBoundingClientRect();
  const hr = hero.getBoundingClientRect();
  const ox = r.left - hr.left + r.width / 2;
  const oy = r.top - hr.top + r.height * 0.42;
  const cols = ['#ff6f97', '#ffb14e', '#ff8fae', '#ffd36a', '#e23b67'];
  const frag = document.createDocumentFragment();
  const nodes = [];
  for (let i = 0; i < 12; i++){
    const heart = i < 8;
    const el = document.createElement('span');
    el.className = 'burst';
    const s = heart ? rand(12, 22) : rand(4, 8);
    el.style.cssText = `position:absolute;left:${ox}px;top:${oy}px;width:${s}px;height:${s}px;margin:${-s / 2}px 0 0 ${-s / 2}px;pointer-events:none;z-index:4;`;
    if (heart) el.innerHTML = miniHeartSVG(pick(cols));
    else { el.style.borderRadius = '50%'; el.style.background = 'radial-gradient(circle,#fff,rgba(255,210,150,0) 70%)'; }
    frag.appendChild(el); nodes.push({ el, heart });
  }
  hero.appendChild(frag);
  nodes.forEach(({ el, heart }) => {
    const ang = rand(-Math.PI, 0);                       // fan upward + out
    const dist = rand(heart ? 70 : 40, heart ? 190 : 120);
    gsap.to(el, {
      x: Math.cos(ang) * dist, y: Math.sin(ang) * dist - rand(10, 50),
      rotation: rand(-120, 120), scale: heart ? rand(0.7, 1.2) : rand(0.4, 1),
      duration: rand(0.7, 1.15), ease: 'power2.out',
    });
    gsap.to(el, { opacity: 0, duration: 0.5, delay: rand(0.35, 0.6), ease: 'power1.in', onComplete: () => el.remove() });
  });
}

/* --- the shot + Acts 2–3 timeline ------------------------------------------ */
function shotGeom(){
  // flight distance = straight-line from the arrow tip to the heart (measured on
  // screen, rotation-aware). Moving the arrow that far along its local "up" axis
  // — which is aimed at the heart — lands the tip dead-centre on it.
  const tipR = tip.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  const tipX = tipR.left + tipR.width / 2, tipY = tipR.top + tipR.height / 2;
  const tcx = tRect.left + tRect.width / 2, tcy = tRect.top + tRect.height / 2;
  const flightDist = Math.hypot(tcx - tipX, tcy - tipY);
  const fallPx = Math.min(H * 0.26, H - tcy - tRect.height * 0.4);
  const impactX = tcx, impactY = tcy + fallPx;
  const distC = Math.hypot(Math.max(impactX, W - impactX), Math.max(impactY, H - impactY));
  const reach = Math.hypot(W / 2, H / 2);
  return {
    arrowStartY: arrowBaseY + curDraw,
    arrowFlyY:   arrowBaseY + curDraw - flightDist,       // local -Y = toward the heart
    drawnNock:   REST_NOCK + curDraw / svgScale,
    fallPx, fx: impactX - W / 2, fy: impactY - H / 2,
    floodScale: (distC * 1.12) / 70, bloomScale: (reach * 1.2) / 30,
  };
}

let filmTL = null;
function buildFilm(m){
  // the title card no longer hands straight to the tree — it hands to the count,
  // which hands to the memories, which is what finally blooms into the tree.
  const t = gsap.timeline({ paused: true, onComplete: startChrono });

  // reset (t=0)
  t.set(target, { y: 0, scaleX: 1, scaleY: 1, opacity: 1 })
   .set(arrow, { opacity: 1, x: arrowBaseX, y: m.arrowStartY, scaleY: 1 })
   .set([flood, bloom], { autoAlpha: 0, scale: 0.001, x: 0, y: 0 })
   .set(flood, { x: m.fx, y: m.fy })
   .set(field, { autoAlpha: 0 })
   .set('.blob', { opacity: 0 })
   .set(camera, { scale: 1, yPercent: 0, autoAlpha: 1 })
   .set(fgrid, { xPercent: 0, yPercent: 0 })
   .set(barTop, { yPercent: -100 })
   .set(barBot, { yPercent: 100 })
   .set(kEyebrow, { opacity: 0, y: 12 })
   .set(kSub, { opacity: 0, y: 12 })
   .set(kChars, { transformPerspective: 620, transformOrigin: '50% 100%', yPercent: 135, rotationX: -82 })
   .set(uline, { drawn: 0 });

  // --- the shot: string snaps (twang), arrow flies up into the heart --------
  t.fromTo(nockProxy, { val: m.drawnNock }, { val: REST_NOCK, duration: 0.5, ease: 'elastic.out(1,0.34)', onUpdate: applyNock }, 0)
   .to(arrow, { y: m.arrowFlyY, duration: 0.26, ease: 'power2.in' }, 0)
   .to(arrow, { scaleY: 1.16, duration: 0.14, ease: 'power2.in' }, 0)
   .to(arrow, { scaleY: 1.0, duration: 0.1, ease: 'power1.out' }, 0.16)
   .to(aim, { opacity: 0, duration: 0.18 }, 0)
   .to([eyebrow, hint], { opacity: 0, duration: 0.2, ease: 'power1.out' }, 0);

  // --- the strike: the arrow embeds, the heart recoils, then holds pierced --
  t.add(burstHearts, 0.26)
   // recoil along the arrow's line (up + right), springing back
   .to(target, { x: 7, y: -9, duration: 0.06, ease: 'power2.out' }, 0.26)
   .to(target, { x: 0, y: 0, duration: 0.32, ease: 'power2.out' }, 0.32)
   .to(target, { scale: 1.14, duration: 0.06, ease: 'power2.out' }, 0.26)
   .to(target, { scale: 1.0, duration: 0.26, ease: 'power2.inOut' }, 0.32)
   // the arrow shudders in the wound, holds embedded so the hit reads, then sinks in
   .to(arrow, { rotation: '+=4', duration: 0.05, yoyo: true, repeat: 4, ease: 'sine.inOut' }, 0.27)
   .set(arrow, { rotation: 0 }, 0.52)
   .to(arrow, { opacity: 0, duration: 0.16, ease: 'power1.out' }, 0.56);

  // --- the fall + the burst / flood -----------------------------------------
  t.to(target, { y: m.fallPx, scaleX: 0.84, scaleY: 1.3, duration: 0.34, ease: 'power1.in' }, 0.64)
   .to(target, { scaleX: 1.4, scaleY: 0.6, duration: 0.07, ease: 'power2.out' }, 0.98)
   .set(flood, { autoAlpha: 1 }, 1.00)
   .fromTo(flood, { scale: 0.02 }, { scale: m.floodScale, duration: 0.34, ease: 'power2.in' }, 1.00)
   .to(target, { opacity: 0, duration: 0.12, ease: 'power1.out' }, 1.06);

  // seam: the field is the same rose as the flood
  t.set(field, { autoAlpha: 1 }, 1.32)
   .set(hero, { autoAlpha: 0 }, 1.33)
   .to('.blob', { opacity: 1, duration: 0.6, ease: 'power2.out' }, 1.34)
   .set(flood, { autoAlpha: 0 }, 1.36);

  // --- the camera push -------------------------------------------------------
  // runs the full length of the title card: this is the piece's headline, so it
  // holds a beat longer than a birthday wish would before the count takes over.
  t.fromTo(camera, { scale: 1.0, yPercent: 0 }, { scale: 1.08, yPercent: -1.5, duration: 3.2, ease: 'none' }, 1.38)
   .fromTo(fgrid, { xPercent: 0, yPercent: 0 }, { xPercent: -1.8, yPercent: -1.2, duration: 3.2, ease: 'none' }, 1.38);

  // beat markers for the recorder's soundtrack (no-ops off ?record)
  t.call(cue, ['hit'], 0.26)
   .call(cue, ['flood'], 1.00)
   .call(cue, ['wish'], 1.68)
   .call(cue, ['wish2'], 2.06)
   .call(cue, ['bloom'], 3.42);

  // cinema bars ease into a letterbox
  t.to(barTop, { yPercent: 0, duration: 0.6, ease: 'power2.out' }, 1.5)
   .to(barBot, { yPercent: 0, duration: 0.6, ease: 'power2.out' }, 1.5);

  // --- the kinetic wish ------------------------------------------------------
  t.to(kEyebrow, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }, 1.54)
   .to(line1Chars, { yPercent: 0, rotationX: 0, duration: 0.55, ease: 'power3.out', stagger: 0.033 }, 1.68)
   .to(line2Chars, { yPercent: 0, rotationX: 0, duration: 0.55, ease: 'power3.out', stagger: 0.033 }, 2.06)
   .to(uline, { drawn: 1, duration: 0.45, ease: 'power2.inOut' }, 2.54)
   .to(kSub, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }, 2.74);

  // --- the letterbox opens again, and the card is done ------------------------
  // No bloom here any more: the count lives in the same rose, so the two acts
  // cross-fade instead of being wiped apart by a light that has nowhere to go.
  t.to(barTop, { yPercent: -100, duration: 0.5, ease: 'power2.in' }, 4.10)
   .to(barBot, { yPercent: 100, duration: 0.5, ease: 'power2.in' }, 4.10);

  return t;
}

/* how far the 60px bloom has to scale to cover the frame from the centre */
function bloomCover(){ return (Math.hypot(W / 2, H / 2) * 1.2) / 30; }

/* ============================================================
   ACT 3 — THE COUNT
   The title card and this act share one rose background, so they cross-fade:
   only the type changes, and the world underneath never blinks.
   ============================================================ */

/* light-hearts drifting behind the numbers */
function buildChronoHearts(){
  chronoHearts.innerHTML = '';
  const cols = ['rgba(255,196,210,.6)', 'rgba(255,152,182,.5)', 'rgba(255,226,204,.55)'];
  for (let i = 0; i < 14; i++){
    const el = document.createElement('span');
    const s = rand(11, 27);
    el.style.cssText = `position:absolute;left:${rand(3, 97)}%;top:${rand(6, 96)}%;width:${s}px;height:${s}px;`;
    el.innerHTML = miniHeartSVG(pick(cols));
    chronoHearts.appendChild(el);
    gsap.set(el, { rotation: rand(-26, 26), opacity: rand(0.3, 0.75) });
    gsap.to(el, { y: -rand(60, 150), duration: rand(7, 13), repeat: -1, yoyo: true, ease: 'sine.inOut', delay: -rand(0, 9) });
    gsap.to(el, { x: rand(-42, 42), duration: rand(5, 9), repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to(el, { opacity: rand(0.12, 0.45), duration: rand(3, 6), repeat: -1, yoyo: true, ease: 'sine.inOut' });
  }
}

/* one ledger row: it rises into place while its number rolls up to its value */
function addCountRow(t, row, at){
  const numEl = row.querySelector('.chrono__num');
  const target = +row.dataset.to;
  const p = { v: 0 };
  t.fromTo(row, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.72, ease: 'power3.out' }, at)
   .to(p, {
     v: target, duration: 0.9, ease: 'power2.out',
     onUpdate(){ numEl.textContent = Math.round(p.v); },
     // the digit lives only in onUpdate, and a seek can render a tween with its
     // callbacks suppressed — which leaves the row reading 0. Pin the landing.
     onComplete(){ numEl.textContent = target; },
   }, at + 0.1);
}

let chronoTL = null;
function buildChrono(){
  const t = gsap.timeline({ paused: true });

  t.set(chrono, { autoAlpha: 0 })
   .set('.chrono__inner', { y: 0, opacity: 1 })
   .set(chEyebrow, { opacity: 0, y: 14 })
   .set(chNote,    { opacity: 0, y: 12 })
   .set(chLine,    { opacity: 0, y: 18 })
   .set(chRows,    { opacity: 0, y: 28 })
   .call(() => chRows.forEach((r) => { r.querySelector('.chrono__num').textContent = '0'; }));

  // the cross-fade — the title dissolves, the count arrives, same rose beneath
  t.to(chrono, { autoAlpha: 1, duration: 0.9, ease: 'power2.out' }, 0)
   .to(camera, { autoAlpha: 0, duration: 0.7, ease: 'power2.in' }, 0)
   .set(field,  { autoAlpha: 0 }, 1.0);

  t.to(chEyebrow, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0.55);

  addCountRow(t, chRows[0], 1.20);   // 9 — เดือนที่รู้จักกัน
  addCountRow(t, chRows[1], 2.10);   // 5 — เดือนที่คุยกัน
  addCountRow(t, chRows[2], 3.00);   // 4 — เดือนที่เป็นแฟนกัน (the one that matters)

  // the four lands with a bit of weight behind it
  t.fromTo(chRows[2].querySelector('.chrono__num'),
    { scale: 0.8 }, { scale: 1, duration: 0.95, ease: 'back.out(2.4)', transformOrigin: '50% 60%' }, 3.10);

  t.to(chNote, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 4.55)
   .to(chLine, { opacity: 1, y: 0, duration: 0.95, ease: 'power3.out' }, 5.20);

  // hold on the sentence, then the whole ledger lifts away and the memories
  // fade up underneath it (the gallery is later in the DOM, so it paints over)
  t.to('.chrono__inner', { y: -50, opacity: 0, duration: 1.0, ease: 'power2.in' }, 8.60)
   .call(startGallery, null, 8.95)
   .to(chrono, { autoAlpha: 0, duration: 1.0, ease: 'power2.inOut' }, 9.20);

  return t;
}

let filmHandedOff = false;
function startChrono(){
  filmHandedOff = true;
  cue('count');
  buildChronoHearts();
  chronoTL = buildChrono();
  chronoTL.play(0);
}

/* ============================================================
   ACT 4 — THE MEMORIES
   Each chapter's polaroids fly in from off-frame and settle into a loose pile,
   the caption writes under them, the pile breathes, then it lifts away.
   The resting pose stays in the stylesheet (--x/--y/--r); only motion is here.
   ============================================================ */
function seatPolas(){
  galChaps.forEach(({ polas }) => polas.forEach((p) => {
    p._rest = parseFloat(getComputedStyle(p).getPropertyValue('--r')) || 0;
    // xPercent/yPercent replaces the stylesheet's translate(-50%,-50%) so GSAP
    // owns the whole transform and x/y stay free for the flight
    gsap.set(p, { xPercent: -50, yPercent: -50, x: 0, y: 0, rotation: p._rest, scale: 1, opacity: 0 });
  }));
}

function chapterTL({ el, polas, title, sub }){
  const t = gsap.timeline();

  t.set(el, { autoAlpha: 1 })
   .set(title, { opacity: 0, y: 26 })
   .set(sub,   { opacity: 0, y: 20 });

  // in — alternating sides, each one spinning down onto the pile
  polas.forEach((p, i) => {
    const side = i % 2 ? 1 : -1;
    t.fromTo(p,
      { x: side * rand(W * 0.6, W * 0.95), y: rand(-H * 0.22, H * 0.28),
        rotation: p._rest + side * rand(34, 76), scale: 0.7, opacity: 0 },
      { x: 0, y: 0, rotation: p._rest, scale: 1, opacity: 1, duration: 0.95, ease: 'back.out(1.3)' },
      i * 0.34);
  });

  const settled = (polas.length - 1) * 0.34 + 0.95;

  t.to(title, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, settled - 0.55)
   .to(sub,   { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, settled - 0.25);

  // while it sits, nothing is ever quite still
  polas.forEach((p) => {
    t.to(p, { y: -rand(6, 17), rotation: p._rest + rand(-2.6, 2.6), duration: 2.8, ease: 'sine.inOut' }, settled);
  });

  // out — the pile lifts off the top of the frame and takes the chapter with it
  const out = settled + 3.0;
  t.to(polas, { y: `-=${H * 0.55}`, opacity: 0, scale: 0.93, duration: 0.9, ease: 'power2.in', stagger: 0.06 }, out)
   .to([title, sub], { opacity: 0, y: -22, duration: 0.6, ease: 'power2.in' }, out + 0.14)
   .set(el, { autoAlpha: 0 });

  return t;
}

let galleryTL = null;
function buildGallery(){
  const t = gsap.timeline({ paused: true });

  t.set(gallery, { autoAlpha: 0 })
   .set(galChaps.map((c) => c.el), { autoAlpha: 0 })
   .to(gallery, { autoAlpha: 1, duration: 1.0, ease: 'power2.out' }, 0);

  let at = 0.55;
  galChaps.forEach((ch) => {
    const c = chapterTL(ch);
    t.add(c, at);
    at += c.duration() - 0.4;      // a small overlap, so chapters breathe into each other
  });

  t.call(handoffToTree, null, at + 0.5);
  return t;
}

function startGallery(){
  cue('memories');
  seatPolas();
  galleryTL = buildGallery();
  galleryTL.play(0);
}

/* the gold light that closes the memories and opens the tree */
function handoffToTree(){
  gsap.set(bloom, { autoAlpha: 1, scale: 0.02, x: 0, y: 0 });
  gsap.to(bloom, {
    scale: bloomCover(), duration: 0.66, ease: 'power2.in',
    onComplete(){
      gsap.set([gallery, chrono, field], { autoAlpha: 0 });
      treeStart();
      gsap.to(bloom, { autoAlpha: 0, duration: 1.15, ease: 'power2.out' });
    },
  });
}

/* ============================================================
   ACT 6 — THE ENDING
   Two pairs of shoes side by side, one sentence, and a sky that fills with
   hearts and never stops.
   ============================================================ */
let stormRAF = 0, lastHeartAt = 0;

function spawnFinHeart(){
  const front = Math.random() < 0.24;                 // a few drift in front of the card
  const el = document.createElement('span');
  el.className = 'fh';
  const s = front ? rand(26, 64) : rand(12, 40);
  el.style.cssText = `left:${rand(-4, 104)}%;top:102%;width:${s}px;height:${s}px;`;
  el.innerHTML = miniHeartSVG(pick(['#ff6f97', '#ff8fae', '#e23b67', '#ffb1c6', '#ff5f86', '#ffd36a']));
  (front ? finHeartsFront : finHearts).appendChild(el);

  const dur = rand(4.6, 9.5);
  gsap.set(el, { rotation: rand(-30, 30), opacity: 0 });
  gsap.to(el, { y: -H * rand(1.1, 1.4), x: rand(-80, 80), rotation: `+=${rand(-150, 150)}`,
                duration: dur, ease: 'none', onComplete(){ el.remove(); } });
  gsap.to(el, { opacity: front ? rand(0.35, 0.7) : rand(0.6, 1), duration: 0.9, ease: 'power1.out' });
  gsap.to(el, { opacity: 0, duration: 1.5, delay: dur - 1.6, ease: 'power1.in' });
}

function stormFrame(now){
  if (now - lastHeartAt > 95){
    spawnFinHeart();
    if (Math.random() < 0.55) spawnFinHeart();
    lastHeartAt = now;
  }
  stormRAF = requestAnimationFrame(stormFrame);
}
function startStorm(){ if (!stormRAF){ lastHeartAt = 0; stormRAF = requestAnimationFrame(stormFrame); } }
function stopStorm(){
  if (stormRAF){ cancelAnimationFrame(stormRAF); stormRAF = 0; }
  finHearts.innerHTML = ''; finHeartsFront.innerHTML = '';
}

let finaleTL = null;
function buildFinale(){
  const t = gsap.timeline({ paused: true });

  t.set(finale,   { autoAlpha: 0 })
   .set(finFrame, { opacity: 0, y: 46, scale: 0.9, rotation: -9 })
   .set(finHero,  { opacity: 0, y: 28, scale: 0.92 })
   .set([finSub, finSig], { opacity: 0, y: 20 });

  // a gold light swells over the tree and opens onto the last frame
  t.set(bloom, { autoAlpha: 1, scale: 0.02, x: 0, y: 0 }, 0)
   .to(bloom,  { scale: bloomCover(), duration: 0.7, ease: 'power2.in' }, 0)
   .call(() => showWish(false), null, 0.62)
   .set(finale, { autoAlpha: 1 }, 0.72)
   .to(bloom,   { autoAlpha: 0, duration: 1.0, ease: 'power2.out' }, 0.76);

  t.to(finFrame, { opacity: 1, y: 0, scale: 1, rotation: -2.2, duration: 1.0, ease: 'back.out(1.3)' }, 0.98)
   .to(finHero,  { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'back.out(1.6)' }, 1.75)
   .call(startStorm, null, 1.80)
   .to(finSub,   { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 2.35)
   .to(finSig,   { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 2.85);

  // the line keeps a slow heartbeat of its own, forever — which is why the
  // replay is armed by a call, not by this timeline ever completing
  t.to(finHero, { scale: 1.035, duration: 1.5, yoyo: true, repeat: -1, ease: 'sine.inOut' }, 2.75);

  t.call(armReplay, null, 4.5);
  return t;
}

function startFinale(){
  cue('ending');
  finaleTL = buildFinale();
  finaleTL.play(0);
}

/* ============================================================
   THE SONG
   The song should be playing the moment the page opens. Browsers do not allow
   that on a cold visit — audible playback needs a user gesture first — so this
   asks anyway, and if it is refused it starts on the very first touch of the
   page, wherever it lands, instead of waiting for the bow.
   ============================================================ */
let musicStarted = false;
let musicMuted   = false;      // set only by the toggle: an explicit "off" is honoured

/* The toggle reports whether the song is ON for this page — not whether audio is
   flowing this instant. Those differ for the couple of seconds before the first
   touch, when the browser is still withholding playback, and reporting the
   literal truth there put a crossed-out speaker on the opening frame: it read as
   "this page has no music", which is the opposite of what is about to happen. */
function setSoundUI(on){
  soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  soundBtn.setAttribute('aria-label', on ? 'ปิดเสียงเพลง' : 'เปิดเสียงเพลง');
}

/* Volume is faded on a timer, not on GSAP. GSAP rides requestAnimationFrame,
   which the browser suspends outright whenever the tab is not being painted —
   and a suspended fade leaves the song playing at volume 0, audible to nobody.
   setInterval gets throttled in the background but it always finishes. */
const VOLUME = 0.5;
let fadeTimer = 0;

function fadeVolume(to, ms, thenPause){
  clearInterval(fadeTimer);
  const from = bgm.volume, t0 = performance.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    bgm.volume = from + (to - from) * k;
    if (k === 1){
      clearInterval(fadeTimer); fadeTimer = 0;
      if (thenPause) bgm.pause();
    }
  }, 40);
}

function playMusic(){
  bgm.volume = 0;
  const done = () => {
    musicStarted = true;
    musicMuted = false;
    setSoundUI(true);
    dropFirstTouchArm();
    fadeVolume(VOLUME, 2600);
  };
  const p = bgm.play();
  // a refusal here is the browser saying "not until they touch something", not
  // the visitor saying no — leave the toggle alone so it keeps reading as on
  if (p && typeof p.then === 'function') p.then(done).catch(() => {});
  else done();
  return p;
}

function stopMusic(){
  musicMuted = true;
  setSoundUI(false);
  fadeVolume(0, 450, true);
}

/* --- the fallback: the first gesture anywhere on the page ------------------ */
const FIRST_TOUCH = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];

function onFirstTouch(e){
  // the toggle speaks for itself; don't fight a deliberate "off"
  if (musicStarted || musicMuted) { dropFirstTouchArm(); return; }
  // a press on the toggle is the one gesture that must NOT start the song here —
  // its own handler is about to decide, and starting first would blip a second
  // of music out of a button the visitor pressed to keep things quiet
  if (e && e.target && soundBtn.contains(e.target)) return;
  playMusic();
}

function dropFirstTouchArm(){
  FIRST_TOUCH.forEach((e) => document.removeEventListener(e, onFirstTouch, true));
}

function armFirstTouch(){
  // capture phase, so it fires even for gestures a handler below would swallow
  FIRST_TOUCH.forEach((e) => document.addEventListener(e, onFirstTouch, true));
}

/* Ask for autoplay outright. It is granted more often than people assume — a
   returning visitor, a desktop browser, anyone who has played media on the site
   before — and when it is refused nothing is lost but a rejected promise. */
function armMusic(){
  if (musicStarted || musicMuted) return;
  setSoundUI(true);            // on from the opening frame; it only awaits a touch
  const p = playMusic();
  if (p && typeof p.catch === 'function') p.catch(armFirstTouch);
  else armFirstTouch();
}

/* Follow what the button SAYS, not what the audio element is doing. In the
   waiting state those disagree — it reads "on" while playback is still withheld
   — and going by bgm.paused there would turn the song ON for someone who pressed
   a speaker-on icon to shut it up. */
soundBtn.addEventListener('click', () => {
  if (soundBtn.getAttribute('aria-pressed') === 'true') { stopMusic(); return; }
  // turning it back on goes through the same door as page load, so that a
  // refusal here also lands back in the waiting state with the fallback armed,
  // instead of leaving a dead crossed-out button and no way forward
  musicMuted = false;
  armMusic();
});

/* --- draw / release interaction -------------------------------------------- */
let played = false, drawing = false, startPX = 0, startPY = 0, startDraw = 0;

function fire(){
  if (played) return;
  played = true;
  drawing = false;
  stopBeat();
  cue('release'); cue('whoosh');
  filmTL = buildFilm(shotGeom());
  filmTL.play(0);
}

function springBack(){
  const from = curDraw;
  gsap.to({ d: from }, { d: 0, duration: 0.55, ease: 'elastic.out(1,0.4)', onUpdate() { setDraw(this.targets()[0].d); } });
}

function autoFire(){
  if (played) return;
  recT0 = performance.now(); cue('draw');       // t=0 of the soundtrack
  gsap.to({ d: curDraw }, {
    d: maxDraw * 0.94, duration: 0.62, ease: 'power2.inOut',
    onUpdate() { setDraw(this.targets()[0].d); },
    onComplete: () => gsap.delayedCall(0.16, fire),
  });
}

archery.addEventListener('pointerdown', (e) => {
  if (played) return;
  drawing = true;
  try { archery.setPointerCapture(e.pointerId); } catch (_) {}
  startPX = e.clientX; startPY = e.clientY; startDraw = curDraw;
  e.preventDefault();
});
archery.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  // project the drag onto the pull-back axis, so dragging back along the aim
  // (down + away from the heart) draws the string — on any shot angle.
  const proj = (e.clientX - startPX) * pullUX + (e.clientY - startPY) * pullUY;
  setDraw(startDraw + proj);
});
function endDraw(){
  if (!drawing) return;
  drawing = false;
  if (curDraw > maxDraw * 0.26) fire(); else springBack();
}
archery.addEventListener('pointerup', endDraw);
archery.addEventListener('pointercancel', endDraw);
archery.addEventListener('keydown', (e) => {
  if (played) return;
  if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); autoFire(); }
});

/* boot Act 1: reveal the target + bow + hint, then start the beat */
function enter(){
  // Act 1 owns the clean slate: whatever the ending left armed, it goes away
  // here rather than depending on every path back having tidied up after itself
  replayArmed = false;
  replay.classList.remove('is-shown');
  replay.hidden = true;

  gsap.set(hero, { autoAlpha: 1 });
  refreshRig();
  setDraw(0);
  gsap.set([eyebrow, hint], { opacity: 0, y: 14 });
  gsap.set(target, { opacity: 0, y: 10, scaleX: 0.9, scaleY: 0.9 });
  gsap.set(archery, { opacity: 0, scale: 0.85 });        // scale from the grip; keeps rotation
  gsap.set(heartGlow, { opacity: 0, scale: 1 });
  gsap.set(arrow, { opacity: 1 });

  const tl = gsap.timeline({ onComplete: startBeat });
  tl.to(target,   { opacity: 1, y: 0, scaleX: 1, scaleY: 1, duration: 0.8, ease: 'power3.out' }, 0.1)
    .to(heartGlow,{ opacity: 0.7, duration: 0.8, ease: 'power2.out' }, 0.2)
    .to(archery,  { opacity: 1, scale: 1, duration: 0.8, ease: 'power3.out' }, 0.28)
    .to(eyebrow,  { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0.4)
    .to(hint,     { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0.7);
}

function armReplay(){
  if (replayArmed) return;
  replayArmed = true;
  replay.hidden = false;
  // a reset can land between here and the next frame; don't fade in over Act 1
  requestAnimationFrame(() => { if (!replay.hidden) replay.classList.add('is-shown'); });
}

/* back to Act 1, ready to be drawn again */
function resetAll(){
  treeStop();
  showWish(false);
  stopStorm();

  // tear down every act that runs on its own timeline, or a second play would
  // race the first one's leftovers
  [chronoTL, galleryTL, finaleTL].forEach((tl) => tl && tl.kill());
  chronoTL = galleryTL = finaleTL = null;
  gsap.killTweensOf('.chrono__inner');
  gsap.killTweensOf([finFrame, finHero, finSub, finSig]);
  chronoHearts.innerHTML = '';

  window.bdayDone = false; replayArmed = false; finaleArmed = false; filmHandedOff = false;
  replay.classList.remove('is-shown'); replay.hidden = true;

  if (filmTL){ filmTL.pause(0); }
  gsap.set([flood, bloom], { autoAlpha: 0 });
  gsap.set([field, chrono, gallery, finale], { autoAlpha: 0 });
  gsap.set(galChaps.map((c) => c.el), { autoAlpha: 0 });
  gsap.set('.chrono__inner', { y: 0, opacity: 1 });
  gsap.set(camera, { autoAlpha: 1 });
  gsap.set(arrow, { opacity: 1, scaleY: 1 });
  played = false;
  enter();
}

/* ============================================================
   SIZING + BOOT
   ============================================================ */
function resize(){
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildSprites();
  buildScene();
  if (reduceMotion){ drawFinal(); return; }
  // only the shot is worth re-measuring. Once the film has handed off, rebuilding
  // it would re-seek a finished timeline and fire its handoff a second time.
  if (played && filmTL && !filmHandedOff){
    const at = filmTL.time(); const active = filmTL.isActive();
    filmTL = buildFilm(shotGeom());
    filmTL.pause(at);
    if (active) filmTL.play(at);
  } else if (!played){
    refreshRig(); setDraw(0);
  }
}
let resizeRAF = 0;
window.addEventListener('resize', () => { if (resizeRAF) return; resizeRAF = requestAnimationFrame(() => { resizeRAF = 0; resize(); }); });

resize();

/* The spoken version of the whole film, for reduced motion and screen readers.
   It is written in here rather than in the HTML so that a chat app's link
   scraper — which only ever sees the raw source — has no prose to lift into the
   preview card underneath the title. */
$('srSummary').textContent =
  'สุขสันต์วันครบรอบสี่เดือนนะ รู้จักกันมาเก้าเดือน เป็นคนคุยกันมาห้าเดือน ' +
  'และเป็นแฟนกันมาสี่เดือนแล้ว ยิ่งเวลาผ่านไป เรายิ่งรักเธอมากขึ้นทุกวัน รักแฟนมากนะ';

/* The memories are ~15s into the film and every polaroid starts hidden, so the
   browser has both the time and no reason to fetch them. Warm the cache during
   Act 1 instead of letting a chapter open onto blank white cards. */
function preloadPhotos(){
  [...document.querySelectorAll('.pola img, .fin__photo')].forEach((img) => {
    if (img.complete) return;
    const warm = new Image();
    warm.decoding = 'async';
    warm.src = img.currentSrc || img.src;
  });
}

// the song is meant to be on from the first second, so ask for it here rather
// than waiting for the bow; if the browser says no, armMusic leaves a one-shot
// listener behind and the first touch anywhere starts it instead
armMusic();

if (reduceMotion){
  drawFinal();
} else {
  preloadPhotos();
  buildMotes();
  document.fonts && document.fonts.ready.then(() => { refreshRig(); setDraw(0); });
  enter();
  replay.addEventListener('click', resetAll);
}

/* ============================================================
   RECORDING HOOK — the rig draws + fires after its pre-roll
   ============================================================ */
if (isRecord){
  window.bdayAPI = {
    start(){ autoFire(); },
    replay(){ resetAll(); },
  };
}
