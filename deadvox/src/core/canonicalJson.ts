export const NEGATIVE_ZERO_TAG = '\u0000deadvox-number';

export interface CanonicalJsonOptions {
  /** Only enable while canonicalizing parsed wire data; encoders must reject user objects with this key. */
  acceptTaggedNegativeZero?: boolean;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one recursive pass defines the complete canonical JSON value contract.
function canonicalize(value: unknown, path: string, ancestors: WeakSet<object>, options: CanonicalJsonOptions): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite number at ${path}`);
    }
    if (Object.is(value, -0)) {
      return `{${JSON.stringify(NEGATIVE_ZERO_TAG)}:"-0"}`;
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new Error(`Unsupported value at ${path}`);
  }
  if (ancestors.has(value)) {
    throw new Error(`Cycle at ${path}`);
  }
  ancestors.add(value);
  let result: string;
  if (Array.isArray(value)) {
    result = `[${value.map((child, index) => canonicalize(child, `${path}[${index}]`, ancestors, options)).join(',')}]`;
  } else {
    if (!isPlainRecord(value)) {
      throw new Error(`Non-plain object at ${path}`);
    }
    const keys = Object.keys(value).sort();
    if (
      options.acceptTaggedNegativeZero &&
      keys.length === 1 &&
      keys[0] === NEGATIVE_ZERO_TAG &&
      value[NEGATIVE_ZERO_TAG] === '-0'
    ) {
      result = `{${JSON.stringify(NEGATIVE_ZERO_TAG)}:"-0"}`;
    } else {
      if (Object.hasOwn(value, NEGATIVE_ZERO_TAG)) {
        throw new Error(`Reserved number tag at ${path}.${NEGATIVE_ZERO_TAG}`);
      }
      result = `{${keys
        .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], `${path}.${key}`, ancestors, options)}`)
        .join(',')}}`;
    }
  }
  ancestors.delete(value);
  return result;
}

export function canonicalJsonAt(value: unknown, path = '$', options: CanonicalJsonOptions = {}): string {
  return canonicalize(value, path, new WeakSet<object>(), options);
}

export function canonicalJson(value: unknown, options: CanonicalJsonOptions = {}): string {
  return canonicalJsonAt(value, '$', options);
}

export function canonicalJsonBytes(value: unknown, options: CanonicalJsonOptions = {}): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value, options));
}

export function decodeCanonicalNumbers(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decodeCanonicalNumbers);
  }
  if (!isPlainRecord(value)) {
    return value;
  }
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === NEGATIVE_ZERO_TAG && value[NEGATIVE_ZERO_TAG] === '-0') {
    return -0;
  }
  return Object.fromEntries(keys.map((key) => [key, decodeCanonicalNumbers(value[key])]));
}
