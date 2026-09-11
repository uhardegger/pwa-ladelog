/**
 * Passing the app's address to someone else.
 *
 * The address is always on screen as selectable text, not only behind the
 * button: if the share sheet and the clipboard both fail - an old browser, a
 * denied permission, an insecure context - there is still something to read out
 * or copy by hand.
 */
import { useState } from 'react';
import { useLadelog } from '../app/context';
import { canShareLink, currentAppUrl, shareLink, shareMessageKey } from '../export';
import type { MessageKey } from '../i18n';

export function ShareApp() {
  const { t } = useLadelog();
  const [outcome, setOutcome] = useState<{ key: MessageKey; ok: boolean } | null>(null);
  const url = currentAppUrl();

  async function onShare() {
    if (!url) return;
    const result = await shareLink({
      url,
      title: t('app.name'),
      text: t('share.text'),
    });
    setOutcome({ key: shareMessageKey(result), ok: result.ok });
  }

  return (
    <>
      <h2>{t('share.title')}</h2>
      <p className="muted">{t('share.hint')}</p>

      {outcome && (
        <p
          className={outcome.ok ? 'notice notice--ok' : 'notice notice--error'}
          role={outcome.ok ? 'status' : 'alert'}
        >
          {t(outcome.key)}
        </p>
      )}

      {url ? (
        <section className="card">
          {/* Selectable, and wrapping rather than truncating: a link that is
              visibly cut off cannot be read out over the phone. */}
          <p className="share__url">{url}</p>
          <button type="button" className="button--primary" onClick={() => void onShare()}>
            {canShareLink() ? t('share.button') : t('share.copy')}
          </button>
        </section>
      ) : (
        <p className="muted">{t('share.unavailable')}</p>
      )}
    </>
  );
}
