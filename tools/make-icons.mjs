// Generates the PWA icons (PNG) with no dependencies: node tools/make-icons.mjs
// A tiny supersampled rasteriser + PNG encoder. Output goes to icons/.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../icons/', import.meta.url));
mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
function png(size, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const inPoly = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c; };
const inRound = (x, y, s, r) => { const dx = Math.max(r - x, 0, x - (s - r)), dy = Math.max(r - y, 0, y - (s - r)); return dx * dx + dy * dy <= r * r; };

// design in a 64 unit box (same shapes as icon.svg)
const BG = [63, 95, 214], WHITE = [255, 255, 255], TIP = [201, 211, 247];
const BODY = [[14, 50], [19, 37], [45, 11], [53, 19], [27, 45]], NIB = [[14, 50], [19, 37], [27, 45]], CAP = [[40, 16], [43, 13], [51, 21], [48, 24]];

function render(size, { maskable }) {
  const S = 4, buf = Buffer.alloc(size * size * 4);
  const scale = maskable ? 0.62 : 0.9, off = (1 - scale) / 2;   // maskable keeps the pen inside the 80% safe zone
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = px + (sx + 0.5) / S, y = py + (sy + 0.5) / S;
      const inside = maskable ? true : inRound(x, y, size, size * 0.22);
      if (!inside) continue;
      const u = ((x / size - off) / scale) * 64, v = ((y / size - off) / scale) * 64;
      let c = BG;
      if (inPoly(u, v, BODY)) c = inPoly(u, v, NIB) ? TIP : WHITE;
      if (inPoly(u, v, CAP)) c = BG;
      r += c[0]; g += c[1]; b += c[2]; a += 255;
    }
    const n = S * S, i = (py * size + px) * 4;
    if (a) { buf[i] = Math.round(r / (a / 255)); buf[i + 1] = Math.round(g / (a / 255)); buf[i + 2] = Math.round(b / (a / 255)); buf[i + 3] = Math.round(a / n); }
  }
  return png(size, buf);
}

for (const [name, size, maskable] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]]) {
  writeFileSync(out + name, render(size, { maskable }));
  console.log('wrote icons/' + name);
}
