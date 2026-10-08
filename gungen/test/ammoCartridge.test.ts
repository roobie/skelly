import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allCitations, collectNodes, unsourcedPaths } from '../src/ammo/measures.ts';
import { formatCartridgeParseError, parseCartridge, parseCartridgeJson } from '../src/ammo/parseCartridge.ts';
import { checkRelations, validateCartridge } from '../src/ammo/rules.ts';
import {
  CARTRIDGES,
  cartridgeFiles,
  type Json,
  type JsonObject,
  loadCartridgeFile,
  loadCartridges,
  mustParse,
  readJson,
  type ShotshellShape,
  SYNTHETIC_METALLIC_SHAPES,
  type SyntheticShape,
  setPath,
  syntheticJson,
  syntheticNamed,
  unsetPath,
  unusableIssues,
} from './ammoHelpers.ts';

/** The `rule path` of each issue; fails if an issue lacks a message or names a field the file does not have. */
const issues = (raw: unknown): string[] => {
  const found = validateCartridge(mustParse(raw));
  const unusable = unusableIssues(raw as JsonObject, found);
  if (unusable.length > 0) {
    throw new Error(`unusable issues: ${unusable.join('; ')}`);
  }
  return found.map((issue) => `${issue.rule} ${issue.path}`);
};

describe('cartridge files', () => {
  it('ships at least one cartridge, so the it.each below is never empty and passing vacuously', () => {
    expect(cartridgeFiles()).toContain('7.62x39.json');
  });

  it.each(cartridgeFiles())('%s parses, is named for its file and has no validation issues', (file) => {
    const cartridge = loadCartridgeFile(file);
    expect(cartridge.id).toBe(file.slice(0, -'.json'.length));
    expect(validateCartridge(cartridge)).toEqual([]);
  });

  it('never ships synthetic data', () => {
    for (const cartridge of loadCartridges()) {
      for (const source of Object.values(cartridge.sources)) {
        expect(source.reliability).not.toBe('synthetic');
      }
    }
  });

  it('keeps relations between the shipped cartridges consistent', () => {
    expect(checkRelations(loadCartridges())).toEqual([]);
  });

  it('reports invalid JSON as a parse error, not as an empty cartridge', () => {
    const result = parseCartridgeJson('{');
    expect(!result.ok && result.error.message).toContain('invalid JSON');
    expect(!result.ok && result.error.path).toBe('');
  });
});

describe('7.62x39', () => {
  const cartridge = loadCartridgeFile('7.62x39.json');

  it('is a rimless bottleneck metallic cartridge sourced primarily from C.I.P.', () => {
    expect(cartridge.kind).toBe('metallic');
    if (cartridge.kind !== 'metallic') {
      return;
    }
    expect(cartridge.case.head.type).toBe('rimless');
    expect(cartridge.case.body.type).toBe('bottleneck');
    expect(cartridge.primarySource).toBe('cip');
    expect(cartridge.sources.cip?.reliability).toBe('standard');
  });

  it('leaves exactly the primer diameter unsourced', () => {
    expect(unsourcedPaths(cartridge)).toEqual(['case.primer.diameter']);
  });

  it('cites C.I.P. for every primary case and bullet dimension', () => {
    const { measures } = collectNodes(cartridge);
    const fromElsewhere = ['overallLength.typical', 'payload.length.min', 'payload.length.max'];
    const dimensions = measures.filter(
      ({ unit, path, node }) => unit !== 'grains' && !fromElsewhere.includes(path) && node.value !== null,
    );
    expect(dimensions.length).toBeGreaterThan(15);
    for (const { path, node } of dimensions) {
      expect(node.cite?.source, path).toBe('cip');
    }
  });

  it('records SAAMI as the alternative for the rim diameter', () => {
    const { measures } = collectNodes(cartridge);
    const rimDiameter = measures.find(({ path }) => path === 'case.rim.diameter')?.node;
    expect(rimDiameter?.alternatives?.map((alt) => alt.cite.source)).toEqual(['saami']);
  });

  it('states a cone angle that agrees with its own diameters and positions', () => {
    if (cartridge.kind !== 'metallic' || cartridge.case.body.type !== 'bottleneck') {
      throw new Error('expected a bottleneck cartridge');
    }
    const { body } = cartridge.case;
    const run = (body.shoulder.endPosition.value ?? 0) - (body.shoulder.startPosition.value ?? 0);
    const rise = ((body.diameterAtShoulderStart.value ?? 0) - (body.neck.diameterAtBase.value ?? 0)) / 2;
    const included = (2 * Math.atan(rise / run) * 180) / Math.PI;
    expect(Math.abs(included - (body.shoulder.angle.value ?? 0))).toBeLessThan(0.1);
  });
});

