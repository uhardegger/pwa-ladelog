// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { App } from '../src/components/App';
import { renderWithApp, mkReading, type Harness } from './helpers';
import { toIsoDate } from '../src/lib/dates';
import { formatDate } from '../src/i18n';
import { SETTINGS_STORAGE_KEY } from '../src/db/settings';

let harness: Harness | null = null;

afterEach(async () => {
  cleanup();
  await harness?.close();
  harness = null;
});

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toIsoDate(d);
};

/** Three months of readings, all safely in the past. */
const readings = [
  mkReading('a', '2026-01-05', 0),
  mkReading('b', '2026-01-20', 42.5),
  mkReading('c', '2026-02-10', 95, 'Partnerin'),
  mkReading('d', '2026-03-05', 150),
  mkReading('e', daysAgo(20), 210),
];

const goTo = async (h: Harness, name: string) =>
  h.user.click(await screen.findByRole('button', { name }));

describe('the reading list (FR-4)', () => {
  it('lists readings newest first (FR-4.1)', async () => {
    harness = await renderWithApp(<App />, { readings });
    await goTo(harness, 'Liste');
    const items = await screen.findAllByRole('listitem');
    expect(within(items[0]!).getByText(formatDate('de', daysAgo(20)))).toBeInTheDocument();
    expect(within(items[4]!).getByText('05.01.2026')).toBeInTheDocument();
  });

  it('shows date, meter, consumption and person for each reading', async () => {
    harness = await renderWithApp(<App />, { readings });
    await goTo(harness, 'Liste');
    const items = await screen.findAllByRole('listitem');
    const march = items[1]!;
    expect(within(march).getByText('05.03.2026')).toBeInTheDocument();
    expect(within(march).getByText('Zähler 150.0 kWh')).toBeInTheDocument();
    expect(within(march).getByText('+55.0')).toBeInTheDocument();
    expect(within(march).getByText('Hardegger')).toBeInTheDocument();
  });

  it('marks the opening reading rather than showing a consumption (FR-4.4)', async () => {
    harness = await renderWithApp(<App />, { readings });
    await goTo(harness, 'Liste');
    const items = await screen.findAllByRole('listitem');
    expect(within(items[4]!).getByText('Anfang')).toBeInTheDocument();
  });

  it('flags a meter replacement', async () => {
    harness = await renderWithApp(<App />, {
      readings: [mkReading('x', '2026-01-01', 100), mkReading('y', '2026-02-01', 5)],
    });
    await goTo(harness, 'Liste');
    expect(await screen.findByText('Zählerwechsel')).toBeInTheDocument();
  });

  it('says so when there is nothing to list', async () => {
    harness = await renderWithApp(<App />);
    await goTo(harness, 'Liste');
    expect(await screen.findByText('Noch keine Ablesungen.')).toBeInTheDocument();
  });
});

describe('editing a reading (FR-4.2)', () => {
  it('opens an editor prefilled with the reading', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    await goTo(harness, 'Liste');
    await user.click((await screen.findAllByRole('listitem'))[1]!.querySelector('button')!);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Zählerstand/)).toHaveValue('150');
    expect(within(dialog).getByLabelText('Datum')).toHaveValue('2026-03-05');
  });

  it('saves a corrected meter value', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user, repository } = harness;
    await goTo(harness, 'Liste');
    await user.click((await screen.findAllByRole('listitem'))[1]!.querySelector('button')!);

    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(/Zählerstand/);
    await user.clear(field);
    await user.type(field, '160');
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }));

    await waitFor(async () => expect((await repository.get('d'))?.meterKwh).toBe(160));
  });

  it('recalculates the following readings after an edit (FR-4.2)', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    await goTo(harness, 'Liste');
    await user.click((await screen.findAllByRole('listitem'))[1]!.querySelector('button')!);

    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(/Zählerstand/);
    await user.clear(field);
    await user.type(field, '160');
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }));

    // 210 - 160 = 50 for the newest reading, and 160 - 95 = 65 for the edited one.
    await waitFor(async () => {
      const items = await screen.findAllByRole('listitem');
      expect(within(items[0]!).getByText('+50.0')).toBeInTheDocument();
      expect(within(items[1]!).getByText('+65.0')).toBeInTheDocument();
    });
  });

  it('does not compare an edited reading against its own old value', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    await goTo(harness, 'Liste');
    await user.click((await screen.findAllByRole('listitem'))[1]!.querySelector('button')!);

    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(/Zählerstand/);
    await user.clear(field);
    await user.type(field, '120');
    // 120 is below its old value of 150 but above its predecessor of 95, so
    // this is a perfectly ordinary edit and must raise no warning.
    expect(within(dialog).queryByText(/niedriger als letzter Stand/)).not.toBeInTheDocument();
  });
});

