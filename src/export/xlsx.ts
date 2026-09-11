/**
 * Excel export (FR-6).
 *
 * Produces a three-sheet .xlsx entirely client-side, so it works in the garage
 * with no connection (FR-6.6).
 *
 * The sheet names and headings are German regardless of the app's language:
 * the recipient is the landlord, not the app's user.
 *
 * Security note: SheetJS 0.18.5 - the last release published to npm - carries
 * advisories for prototype pollution and ReDoS. Both are in its *parser*. This
 * app only ever writes workbooks and never reads one, so neither code path is
 * reachable here. The import side (FR-8.2) uses JSON, not xlsx.
 *
 * Formatting limit of the SheetJS Community Edition: it writes values, number
 * formats, column widths and merges, but no font weights, borders or fills. The
 * settlement sheet is therefore correct but unstyled. Real styling would mean
 * ExcelJS, roughly 250 kB gzipped more, which puts NFR-1 back in question.
 */
import * as XLSX from 'xlsx';
import { inPeriod, monthlyTotals, periodTotal, personsIn, withUsage } from '../lib/calc';
import type { FilePayload, Period, Reading, Settings } from '../types';

/** Number formats of FR-6.5. */
const FMT_KWH = '#,##0.0';
const FMT_CHF = '#,##0.00';
const FMT_DATE = 'DD.MM.YYYY';
/**
 * Four decimals, not two. When the tariff changes inside a settlement period
 * the price on this sheet is a weighted average, and a value rounded to two
 * decimals no longer reconciles: 333.0 kWh at a displayed 0.29 comes to 96.57,
 * while the sheet asks for 96.93. Handing the landlord a document that does not
 * multiply out is how a dispute starts.
 */
const FMT_PRICE = '0.0000';

/** The export is always written in German - see the module comment. */
const EXPORT_LOCALE = 'de-CH';

export const SHEET_READINGS = 'Ablesungen';
export const SHEET_MONTHLY = 'Abrechnung';
export const SHEET_STATEMENT = 'Abrechnungsblatt';

/** Cell helpers: SheetJS expects {t: type, v: value, z: number format}. */
const txt = (v: string): XLSX.CellObject => ({ t: 's', v });
const num = (v: number, z?: string): XLSX.CellObject => ({ t: 'n', v, z });
const dat = (iso: string): XLSX.CellObject => ({
  t: 'd',
  // Midday, so no time zone shift can move the date to the previous day.
  v: new Date(`${iso}T12:00:00`),
  z: FMT_DATE,
});

type Row = (XLSX.CellObject | null)[];

function sheetFromRows(rows: Row[], colWidths: number[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxCol = 0;
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell) return;
      ws[XLSX.utils.encode_cell({ r, c })] = cell;
      if (c > maxCol) maxCol = c;
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(rows.length - 1, 0), c: maxCol },
  });
  ws['!cols'] = colWidths.map((wch) => ({ wch }));
  return ws;
}

/** Sheet 1 - every reading, chronologically (FR-6.1). */
function buildReadingsSheet(readings: readonly Reading[]): XLSX.WorkSheet {
  const rows: Row[] = [
    [
      txt('Datum'),
      txt('Zählerstand kWh'),
      txt('Person'),
      txt('Verbrauch kWh'),
      txt('Bemerkung'),
    ],
  ];

  for (const r of withUsage(readings)) {
    rows.push([
      dat(r.date),
      num(r.meterKwh, FMT_KWH),
      txt(r.person),
      r.usageKwh === null ? txt('Anfangsablesung') : num(r.usageKwh, FMT_KWH),
      txt(r.meterReset ? `${r.note ?? ''} (Zählerwechsel)`.trim() : (r.note ?? '')),
    ]);
  }

  return sheetFromRows(rows, [12, 17, 14, 15, 34]);
}

