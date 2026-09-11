import { describe, expect, it } from 'vitest';
import { mkdirSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { buildWorkbook, exportFilename } from '../src/export/xlsx';
import { monthlyTotals, periodTotal } from '../src/lib/calc';
import type { Reading, Settings } from '../src/types';

const OUT = process.env['SAMPLE_OUT'];

const mk = (
  id: string, date: string, meter: number, person: string, price = 0.28, note?: string,
): Reading => ({
  id, date, meterKwh: meter, person, priceChfPerKwh: price,
  createdAt: `${date}T18:00:00Z`, ...(note ? { note } : {}),
});

const readings: Reading[] = [
  mk('r1', '2026-01-05', 0, 'Hardegger', 0.28, 'Anfangsablesung'),
  mk('r2', '2026-01-19', 42.5, 'Hardegger'),
  mk('r3', '2026-02-03', 95, 'Partnerin'),
  mk('r4', '2026-02-21', 150, 'Hardegger'),
  mk('r5', '2026-03-11', 210, 'Hardegger', 0.28, 'nach Wochenende'),
  mk('r6', '2026-04-02', 5, 'Hardegger', 0.28, 'neues Ladegeraet'),
  mk('r7', '2026-05-08', 60, 'Partnerin', 0.31),
  mk('r8', '2026-06-14', 128, 'Hardegger', 0.31),
];

const settings: Settings = {
  personName: 'Hardegger', priceChfPerKwh: 0.31,
  tenant: 'Urs Hardegger', premises: 'Garage - Ladeplatz Elektrofahrzeug',
  vehicle: 'Volvo EX30', language: 'de', schemaVersion: 1,
};

const period = { from: '2026-01-01', to: '2026-12-31' };

describe.runIf(OUT)('sample export for manual AC-7 verification', () => {
  it('writes a real workbook and prints the figures to compare against', () => {
    mkdirSync(OUT!, { recursive: true });
    const wb = buildWorkbook(readings, settings, period);
    const path = `${OUT}/${exportFilename(period)}`;
    XLSX.writeFile(wb, path, { bookType: 'xlsx', cellDates: true });

    const lines = ['', `written: ${path}`, '', 'App figures, to compare against the sheets:'];
    for (const m of monthlyTotals(readings)) {
      lines.push(
        `  ${m.key}   ${String(m.totalKwh).padStart(6)} kWh   CHF ${String(m.amountChf).padStart(6)}   ${JSON.stringify(m.byPerson)}`,
      );
    }
    const t = periodTotal(readings, period);
    lines.push(
      `  period   ${t.totalKwh} kWh   CHF ${t.amountChf}   price ${t.priceChfPerKwh}`,
    );
    console.log(lines.join('\n'));

    expect(wb.SheetNames).toHaveLength(3);
  });
});
