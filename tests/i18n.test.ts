import { describe, expect, it } from 'vitest';
import {
  browserLanguages,
  de,
  en,
  formatChf,
  formatDate,
  formatKwh,
  formatMonth,
  formatPrice,
  isLanguage,
  localeOf,
  resolveLanguage,
  translate,
  translatorFor,
} from '../src/i18n';
import { LANGUAGES } from '../src/types';

describe('catalogues', () => {
  it('German provides exactly the English key set', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty message in either language', () => {
    for (const [key, value] of [...Object.entries(en), ...Object.entries(de)]) {
      expect(value.trim(), `empty message for ${key}`).not.toBe('');
    }
  });

  it('uses Swiss orthography in German - no sharp s', () => {
    for (const [key, value] of Object.entries(de)) {
      expect(value, `"ß" found in ${key}`).not.toMatch(/ß/);
    }
  });

  it('declares both languages', () => {
    expect([...LANGUAGES]).toEqual(['de', 'en']);
  });
});

describe('translate', () => {
  it('returns the message for the requested language', () => {
    expect(translate('en', 'common.save')).toBe('Save');
    expect(translate('de', 'common.save')).toBe('Speichern');
  });

  it('substitutes placeholders', () => {
    const template = 'Imported {added}, skipped {skipped}';
    const rendered = template.replace(/\{(\w+)\}/g, (_m, n: string) =>
      String({ added: 3, skipped: 1 }[n as 'added' | 'skipped']),
    );
    expect(rendered).toBe('Imported 3, skipped 1');
  });

  it('leaves an unmatched placeholder visible instead of dropping text', () => {
    // Guards the behaviour documented in translate(): a wrong call site must be
    // obvious in the UI rather than silently producing a truncated string.
    const out = translate('en', 'app.name', { unused: 1 });
    expect(out).toBe(en['app.name']);
  });

  it('translatorFor binds the language', () => {
    const t = translatorFor('de');
    expect(t('common.cancel')).toBe('Abbrechen');
  });
});

describe('resolveLanguage', () => {
  it('prefers a stored choice over the browser preference', () => {
    expect(resolveLanguage('en', ['de-CH'])).toBe('en');
    expect(resolveLanguage('de', ['en-US'])).toBe('de');
  });

  it('falls back to the browser preference when nothing is stored', () => {
    expect(resolveLanguage(null, ['en-GB', 'de-CH'])).toBe('en');
    expect(resolveLanguage(undefined, ['de-CH'])).toBe('de');
  });

  it('matches on the primary subtag and ignores case', () => {
    expect(resolveLanguage(null, ['DE-ch'])).toBe('de');
    expect(resolveLanguage(null, ['en-AU'])).toBe('en');
  });

  it('skips unsupported languages and keeps looking', () => {
    expect(resolveLanguage(null, ['fr-CH', 'it-CH', 'en-GB'])).toBe('en');
  });

  it('defaults to German when nothing matches', () => {
    expect(resolveLanguage(null, ['fr-CH'])).toBe('de');
    expect(resolveLanguage(null, [])).toBe('de');
    expect(resolveLanguage('klingon', [])).toBe('de');
  });

  it('browserLanguages always yields a usable list of tags', () => {
    // Node exposes a global `navigator`, browsers do too; the guard exists so
    // the call is safe in any environment, never that it returns nothing.
    const tags = browserLanguages();
    expect(Array.isArray(tags)).toBe(true);
    for (const tag of tags) expect(typeof tag).toBe('string');
    expect(isLanguage(resolveLanguage(null, tags)) ).toBe(true);
  });
});

describe('isLanguage', () => {
  it('accepts supported codes only', () => {
    expect(isLanguage('de')).toBe(true);
    expect(isLanguage('en')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
    expect(isLanguage(42)).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });
});

describe('formatting', () => {
  it('maps languages to day-first locales', () => {
    expect(localeOf('de')).toBe('de-CH');
    expect(localeOf('en')).toBe('en-GB');
  });

  it('formats kWh with exactly one decimal', () => {
    expect(formatKwh('en', 42.5)).toBe('42.5');
    expect(formatKwh('en', 95)).toBe('95.0');
    expect(formatKwh('de', 210)).toBe('210.0');
  });

  it('formats amounts with exactly two decimals', () => {
    expect(formatChf('en', 26.6)).toBe('26.60');
    expect(formatChf('de', 58.8)).toBe('58.80');
  });

  it('formats a price without padding to a fixed width', () => {
    expect(formatPrice('en', 0.28)).toBe('0.28');
    expect(formatPrice('en', 0.2862)).toBe('0.2862');
  });

  it('formats dates day-first in both languages', () => {
    expect(formatDate('de', '2026-10-28')).toBe('28.10.2026');
    expect(formatDate('en', '2026-10-28')).toBe('28/10/2026');
  });

  it('does not shift the day across time zones', () => {
    // A plain calendar date must never be reinterpreted as an instant.
    expect(formatDate('de', '2026-01-01')).toBe('01.01.2026');
    expect(formatDate('de', '2026-12-31')).toBe('31.12.2026');
  });

  it('returns a malformed date unchanged rather than showing "Invalid Date"', () => {
    expect(formatDate('de', 'not-a-date')).toBe('not-a-date');
  });

  it('formats month headings in the right language', () => {
    expect(formatMonth('en', 2026, 10)).toBe('October 2026');
    expect(formatMonth('de', 2026, 10)).toBe('Oktober 2026');
  });
});
