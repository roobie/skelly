// Runtime parse of an untrusted value (usually parsed JSON) into an Assembly.
// Never a type assertion: every field is checked, and the result is rebuilt
// from the checked fields. Unknown keys are dropped.

import type { Assembly, Connection, PartInstance, PrefabReference } from './schema.ts';

/** A structural problem in an untrusted file. `path` locates it ('' for the root). */
export interface ParseError {
  readonly path: string;
  readonly message: string;
}

export interface ParseFailure {
  readonly ok: false;
  readonly error: ParseError;
}

export type Parsed<T> = { readonly ok: true; readonly value: T } | ParseFailure;

export type AssemblyParseResult = { readonly ok: true; readonly assembly: Assembly } | ParseFailure;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (path: string, message: string): ParseFailure => ({ ok: false, error: { path, message } });
const pass = <T>(value: T): Parsed<T> => ({ ok: true, value });

export const describeValue = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  return Array.isArray(value) ? 'an array' : `a ${typeof value}`;
};

export const joinPath = (base: string, key: string): string => (base === '' ? key : `${base}.${key}`);

const parseString = (value: unknown, path: string): Parsed<string> =>
  typeof value === 'string' ? pass(value) : fail(path, `expected a string, got ${describeValue(value)}`);

/** Applies `parse` to each entry, stopping at the first failure. */
export const parseEach = <T>(
  entries: readonly (readonly [path: string, value: unknown])[],
  parse: (value: unknown, path: string) => Parsed<T>,
): Parsed<T[]> => {
  const out: T[] = [];
  for (const [path, value] of entries) {
    const result = parse(value, path);
    if (!result.ok) {
      return result;
    }
    out.push(result.value);
  }
  return pass(out);
};

export const parseStringArray = (value: unknown, path: string): Parsed<string[]> =>
  Array.isArray(value)
    ? parseEach(
        value.map((v, i) => [`${path}[${i}]`, v] as const),
        parseString,
      )
    : fail(path, `expected an array, got ${describeValue(value)}`);

/** A record of `parse`d values. Built with fromEntries so a `__proto__` key stays an own property. */
export const parseRecord = <T>(
  value: unknown,
  path: string,
  parse: (value: unknown, path: string) => Parsed<T>,
): Parsed<Record<string, T>> => {
  if (!isRecord(value)) {
    return fail(path, `expected an object, got ${describeValue(value)}`);
  }
  const entries = parseEach(
    Object.entries(value).map(([k, v]) => [joinPath(path, k), v] as const),
    parse,
  );
  if (!entries.ok) {
    return entries;
  }
  return pass(Object.fromEntries(Object.keys(value).map((k, i) => [k, entries.value[i] as T])));
};

const parseOptional = <T>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  parse: (value: unknown, path: string) => Parsed<T>,
): Parsed<T | undefined> => (record[key] === undefined ? pass(undefined) : parse(record[key], joinPath(path, key)));

const parseInteger = (value: unknown, path: string, min: number): Parsed<number> =>
  typeof value === 'number' && Number.isInteger(value) && value >= min
    ? pass(value)
    : fail(path, `expected an integer >= ${min}, got ${typeof value === 'number' ? value : describeValue(value)}`);

const parseFiniteNumber = (value: unknown, path: string): Parsed<number> =>
  typeof value === 'number' && Number.isFinite(value)
    ? pass(value)
    : fail(path, `expected a finite number, got ${describeValue(value)}`);

export const parsePrefabReference = (value: unknown, path: string): Parsed<PrefabReference> => {
  if (!isRecord(value)) {
    return fail(path, `expected an object, got ${describeValue(value)}`);
  }
  const id = parseString(value.id, joinPath(path, 'id'));
  if (!id.ok) {
    return id;
  }
  if (id.value === '') {
    return fail(joinPath(path, 'id'), 'expected a non-empty prefab id');
  }
  const version = parseInteger(value.version, joinPath(path, 'version'), 1);
  return version.ok ? pass({ id: id.value, version: version.value }) : version;
};

const parsePartInstance = (value: unknown, path: string): Parsed<PartInstance> => {
  if (!isRecord(value)) {
    return fail(path, `expected an object, got ${describeValue(value)}`);
  }
  const family = parseString(value.family, joinPath(path, 'family'));
  if (!family.ok) {
    return family;
  }
  const params = parseOptional(value, 'params', path, (v, p) => parseRecord(v, p, parseString));
  if (!params.ok) {
    return params;
  }
  const prefab = parseOptional(value, 'prefab', path, parsePrefabReference);
  if (!prefab.ok) {
    return prefab;
  }
  return pass({
    family: family.value,
    ...(params.value === undefined ? {} : { params: params.value }),
    ...(prefab.value === undefined ? {} : { prefab: prefab.value }),
  });
};

const parseConnection = (value: unknown, path: string): Parsed<Connection> => {
  if (!isRecord(value)) {
    return fail(path, `expected an object, got ${describeValue(value)}`);
  }
  const from = parseString(value.from, `${path}.from`);
  if (!from.ok) {
    return from;
  }
  const to = parseString(value.to, `${path}.to`);
  if (!to.ok) {
    return to;
  }
  const slot = parseOptional(value, 'slot', path, (v, p) => parseInteger(v, p, 0));
  if (!slot.ok) {
    return slot;
  }
  const roll = parseOptional(value, 'roll', path, parseFiniteNumber);
  if (!roll.ok) {
    return roll;
  }
  return pass({
    from: from.value,
    to: to.value,
    ...(slot.value === undefined ? {} : { slot: slot.value }),
    ...(roll.value === undefined ? {} : { roll: roll.value }),
  });
};

/** Validates an already-parsed value as an Assembly. */
export const parseAssembly = (value: unknown): AssemblyParseResult => {
  if (!isRecord(value)) {
    return fail('', `expected an assembly object, got ${describeValue(value)}`);
  }
  const name = parseString(value.name, 'name');
  if (!name.ok) {
    return name;
  }
  const root = parseString(value.root, 'root');
  if (!root.ok) {
    return root;
  }
  const description = parseOptional(value, 'description', '', parseString);
  if (!description.ok) {
    return description;
  }
  const parts = parseRecord(value.parts, 'parts', parsePartInstance);
  if (!parts.ok) {
    return parts;
  }
  if (!Array.isArray(value.connections)) {
    return fail('connections', `expected an array, got ${describeValue(value.connections)}`);
  }
  const connections = parseEach(
    value.connections.map((c, i) => [`connections[${i}]`, c] as const),
    parseConnection,
  );
  if (!connections.ok) {
    return connections;
  }
  const expected = parseOptional(value, 'expect', '', parseStringArray);
  if (!expected.ok) {
    return expected;
  }
  return {
    ok: true,
    assembly: {
      name: name.value,
      ...(description.value === undefined ? {} : { description: description.value }),
      root: root.value,
      parts: parts.value,
      connections: connections.value,
      ...(expected.value === undefined ? {} : { expect: expected.value }),
    },
  };
};

/** Parses JSON text as an Assembly; invalid JSON is a ParseError too. */
export const parseAssemblyJson = (text: string): AssemblyParseResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return fail('', `invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parseAssembly(raw);
};

/** For fixtures and tests, where a malformed file is a programming error. */
export const parseAssemblyOrThrow = (text: string, source: string): Assembly => {
  const result = parseAssemblyJson(text);
  if (!result.ok) {
    throw new Error(`${source}: ${formatParseError(result.error)}`);
  }
  return result.assembly;
};

export const formatParseError = (error: ParseError): string =>
  error.path === '' ? error.message : `${error.path}: ${error.message}`;
