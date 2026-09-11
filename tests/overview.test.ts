import { describe, expect, it } from 'vitest';
import { allMonths, buildOverview } from '../src/lib/overview';
import { monthlyTotals, periodTotal } from '../src/lib/calc';
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

const readings: Reading[] = [
  mk('a', '2026-09-01', 0, 'Hardegger'),
  mk('b', '2026-09-08', 42.5, 'Hardegger'),
  mk('c', '2026-09-20', 95, 'Partnerin'),
  mk('d', '2026-10-05', 150, 'Hardegger'),
  mk('e', '2026-10-28', 210, 'Hardegger'),
  mk('f', '2026-11-03', 5, 'Hardegger'), // meter swap -> no November bucket
  mk('g', '2027-01-10', 60, 'Partnerin', 0.31),
];

describe('structure', () => {
  const o = buildOverview(readings, 'de');

  it('groups months into years, newest year first', () => {
    expect(o.years.map((y) => y.year)).toEqual([2027, 2026]);
  });

  it('orders months newest first within a year (FR-4.1)', () => {
    expect(o.years[1]!.months.map((m) => m.key)).toEqual(['2026-10', '2026-09']);
  });

  it('flattens to a single newest-first list', () => {
    expect(allMonths(o).map((m) => m.key)).toEqual(['2027-01', '2026-10', '2026-09']);
  });

  it('omits a month with no consumption', () => {
    expect(allMonths(o).map((m) => m.key)).not.toContain('2026-11');
  });

  it('covers exactly the months calc produced', () => {
    expect(allMonths(o).map((m) => m.key).sort()).toEqual(
      monthlyTotals(readings).map((m) => m.key).sort(),
    );
  });
});

describe('person columns', () => {
  const o = buildOverview(readings, 'de');

  it('uses one stable column order for every row', () => {
    expect(o.persons).toEqual(['Hardegger', 'Partnerin']);
    for (const m of allMonths(o)) expect(m.perPerson).toHaveLength(o.persons.length);
  });

  it('aligns each value with its person', () => {
    const september = allMonths(o).find((m) => m.key === '2026-09')!;
    expect(september.perPerson).toEqual([42.5, 52.5]);
  });

  it('writes an explicit zero for a person who did not charge that month', () => {
    const october = allMonths(o).find((m) => m.key === '2026-10')!;
    // Only Hardegger charged in October.
    expect(october.perPerson).toEqual([115, 0]);
  });

  it('keeps the columns when a person only ever appears in one month', () => {
    const january = allMonths(o).find((m) => m.key === '2027-01')!;
    expect(january.perPerson).toEqual([0, 55]);
  });

  it('has no columns at all when nothing was consumed', () => {
    const empty = buildOverview([readings[0]!], 'de');
    expect(empty.persons).toEqual([]);
    expect(empty.perPerson).toEqual([]);
  });

  it('collates the columns for the given language', () => {
    const umlauts = [
      mk('a', '2026-01-01', 0, 'A'),
      mk('b', '2026-01-02', 10, 'Zoe'),
      mk('c', '2026-01-03', 20, 'Ärni'),
    ];
    expect(buildOverview(umlauts, 'de').persons).toEqual(['Ärni', 'Zoe']);
  });
});

