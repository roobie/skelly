// Developer state in the game page's hash: one object in a relaxed JSON form, as in `#{debug:true,cam:[1.5,2,3,90,0,0]}`.
// Why it is relaxed JSON, written back in a fixed order: `docs/decisions/0006-url-mods-and-hash-state.md`,
// "Reasons for the details". This file loads no package, so a consumer that runs without an install can load it.

type HashKind = 'number' | 'boolean' | 'string' | 'numbers' | 'strings';

/** Every key the hash accepts with its value type, in the order the hash is written. */
const HASH_KEYS = {
  debug: 'boolean',
  save: 'boolean',
  seed: 'number',
  radius: 'number',
  actors: 'string',
  decals: 'boolean',
  at: 'numbers',
  focus: 'string',
  cam: 'numbers',
  tone: 'string',
  exposure: 'number',
  srgb: 'boolean',
  patterns: 'boolean',
  vao: 'boolean',
  freeze: 'boolean',
  post: 'boolean',
  bloom: 'boolean',
  bloomclip: 'number',
  film: 'boolean',
  grade: 'number',
  fog: 'number',
  clouds: 'number',
  rain: 'number',
  torch: 'number',
  sunshadow: 'boolean',
  torchshadow: 'boolean',
  shadowdist: 'number',
  crackcheck: 'boolean',
  hotcheck: 'boolean',
  torchspill: 'boolean',
  weathering: 'number',
  weatheringTint: 'number',
  weatheringStreaks: 'number',
  weatheringStreakLength: 'number',
  weatheringMoss: 'number',
  weatheringScale: 'number',
  weatheringVariation: 'number',
  weatheringMossThreshold: 'number',
  weatheringMossBias: 'number',
  weatheringMixCeiling: 'number',
  weatheringBlend: 'number',
  weatheringTintColor: 'string',
  weatheringStreakColor: 'string',
  weatheringMossColor: 'string',
  weatheringSplit: 'number',
  interactionray: 'boolean',
  ragdollSweep: 'number',
  wobbleFlat: 'number',
  wobbleNoiseScale: 'number',
  voicePitch: 'number',
  voicePitchLarge: 'number',
  mannequin: 'string',
  mannequinWear: 'strings',
  avatarStudy: 'strings',
  plan: 'numbers',
  i: 'number',
  quick: 'boolean',
  shamblers: 'numbers',
} as const satisfies Record<string, HashKind>;

type HashKeys = typeof HASH_KEYS;
type KindValue<Kind extends HashKind> = Kind extends 'number'
  ? number
  : Kind extends 'boolean'
    ? boolean
    : Kind extends 'string'
      ? string
      : Kind extends 'numbers'
        ? readonly number[]
        : readonly string[];

/** The hash's keys, each optional; an absent key leaves its consumer's default. */
export type HashState = { [Key in keyof HashKeys]?: KindValue<HashKeys[Key]> };

/** The parsed hash, or the key (or text) it was refused at. */
export type HashRead = { readonly hash: HashState } | { readonly refused: string };

interface Scalar {
  readonly text: string;
  readonly quoted: boolean;
}

