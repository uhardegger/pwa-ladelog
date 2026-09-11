import { describe, expect, it } from 'vitest';
import {
  currentYearPeriod,
  daysInMonth,
  isIsoDate,
  monthPeriod,
  toIsoDate,
  todayIso,
} from '../src/lib/dates';

describe('isIsoDate', () => {
  it('accepts a well-formed date', () => {
    expect(isIsoDate('2026-10-28')).toBe(true);
    expect(isIsoDate('2026-01-01')).toBe(true);
    expect(isIsoDate('2026-12-31')).toBe(true);
  });

  it('rejects a day that does not exist in that month', () => {
    // new Date() would roll this into March and store a wrong date silently.
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-04-31')).toBe(false);
    expect(isIsoDate('2026-11-31')).toBe(false);
  });

  it('knows about leap years', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2100-02-29')).toBe(false);
    expect(isIsoDate('2000-02-29')).toBe(true);
  });

  it('rejects an out-of-range month or day', () => {
    expect(isIsoDate('2026-00-10')).toBe(false);
    expect(isIsoDate('2026-13-10')).toBe(false);
    expect(isIsoDate('2026-10-00')).toBe(false);
  });

  it('rejects anything that is not a plain ISO date', () => {
    for (const bad of [
      '',
      '28.10.2026',
      '2026-10-28T12:00:00Z',
      '2026-1-1',
      '26-10-28',
      'today',
      null,
      42,
      undefined,
    ]) {
      expect(isIsoDate(bad), String(bad)).toBe(false);
    }
  });
});

describe('daysInMonth', () => {
  it('knows the month lengths', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('toIsoDate and todayIso', () => {
  it('uses the local calendar day, not UTC', () => {
    // 23:40 local on the 28th stays the 28th, whatever UTC says.
    const late = new Date(2026, 9, 28, 23, 40, 0);
    expect(toIsoDate(late)).toBe('2026-10-28');
  });

  it('keeps a just-after-midnight entry on the new day', () => {
    const early = new Date(2026, 9, 29, 0, 5, 0);
    expect(toIsoDate(early)).toBe('2026-10-29');
  });

  it('pads month and day to two digits', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('produces a value isIsoDate accepts', () => {
    expect(isIsoDate(todayIso())).toBe(true);
    expect(isIsoDate(todayIso(new Date(2026, 1, 29)))).toBe(true);
  });

  it('todayIso with an explicit instant matches toIsoDate', () => {
    const now = new Date(2026, 9, 28, 18, 0, 0);
    expect(todayIso(now)).toBe(toIsoDate(now));
  });
});

describe('currentYearPeriod (FR-6.3)', () => {
  it('spans the full calendar year of the given instant', () => {
    expect(currentYearPeriod(new Date(2026, 9, 28))).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('is stable on the first and last day of a year', () => {
    expect(currentYearPeriod(new Date(2026, 0, 1)).from).toBe('2026-01-01');
    expect(currentYearPeriod(new Date(2026, 11, 31, 23, 59)).to).toBe('2026-12-31');
  });
});

describe('monthPeriod', () => {
  it('covers a whole month inclusively', () => {
    expect(monthPeriod(2026, 10)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthPeriod(2026, 2)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthPeriod(2028, 2)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('pads a single-digit month', () => {
    expect(monthPeriod(2026, 1).from).toBe('2026-01-01');
  });
});
