import { SAVE_RECORD_HEADER_BYTES, SAVE_RECORD_MAX_BYTES, sealSaveSlot } from '../game/saveStorageRecord.ts';

const DATABASE = 'deadvox-save-slots';
const DATABASE_VERSION = 1;
const STORE = 'slots';
const ROOT_DIRECTORY = 'deadvox-saves';
const NAMESPACE_PATTERN = /^[0-9a-f]{64}$/;
const SLOT_NAMES = ['a', 'b'] as const;
type SlotName = (typeof SLOT_NAMES)[number];
type Backend = 'opfs' | 'indexeddb';
interface SlotPair {
  readonly a: ArrayBuffer | null;
  readonly b: ArrayBuffer | null;
}
interface RequestMessage {
  readonly id: number;
  readonly operation: 'probe' | 'read' | 'commit';
  readonly preferredBackend?: 'auto' | Backend;
  readonly webLocks?: boolean;
  readonly namespace?: string;
  readonly slot?: SlotName;
  readonly generation?: number;
  readonly payload?: ArrayBuffer;
  readonly expected?: SlotPair;
  readonly crashAt?: string;
}
interface ResponseMessage {
  readonly id: number;
  readonly result?: unknown;
  readonly error?: string;
}

interface SaveStorageManager extends StorageManager {
  getDirectory: () => Promise<FileSystemDirectoryHandle>;
}
interface SyncAccessHandle {
  getSize: () => number;
  read: (buffer: Uint8Array, options: { at: number }) => number;
  write: (buffer: Uint8Array, options: { at: number }) => number;
  truncate: (size: number) => void;
  flush: () => void;
  close: () => void;
}
interface SyncFileHandle extends FileSystemFileHandle {
  createSyncAccessHandle: () => Promise<SyncAccessHandle>;
}
interface WorkerScope {
  readonly navigator: Navigator & { readonly storage: SaveStorageManager };
  onmessage: ((event: MessageEvent<RequestMessage>) => void | Promise<void>) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  close: () => void;
}
const scope = globalThis as unknown as WorkerScope;
let backend: Backend | undefined;
let databasePromise: Promise<IDBDatabase> | undefined;

const reply = (message: ResponseMessage, transfers: Transferable[] = []): void => {
  scope.postMessage(message, transfers);
};

const openDatabase = (): Promise<IDBDatabase> => {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: ['namespace', 'slot'] });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open save IndexedDB'));
    request.onblocked = () => reject(new Error('Opening save IndexedDB is blocked by another tab'));
  });
  return databasePromise;
};

const namespaceDirectory = async (namespace: string, create: boolean): Promise<FileSystemDirectoryHandle> => {
  if (!NAMESPACE_PATTERN.test(namespace)) {
    throw new Error('Save namespace must be a lowercase SHA-256 digest');
  }
  const root = await scope.navigator.storage.getDirectory();
  const saves = await root.getDirectoryHandle(ROOT_DIRECTORY, { create });
  return saves.getDirectoryHandle(namespace, { create });
};

const readOpfsSlot = async (namespace: string, slot: SlotName): Promise<ArrayBuffer | null> => {
  let directory: FileSystemDirectoryHandle;
  try {
    directory = await namespaceDirectory(namespace, false);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return null;
    }
    throw error;
  }
  let file: FileSystemFileHandle;
  try {
    file = await directory.getFileHandle(`${slot}.sav`);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return null;
    }
    throw error;
  }
  const access = await (file as SyncFileHandle).createSyncAccessHandle();
  try {
    const size = access.getSize();
    const bytes = new Uint8Array(Math.min(size, SAVE_RECORD_MAX_BYTES + SAVE_RECORD_HEADER_BYTES));
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = access.read(bytes.subarray(offset), { at: offset });
      if (count === 0) {
        break;
      }
      offset += count;
    }
    return bytes.subarray(0, offset).slice().buffer;
  } finally {
    access.close();
  }
};