describe('deleting a reading (FR-4.2, FR-4.3)', () => {
  it('asks before deleting', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user, repository } = harness;
    await goTo(harness, 'Liste');
    await user.click((await screen.findAllByRole('listitem'))[1]!.querySelector('button')!);

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }));

    expect(await screen.findByText(/Diese Ablesung löschen\?/)).toBeInTheDocument();
    expect(await repository.count()).toBe(5);
  });

  it('deletes only after the confirmation', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user, repository } = harness;
    await goTo(harness, 'Liste');
    await user.click((await screen.findAllByRole('listitem'))[1]!.querySelector('button')!);

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await user.click(await screen.findByRole('button', { name: 'Löschen' }));

    await waitFor(async () => expect(await repository.count()).toBe(4));
  });

  it('can be called off', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user, repository } = harness;
    await goTo(harness, 'Liste');
    await user.click((await screen.findAllByRole('listitem'))[1]!.querySelector('button')!);

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }));

    expect(await repository.count()).toBe(5);
  });

  it('recalculates the following readings after a deletion (FR-4.2)', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    await goTo(harness, 'Liste');
    await user.click((await screen.findAllByRole('listitem'))[1]!.querySelector('button')!);

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await user.click(await screen.findByRole('button', { name: 'Löschen' }));

    // With the March reading gone, the newest one is measured against 95.
    await waitFor(async () => {
      const items = await screen.findAllByRole('listitem');
      expect(items).toHaveLength(4);
      expect(within(items[0]!).getByText('+115.0')).toBeInTheDocument();
    });
  });
});

describe('the monthly overview (FR-5)', () => {
  it('shows one row per month with totals per person', async () => {
    harness = await renderWithApp(<App />, { readings });
    await goTo(harness, 'Monate');

    const row = await screen.findByRole('row', { name: /Februar 2026/ });
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    // Columns: Hardegger, Partnerin, total, amount. Only Partnerin charged.
    expect(cells).toEqual(['0.0', '52.5', '52.5', '14.70']);
  });

  it('shows an amount in CHF per month (FR-5.1)', async () => {
    harness = await renderWithApp(<App />, { readings });
    await goTo(harness, 'Monate');
    const row = await screen.findByRole('row', { name: /Januar 2026/ });
    // 42.5 kWh at 0.28
    expect(within(row).getByText('11.90')).toBeInTheDocument();
  });

  it('says so when nothing has been consumed yet', async () => {
    harness = await renderWithApp(<App />, { readings: [mkReading('a', '2026-01-05', 0)] });
    await goTo(harness, 'Monate');
    expect(await screen.findByText(/Noch kein Verbrauch erfasst/)).toBeInTheDocument();
  });
});

