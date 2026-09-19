/**
 * Rasterise the app icon to PNG.
 *
 * PWA install prompts and the iOS home screen both want PNGs, and adding an
 * image toolchain for four static files would be silly. This draws the mark
 * directly — rounded rectangle, two stroked curves, one dot — by measuring each
 * pixel's distance to a sampled path, then encodes the buffer with Node's own
 * zlib. No dependencies, deterministic output.
 *
 *   node scripts/generate-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const INK = [0x0f, 0x14, 0x19];
const ACCENT = [0x34, 0xd3, 0x99];

/** Quadratic/cubic path sampling in the 40×40 design space. */
function cubic(p0, p1, p2, p3, steps = 28) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return points;
}

// Mirrors the SVG in src/ui/brand/logo.tsx.
const STROKE_MAIN = [
  ...cubic([14, 28.5], [14, 24.5], [19.2, 24.1], [19.2, 20.4]),
  ...cubic([19.2, 20.4], [19.2, 18.2], [17.3, 17.4], [17.3, 15.3]),
  ...cubic([17.3, 15.3], [17.3, 13.4], [18.8, 11.9], [20.9, 11.9]),
];
const STROKE_SOFT = cubic([22.6, 28.5], [22.6, 25.4], [26.2, 24.9], [26.2, 22.1]);

/** Design-space bounds of everything drawn in accent, plus stroke slack. */
const MARK_BOUNDS = (() => {
  const points = [...STROKE_MAIN, ...STROKE_SOFT, [26.4, 15.2]];
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const slack = 3;
  return {
    minX: Math.min(...xs) - slack,
    maxX: Math.max(...xs) + slack,
    minY: Math.min(...ys) - slack,
    maxY: Math.max(...ys) + slack,
  };
})();

function distanceToPolyline(x, y, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const distance = Math.hypot(x - px, y - py);
    if (distance < best) best = distance;
  }
  return best;
}

function roundedRectCoverage(x, y, size, radius) {
  const inner = size - radius;
  const cx = Math.min(Math.max(x, radius), inner);
  const cy = Math.min(Math.max(y, radius), inner);
  const distance = Math.hypot(x - cx, y - cy);
  return radius - distance;
}

function blend(base, layer, alpha) {
  return [
    Math.round(base[0] * (1 - alpha) + layer[0] * alpha),
    Math.round(base[1] * (1 - alpha) + layer[1] * alpha),
    Math.round(base[2] * (1 - alpha) + layer[2] * alpha),
  ];
}

/** 2×2 supersampling gives clean edges without a rasteriser. */
function render(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 40;
  // A maskable icon must survive a circular crop, so the mark is inset.
  const pad = maskable ? size * 0.1 : 0;
  const box = size - pad * 2;
  const radius = maskable ? size : box * (11 / 40);
  const strokeHalf = (2.6 / 2) * (box / 40);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const sx = px + ox;
        const sy = py + oy;

        const localX = sx - pad;
        const localY = sy - pad;
        const cover = roundedRectCoverage(localX, localY, box, Math.min(radius, box / 2));
        const inside = Math.max(0, Math.min(1, cover + 0.5));

        if (inside <= 0) continue;

        let colour = INK;
        const unit = box / 40;
        const dx = localX / unit;
        const dy = localY / unit;

        // Skip the expensive path distance for the ~70% of pixels that are
        // nowhere near the mark.
        if (
          dx >= MARK_BOUNDS.minX &&
          dx <= MARK_BOUNDS.maxX &&
          dy >= MARK_BOUNDS.minY &&
          dy <= MARK_BOUNDS.maxY
        ) {
          const dMain = distanceToPolyline(dx, dy, STROKE_MAIN) * unit;
          const dSoft = distanceToPolyline(dx, dy, STROKE_SOFT) * unit;
          const dDot = (Math.hypot(dx - 26.4, dy - 15.2) - 2) * unit;

          const mainAlpha = Math.max(0, Math.min(1, strokeHalf - dMain + 0.5));
          const softAlpha = Math.max(0, Math.min(1, strokeHalf - dSoft + 0.5)) * 0.55;
          const dotAlpha = Math.max(0, Math.min(1, -dDot + 0.5));

          const accentAlpha = Math.max(mainAlpha, softAlpha, dotAlpha);
          if (accentAlpha > 0) colour = blend(INK, ACCENT, accentAlpha);
        }

        r += colour[0] * inside;
        g += colour[1] * inside;
        b += colour[2] * inside;
        a += inside;
      }

      const offset = (py * size + px) * 4;
      if (a > 0) {
        pixels[offset] = Math.round(r / a);
        pixels[offset + 1] = Math.round(g / a);
        pixels[offset + 2] = Math.round(b / a);
        pixels[offset + 3] = Math.round((a / 4) * 255);
      }
    }
  }

  return pixels;
}

// ── Minimal PNG encoder ─────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Emit ────────────────────────────────────────────────────────────────────

const outputDir = path.join(process.cwd(), 'public', 'icons');
mkdirSync(outputDir, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-32.png', size: 32 },
];

for (const target of targets) {
  const pixels = render(target.size, { maskable: target.maskable });
  writeFileSync(path.join(outputDir, target.file), encodePng(target.size, pixels));
  console.log(`✓ ${target.file} (${target.size}×${target.size})`);
}
