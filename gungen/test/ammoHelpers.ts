import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Cartridge } from '../src/ammo/cartridge.ts';
import { formatCartridgeParseError, parseCartridge, parseCartridgeJson } from '../src/ammo/parseCartridge.ts';

export const CARTRIDGES = join(import.meta.dirname, '..', 'cartridges');
export const CARTRIDGE_FIXTURES = join(import.meta.dirname, 'fixtures', 'cartridges');

/** Plain JSON, as read from a file, before the parser has seen it. */
export type Json = null | boolean | number | string | Json[] | JsonObject;
export interface JsonObject {
  [property: string]: Json;
}

export const readJson = (path: string): JsonObject => JSON.parse(readFileSync(path, 'utf8')) as JsonObject;

export const cartridgeFiles = (): string[] =>
  readdirSync(CARTRIDGES)
    .filter((f) => f.endsWith('.json'))
    .sort();

/** Parses `raw` or throws with the parse error, for tests that expect a good file. */
export const mustParse = (raw: unknown, label = 'cartridge'): Cartridge => {
  const result = parseCartridge(raw);
  if (!result.ok) {
    throw new Error(`${label}: ${formatCartridgeParseError(result.error)}`);
  }
  return result.cartridge;
};

export const loadCartridgeFile = (file: string): Cartridge => {
  const result = parseCartridgeJson(readFileSync(join(CARTRIDGES, file), 'utf8'));
  if (!result.ok) {
    throw new Error(`${file}: ${formatCartridgeParseError(result.error)}`);
  }
  return result.cartridge;
};

export const loadCartridges = (): Cartridge[] => cartridgeFiles().map(loadCartridgeFile);

// ---------------------------------------------------------------- synthetic cartridges
//
// Invented numbers for exercising each case shape. They are not real data and say so: every
// citation points at the one source below, whose reliability is 'synthetic'. Real cartridge files
// must never use it (test/ammoCartridge.test.ts checks).

const CITE = { source: 'synthetic', locator: 'invented for tests' };
const SOURCES = {
  synthetic: {
    body: 'SYNTHETIC',
    reliability: 'synthetic',
    title: 'Invented test data, not a real cartridge',
    url: 'none',
    retrieved: '2026-10-01',
  },
};

const m = (value: number): JsonObject => ({ value, cite: CITE });
const sourced = (value: Json): JsonObject => ({ value, cite: CITE });

export type SyntheticShape = 'rimless-bottleneck' | 'rimless-straight' | 'rimmed-straight' | 'rimmed-bottleneck';

const HEADS: Record<string, { rim: number; head: number; thickness: number; bodyStart: number; groove?: number }> = {
  rimless: { rim: 12, head: 12, thickness: 1.5, bodyStart: 3, groove: 10.5 },
  rimmed: { rim: 13, head: 11, thickness: 1.5, bodyStart: 2 },
};

const headJson = (type: string): JsonObject => {
  const spec = HEADS[type] as NonNullable<(typeof HEADS)[string]>;
  return type === 'rimmed' ? { type } : { type, extractorGroove: { diameter: m(spec.groove ?? 0), width: m(1) } };
};

const bodyJson = (shape: string, head: number): JsonObject =>
  shape === 'bottleneck'
    ? {
        type: 'bottleneck',
        diameterAtHead: m(head),
        diameterAtShoulderStart: m(head - 1),
        shoulder: { startPosition: m(30), endPosition: m(33), angle: m(30) },
        neck: { diameterAtBase: m(9), diameterAtMouth: m(9) },
      }
    : { type: 'straight', diameterAtHead: m(head), diameterAtMouth: m(head - 0.3) };

const primerJson = (): JsonObject => ({
  options: [sourced('boxer')],
  diameter: m(5),
  designation: sourced('invented'),
});

const metallic = (shape: SyntheticShape): JsonObject => {
  const [headType, bodyType] = [shape.slice(0, shape.lastIndexOf('-')), shape.slice(shape.lastIndexOf('-') + 1)];
  const spec = HEADS[headType] as NonNullable<(typeof HEADS)[string]>;
  return {
    format: 1,
    kind: 'metallic',
    id: `synthetic-${shape}`,
    designation: `SYNTHETIC ${shape}`,
    aliases: [],
    sources: SOURCES,
    primarySource: 'synthetic',
    relatedTo: [],
    notes: ['Invented numbers; not a real cartridge.'],
    case: {
      length: m(40),
      bodyStart: m(spec.bodyStart),
      rim: { diameter: m(spec.rim), thickness: m(spec.thickness) },
      head: headJson(headType),
      body: bodyJson(bodyType === 'bottleneck' ? 'bottleneck' : 'straight', spec.head),
      materials: [sourced('brass')],
      primer: primerJson(),
    },
    payload: {
      type: 'bullet',
      diameter: m(bodyType === 'bottleneck' ? 8 : spec.head - 1.5),
      length: { min: m(20), max: m(25) },
      variants: [{ kind: 'fmj', cite: CITE, massGrains: m(100) }],
    },
    overallLength: { max: m(55), typical: m(54) },
  };
};

