import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aimDirection } from '../src/core/aim.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { heldEjectionPose } from '../src/core/heldPose.ts';
import { dropSpots, Inventory, PILE_GRID } from '../src/core/inventory.ts';
import { weightOf } from '../src/core/items.ts';
import { BUCK_HALF_ANGLE, type PelletShot } from '../src/core/pellets.ts';
import { decodeSave, encodeSave, SAVE_SCHEMA_VERSION, type SaveVersionComponents } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SoundEventId } from '../src/core/soundEvents.ts';
import { World } from '../src/core/world.ts';
import {
  FirearmMechanics,
  type FirearmShotEffect,
  type FirearmTrajectory,
  firearmHandlingFor,
  SHELL_LOAD_SECONDS,
} from '../src/game/firearmHandling.ts';
import { RELOAD_GESTURE_MS, ReloadInput } from '../src/game/reloadInput.ts';
import { createSession, IDLE } from '../src/game/session.ts';

const base = 'src/content/base';
const { registry, issues } = buildRegistry(
  readdirSync(base)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown })),
);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}
const shellType = 'shell_12_gauge_00_buck';
const hullType = 'spent_case_12_h_gauge_h_00_h_buck';
const pose = {
  feet: [0, 0, 0] as Vec3,
  eye: [0, 3, 0] as Vec3,
  yaw: 0.4,
  pitch: 0.2,
  aimFrame: { yaw: 0, pitch: 0 },
  blockSize: 0.5,
};
const fixture = (content = registry, firearmsSkillLevel: () => number = () => 0) => {
  // Own the capacity fixture rather than pinning the evolving exported tube count.
  const modelId = content.items.get('pump_shotgun')!.model!;
  const model = content.models.get(modelId)!;
  const capacity = 3;
  const testContent = { ...content, models: new Map(content.models).set(modelId, { ...model, tube: { capacity } }) };
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
  const sounds: { event: SoundEventId; time: number }[] = [];
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: pose.blockSize,
    pose: () => pose,
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
    const duration = firearmHandlingFor(gun, inventory.registry).action.hand.durationSeconds;
    finish(duration, time + duration);
  };
  const fire = (time: number) => mechanics.fire({ ...pose, item: gun, seed: 71, simTime: time, debugMode: false });
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
  it('ejection spills from a full landing pile and refuses a rack when all drop spots are full', () => {
    // Discover the landing through a successful public rack, not a golden coordinate
    // or a duplicated flight estimate. The actual scenarios use independent inventories.
    const probe = fixture();
    probe.load(0);
    probe.rack(1);
    expect(probe.mechanics.cock(probe.gun.uid, 3)).toBeUndefined();
    const duration = firearmHandlingFor(probe.gun, probe.inventory.registry).action.hand.durationSeconds;
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
    const scenarios = [
      { spent: false, blocked: false },
      { spent: false, blocked: true },
      { spent: true, blocked: false },
      { spent: true, blocked: true },
    ];
    const isSpillSpot = (pos: [number, number, number]) =>
      pos.some((value, axis) => value !== landing![axis]) &&
      dropSpots(landing!).some((spot) => spot.every((value, axis) => value === pos[axis]));
    const capture = (f: ReturnType<typeof fixture>) =>
      structuredClone({
        inventory: f.inventory.snapshotState(),
        firearm: f.gun.firearm,
        jobs: f.queue.jobs,
      });
    const attemptRack = (f: ReturnType<typeof fixture>) => {
      try {
        const reason = f.mechanics.cock(f.gun.uid, 4);
        if (reason === undefined) {
          f.finish(duration, 4 + duration);
        }
        return { reason, error: undefined };
      } catch (error) {
        return { reason: undefined, error };
      }
    };
    const outcomes = scenarios.map(({ spent, blocked }) => {
      const f = fixture(content);
      f.load(0);
      f.rack(1);
      if (spent) {
        expect(f.fire(3)).toBe(true);
      }
      const positions = blocked ? dropSpots(landing!) : [landing!];
      fill(f.inventory, positions);
      const before = capture(f);
      const { reason, error } = attemptRack(f);
      const outputType = spent ? hullType : shellType;
      const output = [...f.inventory.piles.values()].filter((pile) =>
        pile.items.some(({ item }) => item.type === outputType),
      );
      return {
        spent,
        blocked,
        error,
        reason,
        before,
        after: capture(f),
        ejected: f.effects.length === 1,
        spilled: output.length === 1 && isSpillSpot(output[0]!.pos),
      };
    });
    // Collect both live and fired outcomes before asserting, so pristine evidence
    // exercises both former throwing branches rather than stopping at the first.
    expect(outcomes.map((outcome) => outcome.error)).toEqual(outcomes.map(() => undefined));
    for (const outcome of outcomes) {
      if (outcome.blocked) {
        expect(outcome.reason).toBeDefined();
        expect(outcome.after).toEqual(outcome.before); // no chamber/UID/job admission side effects
        expect(outcome.ejected).toBe(false);
      } else {
        expect(outcome.reason).toBeUndefined();
        expect(outcome.ejected).toBe(true);
        expect(outcome.spilled).toBe(true);
      }
    }
    // Another actor/debug spawn can change a pile while an admitted rack runs.
    // Completion must revalidate without clearing the chamber or throwing.
    const concurrent = fixture(content);
    concurrent.load(0);
    concurrent.rack(1);
    expect(concurrent.mechanics.cock(concurrent.gun.uid, 4)).toBeUndefined();
    fill(concurrent.inventory, dropSpots(landing!));
    const beforeCompletion = concurrent.inventory.snapshotState();
    const result = concurrent.queue.tick(duration);
    concurrent.mechanics.advanceTo(4 + duration);
    expect(concurrent.inventory.snapshotState()).toEqual(beforeCompletion);
    expect(concurrent.effects).toEqual([]);
    expect(result.failed.length).toBeGreaterThan(0);
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
        rack: () => {
          f.mechanics.cock(f.gun.uid, now / 1000);
        },
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
      rack: () => {
        f.mechanics.cock(f.gun.uid, 0.25);
      },
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
    expect(f.inventory.carriedWeight()).toBe(
      mass - registry.items.get(shellType)!.weight + registry.items.get(hullType)!.weight,
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

  it('ejects a live shell only at the exported hand threshold/direction and keeps it out of the spent counter', () => {
    const f = fixture();
    f.load(0);
    f.rack(1);
    expect(f.mechanics.cock(f.gun.uid, 3)).toBeUndefined();
    const model = registry.models.get('shotgun_pump')!;
    const at = model.action!.hand.rearwardSeconds * model.action!.ejectAt;
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
    const ground = [...f.inventory.piles.values()].flatMap((pile) => pile.items.map(({ item }) => item));
    expect(ground.map((item) => [item.type, item.count])).toEqual([[shellType, 1]]);
    const duration = model.action!.hand.durationSeconds;
    f.finish(duration - at, 3 + duration);
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
    expect(weightOf(registry, restored.hands.right!)).toBe(
      registry.items.get('pump_shotgun')!.weight + 3 * registry.items.get(shellType)!.weight,
    );
  });

  it('commits skill-scaled reload and rack durations to their presentation frames', () => {
    const novice = fixture(registry, () => 0);
    const experienced = fixture(registry, () => 12);
    expect(novice.mechanics.load(novice.shells, 0)).toBeUndefined();
    expect(experienced.mechanics.load(experienced.shells, 0)).toBeUndefined();
    const noviceReload = novice.mechanics.frames()[0]!;
    const experiencedReload = experienced.mechanics.frames()[0]!;
    expect(experiencedReload.duration).toBeLessThan(noviceReload.duration!);
    expect(experiencedReload.duration).toBe(experienced.queue.jobs[0]!.duration);

    const noviceRack = fixture(registry, () => 0);
    const experiencedRack = fixture(registry, () => 12);
    expect(noviceRack.mechanics.cock(noviceRack.gun.uid, 0)).toBeUndefined();
    expect(experiencedRack.mechanics.cock(experiencedRack.gun.uid, 0)).toBeUndefined();
    const noviceRackFrame = noviceRack.mechanics.frames()[0]!;
    const experiencedRackFrame = experiencedRack.mechanics.frames()[0]!;
    expect(experiencedRackFrame.duration).toBeLessThan(noviceRackFrame.duration!);
    expect(experiencedRackFrame.duration).toBe(experiencedRack.queue.jobs[0]!.duration);
    expect(experiencedRack.gun.firearm!.cycle!.duration).toBe(experiencedRackFrame.duration);
  });

  it('centres pump pellets on the supplied aim frame', () => {
    const f = fixture();
    f.load(0);
    f.rack(1);
    const aimFrame = { yaw: 0.1, pitch: -0.06 };
    expect(f.mechanics.fire({ ...pose, item: f.gun, seed: 71, simTime: 3, debugMode: false, aimFrame })).toBe(true);
    expect(f.trajectories[0]?.directions).toEqual(f.shots[0]?.directions);
    const center = aimDirection(pose.yaw, pose.pitch, aimFrame);
    expect(
      f.shots[0]!.directions.every(
        (ray) =>
          ray.reduce((sum, component, index) => sum + component * center[index]!, 0) >=
          Math.cos(BUCK_HALF_ANGLE) - 1e-9,
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
    changed.items.set(shellType, { ...registry.items.get(shellType)!, ammo: { ...ammo, pellets: 7, diameterMm: 9.1 } });
    const fromData = fixture(changed);
    fromData.load(0);
    fromData.rack(1);
    expect(fromData.fire(3)).toBe(true);
    expect(fromData.shots[0]?.diameterMm).toBe(9.1);
    expect(fromData.shots[0]!.damage / a.shots[0]!.damage).toBeCloseTo((9.1 / ammo.diameterMm) ** 3);
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
    const duration = firearmHandlingFor(gun, registry).action.hand.durationSeconds;
    s.queue.tick(duration);
    const shotAt = SHELL_LOAD_SECONDS + duration + 1;
    s.firearms.advanceTo(shotAt);
    const events = s.sim.events.reader();
    expect(s.firearms.fire({ ...pose, item: gun, seed: 71, simTime: shotAt, debugMode: false })).toBe(true);
    const emitted = events.read().filter((event) => event.kind === 'sound' || event.kind === 'noise');
    expect(emitted.map((event) => [event.kind, event.event])).toEqual([
      ['sound', 'shotgun_blast'],
      ['noise', 'shotgun_blast'],
    ]);
    expect(s.playerAudio.vocalNoise?.radiusMetres).toBe(registry.sounds.get('shotgun_blast')!.noise.radiusMetres);
    expect(s.playerAudio.vocalNoise?.radiusMetres).toBeGreaterThan(0);
    expect(s.audioState().events.find((event) => event.event === 'shotgun_blast')?.lastPlayedAt).toBe(shotAt);
    expect(gun.firearm?.chamber).toBe('case');
  });

  it('syncs split rack cues to rear/forward phases and preserves a single hull landing cue across restore', () => {
    const f = fixture();
    f.load(0);
    f.rack(1);
    expect(f.fire(3)).toBe(true);
    expect(f.mechanics.cock(f.gun.uid, 4)).toBeUndefined();
    const action = registry.models.get('shotgun_pump')!.action!;
    const ejectAt = action.hand.rearwardSeconds * action.ejectAt;
    f.finish(ejectAt, 4 + ejectAt);
    const restored = Inventory.restoreState(f.inventory.registry, f.inventory.snapshotState());
    const cues: { event: SoundEventId; time: number }[] = [];
    const mechanics = new FirearmMechanics(restored, new HandlingQueue(restored), {
      blockSize: pose.blockSize,
      pose: () => pose,
      onEjection: () => undefined,
      onSound: (event, _position, time) => cues.push({ event, time }),
    });
    expect(f.gun.firearm?.landing).toBeDefined();
    const landingAt = f.gun.firearm!.landing!.at;
    mechanics.advanceTo(landingAt - 1e-6);
    expect(cues).toEqual([]);
    mechanics.advanceTo(landingAt);
    mechanics.advanceTo(landingAt + 1);
    expect(cues).toEqual([{ event: 'shotgun_hull_drop', time: landingAt }]);
    const forwardAt = action.hand.rearwardSeconds + action.hand.dwellSeconds;
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
