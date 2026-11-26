import { bashBlock } from '@skelly/engine/internal/core/blockDamage.ts';
import { CanonicalTerrain } from '@skelly/engine/internal/core/canonicalTerrain.ts';
import { coreMessage } from '@skelly/engine/internal/core/coreText.ts';
import { chargeOf } from '@skelly/engine/internal/core/lights.ts';
import type { ColumnSource } from '@skelly/engine/internal/core/site.ts';
import type { BlockBox } from '@skelly/engine/internal/core/structure.ts';
import { swapCanister } from '@skelly/engine/internal/core/torch.ts';
import { cellActionsFor } from '@skelly/engine/internal/game/cellActions.ts';
import { freshDropTarget, Inventory, type Target } from '@skelly/engine/inventory';
import { decodeSave, type SaveSnapshot } from '@skelly/engine/save';
import { createSession, IDLE } from '@skelly/engine/session';
import { BlockEntities, createTerrainEvaluator, type TerrainPlan, type Vec3, World } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import {
  blockId,
  contentLookup,
  createRuntime,
  encodeFixture,
  formatVersion,
  registry,
} from './snapshotTestSupport.ts';

const doorDef = registry.furniture.get('steel_armoury_door')!;
const cut = doorDef.door!.methods.cut!;
const canisterCapacity = registry.items.get('gas_canister')!.canister!.capacity;

const makeRuntime = (snapshot?: Parameters<typeof createRuntime>[0]) => {
  const runtime = createRuntime(snapshot, false, undefined, { spawn: [0, 1, 0], active: false });
  const floor = registry.blockIds.get('planks')!;
  for (let x = -1; x <= 1; x++) {
    for (let z = 0; z <= 6; z++) {
      runtime.world.setBlock(x, 0, z, floor);
    }
  }
  return runtime;
};
type Runtime = ReturnType<typeof makeRuntime>;

const makeDoor = (runtime: Runtime) => {
  const door = runtime.inventory.furnish({
    type: doorDef.id,
    pos: [0, 1, 1],
    size: doorDef.size,
    facing: 'n',
    lock: { id: 'test_armoury', locked: true },
  });
  if (!door) {
    throw new Error('Could not place the fixture steel door');
  }
  return door;
};

/** Holds `type` in the left hand, in place of the starting light. */
const hold = (runtime: Runtime, type: string) => {
  const light = runtime.inventory.hands.left;
  if (!(light && runtime.inventory.consume(light))) {
    throw new Error('Could not free a hand for the fixture tool');
  }
  const tool = runtime.inventory.create(type);
  if (!runtime.inventory.add(tool, { kind: 'hand', side: 'left' })) {
    throw new Error('Could not hold the fixture tool');
  }
  return tool;
};

const holdTorch = (runtime: Runtime, fill?: number) => {
  const torch = hold(runtime, 'blowtorch');
  if (fill !== undefined) {
    const canister = runtime.inventory.create('gas_canister');
    canister.charges = fill;
    runtime.inventory.fitSlot(torch, 'canister', canister);
  }
  return torch;
};

it('a finished cut spends the door method fuel from the torch cartridge', () => {
  const runtime = makeRuntime();
  const door = makeDoor(runtime);
  const torch = holdTorch(runtime, canisterCapacity);
  expect(runtime.session.forceDoor(door, torch.uid)).toBeUndefined();

  // The long action calls the owner's finish when its time is up; waiting out the cut adds no coverage.
  expect(runtime.sim.actions.forcing?.finish(door.uid, torch.uid, 'cut')).toBeUndefined();

  expect(door.lock).toBeUndefined();
  expect(chargeOf(registry, torch)).toBeCloseTo(canisterCapacity - cut.fuel!, 9);
});

it('a cut with too little fill does not start and spends nothing', () => {
  const runtime = makeRuntime();
  const door = makeDoor(runtime);
  const torch = holdTorch(runtime, cut.fuel! / 2);

  const reason = runtime.session.forceDoor(door, torch.uid);

  expect(reason).toBeTypeOf('string');
  expect(runtime.sim.actions.job).toBeUndefined();
  expect(door.lock?.locked).toBe(true);
  expect(chargeOf(registry, torch)).toBe(cut.fuel! / 2);
});