describe('12 gauge 00 buck', () => {
  const cartridge = loadCartridgeFile('12-gauge-00-buck.json');

  it('cites the standard shell and representative payload data', () => {
    expect(cartridge.kind).toBe('shotshell');
    if (cartridge.kind !== 'shotshell' || cartridge.payload.type !== 'shot') {
      throw new Error('expected a shotshell with a shot payload');
    }
    expect(cartridge.primarySource).toBe('saami');
    expect(cartridge.sources.saami?.reliability).toBe('standard');
    const measurements = collectNodes(cartridge).measures.filter(({ node }) => node.value !== null);
    expect(measurements.length).toBeGreaterThan(0);
    expect(measurements.every(({ node }) => node.cite !== undefined)).toBe(true);
    expect(cartridge.payload.pelletCount.cite).toBeDefined();
    expect(cartridge.payload.pelletDiameter.cite).toBeDefined();
    expect(cartridge.length.loaded.cite).toBeDefined();
  });
});

describe('case shapes', () => {
  it.each(SYNTHETIC_METALLIC_SHAPES)('synthetic %s is valid and fully sourced', (shape) => {
    const cartridge = mustParse(syntheticJson(shape));
    expect(cartridge.kind).toBe('metallic');
    expect(validateCartridge(cartridge)).toEqual([]);
    expect(unsourcedPaths(cartridge)).toEqual([]);
  });

  it.each([
    ['shotshell-buck', 'shot'],
    ['shotshell-slug', 'slug'],
  ] as const)('synthetic %s is a valid, fully sourced shotshell with a %s payload', (shape, payload) => {
    const cartridge = mustParse(syntheticJson(shape));
    expect(cartridge.kind).toBe('shotshell');
    expect(cartridge.kind === 'shotshell' && cartridge.payload.type).toBe(payload);
    expect(validateCartridge(cartridge)).toEqual([]);
    expect(unsourcedPaths(cartridge)).toEqual([]);
  });

  it('sets no absolute size limit: the same shape stays valid from a few mm to a .50 BMG-sized round', () => {
    // Scale every length of a valid synthetic round; the rules compare, they never cap. Factor 1 is
    // the unscaled shape, which 'synthetic %s is valid and fully sourced' already checks.
    for (const factor of [0.4, 2.6]) {
      const json = syntheticJson('rimless-bottleneck');
      const scaled = JSON.parse(JSON.stringify(json), (key, value: unknown) =>
        key === 'value' && typeof value === 'number' ? value * factor : value,
      );
      scaled.case.body.shoulder.angle.value = 30;
      scaled.payload.variants[0].massGrains.value = 100;
      scaled.case.primer.diameter.value = 5;
      expect(validateCartridge(mustParse(scaled)), `x${factor}`).toEqual([]);
    }
  });
});

