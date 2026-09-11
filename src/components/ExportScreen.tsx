/**
 * Excel export, JSON backup and JSON import (FR-6, FR-7, FR-8).
 *
 * Every action reports its outcome on screen. A silent export failure is the
 * worst defect this app can have (FR-7.3), and an import that says nothing
 * leaves the user unable to tell whether the merge happened (FR-8.3).
 *
 * The file is built inside the click handler and handed straight to
 * deliverFile: navigator.share refuses once the transient activation from the
 * tap is spent, so nothing slower may be awaited in between.
 */
import { useState } from 'react';
import { useLadelog } from '../app/context';
import {
  buildJsonBundle,
  buildXlsx,
  deliverFile,
  deliveryMessageKey,
  parseBundle,
} from '../export';
import { currentYearPeriod } from '../lib/dates';
import type { MessageKey } from '../i18n';
import { Field } from './Field';

type Outcome = { key: MessageKey; params?: Record<string, string | number>; ok: boolean };

export function ExportScreen() {
  const { readings, settings, t, mergeReadings } = useLadelog();
  const [period, setPeriod] = useState(() => currentYearPeriod());
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const hasReadings = readings.length > 0;

  async function onExportXlsx() {
    const result = await deliverFile(buildXlsx(readings, settings, period));
    setOutcome({ key: deliveryMessageKey(result), ok: result.ok });
  }

  async function onExportJson() {
    const result = await deliverFile(buildJsonBundle(readings, settings));
    setOutcome({ key: deliveryMessageKey(result), ok: result.ok });
  }

  async function onImport(file: File) {
    const parsed = parseBundle(await file.text());
    if (!parsed.ok) {
      const keys: Record<typeof parsed.reason, MessageKey> = {
        notJson: 'import.notJson',
        notABundle: 'import.notABundle',
        schemaTooNew: 'import.schemaTooNew',
      };
      setOutcome({ key: keys[parsed.reason], ok: false });
      return;
    }

    const merged = await mergeReadings(parsed.bundle.readings);
    if (!merged) {
      setOutcome({ key: 'import.failed', ok: false });
      return;
    }

    if (merged.added === 0 && parsed.bundle.invalid === 0) {
      setOutcome({ key: 'import.nothingNew', ok: true });
      return;
    }

    setOutcome({
      key: parsed.bundle.invalid > 0 ? 'import.resultWithInvalid' : 'import.result',
      params: {
        added: merged.added,
        skipped: merged.skipped,
        invalid: parsed.bundle.invalid,
      },
      ok: true,
    });
  }

  return (
    <>
      <h2>{t('export.title')}</h2>

      {outcome && (
        <p
          className={outcome.ok ? 'notice notice--ok' : 'notice notice--error'}
          role={outcome.ok ? 'status' : 'alert'}
        >
          {t(outcome.key, outcome.params)}
        </p>
      )}

      <section className="card">
        <h3>{t('export.period')}</h3>
        <div className="capture__meta">
          <Field id="from" label={t('export.from')}>
            {(props) => (
              <input
                {...props}
                type="date"
                value={period.from}
                onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))}
              />
            )}
          </Field>
          <Field id="to" label={t('export.to')}>
            {(props) => (
              <input
                {...props}
                type="date"
                value={period.to}
                onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))}
              />
            )}
          </Field>
        </div>

        <button
          type="button"
          className="button--primary"
          disabled={!hasReadings}
          onClick={() => void onExportXlsx()}
        >
          {t('export.xlsx')}
        </button>
        {!hasReadings && <p className="field__hint">{t('export.noReadings')}</p>}
      </section>

      <section className="card">
        <h3>{t('export.json')}</h3>
        <p className="field__hint">{t('export.jsonHint')}</p>
        <button type="button" disabled={!hasReadings} onClick={() => void onExportJson()}>
          {t('export.json')}
        </button>
      </section>

      <section className="card">
        <h3>{t('import.title')}</h3>
        <p className="field__hint">{t('import.hint')}</p>
        {/* A native, visible file input rather than a hidden one driven by a
            button: it carries its own label for assistive technology, and some
            iOS PWA contexts refuse a programmatic click on a file input. */}
        <label className="field__label" htmlFor="import-file">
          {t('import.pick')}
        </label>
        <input
          id="import-file"
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset first, so picking the same file twice fires a change again.
            e.target.value = '';
            if (file) void onImport(file);
          }}
        />
        <p className="field__hint">{t('import.settingsIgnored')}</p>
      </section>
    </>
  );
}
