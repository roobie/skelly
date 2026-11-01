import type { BrowserMod } from './browserMods.ts';

const DATABASE = 'deadvox.browser-mods';
const STORE = 'selection';

// Only this failure is cured by discarding the stored value; an unavailable store is not.
const INVALID_SELECTION = 'InvalidModSelection';

export const isInvalidModSelection = (error: unknown): boolean =>
  error instanceof Error && error.name === INVALID_SELECTION;

const selection = (value: unknown): BrowserMod[] => {
  if (
    !Array.isArray(value) ||
    value.some(
      (row) =>
        typeof row !== 'object' ||
        row === null ||
        typeof row.source !== 'string' ||
        typeof row.text !== 'string' ||
        typeof row.enabled !== 'boolean',
    )
  ) {
    const error = new Error('Invalid stored mod selection');
    error.name = INVALID_SELECTION;
    throw error;
  }
  return value.map(({ source, text, enabled }) => ({ source, text, enabled }));
};

export class ModStorage {
  private readonly factory: IDBFactory | undefined;

  constructor(factory?: IDBFactory) {
    this.factory = factory;
  }

  private database(): Promise<IDBDatabase> {
    const factory = this.factory ?? globalThis.indexedDB;
    if (!factory) {
      throw new Error('IndexedDB unavailable');
    }
    return new Promise((resolve, reject) => {
      const request = factory.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      let blocked = false;
      request.onsuccess = () => {
        if (blocked) {
          request.result.close();
        } else {
          resolve(request.result);
        }
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Mod storage blocked'));
      };
    });
  }

  private async transact(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
    const db = await this.database();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = operation(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error('Mod storage aborted'));
      });
    } finally {
      db.close();
    }
  }

  async load(): Promise<BrowserMod[]> {
    const value = await this.transact('readonly', (store) => store.get('active'));
    return value === undefined ? [] : selection(value);
  }

  async save(mods: readonly BrowserMod[]): Promise<void> {
    const checked = selection(mods);
    await this.transact('readwrite', (store) => store.put(checked, 'active'));
  }

  async discard(): Promise<void> {
    await this.transact('readwrite', (store) => store.delete('active'));
  }
}
