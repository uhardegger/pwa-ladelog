/**
 * Application state.
 *
 * One provider owns the readings, the settings and the storage status; every
 * screen reads from it. There is no state library: the whole data set is a few
 * hundred rows, held in memory, and re-derived on every change by the pure
 * functions in `src/lib`.
 *
 * The repository is injected so tests can drive the real UI against an
 * in-memory database instead of mocking the components' own logic away.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  loadSettings,
  persistenceState,
  readingsRepository,
  requestPersistence,
  updateSettings,
  type MergeResult,
  type PersistenceState,
  type ReadingsRepository,
} from '../db';
import { translatorFor, type MessageKey, type Translator } from '../i18n';
import { sortChronologically } from '../lib/calc';
import type { Language, Reading, Settings } from '../types';

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface LadelogContextValue {
  readings: Reading[];
  settings: Settings;
  status: LoadStatus;
  persistence: PersistenceState;
  t: Translator;
  lang: Language;
  addReading(reading: Reading): Promise<boolean>;
  saveReading(reading: Reading): Promise<boolean>;
  deleteReading(id: string): Promise<boolean>;
  mergeReadings(incoming: readonly Reading[]): Promise<MergeResult | null>;
  changeSettings(patch: Partial<Settings>): boolean;
}

const LadelogContext = createContext<LadelogContextValue | null>(null);

export interface ProviderProps {
  children: ReactNode;
  /** Overridable for tests; defaults to the real IndexedDB repository. */
  repository?: ReadingsRepository;
  /** Overridable for tests; defaults to localStorage. */
  storage?: Storage | null;
  /** Skips the storage permission request in tests. */
  askForPersistence?: boolean;
}

export function LadelogProvider({
  children,
  repository = readingsRepository,
  storage,
  askForPersistence = true,
}: ProviderProps) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [settings, setSettings] = useState<Settings>(() => loadSettings(storage));
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [persistence, setPersistence] = useState<PersistenceState>('unsupported');

  useEffect(() => {
    let cancelled = false;
    repository
      .list()
      .then((stored) => {
        if (cancelled) return;
        setReadings(sortChronologically(stored));
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  useEffect(() => {
    let cancelled = false;
    // FR-3.4 - asked once at startup, never blocking the form.
    const ask = askForPersistence ? requestPersistence() : persistenceState();
    ask.then((state) => {
      if (!cancelled) setPersistence(state);
    });
    return () => {
      cancelled = true;
    };
  }, [askForPersistence]);

  useEffect(() => {
    // The manifest can only declare one language (FR-10.1, de-CH); the document
    // follows whichever the user actually chose, so assistive technology and
    // the browser's own hyphenation get the right one.
    if (typeof document !== 'undefined') {
      document.documentElement.lang = settings.language === 'de' ? 'de-CH' : 'en';
    }
  }, [settings.language]);

  /** Writes first, updates the screen second - no optimistic UI (NFR-7). */
  const persistReading = useCallback(
    async (reading: Reading) => {
      try {
        await repository.put(reading);
        const stored = await repository.list();
        setReadings(sortChronologically(stored));
        return true;
      } catch {
        return false;
      }
    },
    [repository],
  );

  const deleteReading = useCallback(
    async (id: string) => {
      try {
        await repository.remove(id);
        const stored = await repository.list();
        setReadings(sortChronologically(stored));
        return true;
      } catch {
        return false;
      }
    },
    [repository],
  );

  const mergeReadings = useCallback(
    async (incoming: readonly Reading[]) => {
      try {
        const result = await repository.insertMissing(incoming);
        const stored = await repository.list();
        setReadings(sortChronologically(stored));
        return result;
      } catch {
        return null;
      }
    },
    [repository],
  );

  const changeSettings = useCallback(
    (patch: Partial<Settings>) => {
      const { settings: next, persisted } = updateSettings(patch, storage);
      setSettings(next);
      return persisted;
    },
    [storage],
  );

  const value = useMemo<LadelogContextValue>(
    () => ({
      readings,
      settings,
      status,
      persistence,
      lang: settings.language,
      t: translatorFor(settings.language),
      addReading: persistReading,
      saveReading: persistReading,
      deleteReading,
      mergeReadings,
      changeSettings,
    }),
    [readings, settings, status, persistence, persistReading, deleteReading, mergeReadings, changeSettings],
  );

  return <LadelogContext.Provider value={value}>{children}</LadelogContext.Provider>;
}

export function useLadelog(): LadelogContextValue {
  const value = useContext(LadelogContext);
  if (!value) throw new Error('useLadelog must be used inside a LadelogProvider');
  return value;
}

/** Convenience for components that only need to translate. */
export function useTranslate(): { t: Translator; lang: Language } {
  const { t, lang } = useLadelog();
  return { t, lang };
}

export type { MessageKey };
