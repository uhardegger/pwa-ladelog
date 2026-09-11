export {
  BY_DATE_INDEX,
  DB_NAME,
  DB_VERSION,
  READINGS_STORE,
  closeDatabase,
  getDatabase,
  isIndexedDbAvailable,
  openLadelogDatabase,
  type LadelogDatabase,
  type LadelogSchema,
} from './database';

export {
  createReadingsRepository,
  readingsRepository,
  type MergeResult,
  type ReadingsRepository,
} from './readings';

export {
  persistenceState,
  requestPersistence,
  storageEstimate,
  type PersistenceState,
} from './persist';

export {
  DEFAULT_PRICE_CHF_PER_KWH,
  SETTINGS_STORAGE_KEY,
  defaultSettings,
  defaultStorage,
  loadSettings,
  missingStatementFields,
  needsInitialSetup,
  normalizeSettings,
  parsePriceInput,
  saveSettings,
  updateSettings,
} from './settings';
