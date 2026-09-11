import { describe, expect, it } from 'vitest';
import {
  inPeriod,
  latestReading,
  monthlyTotals,
  parseKwhInput,
  periodTotal,
  personsIn,
  sortChronologically,
  usageForDraft,
  withUsage,
} from '../src/lib/calc';
import type { Reading } from '../src/types';

const mk = (
  id: string,
  date: string,
  meter: number,
  person: string,
  price = 0.28,
): Reading => ({
  id,
  date,
  meterKwh: meter,
  person,
  priceChfPerKwh: price,
  createdAt: `${date}T18:00:00Z`,
});

/**
 * The reference data set from the specification. Its expected values were
 * verified independently, so these assertions are a regression net against
 * accidental changes to the derivation rules.
 */
const readings: Reading[] = [
  mk('a', '2026-09-01', 0, 'Hardegger'),
  mk('b', '2026-09-08', 42.5, 'Hardegger'),
  mk('c', '2026-09-20', 95, 'Partnerin'),
  mk('d', '2026-10-05', 150, 'Hardegger'),
  mk('e', '2026-10-28', 210, 'Hardegger'),
  mk('f', '2026-11-03', 5, 'Hardegger'), // meter swap -> 0
  mk('g', '2027-01-10', 60, 'Partnerin', 0.31),
];

describe('sortChronologically', () => {
  it('orders by date regardless of input order', () => {
    const shuffled = [readings[3]!, readings[0]!, readings[6]!, readings[1]!];
    expect(sortChronologically(shuffled).map((r) => r.id)).toEqual(['a', 'b', 'd', 'g']);
  });

  it('breaks a same-day tie by capture timestamp', () => {
    const morning = { ...mk('m', '2026-09-01', 10, 'X'), createdAt: '2026-09-01T07:00:00Z' };
    const evening = { ...mk('e', '2026-09-01', 20, 'X'), createdAt: '2026-09-01T19:00:00Z' };
    expect(sortChronologically([evening, morning]).map((r) => r.id)).toEqual(['m', 'e']);
  });

  it('breaks an identical timestamp by id, so the order is total and stable', () => {
    const first = { ...mk('aaa', '2026-09-01', 10, 'X'), createdAt: '2026-09-01T07:00:00Z' };
    const second = { ...mk('bbb', '2026-09-01', 20, 'X'), createdAt: '2026-09-01T07:00:00Z' };
    expect(sortChronologically([second, first]).map((r) => r.id)).toEqual(['aaa', 'bbb']);
    expect(sortChronologically([first, second]).map((r) => r.id)).toEqual(['aaa', 'bbb']);
  });

  it('does not mutate its input', () => {
    const input = [readings[3]!, readings[0]!];
    const before = input.map((r) => r.id);
    sortChronologically(input);
    expect(input.map((r) => r.id)).toEqual(before);
  });

  it('handles an empty list', () => {
    expect(sortChronologically([])).toEqual([]);
  });
});

