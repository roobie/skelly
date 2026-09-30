import { openSaveSlot, SAVE_RECORD_MAX_BYTES, type SaveSlotRecord } from './saveStorageRecord.ts';

type SlotName = 'a' | 'b';
export interface SaveSlotPair {
  readonly a: ArrayBuffer | null;
  readonly b: ArrayBuffer | null;
}
export interface SaveCommitRequest {
  readonly namespace: string;
  readonly slot: SlotName;
  readonly generation: number;
  readonly payload: Uint8Array;
  readonly expected: SaveSlotPair;
}
export interface SaveCommitDriver {
  readonly readSlots: (namespace: string) => Promise<SaveSlotPair>;
  readonly commit: (request: SaveCommitRequest) => Promise<void>;
}
export interface RawSaveSlots {
  readonly a: Uint8Array | null;
  readonly b: Uint8Array | null;
}
export interface InspectedSaveSlots {
  readonly valid: readonly { readonly slot: SlotName; readonly record: SaveSlotRecord }[];
  readonly corrupt: readonly SlotName[];
}

type InspectedSlot =
  | { readonly slot: SlotName; readonly record: SaveSlotRecord; readonly corrupt: false }
  | { readonly slot: SlotName; readonly corrupt: true };

export class SaveCorruptionError extends Error {
  readonly slots: RawSaveSlots;
  constructor(message: string, slots: RawSaveSlots) {
    super(message);
    this.name = 'SaveCorruptionError';
    this.slots = slots;
  }
}

const rawSlots = (slots: SaveSlotPair): RawSaveSlots => ({
  a: slots.a === null ? null : new Uint8Array(slots.a),
  b: slots.b === null ? null : new Uint8Array(slots.b),
});

export async function inspectSaveSlots(namespace: string, slots: SaveSlotPair): Promise<InspectedSaveSlots> {
  const results = await Promise.all(
    (['a', 'b'] as const).map(async (slot): Promise<InspectedSlot | undefined> => {
      const raw = slots[slot];
      if (!raw) {
        return undefined;
      }
      try {
        return { slot, record: await openSaveSlot(new Uint8Array(raw), namespace), corrupt: false };
      } catch {
        return { slot, corrupt: true };
      }
    }),
  );
  const inspected = results.filter((result): result is InspectedSlot => result !== undefined);
  const valid = inspected.filter((result): result is Extract<InspectedSlot, { corrupt: false }> => !result.corrupt);
  valid.sort((left, right) => right.record.generation - left.record.generation);
  return {
    valid,
    corrupt: inspected.filter((result) => result.corrupt).map(({ slot }) => slot),
  };
}

const nextCommit = async (
  driver: SaveCommitDriver,
  namespace: string,
  encodePayload: (generation: number) => Promise<Uint8Array>,
  replaceCorrupt: boolean,
): Promise<{ readonly request: SaveCommitRequest }> => {
  const slots = await driver.readSlots(namespace);
  const inspected = await inspectSaveSlots(namespace, slots);
  const [newest] = inspected.valid;
  if (!newest && inspected.corrupt.length > 0 && !replaceCorrupt) {
    throw new SaveCorruptionError(
      'Refusing to overwrite corrupt save records without explicit replacement',
      rawSlots(slots),
    );
  }
  const generation = (newest?.record.generation ?? 0) + 1;
  if (!Number.isSafeInteger(generation)) {
    throw new Error('Save generation exceeds the safe-integer limit');
  }
  const slot: SlotName = newest?.slot === 'a' ? 'b' : 'a';
  const payload = await encodePayload(generation);
  if (payload.byteLength > SAVE_RECORD_MAX_BYTES) {
    throw new Error(`Save payload exceeds ${SAVE_RECORD_MAX_BYTES} bytes`);
  }
  return { request: { namespace, slot, generation, payload, expected: slots } };
};

const isConflict = (error: unknown): boolean => error instanceof Error && error.message.startsWith('CONFLICT:');

export async function commitSavePayload(
  driver: SaveCommitDriver,
  namespace: string,
  encodePayload: (generation: number) => Promise<Uint8Array>,
  options: { readonly replaceCorrupt?: boolean } = {},
): Promise<{ readonly generation: number; readonly slot: SlotName }> {
  // Compare-and-swap retries are sequential by design; each retry must observe the prior tab's commit.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: CAS must reread after a conflict.
    const { request } = await nextCommit(driver, namespace, encodePayload, options.replaceCorrupt ?? false);
    try {
      await driver.commit(request);
      return { generation: request.generation, slot: request.slot };
    } catch (error) {
      if (!isConflict(error)) {
        throw error;
      }
    }
  }
  throw new Error('Save changed in too many concurrent tabs; retry the autosave');
}
