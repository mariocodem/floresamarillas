'use strict';

/* ================== Personaliza aquí ==================
   También puedes cambiar el nombre desde el enlace:
   index.html?para=Ana&de=Mario
======================================================= */
const CONFIG = {
  nombre: 'mi amor',
  de: '',
  mensajes: [
    'Cada hortensia amarilla es un pedacito de lo que siento cuando te veo sonreír.',
    'Las hortensias tienen cientos de florecitas juntas, como los motivos por los que te quiero.',
    'Contigo hasta los días grises se llenan de luz.',
    'Gracias por ser mi lugar favorito en el mundo.',
    'Te quiero muchísimo. Hoy y todos los días.',
  ],
  maxFlores: 14,
  musica: 'tengo-ganas.mp3', // pon el archivo junto a index.html; déjalo vacío ('') para no usar música
  volumenMusica: 0.55,
};

/* ------------------------- utilidades ------------------------- */
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const params = new URLSearchParams(location.search);
const nombre = (params.get('para') || CONFIG.nombre).slice(0, 40);
const de = (params.get('de') || CONFIG.de).slice(0, 40);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const motion = reduced ? 0.3 : 1;

/* ------------------------- estado ------------------------- */
const cv = $('scene');
const ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
let now = 0;
let started = false;

const flowers = [];
const petals = [];
let stars = [], fireflies = [], blades = [];
let shooting = null, nextShoot = 8;
let nextAmbient = 4;
let groundGrad = null;

const unit = () => Math.min(W, H * 0.75);
const groundY = (x) => H * 0.9 + Math.sin(x * 0.006 + 1) * H * 0.008 + Math.sin(x * 0.017) * H * 0.004;
const hillY = (x) => H * 0.8 + Math.sin(x * 0.005 + 2) * H * 0.03 + Math.sin(x * 0.013) * H * 0.012;

/* brillo suave reutilizable (luciérnagas y halos) */
const glow = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,236,150,1)');
  grd.addColorStop(0.35, 'rgba(255,205,70,.45)');
  grd.addColorStop(1, 'rgba(255,190,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
})();

/* ------------------------- sonido ------------------------- */
let audio = null;
let soundOn = true;
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
function chime() {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const f = SCALE[(Math.random() * SCALE.length) | 0];
    const t0 = audio.currentTime;
    [[f, 0.05], [f * 2, 0.018]].forEach(([freq, vol]) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);
      o.connect(g).connect(audio.destination);
      o.start(t0);
      o.stop(t0 + 1.9);
    });
  } catch (_) { /* sin audio, no pasa nada */ }
}

/* ------------------------- música de fondo ------------------------- */
const music = CONFIG.musica ? new Audio(CONFIG.musica) : null;
let musicFade = 0;
if (music) {
  music.loop = true;
  music.preload = 'auto';
  music.volume = 0;
}

function fadeMusic(to, ms) {
  clearInterval(musicFade);
  const from = music.volume, t0 = performance.now();
  musicFade = setInterval(() => {
    const k = clamp((performance.now() - t0) / ms, 0, 1);
    music.volume = lerp(from, to, k);
    if (k >= 1) clearInterval(musicFade);
  }, 50);
}

function playMusic() {
  if (!music || !soundOn) return;
  music.play().then(() => fadeMusic(CONFIG.volumenMusica, 3000)).catch(() => {
    // el navegador exige un gesto del usuario: reintenta con el primer toque
    addEventListener('pointerdown', playMusic, { once: true });
  });
}

document.addEventListener('visibilitychange', () => {
  if (!music || !started || !soundOn) return;
  if (document.hidden) music.pause();
  else playMusic();
});

