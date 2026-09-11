// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildJsonBundle,
  parseBundle,
  parseReading,
} from '../src/export/json';
import {
  createReadingsRepository,
  openLadelogDatabase,
  type LadelogDatabase,
  type ReadingsRepository,
} from '../src/db';
import { SCHEMA_VERSION, type Reading, type Settings } from '../src/types';

const mk = (id: string, date: string, meter: number, person = 'Hardegger'): Reading => ({
  id,
  date,
  meterKwh: meter,
  person,
  priceChfPerKwh: 0.28,
  createdAt: `${date}T18:00:00.000Z`,
});

const readings: Reading[] = [
  mk('a', '2026-09-01', 0),
  mk('b', '2026-09-08', 42.5),
  mk('c', '2026-09-20', 95, 'Partnerin'),
];

const settings: Settings = {
  personName: 'Hardegger',
  priceChfPerKwh: 0.28,
  tenant: 'A Tenant',
  premises: 'Garage',
  vehicle: 'EX30',
  language: 'de',
  schemaVersion: SCHEMA_VERSION,
};

const asText = (payload: { blob: Blob }) => payload.blob.text();

describe('buildJsonBundle (FR-8.1)', () => {
  it('writes a bundle with the four specified fields', async () => {
    const parsed = JSON.parse(await asText(buildJsonBundle(readings, settings)));
    expect(Object.keys(parsed).sort()).toEqual([
      'exportedAt',
      'readings',
      'schemaVersion',
      'settings',
    ]);
  });

  it('includes every reading unchanged', async () => {
    const parsed = JSON.parse(await asText(buildJsonBundle(readings, settings)));
    expect(parsed.readings).toEqual(readings);
  });

  it('includes the settings (FR-9.2)', async () => {
    const parsed = JSON.parse(await asText(buildJsonBundle(readings, settings)));
    expect(parsed.settings).toEqual(settings);
  });

  it('stamps the current schema version', async () => {
    const parsed = JSON.parse(await asText(buildJsonBundle(readings, settings)));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('names the file with the export date', () => {
    const payload = buildJsonBundle(readings, settings, new Date('2026-11-03T10:00:00Z'));
    expect(payload.filename).toBe('Ladelog_Daten_2026-11-03.json');
  });

  it('declares the JSON media type', () => {
    expect(buildJsonBundle(readings, settings).blob.type).toBe('application/json');
  });

  it('does not alias the caller’s array', async () => {
    const input = [...readings];
    const payload = buildJsonBundle(input, settings);
    input.push(mk('z', '2026-12-01', 300));
    const parsed = JSON.parse(await asText(payload));
    expect(parsed.readings).toHaveLength(3);
  });

  it('exports an empty data set without failing', async () => {
    const parsed = JSON.parse(await asText(buildJsonBundle([], settings)));
    expect(parsed.readings).toEqual([]);
  });
});

describe('parseReading', () => {
  const valid = mk('a', '2026-09-01', 42.5);

  it('accepts a well-formed reading unchanged', () => {
    expect(parseReading(valid)).toEqual(valid);
  });

  it('keeps an optional note', () => {
    expect(parseReading({ ...valid, note: 'garage' })?.note).toBe('garage');
  });

  it('drops an empty note rather than storing one', () => {
    expect(parseReading({ ...valid, note: '' })?.note).toBeUndefined();
  });

  it('rejects an entry without a usable id - there would be nothing to dedupe on', () => {
    expect(parseReading({ ...valid, id: '' })).toBeNull();
    expect(parseReading({ ...valid, id: 42 })).toBeNull();
    expect(parseReading({ ...valid, id: undefined })).toBeNull();
  });

  it('rejects an entry without a real date - ordering would be undefined', () => {
    expect(parseReading({ ...valid, date: '2026-13-01' })).toBeNull();
    expect(parseReading({ ...valid, date: '2026-02-30' })).toBeNull();
    expect(parseReading({ ...valid, date: '01.09.2026' })).toBeNull();
    expect(parseReading({ ...valid, date: null })).toBeNull();
  });

  it('rejects an entry without a usable meter value', () => {
    expect(parseReading({ ...valid, meterKwh: 'lots' })).toBeNull();
    expect(parseReading({ ...valid, meterKwh: Number.NaN })).toBeNull();
    expect(parseReading({ ...valid, meterKwh: -1 })).toBeNull();
    expect(parseReading({ ...valid, meterKwh: undefined })).toBeNull();
  });

  it('substitutes a missing createdAt instead of dropping the reading', () => {
    // createdAt is only a tie-breaker; losing a reading over it would be absurd.
    const parsed = parseReading({ ...valid, createdAt: undefined });
    expect(parsed).not.toBeNull();
    expect(parsed?.createdAt).toBe('2026-09-01T12:00:00.000Z');
  });

  it('substitutes a missing person with an empty name', () => {
    expect(parseReading({ ...valid, person: undefined })?.person).toBe('');
  });

  it('substitutes a missing price with zero rather than guessing', () => {
    // Guessing today's tariff would silently revalue someone else's history.
    expect(parseReading({ ...valid, priceChfPerKwh: undefined })?.priceChfPerKwh).toBe(0);
    expect(parseReading({ ...valid, priceChfPerKwh: -1 })?.priceChfPerKwh).toBe(0);
  });

  it('trims the id and the person name', () => {
    const parsed = parseReading({ ...valid, id: '  a  ', person: '  Hardegger ' });
    expect(parsed?.id).toBe('a');
    expect(parsed?.person).toBe('Hardegger');
  });

  it('rejects anything that is not an object', () => {
    for (const bad of [null, undefined, 'reading', 42, []]) {
      expect(parseReading(bad)).toBeNull();
    }
  });

  it('ignores unknown extra fields', () => {
    const parsed = parseReading({ ...valid, rogue: 'value' });
    expect(parsed).toEqual(valid);
  });
});

describe('parseBundle', () => {
  const bundleText = JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    exportedAt: '2026-11-03T10:00:00.000Z',
    settings,
    readings,
  });

  it('reads a bundle this app produced', async () => {
    const text = await asText(buildJsonBundle(readings, settings));
    const result = parseBundle(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle.readings).toEqual(readings);
  });

  it('reports the export timestamp', () => {
    const result = parseBundle(bundleText);
    if (!result.ok) throw new Error('expected ok');
    expect(result.bundle.exportedAt).toBe('2026-11-03T10:00:00.000Z');
  });

  it('rejects text that is not JSON', () => {
    const result = parseBundle('not json at all');
    expect(result).toMatchObject({ ok: false, reason: 'notJson' });
  });

  it('rejects a truncated file', () => {
    expect(parseBundle('{"readings": [')).toMatchObject({ ok: false, reason: 'notJson' });
  });

  it('rejects JSON that is not a bundle', () => {
    expect(parseBundle('[]')).toMatchObject({ ok: false, reason: 'notABundle' });
    expect(parseBundle('"a string"')).toMatchObject({ ok: false, reason: 'notABundle' });
    expect(parseBundle('null')).toMatchObject({ ok: false, reason: 'notABundle' });
    expect(parseBundle('{"foo":1}')).toMatchObject({ ok: false, reason: 'notABundle' });
  });

  it('refuses a bundle from a newer app version rather than guess', () => {
    const newer = JSON.stringify({ schemaVersion: 99, readings: [] });
    expect(parseBundle(newer)).toMatchObject({ ok: false, reason: 'schemaTooNew' });
  });

  it('accepts a bundle with no schema version, assuming the current one', () => {
    const result = parseBundle(JSON.stringify({ readings }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('skips a malformed entry and counts it, without losing the rest (FR-8.3)', () => {
    const mixed = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      readings: [readings[0], { id: '', date: 'nope' }, readings[1], 'garbage'],
    });
    const result = parseBundle(mixed);
    if (!result.ok) throw new Error('expected ok');
    expect(result.bundle.readings).toHaveLength(2);
    expect(result.bundle.invalid).toBe(2);
  });

  it('reports zero invalid entries for a clean file', () => {
    const result = parseBundle(bundleText);
    if (!result.ok) throw new Error('expected ok');
    expect(result.bundle.invalid).toBe(0);
  });

  it('accepts an empty bundle', () => {
    const result = parseBundle(JSON.stringify({ schemaVersion: 1, readings: [] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle.readings).toEqual([]);
  });

  it('exposes the sender settings without applying them', () => {
    const result = parseBundle(bundleText);
    if (!result.ok) throw new Error('expected ok');
    // Present for display, but the merge path never writes them.
    expect(result.bundle.senderSettings).toEqual(settings);
    expect('settings' in result.bundle).toBe(false);
  });
});

describe('a full export and import round trip (FR-8, AC-9)', () => {
  let db: LadelogDatabase;
  let repo: ReadingsRepository;
  let dbName: string;
  let counter = 0;

  beforeEach(async () => {
    dbName = `ladelog-json-${Date.now()}-${counter++}`;
    db = await openLadelogDatabase(dbName);
    repo = createReadingsRepository(async () => db);
  });

  afterEach(async () => {
    db.close();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });

  it('imports what it exported, unchanged', async () => {
    const text = await asText(buildJsonBundle(readings, settings));
    const parsed = parseBundle(text);
    if (!parsed.ok) throw new Error('expected ok');
    const merged = await repo.insertMissing(parsed.bundle.readings);
    expect(merged.added).toBe(3);
    expect(await repo.list()).toEqual(readings);
  });

  it('importing the same file twice adds nothing (AC-9)', async () => {
    const text = await asText(buildJsonBundle(readings, settings));
    const first = parseBundle(text);
    const second = parseBundle(text);
    if (!first.ok || !second.ok) throw new Error('expected ok');
    await repo.insertMissing(first.bundle.readings);
    const again = await repo.insertMissing(second.bundle.readings);
    expect(again.added).toBe(0);
    expect(again.skipped).toBe(3);
    expect(await repo.count()).toBe(3);
  });

  it('merges the partner’s file additively without touching own readings', async () => {
    const mine = [mk('a', '2026-09-01', 0), mk('b', '2026-09-08', 42.5)];
    await repo.insertMissing(mine);

    const partner = [mk('b', '2026-09-08', 999, 'Tampered'), mk('p', '2026-10-02', 130, 'Partnerin')];
    const text = await asText(buildJsonBundle(partner, settings));
    const parsed = parseBundle(text);
    if (!parsed.ok) throw new Error('expected ok');
    const merged = await repo.insertMissing(parsed.bundle.readings);

    expect(merged).toMatchObject({ added: 1, skipped: 1 });
    // The existing reading kept its own values (FR-8.2).
    expect((await repo.get('b'))?.meterKwh).toBe(42.5);
    expect(await repo.count()).toBe(3);
  });

  it('never removes anything on import (FR-8.4)', async () => {
    await repo.insertMissing(readings);
    const text = await asText(buildJsonBundle([], settings));
    const parsed = parseBundle(text);
    if (!parsed.ok) throw new Error('expected ok');
    await repo.insertMissing(parsed.bundle.readings);
    expect(await repo.count()).toBe(3);
  });
});