describe('settings (FR-9)', () => {
  it('switches the interface language', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    await goTo(harness, 'Einstellungen');

    await user.selectOptions(await screen.findByLabelText('Sprache'), 'en');

    expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByLabelText('Language')).toBeInTheDocument();
  });

  it('persists the language across a restart', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user, storage } = harness;
    await goTo(harness, 'Einstellungen');
    await user.selectOptions(await screen.findByLabelText('Sprache'), 'en');

    const stored = JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY)!);
    expect(stored.language).toBe('en');
  });

  it('stores a changed price without touching past readings (FR-5.3)', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user, storage, repository } = harness;
    await goTo(harness, 'Einstellungen');

    const price = await screen.findByLabelText(/Strompreis/);
    await user.clear(price);
    await user.type(price, '0.31');

    await waitFor(() => {
      const stored = JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY)!);
      expect(stored.priceChfPerKwh).toBe(0.31);
    });
    // Everything already captured keeps the price it was captured at.
    for (const reading of await repository.list()) {
      expect(reading.priceChfPerKwh).toBe(0.28);
    }
  });

  it('complains about an unusable price instead of storing it', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user, storage } = harness;
    await goTo(harness, 'Einstellungen');

    const price = await screen.findByLabelText(/Strompreis/);
    await user.clear(price);
    await user.type(price, 'abc');

    expect(await screen.findByText(/Preis eingeben/)).toBeInTheDocument();
    expect(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY)!).priceChfPerKwh).toBe(0.28);
  });

  it('accepts a space in the settlement fields', async () => {
    // normalizeSettings trims what it stores; an input bound straight to the
    // stored value would lose the trailing space the instant it was typed, so
    // a two-word tenant or vehicle could never be entered at all.
    harness = await renderWithApp(<App />, { readings });
    const { user, storage } = harness;
    await goTo(harness, 'Einstellungen');

    await user.type(await screen.findByLabelText('Mieter'), 'Urs Hardegger');
    expect(screen.getByLabelText('Mieter')).toHaveValue('Urs Hardegger');

    await waitFor(() => {
      const stored = JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY)!);
      expect(stored.tenant).toBe('Urs Hardegger');
    });
  });

  it('accepts spaces in the premises and vehicle fields too', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user, storage } = harness;
    await goTo(harness, 'Einstellungen');

    await user.type(await screen.findByLabelText('Objekt'), 'Garage - Ladeplatz EV');
    await user.type(screen.getByLabelText('Fahrzeug'), 'Volvo EX30');

    expect(screen.getByLabelText('Objekt')).toHaveValue('Garage - Ladeplatz EV');
    expect(screen.getByLabelText('Fahrzeug')).toHaveValue('Volvo EX30');

    await waitFor(() => {
      const stored = JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY)!);
      expect(stored.premises).toBe('Garage - Ladeplatz EV');
      expect(stored.vehicle).toBe('Volvo EX30');
    });
  });

  it('accepts a space in the name field', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user, storage } = harness;
    await goTo(harness, 'Einstellungen');

    const field = await screen.findByLabelText('Eigener Name');
    await user.clear(field);
    await user.type(field, 'Urs Hardegger');

    expect(field).toHaveValue('Urs Hardegger');
    await waitFor(() => {
      const stored = JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY)!);
      expect(stored.personName).toBe('Urs Hardegger');
    });
  });

  it('clearing the name does not throw the user back to the setup screen', async () => {
    // Otherwise a name could never be corrected by clearing and retyping it.
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    await goTo(harness, 'Einstellungen');

    await user.clear(await screen.findByLabelText('Eigener Name'));

    expect(screen.queryByText('Willkommen')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Eigener Name')).toBeInTheDocument();
  });

  it('warns while the name is empty, since every reading is stamped with it', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    await goTo(harness, 'Einstellungen');

    await user.clear(await screen.findByLabelText('Eigener Name'));
    expect(await screen.findByText(/Name eingeben/)).toBeInTheDocument();
  });

  it('does not store the padding around a settlement field', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user, storage } = harness;
    await goTo(harness, 'Einstellungen');

    const field = await screen.findByLabelText('Fahrzeug');
    await user.type(field, '  Volvo EX30  ');
    await user.tab();

    // What is typed stays visible while typing; what is stored is normalised,
    // and leaving the field shows the stored form.
    await waitFor(() => {
      const stored = JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY)!);
      expect(stored.vehicle).toBe('Volvo EX30');
    });
    expect(screen.getByLabelText('Fahrzeug')).toHaveValue('Volvo EX30');
  });

  it('names the settlement fields that are still missing (FR-6.2)', async () => {
    harness = await renderWithApp(<App />, { readings });
    await goTo(harness, 'Einstellungen');
    expect(await screen.findByText(/Vor dem Versand der Abrechnung ausfüllen/)).toBeInTheDocument();
  });

  it('stops complaining once they are filled in', async () => {
    harness = await renderWithApp(<App />, {
      readings,
      settings: { tenant: 'T', premises: 'P', vehicle: 'V' },
    });
    await goTo(harness, 'Einstellungen');
    await screen.findByLabelText('Mieter');
    expect(screen.queryByText(/Vor dem Versand/)).not.toBeInTheDocument();
  });
});

