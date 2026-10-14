import { afterEach, describe, expect, it, vi } from 'vitest';
import { type BrowserMod, evaluateMods, MAX_MOD_BYTES } from '../src/game/browserMods.ts';
import { buildBundledContent } from '../src/game/bundledContent.ts';
import { configFromUrl } from '../src/game/config.ts';
import { createWorldSetup } from '../src/game/worldSetup.ts';
import { ChunkMeshes } from '../src/render/chunks.ts';
import fixture from './fixtures/mods/browser-mod.json' with { type: 'json' };

const base = buildBundledContent();
afterEach(() => vi.unstubAllGlobals());
const mod = (data: unknown): BrowserMod => ({ source: 'fixture.json', text: JSON.stringify(data), enabled: true });

describe('browser mod admission', () => {
  it('caps UTF-8 bytes rather than character count before parsing', () => {
    const oversized = { ...mod({}), text: 'é'.repeat(MAX_MOD_BYTES / 2 + 1) };
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
    const result = evaluateMods([mod({ ...data, items: [...data.items, { id: 'broken' }] })]);
    expect(result.canStart).toBe(false);
    expect(result.issues.get('fixture.json')?.length).toBeGreaterThan(0);
    expect(result.content.registry.items.size).toBe(base.registry.items.size);
    expect(result.content.registry.zombies.get(data.zombies[0]!.id)).toEqual(
      base.registry.zombies.get(data.zombies[0]!.id),
    );
    expect(result.content.origins).toEqual(base.origins);
    expect(base.registry.items.has(data.items[0]!.id)).toBe(false);
  });
});
