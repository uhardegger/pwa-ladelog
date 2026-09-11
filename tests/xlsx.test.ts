import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  SHEET_MONTHLY,
  SHEET_READINGS,
  SHEET_STATEMENT,
  buildWorkbook,
  exportFilename,
} from '../src/export/xlsx';
import { periodTotal } from '../src/lib/calc';
import type { Period, Reading, Settings } from '../src/types';

const mk = (
  id: string,
  date: string,
  meter: number,
  person: string,
  price = 0.28,
): Reading => ({
  id,
  date,
  meterKwh: meter,
  person,
  priceChfPerKwh: price,
  createdAt: `${date}T18:00:00Z`,
});

const readings: Reading[] = [
  mk('a', '2026-09-01', 0, 'Hardegger'),
  mk('b', '2026-09-08', 42.5, 'Hardegger'),
  mk('c', '2026-09-20', 95, 'Partnerin'),
  mk('d', '2026-10-05', 150, 'Hardegger'),
  mk('e', '2026-10-28', 210, 'Hardegger'),
  mk('f', '2026-11-03', 5, 'Hardegger'),
  mk('g', '2027-01-10', 60, 'Partnerin', 0.31),
];

const settings: Settings = {
  personName: 'Hardegger',
  priceChfPerKwh: 0.28,
  tenant: 'A Tenant',
  premises: 'Garage - charging bay',
  vehicle: 'Volvo EX30',
  language: 'en',
  schemaVersion: 1,
};

const period: Period = { from: '2026-01-01', to: '2026-12-31' };

/** Writes and reads the workbook back, so assertions are on the real file. */
function roundTrip(wb: XLSX.WorkBook): XLSX.WorkBook {
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  return XLSX.read(buf, { type: 'array', cellDates: true });
}

const cell = (ws: XLSX.WorkSheet, address: string): XLSX.CellObject | undefined =>
  ws[address] as XLSX.CellObject | undefined;

const rows = (ws: XLSX.WorkSheet): unknown[][] =>
  XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

describe('workbook structure (FR-6.1)', () => {
  const wb = buildWorkbook(readings, settings, period);

  it('has the three sheets in the specified order', () => {
    expect(wb.SheetNames).toEqual([SHEET_READINGS, SHEET_MONTHLY, SHEET_STATEMENT]);
  });

  it('names the sheets in German whatever the app language', () => {
    // settings.language is 'en' above; the recipient is the landlord.
    expect(wb.SheetNames).toEqual(['Ablesungen', 'Abrechnung', 'Abrechnungsblatt']);
  });

  it('survives a write and read cycle (AC-7)', () => {
    const back = roundTrip(wb);
    expect(back.SheetNames).toEqual(wb.SheetNames);
  });
});

describe('file name (FR-6.4)', () => {
  it('follows the specified pattern', () => {
    expect(exportFilename(period)).toBe('Ladelog_2026-01-01_bis_2026-12-31.xlsx');
  });

  it('reflects an arbitrary period', () => {
    expect(exportFilename({ from: '2026-04-01', to: '2026-06-30' })).toBe(
      'Ladelog_2026-04-01_bis_2026-06-30.xlsx',
    );
  });
});

describe('sheet 1 - Ablesungen', () => {
  const ws = buildWorkbook(readings, settings, period).Sheets[SHEET_READINGS]!;
  const data = rows(ws);

  it('has the specified header row', () => {
    expect(data[0]).toEqual([
      'Datum',
      'Zählerstand kWh',
      'Person',
      'Verbrauch kWh',
      'Bemerkung',
    ]);
  });

  it('lists every reading, ignoring the settlement period', () => {
    // The sheet is the full evidence trail; the period only shapes sheet 3.
    expect(data).toHaveLength(readings.length + 1);
  });

  it('marks the opening reading instead of showing a consumption', () => {
    expect(data[1]?.[3]).toBe('Anfangsablesung');
  });

  it('carries the derived consumption', () => {
    expect(data[2]?.[3]).toBe(42.5);
    expect(data[3]?.[3]).toBe(52.5);
  });

  it('annotates the meter swap in the note column', () => {
    const swapRow = data[6]!;
    expect(swapRow[3]).toBe(0);
    expect(String(swapRow[4])).toContain('Zählerwechsel');
  });

  it('writes dates as real dates, not as text', () => {
    expect(cell(ws, 'A2')?.t).toBe('d');
    expect(cell(ws, 'A2')?.z).toBe('DD.MM.YYYY');
  });

  it('keeps the calendar day when the file is read back (no time zone drift)', () => {
    const back = roundTrip(buildWorkbook(readings, settings, period));
    const value = cell(back.Sheets[SHEET_READINGS]!, 'A2')?.v;
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).getFullYear()).toBe(2026);
    expect((value as Date).getMonth() + 1).toBe(9);
    expect((value as Date).getDate()).toBe(1);
  });

  it('formats kWh with one decimal (FR-6.5)', () => {
    expect(cell(ws, 'B2')?.z).toBe('#,##0.0');
    expect(cell(ws, 'D3')?.z).toBe('#,##0.0');
  });

  it('leaves the note empty rather than writing "undefined"', () => {
    expect(cell(ws, 'E2')?.v).toBe('');
  });

  it('carries a note through', () => {
    const withNote = [{ ...readings[0]!, note: 'first charge' }];
    const sheet = buildWorkbook(withNote, settings, period).Sheets[SHEET_READINGS]!;
    expect(cell(sheet, 'E2')?.v).toBe('first charge');
  });
});