describe('relations between cartridges', () => {
  it('expresses 5.56 NATO being unsafe in a .223 Remington chamber, and the reverse', () => {
    const rem = syntheticNamed('rimless-bottleneck', 'synthetic-223-rem', [
      { cartridge: 'synthetic-556-nato', relation: 'same-external-dimensions' },
      { cartridge: 'synthetic-556-nato', relation: 'safe-in-chamber-of' },
    ]);
    const nato = syntheticNamed('rimless-bottleneck', 'synthetic-556-nato', [
      { cartridge: 'synthetic-223-rem', relation: 'same-external-dimensions' },
      { cartridge: 'synthetic-223-rem', relation: 'unsafe-in-chamber-of' },
    ]);
    expect(checkRelations([rem, nato])).toEqual([]);
    expect(nato.relatedTo.map((r) => r.relation)).toContain('unsafe-in-chamber-of');
    expect(rem.relatedTo.map((r) => r.relation)).not.toContain('unsafe-in-chamber-of');
  });

  it('refuses a pair declared both safe and unsafe', () => {
    const a = syntheticNamed('rimmed-straight', 'synthetic-a', [
      { cartridge: 'synthetic-b', relation: 'safe-in-chamber-of' },
      { cartridge: 'synthetic-b', relation: 'unsafe-in-chamber-of' },
    ]);
    const b = syntheticNamed('rimmed-straight', 'synthetic-b');
    expect(checkRelations([a, b]).map((issue) => `${issue.rule} ${issue.path}: ${issue.message}`)).toEqual([
      "relations synthetic-a.relatedTo: 'synthetic-a' is declared both safe and unsafe in the chamber of 'synthetic-b'",
    ]);
  });

  it('refuses a relation to a cartridge that is not in the set', () => {
    const a = syntheticNamed('rimmed-straight', 'synthetic-a', [
      { cartridge: 'synthetic-missing', relation: 'same-external-dimensions' },
    ]);
    expect(checkRelations([a]).map((issue) => `${issue.rule} ${issue.path}: ${issue.message}`)).toEqual([
      "relations synthetic-a.relatedTo[0]: unknown cartridge 'synthetic-missing'",
    ]);
  });

  it('refuses a cartridge related to itself', () => {
    const a = syntheticNamed('rimmed-straight', 'synthetic-a', [
      { cartridge: 'synthetic-a', relation: 'same-external-dimensions' },
    ]);
    expect(checkRelations([a]).map((issue) => `${issue.rule} ${issue.path}: ${issue.message}`)).toEqual([
      'relations synthetic-a.relatedTo[0]: a cartridge cannot be related to itself',
    ]);
  });
});

/** A synthetic cartridge with one path set or removed (`value` undefined removes it). */
const edited = (shape: SyntheticShape | ShotshellShape, path: string, value?: Json): JsonObject => {
  const json = syntheticJson(shape);
  if (value === undefined) {
    unsetPath(json, path);
  } else {
    setPath(json, path, value);
  }
  return json;
};

const parseErrorOf = (raw: unknown): string | undefined => {
  const result = parseCartridge(raw);
  return result.ok ? undefined : formatCartridgeParseError(result.error);
};

const ALL_SHAPES: readonly (SyntheticShape | ShotshellShape)[] = [
  ...SYNTHETIC_METALLIC_SHAPES,
  'shotshell-buck',
  'shotshell-slug',
];

/** Calls `visit` with the path and node of every object in `node`, the root (path '') included. */
const walkObjects = (node: Json, visit: (path: string, object: JsonObject) => void, path = ''): void => {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => {
      walkObjects(entry, visit, `${path}[${index}]`);
    });
  } else if (node !== null && typeof node === 'object') {
    visit(path, node);
    for (const [key, child] of Object.entries(node)) {
      walkObjects(child, visit, path === '' ? key : `${path}.${key}`);
    }
  }
};

const child = (path: string, key: string): string => (path === '' ? key : `${path}.${key}`);

