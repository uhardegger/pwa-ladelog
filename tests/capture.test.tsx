// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { App } from '../src/components/App';
import { renderWithApp, mkReading, type Harness } from './helpers';
import { toIsoDate, todayIso } from '../src/lib/dates';
import { formatDate } from '../src/i18n';

let harness: Harness | null = null;

afterEach(async () => {
  cleanup();
  await harness?.close();
  harness = null;
});

/**
 * Fixture dates are relative to today, never absolute: a reading dated in the
 * future would sort after the draft being typed, so the form would compare
 * against the wrong predecessor and every consumption assertion would drift.
 */
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toIsoDate(d);
};

const LAST_DATE = daysAgo(14);

const existing = [
  mkReading('a', daysAgo(90), 0),
  mkReading('b', daysAgo(60), 42.5),
  mkReading('e', LAST_DATE, 210),
];

const meterField = () => screen.getByLabelText(/Zählerstand/);

describe('first start (FR-9, PRD OP-2)', () => {
  it('asks for the name once when the app ships without one', async () => {
    harness = await renderWithApp(<App />, { settings: { personName: '' } });
    expect(await screen.findByText('Willkommen')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Zählerstand/)).not.toBeInTheDocument();
  });

  it('goes straight to the capture form once a name is entered', async () => {
    harness = await renderWithApp(<App />, { settings: { personName: '' } });
    const { user } = harness;
    await user.type(screen.getByLabelText('Eigener Name'), 'Hardegger');
    await user.click(screen.getByRole('button', { name: 'Erfassung starten' }));
    expect(await screen.findByLabelText(/Zählerstand/)).toBeInTheDocument();
  });

  it('does not ask again once the name is known', async () => {
    harness = await renderWithApp(<App />);
    expect(await screen.findByLabelText(/Zählerstand/)).toBeInTheDocument();
    expect(screen.queryByText('Willkommen')).not.toBeInTheDocument();
  });
});

describe('the capture form is the app (FR-1)', () => {
  it('shows the form immediately, with no splash or start page', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    expect(await screen.findByLabelText(/Zählerstand/)).toBeInTheDocument();
  });

  it('puts the focus in the meter field at launch (FR-1.1)', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    await waitFor(() => expect(meterField()).toHaveFocus());
  });

  it('asks for a decimal keypad on the meter field (FR-1.1)', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    expect(await screen.findByLabelText(/Zählerstand/)).toHaveAttribute(
      'inputmode',
      'decimal',
    );
  });

  it('shows the last reading above the field so a typo stands out (FR-1.2)', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    expect(
      await screen.findByText(`Letzter Stand: 210.0 kWh am ${formatDate('de', LAST_DATE)}`),
    ).toBeInTheDocument();
  });

  it('says so when there is no previous reading', async () => {
    harness = await renderWithApp(<App />);
    expect(await screen.findByText(/Noch keine Ablesung/)).toBeInTheDocument();
  });

  it('prefills date and person without any interaction (AC-4)', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    expect(await screen.findByLabelText('Datum')).toHaveValue(todayIso());
    expect(screen.getByLabelText('Person')).toHaveValue('Hardegger');
  });

  it('shows the consumption live while typing (FR-1.3)', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    const { user } = harness;
    await user.type(await screen.findByLabelText(/Zählerstand/), '250');
    expect(await screen.findByText('= 40.0 kWh geladen')).toBeInTheDocument();
  });

  it('updates the live figure as more digits arrive', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    const { user } = harness;
    const field = await screen.findByLabelText(/Zählerstand/);
    await user.type(field, '25');
    await user.type(field, '0.5');
    expect(await screen.findByText('= 40.5 kWh geladen')).toBeInTheDocument();
  });

  it('reads a decimal comma exactly like a point (AC-5)', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    const { user } = harness;
    await user.type(await screen.findByLabelText(/Zählerstand/), '252,5');
    expect(await screen.findByText('= 42.5 kWh geladen')).toBeInTheDocument();
  });
});

