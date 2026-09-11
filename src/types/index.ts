/**
 * Domain model (PRD section 6).
 *
 * The shapes of `Reading`, `Settings` and `ExportBundle` are fixed by the PRD;
 * they are also the on-disk format of IndexedDB records and of the JSON export
 * bundle, so any change here is a schema migration.
 */

/** Supported UI languages. German is the de-CH variant. */
export type Language = 'de' | 'en';

export const LANGUAGES: readonly Language[] = ['de', 'en'] as const;

/** Current schema version of `Reading`, `Settings` and `ExportBundle`. */
export const SCHEMA_VERSION = 1;

/** A single reading of the charger's cumulative meter. */
export interface Reading {
  /** UUID v4 - the key for deduplication on import (FR-8.2). */
  id: string;
  /** ISO-8601 calendar date, e.g. "2026-10-28". */
  date: string;
  /** Cumulative meter value of the charger, in kWh. */
  meterKwh: number;
  /** Name of the person who charged, taken from the settings (FR-9.1). */
  person: string;
  note?: string;
  /** Electricity price in effect when the reading was taken - frozen for history (FR-5.3). */
  priceChfPerKwh: number;
  /** ISO-8601 timestamp of capture, used as the secondary sort key. */
  createdAt: string;
}

/**
 * User settings (FR-9). Persisted in localStorage, never in IndexedDB, and
 * included in the JSON export bundle (FR-9.2).
 */
export interface Settings {
  personName: string;
  priceChfPerKwh: number;
  /** Tenant name printed on the settlement sheet (FR-6.2). */
  tenant: string;
  /** Premises description printed on the settlement sheet. */
  premises: string;
  /** Vehicle description printed on the settlement sheet. */
  vehicle: string;
  /** UI language. Not part of the PRD model; added for the bilingual UI. */
  language: Language;
  schemaVersion: number;
}

/** The complete local data set, as written by the JSON export (FR-8.1). */
export interface ExportBundle {
  schemaVersion: number;
  exportedAt: string;
  settings: Settings;
  readings: Reading[];
}

/** A reading enriched with its derived consumption. */
export interface ReadingWithUsage extends Reading {
  /** Difference to the chronologically preceding reading. null for the first one. */
  usageKwh: number | null;
  /** true when the raw difference was negative - meter swap or typo (FR-2.1). */
  meterReset: boolean;
}

/** Aggregation over one calendar month (FR-5.1). */
export interface MonthTotal {
  /** Sortable key, e.g. "2026-10". */
  key: string;
  year: number;
  /** 1-12. */
  month: number;
  totalKwh: number;
  /** kWh per person, keyed by person name. */
  byPerson: Record<string, number>;
  /** Sum of each reading's usage valued at the price frozen in that reading. */
  amountChf: number;
}

/** A generated file ready to be handed to the user (FR-7). */
export interface FilePayload {
  filename: string;
  blob: Blob;
}

/** A settlement period with inclusive bounds (FR-6.3). */
export interface Period {
  /** ISO-8601 date, inclusive. */
  from: string;
  /** ISO-8601 date, inclusive. */
  to: string;
}
