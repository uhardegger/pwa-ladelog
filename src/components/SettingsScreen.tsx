/**
 * Settings (FR-9) and the language switch.
 *
 * Every change is written immediately and confirmed on screen; a refused write
 * says so rather than looking saved (NFR-7).
 *
 * The text fields are edited through local draft state rather than bound
 * straight to the stored settings. `normalizeSettings` trims what it stores, so
 * an input reading its value back from storage would lose a trailing space the
 * instant it was typed - making "Urs Hardegger" or "Volvo EX30" impossible to
 * enter. The draft keeps what was typed, storage keeps the trimmed form, and
 * leaving the field syncs the two.
 */
import { useState } from 'react';
import { useLadelog } from '../app/context';
import { missingStatementFields, parsePriceInput } from '../db/settings';
import { LANGUAGES, type Language } from '../types';
import type { MessageKey } from '../i18n';
import { Field } from './Field';
import { ShareApp } from './ShareApp';

const LANGUAGE_LABELS: Record<Language, MessageKey> = {
  de: 'language.de',
  en: 'language.en',
};

/** The settings that are free text, and therefore may contain spaces. */
type TextSetting = 'personName' | 'tenant' | 'premises' | 'vehicle';

export function SettingsScreen() {
  const { settings, t, changeSettings, persistence } = useLadelog();
  const [priceRaw, setPriceRaw] = useState(String(settings.priceChfPerKwh));
  const [message, setMessage] = useState<'saved' | 'failed' | null>(null);
  const [draft, setDraft] = useState<Record<TextSetting, string>>(() => ({
    personName: settings.personName,
    tenant: settings.tenant,
    premises: settings.premises,
    vehicle: settings.vehicle,
  }));

  function apply(patch: Parameters<typeof changeSettings>[0]) {
    setMessage(changeSettings(patch) ? 'saved' : 'failed');
  }

  /** Shows exactly what was typed while storing the normalised value. */
  function editText(key: TextSetting, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    apply({ [key]: value });
  }

  /** On leaving the field, show the value as it was actually stored. */
  function settleText(key: TextSetting) {
    setDraft((current) => ({ ...current, [key]: current[key].trim() }));
  }

  const priceValue = parsePriceInput(priceRaw);
  const missing = missingStatementFields(settings);

  return (
    <>
      <h2>{t('settings.title')}</h2>

      {message === 'saved' && (
        <p className="notice notice--ok" role="status">
          {t('settings.saved')}
        </p>
      )}
      {message === 'failed' && (
        <p className="notice notice--error" role="alert">
          {t('settings.saveFailed')}
        </p>
      )}

      <div className="card">
        <Field id="language" label={t('language.label')}>
          {(props) => (
            <select
              {...props}
              value={settings.language}
              onChange={(e) => apply({ language: e.target.value as Language })}
            >
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {t(LANGUAGE_LABELS[code])}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field
          id="personName"
          label={t('settings.personName.label')}
          hint={t('settings.personName.hint')}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              value={draft.personName}
              autoComplete="name"
              onChange={(e) => editText('personName', e.target.value)}
              onBlur={() => settleText('personName')}
            />
          )}
        </Field>

        {settings.personName.trim() === '' && (
          <p className="notice notice--warning" role="status">
            {t('settings.personName.required')}
          </p>
        )}

        <Field
          id="price"
          label={t('settings.price.label')}
          hint={t('settings.price.hint')}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              inputMode="decimal"
              value={priceRaw}
              onChange={(e) => {
                setPriceRaw(e.target.value);
                const parsed = parsePriceInput(e.target.value);
                if (parsed !== null) apply({ priceChfPerKwh: parsed });
              }}
            />
          )}
        </Field>
        {priceValue === null && (
          <p className="notice notice--warning" role="status">
            {t('settings.price.invalid')}
          </p>
        )}
      </div>

      <div className="card">
        <h3>{t('export.title')}</h3>
        <p className="field__hint">{t('settings.statement.hint')}</p>

        <Field id="tenant" label={t('settings.tenant.label')}>
          {(props) => (
            <input
              {...props}
              type="text"
              value={draft.tenant}
              onChange={(e) => editText('tenant', e.target.value)}
              onBlur={() => settleText('tenant')}
            />
          )}
        </Field>

        <Field id="premises" label={t('settings.premises.label')}>
          {(props) => (
            <input
              {...props}
              type="text"
              value={draft.premises}
              onChange={(e) => editText('premises', e.target.value)}
              onBlur={() => settleText('premises')}
            />
          )}
        </Field>

        <Field id="vehicle" label={t('settings.vehicle.label')}>
          {(props) => (
            <input
              {...props}
              type="text"
              value={draft.vehicle}
              onChange={(e) => editText('vehicle', e.target.value)}
              onBlur={() => settleText('vehicle')}
            />
          )}
        </Field>

        {missing.length > 0 && (
          <p className="notice notice--warning" role="status">
            {t('settings.statement.incomplete', {
              fields: missing.map((f) => t(`settings.${f}.label` as MessageKey)).join(', '),
            })}
          </p>
        )}
      </div>

      <ShareApp />

      <p className="muted">
        {t('storage.state')}: {t(`storage.${persistence}` as MessageKey)}
      </p>
    </>
  );
}
