// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appShareUrl,
  canShareLink,
  currentAppUrl,
  shareLink,
  shareMessageKey,
} from '../src/export/share';
import { de, en } from '../src/i18n';

function stubNavigator(key: 'share' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
}

afterEach(() => {
  stubNavigator('share', undefined);
  stubNavigator('clipboard', undefined);
  vi.restoreAllMocks();
});

describe('appShareUrl', () => {
  it('joins origin and path', () => {
    expect(appShareUrl({ origin: 'https://example.github.io', pathname: '/ladelog/' })).toBe(
      'https://example.github.io/ladelog/',
    );
  });

  it('keeps a project subpath, which GitHub Pages needs', () => {
    expect(
      appShareUrl({ origin: 'https://uhardegger.github.io', pathname: '/pwa-ladelog/' }),
    ).toBe('https://uhardegger.github.io/pwa-ladelog/');
  });

  it('drops index.html, which is not how anyone should be given the address', () => {
    expect(
      appShareUrl({ origin: 'https://example.com', pathname: '/ladelog/index.html' }),
    ).toBe('https://example.com/ladelog/');
  });

  it('handles the site root', () => {
    expect(appShareUrl({ origin: 'https://example.com', pathname: '/' })).toBe(
      'https://example.com/',
    );
  });

  it('ignores query and fragment, which are not part of the address', () => {
    // Only origin and pathname are read, so a session's own ?cb= or #tab
    // cannot leak into what is passed on.
    const url = appShareUrl({ origin: 'https://example.com', pathname: '/ladelog/' });
    expect(url).not.toContain('?');
    expect(url).not.toContain('#');
  });

  it('currentAppUrl reads the live location', () => {
    expect(currentAppUrl()).toBe(appShareUrl(window.location));
  });
});

describe('canShareLink', () => {
  it('is false without the Web Share API', () => {
    expect(canShareLink()).toBe(false);
  });

  it('is true when the browser can share', () => {
    stubNavigator('share', async () => {});
    expect(canShareLink()).toBe(true);
  });
});

describe('shareLink - the share sheet', () => {
  it('shares the url, title and text', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    stubNavigator('share', share);

    const result = await shareLink({
      url: 'https://example.com/ladelog/',
      title: 'Ladelog',
      text: 'description',
    });

    expect(result).toEqual({ ok: true, method: 'share' });
    expect(share.mock.calls[0]![0]).toEqual({
      url: 'https://example.com/ladelog/',
      title: 'Ladelog',
      text: 'description',
    });
  });

  it('reports a dismissed sheet as cancelled, not as a failure', async () => {
    stubNavigator('share', async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    const result = await shareLink({ url: 'u', title: 't', text: 'x' });
    expect(result).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('does not copy to the clipboard when the user cancelled', async () => {
    // Copying would act on a decision the user had just declined.
    const writeText = vi.fn(async () => {});
    stubNavigator('clipboard', { writeText });
    stubNavigator('share', async () => {
      throw new DOMException('aborted', 'AbortError');
    });

    await shareLink({ url: 'u', title: 't', text: 'x' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when sharing fails for another reason', async () => {
    const writeText = vi.fn(async () => {});
    stubNavigator('clipboard', { writeText });
    stubNavigator('share', async () => {
      throw new Error('no share target');
    });

    const result = await shareLink({ url: 'u', title: 't', text: 'x' });
    expect(result).toEqual({ ok: true, method: 'clipboard' });
    expect(writeText).toHaveBeenCalledWith('u');
  });
});

describe('shareLink - the clipboard fallback', () => {
  it('copies when the browser cannot share', async () => {
    const writeText = vi.fn(async () => {});
    stubNavigator('clipboard', { writeText });

    const result = await shareLink({ url: 'https://example.com/', title: 't', text: 'x' });
    expect(result).toEqual({ ok: true, method: 'clipboard' });
    expect(writeText).toHaveBeenCalledWith('https://example.com/');
  });

  it('reports unsupported when there is no clipboard either', async () => {
    const result = await shareLink({ url: 'u', title: 't', text: 'x' });
    expect(result).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('reports unsupported when the clipboard is denied', async () => {
    stubNavigator('clipboard', {
      writeText: async () => {
        throw new DOMException('denied', 'NotAllowedError');
      },
    });
    const result = await shareLink({ url: 'u', title: 't', text: 'x' });
    expect(result).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('reports failed when sharing threw and copying also failed', async () => {
    stubNavigator('share', async () => {
      throw new Error('broken');
    });
    stubNavigator('clipboard', {
      writeText: async () => {
        throw new Error('denied');
      },
    });
    const result = await shareLink({ url: 'u', title: 't', text: 'x' });
    expect(result).toMatchObject({ ok: false, reason: 'failed' });
  });
});

describe('shareMessageKey', () => {
  it('maps every outcome to a message', () => {
    expect(shareMessageKey({ ok: true, method: 'share' })).toBe('share.shared');
    expect(shareMessageKey({ ok: true, method: 'clipboard' })).toBe('share.copied');
    expect(shareMessageKey({ ok: false, reason: 'cancelled' })).toBe('share.cancelled');
    expect(shareMessageKey({ ok: false, reason: 'unsupported' })).toBe('share.unsupported');
    expect(shareMessageKey({ ok: false, reason: 'failed' })).toBe('share.failed');
  });

  it('every key it returns exists in both languages', () => {
    const keys = [
      shareMessageKey({ ok: true, method: 'share' }),
      shareMessageKey({ ok: true, method: 'clipboard' }),
      shareMessageKey({ ok: false, reason: 'cancelled' }),
      shareMessageKey({ ok: false, reason: 'unsupported' }),
      shareMessageKey({ ok: false, reason: 'failed' }),
    ];
    for (const key of keys) {
      expect(en[key], key).toBeTruthy();
      expect(de[key], key).toBeTruthy();
    }
  });
});
