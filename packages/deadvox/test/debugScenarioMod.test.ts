import { describe, expect, it } from 'vitest';
import debugMod from '../mods/skelly.deadvox.scenario.test-house.debug/layouts.json' with { type: 'json' };
import debugManifest from '../mods/skelly.deadvox.scenario.test-house.debug/pack/manifest.json' with { type: 'json' };
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { toChunk } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { makeScale } from '../src/core/scale.ts';
import { placedPoint } from '../src/core/templates.ts';
import { bundledPackInputs } from '../src/game/bundledContent.ts';
import { bundledModIdsFromUrl, selectBundledMods } from '../src/game/bundledMods.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';
import { content as baseContent, makeConfig } from './fixtures/startupContent.ts';

const selected = withReusedBuilds(() =>
  selectBundledMods(bundledModIdsFromUrl(new URLSearchParams({ mods: debugManifest.id }))),
);

const totals = (items: { item: string; count: number; condition: number; liquidContents?: unknown }[]) => {
  const result = new Map<string, number>();
  for (const { count, ...state } of items) {
    const key = JSON.stringify(state);
    result.set(key, (result.get(key) ?? 0) + count);
  }
  return result;
};

describe('authored debug scenario mod', () => {
  it('admits its selected rows and resolves every listed reference', () => {
    expect(selected.issues).toEqual([]);
    expect(selected.admittedFolderPacks.map(({ id }) => id)).toEqual([debugManifest.id]);
    expect(selected.admitted).toEqual([]);
  });

  it('stays out of the default packs and content unless selected', () => {
    expect(bundledPackInputs.some(({ manifest }) => manifest.id === debugManifest.id)).toBe(false);
    const [template] = debugMod.templates;
    expect(baseContent.registry.templates.has(template!.id)).toBe(false);
    expect(selected.content.registry.templates.has(template!.id)).toBe(true);
  });

  it('keeps authored fixed stock inside the startup ring independently of landscape bounds', () => {
    expect(selected.issues).toEqual([]);
    const { registry } = selected.content;
    const config = makeConfig(13, 64);
    let checked = false;
    for (const declared of debugMod.layouts) {
      const layout = registry.layouts.get(declared.id)!;
      const site = new AuthoredSite(config.seed, registry, config.scale, {
        ...layout,
        bounds: { ...layout.bounds, x1: layout.bounds.x1 + 100 },
      });
      const [sx, , sz] = site.spawn.pos.map((value) => value / config.scale.blockSize);
      for (const [index, building] of layout.buildings.entries()) {
        for (const fixed of building.fixedLoot ?? []) {
          checked = true;
          const [x, , z] = placedPoint(site.placements[index]!, fixed.at);
          const distance = Math.max(Math.abs(toChunk(x) - toChunk(sx!)), Math.abs(toChunk(z) - toChunk(sz!)));
          expect(distance).toBeLessThanOrEqual(config.readyRadiusChunks);
        }
      }
    }
    expect(checked).toBe(true);
  });

  it('delivers its fixed stock through ordinary authored spawns without a debug flag', () => {
    expect(selected.issues).toEqual([]);
    const { registry } = selected.content;
    let checked = false;
    for (const declared of debugMod.layouts) {
      const layout = registry.layouts.get(declared.id)!;
      const site = new AuthoredSite(43, registry, makeScale(0.5), layout);
      const inventory = new Inventory(registry);
      for (const [index, building] of layout.buildings.entries()) {
        for (const fixed of building.fixedLoot ?? []) {
          checked = true;
          const position = placedPoint(site.placements[index]!, fixed.at);
          const spawn = site
            .furnitureIn(toChunk(position[0]), toChunk(position[2]))
            .find(({ spec }) => spec.pos.every((value, axis) => value === position[axis]));
          expect(spawn).toBeDefined();
          const point = site
            .lootPointsIn(toChunk(position[0]), toChunk(position[2]))
            .find(({ destination }) => destination.every((value, axis) => value === position[axis]));
          expect(point?.fixture).toBe(true);
          const entity = inventory.furnishSpawn(spawn!)!;
          const actual = [...inventory.items()].flatMap(({ item, location }) =>
            location.kind === 'furniture' && location.entity === entity
              ? [{ item: item.type, count: item.count, condition: item.condition, liquidContents: item.liquidContents }]
              : [],
          );
          expect(totals(actual)).toEqual(
            totals(
              fixed.items.map((item) => ({
                item: item.item,
                count: item.count ?? 1,
                condition: item.condition ?? 1,
                liquidContents: item.liquidContents,
              })),
            ),
          );
        }
      }
    }
    expect(checked).toBe(true);
  });
});