it('a torch with no cartridge cannot start a cut', () => {
  const runtime = makeRuntime();
  const door = makeDoor(runtime);
  const torch = holdTorch(runtime);

  expect(runtime.session.forceDoor(door, torch.uid)).toBeTypeOf('string');
  expect(runtime.sim.actions.job).toBeUndefined();
});

it('a stopped cut spends nothing', () => {
  const runtime = makeRuntime();
  const door = makeDoor(runtime);
  const torch = holdTorch(runtime, canisterCapacity);
  expect(runtime.session.forceDoor(door, torch.uid)).toBeUndefined();
  runtime.sim.scheduler.advance(cut.strikeIntervalSimSeconds * 2);

  runtime.sim.actions.stop();
  runtime.sim.scheduler.advance(1);

  // A stopped job stays defined so its progress survives; its flag is what keeps it from finishing.
  expect(runtime.sim.actions.job?.stopped).toBe(true);
  expect(door.lock?.locked).toBe(true);
  expect(chargeOf(registry, torch)).toBe(canisterCapacity);
});

it('swapping in a cartridge returns the old one whatever its fill', () => {
  const inventory = new Inventory(registry);
  const torch = inventory.create('blowtorch');
  const first = inventory.create('gas_canister');
  first.charges = 0;
  const second = inventory.create('gas_canister');
  const feet = (): Target => ({ kind: 'pile', pos: [0, 0, 0] });
  expect(inventory.add(first, { kind: 'hand', side: 'left' })).toBe(true);
  expect(inventory.add(second, { kind: 'hand', side: 'right' })).toBe(true);

  expect(swapCanister(inventory, torch, first, feet)).toBeUndefined();
  expect(chargeOf(registry, torch)).toBe(0);
  expect(swapCanister(inventory, torch, second, feet)).toBeUndefined();

  expect(chargeOf(registry, torch)).toBe(canisterCapacity);
  expect(inventory.pileAt([0, 0, 0])!.items.map(({ item }) => [item.type, chargeOf(registry, item)])).toEqual([
    ['gas_canister', 0],
  ]);
  expect(swapCanister(inventory, torch, torch, feet)).toBeTypeOf('string');
});

const fittedTorch = () => {
  const inventory = new Inventory(registry);
  const torch = inventory.create('blowtorch');
  const old = inventory.create('gas_canister');
  inventory.fitSlot(torch, 'canister', old);
  const fresh = inventory.create('gas_canister');
  if (!inventory.add(fresh, { kind: 'hand', side: 'left' })) {
    throw new Error('Could not hold the fixture cartridge');
  }
  return { inventory, torch, old, fresh };
};

it('a cartridge swap with no ground for the old one to land on refuses and leaves the fitted one exactly as it was', () => {
  const { inventory, torch, old, fresh } = fittedTorch();
  const before = { ...old };
  expect(swapCanister(inventory, torch, fresh, () => undefined)).toBe(coreMessage(inventory.registry, 'noLanding'));
  expect(torch.slots!.canister).toBe(old);
  expect(old).toEqual(before);
  expect(inventory.locate(fresh)?.kind).toBe('hand');
});

it('plans where the old cartridge lands with the fill it comes out with', () => {
  const { inventory, torch, old, fresh } = fittedTorch();
  // The feet pile has room only by merging into a fresh cartridge; the old one's fill, once written, won't merge.
  const feetPile: Target = { kind: 'pile', pos: [0, 0, 0] };
  expect(inventory.add(inventory.create('gas_canister'), feetPile)).toBe(true);
  const fillers = [
    () => inventory.create('blowtorch'),
    () => Object.assign(inventory.create('gas_canister'), { charges: canisterCapacity / 2 }),
  ];
  for (const filler of fillers) {
    while (inventory.add(filler(), feetPile)) {
      // Fill the pile until it refuses.
    }
  }
  expect(swapCanister(inventory, torch, fresh, (item) => freshDropTarget(inventory, item, [0, 0, 0]))).toBeUndefined();
  const at = inventory.locate(old);
  expect(at?.kind).toBe('pile');
  expect(at?.kind === 'pile' && at.pile.pos).not.toEqual([0, 0, 0]);
});

