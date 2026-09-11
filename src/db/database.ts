/**
 * IndexedDB setup (FR-3.2).
 *
 * Readings live in IndexedDB because they are the data whose loss would be
 * unrecoverable (NFR-7); settings live in localStorage and are not touched here.
 *
 * The schema version below belongs to IndexedDB's own upgrade mechanism. It is
 * deliberately separate from `SCHEMA_VERSION` in `src/types`, which versions the
 * JSON export bundle: a local index can be added without changing the exchange
 * format, and vice versa.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Reading } from '../types';

export const DB_NAME = 'ladelog';
export const DB_VERSION = 1;

export const READINGS_STORE = 'readings';
/** Index over `Reading.date`, giving chronological reads without a full sort. */
export const BY_DATE_INDEX = 'by-date';

export interface LadelogSchema extends DBSchema {
  [READINGS_STORE]: {
    key: string;
    value: Reading;
    indexes: { [BY_DATE_INDEX]: string };
  };
}

export type LadelogDatabase = IDBPDatabase<LadelogSchema>;

/** True when this environment can persist at all - guards SSR and old browsers. */
export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

interface OpenOptions {
  /** Called when another tab is waiting to upgrade this database. */
  onBlocking?: () => void;
  /** Called when the browser drops the connection, e.g. on storage eviction. */
  onTerminated?: () => void;
}

/**
 * Opens (and if needed creates or migrates) the database.
 *
 * `name` is parameterised so each test gets an isolated database instead of
 * sharing one global instance.
 */
export function openLadelogDatabase(
  name: string = DB_NAME,
  options: OpenOptions = {},
): Promise<LadelogDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }

  return openDB<LadelogSchema>(name, DB_VERSION, {
    upgrade(database, oldVersion) {
      // A fall-through ladder, so a future version only appends a branch and
      // existing installations migrate one step at a time.
      if (oldVersion < 1) {
        const store = database.createObjectStore(READINGS_STORE, { keyPath: 'id' });
        store.createIndex(BY_DATE_INDEX, 'date');
      }
    },
    blocking: options.onBlocking,
    terminated: options.onTerminated,
  });
}

let shared: LadelogDatabase | null = null;
let opening: Promise<LadelogDatabase> | null = null;

/**
 * The application-wide database handle, opened on first use.
 *
 * Concurrent callers share one open request. A failed open is not cached, so a
 * transient failure can be retried by simply calling again.
 */
export function getDatabase(): Promise<LadelogDatabase> {
  if (shared) return Promise.resolve(shared);
  opening ??= openLadelogDatabase(DB_NAME, {
    // Release the handle so another tab's upgrade is not blocked; the next
    // repository call reopens the database.
    onBlocking: closeDatabase,
    onTerminated: closeDatabase,
  })
    .then((opened) => {
      shared = opened;
      opening = null;
      return opened;
    })
    .catch((error: unknown) => {
      opening = null;
      throw error;
    });
  return opening;
}

/** Closes the shared handle. Used on teardown and by the blocking handlers. */
export function closeDatabase(): void {
  shared?.close();
  shared = null;
  opening = null;
}