describe('withUsage (FR-4.4, FR-2.1, PRD section 6)', () => {
  const u = withUsage(readings);

  it('leaves the first reading without consumption', () => {
    expect(u[0]!.usageKwh).toBeNull();
  });

  it('derives the reference consumption series', () => {
    expect(u.map((r) => r.usageKwh)).toEqual([null, 42.5, 52.5, 55, 60, 0, 55]);
  });

  it('flags the meter swap and counts it as zero, not as a negative', () => {
    expect(u.map((r) => r.meterReset)).toEqual([
      false, false, false, false, false, true, false,
    ]);
    expect(u[5]!.usageKwh).toBe(0);
  });

  it('recalculates the rest when a reading in the middle is deleted (FR-4.2)', () => {
    const without = readings.filter((r) => r.id !== 'd');
    expect(withUsage(without).map((r) => r.usageKwh)).toEqual([
      null, 42.5, 52.5, 115, 0, 55,
    ]);
  });

  it('recalculates when the first reading is deleted - the second becomes the opening one', () => {
    const without = readings.filter((r) => r.id !== 'a');
    expect(withUsage(without).map((r) => r.usageKwh)).toEqual([null, 52.5, 55, 60, 0, 55]);
  });

  it('sorts before deriving, so input order cannot change the result', () => {
    const reversed = [...readings].reverse();
    expect(withUsage(reversed).map((r) => r.usageKwh)).toEqual(
      withUsage(readings).map((r) => r.usageKwh),
    );
  });

  it('rounds to one decimal rather than accumulating float noise', () => {
    const drifting = [mk('x', '2026-01-01', 0.1, 'X'), mk('y', '2026-01-02', 0.3, 'X')];
    expect(withUsage(drifting)[1]!.usageKwh).toBe(0.2);
  });

  it('treats an unchanged meter as zero consumption without flagging a swap', () => {
    const flat = [mk('x', '2026-01-01', 100, 'X'), mk('y', '2026-01-02', 100, 'X')];
    const result = withUsage(flat);
    expect(result[1]!.usageKwh).toBe(0);
    expect(result[1]!.meterReset).toBe(false);
  });

  it('returns an empty list for no readings', () => {
    expect(withUsage([])).toEqual([]);
  });

  it('carries the original fields through untouched', () => {
    const withNote = { ...mk('n', '2026-01-01', 5, 'X'), note: 'garage' };
    expect(withUsage([withNote])[0]).toMatchObject({ ...withNote, usageKwh: null });
  });
});

describe('latestReading (FR-1.2)', () => {
  it('returns the chronologically last reading, not the last in the array', () => {
    expect(latestReading(readings)?.id).toBe('g');
    expect(latestReading([...readings].reverse())?.id).toBe('g');
  });

  it('prefers the later capture timestamp on the same day', () => {
    const morning = { ...mk('m', '2026-09-01', 10, 'X'), createdAt: '2026-09-01T07:00:00Z' };
    const evening = { ...mk('e', '2026-09-01', 20, 'X'), createdAt: '2026-09-01T19:00:00Z' };
    expect(latestReading([evening, morning])?.id).toBe('e');
  });

  it('returns null when there is nothing yet', () => {
    expect(latestReading([])).toBeNull();
  });
});

describe('usageForDraft (FR-1.3)', () => {
  it('previews the consumption of a new reading against the latest one', () => {
    const draft = usageForDraft(readings, { date: '2027-01-20', meterKwh: 100 });
    expect(draft.usageKwh).toBe(40);
    expect(draft.meterReset).toBe(false);
    expect(draft.previous?.id).toBe('g');
  });

  it('previews against the actual predecessor when the date is backdated', () => {
    const draft = usageForDraft(readings, { date: '2026-09-10', meterKwh: 60 });
    expect(draft.previous?.id).toBe('b');
    expect(draft.usageKwh).toBe(17.5);
  });

  it('reports no consumption when the draft would be the very first reading', () => {
    const draft = usageForDraft([], { date: '2026-09-01', meterKwh: 0 });
    expect(draft.usageKwh).toBeNull();
    expect(draft.previous).toBeNull();
  });

  it('reports no consumption when the draft predates every stored reading', () => {
    const draft = usageForDraft(readings, { date: '2020-01-01', meterKwh: 5 });
    expect(draft.usageKwh).toBeNull();
    expect(draft.previous).toBeNull();
  });

  it('flags a draft below its predecessor as a meter swap', () => {
    const draft = usageForDraft(readings, { date: '2027-02-01', meterKwh: 1 });
    expect(draft.meterReset).toBe(true);
    expect(draft.usageKwh).toBe(0);
  });

  it('excludes the edited reading itself, so editing does not compare against the old value', () => {
    const draft = usageForDraft(readings, { id: 'e', date: '2026-10-28', meterKwh: 200 });
    expect(draft.previous?.id).toBe('d');
    expect(draft.usageKwh).toBe(50);
  });

  it('agrees with what withUsage will derive once the draft is saved', () => {
    const draft = { id: 'new', date: '2027-01-20', meterKwh: 100 };
    const preview = usageForDraft(readings, draft);
    const saved = withUsage([...readings, mk('new', '2027-01-20', 100, 'Hardegger')]);
    expect(preview.usageKwh).toBe(saved[saved.length - 1]!.usageKwh);
  });

  it('sorts a same-day draft after the existing readings of that day', () => {
    const draft = usageForDraft(readings, { date: '2026-10-28', meterKwh: 230 });
    expect(draft.previous?.id).toBe('e');
    expect(draft.usageKwh).toBe(20);
  });
});

