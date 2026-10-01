// Runtime parse of an untrusted value (usually parsed JSON) into a Cartridge. Never a type
// assertion: every field is checked and the result is rebuilt from the checked fields. Unlike the
// assembly parser it refuses unknown keys, because a misspelled optional field in a data file
// (`toleranec`) would otherwise be dropped silently. Required fields must be present; a value that
// could not be sourced is written as an explicit `null`, not left out.
//
// Only structure is checked here (shape, kind-specific required fields, enum members). Geometry,
// units and sourcing are the rules in rules.ts, so a structurally valid but physically absurd file
// still loads and reports readable issues.

import {
  type Alias,
  BODY_TYPES,
  type Body,
  BULLET_KINDS,
  type BulletPayload,
  type BulletVariant,
  CARTRIDGE_FORMAT,
  CASE_MATERIALS,
  type Cartridge,
  type CartridgeBase,
  type CartridgeRelation,
  type Citation,
  CLOSURES,
  type ExtractorGroove,
  HEAD_TYPES,
  type Head,
  HULL_MATERIALS,
  type Hull,
  type Measure,
  type MeasureAlternative,
  type MetallicCartridge,
  type MetallicCase,
  PRIMER_TYPES,
  type Primer,
  RELATIONS,
  type ShotPayload,
  type Shotshell,
  type ShotshellHead,
  SLUG_STYLES,
  type SlugPayload,
  type SourceDocument,
  type Sourced,
  type SourceReliability,
  type Tolerance,
} from './cartridge.ts';

/** A structural problem in an untrusted file. `path` locates it ('' for the root). */
export interface CartridgeParseError {
  readonly path: string;
  readonly message: string;
}

export type CartridgeParseResult =
  | { readonly ok: true; readonly cartridge: Cartridge }
  | { readonly ok: false; readonly error: CartridgeParseError };

export const formatCartridgeParseError = (error: CartridgeParseError): string =>
  error.path === '' ? error.message : `${error.path}: ${error.message}`;

// ---------------------------------------------------------------- reader primitives

class ParseFailure extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(message);
    this.path = path;
  }
}

function fail(path: string, message: string): never {
  throw new ParseFailure(path, message);
}

type Obj = Readonly<Record<string, unknown>>;
type Parse<T> = (value: unknown, path: string) => T;

const isRecord = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);

const describe = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  return Array.isArray(value) ? 'an array' : `a ${typeof value}`;
};

const join = (base: string, key: string): string => (base === '' ? key : `${base}.${key}`);

/** An object with exactly the required keys plus any of the optional ones. */
const object = (value: unknown, path: string, required: readonly string[], allowed: readonly string[] = []): Obj => {
  if (!isRecord(value)) {
    return fail(path, `expected an object, got ${describe(value)}`);
  }
  for (const key of Object.keys(value)) {
    if (!(required.includes(key) || allowed.includes(key))) {
      fail(join(path, key), 'unknown field');
    }
  }
  for (const key of required) {
    if (!(key in value)) {
      fail(join(path, key), 'missing required field');
    }
  }
  return value;
};

const string: Parse<string> = (value, path) =>
  typeof value === 'string' ? value : fail(path, `expected a string, got ${describe(value)}`);

const nonEmptyString: Parse<string> = (value, path) => {
  const text = string(value, path);
  return text === '' ? fail(path, 'expected a non-empty string') : text;
};

const number: Parse<number> = (value, path) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : fail(path, `expected a finite number, got ${describe(value)}`);

const boolean: Parse<boolean> = (value, path) =>
  typeof value === 'boolean' ? value : fail(path, `expected a boolean, got ${describe(value)}`);

const oneOf =
  <T extends string>(members: readonly T[]): Parse<T> =>
  (value, path) => {
    const text = string(value, path);
    return (members as readonly string[]).includes(text)
      ? (text as T)
      : fail(path, `expected one of ${members.join(', ')}; got '${text}'`);
  };

const nullable =
  <T>(parse: Parse<T>): Parse<T | null> =>
  (value, path) =>
    value === null ? null : parse(value, path);

