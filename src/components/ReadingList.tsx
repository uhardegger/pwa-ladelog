/**
 * The reading list with edit and delete (FR-4).
 *
 * Newest first (FR-4.1). Consumption is derived, never stored, so deleting an
 * entry recalculates the ones after it automatically (FR-4.2) - there is no
 * recalculation step to get wrong.
 */
import { useMemo, useState } from 'react';
import { useLadelog } from '../app/context';
import { formatDate, formatKwh } from '../i18n';
import { withUsage } from '../lib/calc';
import type { ReadingWithUsage } from '../types';
import { ReadingEditor } from './ReadingEditor';

export function ReadingList() {
  const { readings, t, lang } = useLadelog();
  const [editing, setEditing] = useState<ReadingWithUsage | null>(null);

  const rows = useMemo(() => withUsage(readings).reverse(), [readings]);

  if (rows.length === 0) {
    return <p className="muted">{t('list.empty')}</p>;
  }

  return (
    <>
      <h2>{t('list.title')}</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((reading) => (
          <li key={reading.id}>
            <button type="button" className="reading" onClick={() => setEditing(reading)}>
              <span className="reading__date">{formatDate(lang, reading.date)}</span>
              <span className="reading__usage">
                {reading.usageKwh === null
                  ? t('list.opening')
                  : `+${formatKwh(lang, reading.usageKwh)}`}
              </span>
              <span className="reading__meter">
                {t('list.meter', { value: formatKwh(lang, reading.meterKwh) })}
              </span>
              <span className="reading__person">{reading.person}</span>
              {reading.meterReset && (
                <span className="reading__flag">{t('list.meterReset')}</span>
              )}
              {reading.note && <span className="reading__flag">{reading.note}</span>}
            </button>
          </li>
        ))}
      </ul>

      {editing && (
        <ReadingEditor reading={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
