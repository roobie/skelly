import { describe, expect, it } from 'vitest';
import type { Design } from '../src/core/design.ts';
import { type DesignLoadInputs, loadDesign, loadDesignValue } from '../src/core/designLoader.ts';
import { generateValid } from '../src/core/generate.ts';
import type { Assembly } from '../src/core/schema.ts';
import type { Template } from '../src/core/template.ts';
import { gunDomain } from '../src/gun/domain.ts';
import type { PrefabCatalogue } from '../src/gun/prefabs.ts';
import { ar } from '../src/gun/templates.ts';
import { loadFixture } from './helpers.ts';

/** A test catalogue; the real content belongs to 3.1. Two revisions of one id coexist. */
const catalogue: PrefabCatalogue = [
  { id: 'test-stanag', version: 1, family: 'magazine', fixedParams: { length: 'M', profile: 'stanag-curved' } },
  { id: 'test-stanag', version: 2, family: 'magazine', fixedParams: { length: 'L', profile: 'stanag-curved' } },
];

const generated = generateValid(ar, gunDomain, 1);
if (!generated) {
  throw new Error('the ar template must generate a valid assembly');
}
const baseAssembly: Assembly = generated.assembly;

const makeDesign = (overrides: Partial<Design> = {}): Design => ({
  format: 1,
  template: 'ar',
  assembly: baseAssembly,
  locks: { params: { barrel: ['length'] }, optionalParts: ['sight'] },
  status: 'published',
  origin: { template: 'ar', seed: generated.seed, overrides: { params: {}, presence: {} } },
  ...overrides,
});

const inputs = (over: Partial<DesignLoadInputs> = {}): DesignLoadInputs => ({
  domain: gunDomain,
  template: ar,
  prefabs: catalogue,
  ...over,
});

const load = (value: unknown, over: Partial<DesignLoadInputs> = {}) => loadDesignValue(value, inputs(over));

const withPart = (part: Assembly['parts'][string], id = 'magazine'): Assembly => ({
  ...baseAssembly,
  parts: { ...baseAssembly.parts, [id]: part },
});

const expectFatal = (result: ReturnType<typeof load>) => {
  if (result.ok) {
    throw new Error('expected a fatal load error');
  }
  return result;
};

describe('loadDesign: parse and round trip', () => {
  it('loads a clean design with no issues and keeps declaredStatus', () => {
    const design = makeDesign();
    const result = load(design);
    expect(result).toEqual({ ok: true, declaredStatus: 'published', design, issues: [] });
  });

  it('round-trips through JSON text', () => {
    const design = makeDesign({ status: 'draft' });
    const result = loadDesign(JSON.stringify(design), inputs());
    expect(result).toEqual({ ok: true, declaredStatus: 'draft', design, issues: [] });
    if (result.ok) {
      expect(loadDesign(JSON.stringify(result.design), inputs())).toEqual(result);
    }
  });

  it('stores only chosen values: nothing is materialised on load', () => {
    const result = load(makeDesign());
    if (!result.ok) {
      throw new Error('expected a load');
    }
    expect(result.design.assembly).toEqual(baseAssembly);
    // Template-only choices are materialized; inherited and default params are not.
    expect(result.design.assembly.parts.lower?.params).toEqual({ layout: 'ar' });
    const mount = result.design.assembly.parts.handguard?.params?.mount;
    if (mount === 'clamped') {
      expect(result.design.assembly.parts['front-sight']).toEqual({ family: 'front-sight', params: { style: 'ar' } });
      expect(result.design.assembly.parts['rail-front-sight']).toBeUndefined();
    } else {
      expect(result.design.assembly.parts['front-sight']).toBeUndefined();
      const railSight = result.design.assembly.parts['rail-front-sight'];
      expect(railSight === undefined || railSight.family === 'rail-front-sight').toBe(true);
    }
  });

  it('omits an absent origin', () => {
    const { origin: _origin, ...withoutOrigin } = makeDesign();
    const result = load(withoutOrigin);
    expect(result.ok && 'origin' in result.design).toBe(false);
  });
});

