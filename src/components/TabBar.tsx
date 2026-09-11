/**
 * Bottom tab bar.
 *
 * At the bottom because the app is used one-handed in portrait (NFR-3), and
 * because the capture form must own the top of the screen. Each tab is 56 px
 * tall, above the 44 px minimum.
 *
 * Six tabs is the practical limit at this width: on a 375 px screen each gets
 * about 62 px, so the labels are small and allowed to ellipsise rather than
 * wrap or overflow. The visible text is the accessible name - no aria-label
 * shortcut - so voice control can address a tab by the word that is on it.
 */
import type { MessageKey } from '../i18n';
import { useLadelog } from '../app/context';

export type TabId = 'capture' | 'list' | 'overview' | 'export' | 'share' | 'settings';

/**
 * Plain glyphs rather than emoji: they inherit the text colour, so the active
 * tab actually looks active, and they render identically on both platforms.
 * Export points down (data leaving as a file), share points outward (the
 * address leaving for someone else).
 */
const TABS: Array<{ id: TabId; label: MessageKey; icon: string }> = [
  { id: 'capture', label: 'tabs.capture', icon: '⊕' },
  { id: 'list', label: 'tabs.list', icon: '≡' },
  { id: 'overview', label: 'tabs.overview', icon: '▦' },
  { id: 'export', label: 'tabs.export', icon: '↓' },
  { id: 'share', label: 'tabs.share', icon: '↗' },
  { id: 'settings', label: 'tabs.settings', icon: '⚙' },
];

interface Props {
  active: TabId;
  onSelect(tab: TabId): void;
}

export function TabBar({ active, onSelect }: Props) {
  const { t } = useLadelog();
  return (
    <nav className="tabs" aria-label={t('app.name')}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="tab"
          aria-current={active === tab.id ? 'page' : undefined}
          onClick={() => onSelect(tab.id)}
        >
          <span className="tab__icon" aria-hidden="true">
            {tab.icon}
          </span>
          <span className="tab__label">{t(tab.label)}</span>
        </button>
      ))}
    </nav>
  );
}
