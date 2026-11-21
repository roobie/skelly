import { buildRegistry, type Registry, requireDayCycle } from '@skelly/engine/content';
import { placementOf } from '@skelly/engine/internal/core/authoredPlacement.ts';
import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { coreMessage } from '@skelly/engine/internal/core/coreText.ts';
import { bindReach } from '@skelly/engine/internal/core/reach.ts';
import { rubbleBlockIds } from '@skelly/engine/internal/core/rubble.ts';
import { furnitureOf } from '@skelly/engine/internal/core/site.ts';
import { createSupport } from '@skelly/engine/internal/core/structureSupport.ts';
import { type Placement, placedBlockAt, placedPieces } from '@skelly/engine/internal/core/templates.ts';
import { playerTuning } from '@skelly/engine/internal/game/player.ts';
import { doorPlan, Inventory } from '@skelly/engine/inventory';
import {
  admitPacks,
  bundledModIdsFromUrl,
  compareCodeUnits,
  type PackInput,
  selectBundledMods,
} from '@skelly/engine/packs';
import { makeScale, placedPoint, raycast, toChunk, type Vec3 } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import buildKitLookManifest from '../mods/skelly.deadvox.scenario.test-house.build-kit-look/pack/manifest.json' with {
  type: 'json',
};
import cellRepairLookManifest from '../mods/skelly.deadvox.scenario.test-house.cell-repair-look/pack/manifest.json' with {
  type: 'json',
};
import debugMod from '../mods/skelly.deadvox.scenario.test-house.debug/layouts.json' with { type: 'json' };
import debugManifest from '../mods/skelly.deadvox.scenario.test-house.debug/pack/manifest.json' with { type: 'json' };
import lookManifest from '../mods/skelly.deadvox.scenario.test-house.rubble-look/pack/manifest.json' with {
  type: 'json',
};
import supportLookManifest from '../mods/skelly.deadvox.scenario.test-house.support-look/pack/manifest.json' with {
  type: 'json',
};
import { bundledPackInputs } from '../src/product/content.ts';
import { productModIntake } from '../src/product/mods.ts';
import { readAvailablePacks, readBundledPacks } from '../tools/readBundledPacks.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';
import { content as baseContent, makeConfig } from './fixtures/startupContent.ts';
import { sweepGroup } from './sweeps.ts';

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

/**
 * A look start's first aim as it is played, from the selected start's own content: feet and eye from the site, the
 * aim along the spawn's yaw to the first solid cell within the debug tool's reach, and whether the command's own
 * admission reach, chest to that cell, admits it.
 */
const lookAim = async (id: string) => {
  const { configFromUrl } = await import('@skelly/engine/session');
  const { ragdollSweepViewer } = await import('../src/product/ragdoll.ts');
  const query = new URLSearchParams({ 'start-mod': id, mods: id });
  const linked = withReusedBuilds(() =>
    selectBundledMods(productModIntake, bundledModIdsFromUrl(query), [], { form: 'id', id }),
  );
  const config = configFromUrl(query, { debug: true }, linked.content, ragdollSweepViewer);
  const { registry } = linked.content;
  const site = new AuthoredSite(config.seed, registry, config.scale, registry.layouts.get(config.site)!);
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
  const hit = raycast(eye, [-Math.sin(yaw), 0, -Math.cos(yaw)], tuning.debugBlockTool.reachMetres / blockSize, solid);
  if (!hit) {
    throw new Error('No aimed surface within the debug tool reach');
  }
  // A hit with no face normal started inside a solid cell, so the aim names no surface the tester sees.
  if (!hit.normal.some((value) => value !== 0)) {
    throw new Error('The aim starts inside a solid cell');
  }
  const inventory = new Inventory(registry);
  bindReach({ inventory, position: feet, blockSize, clock: { ratio: requireDayCycle(registry).clockRatio, start: 0 } });
  return {
    registry,
    site,
    solid,
    aimed: { cell: hit.block, block: standing(hit.block)! },
    reachable: inventory.canReachCell(hit.block),
  };
};

