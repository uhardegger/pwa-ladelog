import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BY_DATE_INDEX,
  DB_VERSION,
  READINGS_STORE,
  closeDatabase,
  createReadingsRepository,
  isIndexedDbAvailable,
  openLadelogDatabase,
  type LadelogDatabase,
  type ReadingsRepository,
} from '../src/db';
import {
  persistenceState,
  requestPersistence,
  storageEstimate,
} from '../src/db/persist';
import type { Reading } from '../src/types';

const reading = (
  id: string,
  date: string,
  meterKwh: number,
  person = 'Hardegger',
  note?: string,
): Reading => ({
  id,
  date,
  meterKwh,
  person,
  priceChfPerKwh: 0.28,
  createdAt: `${date}T18:00:00.000Z`,
  ...(note === undefined ? {} : { note }),
});

let db: LadelogDatabase;
let repo: ReadingsRepository;
let dbName: string;
let dbCounter = 0;

beforeEach(async () => {
  // A fresh database per test, so no test can observe another test's writes.
  dbName = `ladelog-test-${Date.now()}-${dbCounter++}`;
  db = await openLadelogDatabase(dbName);
  repo = createReadingsRepository(async () => db);
});

afterEach(async () => {
  db.close();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
});

describe('schema', () => {
  it('creates the readings store keyed by id', () => {
    expect([...db.objectStoreNames]).toEqual([READINGS_STORE]);
    expect(db.version).toBe(DB_VERSION);
  });

  it('indexes readings by date', async () => {
    const tx = db.transaction(READINGS_STORE, 'readonly');
    expect([...tx.store.indexNames]).toEqual([BY_DATE_INDEX]);
    expect(tx.store.keyPath).toBe('id');
    await tx.done;
  });

  it('opening twice keeps the existing data', async () => {
    await repo.put(reading('a', '2026-09-01', 0));
    db.close();
    db = await openLadelogDatabase(dbName);
    expect(await repo.count()).toBe(1);
  });

  it('reports IndexedDB as available in the test environment', () => {
    expect(isIndexedDbAvailable()).toBe(true);
  });
});

