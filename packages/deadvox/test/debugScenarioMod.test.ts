import { buildRegistry } from '@skelly/engine/content';
import { placementOf } from '@skelly/engine/internal/core/authoredPlacement.ts';
import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { placedBlockAt } from '@skelly/engine/internal/core/templates.ts';
import { playerTuning } from '@skelly/engine/internal/game/player.ts';
import { Inventory } from '@skelly/engine/inventory';
import { admitPacks, bundledModIdsFromUrl, selectBundledMods } from '@skelly/engine/packs';
import { makeScale, placedPoint, toChunk } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import debugMod from '../mods/skelly.deadvox.scenario.test-house.debug/layouts.json' with { type: 'json' };
import debugManifest from '../mods/skelly.deadvox.scenario.test-house.debug/pack/manifest.json' with { type: 'json' };
import lookManifest from '../mods/skelly.deadvox.scenario.test-house.rubble-look/pack/manifest.json' with {
  type: 'json',
};
import { bundledPackInputs } from '../src/product/content.ts';
import { productModIntake } from '../src/product/mods.ts';
import { readAvailablePacks, readBundledPacks } from '../tools/readBundledPacks.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';
import { content as baseContent, makeConfig } from './fixtures/startupContent.ts';

const selected = withReusedBuilds(() =>
  selectBundledMods(productModIntake, bundledModIdsFromUrl(new URLSearchParams({ mods: debugManifest.id }))),
);

const totals = (items: { item: string; count: number; condition: number; liquidContents?: unknown }[]) => {
  const result = new Map<string, number>();
  for (const { count, ...state } of items) {
    const key = JSON.stringify(state);
    result.set(key, (result.get(key) ?? 0) + count);
  }
  return result;
};

// Registry builds are bounded CPU work whose duration scales with machine load, so a timer only turns a busy
// machine into a failure.
describe('authored debug scenario mod', { timeout: 0 }, () => {
  // Selection supplies the default stack, which would hide a row whose owner the debug mod does not declare.
  const debugPacks = readAvailablePacks('.').filter(({ manifest }) => manifest.optIn);

  it('finds the selected debug mod among the opt-in packs', () => {
    expect(debugPacks.map(({ manifest }) => manifest.id)).toContain(debugManifest.id);
  });

  // Each closure admits the whole actor stack, so one test per mod keeps a failure pointing at its mod.
  it.each(debugPacks.map((pack) => [pack.manifest.id, pack.files] as const))(
    'builds debug mod %s from its own closure and keeps the catalogue rows it declares',
    (id, files) => {
      const admitted = admitPacks(readBundledPacks('.', id));
      expect(admitted.issues).toEqual([]);
      const { registry, issues } = buildRegistry(admitted.sources);
      expect(issues).toEqual([]);
      const rows = files.flatMap(({ data }) => (data as { catalogueRows?: { id: string }[] }).catalogueRows ?? []);
      for (const { id: row } of rows) {
        expect(registry.catalogueRows.has(row), row).toBe(true);
      }
    },
  );

  it('loads the test-house debug mod together with another selected opt-in folder mod', () => {
    const other = debugPacks.find(({ manifest }) => manifest.id !== debugManifest.id);
    expect(other).toBeDefined();
    const owners = debugPacks.filter(({ manifest }) => manifest.id === debugManifest.id).concat(other!);
    const ids = owners.map(({ manifest }) => manifest.id);
    const both = withReusedBuilds(() =>
      selectBundledMods(productModIntake, bundledModIdsFromUrl(new URLSearchParams({ mods: ids.join(',') }))),
    );
    expect(both.issues).toEqual([]);
    expect(both.admitted.map(({ id }) => id).sort()).toEqual([...ids].sort());
    for (const { manifest, files } of owners) {
      for (const { data } of files) {
        for (const { id } of (data as { catalogueRows?: { id: string }[] }).catalogueRows ?? []) {
          expect(both.content.registry.catalogueRows.has(id), `${manifest.id} ${id}`).toBe(true);
        }
      }
    }
  });

  it('admits its fixture start when a debug link names the pack', async () => {
    const { configFromUrl } = await import('@skelly/engine/session');
    const { ragdollSweepViewer } = await import('../src/product/ragdoll.ts');
    const query = new URLSearchParams({ 'start-mod': debugManifest.id, mods: debugManifest.id });
    const linked = selectBundledMods(productModIntake, bundledModIdsFromUrl(query), [], {
      form: 'id',
      id: debugManifest.id,
    });
    expect(linked.issues).toEqual([]);
    const config = configFromUrl(query, { debug: true }, linked.content, ragdollSweepViewer);
    expect(config.startId).toBe(linked.content.startModStart);
    expect(config.site).toBe(linked.content.registry.starts.get(config.startId)?.site);
  });

  // The rubble look's whole staging is the heap its layout stands in front of the spawn; a row that points
  // anywhere else leaves the look without its check, so its geometry is checked here rather than by eye.
  it("stands the rubble look heap's eye-height row in front of the spawn", () => {
    const admitted = admitPacks(readBundledPacks('.', lookManifest.id));
    expect(admitted.issues).toEqual([]);
    const { registry, issues } = buildRegistry(admitted.sources);
    expect(issues).toEqual([]);
    const layout = registry.layouts.get('testHouseRubbleLook')!;
    const heap = layout.buildings.find(({ template }) => template === 'test_house_rubble_heap')!;
    const placement = placementOf(registry, heap, layout.lootContext);
    const block = (cell: readonly number[]): string | undefined => {
      const id = placedBlockAt(placement, [...cell] as [number, number, number]);
      return id === undefined ? undefined : registry.blocks[id]!.id;
    };
    const feet = layout.player.position.map((value) => value / 0.5);
    const eye = Math.floor(feet[1]! + playerTuning(baseContent.registry).eye / 0.5);
    // In front at eye height: the aimed row is rubble, every cell between it and the spawn is air, and the
    // heap keeps a full solid face below, so the look starts on cover that only take apart clears.
    const aimed: [number, number, number] = [Math.floor(feet[0]!), eye, Math.floor(feet[2]!) - 3];
    expect(block(aimed)).toBe('masonry_rubble');
    for (let z = aimed[2] + 1; z <= Math.floor(feet[2]!); z += 1) {
      expect(block([aimed[0], aimed[1], z])).toBe('air');
    }
    for (let y = aimed[1] - 3; y < aimed[1]; y += 1) {
      expect(block([aimed[0], y, aimed[2]])).toBe('masonry_rubble');
    }
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