describe('saving (FR-1.4, AC-3)', () => {
  it('saves and confirms with the consumption in two interactions', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    const { user, repository } = harness;

    // Interaction 1: type. Interaction 2: tap Save. The field already has
    // focus, so no tap is needed to reach it - two of the three AC-3 allows.
    await user.type(await screen.findByLabelText(/Zählerstand/), '250');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Gespeichert. 40.0 kWh geladen.')).toBeInTheDocument();
    await waitFor(async () => expect(await repository.count()).toBe(4));
  });

  it('persists what it displayed', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    const { user, repository } = harness;
    await user.type(await screen.findByLabelText(/Zählerstand/), '252,5');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText(/Gespeichert/);

    const stored = await repository.list();
    const newest = stored.find((r) => r.meterKwh === 252.5);
    expect(newest).toBeDefined();
    expect(newest?.person).toBe('Hardegger');
    expect(newest?.date).toBe(todayIso());
    expect(newest?.priceChfPerKwh).toBe(0.28);
  });

  it('stamps the price in force at capture, not a reference to it (FR-5.3)', async () => {
    harness = await renderWithApp(<App />, {
      readings: existing,
      settings: { priceChfPerKwh: 0.31 },
    });
    const { user, repository } = harness;
    await user.type(await screen.findByLabelText(/Zählerstand/), '250');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText(/Gespeichert/);
    const stored = await repository.list();
    expect(stored.find((r) => r.meterKwh === 250)?.priceChfPerKwh).toBe(0.31);
  });

  it('announces the first reading as the opening one', async () => {
    harness = await renderWithApp(<App />);
    const { user } = harness;
    await user.type(await screen.findByLabelText(/Zählerstand/), '100');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Als Anfangsablesung gespeichert.')).toBeInTheDocument();
  });

  it('clears the field and returns focus, ready for the next reading', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    const { user } = harness;
    await user.type(await screen.findByLabelText(/Zählerstand/), '250');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText(/Gespeichert/);
    expect(meterField()).toHaveValue('');
    await waitFor(() => expect(meterField()).toHaveFocus());
  });

  it('keeps Save disabled until there is a number to save', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    expect(await screen.findByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  it('carries a note through to storage', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    const { user, repository } = harness;
    await user.type(await screen.findByLabelText(/Zählerstand/), '250');
    await user.type(screen.getByLabelText('Bemerkung'), 'nach der Arbeit');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText(/Gespeichert/);
    const stored = await repository.list();
    expect(stored.find((r) => r.meterKwh === 250)?.note).toBe('nach der Arbeit');
  });
});

describe('plausibility in the form (FR-2)', () => {
  it('warns about a lower meter value and names the previous one (FR-2.1)', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    const { user } = harness;
    await user.type(await screen.findByLabelText(/Zählerstand/), '5');
    expect(
      await screen.findByText(
        `Zählerstand niedriger als letzter Stand (210.0 kWh am ${formatDate('de', LAST_DATE)}). Zählerwechsel oder Tippfehler?`,
      ),
    ).toBeInTheDocument();
  });

  it('saves the lower value after an explicit confirmation (FR-2.1, AC-6)', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    const { user, repository } = harness;
    await user.type(await screen.findByLabelText(/Zählerstand/), '5');

    // The button asks for confirmation rather than refusing.
    const button = await screen.findByRole('button', { name: 'Trotzdem speichern' });
    expect(button).toBeEnabled();
    await user.click(button);
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await screen.findByText(/Gespeichert/);
    await waitFor(async () => expect(await repository.count()).toBe(4));
  });

  it('warns above one full charge without blocking (FR-2.2)', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    const { user } = harness;
    await user.type(await screen.findByLabelText(/Zählerstand/), '400');
    expect(await screen.findByText(/mehr als eine volle Ladung/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trotzdem speichern' })).toBeEnabled();
  });

  it('does not warn at exactly the threshold', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    const { user } = harness;
    await user.type(await screen.findByLabelText(/Zählerstand/), '290');
    expect(await screen.findByText('= 80.0 kWh geladen')).toBeInTheDocument();
    expect(screen.queryByText(/volle Ladung/)).not.toBeInTheDocument();
  });

  it('rejects a future date (FR-2.3)', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    const { user } = harness;
    await user.type(await screen.findByLabelText(/Zählerstand/), '250');
    await user.clear(screen.getByLabelText('Datum'));
    await user.type(screen.getByLabelText('Datum'), '2099-01-01');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled(),
    );
  });

  it('caps the date picker at today, so the future is hard to reach at all', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    expect(await screen.findByLabelText('Datum')).toHaveAttribute('max', todayIso());
  });

  it('refuses a meter value with a space in it rather than guessing', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    const { user } = harness;
    // "2 10" could be 210 or 2.10. The form must not pick one silently.
    await user.type(await screen.findByLabelText(/Zählerstand/), '2 10');
    expect(await screen.findByText(/Zählerstand eingeben/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  it('shows no warning before anything has been typed', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    await screen.findByLabelText(/Zählerstand/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('withdraws a confirmation when the value changes again', async () => {
    harness = await renderWithApp(<App />, { readings: existing });
    const { user } = harness;
    const field = await screen.findByLabelText(/Zählerstand/);
    await user.type(field, '5');
    await user.click(await screen.findByRole('button', { name: 'Trotzdem speichern' }));
    // Confirmed; now the value changes, so the confirmation must lapse.
    await user.type(field, '0');
    expect(await screen.findByRole('button', { name: 'Trotzdem speichern' })).toBeInTheDocument();
  });
});
