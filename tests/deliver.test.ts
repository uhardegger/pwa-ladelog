// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canShareFiles,
  deliverFile,
  deliveryMessageKey,
  triggerDownload,
} from '../src/export/deliver';
import { de, en } from '../src/i18n';

const payload = () => ({
  filename: 'Ladelog_2026-01-01_bis_2026-12-31.xlsx',
  blob: new Blob(['content'], { type: 'application/octet-stream' }),
});

/** Installs a navigator.share / canShare pair for the duration of one test. */
function stubShare(options: {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}) {
  for (const [key, value] of Object.entries(options)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  }
}

function removeShare() {
  for (const key of ['share', 'canShare']) {
    Object.defineProperty(navigator, key, {
      value: undefined,
      configurable: true,
      writable: true,
    });
  }
}

afterEach(() => {
  removeShare();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('canShareFiles (FR-7.1)', () => {
  it('is false when the browser has no Web Share API', () => {
    removeShare();
    expect(canShareFiles()).toBe(false);
  });

  it('is false when the browser shares links but not files', () => {
    stubShare({ share: async () => {}, canShare: () => false });
    expect(canShareFiles()).toBe(false);
  });

  it('is true when the browser accepts a file', () => {
    stubShare({ share: async () => {}, canShare: (data) => Array.isArray(data.files) });
    expect(canShareFiles()).toBe(true);
  });

  it('is false rather than throwing when canShare itself throws', () => {
    stubShare({
      share: async () => {},
      canShare: () => {
        throw new Error('not allowed');
      },
    });
    expect(canShareFiles()).toBe(false);
  });
});

describe('deliverFile - the share path (FR-7.1)', () => {
  it('shares the file and reports the method', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    stubShare({ share, canShare: () => true });

    const result = await deliverFile(payload());

    expect(result).toEqual({ ok: true, method: 'share' });
    expect(share).toHaveBeenCalledTimes(1);
    const data = share.mock.calls[0]![0];
    expect(data.files?.[0]?.name).toBe(payload().filename);
  });

  it('reports a cancelled share sheet as cancelled, not as a failure', async () => {
    stubShare({
      canShare: () => true,
      share: async () => {
        throw new DOMException('The user aborted a request.', 'AbortError');
      },
    });

    expect(await deliverFile(payload())).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('does not silently fall back to a download when the user cancelled', async () => {
    // Falling back here would deliver a file the user just declined to send.
    stubShare({
      canShare: () => true,
      share: async () => {
        throw new DOMException('aborted', 'AbortError');
      },
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    await deliverFile(payload());
    expect(click).not.toHaveBeenCalled();
  });

  it('falls back to a download when sharing fails for any other reason', async () => {
    stubShare({
      canShare: () => true,
      share: async () => {
        throw new Error('share target unavailable');
      },
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    expect(await deliverFile(payload())).toEqual({ ok: true, method: 'download' });
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('deliverFile - the download path (FR-7.2)', () => {
  it('downloads when the device cannot share files', async () => {
    removeShare();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    expect(await deliverFile(payload())).toEqual({ ok: true, method: 'download' });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('sets the download attribute to the file name', async () => {
    removeShare();
    let captured: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      captured = this;
    });

    await deliverFile(payload());

    expect(captured).not.toBeNull();
    expect(captured!.download).toBe(payload().filename);
  });

  it('reports unsupported when even the download cannot be started', async () => {
    removeShare();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(await deliverFile(payload())).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('cleans up the anchor and the object URL after a delay', async () => {
    vi.useFakeTimers();
    try {
      const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      triggerDownload('x.json', new Blob(['{}']));
      // Revoking in the same tick aborts the download in Safari.
      expect(revoke).not.toHaveBeenCalled();

      vi.advanceTimersByTime(4000);
      expect(revoke).toHaveBeenCalledTimes(1);
      expect(document.querySelectorAll('a')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns false rather than throwing when the document refuses', () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('nope');
    });
    expect(triggerDownload('x.json', new Blob(['{}']))).toBe(false);
  });
});

describe('deliveryMessageKey (FR-7.3, NFR-7)', () => {
  it('maps every outcome to a message key', () => {
    expect(deliveryMessageKey({ ok: true, method: 'share' })).toBe('deliver.shared');
    expect(deliveryMessageKey({ ok: true, method: 'download' })).toBe('deliver.downloaded');
    expect(deliveryMessageKey({ ok: false, reason: 'cancelled' })).toBe('deliver.cancelled');
    expect(deliveryMessageKey({ ok: false, reason: 'unsupported' })).toBe(
      'deliver.unsupported',
    );
    expect(deliveryMessageKey({ ok: false, reason: 'failed' })).toBe('deliver.failed');
  });

  it('every key it can return exists in both catalogues', () => {
    const keys = [
      deliveryMessageKey({ ok: true, method: 'share' }),
      deliveryMessageKey({ ok: true, method: 'download' }),
      deliveryMessageKey({ ok: false, reason: 'cancelled' }),
      deliveryMessageKey({ ok: false, reason: 'unsupported' }),
      deliveryMessageKey({ ok: false, reason: 'failed' }),
    ];
    for (const key of keys) {
      expect(en[key], key).toBeTruthy();
      expect(de[key], key).toBeTruthy();
    }
  });

  it('never returns nothing - a silent export is the worst defect (FR-7.3)', () => {
    const outcomes = [
      { ok: true, method: 'share' },
      { ok: true, method: 'download' },
      { ok: false, reason: 'cancelled' },
      { ok: false, reason: 'unsupported' },
      { ok: false, reason: 'failed' },
    ] as const;
    for (const outcome of outcomes) {
      expect(deliveryMessageKey(outcome)).toMatch(/^deliver\./);
    }
  });
});
