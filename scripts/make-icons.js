// Generates the app icons as PNGs with no dependencies (signed-distance shapes, 4x4 supersampling).
// Usage: node scripts/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const GREEN = [37, 211, 102];
const WHITE = [255, 255, 255];
const RED = [234, 67, 53];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePNG(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) <= r;

// Triangle test via barycentric signs.
function inTri(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// Returns [r,g,b,a] for a point in unit space.
function sample(x, y, badge) {
  if (badge && circle(x, y, 0.8, 0.2, 0.2)) return [...RED, 255];
  if (badge && circle(x, y, 0.8, 0.2, 0.26)) return [0, 0, 0, 0]; // gap ring around the badge
  if (!circle(x, y, 0.5, 0.5, 0.48)) return [0, 0, 0, 0];
  // Speech bubble: circle + tail toward bottom-left.
  const bubble = circle(x, y, 0.52, 0.47, 0.27) ||
    inTri(x, y, [0.27, 0.78], [0.33, 0.55], [0.45, 0.68]);
  if (bubble) {
    // Three "typing" dots inside the bubble.
    for (const dx of [0.40, 0.52, 0.64]) if (circle(x, y, dx, 0.47, 0.045)) return [...GREEN, 255];
    return [...WHITE, 255];
  }
  return [...GREEN, 255];
}

function render(size, badge = false) {
  const SS = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb, ca] = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, badge);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a; }
      buf[i + 3] = a / (SS * SS);
    }
  }
  return encodePNG(size, buf);
}

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
for (const s of [16, 32, 48, 64, 128, 256, 512]) fs.writeFileSync(path.join(out, `icon-${s}.png`), render(s));
fs.writeFileSync(path.join(out, 'icon.png'), render(512));
fs.writeFileSync(path.join(out, 'tray.png'), render(64));
fs.writeFileSync(path.join(out, 'tray-unread.png'), render(64, true));
console.log('icons written to', out);
