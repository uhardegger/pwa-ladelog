/**
 * Persistence of readings (FR-3.1, FR-4.2, FR-8.2).
 *
 * Everything above this module - calculations, export, UI - works on plain
 * `Reading` arrays and never touches `idb` directly. That keeps the derivation
 * rules (consumption, monthly totals, import deduplication) pure and cheap to
 * test, and confines storage concerns to this file.
 *
 * There is deliberately no `latest()` fast path over the date index: "latest"
 * means last by date *and* capture timestamp (PRD section 6), which the index
 * alone cannot express. With a handful of readings per month, reading the whole
 * store and sorting is both correct and free.
 */
import { BY_DATE_INDEX, READINGS_STORE, getDatabase, type LadelogDatabase } from './database';
import type { Reading } from '../types';

/** Outcome of an additive merge (FR-8.3). */
export interface MergeResult {
  /** Readings that did not exist locally and were stored. */
  added: number;
  /** Readings skipped because their id was already present (FR-8.2). */
  skipped: number;
  /** Ids of the stored readings, in input order. */
  addedIds: string[];
}

export interface ReadingsRepository {
  /** All readings, ordered by date. Use `sortChronologically` for the exact order. */
  list(): Promise<Reading[]>;
  get(id: string): Promise<Reading | undefined>;
  /** Inserts or replaces one reading. Used for both capture and edit (FR-4.2). */
  put(reading: Reading): Promise<void>;
  /** Removes one reading (FR-4.2). Consumption of later readings is derived, not stored. */
  remove(id: string): Promise<void>;
  count(): Promise<number>;
  /**
   * Adds only readings whose id is not present yet, in a single transaction.
   *
   * Existing readings are never overwritten and nothing is ever removed
   * (FR-8.2, FR-8.4), which is what makes importing the same file twice a
   * no-op (AC-9).
   */
  insertMissing(readings: readonly Reading[]): Promise<MergeResult>;
  /**
   * Empties the store. Not reachable from the UI - the PRD has no "replace"
   * operation (FR-8.4) and data loss is the worst failure mode (NFR-7).
   * Exists for tests and for a deliberate developer reset.
   */
  clear(): Promise<void>;
}

export function createReadingsRepository(
  getDb: () => Promise<LadelogDatabase>,
): ReadingsRepository {
  return {
    async list() {
      const db = await getDb();
      return db.getAllFromIndex(READINGS_STORE, BY_DATE_INDEX);
    },

    async get(id) {
      const db = await getDb();
      return db.get(READINGS_STORE, id);
    },

    async put(reading) {
      const db = await getDb();
      await db.put(READINGS_STORE, reading);
    },

    async remove(id) {
      const db = await getDb();
      await db.delete(READINGS_STORE, id);
    },

    async count() {
      const db = await getDb();
      return db.count(READINGS_STORE);
    },

    async insertMissing(readings) {
      const db = await getDb();
      const tx = db.transaction(READINGS_STORE, 'readwrite');
      const result: MergeResult = { added: 0, skipped: 0, addedIds: [] };
      const seen = new Set<string>();

      for (const reading of readings) {
        // A duplicate inside the imported file itself must not count twice.
        if (seen.has(reading.id) || (await tx.store.get(reading.id))) {
          result.skipped += 1;
          continue;
        }
        seen.add(reading.id);
        await tx.store.add(reading);
        result.added += 1;
        result.addedIds.push(reading.id);
      }

      await tx.done;
      return result;
    },

    async clear() {
      const db = await getDb();
      await db.clear(READINGS_STORE);
    },
  };
}

/** The repository the application uses, bound to the shared database handle. */
export const readingsRepository: ReadingsRepository =
  createReadingsRepository(getDatabase);
