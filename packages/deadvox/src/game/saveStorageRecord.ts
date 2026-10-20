const MAGIC = new TextEncoder().encode('DVXSLOT1');
const IDENTITY_BYTES = 64;
const GENERATION_BYTES = 8;
const LENGTH_BYTES = 4;
const CHECKSUM_BYTES = 32;
export const SAVE_RECORD_HEADER_BYTES =
  MAGIC.length + IDENTITY_BYTES + GENERATION_BYTES + LENGTH_BYTES + CHECKSUM_BYTES;
export const SAVE_RECORD_MAX_BYTES = 50 * 1024 * 1024;
const HASH = /^[0-9a-f]{64}$/;

export interface SaveSlotRecord {
  readonly namespace: string;
  readonly generation: number;
  readonly payload: Uint8Array;
  readonly checksum: string;
}

const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer));
};

const toHex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export async function sealSaveSlot(namespace: string, generation: number, payload: Uint8Array): Promise<Uint8Array> {
  if (!HASH.test(namespace)) {
    throw new Error('Save namespace must be a lowercase SHA-256 digest');
  }
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new Error(`Save generation must be a positive safe integer, got ${generation}`);
  }
  if (payload.byteLength > SAVE_RECORD_MAX_BYTES) {
    throw new Error(`Save payload exceeds ${SAVE_RECORD_MAX_BYTES} bytes`);
  }

  const record = new Uint8Array(SAVE_RECORD_HEADER_BYTES + payload.byteLength);
  record.set(MAGIC, 0);
  record.set(new TextEncoder().encode(namespace), MAGIC.length);
  const view = new DataView(record.buffer);
  view.setBigUint64(MAGIC.length + IDENTITY_BYTES, BigInt(generation), false);
  view.setUint32(MAGIC.length + IDENTITY_BYTES + GENERATION_BYTES, payload.byteLength, false);
  const digest = await sha256(payload);
  record.set(digest, MAGIC.length + IDENTITY_BYTES + GENERATION_BYTES + LENGTH_BYTES);
  record.set(payload, SAVE_RECORD_HEADER_BYTES);
  return record;
}

export async function openSaveSlot(record: Uint8Array, expectedNamespace: string): Promise<SaveSlotRecord> {
  if (!HASH.test(expectedNamespace)) {
    throw new Error('Save namespace must be a lowercase SHA-256 digest');
  }
  if (record.byteLength < SAVE_RECORD_HEADER_BYTES) {
    throw new Error(`Truncated save record header: ${record.byteLength} bytes`);
  }
  if (!MAGIC.every((byte, index) => record[index] === byte)) {
    throw new Error('Invalid save record magic');
  }
  const namespace = new TextDecoder('ascii', { fatal: true }).decode(
    record.subarray(MAGIC.length, MAGIC.length + IDENTITY_BYTES),
  );
  if (namespace !== expectedNamespace) {
    throw new Error(`Save record namespace mismatch: expected ${expectedNamespace}, got ${namespace}`);
  }
  const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
  const generationBig = view.getBigUint64(MAGIC.length + IDENTITY_BYTES, false);
  if (generationBig < 1n || generationBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Invalid save generation ${generationBig}`);
  }
  const payloadLength = view.getUint32(MAGIC.length + IDENTITY_BYTES + GENERATION_BYTES, false);
  if (payloadLength > SAVE_RECORD_MAX_BYTES) {
    throw new Error(`Save payload exceeds ${SAVE_RECORD_MAX_BYTES} bytes`);
  }
  if (record.byteLength !== SAVE_RECORD_HEADER_BYTES + payloadLength) {
    throw new Error(
      `Save record length mismatch: expected ${SAVE_RECORD_HEADER_BYTES + payloadLength}, got ${record.byteLength}`,
    );
  }
  const checksumBytes = record.subarray(
    MAGIC.length + IDENTITY_BYTES + GENERATION_BYTES + LENGTH_BYTES,
    SAVE_RECORD_HEADER_BYTES,
  );
  const payload = record.slice(SAVE_RECORD_HEADER_BYTES);
  const actualChecksum = await sha256(payload);
  if (!actualChecksum.every((byte, index) => checksumBytes[index] === byte)) {
    throw new Error('Save record SHA-256 checksum mismatch');
  }
  return {
    namespace,
    generation: Number(generationBig),
    payload,
    checksum: toHex(checksumBytes),
  };
}
