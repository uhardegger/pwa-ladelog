import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICE_CHF_PER_KWH,
  SETTINGS_STORAGE_KEY,
  defaultSettings,
  defaultStorage,
  loadSettings,
  missingStatementFields,
  needsInitialSetup,
  normalizeSettings,
  parsePriceInput,
  saveSettings,
  updateSettings,
} from '../src/db/settings';
import { SCHEMA_VERSION, type Settings } from '../src/types';

/** A Storage implementation under test control, including a failing one. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  constructor(private readonly failOnWrite = false) {}

  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.failOnWrite) throw new DOMException('QuotaExceededError');
    this.map.set(key, value);
  }
}

/** Storage that throws on every access, as Safari does in private mode. */
const hostileStorage = (): Storage =>
  new Proxy({} as Storage, {
    get() {
      throw new DOMException('SecurityError');
    },
  });

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

describe('defaults (FR-9, PRD OP-2)', () => {
  it('ships the FR-9 tariff as the only non-empty default', () => {
    const s = defaultSettings('de');
    expect(s.priceChfPerKwh).toBe(DEFAULT_PRICE_CHF_PER_KWH);
    expect(s.priceChfPerKwh).toBe(0.28);
  });

  it('carries no personal data, so the repository can be public', () => {
    const s = defaultSettings('de');
    expect(s.personName).toBe('');
    expect(s.tenant).toBe('');
    expect(s.premises).toBe('');
    expect(s.vehicle).toBe('');
  });

  it('stamps the current schema version', () => {
    expect(defaultSettings('de').schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('takes the language it is given', () => {
    expect(defaultSettings('en').language).toBe('en');
    expect(defaultSettings('de').language).toBe('de');
  });

  it('resolves a language on its own when none is given', () => {
    expect(['de', 'en']).toContain(defaultSettings().language);
  });
});

describe('normalizeSettings', () => {
  const complete: Settings = {
    personName: 'Hardegger',
    priceChfPerKwh: 0.31,
    tenant: 'A Tenant',
    premises: 'Garage',
    vehicle: 'EX30',
    language: 'en',
    schemaVersion: 1,
  };

  it('passes a complete, valid object through unchanged', () => {
    expect(normalizeSettings(complete)).toEqual(complete);
  });

  it('trims whitespace from text fields', () => {
    const s = normalizeSettings({ ...complete, personName: '  Hardegger  ' });
    expect(s.personName).toBe('Hardegger');
  });

  it('falls back per field instead of discarding the whole object', () => {
    const s = normalizeSettings({ personName: 'Hardegger', priceChfPerKwh: 'nonsense' });
    expect(s.personName).toBe('Hardegger');
    expect(s.priceChfPerKwh).toBe(DEFAULT_PRICE_CHF_PER_KWH);
  });

  it('rejects a non-numeric price', () => {
    for (const bad of [NaN, Infinity, -Infinity, null, {}, [], true]) {
      expect(normalizeSettings({ priceChfPerKwh: bad }).priceChfPerKwh).toBe(
        DEFAULT_PRICE_CHF_PER_KWH,
      );
    }
  });

  it('rejects a negative price', () => {
    expect(normalizeSettings({ priceChfPerKwh: -1 }).priceChfPerKwh).toBe(
      DEFAULT_PRICE_CHF_PER_KWH,
    );
  });

  it('rejects a price that looks like a misplaced decimal point', () => {
    expect(normalizeSettings({ priceChfPerKwh: 2800 }).priceChfPerKwh).toBe(
      DEFAULT_PRICE_CHF_PER_KWH,
    );
  });

  it('accepts a price written as a string with a decimal comma', () => {
    expect(normalizeSettings({ priceChfPerKwh: '0,31' }).priceChfPerKwh).toBe(0.31);
  });

  it('accepts a free price of zero', () => {
    expect(normalizeSettings({ priceChfPerKwh: 0 }).priceChfPerKwh).toBe(0);
  });

  it('rejects an unsupported language', () => {
    expect(normalizeSettings({ language: 'fr' }).language).not.toBe('fr');
    expect(['de', 'en']).toContain(normalizeSettings({ language: 'fr' }).language);
  });

  it('rejects non-string text fields', () => {
    const s = normalizeSettings({ personName: 42, tenant: null, vehicle: {} });
    expect(s.personName).toBe('');
    expect(s.tenant).toBe('');
    expect(s.vehicle).toBe('');
  });

  it('returns defaults for something that is not an object at all', () => {
    for (const bad of [null, undefined, 'string', 42, []]) {
      expect(normalizeSettings(bad).priceChfPerKwh).toBe(DEFAULT_PRICE_CHF_PER_KWH);
    }
  });

  it('prefers the given fallback over the shipped defaults', () => {
    const s = normalizeSettings({ personName: 'New' }, complete);
    expect(s.personName).toBe('New');
    expect(s.priceChfPerKwh).toBe(0.31);
    expect(s.tenant).toBe('A Tenant');
  });

  it('keeps an unknown schema version rather than silently renumbering it', () => {
    expect(normalizeSettings({ ...complete, schemaVersion: 7 }).schemaVersion).toBe(7);
  });

  it('ignores unknown extra fields', () => {
    const s = normalizeSettings({ ...complete, rogue: 'value' });
    expect(s).toEqual(complete);
    expect('rogue' in s).toBe(false);
  });
});

describe('load and save', () => {
  it('returns defaults when nothing was ever stored', () => {
    const s = loadSettings(storage);
    expect(s.personName).toBe('');
    expect(s.priceChfPerKwh).toBe(DEFAULT_PRICE_CHF_PER_KWH);
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(['de', 'en']).toContain(s.language);
  });

  it('round-trips a saved value', () => {
    const s: Settings = { ...defaultSettings('en'), personName: 'Hardegger', tenant: 'T' };
    expect(saveSettings(s, storage)).toBe(true);
    expect(loadSettings(storage)).toEqual(s);
  });

  it('stores under the documented key', () => {
    saveSettings(defaultSettings('de'), storage);
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).not.toBeNull();
  });

  it('survives truncated JSON instead of failing to start', () => {
    storage.setItem(SETTINGS_STORAGE_KEY, '{"personName":"Har');
    expect(loadSettings(storage).priceChfPerKwh).toBe(DEFAULT_PRICE_CHF_PER_KWH);
  });

  it('survives JSON that is valid but the wrong shape', () => {
    storage.setItem(SETTINGS_STORAGE_KEY, '"just a string"');
    expect(loadSettings(storage).priceChfPerKwh).toBe(DEFAULT_PRICE_CHF_PER_KWH);
  });

  it('repairs a partially written object', () => {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ personName: 'Hardegger' }));
    const s = loadSettings(storage);
    expect(s.personName).toBe('Hardegger');
    expect(s.priceChfPerKwh).toBe(DEFAULT_PRICE_CHF_PER_KWH);
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('reports a refused write rather than pretending it saved (NFR-7)', () => {
    const failing = new MemoryStorage(true);
    expect(saveSettings(defaultSettings('de'), failing)).toBe(false);
  });

  it('works without any storage at all', () => {
    expect(loadSettings(null).priceChfPerKwh).toBe(DEFAULT_PRICE_CHF_PER_KWH);
    expect(saveSettings(defaultSettings('de'), null)).toBe(false);
  });

  it('survives storage that throws on every access', () => {
    const hostile = hostileStorage();
    expect(loadSettings(hostile).priceChfPerKwh).toBe(DEFAULT_PRICE_CHF_PER_KWH);
    expect(saveSettings(defaultSettings('de'), hostile)).toBe(false);
  });

  it('defaultStorage never throws, whatever the environment', () => {
    expect(() => defaultStorage()).not.toThrow();
  });
});

describe('updateSettings', () => {
  it('applies a partial change and keeps the rest', () => {
    saveSettings({ ...defaultSettings('de'), personName: 'Hardegger' }, storage);
    const { settings, persisted } = updateSettings({ priceChfPerKwh: 0.31 }, storage);
    expect(persisted).toBe(true);
    expect(settings.priceChfPerKwh).toBe(0.31);
    expect(settings.personName).toBe('Hardegger');
  });

  it('persists the change so the next load sees it', () => {
    updateSettings({ personName: 'Hardegger' }, storage);
    expect(loadSettings(storage).personName).toBe('Hardegger');
  });

  it('rejects an invalid value instead of storing it', () => {
    saveSettings({ ...defaultSettings('de'), priceChfPerKwh: 0.31 }, storage);
    const { settings } = updateSettings({ priceChfPerKwh: Number.NaN }, storage);
    expect(settings.priceChfPerKwh).toBe(0.31);
  });

  it('switches the language (the user-facing bilingual requirement)', () => {
    updateSettings({ language: 'en' }, storage);
    expect(loadSettings(storage).language).toBe('en');
    updateSettings({ language: 'de' }, storage);
    expect(loadSettings(storage).language).toBe('de');
  });

  it('reports a refused write', () => {
    const failing = new MemoryStorage(true);
    expect(updateSettings({ personName: 'X' }, failing).persisted).toBe(false);
  });
});

describe('price changes do not rewrite history (FR-5.3)', () => {
  it('changing the setting leaves already captured readings untouched', () => {
    // The price is copied into each reading at capture time; settings only ever
    // supply the price for the *next* reading.
    const captured = { id: 'a', priceChfPerKwh: 0.28 };
    saveSettings({ ...defaultSettings('de'), priceChfPerKwh: 0.28 }, storage);
    updateSettings({ priceChfPerKwh: 0.31 }, storage);
    expect(captured.priceChfPerKwh).toBe(0.28);
    expect(loadSettings(storage).priceChfPerKwh).toBe(0.31);
  });
});

describe('completeness checks', () => {
  it('demands setup while no name is known (FR-9.1)', () => {
    expect(needsInitialSetup(defaultSettings('de'))).toBe(true);
    expect(needsInitialSetup({ ...defaultSettings('de'), personName: '   ' })).toBe(true);
    expect(needsInitialSetup({ ...defaultSettings('de'), personName: 'Hardegger' })).toBe(
      false,
    );
  });

  it('lists the settlement fields that are still missing (FR-6.2)', () => {
    expect(missingStatementFields(defaultSettings('de'))).toEqual([
      'tenant',
      'premises',
      'vehicle',
    ]);
    expect(
      missingStatementFields({ ...defaultSettings('de'), tenant: 'T', premises: 'P' }),
    ).toEqual(['vehicle']);
    expect(
      missingStatementFields({
        ...defaultSettings('de'),
        tenant: 'T',
        premises: 'P',
        vehicle: 'V',
      }),
    ).toEqual([]);
  });

  it('does not block capturing on the settlement fields', () => {
    // Only the name gates capture; the rest is needed at export time.
    const named = { ...defaultSettings('de'), personName: 'Hardegger' };
    expect(needsInitialSetup(named)).toBe(false);
    expect(missingStatementFields(named).length).toBeGreaterThan(0);
  });
});

describe('parsePriceInput', () => {
  it('accepts both decimal separators', () => {
    expect(parsePriceInput('0,28')).toBe(0.28);
    expect(parsePriceInput('0.28')).toBe(0.28);
  });

  it('accepts an integer price', () => {
    expect(parsePriceInput('1')).toBe(1);
  });

  it('rejects text, an empty input and a negative price', () => {
    expect(parsePriceInput('abc')).toBeNull();
    expect(parsePriceInput('')).toBeNull();
    expect(parsePriceInput('-0.28')).toBeNull();
  });

  it('rejects a value far outside any plausible tariff', () => {
    expect(parsePriceInput('2800')).toBeNull();
  });
});
