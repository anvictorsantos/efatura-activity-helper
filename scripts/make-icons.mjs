/**
 * Draws the extension icon without an image dependency: a receipt with a green
 * check badge on a rounded teal tile. Each pixel is 4x4 supersampled so the
 * 16px build is still legible.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, '..', 'public', 'icons');
const assetsDir = join(root, '..', 'assets');
const SIZES = [16, 32, 48, 128];
const MASTER_SIZE = 512;
const SAMPLES = 4;

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const TILE_TOP = [15, 118, 110];
const TILE_BOTTOM = [6, 78, 59];
const RECEIPT = [248, 250, 252];
const INK = [13, 148, 136];
const CHECK_BADGE = [34, 197, 94];
const CHECK_MARK = [255, 255, 255];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function roundRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function circle(x, y, cx, cy, radius) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function segment(x, y, ax, ay, bx, by, width) {
  const vx = bx - ax;
  const vy = by - ay;
  const lengthSquared = vx * vx + vy * vy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / lengthSquared));
  const px = ax + vx * t - x;
  const py = ay + vy * t - y;
  return px * px + py * py <= width * width;
}

function sample(x, y) {
  if (!roundRect(x, y, 0.06, 0.06, 0.94, 0.94, 0.2)) return null;

  const tile = mix(TILE_TOP, TILE_BOTTOM, (y - 0.06) / 0.88);

  if (circle(x, y, 0.71, 0.71, 0.17)) {
    const onCheck =
      segment(x, y, 0.635, 0.71, 0.685, 0.765, 0.034) ||
      segment(x, y, 0.685, 0.765, 0.785, 0.645, 0.034);
    return onCheck ? CHECK_MARK : CHECK_BADGE;
  }

  if (roundRect(x, y, 0.27, 0.16, 0.73, 0.78, 0.035)) {
    const bars = [
      [0.3, 0.335, 0.36, 0.65],
      [0.4, 0.435, 0.36, 0.58],
      [0.5, 0.535, 0.36, 0.54],
    ];
    for (const [top, bottom, left, right] of bars) {
      if (roundRect(x, y, left, top, right, bottom, (bottom - top) / 2)) return INK;
    }
    return RECEIPT;
  }

  return tile;
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          const color = sample(x, y);
          if (color === null) continue;
          red += color[0];
          green += color[1];
          blue += color[2];
          alpha += 1;
        }
      }

      const total = SAMPLES * SAMPLES;
      const at = (py * size + px) * 4;
      if (alpha > 0) {
        pixels[at] = Math.round(red / alpha);
        pixels[at + 1] = Math.round(green / alpha);
        pixels[at + 2] = Math.round(blue / alpha);
        pixels[at + 3] = Math.round((alpha / total) * 255);
      }
    }
  }

  return pixels;
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(outDir, { recursive: true });
await mkdir(assetsDir, { recursive: true });

const master = encodePng(MASTER_SIZE, render(MASTER_SIZE));
await writeFile(join(assetsDir, 'icon.png'), master);
console.log(`assets/icon.png (${master.length} bytes)`);

for (const size of SIZES) {
  const png = encodePng(size, render(size));
  await writeFile(join(outDir, `icon${size}.png`), png);
  console.log(`icons/icon${size}.png (${png.length} bytes)`);
}