it('a cartridge swap into full piles refuses rather than losing the old one', () => {
  const { inventory, torch, old, fresh } = fittedTorch();
  const pile: Target = { kind: 'pile', pos: [0, 0, 0] };
  const filler = () => Object.assign(inventory.create('gas_canister'), { charges: old.charges });
  while (inventory.add(filler(), pile)) {
    // Fill with the displaced footprint, without merging partly used cartridges.
  }
  expect(swapCanister(inventory, torch, fresh, () => pile)).toBe(coreMessage(inventory.registry, 'noGroundRoom'));
  expect(torch.slots!.canister).toBe(old);
  expect(inventory.locate(fresh)?.kind).toBe('hand');
});

/**
 * A blow of `kind` whose strength past `resistance` is exactly `minimum`, and a blow of another kind at the same
 * strength. The other kind must resist more, or the pair proves nothing.
 */
const blowsAtGate = (minimum: number, resistance: Readonly<Record<string, number>>, lands: string, other: string) => {
  if (!(resistance[other]! > resistance[lands]!)) {
    throw new Error(`the fixture needs ${other} resisted more than ${lands}`);
  }
  const strength = minimum / (1 - resistance[lands]!);
  return { lands: { strength, kind: lands }, resisted: { strength, kind: other } };
};

it('a blunt blow on steel is reduced by its resistance', () => {
  const metal = registry.blockMaterials.get('metal')!;
  const { lands, resisted } = blowsAtGate(metal.minimumStrength, metal.resistance, 'heat', 'blunt');

  expect(bashBlock({ material: metal, damage: 0 }, resisted).outcome).toBe('resisted');
  expect(bashBlock({ material: metal, damage: 0 }, lands).outcome).not.toBe('resisted');
});

it('a heat blow on a wood piece is resisted while the same strength blunt lands', () => {
  const woodDoor = registry.furniture.get('wood_door')!;
  const wood = registry.furnitureMaterials.get(woodDoor.material)!;
  const { lands, resisted } = blowsAtGate(woodDoor.breach.minimumStrength, wood.resistance, 'blunt', 'heat');
  const entities = new BlockEntities(registry);
  const door = entities.add({ type: woodDoor.id, pos: [0, 0, 0], size: [...woodDoor.size] as Vec3, facing: 'n' })!;

  expect(entities.bash(door, resisted)).toBe('resisted');
  expect(entities.bash(door, lands)).not.toBe('resisted');
});

const torchTool = registry.items.get('blowtorch')!.tool!;
const torchCut = torchTool.cut!;
const strikeFuel = torchTool.fuel!.fillPerSimSecond * torchCut.strikeIntervalSimSeconds;

/** A blowtorch fitted with a cartridge holding `fill`. */
const fuelledTorch = (inventory: Inventory, fill: number) => {
  const torch = inventory.create('blowtorch');
  const canister = inventory.create('gas_canister');
  canister.charges = fill;
  inventory.fitSlot(torch, 'canister', canister);
  return torch;
};

const CUT_Z = 3;
const joist: Vec3 = [4, 1, CUT_Z];
const slab: Vec3 = [4, 2, CUT_Z];
const masonry: Vec3 = [7, 1, CUT_Z];
const timber: Vec3 = [5, 1, CUT_Z + 2];
const shaftFloor = (y: number): Vec3[] =>
  [3, 4, 5].flatMap((x) => [CUT_Z - 1, CUT_Z, CUT_Z + 1].map((z): Vec3 => [x, y, z]));

const box = (min: Vec3, max: Vec3, block: string): BlockBox => ({
  min,
  max: [max[0] + 1, max[1] + 1, max[2] + 1],
  block: blockId(block),
});
const single = (cell: Vec3, block: string) => box(cell, cell, block);

/**
 * `open`: a steel joist on the ground carries a slab, with a masonry and a timber cell in reach. `shaft`: the joist
 * floors a sealed room the player stands in, so its rubble can land only on that floor.
 */
