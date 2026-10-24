import { describe, expect, it } from 'vitest';
import { NEUTRAL_AIM } from '../src/core/aim.ts';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { dominantSide, SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from '../src/core/character.ts';
import { worldSolid } from '../src/core/collision.ts';
import { blockId } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { ejectSeconds } from '../src/core/firearmAction.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { heldEjectionPose } from '../src/core/heldPose.ts';
import { dropSpots, Inventory } from '../src/core/inventory.ts';
import { PILE_GRID } from '../src/core/inventoryScale.ts';
import { defOf, type Item, typeWeightGrams, weightOf } from '../src/core/items.ts';
import { type PelletShot, pelletSpreadRadians } from '../src/core/pellets.ts';
import { bodyOverlapsTerrain, stepBody } from '../src/core/physics.ts';
import { decodeSave, encodeSave, SAVE_SCHEMA_VERSION, type SaveVersionComponents } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SoundId } from '../src/core/soundEvents.ts';
import { World } from '../src/core/world.ts';
import { equipDebugLoadout } from '../src/debug/debugLoadout.ts';
import { firearmBoreRay } from '../src/game/firearmAim.ts';
import {
  FirearmMechanics,
  type FirearmShotEffect,
  type FirearmTrajectory,
  firearmHandlingFor,
} from '../src/game/firearmHandling.ts';
import { RELOAD_GESTURE_MS, type ReloadBinding, ReloadInput, reloadTarget } from '../src/game/reloadInput.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { baseRegistry } from './baseRegistry.ts';
import { createPlayerBody, PLAYER, physicsFor, steer } from './playerFixture.ts';

const registry = baseRegistry();
const SHELL_LOAD_SECONDS = registry.items.get('pump_shotgun')!.firearm!.roundLoadSimSeconds!;
const shellType = 'shell_12_gauge_00_buck';
const hullType = 'spent_case_12_h_gauge_h_00_h_buck';
const pose = {
  feet: [0, 0, 0] as Vec3,
  eye: [0, 3, 0] as Vec3,
  yaw: 0.4,
  pitch: 0.2,
  aimFrame: { yaw: 0, pitch: 0 },
  blockSize: 0.5,
  ready: true,
  sprinting: false,
};
const fixture = (
  content = registry,
  firearmsSkillLevel: () => number = () => 0,
  ejectionPose = pose,
  isSolid?: (x: number, y: number, z: number) => boolean,
) => {
  // Own the capacity fixture rather than pinning the evolving exported tube count.
  const modelId = content.items.get('pump_shotgun')!.model!;
  const model = content.models.get(modelId)!;
  const capacity = 3;
  const testContent = {
    ...content,
    models: new Map(content.models).set(modelId, { ...model, gun: { ...model.gun, internalMagazine: { capacity } } }),
  };
  const inventory = new Inventory(testContent);
  const gun = inventory.create('pump_shotgun');
  const bag = inventory.create('hiking_backpack');
  const box = inventory.create('shotshell_box');
  const shells = inventory.create(shellType, 20);
  if (
    !(
      inventory.add(gun, { kind: 'hand', side: 'right' }) &&
      inventory.add(bag, { kind: 'worn' }) &&
      inventory.add(box, { kind: 'pocket', owner: bag, pocket: 0 }) &&
      inventory.add(shells, { kind: 'pocket', owner: bag, pocket: 0 })
    )
  ) {
    throw new Error('Pump fixture does not fit');
  }
  const queue = new HandlingQueue(inventory);
  const effects: FirearmShotEffect[] = [];
  const shots: PelletShot[] = [];
  const trajectories: FirearmTrajectory[] = [];
  const sounds: { event: SoundId; time: number }[] = [];
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: ejectionPose.blockSize,
    isSolid: isSolid ?? ((_x, y, _z) => y < ejectionPose.feet[1]),
    pose: () => ejectionPose,
    onEjection: (effect) => effects.push(effect),
    onShot: (shot) => shots.push(shot),
    onTrajectory: (trajectory) => trajectories.push(trajectory),
    onSound: (event, _position, time) => sounds.push({ event, time }),
    firearmsSkillLevel,
  });
  const finish = (dt: number, time: number) => {
    queue.tick(dt);
    mechanics.advanceTo(time);
  };
  const load = (time: number) => {
    const refusal = mechanics.load(shells, time);
    if (refusal) {
      throw new Error(refusal);
    }
    finish(SHELL_LOAD_SECONDS, time + SHELL_LOAD_SECONDS);
  };
  const rack = (time: number) => {
    const refusal = mechanics.cock(gun.uid, time);
    if (refusal) {
      throw new Error(refusal);
    }
    const duration = firearmHandlingFor(gun, inventory.registry).action.hand.durationSimSeconds;
    finish(duration, time + duration);
  };
  const fire = (time: number) => mechanics.fire({ ...ejectionPose, item: gun, seed: 71, simTime: time });
  return {
    inventory,
    gun,
    bag,
    box,
    shells,
    capacity,
    queue,
    mechanics,
    effects,
    shots,
    trajectories,
    sounds,
    finish,
    load,
    rack,
    fire,
  };
};

const runtime = (play: Parameters<typeof createSession>[0]['audio']['play'] = () => undefined) =>
  createSession({
    registry,
    world: new World(),
    isSolid: () => false,
    isOpaque: () => false,
    scale: makeScale(0.5),
    seed: 71,
    start: 0,
    spawn: [0, 0, 0],
    ready: () => false,
    controls: {
      active: () => false,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play },
    notice: () => undefined,
    onRead: () => undefined,
  });

