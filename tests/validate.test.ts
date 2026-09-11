import { describe, expect, it } from 'vitest';
import {
  USAGE_WARNING_THRESHOLD_KWH,
  validateDraft,
  type FindingCode,
} from '../src/lib/validate';
import type { Reading } from '../src/types';

const mk = (id: string, date: string, meter: number, price = 0.28): Reading => ({
  id,
  date,
  meterKwh: meter,
  person: 'Hardegger',
  priceChfPerKwh: price,
  createdAt: `${date}T18:00:00Z`,
});

const readings: Reading[] = [
  mk('a', '2026-09-01', 0),
  mk('b', '2026-09-08', 42.5),
  mk('c', '2026-09-20', 95),
  mk('d', '2026-10-05', 150),
  mk('e', '2026-10-28', 210),
];

/** A fixed "now" so the future-date rule is deterministic. */
const now = new Date(2026, 10, 3, 18, 30, 0); // 3 November 2026, local

const codes = (result: { findings: { code: FindingCode }[] }) =>
  result.findings.map((f) => f.code);

describe('the happy path', () => {
  it('accepts a plausible reading without any finding', () => {
    const r = validateDraft({ meterRaw: '250', date: '2026-11-03' }, readings, now);
    expect(r.findings).toEqual([]);
    expect(r.canSave).toBe(true);
    expect(r.requiresConfirmation).toBe(false);
    expect(r.meterKwh).toBe(250);
    expect(r.usage?.usageKwh).toBe(40);
  });

  it('accepts the very first reading of all, which has no consumption', () => {
    const r = validateDraft({ meterRaw: '0', date: '2026-09-01' }, [], now);
    expect(r.canSave).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.usage?.usageKwh).toBeNull();
  });

  it('accepts a decimal comma (AC-5)', () => {
    const r = validateDraft({ meterRaw: '252,5', date: '2026-11-03' }, readings, now);
    expect(r.meterKwh).toBe(252.5);
    expect(r.canSave).toBe(true);
  });

  it('accepts today itself - the prefilled date must never be rejected', () => {
    const r = validateDraft({ meterRaw: '250', date: '2026-11-03' }, readings, now);
    expect(codes(r)).not.toContain('dateInFuture');
  });
});

describe('blocking: the meter input is not a number', () => {
  it('blocks when nothing was typed', () => {
    const r = validateDraft({ meterRaw: '', date: '2026-11-03' }, readings, now);
    expect(codes(r)).toContain('meterNotANumber');
    expect(r.canSave).toBe(false);
    expect(r.meterKwh).toBeNull();
  });

  it('blocks on text', () => {
    const r = validateDraft({ meterRaw: 'abc', date: '2026-11-03' }, readings, now);
    expect(r.canSave).toBe(false);
  });

  it('does not attempt a consumption preview without a number', () => {
    const r = validateDraft({ meterRaw: 'abc', date: '2026-11-03' }, readings, now);
    expect(r.usage).toBeNull();
  });
});

describe('blocking: the date (FR-2.3)', () => {
  it('rejects tomorrow', () => {
    const r = validateDraft({ meterRaw: '250', date: '2026-11-04' }, readings, now);
    expect(codes(r)).toContain('dateInFuture');
    expect(r.canSave).toBe(false);
  });

  it('rejects a date far in the future', () => {
    const r = validateDraft({ meterRaw: '250', date: '2030-01-01' }, readings, now);
    expect(r.canSave).toBe(false);
  });

  it('accepts yesterday and any past date', () => {
    for (const date of ['2026-11-02', '2026-01-01', '2020-06-15']) {
      const r = validateDraft({ meterRaw: '250', date }, readings, now);
      expect(codes(r), date).not.toContain('dateInFuture');
    }
  });

  it('judges "today" by the local day, so a late-evening entry is not tomorrow', () => {
    const lateEvening = new Date(2026, 10, 3, 23, 40, 0);
    const r = validateDraft({ meterRaw: '250', date: '2026-11-03' }, readings, lateEvening);
    expect(r.canSave).toBe(true);
  });

  it('reports today in the message parameters', () => {
    const r = validateDraft({ meterRaw: '250', date: '2026-11-04' }, readings, now);
    const finding = r.findings.find((f) => f.code === 'dateInFuture');
    expect(finding?.params).toEqual({ today: '2026-11-03' });
  });

  it('blocks a malformed date', () => {
    const r = validateDraft({ meterRaw: '250', date: '03.11.2026' }, readings, now);
    expect(codes(r)).toContain('dateMalformed');
    expect(r.canSave).toBe(false);
  });

  it('blocks a date that does not exist', () => {
    const r = validateDraft({ meterRaw: '250', date: '2026-02-30' }, readings, now);
    expect(codes(r)).toContain('dateMalformed');
  });

  it('reports malformed rather than future for an unparseable date', () => {
    const r = validateDraft({ meterRaw: '250', date: 'nonsense' }, readings, now);
    expect(codes(r)).toContain('dateMalformed');
    expect(codes(r)).not.toContain('dateInFuture');
  });
});

