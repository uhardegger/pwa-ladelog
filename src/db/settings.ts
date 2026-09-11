/**
 * Settings persistence (FR-9, FR-3.2).
 *
 * Settings live in localStorage, never in IndexedDB: they are small, they are
 * read synchronously during the first render, and losing them costs a minute of
 * retyping rather than a year of readings.
 *
 * Reading is deliberately defensive. Any corrupt or partial value falls back to
 * that field's default instead of throwing, because a damaged settings entry
 * must never be the reason the app fails to start (NFR-7).
 *
 * This file sits in `db/` with the other persistence code even though it does
 * not touch IndexedDB; it is the same concern, a different backend.
 */
import { SCHEMA_VERSION, type Language, type Settings } from '../types';
import { browserLanguages, isLanguage, resolveLanguage } from '../i18n';
import { parseKwhInput } from '../lib/calc';

export const SETTINGS_STORAGE_KEY = 'ladelog.settings';

/**
 * Default tariff from FR-9. This is the only default the app ships with:
 * a price is a tariff, not personal data, so it can live in a public
 * repository (PRD OP-2). Name, tenant, premises and vehicle start empty and
 * are entered once in the app.
 */
export const DEFAULT_PRICE_CHF_PER_KWH = 0.28;

/** An upper bound that catches a misplaced decimal point, not a price cap. */
const MAX_PRICE_CHF_PER_KWH = 100;

export function defaultSettings(language?: Language): Settings {
  return {
    personName: '',
    priceChfPerKwh: DEFAULT_PRICE_CHF_PER_KWH,
    tenant: '',
    premises: '',
    vehicle: '',
    language: language ?? resolveLanguage(null, browserLanguages()),
    schemaVersion: SCHEMA_VERSION,
  };
}

function asText(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

function asPrice(value: unknown): number | null {
  const n = typeof value === 'string' ? parseKwhInput(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n < 0 || n > MAX_PRICE_CHF_PER_KWH) return null;
  return n;
}

/**
 * Turns anything into a usable `Settings`, field by field.
 *
 * Used both when reading from storage and when accepting the settings block of
 * an imported JSON bundle (FR-9.2), which comes from another device and is
 * therefore equally untrusted.
 */
export function normalizeSettings(raw: unknown, fallback?: Settings): Settings {
  const base = fallback ?? defaultSettings();
  if (typeof raw !== 'object' || raw === null) return base;
  const input = raw as Record<string, unknown>;

  return {
    personName: asText(input['personName']) ?? base.personName,
    priceChfPerKwh: asPrice(input['priceChfPerKwh']) ?? base.priceChfPerKwh,
    tenant: asText(input['tenant']) ?? base.tenant,
    premises: asText(input['premises']) ?? base.premises,
    vehicle: asText(input['vehicle']) ?? base.vehicle,
    language: isLanguage(input['language']) ? input['language'] : base.language,
    schemaVersion:
      typeof input['schemaVersion'] === 'number' && Number.isFinite(input['schemaVersion'])
        ? input['schemaVersion']
        : SCHEMA_VERSION,
  };
}

/**
 * localStorage, or null where it is unavailable - Safari in private mode and
 * embedded webviews both throw on access rather than returning undefined.
 */
export function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(storage: Storage | null = defaultStorage()): Settings {
  if (!storage) return defaultSettings();
  let raw: string | null;
  try {
    raw = storage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    return defaultSettings();
  }
  if (raw === null) return defaultSettings();
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    // Truncated or hand-edited JSON. Start from defaults rather than crash.
    return defaultSettings();
  }
}

/**
 * Writes the settings. Returns false when storage refused the write (quota,
 * private mode), so the UI can say so instead of pretending it saved (NFR-7).
 */
export function saveSettings(
  settings: Settings,
  storage: Storage | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies a partial change and persists the result.
 *
 * Changing the price here does not touch any stored reading: each reading keeps
 * the price that was in effect when it was captured (FR-5.3), so past months
 * stay valued at the old tariff.
 */
export function updateSettings(
  patch: Partial<Settings>,
  storage: Storage | null = defaultStorage(),
): { settings: Settings; persisted: boolean } {
  const current = loadSettings(storage);
  const next = normalizeSettings({ ...current, ...patch }, current);
  return { settings: next, persisted: saveSettings(next, storage) };
}

/**
 * True while the app has never been configured.
 *
 * Only the person name matters: it is written into every reading (FR-9.1), so
 * capturing without it would produce records that cannot be attributed. Tenant,
 * premises and vehicle are only needed for the settlement sheet and can be
 * filled in later.
 */
export function needsInitialSetup(settings: Settings): boolean {
  return settings.personName.trim() === '';
}

/** Fields the settlement sheet needs before an export is worth sending (FR-6.2). */
export function missingStatementFields(settings: Settings): Array<keyof Settings> {
  return (['tenant', 'premises', 'vehicle'] as const).filter(
    (field) => settings[field].trim() === '',
  );
}

/** Parses a typed price, accepting a decimal comma just like the meter input. */
export function parsePriceInput(raw: string): number | null {
  return asPrice(raw);
}
