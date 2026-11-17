// Поле пузырей: простая 2D-физика (притяжение к центру, столкновения, стенки),
// перетаскивание пальцем и упругая деформация («сминаются» и «пружинят»).
// Физика считается шагами по 1/60 с, а кадры рисуются с интерполяцией между шагами —
// иначе на экранах 120 Гц и при неровных кадрах пузыри подёргиваются.
const STEP = 1000 / 60;
const GAP = 6;
const MAX_SPEED = 30;

export class BubbleField {
  constructor(el, { onTap } = {}) {
    this.el = el;
    this.onTap = onTap;
    this.bs = new Map();
    this.focusId = null;
    this.inset = { top: 0, bottom: 0 };
    this.running = false;
    this.acc = 0;
    this.p = null;
    this.loop = this.loop.bind(this);
    this.resize();
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e, false));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ---------- geometry ---------- */
  setInsets(top, bottom) { this.inset = { top, bottom }; }
  resize() {
    this.W = this.el.clientWidth || innerWidth;
    this.H = this.el.clientHeight || innerHeight;
    this.rescale();
  }
  bounds() { return { l: 0, r: this.W, t: this.inset.top, b: this.H - this.inset.bottom }; }
  radiusFor(count) {
    const W = Math.min(this.W, 520);
    const rmin = W * 0.095, rmax = W * 0.27;
    return rmin + (rmax - rmin) * Math.min(1, Math.sqrt(count / 30));
  }
  focusR() { return Math.min(this.W * 0.23, 120); }
  getFocus() { return { x: this.fx, y: this.fy, r: this.focusR() }; }

  rescale() {
    const { l, r, t, b } = this.bounds();
    const area = Math.max(1, (r - l) * (b - t));
    const list = [...this.bs.values()];
    list.forEach((x) => { x.nr = this.radiusFor(x.count); });
    const sum = list.reduce((s, x) => s + Math.PI * x.nr * x.nr, 0);
    // слишком тесно — уменьшаем всех; слишком пусто — немного увеличиваем
    let k = 1;
    if (sum > area * 0.42) k = Math.sqrt((area * 0.42) / sum);
    else if (sum > 0 && sum < area * 0.3) k = Math.min(1.3, Math.sqrt((area * 0.3) / sum));
    list.forEach((x) => {
      x.nr *= k;
      x.tr = this.focusId === x.id ? this.focusR() : x.nr;
      if (Math.abs(x.tr - x.base) > 1) {
        x.base = x.tr;
        x.el.style.width = x.el.style.height = `${2 * x.base}px`;
        x.el.style.setProperty('--d', `${2 * x.base}px`);
      }
    });
  }

  /* ---------- data ---------- */
  setBubbles(list, spawn = 'top') {
    const seen = new Set();
    const fresh = [];
    list.forEach((d) => {
      let b = this.bs.get(d.id);
      if (!b) { b = this.create(d, spawn); fresh.push(b); }
      b.count = d.count;
      if (b.name !== d.name) { b.name = d.name; b.el.querySelector('b').textContent = d.name; }
      if (b.sub !== d.sub) { b.sub = d.sub; b.el.querySelector('small').textContent = d.sub; }
      seen.add(d.id);
    });
    for (const [id, b] of this.bs) {
      if (!seen.has(id)) { b.el.remove(); this.bs.delete(id); }
    }
    this.rescale();
    fresh.forEach((b) => { b.r = b.pr = spawn === 'top' ? b.tr * 0.3 : b.tr; });
  }

  create(d, spawn) {
    const el = document.createElement('div');
    el.className = 'b';
    el.dataset.id = d.id;
    el.innerHTML = `<div class="bubble${d.inbox ? ' inbox' : ''}"><b></b><small></small></div>`;
    this.el.appendChild(el);
    const { l, r, t, b } = this.bounds();
    const cx = (l + r) / 2, cy = (t + b) / 2;
    let x, y;
    if (spawn === 'top') {
      x = cx + (Math.random() - 0.5) * 80;
      y = t + 40;
    } else {
      const a = Math.random() * Math.PI * 2, R = Math.max(this.W, this.H) * 0.7;
      x = cx + Math.cos(a) * R;
      y = cy + Math.sin(a) * R;
    }
    const bub = {
      id: d.id, el, name: null, sub: null, count: 0,
      x, y, px: x, py: y, vx: 0, vy: spawn === 'top' ? 6 : 0, r: 20, pr: 20, tr: 20, nr: 20, base: 0,
      def: 0, pdef: 0, dv: 0, ang: 0, cmp: 0, cang: 0, ph: Math.random() * 6.28,
      drag: false, out: false, entering: spawn !== 'top', born: performance.now(),
    };
    this.bs.set(d.id, bub);
    return bub;
  }

  clear() {
    for (const b of this.bs.values()) b.el.remove();
    this.bs.clear();
    this.focusId = null;
  }

  pulse(id) {
    const b = this.bs.get(id);
    if (b) b.dv -= 0.09;
  }

  /* ---------- focus (opened bubble) ---------- */
  focus(id) {
    const f = this.bs.get(id);
    if (!f) return;
    if (this.p) { this.p.b.drag = false; this.p = null; }
    this.focusId = id;
    const { l, r, t, b } = this.bounds();
    this.fx = (l + r) / 2;
    this.fy = t + (b - t) * 0.47;
    f.tr = this.focusR();
    for (const x of this.bs.values()) {
      if (x === f) continue;
      const dx = x.x - this.fx, dy = x.y - this.fy;
      const d = Math.hypot(dx, dy) || 1;
      const sp = 22 + Math.random() * 8;
      x.out = true;
      x.vx = (dx / d) * sp;
      x.vy = (dy / d) * sp;
      x.el.classList.add('gone');
    }
  }

  unfocus() {
    const f = this.bs.get(this.focusId);
    this.focusId = null;
    if (f) f.tr = f.nr;
    const { l, r, t, b } = this.bounds();
    const cx = (l + r) / 2, cy = (t + b) / 2;
    const R = Math.max(this.W, this.H) * 0.62;
    for (const x of this.bs.values()) {
      if (!x.out) continue;
      x.out = false;
      x.entering = true;
      x.born = performance.now();
      const dx = x.x - cx, dy = x.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      x.x = cx + (dx / d) * R;
      x.y = cy + (dy / d) * R;
      x.px = x.x; x.py = x.y;
      x.vx = -(dx / d) * 12;
      x.vy = -(dy / d) * 12;
      x.el.classList.remove('gone');
    }
    this.rescale();
  }

  /* ---------- pointer ---------- */
  down(e) {
    if (this.focusId || this.p) return;
    const el = e.target.closest('.b');
    if (!el) return;
    const b = this.bs.get(el.dataset.id);
    if (!b) return;
    const rect = this.el.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    this.p = { b, pid: e.pointerId, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: false, ox: b.x - px, oy: b.y - py, rect };
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  move(e) {
    const p = this.p;
    if (!p || e.pointerId !== p.pid) return;
    const dx = e.clientX - p.sx, dy = e.clientY - p.sy;
    if (!p.moved && Math.hypot(dx, dy) > 8) {
      p.moved = true;
      p.b.drag = true;
      p.b.el.classList.add('held');
    }
    if (p.moved) {
      p.b.tx = e.clientX - p.rect.left + p.ox;
      p.b.ty = e.clientY - p.rect.top + p.oy;
    }
  }
  up(e, cancelled) {
    const p = this.p;
    if (!p || e.pointerId !== p.pid) return;
    this.p = null;
    if (p.moved) {
      p.b.drag = false;
      p.b.el.classList.remove('held');
    } else if (!cancelled && performance.now() - p.t0 < 500) {
      this.onTap?.(p.b.id);
    }
  }

  /* ---------- loop ---------- */
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    requestAnimationFrame(this.loop);
  }
  stop() { this.running = false; }

  loop(now) {
    if (!this.running) return;
    this.acc = Math.min(this.acc + (now - this.last), STEP * 4);
    this.last = now;
    const t = now / 1000;
    while (this.acc >= STEP) {
      for (const b of this.bs.values()) { b.px = b.x; b.py = b.y; b.pr = b.r; b.pdef = b.def; }
      this.step(t);
      this.acc -= STEP;
    }
    this.render(t, this.acc / STEP);
    requestAnimationFrame(this.loop);
  }

  fixed(b) { return b.drag || this.focusId === b.id; }

  step(t) {
    const B = [...this.bs.values()];
    const { l, r, t: top, b: bot } = this.bounds();
    const cx = (l + r) / 2, cy = (top + bot) / 2;
    const far = Math.max(this.W, this.H) * 2;

    for (const b of B) {
      b.cmp = 0;
      if (b.drag) {
        const nx = b.x + (b.tx - b.x) * 0.55, ny = b.y + (b.ty - b.y) * 0.55;
        b.vx = nx - b.x; b.vy = ny - b.y;
        b.x = nx; b.y = ny;
      } else if (b.out) {
        if (Math.hypot(b.x - cx, b.y - cy) < far) { b.x += b.vx; b.y += b.vy; }
      } else if (this.focusId === b.id) {
        b.vx += (this.fx - b.x) * 0.03; b.vy += (this.fy - b.y) * 0.03;
        b.vx *= 0.8; b.vy *= 0.8;
        b.x += b.vx; b.y += b.vy;
      } else {
        b.vx += (cx - b.x) * 0.0012 + Math.sin(t * 0.6 + b.ph) * 0.012;
        b.vy += (cy - b.y) * 0.0008 + Math.cos(t * 0.5 + b.ph * 1.7) * 0.012;
        b.vx *= 0.94; b.vy *= 0.94;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
        b.x += b.vx; b.y += b.vy;
      }
      b.r += (b.tr - b.r) * 0.14;
    }

    // столкновения
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < B.length; i++) {
        const a = B[i];
        if (a.out) continue;
        for (let j = i + 1; j < B.length; j++) {
          const c = B[j];
          if (c.out) continue;
          let dx = c.x - a.x, dy = c.y - a.y;
          let d = Math.hypot(dx, dy);
          if (d < 0.001) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.hypot(dx, dy); }
          const min = a.r + c.r + GAP;
          if (d >= min) continue;
          const fa = this.fixed(a), fc = this.fixed(c);
          if (fa && fc) continue;
          const o = min - d, nx = dx / d, ny = dy / d;
          const wa = fa ? 0 : fc ? 1 : 0.5, wc = 1 - wa;
          a.x -= nx * o * wa; a.y -= ny * o * wa;
          c.x += nx * o * wc; c.y += ny * o * wc;
          if (it === 0) {
            const k = Math.min(o, 30) * 0.12;
            a.vx -= nx * k * wa * 2; a.vy -= ny * k * wa * 2;
            c.vx += nx * k * wc * 2; c.vy += ny * k * wc * 2;
            const ang = Math.atan2(ny, nx);
            if (o / a.r > a.cmp) { a.cmp = o / a.r; a.cang = ang; }
            if (o / c.r > c.cmp) { c.cmp = o / c.r; c.cang = ang; }
          }
        }
      }
    }

    // стенки
    const now = performance.now();
    for (const b of B) {
      if (b.out || b.drag || this.focusId === b.id) continue;
      if (b.entering) {
        const inside = b.x - b.r >= l && b.x + b.r <= r && b.y - b.r >= top && b.y + b.r <= bot;
        if (inside || now - b.born > 2500) b.entering = false;
        else continue;
      }
      if (b.x - b.r < l) { const o = l - (b.x - b.r); b.x += o; b.vx = Math.abs(b.vx) * 0.5; this.wall(b, o, 0); }
      if (b.x + b.r > r) { const o = b.x + b.r - r; b.x -= o; b.vx = -Math.abs(b.vx) * 0.5; this.wall(b, o, 0); }
      if (b.y - b.r < top) { const o = top - (b.y - b.r); b.y += o; b.vy = Math.abs(b.vy) * 0.5; this.wall(b, o, Math.PI / 2); }
      if (b.y + b.r > bot) { const o = b.y + b.r - bot; b.y -= o; b.vy = -Math.abs(b.vy) * 0.5; this.wall(b, o, Math.PI / 2); }
    }

    // упругая деформация
    for (const b of B) {
      let target = Math.min(0.2, b.cmp * 1.4);
      let ang = b.cang;
      if (b.drag) {
        const sp = Math.hypot(b.vx, b.vy);
        const st = Math.min(0.16, sp * 0.012);
        if (st > target) { target = -st; ang = Math.atan2(b.vy, b.vx); }
      }
      if (Math.abs(target) > 0.01) b.ang = ang;
      b.dv += (target - b.def) * 0.22;
      b.dv *= 0.7;
      b.def += b.dv;
    }
  }

  wall(b, o, ang) {
    const c = o / b.r;
    if (c > b.cmp) { b.cmp = c; b.cang = ang; }
  }

  render(t, a = 1) {
    const mix = (p, c) => p + (c - p) * a;
    for (const b of this.bs.values()) {
      if (!b.base) continue;
      const x = mix(b.px, b.x), y = mix(b.py, b.y), r = mix(b.pr, b.r), def = mix(b.pdef, b.def);
      const k = (r / b.base) * (1 + 0.014 * Math.sin(t * 1.7 + b.ph));
      const sx = k * (1 - def), sy = k * (1 + def * 0.75);
      b.el.style.transform =
        `translate3d(${(x - b.base).toFixed(2)}px,${(y - b.base).toFixed(2)}px,0) rotate(${b.ang.toFixed(3)}rad) scale(${sx.toFixed(4)},${sy.toFixed(4)}) rotate(${(-b.ang).toFixed(3)}rad)`;
    }
  }
}