/* ------------------------- hortensia ------------------------- */
/* Cada florecita tiene 4 sépalos redondeados, como las hortensias de verdad. */
const PET = [0, 1, 2, 3].map((k) => {
  const a = (k * Math.PI) / 2, d = 0.52;
  const x = d * Math.sin(a), y = -d * Math.cos(a);
  return { x, y, rot: a, mx: x + 0.42 * Math.cos(a), my: y + 0.42 * Math.sin(a) };
});
const LIGHT = (() => {
  const v = [-0.45, -0.55, 0.7];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();

function makeFlorets(seed) {
  const r = mulberry32(seed);
  const N = 95, out = [];
  for (let i = 0; i < N; i++) {
    const rr = Math.sqrt((i + 0.5) / N) * 0.93;
    const a = i * 2.399963 + r() * 0.15;
    const nx = Math.cos(a) * rr, ny = Math.sin(a) * rr;
    const z = Math.sqrt(Math.max(0.02, 1 - rr * rr * 0.92));
    const lam = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + z * LIGHT[2]);
    const hue = 46 + r() * 10 + (r() < 0.12 ? 5 : 0);
    const sat = 88 + r() * 10;
    let lig = 55 + lam * 22 + (r() - 0.5) * 8;
    if (r() < 0.16) lig += 9;
    lig -= rr * rr * 5;
    out.push({
      nx, ny, z,
      ang: Math.atan2(ny, nx),
      rot: r() * TAU,
      sz: 0.92 + r() * 0.2,
      delay: 0.5 * rr + r() * 0.06,
      fill: `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% ${lig.toFixed(0)}%)`,
      stroke: `hsla(${(hue - 6).toFixed(0)} 85% ${(lig - 22).toFixed(0)}% / .45)`,
      eye: `hsl(${(hue + 10).toFixed(0)} 70% ${Math.min(85, lig + 16).toFixed(0)}%)`,
    });
  }
  return out.sort((a, b) => a.z - b.z); // primero los de afuera, al final el centro
}

function drawLeaf(c, x, y, ang, len, wid, fill, vein) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(len * 0.2, -wid, len * 0.7, -wid * 0.85, len, 0);
  c.bezierCurveTo(len * 0.7, wid * 0.85, len * 0.2, wid, 0, 0);
  c.fill();
  c.strokeStyle = vein;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(len * 0.88, 0);
  c.stroke();
  c.restore();
}

/* Dibuja la cabeza completa (hojas de fondo + florecitas + volumen) en su propio canvas. */
function renderHead(f, R, side, bloom) {
  const c = f.sprite.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, f.sprite.width, f.sprite.height);
  const cx = side / 2, cy = side / 2;

  // hojas grandes detrás de la flor
  const lr = mulberry32(f.seed + 7);
  const leafGrow = easeOutCubic(clamp(bloom * 2.5, 0, 1));
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI * 0.1 + k * ((Math.PI * 1.2) / 6) + (lr() - 0.5) * 0.3;
    const len = R * (1.2 + lr() * 0.15) * leafGrow;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawLeaf(c, cx, cy, a, len, len * 0.34,
      `hsl(${138 + lr() * 10} 40% ${20 + lr() * 6}%)`, 'rgba(150,215,150,.3)');
  }

  // florecitas
  c.lineJoin = 'round';
  for (const fl of f.florets) {
    const local = clamp((bloom - fl.delay) / 0.4, 0, 1);
    if (local <= 0) continue;
    const s = easeOutBack(local);
    const fr = R * 0.27 * (0.72 + 0.28 * fl.z) * fl.sz * s;
    const px = cx + fl.nx * R, py = cy + fl.ny * R;
    const cs = Math.cos(fl.ang), sn = Math.sin(fl.ang);
    const zc = 0.55 + 0.45 * fl.z; // las de los bordes se ven de lado
    c.setTransform(cs * zc * DPR, sn * zc * DPR, -sn * DPR, cs * DPR, px * DPR, py * DPR);
    c.rotate(fl.rot);
    c.fillStyle = fl.fill;
    c.strokeStyle = fl.stroke;
    c.lineWidth = Math.max(0.5, fr * 0.05);
    c.beginPath();
    for (const p of PET) {
      c.moveTo(fr * p.mx, fr * p.my);
      c.ellipse(fr * p.x, fr * p.y, fr * 0.42, fr * 0.55, p.rot, 0, TAU);
    }
    c.fill();
    c.stroke();
    c.fillStyle = fl.eye;
    c.beginPath();
    c.arc(0, 0, fr * 0.11, 0, TAU);
    c.fill();
  }

  // luz arriba a la izquierda y sombra abajo a la derecha para dar volumen
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  const g = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R * 1.1);
  g.addColorStop(0, 'rgba(255,255,225,.3)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(110,60,0,.2)');
  c.fillStyle = g;
  c.fillRect(0, 0, side, side);
  c.globalCompositeOperation = 'source-over';
}

