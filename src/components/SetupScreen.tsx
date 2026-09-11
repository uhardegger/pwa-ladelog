/**
 * One-time setup (FR-9, PRD OP-2).
 *
 * The app ships with no personal defaults so the repository can be public, so
 * the name has to be asked for once. Only the name: it is stamped into every
 * reading (FR-9.1), and without it a record cannot be attributed. Tenant,
 * premises and vehicle are only needed at export time and would be three
 * needless fields between the user and their first reading.
 */
import { useState } from 'react';
import { useLadelog } from '../app/context';
import { LANGUAGES, type Language } from '../types';
import type { MessageKey } from '../i18n';
import { Field } from './Field';

const LANGUAGE_LABELS: Record<Language, MessageKey> = {
  de: 'language.de',
  en: 'language.en',
};

export function SetupScreen() {
  const { settings, t, changeSettings } = useLadelog();
  const [name, setName] = useState(settings.personName);
  const [failed, setFailed] = useState(false);

  const trimmed = name.trim();

  return (
    <main className="app__main">
      <h1>{t('setup.title')}</h1>
      <p>{t('setup.intro')}</p>

      {failed && (
        <p className="notice notice--error" role="alert">
          {t('settings.saveFailed')}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed === '') return;
          setFailed(!changeSettings({ personName: trimmed }));
        }}
      >
        <Field id="setup-language" label={t('language.label')}>
          {(props) => (
            <select
              {...props}
              value={settings.language}
              onChange={(e) => changeSettings({ language: e.target.value as Language })}
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
          id="setup-name"
          label={t('settings.personName.label')}
          hint={t('settings.personName.hint')}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>

        <button type="submit" className="button--primary" disabled={trimmed === ''}>
          {t('setup.start')}
        </button>
      </form>
    </main>
  );
}