describe('sharing the app itself', () => {
  const stubNavigator = (key: 'share' | 'clipboard', value: unknown) => {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  };

  afterEach(() => {
    stubNavigator('share', undefined);
    stubNavigator('clipboard', undefined);
  });

  it('shows the address as selectable text, not only behind a button', async () => {
    // If both sharing and the clipboard fail there must still be something to
    // read out or copy by hand.
    harness = await renderWithApp(<App />, { readings });
    await goTo(harness, 'Teilen');
    expect(await screen.findByText(window.location.origin + '/')).toBeInTheDocument();
  });

  it('offers the share sheet where the browser has one', async () => {
    stubNavigator('share', async () => {});
    harness = await renderWithApp(<App />, { readings });
    await goTo(harness, 'Teilen');
    expect(await screen.findByRole('button', { name: 'Link teilen' })).toBeInTheDocument();
  });

  it('offers copying instead where it does not', async () => {
    harness = await renderWithApp(<App />, { readings });
    await goTo(harness, 'Teilen');
    expect(await screen.findByRole('button', { name: 'Link kopieren' })).toBeInTheDocument();
  });

  it('shares the address and confirms', async () => {
    const share = vi.fn(async (_d: ShareData) => {});
    stubNavigator('share', share);
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    await goTo(harness, 'Teilen');

    await user.click(await screen.findByRole('button', { name: 'Link teilen' }));

    expect(await screen.findByText('Zum Teilen bereitgestellt.')).toBeInTheDocument();
    expect(share.mock.calls[0]![0].url).toBe(window.location.origin + '/');
  });

  it('copies the address and confirms when there is no share sheet', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    await goTo(harness, 'Teilen');

    await user.click(await screen.findByRole('button', { name: 'Link kopieren' }));

    expect(await screen.findByText('Link kopiert.')).toBeInTheDocument();
    // user-event installs its own clipboard, so read back from that rather
    // than from a stub of our own, which it would have replaced.
    expect(await navigator.clipboard.readText()).toBe(window.location.origin + '/');
  });

  it('says so rather than staying silent when it can do neither', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    await goTo(harness, 'Teilen');
    // Removed after the render, because user-event's setup() installs a
    // working clipboard that would otherwise mask this case.
    stubNavigator('clipboard', undefined);

    await user.click(await screen.findByRole('button', { name: 'Link kopieren' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Adresse oben/);
  });

  it('shares no reading data, only the address', async () => {
    const share = vi.fn(async (_d: ShareData) => {});
    stubNavigator('share', share);
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    await goTo(harness, 'Teilen');

    await user.click(await screen.findByRole('button', { name: 'Link teilen' }));

    const shared = JSON.stringify(share.mock.calls[0]![0]);
    expect(shared).not.toContain('Hardegger');
    expect(shared).not.toContain('kWh');
    expect(share.mock.calls[0]![0].files).toBeUndefined();
  });
});

describe('export and import (FR-6, FR-7, FR-8)', () => {
  it('defaults the period to the current calendar year (FR-6.3)', async () => {
    harness = await renderWithApp(<App />, { readings });
    await goTo(harness, 'Export');
    const year = new Date().getFullYear();
    expect(await screen.findByLabelText('Von')).toHaveValue(`${year}-01-01`);
    expect(screen.getByLabelText('Bis')).toHaveValue(`${year}-12-31`);
  });

  it('reports the outcome of an Excel export (FR-7.3)', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await goTo(harness, 'Export');

    await user.click(await screen.findByRole('button', { name: 'Excel-Abrechnung' }));
    expect(await screen.findByText(/Datei heruntergeladen/)).toBeInTheDocument();
  });

  it('reports the outcome of a JSON backup', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await goTo(harness, 'Export');

    await user.click(await screen.findByRole('button', { name: 'Daten sichern' }));
    expect(await screen.findByText(/Datei heruntergeladen/)).toBeInTheDocument();
  });

  it('offers nothing to export while there is no data', async () => {
    harness = await renderWithApp(<App />);
    await goTo(harness, 'Export');
    expect(await screen.findByRole('button', { name: 'Excel-Abrechnung' })).toBeDisabled();
    expect(screen.getByText('Es gibt noch nichts zu exportieren.')).toBeInTheDocument();
  });

  it('merges an imported bundle and reports the counts (FR-8.3)', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user, repository } = harness;
    await goTo(harness, 'Export');

    const bundle = JSON.stringify({
      schemaVersion: 1,
      readings: [
        mkReading('c', '2026-02-10', 95, 'Partnerin'),
        mkReading('p1', '2026-04-02', 260, 'Partnerin'),
      ],
    });
    await user.upload(
      screen.getByLabelText('Datei wählen'),
      new File([bundle], 'partner.json', { type: 'application/json' }),
    );

    expect(await screen.findByText('1 neu, 1 bereits vorhanden.')).toBeInTheDocument();
    await waitFor(async () => expect(await repository.count()).toBe(6));
  });

  it('a second import of the same file adds nothing (AC-9)', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user, repository } = harness;
    await goTo(harness, 'Export');

    const bundle = JSON.stringify({
      schemaVersion: 1,
      readings: [mkReading('p1', '2026-04-02', 260, 'Partnerin')],
    });
    const file = () => new File([bundle], 'partner.json', { type: 'application/json' });
    const input = screen.getByLabelText('Datei wählen');

    await user.upload(input, file());
    await screen.findByText(/1 neu/);
    await user.upload(input, file());

    expect(await screen.findByText(/Nichts Neues/)).toBeInTheDocument();
    expect(await repository.count()).toBe(6);
  });

  it('rejects a file that is not an export, without changing anything', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user, repository } = harness;
    await goTo(harness, 'Export');

    await user.upload(
      screen.getByLabelText('Datei wählen'),
      // A .json file the picker would accept, whose content is not JSON at all.
      new File(['not json'], 'broken.json', { type: 'application/json' }),
    );

    expect(await screen.findByText(/nicht lesbar/)).toBeInTheDocument();
    expect(await repository.count()).toBe(5);
  });

  it('refuses a bundle from a newer version of the app', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    await goTo(harness, 'Export');

    await user.upload(
      screen.getByLabelText('Datei wählen'),
      new File([JSON.stringify({ schemaVersion: 99, readings: [] })], 'new.json', {
        type: 'application/json',
      }),
    );

    expect(await screen.findByText(/neueren Version/)).toBeInTheDocument();
  });

  it('reports entries it could not read alongside the ones it merged', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    await goTo(harness, 'Export');

    const bundle = JSON.stringify({
      schemaVersion: 1,
      readings: [mkReading('p1', '2026-04-02', 260, 'Partnerin'), { id: '', date: 'nope' }],
    });
    await user.upload(
      screen.getByLabelText('Datei wählen'),
      new File([bundle], 'partner.json', { type: 'application/json' }),
    );

    expect(
      await screen.findByText('1 neu, 0 bereits vorhanden, 1 unlesbar und übersprungen.'),
    ).toBeInTheDocument();
  });
});

