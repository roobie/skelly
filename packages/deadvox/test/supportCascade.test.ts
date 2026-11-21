import { CanonicalTerrain } from '@skelly/engine/internal/core/canonicalTerrain.ts';
import type { ColumnSource } from '@skelly/engine/internal/core/site.ts';
import type { BlockBox } from '@skelly/engine/internal/core/structure.ts';
import { createSupport, terrainSupportView } from '@skelly/engine/internal/core/structureSupport.ts';
import { simSeconds } from '@skelly/engine/internal/core/time.ts';
import { decodeSave, type SaveSnapshot } from '@skelly/engine/save';
import { createSession, IDLE } from '@skelly/engine/session';
import { createTerrainEvaluator, type TerrainPlan, type Vec3, World } from '@skelly/engine/world';
import { contentLookup } from '@skelly/presentation/ui';
import { describe, expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { blockMaterialFixture, fixtureBlockMaterial } from './blockMaterialFixture.ts';
import { encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const scale = { blockSize: 0.5, minCy: 0, maxCy: 0 };
const Z = 3;
const POST = 'support_cascade_post';
const BEAM = 'support_cascade_beam';
const GROUND = 'support_cascade_ground';
const RUBBLE = 'support_cascade_rubble';

const fixtureRegistry = (cascadeCellsPerTick?: number) => {
  const registry = baseRegistry();
  const material = (id: string, span: number) => {
    registry.blockMaterials.set(id, { ...fixtureBlockMaterial(RUBBLE), id, span, breakable: true });
  };
  material('support_cascade_post_material', 0);
  material('support_cascade_beam_material', 2);
  for (const [id, of] of [
    [GROUND, 'support_cascade_post_material'],
    [POST, 'support_cascade_post_material'],
    [BEAM, 'support_cascade_beam_material'],
    [RUBBLE, 'support_cascade_beam_material'],
  ] as const) {
    registry.blockIds.set(id, registry.blocks.length);
    registry.blocks.push({ id, name: id, material: of, solid: true, color: '#888888' });
  }
  for (const sound of blockMaterialFixture(RUBBLE).sounds) {
    registry.sounds.set(sound.id, {
      ...sound,
      minIntervalSimSeconds: simSeconds(0),
      category: 'world',
      pitchJitter: [1, 1],
      gainJitter: [1, 1],
    });
  }
  if (cascadeCellsPerTick !== undefined) {
    const [tuning] = registry.supportTuning.values();
    registry.supportTuning.set(tuning!.id, { ...tuning!, cascadeCellsPerTick });
  }
  return registry;
};

const column = (x: number, top: number, block: number): BlockBox => ({
  min: [x, 1, Z],
  max: [x + 1, top + 1, Z + 1],
  block,
});
const row = (x0: number, x1: number, y: number, block: number): BlockBox => ({
  min: [x0, y, Z],
  max: [x1 + 1, y + 1, Z + 1],
  block,
});

/**
 * Natural ground fills y = 0. Post A stands at x = 2 and holds beams at y = 3 out to x = 4. Post Q stands at x = 9;
 * post R stands at x = 11 under the beam run at y = 3 from x = 10 to 13, whose far end is anchored only by R. Posts
 * drop into rubble below their old position, so losing R's standing top removes its sideways anchor.
 */
const structures = (registry: ReturnType<typeof fixtureRegistry>, neighbour: boolean): BlockBox[] => {
  const post = registry.blockIds.get(POST)!;
  const beam = registry.blockIds.get(BEAM)!;
  return [
    column(2, 3, post),
    row(3, 4, 3, beam),
    column(9, 3, post),
    column(11, 2, post),
    row(10, 13, 3, beam),
    // A grounded column beside post A: rubble of span 2 next to it is held, though the post it fell from was not.
    ...(neighbour ? [column(3, 2, post)] : []),
  ];
};

const fixture = (
  cascadeCellsPerTick?: number,
  restored?: Readonly<SaveSnapshot>,
  neighbour = false,
  layout: typeof structures = structures,
) => {
  const registry = fixtureRegistry(cascadeCellsPerTick);
  const world = new World();
  const ground = registry.blockIds.get(GROUND)!;
  const terrain: TerrainPlan = {
    seed: 7,
    scale,
    blocks: { grass: ground, dirt: ground, rock: ground, sand: ground, water: ground },
    shape: {
      minHeightMetres: 0,
      maxHeightMetres: 0,
      beachBelowMetres: 0,
      dirtDepthMetres: 1,
      featureSizeMetres: 1,
      octaves: 1,
    },
    site: {
      kind: 'weathering-pad',
      data: {
        blockSize: scale.blockSize,
        padTop: 0,
        heightPad: { x0: 0, x1: 0, z0: 0, z1: 0 },
        materialPad: { x0: 0, x1: 0, z0: 0, z1: 0 },
        concrete: ground,
        structures: [],
      },
    },
    structures: layout(registry, neighbour),
  };
  const canonical = new CanonicalTerrain(world, createTerrainEvaluator(terrain));
  const source: ColumnSource = {
    furnitureIn: () => [],
    lootPointsIn: () => [],
    supplySourcesIn: () => [],
    actorsIn: () => [],
  };
  const session = createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world,
    scale,
    seed: 7,
    start: 43_200,
    spawn: [20, 1, 20],
    terrainDestruction: { terrain: canonical, source },
    isSolid: (x, y, z) => registry.blocks[world.getBlock(x, y, z)]!.solid,
    isOpaque: (x, y, z) => registry.blocks[world.getBlock(x, y, z)]!.solid,
    ready: () => false,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
    ...(restored ? { restore: restored } : {}),
  });
  const block = (cell: Vec3) => registry.blocks[canonical.getBlock(...cell)]!.id;
  const tick = (ticks = 1) => session.sim.scheduler.advance(ticks * session.sim.scheduler.stepOf('support', 1));
  const strike = (cell: Vec3) => session.strikeTerrainCell(cell, { strength: 100, kind: 'blunt' });
  /** Every standing structure cell in the fixture's row, rubble aside, with whether support holds it. */
  const standing = () => {
    const support = createSupport(registry, terrainSupportView(canonical));
    const cells: { cell: Vec3; held: boolean }[] = [];
    for (let y = 1; y < 8; y++) {
      for (let x = 0; x < 16; x++) {
        const cell: Vec3 = [x, y, Z];
        if (canonical.getBlock(...cell) !== 0 && block(cell) !== RUBBLE) {
          cells.push({ cell, held: support.holds(cell) });
        }
      }
    }
    return cells;
  };
  const snapshot = () => session.snapshot({ worldId: 'support-fixture', characterId: 'support-character' });
  return { registry, world, canonical, session, block, tick, strike, standing, snapshot };
};
type Fixture = ReturnType<typeof fixture>;

