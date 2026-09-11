/**
 * Settings (FR-9) and the language switch.
 *
 * Every change is written immediately and confirmed on screen; a refused write
 * says so rather than looking saved (NFR-7).
 */
import { useState } from 'react';
import { useLadelog } from '../app/context';
import { missingStatementFields, parsePriceInput } from '../db/settings';
import { LANGUAGES, type Language } from '../types';
import type { MessageKey } from '../i18n';
import { Field } from './Field';

const LANGUAGE_LABELS: Record<Language, MessageKey> = {
  de: 'language.de',
  en: 'language.en',
};

export function SettingsScreen() {
  const { settings, t, changeSettings, persistence } = useLadelog();
  const [priceRaw, setPriceRaw] = useState(String(settings.priceChfPerKwh));
  const [message, setMessage] = useState<'saved' | 'failed' | null>(null);

  function apply(patch: Parameters<typeof changeSettings>[0]) {
    setMessage(changeSettings(patch) ? 'saved' : 'failed');
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
              value={settings.personName}
              autoComplete="name"
              onChange={(e) => apply({ personName: e.target.value })}
            />
          )}
        </Field>

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
              value={settings.tenant}
              onChange={(e) => apply({ tenant: e.target.value })}
            />
          )}
        </Field>

        <Field id="premises" label={t('settings.premises.label')}>
          {(props) => (
            <input
              {...props}
              type="text"
              value={settings.premises}
              onChange={(e) => apply({ premises: e.target.value })}
            />
          )}
        </Field>

        <Field id="vehicle" label={t('settings.vehicle.label')}>
          {(props) => (
            <input
              {...props}
              type="text"
              value={settings.vehicle}
              onChange={(e) => apply({ vehicle: e.target.value })}
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

      <p className="muted">
        {t('storage.state')}: {t(`storage.${persistence}` as MessageKey)}
      </p>
    </>
  );
}
