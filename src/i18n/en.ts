/**
 * English message catalogue. This object is the source of truth for the
 * message-key type; every other catalogue must provide exactly these keys.
 *
 * Placeholders use `{name}` syntax and are substituted by `translate()`.
 */
export const en = {
  'app.name': 'Charging Log',
  'app.shortName': 'Charging Log',
  'app.description': 'Offline log of charging meter readings for the garage settlement.',

  'language.de': 'Deutsch',
  'language.en': 'English',
  'language.label': 'Language',

  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.close': 'Close',
  'common.kwh': 'kWh',
  'common.chf': 'CHF',

  'settings.title': 'Settings',
  'settings.personName.label': 'Your name',
  'settings.personName.hint': 'Preset on every new reading, no typing needed.',
  'settings.personName.required': 'Enter a name so readings can be attributed.',
  'settings.price.label': 'Electricity price (CHF/kWh)',
  'settings.price.hint':
    'Applies to new readings only. Months already recorded keep the price that was in effect then.',
  'settings.price.invalid': 'Enter a price such as 0.28.',
  'settings.tenant.label': 'Tenant',
  'settings.premises.label': 'Premises',
  'settings.vehicle.label': 'Vehicle',
  'settings.statement.hint': 'Printed on the settlement sheet for the landlord.',
  'settings.statement.incomplete':
    'Fill these in before sending a settlement: {fields}',
  'settings.saved': 'Settings saved.',
  'settings.saveFailed': 'Could not save. Browser storage is unavailable.',

  'setup.title': 'Welcome',
  'setup.intro':
    'One-time setup. Your details stay on this device and are never sent anywhere.',
  'setup.start': 'Start logging',

  'validate.meterNotANumber': 'Enter the meter reading, for example 210.5.',
  'validate.dateMalformed': 'Enter a valid date.',
  'validate.dateInFuture': 'The date cannot be later than today ({today}).',
  'validate.meterBelowPrevious':
    'Meter reading is below the previous one ({previous} kWh on {date}). Meter replaced, or a typo?',
  'validate.usageAboveCapacity':
    '{usage} kWh is more than one full charge ({limit} kWh). Save anyway?',
  'validate.saveAnyway': 'Save anyway',

  'overview.title': 'Monthly overview',
  'overview.month': 'Month',
  'overview.total': 'Total',
  'overview.amount': 'Amount',
  'overview.yearTotal': 'Total {year}',
  'overview.grandTotal': 'Grand total',
  'overview.empty': 'No consumption recorded yet. The first reading is the opening one.',

  'export.title': 'Export',
  'export.period': 'Settlement period',
  'export.from': 'From',
  'export.to': 'To',
  'export.xlsx': 'Excel settlement',
  'export.json': 'Back up data',
  'export.jsonHint': 'The full data set, for the other device or as a backup.',
  'export.noReadings': 'Nothing to export yet.',

  'deliver.shared': 'File ready to share.',
  'deliver.downloaded': 'File downloaded - look in your Downloads folder.',
  'deliver.cancelled': 'Sharing cancelled. The file was not sent.',
  'deliver.unsupported':
    'This device cannot hand over the file. Try opening the app in the browser instead of from the home screen.',
  'deliver.failed': 'Export failed. Please try again.',

  'import.title': 'Import data',
  'import.pick': 'Choose file',
  'import.hint':
    'Merges readings from another device. Nothing is overwritten or deleted, and your own settings stay as they are.',
  'import.result': '{added} added, {skipped} already present.',
  'import.resultWithInvalid':
    '{added} added, {skipped} already present, {invalid} unreadable and skipped.',
  'import.nothingNew': 'Nothing new - every reading in that file was already here.',
  'import.settingsIgnored': 'The sender\u2019s settings were not applied.',
  'import.notJson': 'That file is not readable. Choose a Ladelog .json file.',
  'import.notABundle': 'That file is not a Ladelog export.',
  'import.schemaTooNew':
    'That file comes from a newer version of the app. Update this device first.',
  'import.failed': 'Import failed. Nothing was changed.',

  'capture.title': 'New reading',
  'capture.meter': 'Meter reading (kWh)',
  'capture.date': 'Date',
  'capture.person': 'Person',
  'capture.note': 'Note',
  'capture.save': 'Save',
  'capture.last': 'Last reading: {value} kWh on {date}',
  'capture.noneYet': 'No reading yet. The first one is the opening reading.',
  'capture.usagePreview': '= {usage} kWh charged',
  'capture.usageFirst': 'Opening reading, no consumption',
  'capture.saved': 'Saved. {usage} kWh charged.',
  'capture.savedFirst': 'Saved as the opening reading.',
  'capture.saveFailed': 'Could not save. Nothing was stored - please try again.',

  'list.title': 'Readings',
  'list.empty': 'No readings yet.',
  'list.meter': 'Meter {value} kWh',
  'list.opening': 'Opening',
  'list.meterReset': 'Meter replaced',

  'edit.title': 'Edit reading',
  'edit.confirmDelete': 'Delete this reading? This cannot be undone.',
  'edit.confirmDeleteYes': 'Delete',

  'storage.state': 'Storage',
  'storage.persisted': 'protected from automatic deletion',
  'storage.denied': 'not protected',
  'storage.unsupported': 'unknown',
  'storage.warning':
    'This browser has not protected your data from automatic deletion. Export a backup now and then.',

  'tabs.capture': 'Log',
  'tabs.list': 'Readings',
  'tabs.overview': 'Months',
  'tabs.export': 'Export',
  'tabs.settings': 'Settings',

  'install.ios':
    'Add to your home screen: tap Share, then "Add to Home Screen".',
  'install.android': 'Install app',
  'install.dismiss': 'Not now',

  'app.loading': 'Loading…',
  'app.loadFailed':
    'Your readings could not be loaded. Do not add anything yet - restart the app first.',
} as const;

/** All valid message keys. */
export type MessageKey = keyof typeof en;

/** Shape every catalogue must satisfy. */
export type Messages = Record<MessageKey, string>;
