// Рисует иконки приложения (мыльный пузырь на тёмной воде) без внешних библиотек.
// Запуск: node scripts/make-icons.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const hsl = (h, s, l) => {
  const f = (n) => { const k = (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};
const P1 = hex('#2A5267'), P2 = hex('#0F1E28'), P3 = hex('#081117');

function shade(u, v) {
  // фон
  const dBg = Math.hypot(u - 0.5, v - 0.0);
  let col = dBg < 0.6 ? mix(P1, P2, dBg / 0.6) : mix(P2, P3, clamp((dBg - 0.6) / 0.6));
  // пузырь
  const cx = 0.5, cy = 0.53, R = 0.33;
  const d = Math.hypot(u - cx, v - cy) / R;
  if (d <= 1) {
    const ang = Math.atan2(v - cy, u - cx);
    const film = hsl(((ang / Math.PI) * 180 + 360 + d * 140) % 360, 0.95, 0.72);
    const rim = smooth(0.55, 1.0, d);
    col = mix(col, film, rim * 0.62);
    col = mix(col, [255, 255, 255], Math.pow(rim, 7) * 0.55);
    col = mix(col, [170, 220, 255], (1 - rim) * 0.05);
    // блик
    const hx = u - 0.385, hy = v - 0.38;
    const rx = hx * Math.cos(0.5) + hy * Math.sin(0.5), ry = -hx * Math.sin(0.5) + hy * Math.cos(0.5);
    const e = Math.hypot(rx / 0.085, ry / 0.045);
    col = mix(col, [255, 255, 255], (1 - smooth(0.25, 1, e)) * 0.92);
    const e2 = Math.hypot(u - 0.635, v - 0.69) / 0.022;
    col = mix(col, [255, 255, 255], (1 - smooth(0.3, 1, e2)) * 0.45);
  }
  return col;
}

function render(size) {
  const ss = 3;
  const buf = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
        acc = acc.map((v, i) => v + c[i]);
      }
      const o = (y * size + x) * 3;
      buf[o] = Math.round(acc[0] / (ss * ss));
      buf[o + 1] = Math.round(acc[1] / (ss * ss));
      buf[o + 2] = Math.round(acc[2] / (ss * ss));
    }
  }
  return png(size, size, buf);
}

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const s of [180, 192, 512]) {
  fs.writeFileSync(path.join(out, `icon-${s}.png`), render(s));
  console.log(`icons/icon-${s}.png`);
}
