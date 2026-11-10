import { isDeepStrictEqual } from 'node:util';
import { type BrowserMod, evaluateMods } from '@skelly/engine/packs';
import { configFromUrl } from '@skelly/engine/session';
import { createWorldSetup } from '@skelly/engine/world';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { productContent } from '../src/product/content.ts';
import { productModIntake } from '../src/product/mods.ts';
import { ragdollSweepViewer } from '../src/product/ragdoll.ts';
import { ChunkMeshes } from '../src/render/chunks.ts';
import { reuseBundledBuilds } from './bundledContentReuse.ts';
import fixture from './fixtures/mods/browser-mod.json' with { type: 'json' };
import { quietMesherSource } from './fixtures/quietMesherSource.ts';

const { maxModBytes } = productModIntake;
const base = productContent.buildBundledContent();
reuseBundledBuilds();
afterEach(() => {
  vi.restoreAllMocks();
});
const mod = (data: unknown): BrowserMod => ({ source: 'fixture.json', text: JSON.stringify(data), enabled: true });

describe('browser mod admission', () => {
  it('refuses malformed JSON without changing admitted base content', () => {
    vi.spyOn(productContent, 'buildBundledContent').mockReturnValue(base);
    const result = evaluateMods(productModIntake, [{ source: 'broken.json', text: '{', enabled: true }]);
    expect(result.canStart).toBe(false);
    expect(result.issues.get('broken.json')).toEqual([
      expect.objectContaining({ source: 'broken.json', path: '', message: expect.any(String) }),
    ]);
    expect(result.content.origins).toEqual(base.origins);
  });
  it('refuses a missing mod id without admitting its definitions', () => {
    const { id: _id, ...data } = fixture;
    const result = evaluateMods(productModIntake, [mod(data)]);
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
    const result = evaluateMods(productModIntake, [first, duplicate]);
    expect(result.issues.get(duplicate.source)).toEqual([
      expect.objectContaining({ path: 'id', message: expect.stringContaining(fixture.id) }),
    ]);
    expect(result.canStart).toBe(false);
    expect(result.content.origins.get(`items:${fixture.items[0]!.id}`)?.source).toBe(`${first.source}/content.json`);
    expect(result.content.registry.items.get(fixture.items[0]!.id)?.name).toBe(fixture.items[0]!.name);
    expect(result.issues.has(first.source)).toBe(false);
  });

  it('refuses a figure from a content-only mod, which declares no figure files', () => {
    const figure = {
      id: 'player.999999',
      body: '../../outside.body.json',
      clips: 'missing.clips.json',
      mesh: 'missing.glb',
    };
    const result = evaluateMods(productModIntake, [mod({ ...fixture, actorFigures: [figure] })]);
    expect(result.canStart).toBe(false);
    expect(result.issues.get('fixture.json')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'files', message: expect.stringContaining(`${figure.id} body`) }),
        expect.objectContaining({ path: 'files', message: expect.stringContaining(`${figure.id} clips`) }),
        expect.objectContaining({ path: 'files', message: expect.stringContaining(`${figure.id} mesh`) }),
      ]),
    );
  });

  it('allows startup with a disabled duplicate while showing its clash', () => {
    const result = evaluateMods(productModIntake, [
      mod(fixture),
      { ...mod(fixture), source: 'disabled.json', enabled: false },
    ]);
    expect(result.canStart).toBe(true);
    expect(result.issues.get('disabled.json')).toEqual([
      expect.objectContaining({ path: 'id', message: expect.stringContaining(fixture.id) }),
    ]);
  });

  it('allows a different mod to override a declared dependency entry', () => {
    const result = evaluateMods(productModIntake, [
      mod(fixture),
      {
        ...mod({
          ...fixture,
          id: 'different-mod',
          dependencies: [...fixture.dependencies, fixture.id],
          overrides: [
            ...fixture.overrides,
            { pack: fixture.id, entry: `items:${fixture.items[0]!.id}` },
            { pack: fixture.id, entry: `actors:${fixture.actors[0]!.id}` },
          ],
          items: [{ ...fixture.items[0], name: 'Distinct override' }],
        }),
        source: 'override.json',
      },
    ]);
    expect(result.canStart).toBe(true);
    expect(result.content.origins.get(`items:${fixture.items[0]!.id}`)?.source).toBe('override.json/content.json');
    expect(result.content.registry.items.get(fixture.items[0]!.id)?.name).toBe('Distinct override');
  });
  it('caps UTF-8 bytes rather than character count before parsing', () => {
    const oversized = mod({ items: [{ ...fixture.items[0], description: 'é'.repeat(maxModBytes / 2) }] });
    expect(oversized.text.length).toBeLessThan(maxModBytes);
    const result = evaluateMods(productModIntake, [oversized]);
    expect(result.canStart).toBe(false);
    expect(result.issues.get(oversized.source)?.length).toBeGreaterThan(0);
    expect(result.content.origins).toEqual(base.origins);
  });
  it('passes the added item and winning zombie speed into the startup world', () => {
    const data = fixture;
    const result = evaluateMods(productModIntake, [mod(data)]);
    expect(result.canStart).toBe(true);
    expect(result.admitted).toEqual([
      {
        id: data.id,
        version: data.version,
        data: {
          manifest: {
            id: data.id,
            version: data.version,
            tier: data.tier,
            product: data.product,
            dependencies: data.dependencies,
            overrides: data.overrides,
            files: [{ path: 'content.json', kind: 'content' }],
          },
          content: { items: data.items, actors: data.actors },
        },
      },
    ]);
    expect(result.content.registry.items.has(data.items[0]!.id)).toBe(true);
    const actor = data.actors[0]!;
    expect(result.content.registry.actors.get(actor.id)?.speed).toEqual(actor.speed);
    expect(result.content.origins.get(`actors:${actor.id}`)?.source).toBe('fixture.json/content.json');
    const config = configFromUrl(new URLSearchParams('site=testHouse'), result.content, ragdollSweepViewer);
    const meshes = new ChunkMeshes(config.scale.blockSize, result.content.registry);
    const world = createWorldSetup(config, meshes, quietMesherSource());
    expect(world.registry).toBe(result.content.registry);
  });

  it('rejects the whole broken file with issues without changing base content', () => {
    const data = fixture;
    const broken = mod({ ...data, items: [...data.items, { id: 'broken' }] });
    const result = evaluateMods(productModIntake, [broken]);
    expect(result.canStart).toBe(false);
    expect(result.issues.get('fixture.json')?.length).toBeGreaterThan(0);
    expect(result.content.registry.items.size).toBe(base.registry.items.size);
    expect(result.content.registry.actors.get(data.actors[0]!.id)).toEqual(
      base.registry.actors.get(data.actors[0]!.id),
    );
    expect(result.content.origins).toEqual(base.origins);
    expect(base.registry.items.has(data.items[0]!.id)).toBe(false);
  });

  it('allows base-content startup after disabling a broken file while preserving its issues', () => {
    const broken = mod({ ...fixture, items: [...fixture.items, { id: 'broken' }] });
    const disabled = evaluateMods(productModIntake, [{ ...broken, enabled: false }]);
    expect(disabled.canStart).toBe(true);
    expect(disabled.admitted).toEqual([]);
    expect(disabled.issues.get(broken.source)?.length).toBeGreaterThan(0);
    expect(disabled.content.origins).toEqual(base.origins);
    const config = configFromUrl(new URLSearchParams('site=testHouse'), disabled.content, ragdollSweepViewer);
    expect(config.content.registry).toBe(disabled.content.registry);
  });
});