class Flower {
  constructor({ xr, topr, depth }) {
    this.xr = xr;
    this.topr = topr;
    this.depth = depth;
    this.sz = rand(0.9, 1.12);
    this.leanr = rand(-0.035, 0.035);
    this.bend = rand(-0.18, 0.18);
    this.t0 = now;
    this.growDur = rand(2.0, 2.8);
    this.bloomDur = 3.0;
    this.phase = rand(0, TAU);
    this.seed = (Math.random() * 1e9) | 0;
    this.florets = makeFlorets(this.seed);
    const n = 3 + ((Math.random() * 2) | 0);
    this.leaves = Array.from({ length: n }, (_, i) => ({
      u: 0.2 + i * (0.55 / (n - 1)) + rand(-0.03, 0.03),
      side: i % 2 ? 1 : -1,
      len: rand(0.9, 1.15),
      jit: rand(-0.2, 0.2),
      fill: `hsl(${136 + rand(0, 12)} 40% ${22 + rand(0, 6)}%)`,
    }));
    this.sprite = document.createElement('canvas');
    this.key = '';
    this.full = false;
    this.emitted = false;
    this.dying = 0;
  }

  get R() { return clamp(unit() * 0.155 * this.depth * this.sz, 38, 135); }

  draw() {
    const R = this.R;
    const age = now - this.t0;
    const alpha = this.dying ? clamp(1 - (now - this.dying) / 1.4, 0, 1) : 1;

    const x0 = this.xr * W, y0 = groundY(x0) + 8;
    const minTop = H * 0.28 + R * 1.75;
    const topY = clamp(this.topr * H, minTop, Math.max(minTop, y0 - R * 2));
    const len = y0 - topY;
    const sway = Math.sin(now * 0.8 + this.phase) * len * 0.03 * motion;
    const x2 = x0 + this.leanr * W + sway, y2 = topY;
    const cx = x0 + (x2 - x0) * 0.25 + this.bend * len;
    const cy = y0 - len * 0.55;
    const B = (u) => {
      const v = 1 - u;
      return [v * v * x0 + 2 * v * u * cx + u * u * x2, v * v * y0 + 2 * v * u * cy + u * u * y2];
    };
    const T = (u) => [2 * (1 - u) * (cx - x0) + 2 * u * (x2 - cx), 2 * (1 - u) * (cy - y0) + 2 * u * (y2 - cy)];

    const g = easeInOut(clamp(age / this.growDur, 0, 1));
    ctx.globalAlpha = alpha;

    // tallo
    const sw = clamp(R * 0.075, 2.2, 8);
    const steps = Math.max(2, Math.ceil(g * 28));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'hsl(140 38% 20%)';
    ctx.lineWidth = sw;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const [px, py] = B((g * i) / steps);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = 'hsl(120 38% 34%)';
    ctx.lineWidth = sw * 0.35;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const [px, py] = B((g * i) / steps);
      i ? ctx.lineTo(px + sw * 0.18, py) : ctx.moveTo(px + sw * 0.18, py);
    }
    ctx.stroke();

