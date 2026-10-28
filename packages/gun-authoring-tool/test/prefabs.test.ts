import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrefabReference } from '@skelly/engine/assembly/schema.ts';
import { describe, expect, it } from 'vitest';
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

describe('gun prefab catalogue', () => {
  it('uses geometry-distinct STANAG lengths for 20 and 30 rounds', () => {
    const family = FAMILIES.magazine!;
    const build = (id: string) => {
      const entry = GUN_PREFABS.find((prefab) => prefab.id === id)!;
      const params = Object.fromEntries(Object.entries(family.params).map(([name, spec]) => [name, spec.default]));
      return family.build({ ...params, ...entry.fixedParams });
    };
    expect(build('stanag-20').solids).not.toEqual(build('stanag-30').solids);
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

  it('loads design prefab references with their catalogue-owned fixed values', () => {
    for (const name of ['archetype-ar', 'archetype-ak']) {
      const design = readDesign(name);
      const magazine = design.assembly.parts.magazine!;
      const prefab = GUN_PREFABS.find(
        (entry) => entry.id === magazine.prefab?.id && entry.version === magazine.prefab?.version,
      );
      expect(prefab, name).toBeDefined();
      expect(magazine.params).toMatchObject(prefab?.fixedParams ?? {});
      const result = load(design);
      expect(result.ok && result.issues, name).toEqual([]);
    }
  });
});