const readIdbSlots = async (namespace: string): Promise<SlotPair> => {
  const db = await openDatabase();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const values = await Promise.all(
    SLOT_NAMES.map(
      (slot) =>
        new Promise<ArrayBuffer | null>((resolve, reject) => {
          const request = store.get([namespace, slot]);
          request.onsuccess = () => resolve((request.result?.bytes as ArrayBuffer | undefined) ?? null);
          request.onerror = () => reject(request.error ?? new Error('Could not read a save slot'));
        }),
    ),
  );
  await transactionDone(tx);
  return { a: values[0]!, b: values[1]! };
};

const transactionDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Save IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('Save IndexedDB transaction failed'));
  });

const readSlots = async (namespace: string): Promise<SlotPair> => {
  if (backend === 'opfs') {
    const [a, b] = await Promise.all([readOpfsSlot(namespace, 'a'), readOpfsSlot(namespace, 'b')]);
    return { a, b };
  }
  return readIdbSlots(namespace);
};

const sameBytes = (left: ArrayBuffer | null, right: ArrayBuffer | null): boolean => {
  if (left === null || right === null) {
    return left === right;
  }
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  return a.every((byte, index) => byte === b[index]);
};

const samePair = (left: SlotPair, right: SlotPair): boolean => sameBytes(left.a, right.a) && sameBytes(left.b, right.b);

const injectCrash = (request: RequestMessage, stage: string): boolean => {
  if (request.crashAt !== stage) {
    return false;
  }
  scope.close();
  return true;
};

const hangAfterInjectedCrash = (): Promise<never> =>
  new Promise((_resolve) => {
    // The closed worker must not report success after a simulated termination point.
  });

const probeOpfs = async (): Promise<void> => {
  const root = await scope.navigator.storage.getDirectory();
  const probeDirectory = await root.getDirectoryHandle(ROOT_DIRECTORY, { create: true });
  const name = `probe-${crypto.randomUUID()}.tmp`;
  const file = await probeDirectory.getFileHandle(name, { create: true });
  const access = await (file as SyncFileHandle).createSyncAccessHandle();
  try {
    access.write(new Uint8Array([0x5a]), { at: 0 });
    access.flush();
  } finally {
    access.close();
  }
  await probeDirectory.removeEntry(name);
};

const probeOpfsWithDeadline = async (): Promise<void> => {
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = globalThis.setTimeout(() => reject(new Error('OPFS capability probe timed out')), 3000);
  });
  try {
    await Promise.race([probeOpfs(), deadline]);
  } finally {
    if (timer !== undefined) {
      globalThis.clearTimeout(timer);
    }
  }
};

const selectBackend = async (request: RequestMessage): Promise<Backend> => {
  if (request.preferredBackend === 'indexeddb') {
    await openDatabase();
    return 'indexeddb';
  }
  if (request.preferredBackend === 'opfs') {
    await probeOpfsWithDeadline();
    return 'opfs';
  }
  if (request.webLocks) {
    try {
      await probeOpfsWithDeadline();
      return 'opfs';
    } catch {
      // A partial OPFS implementation is not enough; the complete sync-worker path must work.
    }
  }
  await openDatabase();
  return 'indexeddb';
};

const readRequest = async (request: RequestMessage): Promise<SlotPair> => {
  if (!request.namespace) {
    throw new Error('Save namespace is required');
  }
  const slots = await readSlots(request.namespace);
  return slots;
};

