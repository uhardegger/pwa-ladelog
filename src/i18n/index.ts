/**
 * Minimal in-house i18n layer.
 *
 * The PRD asks for as few dependencies as possible (section 8) and the app must
 * make no network request in the critical path (FR-3.5), so both catalogues are
 * bundled and no i18n library is used.
 */
import { en, type MessageKey, type Messages } from './en';
import { de } from './de';
import { LANGUAGES, type Language } from '../types';

export type { MessageKey, Messages };
export { en, de };

const CATALOGUES: Record<Language, Messages> = { de, en };

/**
 * BCP-47 locales used for number and date formatting.
 *
 * English maps to en-GB rather than en-US on purpose: the app is day-first
 * everywhere (FR-6.5 prescribes DD.MM.YYYY for the export), and a month-first
 * English UI next to a day-first German one would make 05.03. ambiguous.
 */
const LOCALES: Record<Language, string> = { de: 'de-CH', en: 'en-GB' };

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export function localeOf(lang: Language): string {
  return LOCALES[lang];
}

/**
 * Looks up a message and substitutes `{placeholder}` occurrences.
 *
 * A placeholder without a matching parameter is left untouched, so a wrong call
 * site shows `{count}` in the UI instead of swallowing the text.
 */
export function translate(
  lang: Language,
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
): string {
  const template = CATALOGUES[lang][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** A translate function bound to one language - what components receive. */
export type Translator = (
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
) => string;

export function translatorFor(lang: Language): Translator {
  return (key, params) => translate(lang, key, params);
}

/**
 * Picks the startup language. Pure so it can be tested without a browser.
 *
 * @param stored    previously chosen language, if any
 * @param preferred the browser's preferred languages, most preferred first
 */
export function resolveLanguage(
  stored: unknown,
  preferred: readonly string[] = [],
): Language {
  if (isLanguage(stored)) return stored;
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLanguage(primary)) return primary;
  }
  return 'de';
}

/** Reads the browser's preferred languages, safe to call outside a browser. */
export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages ?? (navigator.language ? [navigator.language] : []);
}

/** kWh with one decimal (FR-6.5). */
export function formatKwh(lang: Language, value: number): string {
  return new Intl.NumberFormat(LOCALES[lang], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/** Currency amounts with two decimals (FR-6.5). */
export function formatChf(lang: Language, value: number): string {
  return new Intl.NumberFormat(LOCALES[lang], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Price per kWh - four decimals would be noise, two is what a tariff has. */
export function formatPrice(lang: Language, value: number): string {
  return new Intl.NumberFormat(LOCALES[lang], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

/**
 * Formats an ISO-8601 date as a day-first numeric date.
 *
 * The date is read as a plain calendar date, never as an instant, so a reading
 * captured late in the evening does not shift a day by time zone.
 */
export function formatDate(lang: Language, iso: string): string {
  const parts = iso.split('-');
  const [y, m, d] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  return new Intl.DateTimeFormat(LOCALES[lang], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Month heading for the monthly overview, e.g. "October 2026" / "Oktober 2026". */
export function formatMonth(lang: Language, year: number, month: number): string {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}