/**
 * The prop's cells above `aimed` that support holds while it stands and no longer holds once it breaks. The prop
 * stands on the lot's ground below its own bottom layer, which holds as natural terrain.
 */
const droppedByBreaking = (
  registry: Registry,
  placement: Placement,
  aimed: { readonly cell: Vec3; readonly block: number },
): Vec3[] => {
  const [ox, oy, oz] = placement.origin;
  const [sx, sy, sz] = placement.template.size;
  const inProp = (cell: Vec3) => placedBlockAt(placement, cell);
  const supportWithout = (removed?: Vec3) => {
    const gone = (x: number, y: number, z: number) =>
      removed !== undefined && x === removed[0] && y === removed[1] && z === removed[2];
    const block = (x: number, y: number, z: number) =>
      gone(x, y, z) ? 0 : (inProp([x, y, z]) ?? (y < oy ? aimed.block : 0));
    return createSupport(registry, {
      minY: oy - 1,
      maxY: oy + sy,
      block,
      natural: (x, y, z) => inProp([x, y, z]) === undefined && y < oy,
    });
  };
  const before = supportWithout();
  const after = supportWithout(aimed.cell);
  const cells = Array.from(
    { length: sx * sy * sz },
    (_, at): Vec3 => [ox + (at % sx), oy + Math.floor(at / (sx * sz)), oz + (Math.floor(at / sx) % sz)],
  );
  return cells.filter(
    (cell) =>
      cell[1] > aimed.cell[1] && registry.blocks[inProp(cell) ?? 0]!.solid && before.holds(cell) && !after.holds(cell),
  );
};

// Selection supplies the default stack, which would hide a row whose owner the debug mod does not declare.
const ownClosureFaults = ({ manifest, files }: PackInput): string[] => {
  const admitted = admitPacks(readBundledPacks('.', manifest.id));
  const { registry, issues } = buildRegistry(admitted.sources);
  const rows = files.flatMap(({ data }) => (data as { catalogueRows?: { id: string }[] }).catalogueRows ?? []);
  return [
    ...[...admitted.issues, ...issues].map(({ path, message }) => `${path}: ${message}`),
    ...rows.filter(({ id }) => !registry.catalogueRows.has(id)).map(({ id }) => `catalogue row ${id} did not load`),
  ];
};

