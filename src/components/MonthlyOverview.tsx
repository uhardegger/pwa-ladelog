/**
 * Monthly overview (FR-5).
 *
 * All arithmetic comes from `buildOverview`; this only lays it out. The table
 * scrolls horizontally inside its own container so a third person's column
 * never makes the page itself scroll sideways.
 */
import { useMemo } from 'react';
import { useLadelog } from '../app/context';
import { formatChf, formatKwh } from '../i18n';
import { buildOverview } from '../lib/overview';

export function MonthlyOverview() {
  const { readings, t, lang } = useLadelog();
  const overview = useMemo(() => buildOverview(readings, lang), [readings, lang]);

  if (overview.isEmpty) {
    return (
      <>
        <h2>{t('overview.title')}</h2>
        <p className="muted">{t('overview.empty')}</p>
      </>
    );
  }

  return (
    <>
      <h2>{t('overview.title')}</h2>

      {overview.years.map((year) => (
        <section className="card" key={year.year}>
          <h3>{year.year}</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('overview.month')}</th>
                  {overview.persons.map((person) => (
                    <th scope="col" key={person}>
                      {person}
                    </th>
                  ))}
                  <th scope="col">{t('overview.total')}</th>
                  <th scope="col">{t('overview.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {year.months.map((month) => (
                  <tr key={month.key}>
                    <th scope="row">{month.label}</th>
                    {month.perPerson.map((value, i) => (
                      <td key={overview.persons[i]}>{formatKwh(lang, value)}</td>
                    ))}
                    <td>{formatKwh(lang, month.totalKwh)}</td>
                    <td>{formatChf(lang, month.amountChf)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t('overview.yearTotal', { year: year.year })}</td>
                  {year.perPerson.map((value, i) => (
                    <td key={overview.persons[i]}>{formatKwh(lang, value)}</td>
                  ))}
                  <td>{formatKwh(lang, year.totalKwh)}</td>
                  <td>{formatChf(lang, year.amountChf)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ))}

      {overview.years.length > 1 && (
        <p className="card">
          <strong>
            {t('overview.grandTotal')}: {formatKwh(lang, overview.totalKwh)}{' '}
            {t('common.kwh')} · {formatChf(lang, overview.amountChf)} {t('common.chf')}
          </strong>
        </p>
      )}
    </>
  );
}