describe('monthlyTotals (FR-5.1, FR-5.3)', () => {
  const m = monthlyTotals(readings);

  it('produces one bucket per month that had consumption, ascending', () => {
    expect(m.map((x) => x.key)).toEqual(['2026-09', '2026-10', '2027-01']);
  });

  it('crosses the year boundary in the right order', () => {
    expect(m.map((x) => [x.year, x.month])).toEqual([
      [2026, 9],
      [2026, 10],
      [2027, 1],
    ]);
  });

  it('totals September correctly', () => {
    expect(m[0]!.totalKwh).toBe(95);
  });

  it('splits September per person', () => {
    expect(m[0]!.byPerson).toEqual({ Hardegger: 42.5, Partnerin: 52.5 });
  });

  it('values September at the frozen price', () => {
    expect(m[0]!.amountChf).toBe(26.6);
  });

  it('totals October correctly', () => {
    expect(m[1]!.totalKwh).toBe(115);
  });

  it('values January at the price stored in that reading, not at the current one', () => {
    expect(m[2]!.amountChf).toBe(17.05);
  });

  it('omits a month whose only reading was a meter swap', () => {
    expect(m.map((x) => x.key)).not.toContain('2026-11');
  });

  it('never places consumption in the month of the preceding reading', () => {
    // The October readings must not leak into September's bucket.
    expect(m[0]!.totalKwh + m[1]!.totalKwh + m[2]!.totalKwh).toBe(265);
  });

  it('aggregates a month whose readings span the turn of the year', () => {
    const spanning = [
      mk('p', '2026-12-28', 100, 'Hardegger'),
      mk('q', '2027-01-03', 140, 'Hardegger'),
      mk('r', '2027-01-29', 180, 'Partnerin'),
    ];
    const totals = monthlyTotals(spanning);
    expect(totals.map((x) => x.key)).toEqual(['2027-01']);
    expect(totals[0]!.totalKwh).toBe(80);
    expect(totals[0]!.byPerson).toEqual({ Hardegger: 40, Partnerin: 40 });
  });

  it('mixes two prices within one month correctly', () => {
    const mixed = [
      mk('p', '2026-12-01', 0, 'Hardegger'),
      mk('q', '2026-12-10', 100, 'Hardegger', 0.28),
      mk('r', '2026-12-20', 200, 'Hardegger', 0.31),
    ];
    // 100 * 0.28 + 100 * 0.31
    expect(monthlyTotals(mixed)[0]!.amountChf).toBe(59);
  });

  it('returns nothing for an empty list or a single opening reading', () => {
    expect(monthlyTotals([])).toEqual([]);
    expect(monthlyTotals([readings[0]!])).toEqual([]);
  });
});

describe('personsIn', () => {
  it('lists everyone who consumed, sorted', () => {
    expect(personsIn(readings)).toEqual(['Hardegger', 'Partnerin']);
  });

  it('ignores a person who only has the opening reading', () => {
    const opening = [
      mk('a', '2026-09-01', 0, 'Opener'),
      mk('b', '2026-09-08', 10, 'Charger'),
    ];
    expect(personsIn(opening)).toEqual(['Charger']);
  });

  it('collates according to the given locale', () => {
    const umlaut = [
      mk('a', '2026-09-01', 0, 'A'),
      mk('b', '2026-09-02', 10, 'Zoe'),
      mk('c', '2026-09-03', 20, 'Ärni'),
      mk('d', '2026-09-04', 30, 'Bea'),
    ];
    expect(personsIn(umlaut, 'de-CH')).toEqual(['Ärni', 'Bea', 'Zoe']);
  });

  it('returns an empty list when nothing was consumed', () => {
    expect(personsIn([])).toEqual([]);
  });
});