/** Sheet 2 - monthly aggregation, one column per person (FR-6.1). */
function buildMonthlySheet(readings: readonly Reading[]): XLSX.WorkSheet {
  const persons = personsIn(readings, EXPORT_LOCALE);
  const months = monthlyTotals(readings);

  const header: Row = [txt('Monat')];
  for (const p of persons) header.push(txt(`kWh ${p}`));
  header.push(txt('kWh Total'), txt('Betrag CHF'));
  const rows: Row[] = [header];

  for (const m of months) {
    const row: Row = [txt(`${String(m.month).padStart(2, '0')}.${m.year}`)];
    for (const p of persons) row.push(num(m.byPerson[p] ?? 0, FMT_KWH));
    row.push(num(m.totalKwh, FMT_KWH), num(m.amountChf, FMT_CHF));
    rows.push(row);
  }

  const sum = (pick: (m: (typeof months)[number]) => number) =>
    Math.round(months.reduce((a, m) => a + pick(m), 0) * 100) / 100;

  const total: Row = [txt('Total')];
  for (const p of persons) total.push(num(sum((m) => m.byPerson[p] ?? 0), FMT_KWH));
  total.push(
    num(
      sum((m) => m.totalKwh),
      FMT_KWH,
    ),
    num(
      sum((m) => m.amountChf),
      FMT_CHF,
    ),
  );
  rows.push(total);

  return sheetFromRows(rows, [12, ...persons.map(() => 14), 14, 14]);
}

/** Sheet 3 - the print-ready settlement sheet for the landlord (FR-6.2). */
function buildStatementSheet(
  readings: readonly Reading[],
  settings: Settings,
  period: Period,
): XLSX.WorkSheet {
  const t = periodTotal(readings, period);
  const rowsInPeriod = inPeriod(withUsage(readings), period).filter((r) => r.usageKwh);

  const rows: Row[] = [
    [txt('Abrechnung Ladestrom Garage')],
    [],
    [txt('Mieter'), null, txt(settings.tenant)],
    [txt('Objekt'), null, txt(settings.premises)],
    [txt('Fahrzeug'), null, txt(settings.vehicle)],
    [txt('Abrechnungsperiode von'), null, dat(period.from)],
    [txt('Abrechnungsperiode bis'), null, dat(period.to)],
    [txt('Anzahl Ablesungen'), null, num(rowsInPeriod.length)],
    [],
    [txt('Geladene Energie (kWh)'), null, num(t.totalKwh, FMT_KWH)],
    [txt('Strompreis (CHF/kWh)'), null, num(t.priceChfPerKwh, FMT_PRICE)],
    [txt('Zu vergüten (CHF)'), null, num(t.amountChf, FMT_CHF)],
    [],
    [],
    [txt('Ort, Datum'), null, null, txt('Unterschrift Mieter')],
    [txt('________________________'), null, null, txt('________________________')],
    [],
    [
      txt(
        'Grundlage: kumulierte Zählerstände des mobilen Ladegeräts, ' +
          'einzeln dokumentiert im Blatt «Ablesungen».',
      ),
    ],
  ];

  const ws = sheetFromRows(rows, [26, 4, 18, 26]);
  // Merge the value column across C:D so long texts are not visually clipped.
  ws['!merges'] = [2, 3, 4].map((r) => ({ s: { r, c: 2 }, e: { r, c: 3 } }));
  return ws;
}

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** File name per FR-6.4. */
export function exportFilename(period: Period): string {
  return `Ladelog_${period.from}_bis_${period.to}.xlsx`;
}

/** Builds the workbook. Free of side effects, so it is directly testable. */
export function buildWorkbook(
  readings: readonly Reading[],
  settings: Settings,
  period: Period,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildReadingsSheet(readings), SHEET_READINGS);
  XLSX.utils.book_append_sheet(wb, buildMonthlySheet(readings), SHEET_MONTHLY);
  XLSX.utils.book_append_sheet(
    wb,
    buildStatementSheet(readings, settings, period),
    SHEET_STATEMENT,
  );
  return wb;
}

/** Produces the file as a Blob - the entry point for the UI. */
export function buildXlsx(
  readings: readonly Reading[],
  settings: Settings,
  period: Period,
): FilePayload {
  const wb = buildWorkbook(readings, settings, period);
  const buf = XLSX.write(wb, {
    bookType: 'xlsx',
    type: 'array',
    cellDates: true,
  }) as ArrayBuffer;
  return {
    filename: exportFilename(period),
    blob: new Blob([buf], { type: XLSX_MIME }),
  };
}
