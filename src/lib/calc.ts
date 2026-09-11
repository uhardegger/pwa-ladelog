/**
 * Derivation rules (PRD section 6, FR-4.4, FR-5).
 *
 * Consumption is never stored, only derived from the cumulative meter values.
 * That is what makes editing and deleting readings safe: there is no second
 * copy of a number that could fall out of sync (FR-4.2).
 *
 * Every function here is pure, which is why this is the module the PRD demands
 * unit tests for (section 8).
 */
import type {
  MonthTotal,
  Period,
  Reading,
  ReadingWithUsage,
} from '../types';

/**
 * The rounding conventions of FR-6.5, exported so every consumer rounds the
 * same way. Sums are rounded at each step rather than only at the end, so the
 * figures shown in the app are exactly the ones written to the spreadsheet.
 */
export const roundKwh = (n: number) => Math.round(n * 10) / 10;
export const roundChf = (n: number) => Math.round(n * 100) / 100;
export const roundPrice = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Chronological order: primarily by date, secondarily by capture timestamp.
 * Two readings taken on the same day therefore keep the order in which they
 * were entered. The id is the final tie-breaker, so the order is total and
 * stable no matter how the readings reached us.
 */
export function sortChronologically(readings: readonly Reading[]): Reading[] {
  return [...readings].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Derives the consumption of each reading from the cumulative meter values.
 *
 * - The first reading is the opening reading and has no consumption (FR-4.4).
 * - A negative difference indicates a meter swap; consumption counts as 0 and
 *   the reading is flagged (FR-2.1, PRD section 6).
 * - Deleting a reading in the middle recalculates the rest automatically,
 *   because every reading is measured against its direct predecessor (FR-4.2).
 */
export function withUsage(readings: readonly Reading[]): ReadingWithUsage[] {
  const sorted = sortChronologically(readings);
  return sorted.map((r, i) => {
    const previous = sorted[i - 1];
    if (!previous) return { ...r, usageKwh: null, meterReset: false };
    const diff = roundKwh(r.meterKwh - previous.meterKwh);
    return diff < 0
      ? { ...r, usageKwh: 0, meterReset: true }
      : { ...r, usageKwh: diff, meterReset: false };
  });
}

/** The chronologically last reading, for the "last reading" hint of FR-1.2. */
export function latestReading(readings: readonly Reading[]): Reading | null {
  const sorted = sortChronologically(readings);
  return sorted[sorted.length - 1] ?? null;
}

/** A reading being typed, before it has an id or a capture timestamp. */
export interface ReadingDraft {
  /** Set when an existing reading is being edited, absent while capturing. */
  id?: string;
  date: string;
  meterKwh: number;
  createdAt?: string;
}

export interface DraftUsage {
  /** Consumption the draft would have. null when it would be the first reading. */
  usageKwh: number | null;
  /** true when the draft's meter value is below its predecessor's (FR-2.1). */
  meterReset: boolean;
  /** The reading the draft would be measured against, if any. */
  previous: Reading | null;
}

/**
 * Consumption the draft would produce once saved - the live figure of FR-1.3.
 *
 * The draft is placed into the real list and run through `withUsage`, rather
 * than compared against the latest reading, so a backdated entry previews
 * against its actual predecessor and the preview can never disagree with what
 * is stored afterwards.
 */
export function usageForDraft(
  readings: readonly Reading[],
  draft: ReadingDraft,
): DraftUsage {
  const id = draft.id ?? '￿-draft';
  const candidate: Reading = {
    id,
    date: draft.date,
    meterKwh: draft.meterKwh,
    person: '',
    priceChfPerKwh: 0,
    // Without a timestamp the draft sorts after same-day readings, which is
    // where a newly captured reading will land.
    createdAt: draft.createdAt ?? `${draft.date}T23:59:59.999Z`,
  };

  const others = draft.id === undefined ? readings : readings.filter((r) => r.id !== draft.id);
  const computed = withUsage([...others, candidate]);
  const index = computed.findIndex((r) => r.id === id);
  const self = computed[index];
  if (!self) return { usageKwh: null, meterReset: false, previous: null };

  return {
    usageKwh: self.usageKwh,
    meterReset: self.meterReset,
    previous: computed[index - 1] ?? null,
  };
}

/** Aggregates by calendar month, ascending (FR-5.1). */
export function monthlyTotals(readings: readonly Reading[]): MonthTotal[] {
  const buckets = new Map<string, MonthTotal>();

  for (const r of withUsage(readings)) {
    if (r.usageKwh === null || r.usageKwh === 0) continue;
    const [y, m] = r.date.split('-');
    const key = `${y}-${m}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        key,
        year: Number(y),
        month: Number(m),
        totalKwh: 0,
        byPerson: {},
        amountChf: 0,
      };
      buckets.set(key, b);
    }
    b.totalKwh = roundKwh(b.totalKwh + r.usageKwh);
    b.byPerson[r.person] = roundKwh((b.byPerson[r.person] ?? 0) + r.usageKwh);
    // Valued at the price frozen in the reading, not at today's price (FR-5.3).
    b.amountChf = roundChf(b.amountChf + r.usageKwh * r.priceChfPerKwh);
  }

  return [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/**
 * Every person who consumed anything, sorted for display.
 *
 * The collation locale is a parameter because the person columns of the
 * monthly overview follow the UI language, while the Excel export stays
 * German for its recipient.
 */
export function personsIn(
  readings: readonly Reading[],
  locale: string = 'de-CH',
): string[] {
  const set = new Set<string>();
  for (const r of withUsage(readings)) {
    if (r.usageKwh) set.add(r.person);
  }
  return [...set].sort((a, b) => a.localeCompare(b, locale));
}

/** Restricts to a settlement period, bounds inclusive (FR-6.3). */
export function inPeriod(
  readings: readonly ReadingWithUsage[],
  period: Period,
): ReadingWithUsage[] {
  return readings.filter((r) => r.date >= period.from && r.date <= period.to);
}

/**
 * Totals for the settlement sheet.
 *
 * Each reading is valued at its own frozen price; `priceChfPerKwh` is therefore
 * the weighted average, which equals the single price exactly as long as the
 * tariff did not change within the period.
 */
export function periodTotal(
  readings: readonly Reading[],
  period: Period,
): { totalKwh: number; amountChf: number; priceChfPerKwh: number } {
  const rows = inPeriod(withUsage(readings), period);
  let kwh = 0;
  let chf = 0;
  for (const r of rows) {
    if (!r.usageKwh) continue;
    kwh += r.usageKwh;
    chf += r.usageKwh * r.priceChfPerKwh;
  }
  const totalKwh = roundKwh(kwh);
  const amountChf = roundChf(chf);
  return {
    totalKwh,
    amountChf,
    priceChfPerKwh: totalKwh > 0 ? roundPrice(chf / kwh) : 0,
  };
}

/**
 * Reads "42,5" the same as "42.5" (FR-1.1, AC-5). Returns null when there is no
 * usable number; the UI decides what to say about it.
 */
export function parseKwhInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (cleaned === '' || !/^\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