/** A rimless bottleneck with every optional field the parser accepts filled in. */
const withEveryOptionalField = (): JsonObject => {
  const json = syntheticJson('rimless-bottleneck');
  const cite = { source: 'synthetic', locator: 'invented for tests', verbatim: 'as printed' };
  setPath(json, 'sources.synthetic.archiveUrl', 'https://archive.invalid/copy');
  setPath(json, 'sources.synthetic.revision', 'rev 2');
  setPath(json, 'sources.synthetic.sha256', 'a'.repeat(64));
  setPath(json, 'case.length', {
    value: 40,
    cite,
    note: 'a note',
    tolerance: { minus: 0.1, plus: 0.2 },
    basic: true,
    alternatives: [{ value: 40.1, cite, tolerance: { minus: 0.05, plus: 0.05 }, note: 'other source' }],
  });
  setPath(json, 'case.head.extractorGroove.bevelAngle', { value: 45, cite });
  setPath(json, 'case.materials[0].note', 'a note');
  setPath(json, 'payload.variants[0].length', { value: 26, cite });
  setPath(json, 'aliases', [{ name: 'an alias', cite }]);
  setPath(json, 'relatedTo', [
    { cartridge: 'synthetic-other', relation: 'same-external-dimensions', cite, note: 'same case' },
  ]);
  return json;
};

/** `withEveryOptionalField` with a text and a measure left unsourced: null value, null citation, a note. */
const withUnsourcedNodes = (): JsonObject => {
  const json = withEveryOptionalField();
  setPath(json, 'case.materials[0]', { value: null, cite: null, note: 'not printed by the source' });
  setPath(json, 'case.rim.diameter', { value: null, cite: null, note: 'not printed by the source' });
  return json;
};

/** The JSON of every synthetic shape, the all-optional-fields cartridges and every shipped file. */
const everyCartridgeJson = (): JsonObject[] => [
  ...ALL_SHAPES.map((shape) => syntheticJson(shape)),
  withEveryOptionalField(),
  withUnsourcedNodes(),
  ...cartridgeFiles().map((file) => readJson(join(CARTRIDGES, file))),
];

// Head and body are parsed independently, so these four reach every branch of the parser: rimless and
// rimmed heads, bottleneck and straight bodies, shot and slug payloads.
const PARSE_SHAPES = ['rimless-bottleneck', 'rimmed-straight', 'shotshell-buck', 'shotshell-slug'] as const;

