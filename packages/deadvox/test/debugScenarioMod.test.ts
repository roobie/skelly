import { buildRegistry, requireDayCycle } from '@skelly/engine/content';
import { placementOf } from '@skelly/engine/internal/core/authoredPlacement.ts';
import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { bindReach } from '@skelly/engine/internal/core/reach.ts';
import { rubbleBlockIds } from '@skelly/engine/internal/core/rubble.ts';
import { placedBlockAt } from '@skelly/engine/internal/core/templates.ts';
import { playerTuning } from '@skelly/engine/internal/game/player.ts';
import { Inventory } from '@skelly/engine/inventory';
import { admitPacks, bundledModIdsFromUrl, selectBundledMods } from '@skelly/engine/packs';
import { makeScale, placedPoint, raycast, toChunk, type Vec3 } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import cellRepairLookManifest from '../mods/skelly.deadvox.scenario.test-house.cell-repair-look/pack/manifest.json' with {
  type: 'json',
};
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

  // The cell-repair look's whole staging is the damaged brick the start ships in front of the spawn; a cell that
  // points anywhere else refuses the start at boot, so its geometry is checked here rather than by eye.
  it("ships the cell-repair look start damage on the alcove brick at the spawn's eye height", () => {
    const admitted = admitPacks(readBundledPacks('.', cellRepairLookManifest.id));
    expect(admitted.issues).toEqual([]);
    const { registry, issues } = buildRegistry(admitted.sources);
    expect(issues).toEqual([]);
    const layout = registry.layouts.get('testHouseCellRepairLook')!;
    const alcove = layout.buildings.find(({ template }) => template === 'test_house_repair_alcove')!;
    const placement = placementOf(registry, alcove, layout.lootContext);
    const start = registry.starts.get('cellrepairlook')!;
    const block = (cell: readonly number[]): string | undefined => {
      const id = placedBlockAt(placement, [...cell] as [number, number, number]);
      return id === undefined ? undefined : registry.blocks[id]!.id;
    };
    const feet = layout.player.position.map((value) => value / 0.5);
    const eye = Math.floor(feet[1]! + playerTuning(baseContent.registry).eye / 0.5);
    const staged = start.blockDamage ?? [];
    expect(staged.length).toBeGreaterThan(0);
    for (const { cell } of staged) {
      expect(block(cell)).toBe('brick');
      expect(cell[0]).toBe(Math.floor(feet[0]!));
      expect(cell[1]).toBe(eye);
      // In front: every cell between the spawn and the brick is air, so nothing hides the crack.
      expect(cell[2]).toBeLessThan(Math.floor(feet[2]!));
      for (let z = cell[2] + 1; z <= Math.floor(feet[2]!); z += 1) {
        expect(block([cell[0], cell[1], z])).toBe('air');
      }
    }
  });

  // The rubble look's whole staging is the heap its start aims at, so its geometry is checked as the start's
  // own property — the aim meets clearable rubble the spawn can take apart — never as authored measurements.
  it('aims the rubble look start at rubble the spawn can take apart', async () => {
    const { configFromUrl } = await import('@skelly/engine/session');
    const { ragdollSweepViewer } = await import('../src/product/ragdoll.ts');
    const query = new URLSearchParams({ 'start-mod': lookManifest.id, mods: lookManifest.id });
    const linked = withReusedBuilds(() =>
      selectBundledMods(productModIntake, bundledModIdsFromUrl(query), [], { form: 'id', id: lookManifest.id }),
    );
    const config = configFromUrl(query, { debug: true }, linked.content, ragdollSweepViewer);
    const { registry } = linked.content;
    const site = new AuthoredSite(config.seed, registry, config.scale, registry.layouts.get(config.site)!);
    // Scale, pose and tuning all come from the selected start's own content: feet and eye from the site,
    // the aim from the spawn's yaw, the reach as the debug tool aims and the command admits.
    const { blockSize } = config.scale;
    const feet = site.spawn.pos.map((value) => value / blockSize) as Vec3;
    const tuning = playerTuning(registry);
    const eye: Vec3 = [feet[0], feet[1] + tuning.eye / blockSize, feet[2]];
    const { yaw } = site.spawn;
    const standing = (cell: Vec3): number | undefined => {
      for (const placement of site.placements) {
        const block = placedBlockAt(placement, cell);
        if (block !== undefined) {
          return block;
        }
      }
      return undefined;
    };
    const solid = (x: number, y: number, z: number): boolean => {
      const block = standing([x, y, z]);
      return block !== undefined && registry.blocks[block]!.solid;
    };
    // Aim as the look is played: the first solid cell on the sight line, within the debug tool's reach.
    const hit = raycast(eye, [-Math.sin(yaw), 0, -Math.cos(yaw)], tuning.debugBlockTool.reachMetres / blockSize, solid);
    expect(hit, 'no aimed surface within the debug tool reach').toBeDefined();
    const aimed = registry.blocks[standing(hit!.block)!]!;
    // The first solid cell on the sight line is the rubble itself — anything standing between would be that
    // first cell instead — and the heap keeps solid support below the row being cleared.
    expect(
      hit!.normal.some((value) => value !== 0),
      'the aim starts inside a solid cell',
    ).toBe(true);
    expect(rubbleBlockIds(registry).has(aimed.id), aimed.id).toBe(true);
    expect(solid(hit!.block[0], hit!.block[1] - 1, hit!.block[2]), 'no solid support below the aimed rubble').toBe(
      true,
    );
    // The take-apart command's own admission reach, chest to the aimed cell, as the session binds it.
    const inventory = new Inventory(registry);
    bindReach({
      inventory,
      position: feet,
      blockSize,
      clock: { ratio: requireDayCycle(registry).clockRatio, start: 0 },
    });
    expect(inventory.canReachCell(hit!.block), 'aimed rubble out of reach').toBe(true);
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
