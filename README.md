# Ladelog Garage

Offline-first PWA that logs the cumulative meter readings of a mobile EV charger
and produces the Excel settlement for the landlord.

Built against `spec/PRD-Ladelog-Garage.md` (not part of this repository - it
contains personal data, see PRD OP-2).

## Requirements

Node 20 or newer.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | development server |
| `npm run build` | typecheck and production build into `dist/` |
| `npm run preview` | serve the production build locally |
| `npm test` | run the unit tests once |
| `npm run test:watch` | unit tests in watch mode |
| `npm run typecheck` | TypeScript only, no build |
| `npm run icons` | regenerate the PWA icons into `public/` |

## Layout

```
src/app          application state provider
src/components   UI components
src/db           IndexedDB and localStorage access, migrations
src/export       xlsx and json generation
src/i18n         message catalogues (de-CH, en) and formatting
src/lib          calculations (consumption, monthly aggregation)
src/pwa          manifest and service worker registration
src/types        Reading, Settings, ExportBundle
public/          icons and manifest
tests/           unit tests
```

## Languages

The UI ships in German (de-CH) and English. The startup language comes from a
stored choice, otherwise from the browser preference, otherwise German.

The Excel export is **always German**: its recipient is the landlord, not the
app's user.

## Dependency note: SheetJS

`xlsx@0.18.5` is the last release SheetJS published to npm and carries open
advisories for prototype pollution and ReDoS. Both are in its **parser**. This
app only ever writes workbooks and never reads one, so neither code path is
reachable. Data coming in from another device arrives as JSON (FR-8.2), which
is parsed by `src/export/json.ts` with per-field validation.

`npm audit` will keep reporting this; there is no npm-hosted fix.

## Personal data

This repository carries no personal defaults. Name, tenant, premises and vehicle
are empty until entered in the app's settings, which never leave the device.