describe('parse', () => {
  it.each(PARSE_SHAPES)(
    '%s: a missing field is reported at its own path, a measure value included (unsourced is null, never absent)',
    (shape) => {
      const present: string[] = [];
      walkObjects(syntheticJson(shape), (path, node) => {
        // sources is a table of documents, so a document may be absent; a discriminant fails with its own message.
        if (path !== 'sources') {
          present.push(
            ...Object.keys(node)
              .filter((key) => key !== 'kind' && key !== 'type')
              .map((k) => child(path, k)),
          );
        }
      });
      expect(present.length).toBeGreaterThan(40);
      for (const path of present) {
        expect(parseErrorOf(edited(shape, path)), path).toBe(`${path}: missing required field`);
      }
    },
  );

  it.each(PARSE_SHAPES)(
    '%s: an unknown key is refused wherever it sits, so a misspelled optional field is not dropped silently',
    (shape) => {
      walkObjects(syntheticJson(shape), (path) => {
        if (path !== 'sources') {
          expect(parseErrorOf(edited(shape, child(path, 'toleranec'), 1)), path).toBe(
            `${child(path, 'toleranec')}: unknown field`,
          );
        }
      });
    },
  );

  it('keeps every field it accepts, optional ones included, and invents none', () => {
    for (const json of everyCartridgeJson()) {
      expect(mustParse(json), String(json.id)).toStrictEqual(json);
    }
  });

  it('words an error with the kind of value it got, and without a path when the root is wrong', () => {
    expect(parseErrorOf(null)).toBe('expected an object, got null');
    expect(parseErrorOf([])).toBe('expected an object, got an array');
    expect(parseErrorOf(5)).toBe('expected an object, got a number');
  });

  it.each([
    { name: 'an empty string', path: 'id', value: '', message: 'id: expected a non-empty string' },
    { name: 'a number for a string', path: 'id', value: 5, message: 'id: expected a string, got a number' },
    {
      name: 'infinity',
      path: 'case.length.value',
      value: Number.POSITIVE_INFINITY,
      message: 'case.length.value: expected a finite number, got a number',
    },
    {
      name: 'a string for a flag',
      path: 'case.length.basic',
      value: 'yes',
      message: 'case.length.basic: expected a boolean, got a string',
    },
    {
      name: 'a string for a list',
      path: 'case.materials',
      value: 'brass',
      message: 'case.materials: expected an array, got a string',
    },
    {
      name: 'a number for the sources table',
      path: 'sources',
      value: 5,
      message: 'sources: expected an object, got a number',
    },
    { name: 'null for an object', path: 'case.rim', value: null, message: 'case.rim: expected an object, got null' },
  ])('refuses $name with a message that names the field and what was found', ({ path, value, message }) => {
    const json = syntheticJson('rimmed-straight');
    setPath(json, path, value);
    expect(parseErrorOf(json)).toBe(message);
  });

  it('rethrows an internal error instead of calling the file invalid', () => {
    const hostile = {
      get kind(): string {
        throw new Error('boom');
      },
    };
    expect(() => parseCartridge(hostile)).toThrow('boom');
  });

  it('refuses an unknown kind', () => {
    expect(parseErrorOf({ ...syntheticJson('rimmed-straight'), kind: 'rimfire' })).toBe(
      "kind: expected one of metallic, shotshell; got 'rimfire'",
    );
  });

  it('refuses a format version this reader does not understand', () => {
    expect(parseErrorOf({ ...syntheticJson('rimmed-straight'), format: 2 })).toBe(
      'format: unsupported format 2; this reader understands 1',
    );
  });

  it('refuses any head type it does not model (flanged, belted, rebated, semi-rimmed)', () => {
    for (const type of ['flanged', 'belted', 'rebated', 'semi-rimmed']) {
      expect(parseErrorOf(edited('rimmed-straight', 'case.head.type', type)), type).toBe(
        `case.head.type: expected one of rimless, rimmed; got '${type}'`,
      );
    }
  });

  it('loads a structurally valid file whose physics is absurd, and leaves judging it to the rules', () => {
    const json = edited('rimmed-straight', 'case.length.value', 500);
    expect([...new Set(issues(json))]).toEqual(['lengths case.length']);
  });
});

const CITE = { source: 'synthetic', locator: 'invented for tests' };
const ALTERNATIVE_PATH = /\.alternatives\[\d+\]$/;
const ANGLE_PATH = /(^|\.)(angle|bevelAngle)$/;

/** The `rule path` issues of a synthetic cartridge after setting each path to its value. */
const issuesAfter = (shape: SyntheticShape | ShotshellShape, set: Record<string, Json>): string[] => {
  const json = syntheticJson(shape);
  for (const [path, value] of Object.entries(set)) {
    setPath(json, path, value);
  }
  return issues(json);
};

/** Issues for the synthetic source document after patching its fields. */
const sourceIssues = (patch: Record<string, Json>): string[] =>
  issuesAfter(
    'rimmed-straight',
    Object.fromEntries(Object.entries(patch).map(([field, value]) => [`sources.synthetic.${field}`, value])),
  );

interface EdgeCase {
  readonly name: string;
  readonly shape: SyntheticShape | ShotshellShape;
  readonly set: Record<string, Json>;
  readonly expected: string[];
}

