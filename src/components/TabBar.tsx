/**
 * Bottom tab bar.
 *
 * At the bottom because the app is used one-handed in portrait (NFR-3), and
 * because the capture form must own the top of the screen. Each tab is 56 px
 * tall, above the 44 px minimum.
 */
import type { MessageKey } from '../i18n';
import { useLadelog } from '../app/context';

export type TabId = 'capture' | 'list' | 'overview' | 'export' | 'settings';

const TABS: Array<{ id: TabId; label: MessageKey; icon: string }> = [
  { id: 'capture', label: 'tabs.capture', icon: '⊕' },
  { id: 'list', label: 'tabs.list', icon: '≡' },
  { id: 'overview', label: 'tabs.overview', icon: '▦' },
  { id: 'export', label: 'tabs.export', icon: '↗' },
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
          {t(tab.label)}
        </button>
      ))}
    </nav>
  );
}