const KEY = /^[A-Za-z][A-Za-z0-9]*$/;
const BARE = /^[A-Za-z0-9_.+#-]+$/;

class Cursor {
  at = 0;
  readonly text: string;
  constructor(text: string) {
    this.text = text;
  }
  peek(): string | undefined {
    return this.text[this.at];
  }
  take(expected: string): boolean {
    if (this.text[this.at] !== expected) {
      return false;
    }
    this.at += 1;
    return true;
  }
  /**
   * A quoted string, or the bare text up to the next separator. A double-quoted string is a JSON string, escapes
   * and all, as `scalarText` writes it; a single-quoted one, typed by hand, ends at the next single quote.
   */
  scalar(): Scalar | undefined {
    const quote = this.peek();
    if (quote === '"') {
      return this.jsonString();
    }
    if (quote === "'") {
      const end = this.text.indexOf(quote, this.at + 1);
      if (end < 0) {
        return undefined;
      }
      const text = this.text.slice(this.at + 1, end);
      this.at = end + 1;
      return { text, quoted: true };
    }
    const start = this.at;
    while (this.at < this.text.length && !',:[]{}'.includes(this.text[this.at]!)) {
      this.at += 1;
    }
    const text = this.text.slice(start, this.at).trim();
    return text === '' ? undefined : { text, quoted: false };
  }
  private jsonString(): Scalar | undefined {
    let end = this.at + 1;
    while (end < this.text.length && this.text[end] !== '"') {
      end += this.text[end] === '\\' ? 2 : 1;
    }
    if (end >= this.text.length) {
      return undefined;
    }
    let text: unknown;
    try {
      text = JSON.parse(this.text.slice(this.at, end + 1));
    } catch {
      return undefined;
    }
    this.at = end + 1;
    return typeof text === 'string' ? { text, quoted: true } : undefined;
  }
}

const scalarValue = (scalar: Scalar, kind: 'number' | 'boolean' | 'string'): number | boolean | string | undefined => {
  if (kind === 'string') {
    return scalar.text;
  }
  if (scalar.quoted) {
    return undefined;
  }
  if (kind === 'boolean') {
    return scalar.text === 'true' || scalar.text === 'false' ? scalar.text === 'true' : undefined;
  }
  const value = Number(scalar.text);
  return Number.isFinite(value) ? value : undefined;
};

/** An array of scalars of one kind; arrays do not nest. */
const readArray = (cursor: Cursor, kind: 'number' | 'string'): unknown[] | undefined => {
  if (!cursor.take('[')) {
    return undefined;
  }
  const items: unknown[] = [];
  if (cursor.take(']')) {
    return items;
  }
  do {
    const scalar = cursor.scalar();
    const item = scalar && scalarValue(scalar, kind);
    if (item === undefined) {
      return undefined;
    }
    items.push(item);
  } while (cursor.take(','));
  return cursor.take(']') ? items : undefined;
};

const readValue = (cursor: Cursor, kind: HashKind): unknown => {
  if (kind === 'numbers' || kind === 'strings') {
    return readArray(cursor, kind === 'numbers' ? 'number' : 'string');
  }
  const scalar = cursor.scalar();
  return scalar && scalarValue(scalar, kind);
};

const HASH_MARK = /^#/;

/**
 * Reads a hash, with or without its `#`, undoing its percent-encoding first; an unknown key, a wrong value or a lone
 * `%` refuses it.
 */
export const readHash = (fragment: string): HashRead => {
  const raw = fragment.replace(HASH_MARK, '');
  let text: string;
  try {
    text = decodeURIComponent(raw).trim();
  } catch {
    return { refused: raw };
  }
  if (text === '') {
    return { hash: {} };
  }
  const cursor = new Cursor(text);
  if (!cursor.take('{')) {
    return { refused: text };
  }
  const read = cursor.peek() === '}' ? { hash: {} } : readEntries(cursor);
  if ('refused' in read) {
    return read;
  }
  return cursor.take('}') && cursor.at === text.length ? read : { refused: text };
};

/** The object's `key:value` entries, up to its closing brace. */
const readEntries = (cursor: Cursor): HashRead => {
  const hash: Record<string, unknown> = {};
  do {
    const key = cursor.scalar();
    if (!(key && !key.quoted && KEY.test(key.text) && cursor.take(':'))) {
      return { refused: key?.text ?? cursor.text };
    }
    const kind = (HASH_KEYS as Record<string, HashKind>)[key.text];
    const value = kind === undefined || key.text in hash ? undefined : readValue(cursor, kind);
    if (value === undefined) {
      return { refused: key.text };
    }
    hash[key.text] = value;
  } while (cursor.take(','));
  return { hash: hash as HashState };
};

const scalarText = (value: number | boolean | string): string =>
  typeof value !== 'string' || BARE.test(value) ? String(value) : JSON.stringify(value);

const PERCENT = /%/g;

/**
 * The hash text for `hash`, keys in their fixed order; empty when no key is set. Strings that are not bare words are
 * JSON strings. A `%` is written `%25`, so the address bar's percent-encoding is the only encoding `readHash` undoes
 * and a value such as `%41` comes back as written.
 */
export const writeHash = (hash: HashState): string => {
  const entries = (Object.keys(HASH_KEYS) as (keyof HashKeys)[]).flatMap((key) => {
    const value = hash[key];
    if (value === undefined) {
      return [];
    }
    return [`${key}:${Array.isArray(value) ? `[${value.map(scalarText).join(',')}]` : scalarText(value as string)}`];
  });
  return entries.length === 0 ? '' : `{${entries.join(',')}}`.replace(PERCENT, '%25');
};
