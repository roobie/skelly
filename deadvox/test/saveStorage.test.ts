import { describe, expect, it } from 'vitest';
import {
  commitSavePayload,
  inspectSaveSlots,
  type SaveCommitDriver,
  type SaveCommitRequest,
  SaveCorruptionError,
  type SaveSlotPair,
} from '../src/game/saveStorageProtocol.ts';
import {
  openSaveSlot,
  SAVE_RECORD_HEADER_BYTES,
  SAVE_RECORD_MAX_BYTES,
  sealSaveSlot,
} from '../src/game/saveStorageRecord.ts';

const NAMESPACE = 'a'.repeat(64);
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;
const text = (value: string) => new TextEncoder().encode(value);
const textOf = (value: Uint8Array) => new TextDecoder().decode(value);
const clonePair = (pair: SaveSlotPair): SaveSlotPair => ({
  a: pair.a?.slice(0) ?? null,
  b: pair.b?.slice(0) ?? null,
});
const samePair = (left: SaveSlotPair, right: SaveSlotPair): boolean =>
  ['a', 'b'].every((slot) => {
    const a = left[slot as 'a' | 'b'];
    const b = right[slot as 'a' | 'b'];
    if (a === null || b === null) {
      return a === b;
    }
    const leftBytes = new Uint8Array(a);
    const rightBytes = new Uint8Array(b);
    return (
      leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index])
    );
  });

type FakeBackend = 'opfs' | 'indexeddb';
type FakeCrashStage =
  | 'before-truncate'
  | 'after-truncate'
  | 'after-partial-write'
  | 'after-write'
  | 'after-flush'
  | 'before-transaction'
  | 'after-read'
  | 'after-put'
  | 'after-commit';

class MemorySaveDriver implements SaveCommitDriver {
  slots: SaveSlotPair = { a: null, b: null };
  readonly backend: FakeBackend;
  readonly crashAt: FakeCrashStage | undefined;
  private readonly firstReaders: (() => void)[] = [];
  private readCount = 0;
  private readonly batchReads: boolean;

  constructor(
    backend: FakeBackend,
    options: { readonly crashAt?: FakeCrashStage; readonly batchReads?: boolean } = {},
  ) {
    this.backend = backend;
    this.crashAt = options.crashAt;
    this.batchReads = options.batchReads ?? false;
  }

  async readSlots(): Promise<SaveSlotPair> {
    const snapshot = clonePair(this.slots);
    this.readCount += 1;
    if (this.batchReads && this.readCount <= 2) {
      await new Promise<void>((resolve) => {
        this.firstReaders.push(resolve);
        if (this.firstReaders.length === 2) {
          for (const release of this.firstReaders) {
            release();
          }
        }
      });
    }
    return snapshot;
  }

  async commit(request: SaveCommitRequest): Promise<void> {
    const record = await sealSaveSlot(request.namespace, request.generation, request.payload);
    if (!samePair(this.slots, request.expected)) {
      throw new Error('CONFLICT: fake slots changed');
    }
    if (this.backend === 'opfs') {
      if (this.crashAt === 'before-truncate') {
        throw new Error('simulated worker termination before truncate');
      }
      this.slots = { ...this.slots, [request.slot]: new ArrayBuffer(0) };
      if (this.crashAt === 'after-truncate') {
        throw new Error('simulated worker termination after truncate');
      }
      const partial = record.slice(0, Math.max(1, Math.floor(record.length / 2))).buffer;
      this.slots = { ...this.slots, [request.slot]: partial };
      if (this.crashAt === 'after-partial-write') {
        throw new Error('simulated worker termination after partial write');
      }
      this.slots = { ...this.slots, [request.slot]: record.slice().buffer };
      if (this.crashAt === 'after-write' || this.crashAt === 'after-flush') {
        throw new Error(`simulated worker termination ${this.crashAt}`);
      }
      return;
    }
    if (this.crashAt === 'before-transaction' || this.crashAt === 'after-read' || this.crashAt === 'after-put') {
      throw new Error(`simulated IndexedDB transaction abort at ${this.crashAt}`);
    }
    this.slots = { ...this.slots, [request.slot]: record.slice().buffer };
    if (this.crashAt === 'after-commit') {
      throw new Error('simulated worker termination after transaction commit');
    }
  }
}

const save = (driver: SaveCommitDriver, value: string, options: { readonly replaceCorrupt?: boolean } = {}) =>
  commitSavePayload(driver, NAMESPACE, async (generation) => text(`${generation}:${value}`), options);

const checkCrashRecovery = async (backend: FakeBackend, stage: FakeCrashStage) => {
  const driver = new MemorySaveDriver(backend);
  await save(driver, 'old');
  const crashed = new MemorySaveDriver(backend, { crashAt: stage });
  crashed.slots = clonePair(driver.slots);
  let writeError = '';
  try {
    await save(crashed, 'new');
  } catch (error) {
    writeError = error instanceof Error ? error.message : String(error);
  }
  const inspected = await inspectSaveSlots(NAMESPACE, crashed.slots);
  const [newest] = inspected.valid;
  return { writeError, newestPayload: newest ? textOf(newest.record.payload) : undefined };
};