const list =
  <T>(parse: Parse<T>): Parse<T[]> =>
  (value, path) =>
    Array.isArray(value)
      ? value.map((entry, index) => parse(entry, `${path}[${index}]`))
      : fail(path, `expected an array, got ${describe(value)}`);

const field = <T>(source: Obj, key: string, path: string, parse: Parse<T>): T => parse(source[key], join(path, key));

/** The entry for an optional key: empty when the key is absent, so the result has no `undefined`. */
const optional = <K extends string, T>(
  source: Obj,
  key: K,
  path: string,
  parse: Parse<T>,
): { readonly [P in K]?: T } =>
  source[key] === undefined ? {} : ({ [key]: parse(source[key], join(path, key)) } as { readonly [P in K]?: T });

const discriminant = <T extends string>(value: unknown, path: string, key: string, members: readonly T[]): T => {
  if (!isRecord(value)) {
    return fail(path, `expected an object, got ${describe(value)}`);
  }
  return oneOf(members)(value[key], join(path, key));
};

// ---------------------------------------------------------------- sourcing building blocks

const parseCitation: Parse<Citation> = (value, path) => {
  const source = object(value, path, ['source', 'locator'], ['verbatim']);
  return {
    source: field(source, 'source', path, nonEmptyString),
    locator: field(source, 'locator', path, nonEmptyString),
    ...optional(source, 'verbatim', path, nonEmptyString),
  };
};

const parseSourced =
  <T>(parseValue: Parse<T>): Parse<Sourced<T>> =>
  (value, path) => {
    const source = object(value, path, ['value', 'cite'], ['note']);
    return {
      value: field(source, 'value', path, nullable(parseValue)),
      cite: field(source, 'cite', path, nullable(parseCitation)),
      ...optional(source, 'note', path, nonEmptyString),
    };
  };

const parseTolerance: Parse<Tolerance> = (value, path) => {
  const source = object(value, path, [], ['minus', 'plus']);
  return { ...optional(source, 'minus', path, number), ...optional(source, 'plus', path, number) };
};

const parseAlternative: Parse<MeasureAlternative> = (value, path) => {
  const source = object(value, path, ['value', 'cite'], ['tolerance', 'note']);
  return {
    value: field(source, 'value', path, number),
    cite: field(source, 'cite', path, parseCitation),
    ...optional(source, 'tolerance', path, parseTolerance),
    ...optional(source, 'note', path, nonEmptyString),
  };
};

const parseMeasure: Parse<Measure> = (value, path) => {
  const source = object(value, path, ['value', 'cite'], ['note', 'tolerance', 'basic', 'alternatives']);
  return {
    value: field(source, 'value', path, nullable(number)),
    cite: field(source, 'cite', path, nullable(parseCitation)),
    ...optional(source, 'note', path, nonEmptyString),
    ...optional(source, 'tolerance', path, parseTolerance),
    ...optional(source, 'basic', path, boolean),
    ...optional(source, 'alternatives', path, list(parseAlternative)),
  };
};

const parseSourcedMembers = <T extends string>(members: readonly T[]): Parse<Sourced<T>[]> =>
  list(parseSourced(oneOf(members)));

// ---------------------------------------------------------------- shared by both kinds

const parseSourceDocument: Parse<SourceDocument> = (value, path) => {
  const source = object(
    value,
    path,
    ['body', 'reliability', 'title', 'url', 'retrieved'],
    ['archiveUrl', 'revision', 'sha256'],
  );
  return {
    body: field(source, 'body', path, nonEmptyString),
    reliability: field(
      source,
      'reliability',
      path,
      oneOf<SourceReliability>(['standard', 'manufacturer', 'secondary', 'synthetic']),
    ),
    title: field(source, 'title', path, nonEmptyString),
    url: field(source, 'url', path, nonEmptyString),
    retrieved: field(source, 'retrieved', path, nonEmptyString),
    ...optional(source, 'archiveUrl', path, nonEmptyString),
    ...optional(source, 'revision', path, nonEmptyString),
    ...optional(source, 'sha256', path, nonEmptyString),
  };
};