describe('loadDesign: fatal errors', () => {
  it('reports invalid JSON, with no declared status', () => {
    const result = expectFatal(loadDesign('{ nope', inputs()));
    expect(result.error.code).toBe('invalid-json');
    expect(result.declaredStatus).toBeUndefined();
  });

  it.each([
    ['not an object', 3, undefined, ''],
    ['no template', { ...makeDesign(), template: undefined }, 'published', 'template'],
    ['no locks', { ...makeDesign(), locks: undefined }, 'published', 'locks'],
    [
      'bad lock params',
      { ...makeDesign(), locks: { params: { a: [1] }, optionalParts: [] } },
      'published',
      'locks.params.a[0]',
    ],
    [
      'bad optional locks',
      { ...makeDesign(), locks: { params: {}, optionalParts: 'sight' } },
      'published',
      'locks.optionalParts',
    ],
    ['unknown status', { ...makeDesign(), status: 'archived' }, undefined, 'status'],
    ['no status', { ...makeDesign(), status: undefined }, undefined, 'status'],
    ['a malformed assembly', { ...makeDesign(), assembly: { name: 'x' } }, 'published', 'assembly.root'],
    ['bad origin', { ...makeDesign(), origin: { template: 'ar' } }, 'published', 'origin.seed'],
    ['no format', { ...makeDesign(), format: undefined }, 'published', 'format'],
  ])('refuses a design with %s as invalid-shape', (_label, value, declared, path) => {
    const result = expectFatal(load(value));
    expect(result.error.code).toBe('invalid-shape');
    expect(result.error.path).toBe(path);
    expect(result.declaredStatus).toBe(declared);
  });

  it.each([0, 2, 1.5, -1, '1', null, true])('refuses format version %j', (format) => {
    const result = expectFatal(load({ ...makeDesign(), format }));
    expect(result.error.code).toBe('unsupported-format');
    expect(result.error.path).toBe('format');
    expect(result.declaredStatus).toBe('published');
  });

  it('refuses an unknown prefab id', () => {
    const assembly = withPart({ family: 'magazine', prefab: { id: 'nope', version: 1 } });
    const result = expectFatal(load(makeDesign({ assembly })));
    expect(result.error.code).toBe('unknown-prefab');
    expect(result.error.path).toBe('assembly.parts.magazine.prefab');
    expect(result.declaredStatus).toBe('published');
  });

  it.each([3, 99])('refuses an unknown version %d of a known prefab id', (version) => {
    const assembly = withPart({ family: 'magazine', prefab: { id: 'test-stanag', version } });
    expect(expectFatal(load(makeDesign({ assembly }))).error.code).toBe('unknown-prefab');
  });
});