describe('measures', () => {
  /** Every `{ value, cite }` node of a cartridge's JSON by path; an alternative is not a node of its own. */
  const sourcedNodes = (json: JsonObject): Map<string, JsonObject> => {
    const found = new Map<string, JsonObject>();
    walkObjects(json, (path, node) => {
      if ('value' in node && 'cite' in node && !ALTERNATIVE_PATH.test(path)) {
        found.set(path, node);
      }
    });
    return found;
  };

  const unitOf = (path: string): string => {
    if (ANGLE_PATH.test(path)) {
      return 'deg';
    }
    if (path.endsWith('massGrains')) {
      return 'grains';
    }
    return path === 'gauge' || path === 'payload.pelletCount' ? 'count' : 'mm';
  };

  it('lists every sourced node of a cartridge at its path, a measure with the unit its field implies', () => {
    for (const json of everyCartridgeJson()) {
      const label = String(json.id);
      const { measures, texts } = collectNodes(mustParse(json));
      const nodes = sourcedNodes(json);
      expect([...measures, ...texts].map((ref) => ref.path).sort(), label).toEqual([...nodes.keys()].sort());
      for (const ref of measures) {
        expect(ref.unit, `${label} ${ref.path}`).toBe(unitOf(ref.path));
      }
      const measurePaths = new Set(measures.map((ref) => ref.path));
      for (const [path, node] of nodes) {
        if (node.value !== null) {
          expect(measurePaths.has(path), `${label} ${path} is a measure`).toBe(typeof node.value === 'number');
        }
      }
    }
  });

  it('lists every citation of a cartridge at its path: measures, alternatives, texts, aliases, relations, variants', () => {
    for (const json of everyCartridgeJson()) {
      const expected: string[] = [];
      walkObjects(json, (path, node) => {
        if ('source' in node && 'locator' in node) {
          expected.push(path);
        }
      });
      expect(
        allCitations(mustParse(json))
          .map((ref) => ref.path)
          .sort(),
        String(json.id),
      ).toEqual(expected.sort());
    }
  });

  it('reports exactly the measures and texts whose value is null as unsourced', () => {
    expect(unsourcedPaths(mustParse(withUnsourcedNodes())).sort()).toEqual(['case.materials[0]', 'case.rim.diameter']);
  });
});