describe('authored debug scenario mod', () => {
  const debugPacks = readAvailablePacks('.').filter(({ manifest }) => manifest.optIn);

  it('finds the selected debug mod among the opt-in packs', () => {
    expect(debugPacks.map(({ manifest }) => manifest.id)).toContain(debugManifest.id);
  });

  it('builds the test-house debug mod from its own closure and keeps the catalogue rows it declares', () => {
    expect(ownClosureFaults(debugPacks.find(({ manifest }) => manifest.id === debugManifest.id)!)).toEqual([]);
  });

  // Every other debug mod's closure is a whole registry build of its own, so together they outweigh the rest of the
  // file and run with the slow tests.
  sweepGroup('every other debug mod', () => {
    // Each closure admits the whole actor stack, so one test per mod keeps a failure pointing at its mod.
    it.each(debugPacks.filter(({ manifest }) => manifest.id !== debugManifest.id))(
      'builds debug mod $manifest.id from its own closure and keeps the catalogue rows it declares',
      (pack) => {
        expect(ownClosureFaults(pack)).toEqual([]);
      },
    );
  });

  it('loads the test-house debug mod together with another selected opt-in folder mod', () => {
    const other = debugPacks.find(({ manifest }) => manifest.id !== debugManifest.id);
    expect(other).toBeDefined();
    const owners = debugPacks.filter(({ manifest }) => manifest.id === debugManifest.id).concat(other!);
    const ids = owners.map(({ manifest }) => manifest.id);
    const both = withReusedBuilds(() =>
      selectBundledMods(productModIntake, bundledModIdsFromUrl(new URLSearchParams({ mods: ids.join(',') }))),
    );
    expect(both.issues).toEqual([]);
    expect(both.admitted.map(({ id }) => id).sort(compareCodeUnits)).toEqual([...ids].sort(compareCodeUnits));
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

  // The build-kit look's boarded door is template content carried to a live piece, so the staging is checked as the
  // property the look shows: every boarded door refuses from either face.
  it('stages build-kit look boarded doors that refuse opening from both faces', () => {
    const query = new URLSearchParams({ 'start-mod': buildKitLookManifest.id, mods: buildKitLookManifest.id });
    const linked = withReusedBuilds(() =>
      selectBundledMods(productModIntake, bundledModIdsFromUrl(query), [], { form: 'id', id: buildKitLookManifest.id }),
    );
    const { registry } = linked.content;
    const layout = registry.layouts.get('testHouseBuildKitLook')!;
    const room = layout.buildings.find(({ template }) => template === 'test_house_build_kit')!;
    const placement = placementOf(registry, room, layout.lootContext);
    const inventory = new Inventory(registry);
    const columns = new Set(placedPieces(placement).map(({ pos }) => `${toChunk(pos[0])},${toChunk(pos[2])}`));
    const doors = [...columns]
      .flatMap((column) => furnitureOf({ seed: 1, registry }, placement, column.split(',').map(Number) as never, []))
      .map(({ spec }) => inventory.entities.add(spec)!)
      .filter((entity) => entity.boarding);
    expect(doors.length).toBeGreaterThan(0);
    const feet = layout.player.position.map((value) => value / 0.5) as Vec3;
    // A point two blocks out from a door's middle on one face; the front is its facing side.
    const outward = { n: -1, s: 1, e: 1, w: -1 } as const;
    const across = (door: (typeof doors)[number]) => (door.facing === 'e' || door.facing === 'w' ? 0 : 2);
    const middle = (door: (typeof doors)[number]): Vec3 => [
      door.pos[0] + door.size[0] / 2,
      feet[1],
      door.pos[2] + door.size[2] / 2,
    ];
    const beside = (door: (typeof doors)[number], side: 'front' | 'back'): Vec3 => {
      const point = middle(door);
      point[across(door)] += 2 * outward[door.facing] * (side === 'front' ? 1 : -1);
      return point;
    };
    for (const door of doors) {
      for (const face of ['front', 'back'] as const) {
        inventory.actorPosition = () => beside(door, face);
        expect(doorPlan(inventory, door, 'open')).toMatchObject({
          ok: false,
          reason: coreMessage(registry, 'boardedUp'),
        });
      }
    }
  });

  // The rubble look's whole staging is the heap its start aims at, so its geometry is checked as the start's
  // own property — the aim meets clearable rubble the spawn can take apart — never as authored measurements.
  it('aims the rubble look start at rubble the spawn can take apart', async () => {
    const { registry, aimed, solid, reachable } = await lookAim(lookManifest.id);
    expect(rubbleBlockIds(registry).has(registry.blocks[aimed.block]!.id), registry.blocks[aimed.block]!.id).toBe(true);
    expect(solid(aimed.cell[0], aimed.cell[1] - 1, aimed.cell[2]), 'no solid support below the aimed rubble').toBe(
      true,
    );
    expect(reachable, 'aimed rubble out of reach').toBe(true);
  });

  // The support look's whole staging is the post its start aims at: breaking the aimed cell must leave both runs the
  // post holds unheld, so the aim is below them, never at a run or the post's top.
  it('aims the support look start at the post below both runs it holds', async () => {
    const { registry, site, aimed, reachable } = await lookAim(supportLookManifest.id);
    expect(reachable, 'aimed post out of reach').toBe(true);
    const placement = site.placements.find((candidate) => placedBlockAt(candidate, aimed.cell) === aimed.block)!;
    const dropped = droppedByBreaking(registry, placement, aimed);
    // Both runs drop: cells off the post's column along two different sideways directions.
    const directions = new Set(
      dropped
        .filter(([x, , z]) => x !== aimed.cell[0] || z !== aimed.cell[2])
        .map(([x, , z]) => `${Math.sign(x - aimed.cell[0])},${Math.sign(z - aimed.cell[2])}`),
    );
    expect(directions.size, JSON.stringify(dropped)).toBeGreaterThanOrEqual(2);
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
