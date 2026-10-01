import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectNodes, unsourcedPaths } from '../src/ammo/measures.ts';
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
} from './ammoHelpers.ts';

const issues = (raw: unknown): string[] =>
  validateCartridge(mustParse(raw)).map((issue) => `${issue.rule} ${issue.path}`);

describe('cartridge files', () => {
  it('has at least the first cartridge', () => {
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

  it('cites C.I.P. for every primary case and bullet dimension and records SAAMI as the alternative', () => {
    const { measures } = collectNodes(cartridge);
    const fromElsewhere = ['overallLength.typical', 'payload.length.min', 'payload.length.max'];
    const dimensions = measures.filter(
      ({ unit, path, node }) => unit !== 'grains' && !fromElsewhere.includes(path) && node.value !== null,
    );
    expect(dimensions.length).toBeGreaterThan(15);
    for (const { path, node } of dimensions) {
      expect(node.cite?.source, path).toBe('cip');
    }
    const rimDiameter = measures.find(({ path }) => path === 'case.rim.diameter')?.node;
    expect(rimDiameter?.cite?.source).toBe('cip');
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

describe('case shapes', () => {
  it.each(SYNTHETIC_METALLIC_SHAPES)('synthetic %s is valid and fully sourced', (shape) => {
    const cartridge = mustParse(syntheticJson(shape));
    expect(cartridge.kind).toBe('metallic');
    expect(validateCartridge(cartridge)).toEqual([]);
    expect(unsourcedPaths(cartridge)).toEqual([]);
  });

  it('covers every head type and both body shapes', () => {
    const shapes = SYNTHETIC_METALLIC_SHAPES.map((shape) => mustParse(syntheticJson(shape)));
    const heads = new Set(shapes.flatMap((c) => (c.kind === 'metallic' ? [c.case.head.type] : [])));
    const bodies = new Set(shapes.flatMap((c) => (c.kind === 'metallic' ? [c.case.body.type] : [])));
    expect([...heads].sort()).toEqual(['rimless', 'rimmed']);
    expect([...bodies].sort()).toEqual(['bottleneck', 'straight']);
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

  it('needs no absolute size limits: a shape holds from a few mm to a .50 BMG-sized round', () => {
    // Scale every length of a valid synthetic round; the rules compare, they never cap.
    for (const factor of [0.4, 1, 2.6]) {
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

  it('refuses a pair declared both safe and unsafe, an unknown cartridge and a self-reference', () => {
    const both = syntheticNamed('rimmed-straight', 'synthetic-a', [
      { cartridge: 'synthetic-b', relation: 'safe-in-chamber-of' },
      { cartridge: 'synthetic-b', relation: 'unsafe-in-chamber-of' },
    ]);
    const other = syntheticNamed('rimmed-straight', 'synthetic-b', [
      { cartridge: 'synthetic-missing', relation: 'same-external-dimensions' },
      { cartridge: 'synthetic-b', relation: 'same-external-dimensions' },
    ]);
    const found = checkRelations([both, other]).map((issue) => issue.message);
    expect(found).toHaveLength(3);
    expect(found.join('\n')).toContain('both safe and unsafe');
    expect(found.join('\n')).toContain("unknown cartridge 'synthetic-missing'");
    expect(found.join('\n')).toContain('related to itself');
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

describe('parse', () => {
  it.each(ALL_SHAPES)(
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

  it.each(ALL_SHAPES)(
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
    const files = cartridgeFiles().map((file) => readJson(join(CARTRIDGES, file)));
    for (const json of [...ALL_SHAPES.map(syntheticJson), withEveryOptionalField(), ...files]) {
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
      name: 'a string for a number',
      path: 'case.length.value',
      value: '40',
      message: 'case.length.value: expected a finite number, got a string',
    },
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
    { name: 'null for an object', path: 'case.rim', value: null, message: 'case.rim: expected an object, got null' },
    {
      name: 'a list for an object',
      path: 'case.rim',
      value: [],
      message: 'case.rim: expected an object, got an array',
    },
    {
      name: 'a number for the head',
      path: 'case.head',
      value: 5,
      message: 'case.head: expected an object, got a number',
    },
    {
      name: 'a value outside an enumeration',
      path: 'case.materials[0].value',
      value: 'wood',
      message:
        "case.materials[0].value: expected one of brass, steel, lacquered-steel, polymer-coated-steel, aluminium; got 'wood'",
    },
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

  it('refuses an unknown kind and format, and any head type it does not model (belted, rebated, semi-rimmed)', () => {
    expect(parseErrorOf({ ...syntheticJson('rimmed-straight'), kind: 'rimfire' })).toContain('kind');
    expect(parseErrorOf({ ...syntheticJson('rimmed-straight'), format: 2 })).toContain('unsupported format 2');
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