export type ShotshellShape = 'shotshell-buck' | 'shotshell-slug';

const shotshell = (shape: ShotshellShape): JsonObject => ({
  format: 1,
  kind: 'shotshell',
  id: `synthetic-${shape}`,
  designation: `SYNTHETIC ${shape}`,
  aliases: [],
  sources: SOURCES,
  primarySource: 'synthetic',
  relatedTo: [],
  notes: ['Invented numbers; not a real shell.'],
  gauge: sourced(12),
  boreDiameter: m(18.5),
  hull: { outerDiameter: m(20), materials: [sourced('plastic')], colors: [sourced('red')] },
  head: { rimDiameter: m(22), rimThickness: m(1.5), height: m(16), materials: [sourced('brass')] },
  closure: sourced('fold-crimp'),
  length: { nominal: m(70), loaded: m(66) },
  payload:
    shape === 'shotshell-buck'
      ? { type: 'shot', name: sourced('invented buck'), pelletCount: sourced(9), pelletDiameter: m(8.4) }
      : { type: 'slug', style: sourced('foster'), diameter: m(18), length: m(25), massGrains: m(400) },
  primer: primerJson(),
});

export const SYNTHETIC_METALLIC_SHAPES: readonly SyntheticShape[] = [
  'rimless-bottleneck',
  'rimless-straight',
  'rimmed-straight',
  'rimmed-bottleneck',
];

export const syntheticJson = (shape: SyntheticShape | ShotshellShape): JsonObject =>
  shape.startsWith('shotshell') ? shotshell(shape as ShotshellShape) : metallic(shape as SyntheticShape);

/** A synthetic cartridge with its id and relations replaced, for the relation tests. */
export const syntheticNamed = (
  shape: SyntheticShape,
  id: string,
  relatedTo: { cartridge: string; relation: string }[] = [],
): Cartridge =>
  mustParse(
    {
      ...metallic(shape),
      id,
      designation: `SYNTHETIC ${id}`,
      relatedTo: relatedTo.map((relation) => ({ ...relation, cite: CITE })),
    },
    id,
  );

// ---------------------------------------------------------------- patches for broken fixtures

const PATH_TOKEN = /[^.[\]]+/g;

/** `case.rim.diameter.value` or `payload.variants[0].kind` → ['case', 'rim', …]. */
const tokens = (path: string): string[] => path.match(PATH_TOKEN) ?? [];

const walk = (root: Json, segments: readonly string[]): Json => {
  let node = root;
  for (const segment of segments) {
    node = (node as JsonObject)[segment] as Json;
  }
  return node;
};

/** Whether `path` leads to a field of `root`, a field holding null included. */
export const hasPath = (root: JsonObject, path: string): boolean => {
  let node: Json = root;
  for (const segment of tokens(path)) {
    if (node === null || typeof node !== 'object' || !(segment in node)) {
      return false;
    }
    node = (node as JsonObject)[segment] as Json;
  }
  return true;
};

export const setPath = (root: JsonObject, path: string, value: Json): void => {
  const segments = tokens(path);
  (walk(root, segments.slice(0, -1)) as JsonObject)[segments.at(-1) as string] = value;
};

export const unsetPath = (root: JsonObject, path: string): void => {
  const segments = tokens(path);
  Reflect.deleteProperty(walk(root, segments.slice(0, -1)) as JsonObject, segments.at(-1) as string);
};

export interface BrokenCartridgeFixture {
  readonly name: string;
  /** A file stem in cartridges/, or `synthetic:<shape>`. */
  readonly base: string;
  readonly set?: Record<string, Json>;
  readonly unset?: string[];
  /** Rule ids the patched cartridge must fail, exactly. */
  readonly expect?: string[];
  /** Path of the parse error the patched file must produce instead. */
  readonly expectParseError?: string;
}

export const loadBrokenFixtures = (): BrokenCartridgeFixture[] =>
  readdirSync(CARTRIDGE_FIXTURES)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readJson(join(CARTRIDGE_FIXTURES, f)) as unknown as BrokenCartridgeFixture);

/** The patched JSON of a fixture, deep-cloned from its base. */
export const patchedJson = (fixture: BrokenCartridgeFixture): JsonObject => {
  const base = fixture.base.startsWith('synthetic:')
    ? syntheticJson(fixture.base.slice('synthetic:'.length) as SyntheticShape)
    : readJson(join(CARTRIDGES, `${fixture.base}.json`));
  const json = structuredClone(base);
  for (const [path, value] of Object.entries(fixture.set ?? {})) {
    setPath(json, path, value);
  }
  for (const path of fixture.unset ?? []) {
    unsetPath(json, path);
  }
  return json;
};
