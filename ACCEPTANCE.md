# Acceptance criteria (PRD section 9)

Status of each criterion, and what still needs a real device.

Automated checks run with `npm test` (423 tests). A criterion marked **device**
cannot be proved in a test runner: it depends on a real browser, a real share
sheet or a real home screen.

| ID | Criterion | Status | Evidence |
|---|---|---|---|
| AC-1 | In flight mode a reading can be captured, the list shown and an xlsx exported | **device** | The service worker precaches the whole shell and no code path makes a network request (`tests/pwa.test.ts`). Still needs a real offline launch. |
| AC-2 | After a restart all readings are unchanged | automated | `tests/db.test.ts` reopens the database and checks the contents survive. |
| AC-3 | At most 3 interactions from launch to save confirmation | automated | `tests/capture.test.tsx` saves in two: type, then tap. The meter field already holds the focus. |
| AC-4 | Date and person are correctly prefilled without input | automated | `tests/capture.test.tsx` |
| AC-5 | `42,5` is processed as `42.5` | automated | `tests/calc.test.ts`, `tests/capture.test.tsx` |
| AC-6 | A lower meter reading warns but does not block | automated | `tests/validate.test.ts`, `tests/capture.test.tsx` |
| AC-7 | The xlsx opens in Excel and Numbers without error; sums match the app | **device** | The workbook is written and read back through SheetJS, and its totals are asserted against `periodTotal` (`tests/xlsx.test.ts`). Opening it in the real applications is manual. |
| AC-8 | The settlement sheet fits one A4 page | automated (bound) | `tests/xlsx.test.ts` asserts at most 45 rows and 8 columns. Confirm the actual print preview once. |
| AC-9 | Importing the same JSON twice creates no duplicates | automated | `tests/db.test.ts`, `tests/json.test.ts`, `tests/screens.test.tsx` |
| AC-10 | On iOS the export opens the share sheet; on Android the download starts | **device** | Both paths and their fallbacks are tested with a stubbed Web Share API (`tests/deliver.test.ts`). The real behaviour differs per platform and must be tried. |
| AC-11 | Installable on iPhone and Samsung, starts without browser chrome | **device** | Manifest and icons are asserted (`tests/pwa.test.ts`). Installation itself is manual. |
| AC-12 | Lighthouse PWA audit without errors | **device** | Run against the deployed URL. |

## Device test procedure

Do this once per platform, against the deployed URL rather than a dev server:
a service worker only registers over HTTPS.

### iPhone (Safari, iOS 16+)

1. Open the URL in Safari. The capture form must appear immediately, with the
   keypad up. (FR-1)
2. Share → *Zum Home-Bildschirm*. Launch from the icon. No address bar. (AC-11)
3. Enable flight mode. Force-quit and relaunch from the icon. (AC-1)
4. Capture a reading. Confirm the consumption shown matches the arithmetic.
5. Restart the app. The reading is still there. (AC-2)
6. Export → *Excel-Abrechnung*. The share sheet must open. Send it to yourself.
   (AC-10)
7. Leave flight mode. Open the file in Numbers. Check the three sheets and that
   the totals match the app's monthly overview. (AC-7)
8. Print preview of *Abrechnungsblatt*: one A4 page. (AC-8)

### Samsung (Chrome, Android 12+)

1. Open the URL. Accept the install prompt, or use the *App installieren*
   button. (AC-11, FR-10.2)
2. Steps 3 to 5 as above.
3. Export → the download must start and the file appear in Downloads. (AC-10)
4. Open it in Excel. (AC-7)

### Both devices together

1. On the second device, capture two readings and export the JSON backup.
2. Send the file to the first device by messenger.
3. Import it there. The count of new and existing entries must be shown. (FR-8.3)
4. Import the same file a second time. Nothing may be added. (AC-9)

### Lighthouse (AC-12)

Chrome DevTools → Lighthouse → Progressive Web App, against the deployed URL.

## Known limitation

The settlement sheet carries values, number formats, column widths and merges,
but no font weights, borders or fills: the SheetJS Community Edition does not
write them. The sheet is correct and prints cleanly, but unstyled. Real styling
would mean ExcelJS and roughly 250 kB gzipped more, which would put NFR-1 back
in question.

## Generating a sample workbook

To produce a real file from sample data without using the app:

```
SAMPLE_OUT=/tmp/ladelog npm test -- tests/sample-export.test.ts
```

The test is skipped unless `SAMPLE_OUT` is set.