describe('warning: meter below the previous reading (FR-2.1)', () => {
  it('warns but still allows saving', () => {
    const r = validateDraft({ meterRaw: '5', date: '2026-11-03' }, readings, now);
    expect(codes(r)).toContain('meterBelowPrevious');
    expect(r.canSave).toBe(true);
    expect(r.requiresConfirmation).toBe(true);
  });

  it('names the previous value and its date, as the FR-2.1 message needs', () => {
    const r = validateDraft({ meterRaw: '5', date: '2026-11-03' }, readings, now);
    const finding = r.findings.find((f) => f.code === 'meterBelowPrevious');
    expect(finding?.params).toEqual({ previous: 210, date: '2026-10-28' });
  });

  it('counts the consumption as zero rather than negative', () => {
    const r = validateDraft({ meterRaw: '5', date: '2026-11-03' }, readings, now);
    expect(r.usage?.usageKwh).toBe(0);
    expect(r.usage?.meterReset).toBe(true);
  });

  it('compares against the chronological predecessor, not the newest reading', () => {
    // Backdated between b (42.5) and c (95): 40 is below b, so it warns and
    // names b, even though the newest reading is 210.
    const r = validateDraft({ meterRaw: '40', date: '2026-09-10' }, readings, now);
    const finding = r.findings.find((f) => f.code === 'meterBelowPrevious');
    expect(finding?.params).toEqual({ previous: 42.5, date: '2026-09-08' });
  });

  it('does not warn for a backdated entry that is above its own predecessor', () => {
    const r = validateDraft({ meterRaw: '60', date: '2026-09-10' }, readings, now);
    expect(codes(r)).not.toContain('meterBelowPrevious');
  });

  it('does not warn when the meter merely stayed the same', () => {
    const r = validateDraft({ meterRaw: '210', date: '2026-11-03' }, readings, now);
    expect(codes(r)).not.toContain('meterBelowPrevious');
    expect(r.usage?.usageKwh).toBe(0);
  });

  it('does not warn when there is no predecessor to compare against', () => {
    const r = validateDraft({ meterRaw: '0', date: '2020-01-01' }, readings, now);
    expect(codes(r)).not.toContain('meterBelowPrevious');
  });
});

describe('warning: consumption above one charge (FR-2.2)', () => {
  it('warns above the threshold but does not block', () => {
    const r = validateDraft({ meterRaw: '291', date: '2026-11-03' }, readings, now);
    expect(codes(r)).toContain('usageAboveCapacity');
    expect(r.canSave).toBe(true);
    expect(r.requiresConfirmation).toBe(true);
  });

  it('does not warn exactly at the threshold', () => {
    const r = validateDraft({ meterRaw: '290', date: '2026-11-03' }, readings, now);
    expect(r.usage?.usageKwh).toBe(USAGE_WARNING_THRESHOLD_KWH);
    expect(codes(r)).not.toContain('usageAboveCapacity');
  });

  it('warns just above the threshold', () => {
    const r = validateDraft({ meterRaw: '290.1', date: '2026-11-03' }, readings, now);
    expect(codes(r)).toContain('usageAboveCapacity');
  });

  it('reports the consumption and the limit for the message', () => {
    const r = validateDraft({ meterRaw: '400', date: '2026-11-03' }, readings, now);
    const finding = r.findings.find((f) => f.code === 'usageAboveCapacity');
    expect(finding?.params).toEqual({ usage: 190, limit: 80 });
  });

  it('uses the threshold the PRD gives - 64 kWh usable plus reserve', () => {
    expect(USAGE_WARNING_THRESHOLD_KWH).toBe(80);
  });

  it('does not warn on an opening reading, however large', () => {
    const r = validateDraft({ meterRaw: '5000', date: '2026-09-01' }, [], now);
    expect(r.findings).toEqual([]);
  });
});

