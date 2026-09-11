// vitest/config re-exports Vite's defineConfig with the `test` block typed.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { manifest } from './src/pwa/manifest.js';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // A new deployment is installed in the background and takes over on the
      // next start (FR-3.3). No update prompt - see src/pwa/register.ts.
      registerType: 'autoUpdate',
      manifest,
      // The icons the manifest declares are precached by the plugin itself.
      // Only the two it cannot know about are listed here.
      includeAssets: ['apple-touch-icon.png', 'favicon-32.png'],
      workbox: {
        // Everything the app needs is precached, so the shell is served
        // cache-first and the app opens with no connection at all (FR-3.1).
        // PNGs are deliberately absent: they arrive via the manifest and
        // includeAssets, and matching them here too would precache each icon
        // twice.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        // No runtimeCaching: there is nothing to fetch at runtime. The app
        // makes no network request in the critical path (FR-3.5).
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  // Relative base so the build also works from a GitHub Pages project subpath.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    // Node by default; DOM-dependent suites opt in with
    // `// @vitest-environment jsdom` at the top of the file.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
  },
});
