import { CanonicalTerrain } from '@skelly/engine/internal/core/canonicalTerrain.ts';
import { snapshotItem } from '@skelly/engine/internal/core/items.ts';
import type { ColumnSource } from '@skelly/engine/internal/core/site.ts';
import type { BlockBox } from '@skelly/engine/internal/core/structure.ts';
import { createSupport, terrainSupportView } from '@skelly/engine/internal/core/structureSupport.ts';
import { simSeconds } from '@skelly/engine/internal/core/time.ts';
import { decodeSave, type SaveSnapshot } from '@skelly/engine/save';
import { createSession, IDLE } from '@skelly/engine/session';
import { createTerrainEvaluator, type TerrainPlan, type Vec3, World } from '@skelly/engine/world';
import { ActorMeshes } from '@skelly/presentation/internal/render/actors.ts';
import { ChunkMeshes } from '@skelly/presentation/render';
import { contentLookup } from '@skelly/presentation/ui';
import { Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { blockMaterialFixture, fixtureBlockMaterial } from './blockMaterialFixture.ts';
import { MobActorMeshes } from './mobActorsFixture.ts';
import { encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const scale = { blockSize: 0.5, minCy: 0, maxCy: 0 };
const Z = 3;
const POST = 'support_cascade_post';
const BEAM = 'support_cascade_beam';
const GROUND = 'support_cascade_ground';
const RUBBLE = 'support_cascade_rubble';
const STOCK = 'support_cascade_stock';
const PIECE = 'support_cascade_piece';
const VEHICLE = 'support_cascade_vehicle';

const fixtureRegistry = (cascadeCellsPerTick?: number, breathes = false) => {
  const registry = baseRegistry();
  const shambler = registry.actors.get('shambler')!;
  registry.actors.set(shambler.id, { ...shambler, breathes });
  registry.items.set(STOCK, {
    id: STOCK,
    name: 'Fixture stock',
    category: 'material',
    size: [1, 1],
    weight: 1,
    workInProgress: false,
  });
  registry.furniture.set(PIECE, {
    id: PIECE,
    name: 'Fixture piece',
    size: [1, 1, 1],
    color: '#888888',
    material: [...registry.furnitureMaterials.keys()][0]!,
    breach: { minimumStrength: 1, durability: 1 },
    ruin: { debris: [{ item: STOCK, count: 1 }] },
  });
  const donor = [...registry.items.values()].find((item) => item.vehicle && item.model && !item.vehicle.addon)!;
  registry.items.set(VEHICLE, { ...donor, id: VEHICLE, model: VEHICLE });
  registry.models.set(VEHICLE, {
    ...registry.models.get(donor.model!)!,
    id: VEHICLE,
    parts: {
      body: {
        massKg: 1,
        centreOfMass: [0, 0, 0],
        voxelGrain: scale.blockSize,
        collision: [
          {
            min: [-scale.blockSize / 2, 0, -scale.blockSize / 2],
            max: [scale.blockSize / 2, scale.blockSize, scale.blockSize / 2],
          },
        ],
      },
    },
  });
  registry.vehicleBlueprints.set(VEHICLE, {
    id: VEHICLE,
    name: 'Fixture vehicle',
    fittings: [{ id: 'part', part: VEHICLE, at: [0, 0, 0], supportedBy: [] }],
  });
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
  const [tuning] = registry.supportTuning.values();
  registry.supportTuning.set(tuning!.id, {
    ...tuning!,
    crushDamage: 1,
    suffocationDamagePerSimSecond: 1,
    ...(cascadeCellsPerTick === undefined ? {} : { cascadeCellsPerTick }),
  });
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
  options: { layout?: typeof structures; spawn?: Vec3; breathes?: boolean } = {},
) => {
  const { layout = structures, spawn = [20, 1, 20] } = options;
  const registry = fixtureRegistry(cascadeCellsPerTick, options.breathes);
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
    spawn,
    terrainDestruction: { terrain: canonical, source },
    isSolid: (x, y, z) => registry.blocks[world.getBlock(x, y, z)]!.solid,
    isOpaque: (x, y, z) => registry.blocks[world.getBlock(x, y, z)]!.solid,
    ready: () => false,
    actorReady: () => true,
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
  return { registry, world, canonical, session, block, tick, strike, standing, snapshot, options };
};
type Fixture = ReturnType<typeof fixture>;

const chamber: typeof structures = (registry) => {
  const post = registry.blockIds.get(POST)!;
  return [
    column(2, 8, post),
    row(3, 4, 8, registry.blockIds.get(BEAM)!),
    ...[2, 6].map((x): BlockBox => ({ min: [x, 1, 1], max: [x + 1, 2, 6], block: post })),
    ...[1, 5].map((z): BlockBox => ({ min: [3, 1, z], max: [6, 2, z + 1], block: post })),
  ];
};

const reload = async (f: Fixture, cascadeCellsPerTick?: number, neighbour = false) => {
  const decoded = await decodeSave(await encodeFixture(f.snapshot()), {
    version: formatVersion,
    contentLookup: (...query) => contentLookup(f.registry, ...query),
  });
  return fixture(cascadeCellsPerTick, decoded.snapshot, neighbour, f.options);
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
  it('saves a trapped player and suffocates it over simulation time, without allowing self clearing', async () => {
    const f = fixture(undefined, undefined, false, { layout: chamber, spawn: [4.5, 1, Z + 0.5] });
    expect(f.strike([2, 6, Z])).toBe(true);
    settle(f);
    expect(f.session.body.buried?.length).toBeGreaterThan(0);
    const restored = await reload(f);
    expect(restored.session.body.buried).toEqual(f.session.body.buried);
    const cell = restored.session.body.buried![0]!;
    expect(restored.session.crafting.previewTakeApartCell(cell).refusal).toBeDefined();
    const { health } = restored.session.sim.body;
    const tuning = [...restored.registry.supportTuning.values()][0]!;
    const reader = restored.session.sim.events.reader();
    restored.session.sim.scheduler.advance(health / tuning.suffocationDamagePerSimSecond + 1);
    expect(restored.session.sim.dead?.cause).toBe(tuning.suffocationCause);
    const damage = reader.read().filter((event) => event.kind === 'damage');
    expect(damage.length).toBeGreaterThan(0);
    expect(damage.every((event) => event.continuous)).toBe(true);
  });

  it('reveals the exposed part after digging one of two body-covering cells, not the still-covered part', () => {
    const layout: typeof structures = (registry, neighbour) => [
      ...chamber(registry, neighbour),
      row(4, 4, 9, registry.blockIds.get(BEAM)!),
    ];
    const f = fixture(undefined, undefined, false, { layout, spawn: [7.65, 1, Z + 0.5] });
    const id = f.session.actors.add(f.registry.actors.get('shambler')!, [4.5, 1, Z + 0.5]);
    expect(f.strike([2, 6, Z])).toBe(true);
    settle(f);
    const actor = f.session.actors.store.get(id)!;
    const cells = [...actor.body.buried!].sort((a, b) => b[1] - a[1]);
    expect(cells).toHaveLength(2);
    const [cleared, covered] = cells as [Vec3, Vec3];
    const preview = f.session.crafting.previewTakeApartCell(cleared);
    expect(preview.identity).toBeDefined();
    expect(f.session.crafting.takeApartCell(cleared, preview.identity!)).toBeUndefined();
    const work = f.session.inventory.hands.right?.work;
    expect(work?.kind).toBe('cellDisassembly');
    f.session.sim.scheduler.advance(work!.duration / f.session.sim.clock.ratio + 1);
    expect(f.canonical.getBlock(...cleared)).toBe(0);
    expect(actor.body.buried).toEqual([covered]);
    const figures = new MobActorMeshes(scale.blockSize, 1, {
      actors: new Map([[actor.type.id, actor.type]]),
      actorFigureFiles: stackActorFigureFiles(f.registry),
      poolSize: 1,
    });
    figures.sync(f.session.actors.store);
    expect(figures.isTracked(id)).toBe(true);
    figures.dispose();
    const actors = new ActorMeshes(scale.blockSize);
    actors.sync(f.session.actors.store);
    actors.group.updateMatrixWorld(true);
    const terrain = new ChunkMeshes(scale.blockSize, f.registry);
    const cover = terrain.blockModel(f.canonical.getBlock(...covered), f.registry);
    cover.position.set(...(covered.map((value) => value * scale.blockSize) as Vec3));
    cover.updateMatrixWorld(true);
    const bodyObjects = new Set(actors.group.children);
    const visibleBodyRays = (cell: Vec3, withCover = true) => {
      const objects = withCover ? [...actors.group.children, cover] : actors.group.children;
      let visible = 0;
      for (const x of [0.2, 0.4, 0.6, 0.8]) {
        for (const y of [0.2, 0.4, 0.6, 0.8]) {
          const ray = new Raycaster(
            new Vector3(
              (cell[0] + x) * scale.blockSize,
              (cell[1] + y) * scale.blockSize,
              (cell[2] - 2) * scale.blockSize,
            ),
            new Vector3(0, 0, 1),
          );
          const [first] = ray.intersectObjects(objects);
          if (first && bodyObjects.has(first.object)) {
            visible += 1;
          }
        }
      }
      return visible;
    };
    expect(visibleBodyRays(cleared)).toBeGreaterThan(0);
    expect(visibleBodyRays(covered, false)).toBeGreaterThan(0);
    expect(visibleBodyRays(covered)).toBe(0);
    terrain.dispose();
  });

  it('frees an unbreathing victim when another actor takes its rubble apart', async () => {
    const f = fixture(undefined, undefined, false, { layout: chamber, spawn: [7.65, 1, Z + 0.5] });
    const id = f.session.actors.add(f.registry.actors.get('shambler')!, [4.5, 1, Z + 0.5]);
    expect(f.strike([2, 6, Z])).toBe(true);
    settle(f);
    const actor = f.session.actors.store.get(id)!;
    expect(actor.body.buried?.length).toBeGreaterThan(0);
    const health = { ...actor.regions };
    const position = [...actor.body.pos];
    const tuning = [...f.registry.supportTuning.values()][0]!;
    f.session.sim.scheduler.advance(
      Math.max(...Object.values(health).map((value) => value!)) / tuning.suffocationDamagePerSimSecond + 1,
    );
    expect(f.session.actors.store.get(id)?.regions).toEqual(health);
    expect(actor.body.pos).toEqual(position);
    const restored = await reload(f);
    const victim = restored.session.actors.store.get(id)!;
    expect(victim.body.buried).toEqual(actor.body.buried);
    for (const cell of [...victim.body.buried!]) {
      const preview = restored.session.crafting.previewTakeApartCell(cell);
      if (!preview.identity) {
        continue;
      }
      expect(restored.session.crafting.takeApartCell(cell, preview.identity)).toBeUndefined();
      const work = restored.session.inventory.hands.right?.work;
      expect(work?.kind).toBe('cellDisassembly');
      restored.session.sim.scheduler.advance(work!.duration / restored.session.sim.clock.ratio + 1);
    }
    expect(victim.body.buried).toBeUndefined();
  });

  it('uses the content breathing flag for living NPC suffocation and the existing death path', () => {
    const f = fixture(undefined, undefined, false, { layout: chamber, spawn: [7.65, 1, Z + 0.5], breathes: true });
    const id = f.session.actors.add(f.registry.actors.get('shambler')!, [4.5, 1, Z + 0.5]);
    expect(f.strike([2, 6, Z])).toBe(true);
    settle(f);
    const actor = f.session.actors.store.get(id)!;
    expect(actor.body.buried?.length).toBeGreaterThan(0);
    const tuning = [...f.registry.supportTuning.values()][0]!;
    f.session.sim.scheduler.advance(
      Math.max(...Object.values(actor.regions).map((value) => value!)) / tuning.suffocationDamagePerSimSecond + 1,
    );
    expect(f.session.actors.store.get(id)).toBeUndefined();
  });
  it('reports source blocks for falling dependants and lands their rubble on solid ground', () => {
    const f = fixture();
    const falls = f.world.falls.reader();
    expect(f.strike([2, 1, Z])).toBe(true);
    settle(f);
    const records = falls.read();
    expect(records).toEqual(
      expect.arrayContaining([
        { kind: 'terrain', block: f.registry.blockIds.get(BEAM), from: [3, 3, Z], to: [3, 1, Z] },
      ]),
    );
    for (const record of records) {
      expect(record.kind).toBe('terrain');
      expect(record.from[1]).toBeGreaterThan(record.to[1]);
      expect(f.block(record.to)).toBe(RUBBLE);
    }
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

  it('keeps empty landed rubble for take-apart rather than clearing it by ordinary blows', () => {
    const f = fixture();
    expect(f.strike([2, 1, Z])).toBe(true);
    settle(f);
    const cell: Vec3 = [4, 1, Z];
    expect(f.block(cell)).toBe(RUBBLE);
    expect(f.strike(cell)).toBe(true);
    expect(f.block(cell)).toBe(RUBBLE);
  });

  it('buries landing-pile items through save/load and recovers their identity by taking the rubble apart', async () => {
    const f = fixture(undefined, undefined, false, { spawn: [3, 1, Z + 2] });
    const item = f.session.inventory.create(STOCK, 2, 0.7);
    expect(f.session.inventory.add(item, { kind: 'pile', pos: [3, 1, Z] })).toBe(true);
    const before = snapshotItem(item);
    expect(f.strike([2, 1, Z])).toBe(true);
    settle(f);
    expect(f.block([3, 1, Z])).toBe(RUBBLE);
    expect(f.session.inventory.itemByUid(item.uid)).toBeUndefined();
    expect(f.strike([3, 1, Z])).toBe(true);
    expect(f.block([3, 1, Z])).toBe(RUBBLE);
    const invalid = structuredClone(f.snapshot());
    invalid.character.inventory.piles.push({
      pos: [8, 1, Z],
      items: [{ item: structuredClone(before), x: 0, y: 0, rotated: false }],
    });
    await expect(encodeFixture(invalid)).rejects.toThrow('Duplicate item id');
    const restored = await reload(f);
    expect(restored.session.inventory.itemByUid(item.uid)).toBeUndefined();
    const cell: Vec3 = [3, 1, Z];
    const preview = restored.session.crafting.previewTakeApartCell(cell);
    expect(restored.session.crafting.takeApartCell(cell, preview.identity!)).toBeUndefined();
    const work = restored.session.inventory.hands.right?.work;
    expect(work?.kind).toBe('cellDisassembly');
    restored.session.sim.scheduler.advance(work!.duration / restored.session.sim.clock.ratio + 1);
    expect(restored.canonical.getBlock(...cell)).toBe(0);
    const recovered = restored.session.inventory.itemByUid(item.uid);
    expect(recovered && snapshotItem(recovered)).toEqual(before);
  });

  it('ruins furniture at the landing through the normal debris path before rubble occupies its cell', () => {
    const f = fixture();
    const piece = f.session.inventory.entities.add({ type: PIECE, pos: [3, 1, Z], size: [1, 1, 1], facing: 'n' })!;
    expect(f.strike([2, 1, Z])).toBe(true);
    settle(f);
    expect(f.block([3, 1, Z])).toBe(RUBBLE);
    expect(f.session.inventory.entities.byUid(piece.uid)).toBeUndefined();
    const loose = [...f.session.inventory.items()].map(({ item }) => item);
    const buried = f.world.rubble
      .snapshotState()
      .entries.flatMap((entry) => (entry.buried ?? []).map(({ item }) => item));
    expect([...loose, ...buried].some((item) => item.type === STOCK)).toBe(true);
  });

  it('hurts and displaces a victim before rubble lands rather than refusing the collapse', () => {
    const f = fixture(undefined, undefined, false, {
      layout: (registry) => [column(2, 6, registry.blockIds.get(POST)!), row(3, 4, 6, registry.blockIds.get(BEAM)!)],
      spawn: [3.5, 1, Z + 0.5],
    });
    const before = [...f.session.body.pos];
    const { health } = f.session.sim.body;
    expect(f.strike([2, 1, Z])).toBe(true);
    settle(f);
    expect(f.block([3, 1, Z])).toBe(RUBBLE);
    expect(f.session.body.pos).not.toEqual(before);
    expect(f.session.body.buried).toBeUndefined();
    expect(f.session.sim.body.health).toBeLessThan(health);
  });

  it('treats occupied vehicle fittings as a floor without changing the vehicle', () => {
    const f = fixture();
    f.session.inventory.registerVehicle({
      blueprint: VEHICLE,
      placementKey: VEHICLE,
      origin: [3.5, 1, Z + 0.5],
      facing: 'n',
    });
    const before = f.session.inventory.vehicles.snapshotState();
    expect(f.strike([2, 1, Z])).toBe(true);
    settle(f);
    expect(f.block([3, 2, Z])).toBe(RUBBLE);
    expect(f.canonical.getBlock(3, 1, Z)).toBe(0);
    expect(f.session.inventory.vehicles.snapshotState()).toEqual(before);
  });

  it('drops landed rubble again when a later strike removes the post it landed on', () => {
    const f = fixture(undefined, undefined, false, {
      layout: (registry) => [
        column(2, 5, registry.blockIds.get(POST)!),
        row(3, 4, 5, registry.blockIds.get(BEAM)!),
        column(4, 3, registry.blockIds.get(POST)!),
      ],
    });
    const load = f.session.inventory.create(STOCK);
    expect(f.session.inventory.add(load, { kind: 'pile', pos: [4, 4, Z] })).toBe(true);
    expect(f.strike([2, 1, Z])).toBe(true);
    settle(f);
    expect(f.block([4, 4, Z])).toBe(RUBBLE);
    expect(f.block([4, 3, Z])).toBe(POST);
    expect(f.strike([4, 1, Z])).toBe(true);
    settle(f);
    expect(f.canonical.getBlock(4, 4, Z)).toBe(0);
    expect(f.block([4, 3, Z])).toBe(RUBBLE);
    expect(f.block([4, 2, Z])).toBe(RUBBLE);
    expect(f.world.rubble.contents([4, 4, Z])).toEqual([]);
    expect(f.world.rubble.contents([4, 3, Z]).map(({ item }) => item.uid)).toContain(load.uid);
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

  it('revisits a diagonal dependant when its standing anchor loses its floor but the bent path stays solid', async () => {
    const options = {
      layout: (registry: ReturnType<typeof fixtureRegistry>): BlockBox[] => {
        const post = registry.blockIds.get(POST)!;
        const beam = registry.blockIds.get(BEAM)!;
        return [
          column(9, 3, post),
          column(11, 2, post),
          row(10, 11, 3, beam),
          { min: [9, 1, Z + 1], max: [10, 4, Z + 2], block: post },
          { min: [10, 3, Z + 1], max: [13, 4, Z + 2], block: beam },
        ];
      },
    };
    const cut = fixture(1, undefined, false, options);
    const target: Vec3 = [12, 3, Z + 1];
    expect(createSupport(cut.registry, terrainSupportView(cut.canonical)).holds(target)).toBe(true);
    expect(cut.strike([11, 1, Z])).toBe(true);
    cut.tick();
    expect(cut.world.support.cascading).toBe(true);
    const restored = await reload(cut, 1);
    expect(restored.world.support.snapshotState()).toEqual(cut.world.support.snapshotState());
    settle(cut);
    settle(restored);
    for (const f of [cut, restored]) {
      expect(f.block([11, 3, Z])).toBe(BEAM);
      expect(f.block([11, 3, Z + 1])).toBe(BEAM);
      expect(f.canonical.getBlock(...target)).toBe(0);
      expect(f.block([12, 1, Z + 1])).toBe(RUBBLE);
    }
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