describe('totals', () => {
  const o = buildOverview(readings, 'de');

  it('totals each month', () => {
    expect(allMonths(o).map((m) => m.totalKwh)).toEqual([55, 115, 95]);
  });

  it('totals each year from its months', () => {
    expect(o.years[0]!.totalKwh).toBe(55);
    expect(o.years[1]!.totalKwh).toBe(210);
  });

  it('totals each year per person', () => {
    expect(o.years[1]!.perPerson).toEqual([157.5, 52.5]);
    expect(o.years[0]!.perPerson).toEqual([0, 55]);
  });

  it('produces a grand total over all years', () => {
    expect(o.totalKwh).toBe(265);
    expect(o.perPerson).toEqual([157.5, 107.5]);
  });

  it('has person columns that add up to the total', () => {
    const summed = o.perPerson.reduce((a, b) => a + b, 0);
    expect(Math.round(summed * 10) / 10).toBe(o.totalKwh);
  });

  it('values each month at the price frozen in its readings (FR-5.3)', () => {
    const january = allMonths(o).find((m) => m.key === '2027-01')!;
    expect(january.amountChf).toBe(17.05); // 55 kWh at 0.31
    const september = allMonths(o).find((m) => m.key === '2026-09')!;
    expect(september.amountChf).toBe(26.6); // 95 kWh at 0.28
  });

  it('totals the amounts per year and overall', () => {
    expect(o.years[1]!.amountChf).toBe(58.8);
    expect(o.years[0]!.amountChf).toBe(17.05);
    expect(o.amountChf).toBe(75.85);
  });

  it('agrees with periodTotal over the same span', () => {
    const t = periodTotal(readings, { from: '2026-01-01', to: '2027-12-31' });
    expect(o.totalKwh).toBe(t.totalKwh);
    expect(o.amountChf).toBe(t.amountChf);
  });

  it('a single year agrees with periodTotal for that year', () => {
    const t = periodTotal(readings, { from: '2026-01-01', to: '2026-12-31' });
    expect(o.years[1]!.totalKwh).toBe(t.totalKwh);
    expect(o.years[1]!.amountChf).toBe(t.amountChf);
  });
});

describe('labels', () => {
  it('localises the month heading', () => {
    const de = buildOverview(readings, 'de');
    const en = buildOverview(readings, 'en');
    expect(allMonths(de).map((m) => m.label)).toEqual([
      'Januar 2027',
      'Oktober 2026',
      'September 2026',
    ]);
    expect(allMonths(en).map((m) => m.label)).toEqual([
      'January 2027',
      'October 2026',
      'September 2026',
    ]);
  });

  it('changes only the labels, not the figures, when the language changes', () => {
    const de = buildOverview(readings, 'de');
    const en = buildOverview(readings, 'en');
    expect(allMonths(en).map((m) => m.totalKwh)).toEqual(
      allMonths(de).map((m) => m.totalKwh),
    );
    expect(en.amountChf).toBe(de.amountChf);
  });
});

describe('edge cases', () => {
  it('reports empty for no readings at all', () => {
    const o = buildOverview([], 'de');
    expect(o.isEmpty).toBe(true);
    expect(o.years).toEqual([]);
    expect(o.totalKwh).toBe(0);
    expect(o.amountChf).toBe(0);
  });

  it('reports empty when only the opening reading exists', () => {
    expect(buildOverview([readings[0]!], 'de').isEmpty).toBe(true);
  });

  it('is not empty as soon as one month has consumption', () => {
    expect(buildOverview(readings.slice(0, 2), 'de').isEmpty).toBe(false);
  });

  it('handles a year that has a single month', () => {
    const o = buildOverview(
      [mk('a', '2026-03-01', 0, 'X'), mk('b', '2026-03-15', 30, 'X')],
      'de',
    );
    expect(o.years).toHaveLength(1);
    expect(o.years[0]!.months).toHaveLength(1);
    expect(o.years[0]!.totalKwh).toBe(30);
  });

  it('spans several years without losing a month', () => {
    const many = [
      mk('a', '2025-01-01', 0, 'X'),
      mk('b', '2025-06-01', 100, 'X'),
      mk('c', '2026-06-01', 200, 'X'),
      mk('d', '2027-06-01', 300, 'X'),
    ];
    const o = buildOverview(many, 'de');
    expect(o.years.map((y) => y.year)).toEqual([2027, 2026, 2025]);
    expect(o.totalKwh).toBe(300);
  });

  it('does not mutate the readings it was given', () => {
    const input = [...readings];
    const snapshot = JSON.stringify(input);
    buildOverview(input, 'de');
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
