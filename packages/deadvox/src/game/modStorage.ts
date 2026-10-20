import type { BrowserMod } from './browserMods.ts';

const DATABASE = 'deadvox.browser-mods';
const STORE = 'selection';

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
    throw new Error('Invalid stored mod selection');
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

  private async transact(mode: IDBTransactionMode, mods?: readonly BrowserMod[]): Promise<unknown> {
    const db = await this.database();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        const request = mode === 'readonly' ? store.get('active') : store.put(mods, 'active');
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error('Mod storage aborted'));
      });
    } finally {
      db.close();
    }
  }

  async load(): Promise<BrowserMod[]> {
    const value = await this.transact('readonly');
    return value === undefined ? [] : selection(value);
  }

  async save(mods: readonly BrowserMod[]): Promise<void> {
    await this.transact('readwrite', selection(mods));
  }
}