    // hojas del tallo
    for (const lf of this.leaves) {
      if (g < lf.u) continue;
      const grow = easeOutCubic(clamp((g - lf.u) / 0.25, 0, 1));
      const [lx, ly] = B(lf.u);
      const [tx, ty] = T(lf.u);
      const ang = Math.atan2(ty, tx) + lf.side * (1 + lf.jit) + Math.sin(now * 1.2 + this.phase + lf.u * 3) * 0.05 * motion;
      const ll = clamp(len * 0.11, 30, 78) * lf.len * grow;
      drawLeaf(ctx, lx, ly, ang, ll, ll * 0.34, lf.fill, 'rgba(150,215,150,.3)');
    }

    // cabeza
    const bloom = clamp((age - this.growDur * 0.98) / this.bloomDur, 0, 1);
    const [tx, ty] = T(1);
    const tilt = Math.atan2(tx, -ty);
    const hx = x2 + Math.sin(tilt) * R * 0.72;
    const hy = y2 - Math.cos(tilt) * R * 0.72;

    if (bloom < 0.12) {
      ctx.fillStyle = bloom > 0 ? 'hsl(70 55% 45%)' : 'hsl(100 45% 32%)';
      ctx.beginPath();
      ctx.ellipse(x2, y2 - 2, sw * 1.3, sw * 1.7, tilt, 0, TAU);
      ctx.fill();
    }

    if (bloom > 0) {
      const side = Math.ceil(R * 3);
      const key = side + '|' + DPR;
      if (this.key !== key) {
        this.sprite.width = this.sprite.height = Math.ceil(side * DPR);
        this.key = key;
        this.full = false;
      }
      if (!this.full) {
        renderHead(this, R, side, bloom);
        if (bloom >= 1) this.full = true;
      }

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.32 * easeOutCubic(bloom);
      ctx.drawImage(glow, hx - R * 1.9, hy - R * 1.9, R * 3.8, R * 3.8);
      ctx.globalCompositeOperation = 'source-over';

      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(tilt * 0.8 + Math.sin(now * 0.8 + this.phase) * 0.02 * motion);
      const br = 1 + Math.sin(now * 1.3 + this.phase) * 0.012 * motion;
      ctx.scale(br, br);
      ctx.drawImage(this.sprite, -side / 2, -side / 2, side, side);
      ctx.restore();

      if (bloom >= 1 && !this.emitted) {
        this.emitted = true;
        emitPetals(hx, hy, R, reduced ? 4 : 16);
      }
    }
    ctx.globalAlpha = 1;
    this.head = { x: hx, y: hy, R };
  }
}

function plant({ xr, y, depth } = {}) {
  depth = depth ?? rand(0.78, 1);
  xr = xr ?? rand(0.06, 0.94);
  let topr;
  if (y != null) {
    const R = clamp(unit() * 0.155 * depth, 38, 135);
    topr = (y + R * 0.7) / H; // la cabeza queda donde tocaste
  } else {
    topr = rand(0.42, 0.7);
  }
  flowers.push(new Flower({ xr, topr, depth }));

  const alive = flowers.filter((f) => !f.dying);
  if (alive.length > CONFIG.maxFlores) alive[0].dying = now;
  chime();
}

function bouquet() {
  const n = 5;
  const base = rand(0.1, 0.25);
  for (let i = 0; i < n; i++) {
    setTimeout(() => plant({ xr: base + (i / (n - 1)) * 0.6 + rand(-0.04, 0.04) }), i * 260);
  }
}

/* ------------------------- pétalos ------------------------- */
function emitPetals(x, y, R, n) {
  for (let i = 0; i < n && petals.length < 160; i++) {
    const a = rand(0, TAU), d = rand(0.2, 1) * R;
    petals.push({
      x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
      vx: rand(-20, 20), vy: rand(25, 55),
      rot: rand(0, TAU), vr: rand(-2, 2),
      s: rand(4, 8), ph: rand(0, TAU),
      hue: rand(43, 56), life: rand(0.75, 1),
    });
  }
}