const parseSources: Parse<Record<string, SourceDocument>> = (value, path) => {
  if (!isRecord(value)) {
    return fail(path, `expected an object, got ${describe(value)}`);
  }
  // fromEntries keeps a `__proto__` key as an own property instead of setting the prototype.
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, parseSourceDocument(entry, join(path, key))]),
  );
};

const parseAlias: Parse<Alias> = (value, path) => {
  const source = object(value, path, ['name', 'cite']);
  return { name: field(source, 'name', path, nonEmptyString), cite: field(source, 'cite', path, parseCitation) };
};

const parseRelation: Parse<CartridgeRelation> = (value, path) => {
  const source = object(value, path, ['cartridge', 'relation', 'cite'], ['note']);
  return {
    cartridge: field(source, 'cartridge', path, nonEmptyString),
    relation: field(source, 'relation', path, oneOf(RELATIONS)),
    cite: field(source, 'cite', path, parseCitation),
    ...optional(source, 'note', path, nonEmptyString),
  };
};

const BASE_KEYS = ['format', 'kind', 'id', 'designation', 'aliases', 'sources', 'primarySource', 'relatedTo', 'notes'];

const parseBase = (source: Obj, path: string): CartridgeBase => {
  const format = field(source, 'format', path, number);
  if (format !== CARTRIDGE_FORMAT) {
    fail(join(path, 'format'), `unsupported format ${format}; this reader understands ${CARTRIDGE_FORMAT}`);
  }
  return {
    format: CARTRIDGE_FORMAT,
    id: field(source, 'id', path, nonEmptyString),
    designation: field(source, 'designation', path, nonEmptyString),
    aliases: field(source, 'aliases', path, list(parseAlias)),
    sources: field(source, 'sources', path, parseSources),
    primarySource: field(source, 'primarySource', path, nonEmptyString),
    relatedTo: field(source, 'relatedTo', path, list(parseRelation)),
    notes: field(source, 'notes', path, list(nonEmptyString)),
  };
};

const parsePrimer: Parse<Primer> = (value, path) => {
  const source = object(value, path, ['options', 'diameter', 'designation']);
  return {
    options: field(source, 'options', path, parseSourcedMembers(PRIMER_TYPES)),
    diameter: field(source, 'diameter', path, parseMeasure),
    designation: field(source, 'designation', path, parseSourced(nonEmptyString)),
  };
};

// ---------------------------------------------------------------- metallic cartridges

const parseGroove: Parse<ExtractorGroove> = (value, path) => {
  const source = object(value, path, ['diameter', 'width'], ['bevelAngle']);
  return {
    diameter: field(source, 'diameter', path, parseMeasure),
    width: field(source, 'width', path, parseMeasure),
    ...optional(source, 'bevelAngle', path, parseMeasure),
  };
};

const parseHead: Parse<Head> = (value, path) => {
  const type = discriminant(value, path, 'type', HEAD_TYPES);
  switch (type) {
    case 'rimmed':
    case 'semi-rimmed':
      object(value, path, ['type']);
      return { type };
    case 'rimless':
    case 'rebated': {
      const source = object(value, path, ['type', 'extractorGroove']);
      return { type, extractorGroove: field(source, 'extractorGroove', path, parseGroove) };
    }
    case 'belted': {
      const source = object(value, path, ['type', 'extractorGroove', 'belt']);
      const belt = object(source.belt, join(path, 'belt'), ['diameter', 'width']);
      return {
        type,
        extractorGroove: field(source, 'extractorGroove', path, parseGroove),
        belt: {
          diameter: field(belt, 'diameter', join(path, 'belt'), parseMeasure),
          width: field(belt, 'width', join(path, 'belt'), parseMeasure),
        },
      };
    }
    default:
      return fail(join(path, 'type'), 'unhandled head type');
  }
};

