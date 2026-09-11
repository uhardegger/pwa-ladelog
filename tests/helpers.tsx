import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { LadelogProvider } from '../src/app/context';
import {
  createReadingsRepository,
  openLadelogDatabase,
  type LadelogDatabase,
  type ReadingsRepository,
} from '../src/db';
import { SETTINGS_STORAGE_KEY, defaultSettings } from '../src/db/settings';
import type { Reading, Settings } from '../src/types';

/** A Storage under test control - Node has no localStorage of its own. */
export class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

export const mkReading = (
  id: string,
  date: string,
  meterKwh: number,
  person = 'Hardegger',
  price = 0.28,
): Reading => ({
  id,
  date,
  meterKwh,
  person,
  priceChfPerKwh: price,
  createdAt: `${date}T18:00:00.000Z`,
});

let counter = 0;

export interface Harness {
  user: ReturnType<typeof userEvent.setup>;
  repository: ReadingsRepository;
  storage: MemoryStorage;
  close(): Promise<void>;
}

/** Renders a tree against a real (in-memory) IndexedDB and a real Storage. */
export async function renderWithApp(
  ui: ReactElement,
  options: { readings?: readonly Reading[]; settings?: Partial<Settings> } = {},
): Promise<Harness> {
  const dbName = `ladelog-ui-${Date.now()}-${counter++}`;
  const db: LadelogDatabase = await openLadelogDatabase(dbName);
  const repository = createReadingsRepository(async () => db);
  if (options.readings?.length) await repository.insertMissing(options.readings);

  const storage = new MemoryStorage();
  storage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({
      ...defaultSettings('de'),
      personName: 'Hardegger',
      language: 'de',
      ...options.settings,
    }),
  );

  const user = userEvent.setup();

  render(
    <LadelogProvider repository={repository} storage={storage} askForPersistence={false}>
      {ui}
    </LadelogProvider>,
  );

  return {
    user,
    repository,
    storage,
    async close() {
      db.close();
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    },
  };
}
