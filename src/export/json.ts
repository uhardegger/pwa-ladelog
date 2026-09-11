/**
 * JSON exchange between the two devices (FR-8).
 *
 * There is no synchronisation: the partner exports a bundle, sends it by
 * messenger, and it is merged in here. The merge is strictly additive and keyed
 * by the reading's UUID (FR-8.2), so importing the same file twice changes
 * nothing (AC-9) and nothing is ever overwritten or removed (FR-8.4).
 *
 * A bundle arrives from another device and is therefore untrusted input. Every
 * reading is validated field by field; one malformed entry is skipped and
 * counted, it never aborts the rest of the file.
 *
 * The settings block travels in the bundle (FR-9.2) but is deliberately ignored
 * on import: adopting the sender's name, tenant and price would silently
 * rewrite the receiver's own configuration.
 */
import {
  SCHEMA_VERSION,
  type ExportBundle,
  type FilePayload,
  type Reading,
  type Settings,
} from '../types';
import { isIsoDate } from '../lib/dates';

const JSON_MIME = 'application/json';

/** The complete local data set as a JSON bundle (FR-8.1). */
export function buildJsonBundle(
  readings: readonly Reading[],
  settings: Settings,
  now: Date = new Date(),
): FilePayload {
  const bundle: ExportBundle = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    settings,
    readings: [...readings],
  };
  const stamp = now.toISOString().slice(0, 10);
  return {
    filename: `Ladelog_Daten_${stamp}.json`,
    blob: new Blob([JSON.stringify(bundle, null, 2)], { type: JSON_MIME }),
  };
}

/** Why a file could not be read at all, as opposed to individual bad entries. */
export type ParseFailure =
  /** The text is not valid JSON. */
  | 'notJson'
  /** Valid JSON, but not an object with a readings array. */
  | 'notABundle'
  /** A bundle written by a newer version of the app than this one. */
  | 'schemaTooNew';

export type ParseResult =
  | { ok: true; bundle: ParsedBundle }
  | { ok: false; reason: ParseFailure; detail?: string };

export interface ParsedBundle {
  schemaVersion: number;
  exportedAt: string | null;
  /** Readings that passed validation and can be merged. */
  readings: Reading[];
  /** How many entries were dropped as unusable. */
  invalid: number;
  /**
   * The sender's settings, for display only. Never applied - see the module
   * comment.
   */
  senderSettings: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Validates a single entry from an imported bundle.
 *
 * Strict about what makes a reading usable at all - an id to deduplicate on, a
 * real date to order by, a number to subtract - and forgiving about the rest.
 * `createdAt` is only a tie-breaker, so a missing one is substituted rather
 * than causing the entry to be dropped.
 */
export function parseReading(value: unknown): Reading | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;

  if (!isNonEmptyString(r['id'])) return null;
  if (!isIsoDate(r['date'])) return null;
  if (!isFiniteNumber(r['meterKwh']) || r['meterKwh'] < 0) return null;

  const createdAt =
    typeof r['createdAt'] === 'string' && r['createdAt'] !== ''
      ? r['createdAt']
      : `${r['date']}T12:00:00.000Z`;

  const reading: Reading = {
    id: r['id'].trim(),
    date: r['date'],
    meterKwh: r['meterKwh'],
    person: typeof r['person'] === 'string' ? r['person'].trim() : '',
    priceChfPerKwh:
      isFiniteNumber(r['priceChfPerKwh']) && r['priceChfPerKwh'] >= 0
        ? r['priceChfPerKwh']
        : 0,
    createdAt,
  };

  if (typeof r['note'] === 'string' && r['note'] !== '') reading.note = r['note'];
  return reading;
}

/** Reads the text of an exported file into a mergeable bundle. */
export function parseBundle(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: 'notJson', detail: String(error) };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'notABundle' };
  }

  const bundle = raw as Record<string, unknown>;
  if (!Array.isArray(bundle['readings'])) {
    return { ok: false, reason: 'notABundle' };
  }

  const schemaVersion = isFiniteNumber(bundle['schemaVersion'])
    ? bundle['schemaVersion']
    : SCHEMA_VERSION;

  // Refuse rather than guess: a newer bundle may carry fields this version
  // would silently drop, and the merge is not reversible.
  if (schemaVersion > SCHEMA_VERSION) {
    return { ok: false, reason: 'schemaTooNew', detail: String(schemaVersion) };
  }

  const readings: Reading[] = [];
  let invalid = 0;
  for (const entry of bundle['readings']) {
    const parsed = parseReading(entry);
    if (parsed) readings.push(parsed);
    else invalid += 1;
  }

  return {
    ok: true,
    bundle: {
      schemaVersion,
      exportedAt:
        typeof bundle['exportedAt'] === 'string' ? bundle['exportedAt'] : null,
      readings,
      invalid,
      senderSettings: bundle['settings'] ?? null,
    },
  };
}
