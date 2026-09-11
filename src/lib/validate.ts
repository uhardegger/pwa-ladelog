/**
 * Plausibility checks (FR-2).
 *
 * The governing rule is FR-2.4: "no hard validation may prevent saving. An
 * implausible entry is better than a lost one." Almost everything here is
 * therefore a warning that the user can confirm past.
 *
 * There are exactly two blocking cases, and neither is a plausibility judgement:
 *   - the meter input is not a number at all, so there is nothing to store;
 *   - the date is in the future, which FR-2.3 rejects outright.
 * Everything else - a lower meter value, an implausibly large consumption -
 * warns and saves.
 */
import { parseKwhInput, usageForDraft, type DraftUsage } from './calc';
import { isIsoDate, todayIso } from './dates';
import type { Reading } from '../types';

/**
 * Consumption above this warns (FR-2.2): the usable battery of the vehicle is
 * 64 kWh, the rest is headroom for charging losses and a top-up on the same day.
 */
export const USAGE_WARNING_THRESHOLD_KWH = 80;

export type Severity = 'warning' | 'blocking';

export type FindingCode =
  /** The meter input cannot be read as a number. */
  | 'meterNotANumber'
  /** The date is not a real calendar date. */
  | 'dateMalformed'
  /** The date lies in the future (FR-2.3). */
  | 'dateInFuture'
  /** The meter value is below its predecessor - meter swap or typo (FR-2.1). */
  | 'meterBelowPrevious'
  /** The derived consumption exceeds the plausible maximum (FR-2.2). */
  | 'usageAboveCapacity';

export interface Finding {
  code: FindingCode;
  severity: Severity;
  /** Values for the message placeholders, e.g. the previous meter reading. */
  params?: Record<string, string | number>;
}

/** What the capture form holds while being filled in. */
export interface DraftInput {
  /** Set when an existing reading is being edited (FR-4.2). */
  id?: string;
  /** The raw text of the meter field, exactly as typed. */
  meterRaw: string;
  /** ISO-8601 date, prefilled with today (FR-1). */
  date: string;
  /** Capture timestamp of the reading being edited, so its position is kept. */
  createdAt?: string;
}

export interface ValidationResult {
  findings: Finding[];
  /** Findings that prevent saving. Empty in all but the two documented cases. */
  blocking: Finding[];
  /** Findings the user may confirm past (FR-2.1, FR-2.2). */
  warnings: Finding[];
  /** False only when a blocking finding is present (FR-2.4). */
  canSave: boolean;
  /**
   * True when saving needs an explicit confirmation because a warning is
   * present - the "trotzdem speichern" path of FR-2.1.
   */
  requiresConfirmation: boolean;
  /** The parsed meter value, or null when it could not be read. */
  meterKwh: number | null;
  /** The consumption this draft would produce (FR-1.3), when it is computable. */
  usage: DraftUsage | null;
}

/**
 * Validates a draft against the existing readings.
 *
 * @param now injectable so the future-date rule is testable without freezing
 *            the clock, and so the comparison uses the device's local day
 *            rather than UTC - an entry made at 23:40 must not be "tomorrow".
 */
export function validateDraft(
  draft: DraftInput,
  readings: readonly Reading[],
  now: Date = new Date(),
): ValidationResult {
  const findings: Finding[] = [];

  const meterKwh = parseKwhInput(draft.meterRaw);
  if (meterKwh === null) {
    findings.push({ code: 'meterNotANumber', severity: 'blocking' });
  }

  const dateValid = isIsoDate(draft.date);
  if (!dateValid) {
    findings.push({ code: 'dateMalformed', severity: 'blocking' });
  } else if (draft.date > todayIso(now)) {
    // FR-2.3 - the only plausibility rule the PRD asks to reject outright.
    findings.push({
      code: 'dateInFuture',
      severity: 'blocking',
      params: { today: todayIso(now) },
    });
  }

  let usage: DraftUsage | null = null;
  if (meterKwh !== null && dateValid) {
    usage = usageForDraft(readings, {
      ...(draft.id === undefined ? {} : { id: draft.id }),
      date: draft.date,
      meterKwh,
      ...(draft.createdAt === undefined ? {} : { createdAt: draft.createdAt }),
    });

    // FR-2.1. Compared against the chronological predecessor rather than the
    // newest reading, so that a backdated entry is judged against the value it
    // will actually be measured from.
    if (usage.meterReset && usage.previous) {
      findings.push({
        code: 'meterBelowPrevious',
        severity: 'warning',
        params: { previous: usage.previous.meterKwh, date: usage.previous.date },
      });
    }

    // FR-2.2 - warns, never blocks.
    if (usage.usageKwh !== null && usage.usageKwh > USAGE_WARNING_THRESHOLD_KWH) {
      findings.push({
        code: 'usageAboveCapacity',
        severity: 'warning',
        params: { usage: usage.usageKwh, limit: USAGE_WARNING_THRESHOLD_KWH },
      });
    }
  }

  const blocking = findings.filter((f) => f.severity === 'blocking');
  const warnings = findings.filter((f) => f.severity === 'warning');

  return {
    findings,
    blocking,
    warnings,
    canSave: blocking.length === 0,
    requiresConfirmation: blocking.length === 0 && warnings.length > 0,
    meterKwh,
    usage,
  };
}