describe('rules at their edges', () => {
  // Each row makes two compared values equal, so it fails if a strict comparison turns inclusive or back.
  it.each<EdgeCase>([
    {
      name: 'a shoulder that starts where the body starts is refused (positions are strictly ordered)',
      shape: 'rimless-bottleneck',
      set: { 'case.body.shoulder.startPosition.value': 3 },
      expected: ['positions case.bodyStart'],
    },
    {
      name: 'a groove that ends exactly at the body start is allowed',
      shape: 'rimless-bottleneck',
      set: { 'case.bodyStart.value': 2.5 },
      expected: [],
    },
    {
      name: 'a rimmed rim as wide as the head is refused (it must be wider)',
      shape: 'rimmed-straight',
      set: { 'case.rim.diameter.value': 11 },
      expected: ['head-type case.rim.diameter'],
    },
    {
      name: 'a rimless rim exactly at the tolerance from the head is allowed',
      shape: 'rimless-straight',
      set: { 'case.rim.diameter.value': 12.5 },
      expected: [],
    },
    {
      name: 'a straight mouth as wide as the head is allowed (a taper may be zero)',
      shape: 'rimmed-straight',
      set: { 'case.body.diameterAtMouth.value': 11 },
      expected: [],
    },
    {
      name: 'a case as long as the round is refused (the bullet must stick out)',
      shape: 'rimmed-straight',
      set: { 'case.length.value': 54 },
      expected: ['lengths case.length'],
    },
    {
      name: 'a maximum overall length equal to the typical one is allowed',
      shape: 'rimmed-straight',
      set: { 'overallLength.typical.value': 55 },
      expected: [],
    },
    {
      name: 'a crimped shell as long as the opened one is allowed',
      shape: 'shotshell-buck',
      set: { 'length.loaded.value': 70 },
      expected: [],
    },
    {
      name: 'a metal head as tall as the loaded shell is refused',
      shape: 'shotshell-buck',
      set: { 'head.height.value': 66 },
      expected: ['shotshell head.height'],
    },
    {
      name: 'a bullet wider than the mouth of a straight case leaves no wall',
      shape: 'rimless-straight',
      set: { 'payload.diameter.value': 11.8 },
      expected: ['neck-wall case.body.diameterAtMouth'],
    },
    {
      name: 'a bullet as wide as the base of a bottleneck neck leaves no wall',
      shape: 'rimmed-bottleneck',
      set: { 'case.body.neck.diameterAtBase.value': 8 },
      expected: ['neck-wall case.body.neck.diameterAtBase'],
    },
    {
      name: 'a bullet as wide as the mouth of a bottleneck neck leaves no wall',
      shape: 'rimmed-bottleneck',
      set: { 'case.body.neck.diameterAtMouth.value': 8 },
      expected: ['neck-wall case.body.neck.diameterAtMouth'],
    },
    // One refusal for each comparison the rows above do not reach, so none can stop firing unnoticed.
    {
      name: 'a rimmed rim thicker than the body start is refused (no groove to count)',
      shape: 'rimmed-straight',
      set: { 'case.rim.thickness.value': 3 },
      expected: ['positions case.rim.thickness'],
    },
    {
      name: 'a straight body that starts at the case length is refused',
      shape: 'rimmed-straight',
      set: { 'case.bodyStart.value': 40 },
      expected: ['positions case.bodyStart'],
    },
    {
      name: 'a shoulder that ends where it starts is refused',
      shape: 'rimless-bottleneck',
      set: { 'case.body.shoulder.endPosition.value': 30 },
      expected: ['positions case.body.shoulder.startPosition'],
    },
    {
      name: 'a shoulder that ends at the case length is refused',
      shape: 'rimless-bottleneck',
      set: { 'case.body.shoulder.endPosition.value': 40 },
      expected: ['positions case.body.shoulder.endPosition'],
    },
    {
      name: 'a shoulder start as wide as the neck base is refused (diameters narrow)',
      shape: 'rimmed-bottleneck',
      set: { 'case.body.neck.diameterAtBase.value': 10 },
      expected: ['diameters case.body.diameterAtShoulderStart'],
    },
    {
      name: 'a rim as thick as the metal head is refused',
      shape: 'shotshell-buck',
      set: { 'head.rimThickness.value': 16 },
      expected: ['shotshell head.rimThickness'],
    },
    {
      name: 'a metal head rim as wide as the hull is refused (it must overhang)',
      shape: 'shotshell-buck',
      set: { 'head.rimDiameter.value': 20 },
      expected: ['shotshell head.rimDiameter'],
    },
    {
      name: 'a bore as wide as the hull is refused',
      shape: 'shotshell-buck',
      set: { 'boreDiameter.value': 20 },
      expected: ['shotshell boreDiameter'],
    },
    {
      name: 'a slug as long as the loaded shell is refused',
      shape: 'shotshell-slug',
      set: { 'payload.length.value': 66 },
      expected: ['shotshell payload.length'],
    },
    {
      name: 'a crimped shell longer than the opened one is refused',
      shape: 'shotshell-buck',
      set: { 'length.loaded.value': 71 },
      expected: ['shotshell length.loaded'],
    },
    {
      name: 'a zero mass is refused',
      shape: 'rimmed-straight',
      set: { 'payload.variants[0].massGrains.value': 0 },
      expected: ['units payload.variants[0].massGrains'],
    },
    {
      name: 'an angle of 0 degrees is refused',
      shape: 'rimless-bottleneck',
      set: { 'case.body.shoulder.angle.value': 0 },
      expected: ['units case.body.shoulder.angle'],
    },
    {
      name: 'an angle of 180 degrees is refused',
      shape: 'rimless-bottleneck',
      set: { 'case.body.shoulder.angle.value': 180 },
      expected: ['units case.body.shoulder.angle'],
    },
    {
      name: 'a gauge of zero is refused',
      shape: 'shotshell-buck',
      set: { 'gauge.value': 0 },
      expected: ['units gauge'],
    },
    {
      name: 'an alternative value is checked like the primary one',
      shape: 'rimmed-straight',
      set: { 'case.length.alternatives': [{ value: -1, cite: CITE }] },
      expected: ['units case.length.alternatives[0]'],
    },
    {
      name: 'a tolerance of zero is allowed (only a negative one is refused)',
      shape: 'rimmed-straight',
      set: { 'case.length.tolerance': { minus: 0, plus: 0 } },
      expected: [],
    },
  ])('$name', ({ shape, set, expected }) => {
    expect([...new Set(issuesAfter(shape, set))]).toEqual(expected);
  });

  it.each([
    { name: 'on the left of a comparison', shape: 'rimmed-straight', path: 'case.rim.diameter' },
    { name: 'on the right of a comparison', shape: 'rimmed-straight', path: 'overallLength.max' },
    { name: 'as the rim of a rimless head', shape: 'rimless-bottleneck', path: 'case.rim.diameter' },
    { name: 'as the head diameter of a rimless head', shape: 'rimless-bottleneck', path: 'case.body.diameterAtHead' },
  ] as const)('an unsourced (null) value $name drops its comparisons instead of failing them', ({ shape, path }) => {
    const json = edited(shape, `${path}.value`, null);
    setPath(json, `${path}.note`, 'not printed by the source');
    expect(issues(json)).toEqual([]);
  });

  it('treats a sum with an unsourced part as unknown, not as the sum of the rest', () => {
    // The groove end is rim thickness + groove width. With the thickness unknown, the groove width
    // alone (1) would not fit before a body start of 0.5, but the sum is unknown so nothing is compared.
    expect(
      issuesAfter('rimless-bottleneck', {
        'case.rim.thickness.value': null,
        'case.rim.thickness.note': 'not printed by the source',
        'case.bodyStart.value': 0.5,
      }),
    ).toEqual([]);
  });

  it('accepts only real calendar dates written YYYY-MM-DD', () => {
    const wrong = ['2026-02-30', '2026-13-05', '2026-00-10', '2026-1-1', ' 2026-10-01', '2026-10-01 '];
    for (const retrieved of wrong) {
      expect(sourceIssues({ retrieved }), retrieved).toEqual(['sources sources.synthetic.retrieved']);
    }
    for (const retrieved of ['2024-02-29', '2026-12-31']) {
      expect(sourceIssues({ retrieved }), retrieved).toEqual([]);
    }
  });

  it('accepts only an http(s) URL for a real source', () => {
    for (const url of ['ftp://example.org/x', 'see the library', ' https://example.org', 'xhttps://example.org']) {
      expect(sourceIssues({ reliability: 'standard', url }), url).toEqual(['sources sources.synthetic.url']);
    }
    for (const url of ['http://example.org/x', 'https://example.org/x']) {
      expect(sourceIssues({ reliability: 'standard', url }), url).toEqual([]);
    }
  });

  it('accepts any text as the URL of a synthetic source', () => {
    expect(sourceIssues({ url: 'none' })).toEqual([]);
  });

  it('accepts a SHA-256 only as exactly 64 lowercase hex digits', () => {
    const wrong = ['abc', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), `x${'a'.repeat(64)}`, `${'a'.repeat(64)}x`];
    for (const sha256 of wrong) {
      expect(sourceIssues({ sha256 }), sha256).toEqual(['sources sources.synthetic.sha256']);
    }
    expect(sourceIssues({ sha256: '0123456789abcdef'.repeat(4) })).toEqual([]);
  });

  it('treats a note of only whitespace as no note on an unsourced value', () => {
    const json = edited('rimmed-straight', 'case.length.value', null);
    setPath(json, 'case.length.note', '   ');
    expect(issues(json)).toEqual(['sourced-values case.length']);
    setPath(json, 'case.length.note', 'not printed by the source');
    expect(issues(json)).toEqual([]);
  });
});
