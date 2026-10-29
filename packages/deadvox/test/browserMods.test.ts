import { isDeepStrictEqual } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type BrowserMod, evaluateMods, MAX_MOD_BYTES } from '../src/game/browserMods.ts';
// biome-ignore lint/performance/noNamespaceImport: the malformed-input test spies on the content-build boundary
import * as bundledContent from '../src/game/bundledContent.ts';
import { configFromUrl } from '../src/game/config.ts';
import { createWorldSetup } from '../src/game/worldSetup.ts';
import { ChunkMeshes } from '../src/render/chunks.ts';
import { reuseBundledBuilds } from './bundledContentReuse.ts';
import fixture from './fixtures/mods/browser-mod.json' with { type: 'json' };

const base = bundledContent.buildBundledContent();
reuseBundledBuilds();
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const mod = (data: unknown): BrowserMod => ({ source: 'fixture.json', text: JSON.stringify(data), enabled: true });

describe('browser mod admission', () => {
  it('refuses malformed JSON without changing admitted base content', () => {
    vi.spyOn(bundledContent, 'buildBundledContent').mockReturnValue(base);
    const result = evaluateMods([{ source: 'broken.json', text: '{', enabled: true }]);
    expect(result.canStart).toBe(false);
    expect(result.issues.get('broken.json')).toEqual([
      expect.objectContaining({ source: 'broken.json', path: '', message: expect.any(String) }),
    ]);
    expect(result.content.origins).toEqual(base.origins);
  });
  it('refuses a missing mod id without admitting its definitions', () => {
    const { id: _id, ...data } = fixture;
    const result = evaluateMods([mod(data)]);
    expect(result.canStart).toBe(false);
    expect(result.issues.get('fixture.json')).toEqual([
      expect.objectContaining({ path: 'id', message: expect.stringContaining('required') }),
    ]);
    expect(isDeepStrictEqual(result.content.origins, base.origins)).toBe(true);
  });

  it('refuses a duplicate mod id across sources without replacing admitted definitions', () => {
    const first = mod(fixture);
    const duplicate = {
      ...mod({ ...fixture, items: [{ ...fixture.items[0], name: 'Duplicate replacement' }] }),
      source: 'https://example.test/same-mod.json',
    };
    const result = evaluateMods([first, duplicate]);
    expect(result.issues.get(duplicate.source)).toEqual([
      expect.objectContaining({ path: 'id', message: expect.stringContaining(fixture.id) }),
    ]);
    expect(result.canStart).toBe(false);
    expect(result.content.origins.get(`items:${fixture.items[0]!.id}`)?.source).toBe(first.source);
    expect(result.content.registry.items.get(fixture.items[0]!.id)?.name).toBe(fixture.items[0]!.name);
    expect(result.issues.has(first.source)).toBe(false);
  });

  it('allows startup with a disabled duplicate while showing its clash', () => {
    const result = evaluateMods([mod(fixture), { ...mod(fixture), source: 'disabled.json', enabled: false }]);
    expect(result.canStart).toBe(true);
    expect(result.issues.get('disabled.json')).toEqual([
      expect.objectContaining({ path: 'id', message: expect.stringContaining(fixture.id) }),
    ]);
  });

  it('allows different mod ids to override the same definitions', () => {
    const result = evaluateMods([
      mod(fixture),
      {
        ...mod({ ...fixture, id: 'different-mod', items: [{ ...fixture.items[0], name: 'Distinct override' }] }),
        source: 'override.json',
      },
    ]);
    expect(result.canStart).toBe(true);
    expect(result.content.origins.get(`items:${fixture.items[0]!.id}`)?.source).toBe('override.json');
    expect(result.content.registry.items.get(fixture.items[0]!.id)?.name).toBe('Distinct override');
  });
  it('caps UTF-8 bytes rather than character count before parsing', () => {
    const oversized = mod({ items: [{ ...fixture.items[0], description: 'é'.repeat(MAX_MOD_BYTES / 2) }] });
    expect(oversized.text.length).toBeLessThan(MAX_MOD_BYTES);
    const result = evaluateMods([oversized]);
    expect(result.canStart).toBe(false);
    expect(result.issues.get(oversized.source)?.length).toBeGreaterThan(0);
    expect(result.content.origins).toEqual(base.origins);
  });
  it('passes the added item and winning zombie speed into the startup world', () => {
    const data = fixture;
    const result = evaluateMods([mod(data)]);
    expect(result.canStart).toBe(true);
    expect(result.admitted).toEqual([
      { id: data.id, version: '1', data: { items: data.items, zombies: data.zombies } },
    ]);
    expect(result.content.registry.items.has(data.items[0]!.id)).toBe(true);
    const zombie = data.zombies[0]!;
    expect(result.content.registry.zombies.get(zombie.id)?.speed).toEqual(zombie.speed);
    expect(result.content.origins.get(`zombies:${zombie.id}`)?.source).toBe('fixture.json');
    vi.stubGlobal(
      'Worker',
      class {
        postMessage() {
          /* No mesh work is requested by this startup contract. */
        }
      },
    );
    const config = configFromUrl(new URLSearchParams('site=testHouse'), result.content);
    const meshes = new ChunkMeshes(config.scale.blockSize, result.content.registry);
    const world = createWorldSetup(config, meshes);
    expect(world.registry).toBe(result.content.registry);
  });

  it('rejects the whole broken file with issues without changing base content', () => {
    const data = fixture;
    const broken = mod({ ...data, items: [...data.items, { id: 'broken' }] });
    const result = evaluateMods([broken]);
    expect(result.canStart).toBe(false);
    expect(result.issues.get('fixture.json')?.length).toBeGreaterThan(0);
    expect(result.content.registry.items.size).toBe(base.registry.items.size);
    expect(result.content.registry.zombies.get(data.zombies[0]!.id)).toEqual(
      base.registry.zombies.get(data.zombies[0]!.id),
    );
    expect(result.content.origins).toEqual(base.origins);
    expect(base.registry.items.has(data.items[0]!.id)).toBe(false);
  });

  it('allows base-content startup after disabling a broken file while preserving its issues', () => {
    const broken = mod({ ...fixture, items: [...fixture.items, { id: 'broken' }] });
    const disabled = evaluateMods([{ ...broken, enabled: false }]);
    expect(disabled.canStart).toBe(true);
    expect(disabled.admitted).toEqual([]);
    expect(disabled.issues.get(broken.source)?.length).toBeGreaterThan(0);
    expect(disabled.content.origins).toEqual(base.origins);
    const config = configFromUrl(new URLSearchParams('site=testHouse'), disabled.content);
    expect(config.content.registry).toBe(disabled.content.registry);
  });
});
