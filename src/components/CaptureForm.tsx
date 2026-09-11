/**
 * The capture form (FR-1, FR-2).
 *
 * This is the first thing on screen at launch, focused and ready (FR-1.1).
 * From a cold start the path is: type the number, tap Save. Two interactions,
 * inside the three AC-3 allows.
 *
 * Date and person are prefilled and need no interaction at all (AC-4). They are
 * shown, not hidden, so a wrong device date is noticed before it is stored.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLadelog } from '../app/context';
import { formatDate, formatKwh } from '../i18n';
import { latestReading } from '../lib/calc';
import { todayIso } from '../lib/dates';
import { validateDraft, type Finding } from '../lib/validate';
import type { Reading } from '../types';
import { Field } from './Field';
import { FindingNotice } from './FindingNotice';

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Only reached on browsers without crypto.randomUUID; the id merely has to be
  // unique enough to deduplicate imports.
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function CaptureForm() {
  const { readings, settings, t, lang, addReading } = useLadelog();

  const [meterRaw, setMeterRaw] = useState('');
  const [date, setDate] = useState(() => todayIso());
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState<{ usageKwh: number | null } | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const meterRef = useRef<HTMLInputElement>(null);

  // FR-1.1 - the meter field owns the focus from the first frame.
  useEffect(() => {
    meterRef.current?.focus();
  }, []);

  const last = useMemo(() => latestReading(readings), [readings]);
  const result = useMemo(
    () => validateDraft({ meterRaw, date }, readings),
    [meterRaw, date, readings],
  );

  // A changed value invalidates a confirmation given for the previous one.
  useEffect(() => {
    setConfirmed(false);
  }, [meterRaw, date]);

  const showWarnings = meterRaw.trim() !== '';
  const blockingToShow: Finding[] = meterRaw.trim() === ''
    ? result.blocking.filter((f) => f.code !== 'meterNotANumber')
    : result.blocking;

  const needsConfirmation = result.requiresConfirmation && !confirmed;
  const canSubmit = result.canSave && result.meterKwh !== null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || result.meterKwh === null) return;
    if (needsConfirmation) {
      setConfirmed(true);
      return;
    }

    const reading: Reading = {
      id: newId(),
      date,
      meterKwh: result.meterKwh,
      person: settings.personName,
      priceChfPerKwh: settings.priceChfPerKwh,
      createdAt: new Date().toISOString(),
    };
    if (note.trim() !== '') reading.note = note.trim();

    const ok = await addReading(reading);
    if (!ok) {
      setSaveFailed(true);
      return;
    }

    // FR-1.4 - confirm with the figure that was actually stored.
    setSaved({ usageKwh: result.usage?.usageKwh ?? null });
    setSaveFailed(false);
    setMeterRaw('');
    setNote('');
    setDate(todayIso());
    setConfirmed(false);
    meterRef.current?.focus();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {saved && (
        <p className="notice notice--ok" role="status">
          {saved.usageKwh === null
            ? t('capture.savedFirst')
            : t('capture.saved', { usage: formatKwh(lang, saved.usageKwh) })}
        </p>
      )}

      {saveFailed && (
        <p className="notice notice--error" role="alert">
          {t('capture.saveFailed')}
        </p>
      )}

      {/* FR-1.2 - so a typo in the new value stands out immediately. */}
      <p className="capture__last">
        {last
          ? t('capture.last', {
              value: formatKwh(lang, last.meterKwh),
              date: formatDate(lang, last.date),
            })
          : t('capture.noneYet')}
      </p>

      <Field id="meter" label={t('capture.meter')}>
        {({ id }) => (
          <input
            id={id}
            ref={meterRef}
            className="input--meter"
            type="text"
            /* Numeric keypad with a decimal key, on both platforms (FR-1.1). */
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            value={meterRaw}
            onChange={(e) => setMeterRaw(e.target.value)}
            aria-describedby="usage-preview"
          />
        )}
      </Field>

      {/* FR-1.3 - the consumption updates while the number is being typed. */}
      <p className="capture__usage" id="usage-preview" aria-live="polite">
        {result.usage && result.usage.usageKwh !== null
          ? t('capture.usagePreview', {
              usage: formatKwh(lang, result.usage.usageKwh),
            })
          : result.usage && result.meterKwh !== null
            ? t('capture.usageFirst')
            : ' '}
      </p>

      {blockingToShow.map((finding) => (
        <FindingNotice key={finding.code} finding={finding} />
      ))}
      {showWarnings &&
        result.warnings.map((finding) => (
          <FindingNotice key={finding.code} finding={finding} />
        ))}

      <div className="capture__meta">
        <Field id="date" label={t('capture.date')}>
          {(props) => (
            <input
              {...props}
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </Field>

        {/*
          Shown as plain text, not as a field (FR-9.1). The name is asked for
          once at setup and changed in the settings; it belongs to the device,
          not to the individual reading. A read-only input here only looked
          editable and invited a mis-tap on the way to the save button.

          aria-labelledby keeps the label associated, so assistive technology
          still announces which person the reading will be attributed to.
        */}
        <div className="field">
          <span className="field__label" id="person-label">
            {t('capture.person')}
          </span>
          <p className="capture__person" aria-labelledby="person-label">
            {settings.personName}
          </p>
        </div>
      </div>

      <Field id="note" label={t('capture.note')}>
        {(props) => (
          <input
            {...props}
            type="text"
            value={note}
            autoComplete="off"
            onChange={(e) => setNote(e.target.value)}
          />
        )}
      </Field>

      <button type="submit" className="button--primary" disabled={!canSubmit}>
        {needsConfirmation ? t('validate.saveAnyway') : t('capture.save')}
      </button>
    </form>
  );
}