describe('inPeriod (FR-6.3)', () => {
  const all = withUsage(readings);

  it('includes both bounds', () => {
    const rows = inPeriod(all, { from: '2026-09-01', to: '2026-09-20' });
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('excludes readings just outside the bounds', () => {
    const rows = inPeriod(all, { from: '2026-09-02', to: '2026-09-19' });
    expect(rows.map((r) => r.id)).toEqual(['b']);
  });

  it('returns nothing for a period without readings', () => {
    expect(inPeriod(all, { from: '2030-01-01', to: '2030-12-31' })).toEqual([]);
  });
});

describe('periodTotal (FR-6.2)', () => {
  it('totals the calendar year 2026', () => {
    const t = periodTotal(readings, { from: '2026-01-01', to: '2026-12-31' });
    expect(t.totalKwh).toBe(210);
    expect(t.amountChf).toBe(58.8);
  });

  it('reports the weighted average price across a tariff change', () => {
    const t = periodTotal(readings, { from: '2026-01-01', to: '2027-12-31' });
    expect(t.priceChfPerKwh).toBe(0.2862);
  });

  it('reports the single price exactly when the tariff never changed', () => {
    const t = periodTotal(readings, { from: '2026-01-01', to: '2026-12-31' });
    expect(t.priceChfPerKwh).toBe(0.28);
  });

  it('returns zeroes, not NaN, for a period with no consumption', () => {
    const t = periodTotal(readings, { from: '2030-01-01', to: '2030-12-31' });
    expect(t).toEqual({ totalKwh: 0, amountChf: 0, priceChfPerKwh: 0 });
  });

  it('excludes the opening reading, which has no consumption', () => {
    const t = periodTotal([readings[0]!], { from: '2026-01-01', to: '2026-12-31' });
    expect(t.totalKwh).toBe(0);
  });

  it('matches the sum of the monthly totals it covers', () => {
    const t = periodTotal(readings, { from: '2026-01-01', to: '2027-12-31' });
    const months = monthlyTotals(readings);
    const summed = months.reduce((a, m) => a + m.totalKwh, 0);
    expect(t.totalKwh).toBe(Math.round(summed * 10) / 10);
  });
});

describe('parseKwhInput (FR-1.1, AC-5)', () => {
  it('reads a decimal comma', () => {
    expect(parseKwhInput('42,5')).toBe(42.5);
  });

  it('reads a decimal point', () => {
    expect(parseKwhInput('42.5')).toBe(42.5);
  });

  it('trims whitespace around the number', () => {
    expect(parseKwhInput(' 210 ')).toBe(210);
    expect(parseKwhInput('\t42.5\n')).toBe(42.5);
  });

  it('rejects whitespace inside the number rather than guessing', () => {
    // "2 10" could be 210 or 2.10. Refusing costs a retype; guessing wrong
    // corrupts every consumption figure derived from this reading afterwards.
    expect(parseKwhInput('2 10')).toBeNull();
    expect(parseKwhInput('42 .5')).toBeNull();
    expect(parseKwhInput('42. 5')).toBeNull();
  });

  it('rejects a non-breaking space inside the number', () => {
    // A paste from another app can carry one, and it looks just like a space.
    expect(parseKwhInput('2\u00A010')).toBeNull();
  });

  it('still trims a non-breaking space at the ends', () => {
    expect(parseKwhInput('\u00A0210\u00A0')).toBe(210);
  });

  it('rejects text', () => {
    expect(parseKwhInput('abc')).toBeNull();
    expect(parseKwhInput('42kWh')).toBeNull();
  });

  it('rejects an empty input', () => {
    expect(parseKwhInput('')).toBeNull();
    expect(parseKwhInput('   ')).toBeNull();
  });

  it('rejects a negative value - a cumulative meter cannot go below zero', () => {
    expect(parseKwhInput('-5')).toBeNull();
  });

  it('rejects a thousands separator, which would silently change the value', () => {
    expect(parseKwhInput('1,234.5')).toBeNull();
  });

  it('accepts a leading or trailing decimal separator while typing', () => {
    expect(parseKwhInput('.5')).toBe(0.5);
    expect(parseKwhInput('42,')).toBe(42);
  });

  it('accepts zero', () => {
    expect(parseKwhInput('0')).toBe(0);
  });
});
