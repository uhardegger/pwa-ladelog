/**
 * Storage persistence (FR-3.4).
 *
 * Without a persistence grant the browser may evict IndexedDB under storage
 * pressure, which for this app means silent, unrecoverable data loss (NFR-7).
 * The grant is requested once at startup; the result is informational - the app
 * stays fully usable either way, and the UI can surface a warning when it is
 * denied.
 */

export type PersistenceState =
  /** Data is protected from automatic eviction. */
  | 'persisted'
  /** The browser declined; data may be evicted under storage pressure. */
  | 'denied'
  /** The browser has no Storage API - nothing to ask, nothing to report. */
  | 'unsupported';

function storageManager(): StorageManager | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.storage;
}

/** Reports whether storage is already persistent, without prompting. */
export async function persistenceState(): Promise<PersistenceState> {
  const storage = storageManager();
  if (!storage || typeof storage.persisted !== 'function') return 'unsupported';
  try {
    return (await storage.persisted()) ? 'persisted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/**
 * Asks for persistent storage. Safe to call on every startup: browsers that
 * already granted it answer immediately, and the ones that decide by heuristics
 * (installed as a PWA, engagement) may grant it on a later attempt.
 */
export async function requestPersistence(): Promise<PersistenceState> {
  const storage = storageManager();
  if (!storage || typeof storage.persist !== 'function') return 'unsupported';
  try {
    return (await storage.persist()) ? 'persisted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** Free and used bytes, when the browser reports them. For a storage warning. */
export async function storageEstimate(): Promise<StorageEstimate | null> {
  const storage = storageManager();
  if (!storage || typeof storage.estimate !== 'function') return null;
  try {
    return await storage.estimate();
  } catch {
    return null;
  }
}
