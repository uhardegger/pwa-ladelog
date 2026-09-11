/**
 * German (de-CH) message catalogue. Typed against `Messages`, so a missing or
 * misspelled key is a compile error rather than a runtime surprise.
 *
 * Swiss German orthography: no "ß", always "ss".
 */
import type { Messages } from './en';

export const de: Messages = {
  'app.name': 'Ladelog',
  'app.shortName': 'Ladelog',
  'app.description': 'Offline-Erfassung der Zählerstände für die Garagenabrechnung.',

  'language.de': 'Deutsch',
  'language.en': 'English',
  'language.label': 'Sprache',

  'common.save': 'Speichern',
  'common.cancel': 'Abbrechen',
  'common.delete': 'Löschen',
  'common.edit': 'Bearbeiten',
  'common.close': 'Schliessen',
  'common.kwh': 'kWh',
  'common.chf': 'CHF',

  'settings.title': 'Einstellungen',
  'settings.personName.label': 'Eigener Name',
  'settings.personName.hint': 'Wird bei jedem neuen Eintrag automatisch gesetzt.',
  'settings.personName.required':
    'Name eingeben, damit Einträge zugeordnet werden können.',
  'settings.price.label': 'Strompreis (CHF/kWh)',
  'settings.price.hint':
    'Gilt nur für neue Einträge. Bereits erfasste Monate behalten den damaligen Preis.',
  'settings.price.invalid': 'Preis eingeben, zum Beispiel 0.28.',
  'settings.tenant.label': 'Mieter',
  'settings.premises.label': 'Objekt',
  'settings.vehicle.label': 'Fahrzeug',
  'settings.statement.hint': 'Erscheint auf dem Abrechnungsblatt für die Vermieterin.',
  'settings.statement.incomplete':
    'Vor dem Versand der Abrechnung ausfüllen: {fields}',
  'settings.saved': 'Einstellungen gespeichert.',
  'settings.saveFailed': 'Speichern nicht möglich. Der Browser-Speicher ist gesperrt.',

  'setup.title': 'Willkommen',
  'setup.intro':
    'Einmalige Einrichtung. Die Angaben bleiben auf diesem Gerät und werden nirgendwohin gesendet.',
  'setup.start': 'Erfassung starten',

  'validate.meterNotANumber': 'Zählerstand eingeben, zum Beispiel 210.5.',
  'validate.dateMalformed': 'Gültiges Datum eingeben.',
  'validate.dateInFuture': 'Das Datum kann nicht nach heute ({today}) liegen.',
  'validate.meterBelowPrevious':
    'Zählerstand niedriger als letzter Stand ({previous} kWh am {date}). Zählerwechsel oder Tippfehler?',
  'validate.usageAboveCapacity':
    '{usage} kWh sind mehr als eine volle Ladung ({limit} kWh). Trotzdem speichern?',
  'validate.saveAnyway': 'Trotzdem speichern',

  'overview.title': 'Monatsübersicht',
  'overview.month': 'Monat',
  'overview.total': 'Total',
  'overview.amount': 'Betrag',
  'overview.yearTotal': 'Total {year}',
  'overview.grandTotal': 'Gesamttotal',
  'overview.empty': 'Noch kein Verbrauch erfasst. Der erste Eintrag ist die Anfangsablesung.',

  'export.title': 'Export',
  'export.period': 'Abrechnungsperiode',
  'export.from': 'Von',
  'export.to': 'Bis',
  'export.xlsx': 'Excel-Abrechnung',
  'export.json': 'Daten sichern',
  'export.jsonHint': 'Der vollständige Datenbestand, für das andere Gerät oder als Sicherung.',
  'export.noReadings': 'Es gibt noch nichts zu exportieren.',

  'deliver.shared': 'Datei zum Teilen bereitgestellt.',
  'deliver.downloaded': 'Datei heruntergeladen – im Ordner «Downloads» zu finden.',
  'deliver.cancelled': 'Teilen abgebrochen. Die Datei wurde nicht versendet.',
  'deliver.unsupported':
    'Dieses Gerät kann die Datei nicht ausgeben. Bitte die App im Browser statt vom Homescreen öffnen.',
  'deliver.failed': 'Export fehlgeschlagen. Bitte erneut versuchen.',

  'import.title': 'Daten importieren',
  'import.pick': 'Datei wählen',
  'import.hint':
    'Führt Einträge vom anderen Gerät zusammen. Nichts wird überschrieben oder gelöscht, die eigenen Einstellungen bleiben unverändert.',
  'import.result': '{added} neu, {skipped} bereits vorhanden.',
  'import.resultWithInvalid':
    '{added} neu, {skipped} bereits vorhanden, {invalid} unlesbar und übersprungen.',
  'import.nothingNew': 'Nichts Neues – alle Einträge dieser Datei waren bereits vorhanden.',
  'import.settingsIgnored': 'Die Einstellungen des Absenders wurden nicht übernommen.',
  'import.notJson': 'Diese Datei ist nicht lesbar. Bitte eine Ladelog-.json-Datei wählen.',
  'import.notABundle': 'Diese Datei ist kein Ladelog-Export.',
  'import.schemaTooNew':
    'Diese Datei stammt aus einer neueren Version der App. Bitte zuerst dieses Gerät aktualisieren.',
  'import.failed': 'Import fehlgeschlagen. Es wurde nichts geändert.',

  'capture.title': 'Neue Ablesung',
  'capture.meter': 'Zählerstand (kWh)',
  'capture.date': 'Datum',
  'capture.person': 'Person',
  'capture.note': 'Bemerkung',
  'capture.save': 'Speichern',
  'capture.last': 'Letzter Stand: {value} kWh am {date}',
  'capture.noneYet': 'Noch keine Ablesung. Die erste ist die Anfangsablesung.',
  'capture.usagePreview': '= {usage} kWh geladen',
  'capture.usageFirst': 'Anfangsablesung, kein Verbrauch',
  'capture.saved': 'Gespeichert. {usage} kWh geladen.',
  'capture.savedFirst': 'Als Anfangsablesung gespeichert.',
  'capture.saveFailed':
    'Speichern fehlgeschlagen. Es wurde nichts gespeichert – bitte erneut versuchen.',

  'list.title': 'Ablesungen',
  'list.empty': 'Noch keine Ablesungen.',
  'list.meter': 'Zähler {value} kWh',
  'list.opening': 'Anfang',
  'list.meterReset': 'Zählerwechsel',

  'edit.title': 'Ablesung bearbeiten',
  'edit.confirmDelete': 'Diese Ablesung löschen? Das lässt sich nicht rückgängig machen.',
  'edit.confirmDeleteYes': 'Löschen',

  'storage.state': 'Speicher',
  'storage.persisted': 'vor automatischem Löschen geschützt',
  'storage.denied': 'nicht geschützt',
  'storage.unsupported': 'unbekannt',
  'storage.warning':
    'Dieser Browser schützt die Daten nicht vor automatischem Löschen. Ab und zu eine Sicherung exportieren.',

  'tabs.capture': 'Erfassen',
  'tabs.list': 'Liste',
  'tabs.overview': 'Monate',
  'tabs.export': 'Export',
  'tabs.settings': 'Einstellungen',

  'install.ios':
    'Zum Home-Bildschirm hinzufügen: auf Teilen tippen, dann «Zum Home-Bildschirm».',
  'install.android': 'App installieren',
  'install.dismiss': 'Jetzt nicht',

  'share.title': 'App teilen',
  'share.hint': 'Die Adresse an jemanden senden, der seine Ladevorgänge selbst erfassen soll.',
  'share.button': 'Link teilen',
  'share.copy': 'Link kopieren',
  'share.text': 'Ladelog – Zählerstand des Ladegeräts erfassen, funktioniert offline.',
  'share.shared': 'Zum Teilen bereitgestellt.',
  'share.copied': 'Link kopiert.',
  'share.cancelled': 'Teilen abgebrochen.',
  'share.unsupported':
    'Dieser Browser kann weder teilen noch kopieren. Bitte die Adresse oben verwenden.',
  'share.failed': 'Teilen fehlgeschlagen. Bitte die Adresse oben verwenden.',
  'share.unavailable': 'Die Adresse ist nur verfügbar, wenn die App im Browser läuft.',

  'app.loading': 'Wird geladen…',
  'app.loadFailed':
    'Die Ablesungen konnten nicht geladen werden. Bitte noch nichts erfassen – zuerst die App neu starten.',
};