const reload = async (f: Fixture, cascadeCellsPerTick?: number, neighbour = false) => {
  const decoded = await decodeSave(await encodeFixture(f.snapshot()), {
    version: formatVersion,
    contentLookup: (...query) => contentLookup(f.registry, ...query),
  });
  return fixture(cascadeCellsPerTick, decoded.snapshot, neighbour);
};

/** The fixture row's blocks, so two runs can be compared cell by cell. */
const rowBlocks = (f: Fixture) =>
  Array.from({ length: 7 }, (_row, y) => Array.from({ length: 16 }, (_cell, x) => f.block([x, y + 1, Z])));

/** Ticks until the cascade ends; the bound only stops a cascade that never would. */
const settle = (f: Fixture) => {
  for (let ticks = 0; ticks < 4096 && f.world.support.cascading; ticks++) {
    f.tick();
  }
  if (f.world.support.cascading) {
    throw new Error('Cascade did not end');
  }
};

describe('support cascade', () => {
  it('drops broken dependants onto the first solid below instead of leaving rubble suspended', () => {
    const f = fixture();
    expect(f.strike([2, 1, Z])).toBe(true);
    settle(f);
    for (const cell of [
      [2, 1, Z],
      [2, 2, Z],
      [3, 1, Z],
      [4, 1, Z],
    ] as Vec3[]) {
      expect(f.block(cell)).toBe(RUBBLE);
    }
    for (const cell of [
      [2, 3, Z],
      [3, 3, Z],
      [4, 3, Z],
    ] as Vec3[]) {
      expect(f.canonical.getBlock(...cell)).toBe(0);
    }
    expect(f.standing().filter(({ held }) => !held)).toEqual([]);
    expect(f.block([9, 3, Z])).toBe(POST);
  });

  it('drops landed rubble again when a later strike removes the post it landed on', () => {
    const f = fixture(undefined, undefined, false, (registry) => [
      column(2, 5, registry.blockIds.get(POST)!),
      row(3, 4, 5, registry.blockIds.get(BEAM)!),
      column(4, 3, registry.blockIds.get(POST)!),
    ]);
    expect(f.strike([2, 1, Z])).toBe(true);
    settle(f);
    expect(f.block([4, 4, Z])).toBe(RUBBLE);
    expect(f.block([4, 3, Z])).toBe(POST);
    expect(f.strike([4, 1, Z])).toBe(true);
    settle(f);
    expect(f.canonical.getBlock(4, 4, Z)).toBe(0);
    expect(f.block([4, 3, Z])).toBe(RUBBLE);
    expect(f.block([4, 2, Z])).toBe(RUBBLE);
    expect(createSupport(f.registry, terrainSupportView(f.canonical)).holds([4, 3, Z])).toBe(true);
    expect(f.standing().filter(({ held }) => !held)).toEqual([]);
  });

  it('drops a run whose only anchor stays up but no longer stands', () => {
    const f = fixture();
    expect(f.strike([11, 1, Z])).toBe(true);
    settle(f);
    // The beam over the broken post is still held sideways by post Q, yet it anchors nothing now.
    expect(f.block([11, 3, Z])).toBe(BEAM);
    expect(f.block([13, 1, Z])).toBe(RUBBLE);
    expect(f.canonical.getBlock(13, 3, Z)).toBe(0);
    expect(f.standing().filter(({ held }) => !held)).toEqual([]);
  });

  it('judges each cell by the blocks standing after earlier falls, so the batch size never changes the outcome', async () => {
    const run = async (cap: number | undefined, reloadAfterFirstTick: boolean) => {
      let f = fixture(cap, undefined, true);
      expect(f.strike([2, 1, Z])).toBe(true);
      f.tick();
      if (reloadAfterFirstTick) {
        f = await reload(f, cap, true);
      }
      settle(f);
      return f;
    };
    const batch = await run(undefined, false);
    expect(batch.block([2, 2, Z])).toBe(RUBBLE);
    expect(batch.canonical.getBlock(2, 3, Z)).toBe(0);
    for (const other of await Promise.all([run(1, false), run(1, true)])) {
      expect(rowBlocks(other)).toEqual(rowBlocks(batch));
    }
  });

  it('stops at its per-tick cap and continues on the next tick', () => {
    const f = fixture(1);
    expect(f.strike([2, 1, Z])).toBe(true);
    const fallen = () => [2, 3, 4].filter((x) => f.block([x, 1, Z]) === RUBBLE).length;
    f.tick();
    expect(f.block([2, 1, Z])).toBe(RUBBLE);
    expect(fallen()).toBe(1);
    expect(f.world.support.cascading).toBe(true);
    settle(f);
    expect(fallen()).toBe(3);
  });

  it('keeps placed marks and a cut-short cascade through save and reload, ending as an uncut one does', async () => {
    const whole = fixture();
    expect(whole.strike([2, 1, Z])).toBe(true);
    settle(whole);
    const cut = fixture(1);
    cut.canonical.ensureCell(6, 1, Z);
    cut.world.setBlock(6, 1, Z, cut.registry.blockIds.get(POST)!);
    cut.world.support.markPlaced([6, 1, Z]);
    expect(cut.strike([2, 1, Z])).toBe(true);
    cut.tick();
    expect(cut.world.support.cascading).toBe(true);
    const restored = await reload(cut);
    expect(restored.world.support.isPlaced([6, 1, Z])).toBe(true);
    expect(restored.world.support.snapshotState()).toEqual(cut.world.support.snapshotState());
    settle(restored);
    for (let x = 0; x < 16; x++) {
      for (let y = 1; y < 8; y++) {
        if (x !== 6) {
          expect([x, y, restored.block([x, y, Z])]).toEqual([x, y, whole.block([x, y, Z])]);
        }
      }
    }
  });
});