describe('loadDesign: change policy', () => {
  it('a family default change leaves a design untouched: defaults are never stored', () => {
    const family = gunDomain.families.barrel;
    if (!family?.params.length) {
      throw new Error('barrel.length expected');
    }
    const changed = {
      ...gunDomain,
      families: {
        ...gunDomain.families,
        barrel: { ...family, params: { ...family.params, length: { ...family.params.length, default: 'L' } } },
      },
    };
    const design = makeDesign({
      assembly: { ...baseAssembly, parts: { ...baseAssembly.parts, barrel: { family: 'barrel' } } },
    });
    const before = load(design);
    const after = load(design, { domain: changed });
    expect(before.ok && after.ok && after.design).toEqual(before.ok && before.design);
    expect(after.ok && after.design.assembly.parts.barrel).toEqual({ family: 'barrel' });
  });

  it('a default change that makes the design infeasible loads as a draft with issues', () => {
    // Removing a required connection stands in for a default change that breaks feasibility.
    const assembly: Assembly = {
      ...baseAssembly,
      connections: baseAssembly.connections.filter((c) => c.from !== 'receiver.barrel'),
    };
    const result = load(makeDesign({ assembly }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.declaredStatus).toBe('published');
      expect(result.design.status).toBe('draft');
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.every((i) => i.code === 'infeasible')).toBe(true);
      expect(result.design.assembly).toEqual(assembly);
    }
  });

  it('runs domain rules on placed parts when one part is disconnected', () => {
    const parts = {
      ...baseAssembly.parts,
      receiver: { ...baseAssembly.parts.receiver!, params: { ...baseAssembly.parts.receiver?.params, feed: 'tube' } },
    };
    const assembly: Assembly = {
      ...baseAssembly,
      parts,
      connections: baseAssembly.connections.filter((connection) => connection.from !== 'receiver.barrel'),
    };
    const result = load(makeDesign({ status: 'draft', assembly }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.declaredStatus).toBe('draft');
      expect(result.design.status).toBe('draft');
      expect(
        result.issues.some((issue) => issue.message.startsWith('[feed-match]') && issue.parts?.includes('lower')),
      ).toBe(true);
      expect(result.issues.some((issue) => issue.message.includes('not connected to the root'))).toBe(true);
    }
  });

  it('a fully placed but rule-breaking design is infeasible with the rule named', () => {
    const result = load(makeDesign({ assembly: loadFixture('broken-keep-out') }));
    expect(result.ok && result.issues.some((i) => i.code === 'infeasible' && i.message.startsWith('[keep-out]'))).toBe(
      true,
    );
  });

  it('a template change: a value the template no longer offers loads as a draft', () => {
    const narrowed: Template = {
      ...ar,
      slots: ar.slots.map((s) => (s.id === 'barrel' ? { ...s, params: { length: 'S' } } : s)),
    };
    const design = makeDesign({
      assembly: withPart({ family: 'barrel', params: { length: 'M' } }, 'barrel'),
    });
    const result = load(design, { template: narrowed });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const stale = result.issues.filter((i) => i.code === 'template-choice');
      expect(stale).toHaveLength(1);
      expect(stale[0]).toMatchObject({ path: 'assembly.parts.barrel.params.length', parts: ['barrel'] });
      expect(result.design.status).toBe('draft');
      expect(result.declaredStatus).toBe('published');
      expect(result.design.assembly.parts.barrel?.params?.length).toBe('M');
    }
  });

  it('a template change: a part or family the template lacks is a stale choice', () => {
    const noStock: Template = { ...ar, slots: ar.slots.filter((s) => s.id !== 'stock') };
    const result = load(makeDesign(), { template: noStock });
    expect(result.ok && result.issues.some((i) => i.code === 'template-choice' && i.parts?.includes('stock'))).toBe(
      true,
    );
  });

  it('a design for a different template than the one supplied is a stale choice', () => {
    const result = load(makeDesign({ template: 'ak' }));
    expect(result.ok && result.issues.some((i) => i.code === 'template-choice' && i.path === 'template')).toBe(true);
  });

  it('a param the template does not list is a designer choice, not a stale one', () => {
    const barrel = baseAssembly.parts.barrel!;
    const assembly = withPart({ ...barrel, params: { ...barrel.params, profile: 'heavy' } }, 'barrel');
    const result = load(makeDesign({ assembly }));
    expect(result.ok && result.issues.filter((i) => i.code === 'template-choice')).toEqual([]);
  });

  it('a prefab mismatch loads as a draft naming the mismatched param', () => {
    const assembly = withPart({
      family: 'magazine',
      params: { length: 'S', profile: 'stanag-curved' },
      prefab: { id: 'test-stanag', version: 1 },
    });
    const result = load(makeDesign({ assembly }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const mismatches = result.issues.filter((i) => i.code === 'prefab-values-mismatch');
      expect(mismatches).toHaveLength(1);
      expect(mismatches[0]?.parts).toEqual(['magazine']);
      expect(mismatches[0]?.path).toBe('assembly.parts.magazine.params.length');
      expect(mismatches[0]?.message).toContain('length');
      expect(result.design.status).toBe('draft');
      expect(result.design.assembly.parts.magazine?.prefab).toEqual({ id: 'test-stanag', version: 1 });
    }
  });

  it('a missing prefab-fixed param and a wrong family are mismatches too', () => {
    const missing = load(
      makeDesign({ assembly: withPart({ family: 'magazine', prefab: { id: 'test-stanag', version: 2 } }) }),
    );
    expect(missing.ok && missing.issues.filter((i) => i.code === 'prefab-values-mismatch')).toHaveLength(2);
    const wrongFamily = load(
      makeDesign({
        assembly: withPart(
          {
            family: 'grip',
            params: { length: 'M', profile: 'stanag-curved' },
            prefab: { id: 'test-stanag', version: 1 },
          },
          'grip',
        ),
      }),
    );
    expect(
      wrongFamily.ok &&
        wrongFamily.issues.some((i) => i.code === 'prefab-values-mismatch' && i.path?.endsWith('.family')),
    ).toBe(true);
  });

  it('a matching prefab loads clean', () => {
    const assembly = withPart({
      family: 'magazine',
      params: { length: 'M', profile: 'stanag-curved' },
      prefab: { id: 'test-stanag', version: 1 },
    });
    const result = load(makeDesign({ assembly }));
    expect(result.ok && result.issues).toEqual([]);
  });

  it('prefab lookup uses the registry key, not PartDef.family', () => {
    // The registry key names the builder recipe; keyed by it, the catalogue entry matches.
    const family = gunDomain.families.magazine;
    expect(family).toBeDefined();
    const entry = { id: 'keyed', version: 1, family: 'magazine', fixedParams: { length: 'M' } };
    const assembly = withPart({ family: 'magazine', params: { length: 'M' }, prefab: { id: 'keyed', version: 1 } });
    expect(load(makeDesign({ assembly }), { prefabs: [entry] }).ok).toBe(true);
  });
});

describe('loadDesign: declaredStatus on a published-but-invalid file', () => {
  it('keeps declaredStatus published while the loaded status is draft', () => {
    const assembly: Assembly = { ...baseAssembly, connections: [] };
    const result = loadDesign(JSON.stringify(makeDesign({ status: 'published', assembly })), inputs());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.declaredStatus).toBe('published');
      expect(result.design.status).toBe('draft');
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it('keeps a declared draft as draft', () => {
    const assembly: Assembly = { ...baseAssembly, connections: [] };
    const result = load(makeDesign({ status: 'draft', assembly }));
    expect(result.ok && result.declaredStatus).toBe('draft');
  });
});
