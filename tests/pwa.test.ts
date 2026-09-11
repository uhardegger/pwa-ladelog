import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_COLOR,
  THEME_COLOR,
  manifest,
} from '../src/pwa/manifest';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** Reads width, height and colour type straight out of a PNG's IHDR chunk. */
function pngHeader(path: string) {
  const buf = readFileSync(join(root, path));
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const validSignature = signature.every((byte, i) => buf[i] === byte);
  return {
    validSignature,
    // IHDR data starts at byte 16, after the signature and the chunk header.
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25],
    bytes: buf.length,
  };
}

describe('web app manifest (FR-10.1)', () => {
  it('declares a name and a short name', () => {
    expect(manifest.name).toBe('Ladelog Garage');
    expect(manifest.short_name).toBe('Ladelog');
    // Home screens truncate beyond roughly twelve characters.
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it('launches without browser chrome', () => {
    expect(manifest.display).toBe('standalone');
  });

  it('declares a theme and a background colour', () => {
    expect(manifest.theme_color).toBe(THEME_COLOR);
    expect(manifest.background_color).toBe(BACKGROUND_COLOR);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('declares the language the PRD specifies', () => {
    // Only one value is possible here; the document's own lang attribute
    // follows the user's choice at runtime.
    expect(manifest.lang).toBe('de-CH');
  });

  it('uses relative start_url and scope, so a project subpath works', () => {
    expect(manifest.start_url).toBe('.');
    expect(manifest.scope).toBe('.');
    expect(manifest.start_url.startsWith('/')).toBe(false);
  });

  it('offers 192, 512 and a maskable icon', () => {
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('references every icon by a relative path', () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/'), icon.src).toBe(false);
      expect(icon.src.startsWith('http'), icon.src).toBe(false);
      expect(icon.type).toBe('image/png');
    }
  });
});

describe('icon files', () => {
  const files = [
    { path: 'public/icon-192.png', size: 192 },
    { path: 'public/icon-512.png', size: 512 },
    { path: 'public/icon-maskable-512.png', size: 512 },
    { path: 'public/apple-touch-icon.png', size: 180 },
    { path: 'public/favicon-32.png', size: 32 },
  ];

  it.each(files)('$path is a real PNG of the declared size', ({ path, size }) => {
    const header = pngHeader(path);
    expect(header.validSignature).toBe(true);
    expect(header.width).toBe(size);
    expect(header.height).toBe(size);
    expect(header.bitDepth).toBe(8);
    expect(header.colorType).toBe(6); // truecolour with alpha
  });

  it.each(files)('$path actually contains a drawing', ({ path }) => {
    // A blank canvas would compress to almost nothing.
    expect(pngHeader(path).bytes).toBeGreaterThan(200);
  });

  it('every icon the manifest names exists on disk', () => {
    for (const icon of manifest.icons) {
      expect(() => pngHeader(`public/${icon.src}`), icon.src).not.toThrow();
    }
  });

  it('stays small enough to precache without thought', () => {
    const total = files.reduce((sum, f) => sum + pngHeader(f.path).bytes, 0);
    expect(total).toBeLessThan(100_000);
  });
});

describe('no external requests in the critical path (FR-3.5, NFR-5)', () => {
  const html = read('index.html');
  const css = read('src/index.css');

  it('the document loads nothing from another origin', () => {
    const external = [...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]*"/g)];
    expect(external.map((m) => m[0])).toEqual([]);
  });

  it('the stylesheet imports nothing and fetches nothing', () => {
    expect(css).not.toMatch(/@import/);
    expect(css).not.toMatch(/url\(\s*['"]?https?:/);
  });

  it('uses system fonts rather than a downloaded family', () => {
    expect(css).toMatch(/font-family:\s*system-ui/);
  });

  it('has no analytics or telemetry hook', () => {
    for (const forbidden of ['googletagmanager', 'google-analytics', 'gtag(', 'plausible', 'sentry']) {
      expect(html.toLowerCase(), forbidden).not.toContain(forbidden);
    }
  });
});

describe('the document head', () => {
  const html = read('index.html');

  it('declares the viewport with safe-area support', () => {
    expect(html).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
  });

  it('carries an apple-touch-icon, which iOS uses instead of the manifest', () => {
    expect(html).toMatch(/rel="apple-touch-icon"/);
  });

  it('declares a theme colour for both colour schemes', () => {
    expect(html).toMatch(/name="theme-color"[^>]*prefers-color-scheme: light/);
    expect(html).toMatch(/name="theme-color"[^>]*prefers-color-scheme: dark/);
  });

  it('uses the same light theme colour as the manifest', () => {
    expect(html).toContain(`content="${THEME_COLOR}"`);
  });

  it('starts in the language the manifest declares', () => {
    expect(html).toMatch(/<html lang="de-CH">/);
  });

  it('names the app for the iOS home screen', () => {
    expect(html).toMatch(/name="apple-mobile-web-app-title" content="Ladelog"/);
  });
});

describe('legibility in a dark garage (NFR-4, NFR-6)', () => {
  const css = read('src/index.css');

  it('defines a dark colour scheme', () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)/);
    expect(css).toMatch(/color-scheme:\s*light dark/);
  });

  it('uses no font weight below 400', () => {
    const weights = [...css.matchAll(/font-weight:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(weights.length).toBeGreaterThan(0);
    for (const weight of weights) expect(weight).toBeGreaterThanOrEqual(400);
  });

  it('respects a reduced-motion preference', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('keeps a visible keyboard focus ring', () => {
    expect(css).toMatch(/:focus-visible/);
    expect(css).not.toMatch(/outline:\s*none/);
  });

  it('sets a 44px minimum target size', () => {
    expect(css).toMatch(/--tap:\s*44px/);
    expect(css).toMatch(/min-height:\s*var\(--tap\)/);
  });

  it('sets a base font size no smaller than 16px', () => {
    const bodySize = /body\s*\{[^}]*font-size:\s*(\d+)px/.exec(css);
    expect(Number(bodySize?.[1])).toBeGreaterThanOrEqual(16);
  });
});