describe('basic persistence', () => {
  it('stores and reads back a reading unchanged', async () => {
    const r = reading('a', '2026-09-01', 0, 'Hardegger', 'first');
    await repo.put(r);
    expect(await repo.get('a')).toEqual(r);
  });

  it('keeps an absent optional note absent', async () => {
    await repo.put(reading('a', '2026-09-01', 0));
    const back = await repo.get('a');
    expect(back?.note).toBeUndefined();
  });

  it('returns undefined for an unknown id instead of throwing', async () => {
    expect(await repo.get('nope')).toBeUndefined();
  });

  it('put on an existing id replaces it - this is the edit path (FR-4.2)', async () => {
    await repo.put(reading('a', '2026-09-01', 100));
    await repo.put({ ...reading('a', '2026-09-02', 120), note: 'corrected' });
    expect(await repo.count()).toBe(1);
    const back = await repo.get('a');
    expect(back?.meterKwh).toBe(120);
    expect(back?.date).toBe('2026-09-02');
    expect(back?.note).toBe('corrected');
  });

  it('removes a reading and leaves the others untouched (FR-4.2)', async () => {
    await repo.insertMissing([
      reading('a', '2026-09-01', 0),
      reading('b', '2026-09-08', 42.5),
      reading('c', '2026-09-20', 95),
    ]);
    await repo.remove('b');
    expect((await repo.list()).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('removing an unknown id is a no-op, not an error', async () => {
    await repo.put(reading('a', '2026-09-01', 0));
    await expect(repo.remove('ghost')).resolves.toBeUndefined();
    expect(await repo.count()).toBe(1);
  });

  it('counts an empty store as zero and lists nothing', async () => {
    expect(await repo.count()).toBe(0);
    expect(await repo.list()).toEqual([]);
  });

  it('clear empties the store', async () => {
    await repo.insertMissing([reading('a', '2026-09-01', 0), reading('b', '2026-09-08', 10)]);
    await repo.clear();
    expect(await repo.count()).toBe(0);
  });
});

describe('list ordering', () => {
  it('returns readings ordered by date, not by insertion order', async () => {
    await repo.put(reading('c', '2026-10-05', 150));
    await repo.put(reading('a', '2026-09-01', 0));
    await repo.put(reading('b', '2026-09-08', 42.5));
    expect((await repo.list()).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders correctly across a year boundary', async () => {
    await repo.put(reading('y2', '2027-01-10', 60));
    await repo.put(reading('y1', '2026-12-28', 300));
    expect((await repo.list()).map((r) => r.date)).toEqual(['2026-12-28', '2027-01-10']);
  });

  it('keeps both readings when two share a date', async () => {
    await repo.put(reading('a', '2026-09-01', 10));
    await repo.put(reading('b', '2026-09-01', 20));
    const ids = (await repo.list()).map((r) => r.id);
    expect(ids).toHaveLength(2);
    expect([...ids].sort()).toEqual(['a', 'b']);
  });
});

describe('insertMissing - import deduplication (FR-8.2, FR-8.3, AC-9)', () => {
  const incoming = [
    reading('a', '2026-09-01', 0),
    reading('b', '2026-09-08', 42.5),
    reading('c', '2026-09-20', 95, 'Partnerin'),
  ];

  it('adds everything into an empty store', async () => {
    const result = await repo.insertMissing(incoming);
    expect(result.added).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.addedIds).toEqual(['a', 'b', 'c']);
  });

  it('importing the same data twice adds nothing (AC-9)', async () => {
    await repo.insertMissing(incoming);
    const second = await repo.insertMissing(incoming);
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(3);
    expect(second.addedIds).toEqual([]);
    expect(await repo.count()).toBe(3);
  });

  it('merges additively, adding only the unknown ids', async () => {
    await repo.insertMissing(incoming.slice(0, 2));
    const result = await repo.insertMissing([
      ...incoming,
      reading('d', '2026-10-05', 150),
    ]);
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(2);
    expect(result.addedIds).toEqual(['c', 'd']);
    expect(await repo.count()).toBe(4);
  });

  it('never overwrites an existing reading (FR-8.2)', async () => {
    const mine = reading('a', '2026-09-01', 111, 'Hardegger', 'mine');
    await repo.put(mine);
    const theirs = reading('a', '2099-01-01', 999, 'Someone else', 'theirs');
    const result = await repo.insertMissing([theirs]);
    expect(result.added).toBe(0);
    expect(await repo.get('a')).toEqual(mine);
  });

  it('never removes anything - there is no replace (FR-8.4)', async () => {
    await repo.insertMissing(incoming);
    await repo.insertMissing([reading('z', '2026-11-01', 250)]);
    expect(await repo.count()).toBe(4);
  });

  it('collapses duplicates inside a single import file', async () => {
    const result = await repo.insertMissing([
      reading('a', '2026-09-01', 0),
      reading('a', '2026-09-01', 0),
      reading('b', '2026-09-08', 42.5),
    ]);
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(1);
    expect(await repo.count()).toBe(2);
  });

  it('handles an empty import without touching the store', async () => {
    await repo.insertMissing(incoming);
    const result = await repo.insertMissing([]);
    expect(result).toEqual({ added: 0, skipped: 0, addedIds: [] });
    expect(await repo.count()).toBe(3);
  });

  it('survives a merge of a realistic two-device data set', async () => {
    // Own device already holds its readings; the partner's export overlaps.
    await repo.insertMissing([
      reading('a', '2026-09-01', 0),
      reading('b', '2026-09-08', 42.5),
      reading('c', '2026-09-20', 95, 'Partnerin'),
    ]);
    const fromPartner = [
      reading('c', '2026-09-20', 95, 'Partnerin'),
      reading('p1', '2026-10-02', 130, 'Partnerin'),
      reading('p2', '2026-10-19', 175, 'Partnerin'),
    ];
    const result = await repo.insertMissing(fromPartner);
    expect(result).toEqual({ added: 2, skipped: 1, addedIds: ['p1', 'p2'] });
    expect((await repo.list()).map((r) => r.id)).toEqual(['a', 'b', 'c', 'p1', 'p2']);
  });
});

describe('shared handle', () => {
  it('closeDatabase is safe when nothing was ever opened', () => {
    expect(() => closeDatabase()).not.toThrow();
  });
});

describe('storage persistence (FR-3.4)', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');

  const stubStorage = (value: unknown) => {
    Object.defineProperty(navigator, 'storage', {
      value,
      configurable: true,
      writable: true,
    });
  };

  afterEach(() => {
    if (originalStorage) Object.defineProperty(navigator, 'storage', originalStorage);
    else stubStorage(undefined);
  });

  it('reports "persisted" when the browser granted persistence', async () => {
    stubStorage({ persist: async () => true, persisted: async () => true });
    expect(await requestPersistence()).toBe('persisted');
    expect(await persistenceState()).toBe('persisted');
  });

  it('reports "denied" when the browser refuses', async () => {
    stubStorage({ persist: async () => false, persisted: async () => false });
    expect(await requestPersistence()).toBe('denied');
    expect(await persistenceState()).toBe('denied');
  });

  it('reports "unsupported" when the Storage API is missing', async () => {
    stubStorage(undefined);
    expect(await requestPersistence()).toBe('unsupported');
    expect(await persistenceState()).toBe('unsupported');
    expect(await storageEstimate()).toBeNull();
  });

  it('reports "unsupported" instead of throwing when the call rejects', async () => {
    stubStorage({
      persist: async () => {
        throw new Error('denied by policy');
      },
      persisted: async () => {
        throw new Error('denied by policy');
      },
      estimate: async () => {
        throw new Error('denied by policy');
      },
    });
    expect(await requestPersistence()).toBe('unsupported');
    expect(await persistenceState()).toBe('unsupported');
    expect(await storageEstimate()).toBeNull();
  });

  it('passes an estimate through when the browser provides one', async () => {
    const estimate = { quota: 1_000_000, usage: 1_234 };
    stubStorage({ estimate: async () => estimate });
    expect(await storageEstimate()).toEqual(estimate);
  });

  it('never prompts on its own - requestPersistence is the only asking path', async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persist, persisted: async () => false });
    await persistenceState();
    expect(persist).not.toHaveBeenCalled();
  });
});
