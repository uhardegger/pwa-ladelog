/**
 * The application shell.
 *
 * The capture form is the landing screen with no splash, no start page and no
 * login (FR-1): opening the app already puts the cursor in the meter field.
 * Everything else lives behind the tab bar, which keeps the two-interaction
 * capture path of AC-3 intact.
 */
import { useState } from 'react';
import { useLadelog } from '../app/context';
import { needsInitialSetup } from '../db/settings';
import { CaptureForm } from './CaptureForm';
import { ExportScreen } from './ExportScreen';
import { InstallHint } from './InstallHint';
import { MonthlyOverview } from './MonthlyOverview';
import { ReadingList } from './ReadingList';
import { SettingsScreen } from './SettingsScreen';
import { SetupScreen } from './SetupScreen';
import { TabBar, type TabId } from './TabBar';

export function App() {
  const { status, settings, persistence, t } = useLadelog();
  const [tab, setTab] = useState<TabId>('capture');
  const [storageWarningHidden, setStorageWarningHidden] = useState(false);
  /**
   * Decided once, at startup. If this tracked the name continuously, clearing
   * the name field in the settings would throw the user back to the setup
   * screen mid-edit, making it impossible to correct a name by retyping it.
   */
  const [setupDone, setSetupDone] = useState(() => !needsInitialSetup(settings));

  if (!setupDone) return <SetupScreen onDone={() => setSetupDone(true)} />;

  if (status === 'loading') {
    return (
      <main className="app__main">
        <p role="status">{t('app.loading')}</p>
      </main>
    );
  }

  if (status === 'error') {
    // Saying nothing here would invite capturing into a broken store and
    // believing it worked, which is the NFR-7 failure exactly.
    return (
      <main className="app__main">
        <p className="notice notice--error" role="alert">
          {t('app.loadFailed')}
        </p>
      </main>
    );
  }

  const showStorageWarning = persistence === 'denied' && !storageWarningHidden;

  return (
    <div className="app">
      <main className="app__main">
        <InstallHint />

        {/* FR-3.4 - the data is the only copy, so an unprotected store is
            worth one dismissible line (NFR-7). */}
        {showStorageWarning && (
          <div className="notice notice--warning" role="status">
            {t('storage.warning')}
            <div className="notice__actions">
              <button type="button" onClick={() => setStorageWarningHidden(true)}>
                {t('common.close')}
              </button>
            </div>
          </div>
        )}

        {tab === 'capture' && <CaptureForm />}
        {tab === 'list' && <ReadingList />}
        {tab === 'overview' && <MonthlyOverview />}
        {tab === 'export' && <ExportScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      <TabBar active={tab} onSelect={setTab} />
    </div>
  );
}