describe('sheet 2 - Abrechnung', () => {
  const ws = buildWorkbook(readings, settings, period).Sheets[SHEET_MONTHLY]!;
  const data = rows(ws);

  it('has one column per person plus total and amount', () => {
    expect(data[0]).toEqual([
      'Monat',
      'kWh Hardegger',
      'kWh Partnerin',
      'kWh Total',
      'Betrag CHF',
    ]);
  });

  it('lists the months that had consumption, oldest first', () => {
    expect(data.slice(1, -1).map((r) => r[0])).toEqual(['09.2026', '10.2026', '01.2027']);
  });

  it('omits a month whose only reading was a meter swap', () => {
    expect(data.map((r) => r[0])).not.toContain('11.2026');
  });

  it('splits September per person', () => {
    expect(data[1]).toEqual(['09.2026', 42.5, 52.5, 95, 26.6]);
  });

  it('writes a zero for a person who did not charge that month', () => {
    expect(data[2]).toEqual(['10.2026', 115, 0, 115, 32.2]);
  });

  it('values January at the price stored in the reading (FR-5.3)', () => {
    expect(data[3]).toEqual(['01.2027', 0, 55, 55, 17.05]);
  });

  it('closes with a total row that adds up', () => {
    const total = data[data.length - 1]!;
    expect(total[0]).toBe('Total');
    expect(total[3]).toBe(265);
    expect(total[4]).toBe(75.85);
    expect(Number(total[1]) + Number(total[2])).toBeCloseTo(265, 5);
  });

  it('formats amounts with two decimals (FR-6.5)', () => {
    expect(cell(ws, 'E2')?.z).toBe('#,##0.00');
  });

  it('handles a data set with a single person', () => {
    const solo = readings.filter((r) => r.person === 'Hardegger');
    const sheet = buildWorkbook(solo, settings, period).Sheets[SHEET_MONTHLY]!;
    expect(rows(sheet)[0]).toEqual(['Monat', 'kWh Hardegger', 'kWh Total', 'Betrag CHF']);
  });

  it('produces a header and an empty total row when there is nothing to report', () => {
    const sheet = buildWorkbook([], settings, period).Sheets[SHEET_MONTHLY]!;
    const empty = rows(sheet);
    expect(empty[0]).toEqual(['Monat', 'kWh Total', 'Betrag CHF']);
    expect(empty[1]).toEqual(['Total', 0, 0]);
  });
});

