/**
 * Web App Manifest (FR-10.1).
 *
 * Kept as a typed module rather than a JSON file so the build and the unit
 * tests read exactly the same object.
 *
 * `lang` can only hold one value. It stays de-CH, the primary device's
 * language; the bilingual UI switches the document's own `lang` attribute at
 * runtime instead.
 */
export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export interface WebAppManifest {
  name: string;
  short_name: string;
  description: string;
  lang: string;
  dir: 'ltr' | 'rtl';
  start_url: string;
  scope: string;
  display: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  orientation: 'portrait-primary' | 'portrait' | 'any' | 'natural';
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

/** Matches --accent in src/index.css. */
export const THEME_COLOR = '#0b5ed7';
/** Matches --bg in src/index.css, light scheme. */
export const BACKGROUND_COLOR = '#f4f5f7';

export const manifest: WebAppManifest = {
  name: 'Ladelog Garage',
  short_name: 'Ladelog',
  description: 'Offline-Erfassung der Zählerstände für die Garagenabrechnung.',
  lang: 'de-CH',
  dir: 'ltr',
  // Relative, so the app also works from a GitHub Pages project subpath.
  start_url: '.',
  scope: '.',
  display: 'standalone',
  // The app is used one-handed in portrait (NFR-3), but locking the
  // orientation outright would fight a user who has rotation locked off.
  orientation: 'portrait-primary',
  theme_color: THEME_COLOR,
  background_color: BACKGROUND_COLOR,
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    {
      src: 'icon-maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};