describe('the tab bar', () => {
  const tabNames = ['Erfassen', 'Liste', 'Monate', 'Export', 'Teilen', 'Einstellungen'];

  /** The visible words, without the decorative icon glyph beside them. */
  const visibleLabels = (bar: HTMLElement) =>
    within(bar)
      .getAllByRole('button')
      .map((b) => b.querySelector('.tab__label')?.textContent);

  it('offers the six tabs in order', async () => {
    harness = await renderWithApp(<App />, { readings });
    const bar = await screen.findByRole('navigation');
    expect(visibleLabels(bar)).toEqual(tabNames);
  });

  it('every tab reaches a screen', async () => {
    harness = await renderWithApp(<App />, { readings });
    const { user } = harness;
    const bar = await screen.findByRole('navigation');
    for (const name of tabNames) {
      const tab = within(bar).getByRole('button', { name });
      await user.click(tab);
      expect(tab, name).toHaveAttribute('aria-current', 'page');
    }
  });

  it('names each tab by the word printed on it, for voice control', async () => {
    // A shortened visible label with a different aria-label would break
    // "label in name": saying the word on screen would not select the tab.
    harness = await renderWithApp(<App />, { readings });
    const bar = await screen.findByRole('navigation');
    for (const label of tabNames) {
      expect(within(bar).getByRole('button', { name: label }), label).toBeInTheDocument();
    }
  });

  it('translates the tabs', async () => {
    harness = await renderWithApp(<App />, { readings, settings: { language: 'en' } });
    const bar = await screen.findByRole('navigation');
    expect(visibleLabels(bar)).toEqual([
      'Log',
      'Readings',
      'Months',
      'Export',
      'Share',
      'Settings',
    ]);
  });

  it('keeps the share action out of the settings screen', async () => {
    harness = await renderWithApp(<App />, { readings });
    await goTo(harness, 'Einstellungen');
    await screen.findByLabelText('Mieter');
    expect(screen.queryByRole('button', { name: /Link (teilen|kopieren)/ })).toBeNull();
  });
});

describe('navigation (AC-3)', () => {
  it('starts on the capture form, not on a menu', async () => {
    harness = await renderWithApp(<App />, { readings });
    expect(await screen.findByLabelText(/Zählerstand/)).toBeInTheDocument();
  });

  it('marks the current tab for assistive technology', async () => {
    harness = await renderWithApp(<App />, { readings });
    await goTo(harness, 'Liste');
    expect(await screen.findByRole('button', { name: 'Liste' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('returns to the capture form from anywhere in one tap', async () => {
    harness = await renderWithApp(<App />, { readings });
    await goTo(harness, 'Einstellungen');
    await goTo(harness, 'Erfassen');
    expect(await screen.findByLabelText(/Zählerstand/)).toBeInTheDocument();
  });
});
