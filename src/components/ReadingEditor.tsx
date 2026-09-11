/**
 * Edit and delete one reading (FR-4.2, FR-4.3).
 *
 * The same plausibility rules as capture apply, with the reading excluded from
 * its own comparison so an edit is never judged against its old value.
 * Deleting asks first (FR-4.3), because a deletion cannot be undone.
 */
import { useMemo, useState } from 'react';
import { useLadelog } from '../app/context';
import { formatKwh } from '../i18n';
import { validateDraft } from '../lib/validate';
import { todayIso } from '../lib/dates';
import type { Reading } from '../types';
import { Field } from './Field';
import { FindingNotice } from './FindingNotice';

interface Props {
  reading: Reading;
  onClose(): void;
}

export function ReadingEditor({ reading, onClose }: Props) {
  const { readings, t, lang, saveReading, deleteReading } = useLadelog();

  const [meterRaw, setMeterRaw] = useState(String(reading.meterKwh));
  const [date, setDate] = useState(reading.date);
  const [note, setNote] = useState(reading.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [failed, setFailed] = useState(false);

  const result = useMemo(
    () =>
      validateDraft(
        { id: reading.id, meterRaw, date, createdAt: reading.createdAt },
        readings,
      ),
    [reading.id, reading.createdAt, meterRaw, date, readings],
  );

  const needsConfirmation = result.requiresConfirmation && !confirmed;

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    if (!result.canSave || result.meterKwh === null) return;
    if (needsConfirmation) {
      setConfirmed(true);
      return;
    }
    const next: Reading = {
      ...reading,
      date,
      meterKwh: result.meterKwh,
    };
    if (note.trim() === '') delete next.note;
    else next.note = note.trim();

    if (await saveReading(next)) onClose();
    else setFailed(true);
  }

  async function onDelete() {
    if (await deleteReading(reading.id)) onClose();
    else setFailed(true);
  }

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={t('edit.title')}>
        <h2>{t('edit.title')}</h2>

        {failed && (
          <p className="notice notice--error" role="alert">
            {t('capture.saveFailed')}
          </p>
        )}

        <form onSubmit={onSave} noValidate>
          <Field id="edit-meter" label={t('capture.meter')}>
            {(props) => (
              <input
                {...props}
                className="input--meter"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={meterRaw}
                onChange={(e) => {
                  setMeterRaw(e.target.value);
                  setConfirmed(false);
                }}
              />
            )}
          </Field>

          <p className="capture__usage" aria-live="polite">
            {result.usage && result.usage.usageKwh !== null
              ? t('capture.usagePreview', {
                  usage: formatKwh(lang, result.usage.usageKwh),
                })
              : t('capture.usageFirst')}
          </p>

          {result.blocking.map((f) => (
            <FindingNotice key={f.code} finding={f} />
          ))}
          {result.warnings.map((f) => (
            <FindingNotice key={f.code} finding={f} />
          ))}

          <Field id="edit-date" label={t('capture.date')}>
            {(props) => (
              <input
                {...props}
                type="date"
                value={date}
                max={todayIso()}
                onChange={(e) => {
                  setDate(e.target.value);
                  setConfirmed(false);
                }}
              />
            )}
          </Field>

          <Field id="edit-note" label={t('capture.note')}>
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

          <button type="submit" className="button--primary" disabled={!result.canSave}>
            {needsConfirmation ? t('validate.saveAnyway') : t('common.save')}
          </button>
        </form>

        {/* FR-4.3 - deletion is irreversible, so it asks first. */}
        {confirmDelete ? (
          <div className="notice notice--warning" role="alert">
            {t('edit.confirmDelete')}
            <div className="notice__actions">
              <button type="button" className="button--danger" onClick={() => void onDelete()}>
                {t('edit.confirmDeleteYes')}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="button--row" style={{ marginTop: 12 }}>
            <button type="button" onClick={() => setConfirmDelete(true)}>
              {t('common.delete')}
            </button>
            <button type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
