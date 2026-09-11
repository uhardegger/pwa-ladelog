/**
 * Getting a file out of the app on iOS and Android (FR-7).
 *
 * The order is deliberate:
 *   1. Web Share API with a file - on iOS this is the only reliable way to get
 *      a file out of an installed PWA (Mail, Files, a messenger). A blob
 *      download there lands nowhere or opens an empty preview.
 *   2. Blob download via <a download> - the standard path on Android and
 *      desktop.
 *
 * The caller MUST show the result. Per the PRD, an export that fails silently
 * is the single worst defect this app can have (FR-7.3).
 *
 * Results are returned as codes, not prose, so the UI renders them in the
 * user's language.
 */

export type DeliveryMethod = 'share' | 'download';

export type DeliveryResult =
  | { ok: true; method: DeliveryMethod }
  | { ok: false; reason: 'cancelled' | 'unsupported' | 'failed'; detail?: string };

import type { FilePayload } from '../types';

/** Whether this device can share real files, not just text and links. */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  try {
    const probe = new File(['x'], 'probe.txt', { type: 'text/plain' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Must be called from a user gesture, i.e. straight out of a click handler.
 * navigator.share refuses once the transient activation is spent, so nothing
 * slower than building the file itself may be awaited before it.
 */
export async function deliverFile({ filename, blob }: FilePayload): Promise<DeliveryResult> {
  if (canShareFiles()) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      await navigator.share({ files: [file], title: filename });
      return { ok: true, method: 'share' };
    } catch (error) {
      // AbortError means the user closed the share sheet. Not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, reason: 'cancelled' };
      }
      // Anything else: fall back to a download rather than give up.
      return triggerDownload(filename, blob)
        ? { ok: true, method: 'download' }
        : { ok: false, reason: 'failed', detail: String(error) };
    }
  }

  return triggerDownload(filename, blob)
    ? { ok: true, method: 'download' }
    : { ok: false, reason: 'unsupported' };
}

export function triggerDownload(filename: string, blob: Blob): boolean {
  try {
    if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return false;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Clean up late: Safari aborts the download if the object URL is revoked
    // in the same tick.
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 4000);
    return true;
  } catch {
    return false;
  }
}

/** The message key the UI should show for a result (FR-7.3, NFR-7). */
export function deliveryMessageKey(
  result: DeliveryResult,
):
  | 'deliver.shared'
  | 'deliver.downloaded'
  | 'deliver.cancelled'
  | 'deliver.unsupported'
  | 'deliver.failed' {
  if (result.ok) {
    return result.method === 'share' ? 'deliver.shared' : 'deliver.downloaded';
  }
  switch (result.reason) {
    case 'cancelled':
      return 'deliver.cancelled';
    case 'unsupported':
      return 'deliver.unsupported';
    default:
      return 'deliver.failed';
  }
}

/** Reads a picked file as text, for the JSON import (FR-8.2). */
export async function readFileAsText(file: Blob): Promise<string> {
  return file.text();
}