const writeOpfs = async (request: RequestMessage, packed: Uint8Array): Promise<void> => {
  const namespace = request.namespace!;
  const slot = request.slot!;
  const directory = await namespaceDirectory(namespace, true);
  const file = await directory.getFileHandle(`${slot}.sav`, { create: true });
  const access = await (file as SyncFileHandle).createSyncAccessHandle();
  try {
    if (injectCrash(request, 'before-truncate')) {
      return hangAfterInjectedCrash();
    }
    access.truncate(0);
    if (injectCrash(request, 'after-truncate')) {
      return hangAfterInjectedCrash();
    }
    const partialLength = Math.max(1, Math.floor(packed.byteLength / 2));
    access.write(packed.subarray(0, partialLength), { at: 0 });
    if (injectCrash(request, 'after-partial-write')) {
      return hangAfterInjectedCrash();
    }
    access.write(packed.subarray(partialLength), { at: partialLength });
    if (injectCrash(request, 'after-write')) {
      return hangAfterInjectedCrash();
    }
    access.flush();
    if (injectCrash(request, 'after-flush')) {
      return hangAfterInjectedCrash();
    }
  } finally {
    access.close();
  }
};

const writeIdb = async (request: RequestMessage, packed: Uint8Array): Promise<'committed' | 'conflict'> => {
  const db = await openDatabase();
  const namespace = request.namespace!;
  const targetSlot = request.slot!;
  if (injectCrash(request, 'before-transaction')) {
    return hangAfterInjectedCrash();
  }
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const current: Partial<Record<SlotName, ArrayBuffer | null>> = {};
  let compared = 0;
  let conflict = false;
  for (const slot of SLOT_NAMES) {
    const get = store.get([namespace, slot]);
    get.onsuccess = () => {
      current[slot] = (get.result?.bytes as ArrayBuffer | undefined) ?? null;
      compared += 1;
      if (compared !== SLOT_NAMES.length) {
        return;
      }
      const expected = request.expected!;
      conflict = !samePair({ a: current.a!, b: current.b! }, expected);
      if (conflict || request.crashAt === 'after-read') {
        tx.abort();
        return;
      }
      store.put({ namespace, slot: targetSlot, bytes: packed.slice().buffer });
      if (request.crashAt === 'after-put') {
        tx.abort();
      }
    };
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      if (request.crashAt === 'after-commit') {
        scope.close();
        return;
      }
      resolve('committed');
    };
    tx.onabort = () => {
      if (conflict) {
        resolve('conflict');
      } else {
        reject(new Error(`Save IndexedDB transaction aborted${request.crashAt ? ` at ${request.crashAt}` : ''}`));
      }
    };
    tx.onerror = () => reject(tx.error ?? new Error('Save IndexedDB transaction failed'));
  });
};

const commitRequest = async (request: RequestMessage): Promise<void> => {
  const { namespace, slot, generation, payload } = request;
  if (namespace === undefined || slot === undefined || generation === undefined || payload === undefined) {
    throw new Error('Save namespace, slot, generation and payload are required');
  }
  const packed = await sealSaveSlot(namespace, generation, new Uint8Array(payload));
  if (backend === 'opfs') {
    const current = await readSlots(namespace);
    if (!samePair(current, request.expected!)) {
      throw new Error('CONFLICT: save slots changed during OPFS commit');
    }
    await writeOpfs(request, packed);
    return;
  }
  const result = await writeIdb(request, packed);
  if (result === 'conflict') {
    throw new Error('CONFLICT: save slots changed during IndexedDB commit');
  }
};

scope.onmessage = async ({ data }: MessageEvent<RequestMessage>) => {
  const request = data;
  try {
    if (request.operation === 'probe') {
      backend = await selectBackend(request);
      reply({ id: request.id, result: { backend } });
    } else if (request.operation === 'read') {
      if (!backend) {
        throw new Error('Save storage backend has not been initialized');
      }
      const slots = await readRequest(request);
      const transfers = [slots.a, slots.b].filter((value): value is ArrayBuffer => value !== null);
      reply({ id: request.id, result: slots }, transfers);
    } else {
      if (!backend) {
        throw new Error('Save storage backend has not been initialized');
      }
      await commitRequest(request);
      reply({ id: request.id, result: { slot: request.slot, generation: request.generation } });
    }
  } catch (error) {
    reply({ id: request.id, error: error instanceof Error ? error.message : String(error) });
  }
};