const parseBody: Parse<Body> = (value, path) => {
  const type = discriminant(value, path, 'type', BODY_TYPES);
  if (type === 'straight') {
    const source = object(value, path, ['type', 'diameterAtHead', 'diameterAtMouth']);
    return {
      type,
      diameterAtHead: field(source, 'diameterAtHead', path, parseMeasure),
      diameterAtMouth: field(source, 'diameterAtMouth', path, parseMeasure),
    };
  }
  const source = object(value, path, ['type', 'diameterAtHead', 'diameterAtShoulderStart', 'shoulder', 'neck']);
  const shoulder = object(source.shoulder, join(path, 'shoulder'), ['startPosition', 'endPosition', 'angle']);
  const neck = object(source.neck, join(path, 'neck'), ['diameterAtBase', 'diameterAtMouth']);
  return {
    type,
    diameterAtHead: field(source, 'diameterAtHead', path, parseMeasure),
    diameterAtShoulderStart: field(source, 'diameterAtShoulderStart', path, parseMeasure),
    shoulder: {
      startPosition: field(shoulder, 'startPosition', join(path, 'shoulder'), parseMeasure),
      endPosition: field(shoulder, 'endPosition', join(path, 'shoulder'), parseMeasure),
      angle: field(shoulder, 'angle', join(path, 'shoulder'), parseMeasure),
    },
    neck: {
      diameterAtBase: field(neck, 'diameterAtBase', join(path, 'neck'), parseMeasure),
      diameterAtMouth: field(neck, 'diameterAtMouth', join(path, 'neck'), parseMeasure),
    },
  };
};

const parseCase: Parse<MetallicCase> = (value, path) => {
  const source = object(value, path, ['length', 'bodyStart', 'rim', 'head', 'body', 'materials', 'primer']);
  const rim = object(source.rim, join(path, 'rim'), ['diameter', 'thickness']);
  return {
    length: field(source, 'length', path, parseMeasure),
    bodyStart: field(source, 'bodyStart', path, parseMeasure),
    rim: {
      diameter: field(rim, 'diameter', join(path, 'rim'), parseMeasure),
      thickness: field(rim, 'thickness', join(path, 'rim'), parseMeasure),
    },
    head: field(source, 'head', path, parseHead),
    body: field(source, 'body', path, parseBody),
    materials: field(source, 'materials', path, parseSourcedMembers(CASE_MATERIALS)),
    primer: field(source, 'primer', path, parsePrimer),
  };
};

const parseVariant: Parse<BulletVariant> = (value, path) => {
  const source = object(value, path, ['kind', 'cite', 'massGrains'], ['length']);
  return {
    kind: field(source, 'kind', path, oneOf(BULLET_KINDS)),
    cite: field(source, 'cite', path, parseCitation),
    massGrains: field(source, 'massGrains', path, parseMeasure),
    ...optional(source, 'length', path, parseMeasure),
  };
};

const parseBullet: Parse<BulletPayload> = (value, path) => {
  const source = object(value, path, ['type', 'diameter', 'length', 'variants']);
  field(source, 'type', path, oneOf(['bullet']));
  const length = object(source.length, join(path, 'length'), ['min', 'max']);
  return {
    type: 'bullet',
    diameter: field(source, 'diameter', path, parseMeasure),
    length: {
      min: field(length, 'min', join(path, 'length'), parseMeasure),
      max: field(length, 'max', join(path, 'length'), parseMeasure),
    },
    variants: field(source, 'variants', path, list(parseVariant)),
  };
};

const parseMetallic = (source: Obj, path: string): MetallicCartridge => {
  const overall = object(source.overallLength, join(path, 'overallLength'), ['max', 'typical']);
  return {
    ...parseBase(source, path),
    kind: 'metallic',
    case: field(source, 'case', path, parseCase),
    payload: field(source, 'payload', path, parseBullet),
    overallLength: {
      max: field(overall, 'max', join(path, 'overallLength'), parseMeasure),
      typical: field(overall, 'typical', join(path, 'overallLength'), parseMeasure),
    },
  };
};

// ---------------------------------------------------------------- shotshells

