/**
 * Plain calendar dates.
 *
 * Readings carry a date, never an instant. Everything here therefore works on
 * the local calendar day, because that is what the person in the garage sees on
 * their phone: an entry made at 23:40 belongs to that day, not to the next one
 * in UTC.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True for a well-formed ISO-8601 calendar date that actually exists.
 * Rejects "2026-02-30", which `new Date()` would silently roll into March.
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The local calendar day of `now` as an ISO date. */
export function toIsoDate(now: Date): string {
  const y = String(now.getFullYear()).padStart(4, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today, as the device sees it. `now` is injectable so behaviour is testable. */
export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

/** The calendar year containing `now` - the default settlement period (FR-6.3). */
export function currentYearPeriod(now: Date = new Date()): { from: string; to: string } {
  const year = now.getFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** The calendar month containing the given date, as an inclusive period. */
export function monthPeriod(year: number, month: number): { from: string; to: string } {
  const mm = String(month).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, '0')}`,
  };
}
