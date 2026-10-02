import type { SaveVersionComponents, SaveWorldOptions } from '../core/saveFormat.ts';
import type { SaveSnapshot } from '../core/saveState.ts';
import { SaveStorageLockError } from './saveStorageLockError.ts';
import {
  commitSavePayload,
  inspectSaveSlots,
  type RawSaveSlots,
  type SaveCommitRequest,
  SaveCorruptionError,
  type SaveSlotPair,
} from './saveStorageProtocol.ts';

type SaveBackend = 'opfs' | 'indexeddb';
export type SaveBackendPreference = 'auto' | SaveBackend;
type SlotName = 'a' | 'b';
const SAVE_WRITE_LOCK = 'deadvox-save-storage';
const SAVE_READ_RETRIES = 3;
const SAVE_READ_RETRY_MS = 50;
const PERSISTENCE_STATUS_TIMEOUT_MS = 1000;
type CrashStage =
  | 'before-truncate'
  | 'after-truncate'
  | 'after-partial-write'
  | 'after-write'
  | 'after-flush'
  | 'before-transaction'
  | 'after-read'
  | 'after-put'
  | 'after-commit';
interface WorkerResponse {
  readonly id: number;
  readonly result?: unknown;
  readonly error?: string;
}
export interface SaveStorageOptions {
  /** Force a backend in tests; production should leave this on `auto`. */
  readonly backend?: SaveBackendPreference;
  readonly requestTimeoutMs?: number;
  /** Test-only abrupt worker termination at a named physical-write stage. */
  readonly testCrashAt?: CrashStage;
}
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