function updatePetals(dt) {
  for (let i = petals.length - 1; i >= 0; i--) {
    const p = petals[i];
    p.y += p.vy * dt;
    p.x += (p.vx + Math.sin(now * 2 + p.ph) * 24) * dt;
    p.rot += p.vr * dt;
    if (p.y > groundY(p.x) + 4) { petals.splice(i, 1); continue; }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.life;
    ctx.fillStyle = `hsl(${p.hue.toFixed(0)} 95% 62%)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.s * 0.55, p.s, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* ------------------------- escena ------------------------- */
function buildScene() {
  stars = Array.from({ length: 90 }, () => ({
    x: Math.random(), y: Math.random() * 0.62,
    r: rand(0.5, 1.5), ph: rand(0, TAU), sp: rand(0.8, 2.4),
  }));
  fireflies = Array.from({ length: 34 }, () => ({
    x: Math.random(), y: rand(0.34, 0.88),
    ax: rand(20, 60), ay: rand(14, 40),
    sx: rand(0.15, 0.4), sy: rand(0.15, 0.4),
    ph: rand(0, TAU), bs: rand(0.8, 2), s: rand(14, 26),
  }));
  const count = clamp(Math.round(W / 5), 120, 360);
  blades = Array.from({ length: count }, () => ({
    x: Math.random(), h: rand(10, 34) * clamp(H / 800, 0.7, 1.3),
    ph: rand(0, TAU), tone: (Math.random() * 3) | 0,
  }));
  groundGrad = ctx.createLinearGradient(0, H * 0.86, 0, H);
  groundGrad.addColorStop(0, '#17402a');
  groundGrad.addColorStop(1, '#071710');
}

function drawSky() {
  for (const s of stars) {
    const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * s.sp + s.ph));
    ctx.fillStyle = `rgba(255,248,220,${a.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, s.r, 0, TAU);
    ctx.fill();
  }

  if (now > nextShoot && !shooting && !reduced) {
    shooting = { x: rand(0.35, 0.95) * W, y: rand(0.04, 0.25) * H, vx: -rand(520, 720), vy: rand(200, 320), t: 0 };
    nextShoot = now + rand(8, 15);
  }
  if (shooting) {
    const dt = 1 / 60;
    shooting.t += dt;
    shooting.x += shooting.vx * dt;
    shooting.y += shooting.vy * dt;
    const a = Math.sin(clamp(shooting.t / 0.9, 0, 1) * Math.PI);
    const g = ctx.createLinearGradient(shooting.x, shooting.y, shooting.x - shooting.vx * 0.12, shooting.y - shooting.vy * 0.12);
    g.addColorStop(0, `rgba(255,245,200,${a})`);
    g.addColorStop(1, 'rgba(255,245,200,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(shooting.x, shooting.y);
    ctx.lineTo(shooting.x - shooting.vx * 0.12, shooting.y - shooting.vy * 0.12);
    ctx.stroke();
    if (shooting.t > 0.9) shooting = null;
  }

  // colina lejana
  ctx.fillStyle = '#1d1445';
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W + 12; x += 12) ctx.lineTo(x, hillY(x));
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function drawFireflies() {
  ctx.globalCompositeOperation = 'lighter';
  for (const f of fireflies) {
    const x = f.x * W + Math.sin(now * f.sx + f.ph) * f.ax;
    const y = f.y * H + Math.cos(now * f.sy + f.ph * 2) * f.ay;
    const a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(now * f.bs + f.ph));
    ctx.globalAlpha = a * 0.85;
    ctx.drawImage(glow, x - f.s / 2, y - f.s / 2, f.s, f.s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawGround() {
  ctx.fillStyle = groundGrad;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W + 12; x += 12) ctx.lineTo(x, groundY(x));
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  const tones = ['#1c4a30', '#25603b', '#327a48'];
  for (let t = 0; t < 3; t++) {
    ctx.fillStyle = tones[t];
    ctx.beginPath();
    for (const b of blades) {
      if (b.tone !== t) continue;
      const x = b.x * W, base = groundY(x) + 3;
      const sw = Math.sin(now * 1.4 + b.ph + x * 0.01) * b.h * 0.25 * motion;
      ctx.moveTo(x - 1.8, base);
      ctx.quadraticCurveTo(x + sw * 0.4, base - b.h * 0.6, x + sw, base - b.h);
      ctx.quadraticCurveTo(x + sw * 0.4 + 2, base - b.h * 0.55, x + 1.8, base);
    }
    ctx.fill();
  }
}

let last = 0;
function frame(ms) {
  now = ms / 1000;
  const dt = Math.min(0.05, now - last || 0.016);
  last = now;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  drawSky();

  flowers.sort((a, b) => a.depth - b.depth);
  for (let i = flowers.length - 1; i >= 0; i--) {
    const f = flowers[i];
    if (f.dying && now - f.dying > 1.4) { flowers.splice(i, 1); continue; }
    f.draw();
  }
  updatePetals(dt);

  // de vez en cuando cae un pétalo de las flores ya abiertas
  if (now > nextAmbient) {
    nextAmbient = now + rand(0.8, 1.8);
    const open = flowers.filter((f) => f.full && !f.dying);
    if (open.length) {
      const f = open[(Math.random() * open.length) | 0];
      emitPetals(f.head.x, f.head.y, f.head.R * 0.8, 1 + ((Math.random() * 2) | 0));
    }
  }

  drawFireflies();
  drawGround();
  requestAnimationFrame(frame);
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
  buildScene();
}

/* ------------------------- mensajes ------------------------- */
async function runMessages() {
  const el = $('message');
  const list = CONFIG.mensajes;
  for (let i = 0; ; i++) {
    let text = list[i % list.length];
    if (de && i % list.length === list.length - 1) text += '\n— ' + de;
    el.classList.remove('out');
    el.textContent = '';
    if (reduced) {
      el.textContent = text;
    } else {
      for (let k = 1; k <= text.length; k++) {
        el.textContent = text.slice(0, k);
        await sleep(/[,.!?]/.test(text[k - 1]) ? 260 : 42);
      }
    }
    await sleep(3200 + text.length * 30);
    el.classList.add('out');
    await sleep(900);
  }
}

/* ------------------------- arranque ------------------------- */
async function start() {
  if (started) return;
  started = true;
  $('intro').classList.add('hide');
  chime();
  playMusic();

  setTimeout(() => $('title').classList.add('show'), 700);
  setTimeout(runMessages, 2200);

  const n = W < 600 ? 4 : 7;
  const slots = Array.from({ length: n }, (_, i) => (i + 0.5) / n);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  for (const s of slots) {
    plant({ xr: clamp(s + rand(-0.03, 0.03), 0.05, 0.95) });
    await sleep(850);
  }
  $('controls').classList.add('show');
}

$('title').textContent = 'Para ti, ' + nombre;
$('introTitle').textContent = nombre;
document.title = 'Para ti, ' + nombre;

let lastTap = 0;
cv.addEventListener('pointerdown', (e) => {
  if (!started || e.timeStamp - lastTap < 120) return;
  lastTap = e.timeStamp;
  plant({ xr: clamp(e.clientX / W, 0.03, 0.97), y: e.clientY });
});
addEventListener('keydown', (e) => {
  if (started && e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    plant();
  }
});
$('open').addEventListener('click', start);
$('bouquet').addEventListener('click', bouquet);
$('sound').addEventListener('click', (e) => {
  soundOn = !soundOn;
  if (music) {
    if (soundOn) playMusic();
    else { clearInterval(musicFade); music.pause(); }
  }
  e.currentTarget.textContent = 'Sonido: ' + (soundOn ? 'sí' : 'no');
  e.currentTarget.setAttribute('aria-pressed', String(soundOn));
});

let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 120);
});

resize();
requestAnimationFrame(frame);
if (params.has('skip')) start(); // ?skip salta la pantalla de inicio
