/**
 * Sharing the app's own address (not its data - that is deliver.ts).
 *
 * Three levels, so this can never be a dead end:
 *   1. Web Share API with a URL - the system share sheet on phones.
 *   2. Clipboard, where sharing is unavailable (most desktop browsers).
 *   3. The caller shows the address as selectable text regardless, so it can
 *      be copied by hand even when both of the above fail.
 *
 * Like every other outward action in this app, the result is reported rather
 * than assumed (NFR-7): a share that quietly did nothing is indistinguishable
 * from one that worked.
 */

export type ShareMethod = 'share' | 'clipboard';

export type ShareLinkResult =
  | { ok: true; method: ShareMethod }
  | { ok: false; reason: 'cancelled' | 'unsupported' | 'failed'; detail?: string };

/**
 * The address to pass on: origin and path, without any query or fragment the
 * current session happens to carry, and without the index.html some servers
 * expose. Pure, so it is testable without a browser.
 */
export function appShareUrl(location: { origin: string; pathname: string }): string {
  const path = location.pathname.replace(/index\.html$/, '');
  return `${location.origin}${path}`;
}

/** Reads the current address, or null outside a browser. */
export function currentAppUrl(): string | null {
  if (typeof window === 'undefined' || !window.location) return null;
  return appShareUrl(window.location);
}

/** Whether the system share sheet is available for a plain link. */
export function canShareLink(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export interface LinkPayload {
  url: string;
  title: string;
  text: string;
}

/**
 * Must be called straight from a click handler: navigator.share refuses once
 * the transient activation from the tap has been spent.
 */
export async function shareLink({ url, title, text }: LinkPayload): Promise<ShareLinkResult> {
  if (canShareLink()) {
    try {
      await navigator.share({ url, title, text });
      return { ok: true, method: 'share' };
    } catch (error) {
      // AbortError means the sheet was dismissed. Not a failure, and falling
      // back to the clipboard here would act on a decision just declined.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, reason: 'cancelled' };
      }
      return copyToClipboard(url).then((copied) =>
        copied
          ? ({ ok: true, method: 'clipboard' } as const)
          : ({ ok: false, reason: 'failed', detail: String(error) } as const),
      );
    }
  }

  return (await copyToClipboard(url))
    ? { ok: true, method: 'clipboard' }
    : { ok: false, reason: 'unsupported' };
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Denied permission, or an insecure context. The caller still shows the
    // address as selectable text.
    return false;
  }
}

/** The message key the UI should show for a result. */
export function shareMessageKey(
  result: ShareLinkResult,
):
  | 'share.shared'
  | 'share.copied'
  | 'share.cancelled'
  | 'share.unsupported'
  | 'share.failed' {
  if (result.ok) {
    return result.method === 'share' ? 'share.shared' : 'share.copied';
  }
  switch (result.reason) {
    case 'cancelled':
      return 'share.cancelled';
    case 'unsupported':
      return 'share.unsupported';
    default:
      return 'share.failed';
  }
}
