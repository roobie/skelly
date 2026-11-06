// What the game asks of save and mod storage, without naming a browser API: a host brings its own adapter.
import type { SaveVersionComponents, SaveWorldOptions } from '../core/saveFormat.ts';
import type { SaveSnapshot } from '../core/saveState.ts';
import type { BrowserMod } from './browserMods.ts';
import type { RawSaveSlots } from './saveStorageProtocol.ts';

export type SaveBackend = 'opfs' | 'indexeddb';
export type SaveBackendPreference = 'auto' | SaveBackend;
type SlotName = 'a' | 'b';

export interface SaveLoadResult {
  readonly generation: number;
  readonly slot: SlotName;
  readonly payload: Uint8Array;
  /** Corrupt inactive records are retained and reported while the other generation loads. */
  readonly corruptSlots: readonly SlotName[];
}

export interface SaveQuota {
  readonly supported: boolean;
  readonly usageBytes?: number;
  readonly quotaBytes?: number;
  readonly availableBytes?: number;
}

export interface SaveStorageStatus {
  readonly backend: SaveBackend;
  readonly persistent: boolean | null;
  readonly quota: SaveQuota;
}

export interface SaveEncodingOptions {
  readonly worldOptions: SaveWorldOptions;
  readonly version: SaveVersionComponents;
  readonly buildRevision: string;
}

export interface SaveCommitResult {
  readonly generation: number;
  readonly slot: SlotName;
  readonly backend: SaveBackend;
}

/** Durable save slots per world namespace, with the payload codec run where the store runs it. */
export interface SaveStore {
  readonly canRequestPersistence: boolean;
  status: () => Promise<SaveStorageStatus>;
  requestPersistence: () => Promise<boolean | null>;
  listNamespaces: () => Promise<readonly string[]>;
  encodeSnapshot: (
    snapshot: Readonly<SaveSnapshot>,
    generation: number,
    options: SaveEncodingOptions,
  ) => Promise<Uint8Array>;
  readRawSlots: (namespace: string) => Promise<RawSaveSlots>;
  load: (namespace: string) => Promise<SaveLoadResult | undefined>;
  save: (
    namespace: string,
    encodePayload: (generation: number) => Promise<Uint8Array>,
    options?: { readonly replaceCorrupt?: boolean },
  ) => Promise<SaveCommitResult>;
  close: () => void;
}

/** The player's stored browser-mod selection. */
export interface ModStore {
  load: () => Promise<BrowserMod[]>;
  save: (mods: readonly BrowserMod[]) => Promise<void>;
  discard: () => Promise<void>;
}