describe('FR-2.4: no plausibility rule may prevent saving', () => {
  it('saves a wildly implausible entry rather than lose it', () => {
    const odd = [mk('x', '2026-11-01', 1000)];
    const r = validateDraft({ meterRaw: '5', date: '2026-11-02' }, odd, now);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.canSave).toBe(true);
  });

  it('the two warnings are mutually exclusive by construction', () => {
    // A meter reset forces consumption to 0, which can never exceed the
    // capacity threshold - so no draft can raise both warnings at once.
    const cases: Array<{ meterRaw: string; date: string }> = [
      { meterRaw: '5', date: '2026-11-03' },
      { meterRaw: '9999', date: '2026-11-03' },
      { meterRaw: '0', date: '2026-11-03' },
      { meterRaw: '210.1', date: '2026-11-03' },
    ];
    for (const c of cases) {
      expect(validateDraft(c, readings, now).warnings.length, JSON.stringify(c)).toBeLessThan(2);
    }
  });

  it('reports every warning rather than stopping at the first', () => {
    const sparse = [mk('x', '2026-11-01', 100)];
    const r = validateDraft({ meterRaw: '250', date: '2026-11-02' }, sparse, now);
    expect(codes(r)).toEqual(['usageAboveCapacity']);
    const below = validateDraft({ meterRaw: '50', date: '2026-11-02' }, sparse, now);
    expect(codes(below)).toEqual(['meterBelowPrevious']);
  });

  it('never marks a warning as blocking', () => {
    const r = validateDraft({ meterRaw: '5', date: '2026-11-03' }, readings, now);
    for (const w of r.warnings) expect(w.severity).toBe('warning');
    expect(r.blocking).toEqual([]);
  });

  it('has exactly two blocking causes across the whole rule set', () => {
    const blockingCodes = new Set<FindingCode>();
    const cases: Array<{ meterRaw: string; date: string }> = [
      { meterRaw: '', date: '2026-11-03' },
      { meterRaw: 'abc', date: '2026-11-03' },
      { meterRaw: '250', date: '2026-11-04' },
      { meterRaw: '250', date: 'nonsense' },
      { meterRaw: '5', date: '2026-11-03' },
      { meterRaw: '9999', date: '2026-11-03' },
    ];
    for (const c of cases) {
      for (const f of validateDraft(c, readings, now).blocking) blockingCodes.add(f.code);
    }
    expect([...blockingCodes].sort()).toEqual([
      'dateInFuture',
      'dateMalformed',
      'meterNotANumber',
    ]);
  });
});

describe('editing an existing reading (FR-4.2)', () => {
  it('excludes the reading itself, so it is not compared against its own old value', () => {
    const r = validateDraft(
      { id: 'e', meterRaw: '200', date: '2026-10-28', createdAt: '2026-10-28T18:00:00Z' },
      readings,
      now,
    );
    expect(r.usage?.previous?.id).toBe('d');
    expect(r.usage?.usageKwh).toBe(50);
    expect(r.findings).toEqual([]);
  });

  it('warns when an edit pushes the value below its predecessor', () => {
    const r = validateDraft(
      { id: 'e', meterRaw: '100', date: '2026-10-28', createdAt: '2026-10-28T18:00:00Z' },
      readings,
      now,
    );
    const finding = r.findings.find((f) => f.code === 'meterBelowPrevious');
    expect(finding?.params).toEqual({ previous: 150, date: '2026-10-05' });
    expect(r.canSave).toBe(true);
  });

  it('still rejects moving an edited reading into the future', () => {
    const r = validateDraft(
      { id: 'e', meterRaw: '210', date: '2027-01-01', createdAt: '2026-10-28T18:00:00Z' },
      readings,
      now,
    );
    expect(r.canSave).toBe(false);
  });
});

describe('the result shape the form relies on', () => {
  it('splits findings into blocking and warnings without losing any', () => {
    const r = validateDraft({ meterRaw: 'abc', date: '2026-11-04' }, readings, now);
    expect(r.blocking.length + r.warnings.length).toBe(r.findings.length);
    expect(r.blocking.length).toBe(2);
  });

  it('does not ask for confirmation while saving is blocked anyway', () => {
    const r = validateDraft({ meterRaw: 'abc', date: '2026-11-03' }, readings, now);
    expect(r.canSave).toBe(false);
    expect(r.requiresConfirmation).toBe(false);
  });

  it('uses the real clock when none is given', () => {
    const r = validateDraft({ meterRaw: '250', date: '2099-01-01' }, readings);
    expect(r.canSave).toBe(false);
  });
});
