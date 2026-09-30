import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PrefabReference } from '../src/core/schema.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { GUN_PREFABS } from '../src/gun/prefabs.ts';

interface TestDesign {
  readonly [key: string]: unknown;
  readonly assembly: {
    readonly parts: Record<string, { readonly [key: string]: unknown; prefab?: PrefabReference }>;
  };
}

const designPath = (name: string) => join(import.meta.dirname, '..', 'designs', `${name}.json`);
const readDesign = (name: string): TestDesign => JSON.parse(readFileSync(designPath(name), 'utf8')) as TestDesign;
const load = (design: TestDesign) => loadGunDesign(JSON.stringify(design));

const expected = [
  { id: 'stanag-20', version: 1, family: 'magazine', fixedParams: { length: 'M', profile: 'stanag-curved' } },
  { id: 'stanag-30', version: 1, family: 'magazine', fixedParams: { length: 'L', profile: 'stanag-curved' } },
  {
    id: 'ak74-30',
    version: 1,
    family: 'magazine',
    fixedParams: { length: 'L', profile: 'ak-curved', variant: 'ak74' },
  },
  {
    id: 'akm-30',
    version: 1,
    family: 'magazine',
    fixedParams: { length: 'L', profile: 'ak-curved', variant: 'akm' },
  },
  { id: 'octagonal-barrel', version: 1, family: 'barrel', fixedParams: { crossSection: 'octagonal' } },
] as const;

describe('gun prefab catalogue', () => {
  it('defines the STANAG and AK magazines and octagonal barrel from supported family values', () => {
    expect(GUN_PREFABS).toEqual(expected);
  });

  it('uses geometry-distinct STANAG lengths for 20 and 30 rounds', () => {
    const family = FAMILIES.magazine!;
    const build = (id: string) => {
      const entry = GUN_PREFABS.find((prefab) => prefab.id === id)!;
      const params = Object.fromEntries(Object.entries(family.params).map(([name, spec]) => [name, spec.default]));
      return family.build({ ...params, ...entry.fixedParams });
    };
    expect(build('stanag-20').solids).not.toEqual(build('stanag-30').solids);
  });

  it('builds a geometry-distinct octagonal barrel prefab', () => {
    const family = FAMILIES.barrel!;
    const entry = GUN_PREFABS.find((prefab) => prefab.id === 'octagonal-barrel')!;
    const params = Object.fromEntries(Object.entries(family.params).map(([name, spec]) => [name, spec.default]));
    const round = family.build(params);
    const octagonal = family.build({ ...params, ...entry.fixedParams });
    expect(octagonal.solids).not.toEqual(round.solids);
    expect(octagonal.solids[0]?.kind).toBe('extruded-polygon');
  });

  it('has valid unique ids and positive versions, and every entry builds', () => {
    const keys = GUN_PREFABS.map(({ id, version }) => `${id}@${version}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of GUN_PREFABS) {
      expect(Number.isInteger(entry.version) && entry.version > 0, entry.id).toBe(true);
      const family = FAMILIES[entry.family];
      expect(family, entry.id).toBeDefined();
      if (!family) {
        throw new Error(`Missing family ${entry.family}`);
      }
      const params = Object.fromEntries(Object.entries(family.params).map(([name, spec]) => [name, spec.default]));
      for (const [name, value] of Object.entries(entry.fixedParams)) {
        expect(family.params[name], `${entry.id}.${name}`).toBeDefined();
        expect(family.params[name]?.values, `${entry.id}.${name}`).toContain(value);
        params[name] = value;
      }
      expect(() => family.build(params), entry.id).not.toThrow();
    }
  });

  it('attaches only prefabs whose fixed values match the designs', () => {
    const ar = readDesign('archetype-ar');
    const arMagazine = ar.assembly.parts.magazine!;
    expect(arMagazine.params).toMatchObject({ length: 'M', profile: 'stanag-curved' });
    expect(arMagazine.prefab).toEqual({ id: 'stanag-20', version: 1 });
    const arLoad = load(ar);
    expect(arLoad.ok && arLoad.issues).toEqual([]);

    const ak = readDesign('archetype-ak');
    const akMagazine = ak.assembly.parts.magazine!;
    expect(akMagazine.params).toMatchObject({ length: 'L', profile: 'ak-curved', variant: 'ak74' });
    expect(akMagazine.prefab).toEqual({ id: 'ak74-30', version: 1 });
    const akLoad = load(ak);
    expect(akLoad.ok && akLoad.issues).toEqual([]);
  });

  it('rejects an unknown version of a known prefab id', () => {
    const design = readDesign('archetype-ar');
    design.assembly.parts.magazine!.prefab = { id: 'stanag-30', version: 2 };
    const result = load(design);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown-prefab');
      expect(result.error.message).toContain('version 2');
    }
  });

  it('loads a prefab values mismatch as a draft issue', () => {
    const design = readDesign('archetype-ak');
    design.assembly.parts.magazine!.prefab = { id: 'stanag-30', version: 1 };
    const result = load(design);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.declaredStatus).toBe('published');
      expect(result.design.status).toBe('draft');
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: 'prefab-values-mismatch',
          path: 'assembly.parts.magazine.params.profile',
        }),
      );
    }
  });
});