describe('real pump ammunition', () => {
  it('drops a fired hull on supported ground at wall contact when the ejection port is clipped', () => {
    const scale = makeScale(0.5);
    const wallX = 2;
    const world = new World();
    const rock = blockId(registry, 'rock');
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        world.setBlock(x, 0, z, rock);
      }
    }
    for (let y = 1; y <= 7; y++) {
      for (let z = -4; z <= 4; z++) {
        world.setBlock(wallX, y, z, rock);
      }
    }
    const isSolid = worldSolid(world, registry, new BlockEntities(registry));
    const yaw = -Math.PI / 2;
    const body = createPlayerBody(scale, 0.9, 1.01, 0);
    for (let frame = 0; frame < 30; frame++) {
      steer(body, scale, yaw, { forward: 1, right: 0, jump: false, sprint: false, walk: true });
      stepBody(body, 1 / 60, isSolid, physicsFor(scale));
    }
    expect(bodyOverlapsTerrain(body, isSolid)).toBe(false);
    expect(body.onGround).toBe(true);
    const ejectionPose = {
      ...pose,
      feet: [...body.pos] as Vec3,
      eye: [body.pos[0], body.pos[1] + PLAYER.eye / scale.blockSize, body.pos[2]] as Vec3,
      yaw,
      pitch: 0,
      aimFrame: NEUTRAL_AIM,
    };
    const f = fixture(registry, () => 0, ejectionPose, isSolid);
    const port = heldEjectionPose({
      model: firearmHandlingFor(f.gun, f.inventory.registry).model,
      side: 'right',
      twoHanded: defOf(registry, 'pump_shotgun').twoHanded === true,
      eye: ejectionPose.eye.map((value) => value * scale.blockSize) as Vec3,
      yaw,
      pitch: 0,
    }).origin;
    expect(isSolid(...(port.map((value) => Math.floor(value / scale.blockSize)) as Vec3))).toBe(true);
    f.load(0);
    f.rack(1);
    expect(f.fire(3)).toBe(true);
    f.rack(4);
    f.mechanics.advanceTo(8);
    expect(f.effects).toHaveLength(1);
    expect(isSolid(...(f.effects[0]!.origin.map((value) => Math.floor(value / scale.blockSize)) as Vec3))).toBe(false);

    const casePiles = [...f.inventory.piles.values()].filter((pile) =>
      pile.items.some(({ item }) => item.type === hullType),
    );
    expect(casePiles).toHaveLength(1);
    const [casePile] = casePiles;
    expect(casePile!.pos[0]).toBeLessThan(wallX);
    expect(casePile!.pos[1]).toBe(1);
    expect(isSolid(...casePile!.pos)).toBe(false);
    expect(isSolid(casePile!.pos[0], casePile!.pos[1] - 1, casePile!.pos[2])).toBe(true);
  });

  it('lands at the foot of a wall that blocks the outward case path', () => {
    const open = fixture();
    open.load(0);
    open.rack(1);
    expect(open.fire(3)).toBe(true);
    open.rack(4);
    const endpoint = open.effects[0]!.landingPosition;
    const world = new World();
    for (let x = -8; x <= 8; x += 1) {
      for (let z = -8; z <= 8; z += 1) {
        world.setBlock(x, -1, z, 1);
      }
    }
    for (let y = 0; y <= 8; y += 1) {
      world.setBlock(endpoint[0], y, endpoint[2], 1);
    }
    const isSolid = (x: number, y: number, z: number) => world.getBlock(x, y, z) !== 0;
    const f = fixture(registry, () => 0, pose, isSolid);
    f.load(0);
    f.rack(1);
    expect(f.fire(3)).toBe(true);
    f.rack(4);

    const casePile = [...f.inventory.piles.values()].find((pile) =>
      pile.items.some(({ item }) => item.type === hullType),
    );
    expect(f.effects).toHaveLength(1);
    expect(casePile).toBeDefined();
    expect(isSolid(casePile!.pos[0], casePile!.pos[1] - 1, casePile!.pos[2])).toBe(true);
    expect(isSolid(...casePile!.pos)).toBe(false);
  });

  it('chooses a free supported spill cell when the first neighbor is solid terrain', () => {
    const probe = fixture();
    probe.load(0);
    probe.rack(1);
    expect(probe.fire(3)).toBe(true);
    probe.rack(4);
    const landing = [...probe.inventory.piles.values()].find((pile) =>
      pile.items.some(({ item }) => item.type === hullType),
    )?.pos;
    expect(landing).toBeDefined();
    const blockedSpill = dropSpots(landing!)[1]!;
    const world = new World();
    for (let x = -8; x <= 8; x += 1) {
      for (let z = -8; z <= 8; z += 1) {
        world.setBlock(x, -1, z, 1);
      }
    }
    world.setBlock(...blockedSpill, 1);
    const isSolid = (x: number, y: number, z: number) => world.getBlock(x, y, z) !== 0;
    const fillerType = 'owned_spill_filler';
    const content = {
      ...registry,
      items: new Map(registry.items).set(fillerType, {
        ...registry.items.get(shellType)!,
        id: fillerType,
        size: [1, 1] as [number, number],
        stack: 1,
        ammo: undefined,
        model: undefined,
        pileDisplay: undefined,
      }),
    };
    const f = fixture(content, () => 0, pose, isSolid);
    f.load(0);
    f.rack(1);
    expect(f.fire(3)).toBe(true);
    for (let cell = 0; cell < PILE_GRID.w * PILE_GRID.h; cell += 1) {
      expect(f.inventory.add(f.inventory.create(fillerType), { kind: 'pile', pos: landing! })).toBe(true);
    }
    f.rack(4);

    const casePile = [...f.inventory.piles.values()].find((pile) =>
      pile.items.some(({ item }) => item.type === hullType),
    );
    expect(casePile).toBeDefined();
    expect(casePile!.pos).not.toEqual(landing);
    expect(casePile!.pos).not.toEqual(blockedSpill);
    expect(isSolid(casePile!.pos[0], casePile!.pos[1] - 1, casePile!.pos[2])).toBe(true);
    expect(isSolid(...casePile!.pos)).toBe(false);
  });

  it('lands an ejected hull outward from its port along the exported ejection direction', () => {
    const f = fixture();
    f.load(0);
    f.rack(1);
    expect(f.fire(3)).toBe(true);
    f.rack(4);
    const effect = f.effects[0]!;
    const landing = [...f.inventory.piles.values()].find((pile) =>
      pile.items.some(({ item }) => item.type === hullType),
    )?.pos;
    expect(landing).toBeDefined();
    const horizontalDirection = Math.hypot(effect.direction[0], effect.direction[2]);
    const outwardDisplacement =
      ((landing![0] + 0.5) * pose.blockSize - effect.origin[0]) * effect.direction[0] +
      ((landing![2] + 0.5) * pose.blockSize - effect.origin[2]) * effect.direction[2];
    expect(horizontalDirection).toBeGreaterThan(0);
    expect(outwardDisplacement).toBeGreaterThan(0.5 * horizontalDirection);
  });

  it('discards a case when only the player column supports it instead of landing it straight below the port', () => {
    const model = registry.models.get(registry.items.get('pump_shotgun')!.model!)!;
    const ejection = heldEjectionPose({
      model,
      side: 'right',
      twoHanded: registry.items.get('pump_shotgun')!.twoHanded === true,
      eye: pose.eye.map((value) => value * pose.blockSize) as Vec3,
      yaw: pose.yaw,
      pitch: pose.pitch,
    });
    const releaseX = Math.floor(ejection.origin[0] / pose.blockSize);
    const releaseZ = Math.floor(ejection.origin[2] / pose.blockSize);
    const isSolid = (x: number, y: number, z: number) => x === releaseX && z === releaseZ && y < pose.feet[1];
    const f = fixture(registry, () => 0, pose, isSolid);
    f.load(0);
    f.rack(1);
    expect(f.fire(3)).toBe(true);
    f.rack(4);

    expect(f.effects).toHaveLength(0);
    expect([...f.inventory.piles.values()].flatMap(({ items }) => items)).toHaveLength(0);
    expect(f.gun.firearm?.chamber).toBe('empty');
  });

  it('places an ejected shell on the first solid surface below its flight instead of at the thrower height', () => {
    const highPose = { ...pose, feet: [0, 12, 0] as Vec3, eye: [0, 15, 0] as Vec3 };
    const isSolid = (_x: number, blockY: number, _z: number) => blockY === 0 || blockY === 5;
    const f = fixture(registry, () => 0, highPose, isSolid);
    f.load(0);
    f.rack(1);
    f.rack(3);

    const landedPile = [...f.inventory.piles.values()].find((pile) =>
      pile.items.some(({ item }) => item.type === shellType),
    );
    expect(landedPile).toBeDefined();
    const [x, landingY, z] = landedPile!.pos;
    expect(isSolid(x, landingY - 1, z)).toBe(true);
    expect(isSolid(x, landingY, z)).toBe(false);
    expect([...new Array(highPose.feet[1] - landingY).keys()].some((offset) => isSolid(x, landingY + offset, z))).toBe(
      false,
    );
  });

  it('discards an ejected shell rather than spilling onto an unsupported neighboring pile', () => {
    const probe = fixture();
    probe.load(0);
    probe.rack(1);
    probe.rack(3);
    const landing = [...probe.inventory.piles.values()][0]?.pos;
    expect(landing).toBeDefined();

    const fillerType = 'supported_spill_filler';
    const content = {
      ...registry,
      items: new Map(registry.items).set(fillerType, {
        ...registry.items.get(shellType)!,
        id: fillerType,
        name: 'Test filler',
        size: [1, 1] as [number, number],
        stack: 1,
        ammo: undefined,
        model: undefined,
      }),
    };
    const supported = (x: number, y: number, z: number) =>
      x === landing![0] && y === landing![1] - 1 && z === landing![2];
    const f = fixture(content, () => 0, pose, supported);
    f.load(0);
    f.rack(1);
    for (let cell = 0; cell < PILE_GRID.w * PILE_GRID.h; cell++) {
      expect(f.inventory.add(f.inventory.create(fillerType), { kind: 'pile', pos: landing! })).toBe(true);
    }

    expect(f.mechanics.cock(f.gun.uid, 3)).toBeUndefined();
    const duration = firearmHandlingFor(f.gun, content).action.hand.durationSimSeconds;
    f.finish(duration, 3 + duration);
    expect(f.gun.firearm?.chamber).toBe('empty');
    expect([...f.inventory.piles.values()].flatMap(({ items }) => items)).toHaveLength(PILE_GRID.w * PILE_GRID.h);
    expect(f.effects).toHaveLength(1);
  });

  it('never refuses a rack for pile capacity and discards a case when every supported spot is full', () => {
    const probe = fixture();
    probe.load(0);
    probe.rack(1);
    expect(probe.mechanics.cock(probe.gun.uid, 3)).toBeUndefined();
    const duration = firearmHandlingFor(probe.gun, probe.inventory.registry).action.hand.durationSimSeconds;
    probe.finish(duration, 3 + duration);
    const landing = [...probe.inventory.piles.values()][0]?.pos;
    expect(landing).toBeDefined();

    const fillerType = 'owned_pile_filler';
    const content = {
      ...registry,
      items: new Map(registry.items).set(fillerType, {
        ...registry.items.get(shellType)!,
        id: fillerType,
        name: 'Test filler',
        size: [1, 1] as [number, number],
        stack: 1,
        ammo: undefined,
        model: undefined,
      }),
    };
    const fill = (inventory: Inventory, positions: readonly [number, number, number][]) => {
      for (const pos of positions) {
        for (let cell = 0; cell < PILE_GRID.w * PILE_GRID.h; cell++) {
          expect(inventory.add(inventory.create(fillerType), { kind: 'pile', pos })).toBe(true);
        }
      }
    };

    const spill = fixture(content);
    spill.load(0);
    spill.rack(1);
    fill(spill.inventory, [landing!]);
    expect(spill.mechanics.cock(spill.gun.uid, 3)).toBeUndefined();
    spill.finish(duration, 3 + duration);
    const spilled = [...spill.inventory.piles.values()].find((pile) =>
      pile.items.some(({ item }) => item.type === shellType),
    );
    expect(spilled).toBeDefined();
    expect(spilled!.pos).not.toEqual(landing);
    expect(dropSpots(landing!).some((spot) => spot.every((value, axis) => value === spilled!.pos[axis]))).toBe(true);

    for (const spent of [false, true]) {
      const f = fixture(content);
      f.load(0);
      f.rack(1);
      if (spent) {
        expect(f.fire(3)).toBe(true);
      }
      fill(f.inventory, dropSpots(landing!));
      expect(f.mechanics.cock(f.gun.uid, 4)).toBeUndefined();
      f.finish(duration, 4 + duration);
      const outputType = spent ? hullType : shellType;
      expect(f.effects).toHaveLength(1);
      expect(f.gun.firearm?.chamber).toBe('empty');
      expect(f.gun.firearm?.landings).toBeUndefined();
      expect([...f.inventory.piles.values()].flatMap((pile) => pile.items.map(({ item }) => item.type))).not.toContain(
        outputType,
      );
      for (const pile of f.inventory.piles.values()) {
        expect(pile.items.every(({ item }) => item.type === fillerType)).toBe(true);
        expect(dropSpots(landing!).some((spot) => spot.every((value, axis) => value === pile.pos[axis]))).toBe(true);
        expect(f.inventory.registry.items.has(fillerType)).toBe(true);
      }
    }
  });
  it('cannot load authored shells from a sealed unopened box', () => {
    const f = fixture();
    f.inventory.consume(f.shells, 20);
    expect(f.box.pockets).toBeUndefined();
    expect(f.mechanics.loadNext(f.gun.uid, 0)).toBeDefined();
    expect(f.queue.jobs).toEqual([]);
    expect(f.gun.firearm?.tube).toEqual([]);
    expect(f.inventory.itemByUid(f.box.uid)).toBe(f.box);
  });

  it('gives the pump loadout one stack of loose shells, which the pump loads from', () => {
    const inventory = new Inventory(registry);
    expect(equipDebugLoadout(inventory, true, true, '?loadout=pump')).toBe(true);
    const gun = inventory.hands[dominantSide(inventory.character)]!;
    const looseShells = () => [...inventory.items()].map(({ item }) => item).filter(({ type }) => type === shellType);
    expect(looseShells()).toHaveLength(1);
    const [stack] = looseShells();
    expect(stack!.count).toBeGreaterThan(1);
    const carried = stack!.count;
    const queue = new HandlingQueue(inventory);
    const mechanics = new FirearmMechanics(inventory, queue, {
      blockSize: 0.5,
      pose: () => pose,
      onEjection: () => [],
    });
    expect(mechanics.loadNext(gun.uid, 0)).toBeUndefined();
    queue.tick(SHELL_LOAD_SECONDS);
    mechanics.advanceTo(SHELL_LOAD_SECONDS);
    expect(gun.firearm?.tube).toEqual([shellType]);
    expect(looseShells().map(({ uid, count }) => ({ uid, count }))).toEqual([{ uid: stack!.uid, count: carried - 1 }]);
  });

  it('takes loose carried shells by ascending UID rather than pocket traversal order', () => {
    const f = fixture();
    f.inventory.consume(f.shells, 19);
    const later = f.inventory.create(shellType);
    expect(
      f.inventory.add(later, { kind: 'pocket', owner: f.bag, pocket: 0, at: { x: 4, y: 0, rotated: false } }),
    ).toBe(true);
    expect(
      f.inventory.move(f.shells, { kind: 'pocket', owner: f.bag, pocket: 0, at: { x: 5, y: 0, rotated: false } }).ok,
    ).toBe(true);
    expect(f.bag.pockets![0]!.filter(({ item }) => item.type === shellType).map(({ item }) => item.uid)).toEqual([
      later.uid,
      f.shells.uid,
    ]);
    expect(f.mechanics.loadNext(f.gun.uid, 0)).toBeUndefined();
    expect(f.queue.jobs[0]).toMatchObject({ params: { ammoUid: f.shells.uid } });
    f.finish(SHELL_LOAD_SECONDS, SHELL_LOAD_SECONDS);
    expect(f.inventory.itemByUid(f.shells.uid)).toBeUndefined();
    expect(f.inventory.itemByUid(later.uid)?.count).toBe(1);
  });
  it.each([{ available: 20 }, { available: 2 }])(
    'holding R stops at capacity or exhaustion with $available fixture shells',
    ({ available }) => {
      const f = fixture();
      const loaded = Math.min(available, f.capacity);
      f.inventory.consume(f.shells, 20 - available);
      const input = new ReloadInput();
      let now = RELOAD_GESTURE_MS.hold;
      const binding = {
        uid: f.gun.uid,
        busy: () => f.queue.busy || f.mechanics.busy,
        load: () => f.mechanics.loadNext(f.gun.uid, now / 1000) === undefined,
        rack: () => f.mechanics.cock(f.gun.uid, now / 1000) === undefined,
        remove: () => undefined,
        cancelLoad: () => f.mechanics.cancelLoad(f.gun.uid),
      };
      input.keyDown(0, binding);
      input.advance(now, binding);
      for (let i = 0; i < 5; i++) {
        now += SHELL_LOAD_SECONDS * 1000;
        f.finish(SHELL_LOAD_SECONDS, now / 1000);
        input.advance(now, binding);
      }
      expect(f.gun.firearm?.tube).toHaveLength(loaded);
      expect(f.inventory.itemByUid(f.shells.uid)?.count ?? 0).toBe(available - loaded);
      expect(f.queue.jobs).toEqual([]);
      input.keyUp(now);
    },
  );

  it('R release cancels a partial insert without losing a shell or discarding unrelated queued handling', () => {
    const f = fixture();
    const input = new ReloadInput();
    const binding = {
      uid: f.gun.uid,
      busy: () => f.queue.busy,
      load: () => f.mechanics.loadNext(f.gun.uid, 0.25) === undefined,
      rack: () => f.mechanics.cock(f.gun.uid, 0.25) === undefined,
      remove: () => undefined,
      cancelLoad: () => f.mechanics.cancelLoad(f.gun.uid),
    };
    input.keyDown(0, binding);
    input.advance(RELOAD_GESTURE_MS.hold, binding);
    f.finish(SHELL_LOAD_SECONDS / 2, 0.7);
    f.queue.registerAction('test.other', () => undefined);
    const other = f.queue.enqueueAction('test.other', 'Unrelated job', 1, {});
    input.keyUp(750);
    input.advance(1000, binding);
    expect(f.shells.count).toBe(20);
    expect(f.gun.firearm?.tube).toEqual([]);
    expect(f.queue.jobs).toEqual([other]);
  });

  it('conserves loaded shells across tube/chamber, firing and manual hull ejection without an automatic cycle', () => {
    const f = fixture();
    expect(f.fire(0)).toBe(false);
    const mass = f.inventory.carriedWeight();
    const initialCount = f.shells.count;
    for (let i = 0; i < f.capacity; i++) {
      f.load(i);
    }
    expect(f.mechanics.loadReason(f.shells)).toBeDefined();
    expect(f.gun.firearm?.tube).toHaveLength(f.capacity);
    f.rack(5);
    f.load(7);
    expect(f.inventory.carriedWeight()).toBe(mass);
    expect(f.shells.count).toBe(initialCount - f.capacity - 1);
    expect(f.gun.firearm).toMatchObject({
      chamber: 'round',
      roundType: shellType,
      tube: Array.from({ length: f.capacity }, () => shellType),
    });
    expect(f.fire(8)).toBe(true);
    expect(f.gun.firearm?.cycle).toBeUndefined();
    expect(f.gun.firearm?.chamber).toBe('case');
    expect(f.inventory.carriedWeight()).toBeCloseTo(
      mass - typeWeightGrams(registry, shellType) + typeWeightGrams(registry, hullType),
      8,
    );
    expect(f.fire(8.1)).toBe(false);
    f.rack(9);
    expect(f.gun.firearm).toMatchObject({
      chamber: 'round',
      roundType: shellType,
      tube: Array.from({ length: f.capacity - 1 }, () => shellType),
    });
    expect([...f.inventory.items()].filter(({ item }) => item.type === hullType).map(({ item }) => item.count)).toEqual(
      [1],
    );
  });

  it('cancels a partially completed next shell without consuming it or undoing an already loaded shell', () => {
    const f = fixture();
    f.load(0);
    expect(f.mechanics.load(f.shells, 1)).toBeUndefined();
    f.finish(SHELL_LOAD_SECONDS / 2, 1 + SHELL_LOAD_SECONDS / 2);
    expect(f.mechanics.frames()[0]).toMatchObject({
      mode: 'load',
      roundType: shellType,
      elapsed: SHELL_LOAD_SECONDS / 2,
    });
    f.queue.cancel();
    f.mechanics.advanceTo(2);
    expect(f.shells.count).toBe(19);
    expect(f.gun.firearm?.tube).toEqual([shellType]);
    expect(f.mechanics.frames()).toEqual([]);
    f.load(3);
    expect(f.shells.count).toBe(18);
    expect(f.gun.firearm?.tube).toEqual([shellType, shellType]);
  });

  it.each([
    { holdCycles: Number.POSITIVE_INFINITY, label: 'until the gun is empty' },
    { holdCycles: 1.5, label: 'released mid-rack, finishing that rack only' },
  ])('a tap, then a held press, racks the pump again and again: $label', ({ holdCycles }) => {
    const f = fixture();
    for (let i = 0; i < f.capacity; i++) {
      f.load(i);
    }
    f.rack(f.capacity);
    const inGun = 1 + f.gun.firearm!.tube!.length;
    const target = reloadTarget(
      f.mechanics,
      {
        reloadableUid: () => undefined,
        loadNext: () => 'No magazine',
        cancelLoad: () => undefined,
      },
      'fixture not holding a gun',
    )!;
    let now = f.capacity * 1000 + 1000;
    const binding: ReloadBinding = {
      uid: target.uid,
      busy: () => f.queue.busy || f.mechanics.busy,
      load: () => target.load(now / 1000) === undefined,
      rack: () => target.rack(now / 1000) === undefined,
      remove: () => target.remove(now / 1000),
      ...(target.stillLoaded ? { stillLoaded: target.stillLoaded } : {}),
      cancelLoad: target.cancelLoad,
    };
    const frame = (ms: number) => {
      now += ms;
      f.finish(ms / 1000, now / 1000);
      input.advance(now, binding);
    };
    const input = new ReloadInput();
    input.keyDown(now, binding);
    frame(RELOAD_GESTURE_MS.doublePress / 3);
    input.keyUp(now);
    input.keyDown(now, binding);
    const held = now;
    const rackMs = firearmHandlingFor(f.gun, registry).action.hand.durationSimSeconds * 1000;
    const releaseAt = held + RELOAD_GESTURE_MS.hold + holdCycles * rackMs;
    let landing: Vec3 | undefined;
    for (let step = 0; step < (inGun + 2) * (rackMs / 16 + 2); step++) {
      if (now >= releaseAt) {
        input.keyUp(now);
      }
      frame(16);
      landing ??= [...f.inventory.piles.values()].find((pile) =>
        pile.items.some(({ item }) => item.type === shellType),
      )?.pos;
    }
    const ejected = Number.isFinite(holdCycles) ? Math.ceil(holdCycles) : inGun;
    const ground = [...f.inventory.piles.values()].flatMap((pile) =>
      pile.items.filter(({ item }) => item.type === shellType).map(({ item }) => [pile.pos, item.count]),
    );
    // Every live shell racked out lies, as one stack, in the pile of the block the first one landed on.
    expect(ground).toEqual([[landing, ejected]]);
    expect(1 + f.gun.firearm!.tube!.length - (f.gun.firearm!.chamber === 'empty' ? 1 : 0)).toBe(inGun - ejected);
    expect(f.queue.busy).toBe(false);
  });

  it('ejects a live shell only at the exported hand threshold/direction and keeps it out of the spent counter', () => {
    const f = fixture();
    f.load(0);
    f.rack(1);
    expect(f.mechanics.cock(f.gun.uid, 3)).toBeUndefined();
    const model = registry.models.get('shotgun_pump')!;
    const at = model.gun!.action!.hand.rearwardSimSeconds * model.gun!.action!.ejectAt;
    f.finish(at - 1e-6, 3 + at - 1e-6);
    expect(f.effects).toEqual([]);
    f.finish(1e-6, 3 + at);
    const expected = heldEjectionPose({
      model,
      side: 'right',
      twoHanded: true,
      eye: pose.eye.map((v) => v * pose.blockSize) as Vec3,
      yaw: pose.yaw,
      pitch: pose.pitch,
    });
    expect(f.effects).toHaveLength(1);
    expect(f.effects[0]).toMatchObject({ ...expected, caseModelId: registry.items.get(shellType)!.model });
    expect(f.gun.firearm?.chamber).toBe('empty');
    expect([...f.inventory.piles.values()].flatMap((pile) => pile.items.map(({ item }) => item.type))).not.toContain(
      shellType,
    );
    const landingAt = f.gun.firearm?.landings?.[0]?.at;
    expect(landingAt).toBeDefined();
    const duration = model.gun!.action!.hand.durationSimSeconds;
    f.finish(landingAt! - (3 + at), landingAt!);
    const ground = [...f.inventory.piles.values()].flatMap((pile) => pile.items.map(({ item }) => item));
    expect(ground.map((item) => [item.type, item.count])).toEqual([[shellType, 1]]);
    f.finish(Math.max(0, 3 + duration - landingAt!), 3 + duration);
    expect(f.gun.firearm?.chamber).toBe('empty');
    expect(f.fire(5)).toBe(false);
    expect(f.effects).toHaveLength(1);
  });

  it('preserves real tube contents in the save copy while cancelling hand motion and rejects capacity/calibre corruption', async () => {
    const s = runtime();
    const f = fixture();
    f.load(0);
    f.load(1);
    f.rack(2);
    f.load(4);
    expect(f.mechanics.cock(f.gun.uid, 5)).toBeUndefined();
    const snapshot = s.snapshot({ worldId: 'pump-world', characterId: 'pump-character' });
    const saved = { ...snapshot, character: { ...snapshot.character, inventory: f.inventory.snapshotState() } };
    const version: SaveVersionComponents = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      simulationHash: 'a'.repeat(64),
      generators: {},
      contentPacks: [],
    };
    const bytes = await encodeSave(saved, {
      generation: 1,
      version,
      worldOptions: { blockSize: 0.5, site: 'testHouse', storeys: 1, density: 0.75 },
    });
    const decoded = await decodeSave(bytes, { version, contentLookup: () => true });
    const restored = Inventory.restoreState(f.inventory.registry, decoded.snapshot.character.inventory);
    expect(restored.hands.right?.firearm).toEqual({
      chamber: 'round',
      roundType: shellType,
      tube: [shellType, shellType],
    });
    expect(f.gun.firearm?.cycle?.mode).toBe('hand');
    for (const tube of [Array.from({ length: f.capacity + 1 }, () => shellType), ['canned_beans']]) {
      const corrupt = structuredClone(decoded.snapshot.character.inventory);
      corrupt.hands.right!.firearm!.tube = tube;
      expect(() => Inventory.restoreState(f.inventory.registry, corrupt)).toThrow();
    }
    expect(weightOf(registry, restored.hands.right!)).toBeCloseTo(
      typeWeightGrams(registry, 'pump_shotgun') + 3 * typeWeightGrams(registry, shellType),
      8,
    );
  });

  it('keeps an unejected fired hull in the save copy while cancelling only the rack motion', () => {
    const f = fixture();
    f.load(0);
    f.rack(1);
    expect(f.fire(3)).toBe(true);
    expect(f.mechanics.cock(f.gun.uid, 4)).toBeUndefined();
    const beforeEjection = ejectSeconds(firearmHandlingFor(f.gun, registry).action, 'hand') / 2;
    f.queue.tick(beforeEjection);
    f.mechanics.advanceTo(4 + beforeEjection);
    const { pendingCase } = f.gun.firearm!;
    const saved = f.inventory.snapshotState();
    expect(saved.hands.right?.firearm).toMatchObject({ chamber: 'case', pendingCase });
    expect(saved.hands.right?.firearm?.cycle).toBeUndefined();
    expect(f.gun.firearm?.cycle?.mode).toBe('hand');
    expect(Inventory.restoreState(f.inventory.registry, saved).hands.right?.firearm?.pendingCase).toEqual(pendingCase);
    f.queue.cancel();
    f.mechanics.advanceTo(4 + beforeEjection * 2);
    expect(f.gun.firearm?.cycle).toBeUndefined();
    expect(f.gun.firearm?.chamber).toBe('case');
  });

  it('commits skill-scaled reload and rack durations to their presentation frames', () => {
    const novice = fixture(registry, () => SKILL_LEVEL_MIN);
    const experienced = fixture(registry, () => SKILL_LEVEL_MAX);
    expect(novice.mechanics.load(novice.shells, 0)).toBeUndefined();
    expect(experienced.mechanics.load(experienced.shells, 0)).toBeUndefined();
    const noviceReload = novice.mechanics.frames()[0]!;
    const experiencedReload = experienced.mechanics.frames()[0]!;
    expect(experiencedReload.duration).toBeLessThan(noviceReload.duration!);
    expect(experiencedReload.duration).toBe(experienced.queue.jobs[0]!.duration);

    const noviceRack = fixture(registry, () => SKILL_LEVEL_MIN);
    const experiencedRack = fixture(registry, () => SKILL_LEVEL_MAX);
    expect(noviceRack.mechanics.cock(noviceRack.gun.uid, 0)).toBeUndefined();
    expect(experiencedRack.mechanics.cock(experiencedRack.gun.uid, 0)).toBeUndefined();
    const noviceRackFrame = noviceRack.mechanics.frames()[0]!;
    const experiencedRackFrame = experiencedRack.mechanics.frames()[0]!;
    expect(experiencedRackFrame.duration).toBeLessThan(noviceRackFrame.duration!);
    expect(experiencedRackFrame.duration).toBe(experiencedRack.queue.jobs[0]!.duration);
    expect(experiencedRack.gun.firearm!.cycle!.duration).toBe(experiencedRackFrame.duration);
  });

  it('centres ammo-base and firearm-scaled pellet spread on the bore', () => {
    const f = fixture();
    f.load(0);
    f.rack(1);
    const aimFrame = { yaw: 0.1, pitch: -0.06 };
    expect(f.mechanics.fire({ ...pose, item: f.gun, seed: 71, simTime: 3, aimFrame })).toBe(true);
    expect(f.trajectories[0]?.directions).toEqual(f.shots[0]?.directions);
    const tuning = registry.skills.get('firearms_combat')!.combat!.firearms!;
    const bore = firearmBoreRay({
      model: firearmHandlingFor(f.gun, registry).model,
      eye: pose.eye,
      yaw: pose.yaw,
      pitch: pose.pitch,
      blockSize: pose.blockSize,
      side: 'right',
      leadingSide: 'right',
      twoHanded: true,
      aimFrame,
      loweredPitchRadians: tuning.loweredPitchRadians,
    });
    const ammo = registry.items.get(shellType)!.ammo!;
    const firearm = registry.items.get(f.gun.type)!.firearm!;
    const spread = pelletSpreadRadians(ammo, firearm);
    expect(pelletSpreadRadians({ ...ammo, spreadDegrees: ammo.spreadDegrees * 2 }, firearm)).toBeCloseTo(spread * 2);
    expect(pelletSpreadRadians(ammo, { ...firearm, pelletSpreadScale: firearm.pelletSpreadScale * 2 })).toBeCloseTo(
      spread * 2,
    );
    expect(
      f.shots[0]!.directions.every(
        (ray) =>
          ray.reduce((sum, component, index) => sum + component * bore.direction[index]!, 0) >= Math.cos(spread) - 1e-9,
      ),
    ).toBe(true);
  });

  it('uses cartridge pellet count/diameter and a distinct deterministic shot stream', () => {
    const a = fixture();
    const b = fixture();
    for (const f of [a, b]) {
      f.load(0);
      f.rack(1);
      expect(f.fire(3)).toBe(true);
    }
    const ammo = registry.items.get(shellType)!.ammo!;
    expect(a.shots[0]?.directions).toHaveLength(ammo.pellets);
    expect(a.shots[0]?.diameterMm).toBe(ammo.diameterMm);
    expect(a.shots).toEqual(b.shots);
    expect(new Set(a.shots[0]!.directions.map((vector) => vector.join(','))).size).toBe(ammo.pellets);
    expect(a.shots[0]!.directions.every((direction) => Math.abs(Math.hypot(...direction) - 1) < 1e-9)).toBe(true);
    const changed = { ...registry, items: new Map(registry.items) };
    changed.items.set(shellType, {
      ...registry.items.get(shellType)!,
      ammo: { ...ammo, pellets: 7, diameterMm: 9.1, damage: ammo.damage * 2 },
    });
    const fromData = fixture(changed);
    fromData.load(0);
    fromData.rack(1);
    expect(fromData.fire(3)).toBe(true);
    expect(fromData.shots[0]?.diameterMm).toBe(9.1);
    expect([fromData.shots[0]!.damage, a.shots[0]!.damage]).toEqual([ammo.damage * 2, ammo.damage]);
    expect(fromData.shots[0]!.directions).toHaveLength(7);
  });

  it('admits one loud F4 blast/noise before unavailable output can veto it', () => {
    const s = runtime(() => false);
    const gun = s.inventory.create('pump_shotgun');
    const bag = s.inventory.create('hiking_backpack');
    const shell = s.inventory.create(shellType);
    expect(s.inventory.add(gun, { kind: 'hand', side: 'right' })).toBe(true);
    expect(s.inventory.add(bag, { kind: 'worn' })).toBe(true);
    expect(s.inventory.add(shell, { kind: 'pocket', owner: bag, pocket: 0 })).toBe(true);
    expect(s.firearms.load(shell, 0)).toBeUndefined();
    s.queue.tick(SHELL_LOAD_SECONDS);
    s.firearms.advanceTo(SHELL_LOAD_SECONDS);
    expect(s.firearms.cock(gun.uid, SHELL_LOAD_SECONDS)).toBeUndefined();
    const duration = firearmHandlingFor(gun, registry).action.hand.durationSimSeconds;
    s.queue.tick(duration);
    const shotAt = SHELL_LOAD_SECONDS + duration + 1;
    s.firearms.advanceTo(shotAt);
    const events = s.sim.events.reader();
    expect(s.firearms.fire({ ...pose, item: gun, seed: 71, simTime: shotAt })).toBe(true);
    const emitted = events.read().filter((event) => event.kind === 'sound' || event.kind === 'noise');
    const { shotSound, shotBodySound } = defOf(registry, gun.type).firearm!;
    expect(emitted.map((event) => [event.kind, event.event])).toEqual([
      ['sound', shotSound],
      ['noise', shotSound],
      ['sound', shotBodySound],
    ]);
    expect(s.playerAudio.vocalNoise?.radiusMetres).toBe(registry.sounds.get(shotSound)!.noise.radiusMetres);
    expect(s.playerAudio.vocalNoise?.radiusMetres).toBeGreaterThan(0);
    expect(s.audioState().events.find((event) => event.event === shotSound)?.lastPlayedAt).toBe(shotAt);
    expect(gun.firearm?.chamber).toBe('case');
  });

  it('syncs split rack cues to rear/forward phases and preserves a single hull landing cue across restore', () => {
    const f = fixture();
    f.load(0);
    f.rack(1);
    expect(f.fire(3)).toBe(true);
    expect(f.mechanics.cock(f.gun.uid, 4)).toBeUndefined();
    const action = registry.models.get('shotgun_pump')!.gun!.action!;
    const ejectAt = action.hand.rearwardSimSeconds * action.ejectAt;
    f.finish(ejectAt, 4 + ejectAt);
    const restored = Inventory.restoreState(f.inventory.registry, f.inventory.snapshotState());
    const cues: { event: SoundId; time: number }[] = [];
    const landedCases: Item[] = [];
    const mechanics = new FirearmMechanics(restored, new HandlingQueue(restored), {
      blockSize: pose.blockSize,
      pose: () => pose,
      isSolid: (_x, y, _z) => y < 0,
      onEjection: () => undefined,
      onCaseLanded: (_seed, item) => landedCases.push(item),
      onSound: (event, _position, time) => cues.push({ event, time }),
    });
    expect(f.gun.firearm?.landings).toHaveLength(1);
    const landingAt = f.gun.firearm!.landings![0]!.at;
    mechanics.advanceTo(landingAt - 1e-6);
    expect(cues).toEqual([]);
    mechanics.advanceTo(landingAt);
    mechanics.advanceTo(landingAt + 1);
    expect(landedCases).toHaveLength(1);
    expect(cues).toEqual([{ event: 'shotgun_hull_drop', time: landingAt }]);
    const forwardAt = action.hand.rearwardSimSeconds + action.hand.dwellSimSeconds;
    f.finish(forwardAt - ejectAt, 4 + forwardAt);
    expect(f.sounds.filter((cue) => cue.time >= 4)).toEqual([
      { event: 'shotgun_rack_back', time: 4 },
      { event: 'shotgun_rack_forward', time: 4 + forwardAt },
    ]);
  });

  it('uses posed-region damage and solid occlusion without starting a melee swing', () => {
    const open = runtime();
    const blocked = createSession({
      registry,
      world: new World(),
      isSolid: (_x, _y, z) => z === -4,
      isOpaque: () => false,
      scale: makeScale(0.5),
      seed: 71,
      start: 0,
      spawn: [0, 0, 0],
      ready: () => false,
      controls: {
        active: () => false,
        intent: () => IDLE,
        yaw: () => 0,
        pitch: () => 0,
        walking: () => false,
        descending: () => false,
      },
      audio: { play: () => undefined },
      notice: () => undefined,
      onRead: () => undefined,
    });
    const type = registry.zombies.get('shambler')!;
    const a = open.zombies.add(type, [0, 0, -8]);
    const b = blocked.zombies.add(type, [0, 0, -8]);
    const shot: PelletShot = {
      origin: [0, 2, 0],
      directions: [[0, 0, -1]],
      damage: 20,
      impulse: 0.35,
      diameterMm: 8.38,
      rangeMetres: 50,
    };
    const before = structuredClone(open.zombieStore.get(a)!.regions);
    expect(open.zombies.firePellets(shot)).toBe(1);
    expect(blocked.zombies.firePellets(shot)).toBe(0);
    expect(open.zombieStore.get(a)!.regions).not.toEqual(before);
    expect(blocked.zombieStore.get(b)!.regions).toEqual(before);
    expect(open.playerCombat.activeMeleeAction).toBeUndefined();
  });
});
