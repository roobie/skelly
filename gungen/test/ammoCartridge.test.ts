import { describe, expect, it } from 'vitest';
import { collectNodes, unsourcedPaths } from '../src/ammo/measures.ts';
import { formatCartridgeParseError, parseCartridge, parseCartridgeJson } from '../src/ammo/parseCartridge.ts';
import { checkRelations, validateCartridge } from '../src/ammo/rules.ts';
import {
  cartridgeFiles,
  type Json,
  type JsonObject,
  loadCartridgeFile,
  loadCartridges,
  mustParse,
  type ShotshellShape,
  SYNTHETIC_METALLIC_SHAPES,
  SYNTHETIC_SHOTSHELL_SHAPES,
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
    expect([...heads].sort()).toEqual(['belted', 'rebated', 'rimless', 'rimmed', 'semi-rimmed']);
    expect([...bodies].sort()).toEqual(['bottleneck', 'straight']);
  });

  it('accepts a head type with a straight body and a bottleneck body alike (rimmed both ways)', () => {
    for (const shape of ['rimmed-straight', 'rimmed-bottleneck'] as const) {
      expect(validateCartridge(mustParse(syntheticJson(shape)))).toEqual([]);
    }
  });

  it.each(SYNTHETIC_SHOTSHELL_SHAPES)('synthetic %s is a valid, fully sourced shotshell', (shape) => {
    const cartridge = mustParse(syntheticJson(shape));
    expect(cartridge.kind).toBe('shotshell');
    expect(validateCartridge(cartridge)).toEqual([]);
    expect(unsourcedPaths(cartridge)).toEqual([]);
  });

  it('models the two shotshell payloads as shot (count and pellet size) and slug', () => {
    const buck = mustParse(syntheticJson('shotshell-buck'));
    const slug = mustParse(syntheticJson('shotshell-slug'));
    expect(buck.kind === 'shotshell' && buck.payload.type).toBe('shot');
    expect(slug.kind === 'shotshell' && slug.payload.type).toBe('slug');
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

  it('expresses .38 Special firing in a .357 Magnum chamber but not the other way', () => {
    const special = syntheticNamed('rimmed-straight', 'synthetic-38-special', [
      { cartridge: 'synthetic-357-magnum', relation: 'safe-in-chamber-of' },
    ]);
    const magnum = syntheticNamed('rimmed-straight', 'synthetic-357-magnum', [
      { cartridge: 'synthetic-38-special', relation: 'unsafe-in-chamber-of' },
    ]);
    expect(checkRelations([special, magnum])).toEqual([]);
    expect(special.relatedTo[0]).toMatchObject({ cartridge: 'synthetic-357-magnum', relation: 'safe-in-chamber-of' });
    expect(magnum.relatedTo[0]).toMatchObject({ cartridge: 'synthetic-38-special', relation: 'unsafe-in-chamber-of' });
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

describe('parse', () => {
  it('reports the path of a missing required field', () => {
    expect(parseErrorOf(edited('rimmed-straight', 'case.bodyStart'))).toBe('case.bodyStart: missing required field');
  });

  it('refuses an unknown key rather than dropping it', () => {
    expect(parseErrorOf(edited('rimmed-straight', 'case.toleranec', 1))).toBe('case.toleranec: unknown field');
  });

  it('requires the extractor groove for a rimless head and refuses it on a rimmed head', () => {
    expect(parseErrorOf(edited('rimless-straight', 'case.head.extractorGroove'))).toBe(
      'case.head.extractorGroove: missing required field',
    );
    const groove = { diameter: { value: 1, cite: null }, width: { value: 1, cite: null } };
    expect(parseErrorOf(edited('rimmed-straight', 'case.head.extractorGroove', groove))).toBe(
      'case.head.extractorGroove: unknown field',
    );
  });

  it('refuses an unknown kind, head type and format', () => {
    expect(parseErrorOf({ ...syntheticJson('rimmed-straight'), kind: 'rimfire' })).toContain('kind');
    expect(parseErrorOf(edited('rimmed-straight', 'case.head.type', 'flanged'))).toContain('case.head.type');
    expect(parseErrorOf({ ...syntheticJson('rimmed-straight'), format: 2 })).toContain('unsupported format 2');
  });

  it('requires a null value to be written out, not left out', () => {
    expect(parseErrorOf(edited('rimmed-straight', 'case.length.value'))).toBe(
      'case.length.value: missing required field',
    );
  });

  it('loads a structurally valid file whose physics is absurd, and leaves judging it to the rules', () => {
    const json = edited('rimmed-straight', 'case.length.value', 500);
    expect([...new Set(issues(json))]).toEqual(['lengths case.length']);
  });
});