describe('save storage record framing', () => {
  it('round-trips exact generation, namespace, payload and per-record SHA-256', async () => {
    const payload = text('canonical save bytes\u0000\u00ff');
    const bytes = await sealSaveSlot(NAMESPACE, 7, payload);
    const opened = await openSaveSlot(bytes, NAMESPACE);
    expect(opened).toEqual({
      namespace: NAMESPACE,
      generation: 7,
      payload,
      checksum: expect.stringMatching(CHECKSUM_PATTERN),
    });
  });

  it('rejects a fixed corruption/truncation corpus and wrong version namespaces', async () => {
    const valid = await sealSaveSlot(NAMESPACE, 1, text('fixture-payload'));
    const wrongMagic = valid.slice();
    wrongMagic[0] = (wrongMagic[0] ?? 0) ^ 0xff;
    const wrongGeneration = valid.slice();
    new DataView(wrongGeneration.buffer).setBigUint64(72, 0n, false);
    const wrongLength = valid.slice();
    new DataView(wrongLength.buffer).setUint32(80, 999, false);
    const wrongChecksum = valid.slice();
    wrongChecksum[SAVE_RECORD_HEADER_BYTES] = (wrongChecksum[SAVE_RECORD_HEADER_BYTES] ?? 0) ^ 0x01;
    const corruptions: { readonly name: string; readonly record: Uint8Array }[] = [
      { name: 'empty truncation', record: valid.slice(0, 0) },
      { name: 'truncated header', record: valid.slice(0, SAVE_RECORD_HEADER_BYTES - 1) },
      { name: 'truncated payload', record: valid.slice(0, valid.length - 1) },
      { name: 'magic corruption', record: wrongMagic },
      { name: 'generation corruption', record: wrongGeneration },
      { name: 'length corruption', record: wrongLength },
      { name: 'payload checksum corruption', record: wrongChecksum },
    ];
    const errors = await Promise.all(
      corruptions.map(async ({ record }) => {
        try {
          await openSaveSlot(record, NAMESPACE);
          return null;
        } catch (error) {
          return error;
        }
      }),
    );
    expect(errors.every((error) => error instanceof Error)).toBe(true);
    await expect(openSaveSlot(valid, 'b'.repeat(64))).rejects.toThrow('namespace mismatch');
    await expect(sealSaveSlot(NAMESPACE, 1, new Uint8Array(SAVE_RECORD_MAX_BYTES + 1))).rejects.toThrow('exceeds');
  });
});

describe('A/B save protocol', () => {
  it('writes alternating generations and loads the newest complete record', async () => {
    const driver = new MemorySaveDriver('indexeddb');
    expect(await save(driver, 'one')).toEqual({ generation: 1, slot: 'a' });
    expect(await save(driver, 'two')).toEqual({ generation: 2, slot: 'b' });
    expect(await save(driver, 'three')).toEqual({ generation: 3, slot: 'a' });
    const inspected = await inspectSaveSlots(NAMESPACE, driver.slots);
    expect(inspected.valid.map(({ record }) => record.generation)).toEqual([3, 2]);
    expect(textOf(inspected.valid[0]!.record.payload)).toBe('3:three');
  });

  it('retries an IndexedDB compare-and-swap conflict and serializes two tabs', async () => {
    const driver = new MemorySaveDriver('indexeddb', { batchReads: true });
    const results = await Promise.all([save(driver, 'tab-a'), save(driver, 'tab-b')]);
    expect(results.map(({ generation }) => generation).sort()).toEqual([1, 2]);
    const inspected = await inspectSaveSlots(NAMESPACE, driver.slots);
    expect(inspected.valid.map(({ record }) => record.generation).sort()).toEqual([1, 2]);
  });

  it.each([
    ['opfs', 'before-truncate'],
    ['opfs', 'after-truncate'],
    ['opfs', 'after-partial-write'],
    ['opfs', 'after-write'],
    ['opfs', 'after-flush'],
    ['indexeddb', 'before-transaction'],
    ['indexeddb', 'after-read'],
    ['indexeddb', 'after-put'],
    ['indexeddb', 'after-commit'],
  ] as const)('%s kill at %s loads only the old or new whole generation', async (backend, stage) => {
    const result = await checkCrashRecovery(backend, stage);
    expect(result.writeError).toContain('simulated');
    expect(['1:old', '2:new']).toContain(result.newestPayload);
  });

  it('refuses to overwrite two corrupt generations unless replacement is explicit', async () => {
    const driver = new MemorySaveDriver('opfs');
    driver.slots = { a: text('truncated-a').buffer, b: text('truncated-b').buffer };
    const original = clonePair(driver.slots);
    await expect(save(driver, 'replacement')).rejects.toBeInstanceOf(SaveCorruptionError);
    expect(samePair(driver.slots, original)).toBe(true);
    await expect(save(driver, 'replacement', { replaceCorrupt: true })).resolves.toEqual({ generation: 1, slot: 'a' });
    const loaded = await inspectSaveSlots(NAMESPACE, driver.slots);
    expect(loaded.valid).toHaveLength(1);
    expect(loaded.corrupt).toEqual(['b']);
  });

  it('retains the older valid generation when the newest record is corrupt', async () => {
    const driver = new MemorySaveDriver('indexeddb');
    await save(driver, 'old');
    await save(driver, 'new');
    const corrupted = driver.slots.b!.slice(0);
    const corruptedBytes = new Uint8Array(corrupted);
    corruptedBytes[SAVE_RECORD_HEADER_BYTES] = (corruptedBytes[SAVE_RECORD_HEADER_BYTES] ?? 0) ^ 1;
    driver.slots = { ...driver.slots, b: corrupted };
    const inspected = await inspectSaveSlots(NAMESPACE, driver.slots);
    expect(inspected.valid[0]?.record.generation).toBe(1);
    expect(inspected.corrupt).toEqual(['b']);
    expect(textOf(inspected.valid[0]!.record.payload)).toBe('1:old');
  });
});