const cutLayouts = {
  open: () => [
    single(joist, 'steel_joist'),
    single(slab, 'slab_deck'),
    single(masonry, 'concrete'),
    single(timber, 'siding_red'),
  ],
  shaft: () => [
    ...shaftFloor(1).map((cell) =>
      single(cell, cell[0] === joist[0] && cell[2] === joist[2] ? 'steel_joist' : 'concrete'),
    ),
    box([2, 1, CUT_Z - 2], [2, 8, CUT_Z + 2], 'concrete'),
    box([6, 1, CUT_Z - 2], [6, 8, CUT_Z + 2], 'concrete'),
    box([3, 1, CUT_Z - 2], [5, 8, CUT_Z - 2], 'concrete'),
    box([3, 1, CUT_Z + 2], [5, 8, CUT_Z + 2], 'concrete'),
    box([2, 9, CUT_Z - 2], [6, 9, CUT_Z + 2], 'concrete'),
  ],
};
type CutLayout = keyof typeof cutLayouts;

const cutFixture = (layout: CutLayout, restored?: Readonly<SaveSnapshot>) => {
  const scale = { blockSize: 0.5, minCy: 0, maxCy: 0 };
  const world = new World();
  const ground = blockId('concrete');
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
    structures: cutLayouts[layout](),
  };
  const canonical = new CanonicalTerrain(world, createTerrainEvaluator(terrain));
  const source: ColumnSource = {
    furnitureIn: () => [],
    lootPointsIn: () => [],
    supplySourcesIn: () => [],
    actorsIn: () => [],
  };
  const notices: string[] = [];
  const session = createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world,
    scale,
    seed: 7,
    start: 43_200,
    spawn: layout === 'open' ? [5.5, 1, CUT_Z + 0.5] : [joist[0] + 0.5, 2, CUT_Z + 0.5],
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
    notice: (text) => notices.push(text),
    onRead: () => undefined,
    ...(restored ? { restore: restored } : {}),
  });
  canonical.ensureColumn(0, 0);
  const { inventory, sim } = session;
  const blockAt = (cell: Vec3) => registry.blocks[world.getBlock(...cell)]!.id;
  const damageAt = (cell: Vec3) => world.blockDamage.get(cell)?.damage ?? 0;
  /** Holds a fresh torch with `fill` in the left hand, in place of whatever was there. */
  const holdFuelled = (fill: number) => {
    const held = inventory.hands.left;
    if (held && !inventory.consume(held)) {
      throw new Error('Could not free a hand for the fixture torch');
    }
    const torch = fuelledTorch(inventory, fill);
    if (!inventory.add(torch, { kind: 'hand', side: 'left' })) {
      throw new Error('Could not hold the fixture torch');
    }
    return torch;
  };
  const strike = () => sim.scheduler.advance(torchCut.strikeIntervalSimSeconds);
  /** Strikes until the job ends or stops; the bound only stops a cut that never would. */
  const cutOut = () => {
    for (let strikes = 0; strikes < 4096 && sim.actions.job && !sim.actions.job.stopped; strikes++) {
      strike();
    }
    if (sim.actions.job && !sim.actions.job.stopped) {
      throw new Error('The cut did not end');
    }
  };
  /** Ticks until the cascade ends; the bound only stops a cascade that never would. */
  const settle = () => {
    for (let ticks = 0; ticks < 4096 && world.support.cascading; ticks++) {
      sim.scheduler.advance(sim.scheduler.stepOf('support', 1));
    }
  };
  const snapshot = () => session.snapshot({ worldId: 'cut-fixture', characterId: 'cut-character' });
  return { world, session, inventory, sim, notices, blockAt, damageAt, holdFuelled, strike, cutOut, settle, snapshot };
};
type CutFixture = ReturnType<typeof cutFixture>;

const reloadCut = async (f: CutFixture, layout: CutLayout) => {
  const decoded = await decodeSave(await encodeFixture(f.snapshot()), { version: formatVersion, contentLookup });
  return cutFixture(layout, decoded.snapshot);
};