describe('sheet 3 - Abrechnungsblatt (FR-6.2)', () => {
  const wb = buildWorkbook(readings, settings, period);
  const ws = wb.Sheets[SHEET_STATEMENT]!;
  const text = XLSX.utils.sheet_to_csv(ws);

  it('carries every field FR-6.2 requires', () => {
    for (const label of [
      'Mieter',
      'Objekt',
      'Fahrzeug',
      'Abrechnungsperiode von',
      'Abrechnungsperiode bis',
      'Geladene Energie (kWh)',
      'Strompreis (CHF/kWh)',
      'Zu vergüten (CHF)',
      'Ort, Datum',
      'Unterschrift',
    ]) {
      expect(text, label).toContain(label);
    }
  });

  it('fills in the tenant details from the settings', () => {
    expect(cell(ws, 'C3')?.v).toBe('A Tenant');
    expect(cell(ws, 'C4')?.v).toBe('Garage - charging bay');
    expect(cell(ws, 'C5')?.v).toBe('Volvo EX30');
  });

  it('reports the total that periodTotal computes', () => {
    const t = periodTotal(readings, period);
    expect(cell(ws, 'C10')?.v).toBe(t.totalKwh);
    expect(cell(ws, 'C12')?.v).toBe(t.amountChf);
  });

  it('restricts the figures to the settlement period', () => {
    // 2027 consumption must not appear in the 2026 statement.
    expect(cell(ws, 'C10')?.v).toBe(210);
    expect(cell(ws, 'C12')?.v).toBe(58.8);
  });

  it('counts only the readings that contributed consumption', () => {
    // Of the six 2026 readings, the opening one and the meter swap contribute
    // nothing, leaving four.
    expect(cell(ws, 'C8')?.v).toBe(4);
  });

  it('reports the price actually charged', () => {
    expect(cell(ws, 'C11')?.v).toBe(0.28);
  });

  it('shows the price with enough decimals to reconcile with the total', () => {
    // A price rounded to two decimals stops multiplying out as soon as the
    // tariff changes mid-period, which is exactly when it is questioned.
    expect(cell(ws, 'C11')?.z).toBe('0.0000');
  });

  it('price times energy equals the amount, even across a tariff change', () => {
    const span = { from: '2026-01-01', to: '2027-12-31' };
    const sheet = buildWorkbook(readings, settings, span).Sheets[SHEET_STATEMENT]!;
    const kwh = cell(sheet, 'C10')?.v as number;
    const price = cell(sheet, 'C11')?.v as number;
    const amount = cell(sheet, 'C12')?.v as number;
    // Rounded to the four decimals the sheet displays.
    const displayed = Math.round(price * 10000) / 10000;
    expect(Math.abs(kwh * displayed - amount)).toBeLessThan(0.01);
  });

  it('reports the weighted price when the tariff changed mid-period', () => {
    const sheet = buildWorkbook(readings, settings, {
      from: '2026-01-01',
      to: '2027-12-31',
    }).Sheets[SHEET_STATEMENT]!;
    expect(cell(sheet, 'C11')?.v).toBe(0.2862);
  });

  it('writes the period bounds as dates', () => {
    expect(cell(ws, 'C6')?.t).toBe('d');
    expect(cell(ws, 'C7')?.t).toBe('d');
  });

  it('fits on one A4 page (AC-8)', () => {
    const range = XLSX.utils.decode_range(ws['!ref'] as string);
    // Portrait A4 holds roughly 45 rows and 8 columns at a readable size.
    expect(range.e.r + 1).toBeLessThanOrEqual(45);
    expect(range.e.c + 1).toBeLessThanOrEqual(8);
  });

  it('stays intact through a write and read cycle', () => {
    const back = roundTrip(wb).Sheets[SHEET_STATEMENT]!;
    expect(XLSX.utils.sheet_to_csv(back)).toContain('Zu vergüten (CHF)');
  });

  it('produces zeroes, not errors, for a period without readings', () => {
    const sheet = buildWorkbook(readings, settings, {
      from: '2030-01-01',
      to: '2030-12-31',
    }).Sheets[SHEET_STATEMENT]!;
    expect(cell(sheet, 'C10')?.v).toBe(0);
    expect(cell(sheet, 'C12')?.v).toBe(0);
  });

  it('leaves the fields blank rather than inventing them when settings are empty', () => {
    const blank: Settings = { ...settings, tenant: '', premises: '', vehicle: '' };
    const sheet = buildWorkbook(readings, blank, period).Sheets[SHEET_STATEMENT]!;
    expect(cell(sheet, 'C3')?.v).toBe('');
  });
});

describe('the app and the spreadsheet agree (AC-7)', () => {
  it('the monthly total row equals the statement total for the same span', () => {
    const wholeSpan: Period = { from: '2026-01-01', to: '2027-12-31' };
    const wb = buildWorkbook(readings, settings, wholeSpan);
    const monthly = rows(wb.Sheets[SHEET_MONTHLY]!);
    const totalRow = monthly[monthly.length - 1]!;
    expect(totalRow[3]).toBe(periodTotal(readings, wholeSpan).totalKwh);
    expect(totalRow[4]).toBe(periodTotal(readings, wholeSpan).amountChf);
  });
});
