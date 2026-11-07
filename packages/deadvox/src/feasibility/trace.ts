import type { Fields, Observation } from './contract.ts';

export interface Trace {
  tick: number;
  hash: string;
  fields: [string, string][];
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function valueBytes(value: Fields[string]): Uint8Array {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Nonfinite authoritative number');
    }
    const bytes = new Uint8Array(9);
    bytes[0] = 0;
    new DataView(bytes.buffer).setFloat64(1, value, true);
    return bytes;
  }
  if (typeof value === 'boolean') {
    return new Uint8Array([1, Number(value)]);
  }
  const text = new TextEncoder().encode(value);
  const bytes = new Uint8Array(text.length + 1);
  bytes[0] = 2;
  bytes.set(text, 1);
  return bytes;
}

export function trace(observation: Observation): Trace {
  if (!Number.isSafeInteger(observation.tick) || observation.tick < 0) {
    throw new Error('Invalid tick');
  }
  if (!Number.isFinite(observation.minimumGroundClearance) || observation.minimumGroundClearance < 0) {
    throw new Error('Ground invariant failed');
  }
  const fields: [string, string][] = [];
  const append = (prefix: string, values: Fields) => {
    for (const key of Object.keys(values).sort()) {
      const value = values[key];
      if (value === undefined) {
        throw new Error('Missing authoritative field');
      }
      fields.push([`${prefix}.${key}`, hex(valueBytes(value))]);
    }
  };
  append('clock', { tick: observation.tick, minimumGroundClearance: observation.minimumGroundClearance });
  append('state', observation.state);
  append('events', { length: observation.events.length });
  observation.events.forEach((event, index) => {
    append(`events[${index}]`, event);
  });
  fields.push(['continuation', hex(observation.continuation)]);
  // Length-framed names and values prevent field/string concatenation ambiguity.
  let hash = 2_166_136_261;
  for (const [key, value] of fields) {
    for (const byte of new TextEncoder().encode(`${key.length}:${key}${value.length}:${value}`)) {
      hash = Math.imul(hash ^ byte, 16_777_619) >>> 0;
    }
  }
  return { tick: observation.tick, hash: hash.toString(16).padStart(8, '0'), fields };
}

export interface Divergence {
  tick: number;
  field: string;
  expected: string | undefined;
  actual: string | undefined;
}

export function firstDivergence(expected: readonly Trace[], actual: readonly Trace[]): Divergence | undefined {
  for (let index = 0; index < Math.max(expected.length, actual.length); index++) {
    const left = expected[index];
    const right = actual[index];
    if (!(left && right)) {
      return { tick: left?.tick ?? right?.tick ?? index, field: '$tick', expected: left?.hash, actual: right?.hash };
    }
    if (left.tick !== right.tick) {
      return { tick: left.tick, field: '$tick', expected: String(left.tick), actual: String(right.tick) };
    }
    // Compare raw bytes even on equal hashes; a collision must not hide disagreement.
    for (let field = 0; field < Math.max(left.fields.length, right.fields.length); field++) {
      const a = left.fields[field];
      const b = right.fields[field];
      if (a?.[0] !== b?.[0] || a?.[1] !== b?.[1]) {
        return { tick: left.tick, field: a?.[0] ?? b?.[0] ?? '$field', expected: a?.[1], actual: b?.[1] };
      }
    }
  }
  return undefined;
}