describe('torch cutting a steel cell', () => {
  it('cuts a joist out from under a slab, and the slab comes down', () => {
    const f = cutFixture('open');
    f.holdFuelled(canisterCapacity);

    expect(f.session.cutCell(joist)).toBeUndefined();
    f.cutOut();
    f.settle();

    expect(f.sim.actions.job).toBeUndefined();
    expect(f.blockAt(joist)).not.toBe('steel_joist');
    expect(f.blockAt(slab)).not.toBe('slab_deck');
  });

  it('leaves the joist standing with its damage and stops when its rubble has no room', () => {
    const f = cutFixture('shaft');
    for (const pos of shaftFloor(2)) {
      while (f.inventory.add(f.inventory.create('blowtorch'), { kind: 'pile', pos })) {
        // Fill the floor pile until it refuses.
      }
    }
    f.holdFuelled(canisterCapacity);

    expect(f.session.cutCell(joist)).toBeUndefined();
    f.cutOut();

    expect(f.blockAt(joist)).toBe('steel_joist');
    expect(f.damageAt(joist)).toBeGreaterThan(0);
    expect(f.sim.actions.job?.stopped).toBe(true);
    expect(f.notices).toContain(coreMessage(registry, 'noRoom'));
  });

  it('offers Cut on steel but not on masonry or timber', () => {
    const f = cutFixture('open');
    f.holdFuelled(canisterCapacity);
    const actions = (cell: Vec3) => cellActionsFor(f.inventory, f.world, cell, new Set()).map(({ id }) => id);

    expect(actions(joist)).toContain('cut');
    expect(actions(masonry)).not.toContain('cut');
    expect(actions(timber)).not.toContain('cut');
  });

  it('spends one strike of gas on each strike that lands', () => {
    const f = cutFixture('open');
    const torch = f.holdFuelled(canisterCapacity);
    expect(f.session.cutCell(joist)).toBeUndefined();

    let strikes = 0;
    for (let step = 0; step < 8; step++) {
      const before = f.damageAt(joist);
      // Half an interval at a time, so no step holds two strikes.
      f.sim.scheduler.advance(torchCut.strikeIntervalSimSeconds / 2);
      strikes += f.damageAt(joist) > before ? 1 : 0;
    }

    expect(strikes).toBeGreaterThan(0);
    expect(chargeOf(registry, torch)).toBeCloseTo(canisterCapacity - strikes * strikeFuel, 9);
  });

  it('refuses to start below one strike of gas, though the menu still offers the cut', () => {
    const f = cutFixture('open');
    const torch = f.holdFuelled(strikeFuel / 2);

    expect(cellActionsFor(f.inventory, f.world, joist, new Set()).map(({ id }) => id)).toContain('cut');
    expect(f.session.cutCell(joist)).toBeTypeOf('string');
    expect(f.sim.actions.job).toBeUndefined();
    expect(chargeOf(registry, torch)).toBe(strikeFuel / 2);
  });

  it('stops with a message when the gas runs out', () => {
    const f = cutFixture('open');
    f.holdFuelled(strikeFuel * 2.5);

    expect(f.session.cutCell(joist)).toBeUndefined();
    f.cutOut();

    expect(f.sim.actions.job?.stopped).toBe(true);
    expect(f.notices).toContain(coreMessage(registry, 'outOfFuel'));
    expect(f.blockAt(joist)).toBe('steel_joist');
    expect(f.damageAt(joist)).toBeGreaterThan(0);
  });

  it('keeps a stopped cut as damage, which another torch carries on', () => {
    const f = cutFixture('open');
    f.holdFuelled(canisterCapacity);
    expect(f.session.cutCell(joist)).toBeUndefined();
    f.strike();
    f.strike();
    f.sim.actions.stop();
    f.strike();
    const kept = f.damageAt(joist);
    expect(kept).toBeGreaterThan(0);

    f.holdFuelled(canisterCapacity);
    expect(f.session.cutCell(joist)).toBeUndefined();
    f.strike();

    expect(f.damageAt(joist)).toBeGreaterThan(kept);
  });

  it('carries a cut through a save and goes on cutting', async () => {
    const f = cutFixture('open');
    f.holdFuelled(canisterCapacity);
    expect(f.session.cutCell(joist)).toBeUndefined();
    f.strike();
    f.strike();

    const restored = await reloadCut(f, 'open');

    expect(restored.damageAt(joist)).toBe(f.damageAt(joist));
    expect(restored.sim.actions.job).toMatchObject({ jobType: 'cutCell', cell: joist, stopped: false });
    restored.strike();
    expect(restored.damageAt(joist)).toBeGreaterThan(f.damageAt(joist));
  });

  it('refuses time compression while a cut runs', () => {
    const f = cutFixture('open');
    f.holdFuelled(canisterCapacity);
    expect(f.session.cutCell(joist)).toBeUndefined();

    expect(f.sim.compress().ok).toBe(false);
    expect(f.sim.actions.job?.stopped).toBe(false);
  });
});
