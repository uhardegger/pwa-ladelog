/**
 * Service worker registration (FR-3.3).
 *
 * `registerType: 'autoUpdate'` in the Vite config means Workbox installs a new
 * build in the background and takes over on the next start. No update prompt:
 * this app has one user, and an unexpected dialog in a garage at the moment of
 * capture is worse than a build that lands a launch late.
 *
 * Registration is deliberately not awaited. The app must be usable the instant
 * it renders, and it works perfectly well without a service worker (FR-10.4).
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  void import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {
      // A browser that refuses service workers still gets a working app; only
      // offline launching is lost, and there is nothing to tell the user.
    });
}
