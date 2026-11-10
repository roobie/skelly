export { canonicalJson, canonicalJsonBytes, isPlainRecord, SHA256_HEX } from './core/canonicalJson.ts';
export { Compression, SKIP_COMPRESSION } from './core/compression.ts';
export {
  type ActiveBrowserMod,
  type ActiveBundledMod,
  type AdmittedBundledMod,
  contentPackDifferences,
  currentSaveVersionIdentity,
  decodeSave,
  encodeSave,
  readSaveVersionMetadata,
  type SaveContentKind,
  type SaveVersionComponents,
  type SaveVersionIdentity,
  type SaveWorldIdentity,
  type SaveWorldOptions,
} from './core/saveFormat.ts';
export type { SaveSnapshot } from './core/saveState.ts';
export { restorePlayerAudioState, snapshotSession } from './core/saveState.ts';
export { KNOWN_SCHEDULER_IDS } from './core/schedulerIds.ts';
export { freezeSnapshot } from './core/snapshotData.ts';
export { SaveStorageError, type SaveStorageErrorKind } from './game/saveStorageErrors.ts';
export {
  commitSavePayload,
  inspectSaveSlots,
  type RawSaveSlots,
  type SaveCommitRequest,
  SaveCorruptionError,
  type SaveSlotPair,
} from './game/saveStorageProtocol.ts';
export { SAVE_RECORD_HEADER_BYTES, SAVE_RECORD_MAX_BYTES, sealSaveSlot } from './game/saveStorageRecord.ts';
export type {
  ModStore,
  SaveBackend,
  SaveBackendPreference,
  SaveCommitResult,
  SaveEncodingOptions,
  SaveLoadResult,
  SaveQuota,
  SaveStorageStatus,
  SaveStore,
} from './game/storageContract.ts';