const parseHull: Parse<Hull> = (value, path) => {
  const source = object(value, path, ['outerDiameter', 'materials', 'colors']);
  return {
    outerDiameter: field(source, 'outerDiameter', path, parseMeasure),
    materials: field(source, 'materials', path, parseSourcedMembers(HULL_MATERIALS)),
    colors: field(source, 'colors', path, list(parseSourced(nonEmptyString))),
  };
};

const parseShotshellHead: Parse<ShotshellHead> = (value, path) => {
  const source = object(value, path, ['rimDiameter', 'rimThickness', 'height', 'materials']);
  return {
    rimDiameter: field(source, 'rimDiameter', path, parseMeasure),
    rimThickness: field(source, 'rimThickness', path, parseMeasure),
    height: field(source, 'height', path, parseMeasure),
    materials: field(source, 'materials', path, parseSourcedMembers(CASE_MATERIALS)),
  };
};

const parseShotshellPayload: Parse<ShotPayload | SlugPayload> = (value, path) => {
  const type = discriminant(value, path, 'type', ['shot', 'slug'] as const);
  if (type === 'shot') {
    const source = object(value, path, ['type', 'name', 'pelletCount', 'pelletDiameter']);
    return {
      type,
      name: field(source, 'name', path, parseSourced(nonEmptyString)),
      pelletCount: field(source, 'pelletCount', path, parseSourced(number)),
      pelletDiameter: field(source, 'pelletDiameter', path, parseMeasure),
    };
  }
  const source = object(value, path, ['type', 'style', 'diameter', 'length', 'massGrains']);
  return {
    type,
    style: field(source, 'style', path, parseSourced(oneOf(SLUG_STYLES))),
    diameter: field(source, 'diameter', path, parseMeasure),
    length: field(source, 'length', path, parseMeasure),
    massGrains: field(source, 'massGrains', path, parseMeasure),
  };
};

const parseShotshell = (source: Obj, path: string): Shotshell => {
  const length = object(source.length, join(path, 'length'), ['nominal', 'loaded']);
  return {
    ...parseBase(source, path),
    kind: 'shotshell',
    gauge: field(source, 'gauge', path, parseSourced(number)),
    boreDiameter: field(source, 'boreDiameter', path, parseMeasure),
    hull: field(source, 'hull', path, parseHull),
    head: field(source, 'head', path, parseShotshellHead),
    closure: field(source, 'closure', path, parseSourced(oneOf(CLOSURES))),
    length: {
      nominal: field(length, 'nominal', join(path, 'length'), parseMeasure),
      loaded: field(length, 'loaded', join(path, 'length'), parseMeasure),
    },
    payload: field(source, 'payload', path, parseShotshellPayload),
    primer: field(source, 'primer', path, parsePrimer),
  };
};

// ---------------------------------------------------------------- entry points

const METALLIC_KEYS = [...BASE_KEYS, 'case', 'payload', 'overallLength'];
const SHOTSHELL_KEYS = [
  ...BASE_KEYS,
  'gauge',
  'boreDiameter',
  'hull',
  'head',
  'closure',
  'length',
  'payload',
  'primer',
];

const parseCartridgeOrThrow = (value: unknown): Cartridge => {
  const kind = discriminant(value, '', 'kind', ['metallic', 'shotshell'] as const);
  const source = object(value, '', kind === 'metallic' ? METALLIC_KEYS : SHOTSHELL_KEYS);
  return kind === 'metallic' ? parseMetallic(source, '') : parseShotshell(source, '');
};

export const parseCartridge = (value: unknown): CartridgeParseResult => {
  try {
    return { ok: true, cartridge: parseCartridgeOrThrow(value) };
  } catch (error) {
    if (error instanceof ParseFailure) {
      return { ok: false, error: { path: error.path, message: error.message } };
    }
    throw error;
  }
};

export const parseCartridgeJson = (text: string): CartridgeParseResult => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: { path: '', message: `invalid JSON: ${error instanceof Error ? error.message : error}` },
    };
  }
  return parseCartridge(value);
};
