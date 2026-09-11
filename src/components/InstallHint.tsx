/**
 * Installation prompts (FR-10.2, FR-10.3).
 *
 * Android fires `beforeinstallprompt`, which can be deferred and replayed from
 * a button. iOS Safari fires nothing at all, so the only option is to explain
 * the Share -> Add to Home Screen gesture. Both are dismissible for good; the
 * app works perfectly well in a browser tab (FR-10.4).
 */
import { useEffect, useState } from 'react';
import { useLadelog } from '../app/context';

const DISMISSED_KEY = 'ladelog.installHintDismissed';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as a Mac; a touch-capable "Mac" is an iPad.
  const iPadOS = ua.includes('Macintosh') && navigator.maxTouchPoints > 1;
  return (iOS || iPadOS) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  return (navigator as { standalone?: boolean }).standalone === true;
}

function wasDismissed(storage: Storage | null): boolean {
  try {
    return storage?.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function InstallHint({ storage }: { storage?: Storage | null }) {
  const { t } = useLadelog();
  const store = storage === undefined ? safeLocalStorage() : storage;

  const [dismissed, setDismissed] = useState(() => wasDismissed(store));
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      // Keep the event so the prompt can be raised from a real button instead
      // of the browser's own banner.
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (dismissed || isStandalone()) return null;

  const showIosHint = prompt === null && isIosSafari();
  if (!prompt && !showIosHint) return null;

  function dismiss() {
    try {
      store?.setItem(DISMISSED_KEY, '1');
    } catch {
      // A refused write only means the hint reappears next time. Harmless.
    }
    setDismissed(true);
  }

  return (
    <div className="notice" role="status">
      {prompt ? (
        <>
          <div className="notice__actions">
            <button
              type="button"
              onClick={() => {
                void prompt.prompt();
                dismiss();
              }}
            >
              {t('install.android')}
            </button>
            <button type="button" onClick={dismiss}>
              {t('install.dismiss')}
            </button>
          </div>
        </>
      ) : (
        <>
          {t('install.ios')}
          <div className="notice__actions">
            <button type="button" onClick={dismiss}>
              {t('install.dismiss')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
