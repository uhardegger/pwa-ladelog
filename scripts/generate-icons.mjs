/**
 * Generates the PWA icons (FR-10.1).
 *
 * Written against Node's own zlib rather than an image library: the icons are
 * flat shapes, the PRD asks for as few dependencies as possible (section 8),
 * and committing the generator keeps them reproducible.
 *
 * Run with `npm run icons`. The output is committed, so a normal build needs
 * neither this script nor a rasteriser.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** Brand colours, kept in step with the --accent token in src/index.css. */
const BACKGROUND = [11, 94, 215, 255];
const FOREGROUND = [255, 255, 255, 255];

/**
 * A lightning bolt in a 0..1 coordinate space, drawn clockwise.
 * Kept as a polygon so it scales to any size without an SVG rasteriser.
 */
const BOLT = [
  [0.56, 0.04],
  [0.24, 0.57],
  [0.45, 0.57],
  [0.38, 0.96],
  [0.76, 0.43],
  [0.55, 0.43],
];

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Distance-based rounded-square test, in the same 0..1 space. */
function inRoundedSquare(x, y, radius) {
  const dx = Math.max(radius - x, 0, x - (1 - radius));
  const dy = Math.max(radius - y, 0, y - (1 - radius));
  if (dx === 0 || dy === 0) return true;
  return Math.hypot(dx, dy) <= radius;
}

/**
 * Renders one icon.
 *
 * @param size      pixel size, square
 * @param scale     how much of the canvas the bolt occupies
 * @param cornerR   corner radius in 0..1; 0 for maskable icons, which the
 *                  platform masks itself and which must therefore be full-bleed
 */
function renderIcon(size, { scale, cornerR }) {
  const pixels = Buffer.alloc(size * size * 4);
  const SAMPLES = 4; // 4x4 supersampling, enough to hide the stair-stepping
  const offset = (1 - scale) / 2;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgHits = 0;
      let fgHits = 0;

      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (cornerR > 0 && !inRoundedSquare(x, y, cornerR)) continue;
          bgHits++;
          const bx = (x - offset) / scale;
          const by = (y - offset) / scale;
          if (bx >= 0 && bx <= 1 && by >= 0 && by <= 1 && pointInPolygon(bx, by, BOLT)) {
            fgHits++;
          }
        }
      }

      const total = SAMPLES * SAMPLES;
      const coverage = bgHits / total;
      const boltShare = bgHits === 0 ? 0 : fgHits / bgHits;
      const i = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) {
        pixels[i + c] = Math.round(
          BACKGROUND[c] * (1 - boltShare) + FOREGROUND[c] * boltShare,
        );
      }
      pixels[i + 3] = Math.round(255 * coverage);
    }
  }

  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes RGBA pixels as a PNG. Colour type 6, no interlacing, filter 0. */
function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type "none" for every scanline
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 0.72, cornerR: 0.22 },
  { file: 'icon-512.png', size: 512, scale: 0.72, cornerR: 0.22 },
  // Maskable icons are cropped by the platform, so the bolt stays inside the
  // 80% safe zone and the background bleeds to the edges.
  { file: 'icon-maskable-512.png', size: 512, scale: 0.52, cornerR: 0 },
  // iOS ignores the manifest and uses this one for the home screen.
  { file: 'apple-touch-icon.png', size: 180, scale: 0.72, cornerR: 0 },
  { file: 'favicon-32.png', size: 32, scale: 0.78, cornerR: 0.15 },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const { file, size, scale, cornerR } of ICONS) {
  const png = encodePng(size, renderIcon(size, { scale, cornerR }));
  writeFileSync(join(OUT_DIR, file), png);
  console.log(`${file}  ${size}x${size}  ${png.length} bytes`);
}
