/**
 * Renders one plausibility finding (FR-2).
 *
 * The finding carries a code and parameters, never prose, so the same rule
 * reads correctly in both languages.
 */
import { useLadelog } from '../app/context';
import { formatDate, formatKwh } from '../i18n';
import type { Finding } from '../lib/validate';
import type { MessageKey } from '../i18n';

const MESSAGES: Record<Finding['code'], MessageKey> = {
  meterNotANumber: 'validate.meterNotANumber',
  dateMalformed: 'validate.dateMalformed',
  dateInFuture: 'validate.dateInFuture',
  meterBelowPrevious: 'validate.meterBelowPrevious',
  usageAboveCapacity: 'validate.usageAboveCapacity',
};

export function FindingNotice({ finding }: { finding: Finding }) {
  const { t, lang } = useLadelog();
  const params: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(finding.params ?? {})) {
    if (key === 'date' || key === 'today') {
      params[key] = formatDate(lang, String(value));
    } else if (typeof value === 'number') {
      params[key] = formatKwh(lang, value);
    } else {
      params[key] = value;
    }
  }

  return (
    <p
      className="notice notice--warning"
      role={finding.severity === 'blocking' ? 'alert' : 'status'}
    >
      {t(MESSAGES[finding.code], params)}
    </p>
  );
}