export class SaveStorage {
  private readonly preference: SaveBackendPreference;
  private readonly timeoutMs: number;
  private readonly crashAt: CrashStage | undefined;
  private worker: Worker | undefined;
  private backend: SaveBackend | undefined;
  private nextId = 0;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof globalThis.setTimeout>;
    }
  >();
  private initialized: Promise<SaveStorageStatus> | undefined;

  constructor(options: SaveStorageOptions = {}) {
    this.preference = options.backend ?? 'auto';
    this.timeoutMs = options.requestTimeoutMs ?? 15_000;
    this.crashAt = options.testCrashAt;
  }

  status(): Promise<SaveStorageStatus> {
    this.initialized ??= this.initialize();
    return this.initialized;
  }

  private createWorker(): Worker {
    if (!this.worker) {
      const worker = new Worker(new URL('../worker/save.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        const request = this.pending.get(data.id);
        if (!request) {
          return;
        }
        this.pending.delete(data.id);
        clearTimeout(request.timer);
        if (data.error) {
          request.reject(
            data.error.startsWith('LOCKED:') ? new SaveStorageLockError(data.error) : new Error(data.error),
          );
        } else {
          request.resolve(data.result);
        }
      };
      worker.onerror = (event) => this.failWorker(new Error(event.message || 'Save worker failed'));
      worker.onmessageerror = () => this.failWorker(new Error('Save worker sent an unreadable response'));
      this.worker = worker;
    }
    return this.worker;
  }

  private failWorker(error: Error): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.backend = undefined;
    this.initialized = undefined;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }

  private request<T>(message: Record<string, unknown>): Promise<T> {
    const worker = this.createWorker();
    this.nextId += 1;
    const id = this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        this.failWorker(new Error('Save worker timed out; the inactive record was not reported committed'));
      }, this.timeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      worker.postMessage({ ...message, id });
    });
  }

  private async initialize(): Promise<SaveStorageStatus> {
    const webLocks = typeof navigator.locks?.request === 'function';
    const response = await this.request<{ backend: SaveBackend }>({
      operation: 'probe',
      preferredBackend: this.preference,
      webLocks,
    });
    this.backend = response.backend;
    const persistenceRequest = this.requestPersistence().catch(() => null);
    let persistenceTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const persistenceDeadline = new Promise<null>((resolve) => {
      persistenceTimer = globalThis.setTimeout(() => resolve(null), PERSISTENCE_STATUS_TIMEOUT_MS);
    });
    const [persistent, quota] = await Promise.all([
      Promise.race([persistenceRequest, persistenceDeadline]),
      this.estimateQuota().catch((): SaveQuota => ({ supported: false })),
    ]);
    if (persistenceTimer !== undefined) {
      globalThis.clearTimeout(persistenceTimer);
    }
    return { backend: this.backend, persistent, quota };
  }

  requestPersistence(): Promise<boolean | null> {
    const { storage } = navigator;
    if (typeof storage?.persist !== 'function') {
      return Promise.resolve(null);
    }
    return storage.persist();
  }

  async estimateQuota(): Promise<SaveQuota> {
    const { storage } = navigator;
    if (typeof storage?.estimate !== 'function') {
      return { supported: false };
    }
    const estimate = await storage.estimate();
    const usageBytes = estimate.usage ?? 0;
    const quotaBytes = estimate.quota ?? 0;
    return { supported: true, usageBytes, quotaBytes, availableBytes: Math.max(0, quotaBytes - usageBytes) };
  }

  async listNamespaces(): Promise<readonly string[]> {
    await this.status();
    return this.request<string[]>({ operation: 'list' });
  }

  async encodeSnapshot(
    snapshot: Readonly<SaveSnapshot>,
    generation: number,
    options: SaveEncodingOptions,
  ): Promise<Uint8Array> {
    await this.status();
    return this.request<Uint8Array>({ operation: 'encode', snapshot, generation, ...options });
  }

  async readRawSlots(namespace: string): Promise<RawSaveSlots> {
    await this.status();
    return this.readRawSlotsAttempt(namespace, 0);
  }

  private async readRawSlotsAttempt(namespace: string, attempt: number): Promise<RawSaveSlots> {
    try {
      const read = () => this.request<SaveSlotPair>({ operation: 'read', namespace });
      const slots =
        typeof navigator.locks?.request === 'function'
          ? await navigator.locks.request(SAVE_WRITE_LOCK, { mode: 'shared' }, read)
          : await read();
      return {
        a: slots.a === null ? null : new Uint8Array(slots.a),
        b: slots.b === null ? null : new Uint8Array(slots.b),
      };
    } catch (error) {
      if (!(error instanceof SaveStorageLockError) || attempt + 1 >= SAVE_READ_RETRIES) {
        throw error;
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, SAVE_READ_RETRY_MS * (attempt + 1)));
      return this.readRawSlotsAttempt(namespace, attempt + 1);
    }
  }

  async load(namespace: string): Promise<SaveLoadResult | undefined> {
    const slots = await this.readRawSlots(namespace);
    const { valid, corrupt: corruptSlots } = await inspectSaveSlots(namespace, {
      a: slots.a?.slice().buffer ?? null,
      b: slots.b?.slice().buffer ?? null,
    });
    const [newest] = valid;
    if (newest) {
      return {
        generation: newest.record.generation,
        slot: newest.slot,
        payload: newest.record.payload,
        corruptSlots,
      };
    }
    if (corruptSlots.length > 0) {
      throw new SaveCorruptionError('Both save generations are invalid; records were retained for export', slots);
    }
    return undefined;
  }

  async save(
    namespace: string,
    encodePayload: (generation: number) => Promise<Uint8Array>,
    options: { readonly replaceCorrupt?: boolean } = {},
  ): Promise<{ readonly generation: number; readonly slot: SlotName; readonly backend: SaveBackend }> {
    const status = await this.status();
    const driver = {
      readSlots: (key: string) => this.request<SaveSlotPair>({ operation: 'read', namespace: key }),
      commit: async (request: SaveCommitRequest) => {
        await this.request({
          operation: 'commit',
          namespace: request.namespace,
          slot: request.slot,
          generation: request.generation,
          payload: request.payload.slice().buffer,
          expected: request.expected,
          ...(this.crashAt === undefined ? {} : { crashAt: this.crashAt }),
        });
      },
    };
    const write = async () => ({
      ...(await commitSavePayload(driver, namespace, encodePayload, options)),
      backend: status.backend,
    });

    if (typeof navigator.locks?.request === 'function') {
      return navigator.locks.request(SAVE_WRITE_LOCK, { mode: 'exclusive' }, write);
    }
    if (status.backend === 'opfs') {
      throw new Error('OPFS writes require Web Locks; select IndexedDB fallback');
    }
    return write();
  }

  close(): void {
    this.worker?.terminate();
    this.worker = undefined;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Save storage client closed'));
    }
    this.pending.clear();
    this.initialized = undefined;
    this.backend = undefined;
  }
}
