/**
 * Monthly overview (FR-5.1).
 *
 * `monthlyTotals` in calc.ts does the arithmetic; this module arranges it for
 * display: one stable set of person columns across all months, months grouped
 * into years, headings in the user's language, and totals at every level.
 *
 * Months without consumption are omitted rather than shown as a zero row. The
 * overview is something to scroll, and the "Ablesungen" sheet of the export
 * carries the raw evidence for any month in question.
 *
 * Order is newest first throughout, matching the reading list (FR-4.1): the
 * month you just logged should be the one you see without scrolling.
 */
import { monthlyTotals, personsIn, roundChf, roundKwh } from './calc';
import { formatMonth, localeOf } from '../i18n';
import type { Language, MonthTotal, Reading } from '../types';

export interface OverviewRow {
  /** Sortable key, e.g. "2026-10". */
  key: string;
  year: number;
  /** 1-12. */
  month: number;
  /** Localised heading, e.g. "Oktober 2026" or "October 2026". */
  label: string;
  totalKwh: number;
  amountChf: number;
  /** kWh per person, aligned index-by-index with `Overview.persons`. */
  perPerson: number[];
}

export interface YearGroup {
  year: number;
  /** Months of this year, newest first. */
  months: OverviewRow[];
  totalKwh: number;
  amountChf: number;
  perPerson: number[];
}

export interface Overview {
  /** Column order, identical for every row. Empty when nothing was consumed. */
  persons: string[];
  /** Years, newest first. */
  years: YearGroup[];
  totalKwh: number;
  amountChf: number;
  perPerson: number[];
  /** True when there is nothing to show yet - the UI shows a hint instead. */
  isEmpty: boolean;
}

function rowFor(month: MonthTotal, persons: readonly string[], lang: Language): OverviewRow {
  return {
    key: month.key,
    year: month.year,
    month: month.month,
    label: formatMonth(lang, month.year, month.month),
    totalKwh: month.totalKwh,
    amountChf: month.amountChf,
    // A person who did not charge this month gets an explicit 0, so the columns
    // stay aligned and a gap is never mistaken for a missing figure.
    perPerson: persons.map((p) => month.byPerson[p] ?? 0),
  };
}

function sumColumns(rows: readonly { perPerson: number[] }[], width: number): number[] {
  return Array.from({ length: width }, (_, i) =>
    roundKwh(rows.reduce((sum, row) => sum + (row.perPerson[i] ?? 0), 0)),
  );
}

/**
 * Builds the whole overview in one pass.
 *
 * @param lang decides the month headings and the collation of the person
 *             columns; the Excel export builds its own, always German.
 */
export function buildOverview(readings: readonly Reading[], lang: Language): Overview {
  const persons = personsIn(readings, localeOf(lang));
  const months = monthlyTotals(readings).map((m) => rowFor(m, persons, lang));

  const byYear = new Map<number, OverviewRow[]>();
  for (const row of months) {
    const bucket = byYear.get(row.year);
    if (bucket) bucket.push(row);
    else byYear.set(row.year, [row]);
  }

  const years: YearGroup[] = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, rows]) => {
      const ordered = [...rows].sort((a, b) => b.month - a.month);
      return {
        year,
        months: ordered,
        totalKwh: roundKwh(ordered.reduce((s, r) => s + r.totalKwh, 0)),
        amountChf: roundChf(ordered.reduce((s, r) => s + r.amountChf, 0)),
        perPerson: sumColumns(ordered, persons.length),
      };
    });

  return {
    persons,
    years,
    totalKwh: roundKwh(years.reduce((s, y) => s + y.totalKwh, 0)),
    amountChf: roundChf(years.reduce((s, y) => s + y.amountChf, 0)),
    perPerson: sumColumns(years, persons.length),
    isEmpty: months.length === 0,
  };
}

/** Flattens the overview back to a single list of months, newest first. */
export function allMonths(overview: Overview): OverviewRow[] {
  return overview.years.flatMap((y) => y.months);
}
