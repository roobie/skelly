import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { heldEjectionPose } from '../src/core/heldPose.ts';
import { Inventory } from '../src/core/inventory.ts';
import { weightOf } from '../src/core/items.ts';
import type { PelletShot } from '../src/core/pellets.ts';
import { decodeSave, encodeSave, type SaveVersionComponents } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SoundEventId } from '../src/core/soundEvents.ts';
import { World } from '../src/core/world.ts';
import { FirearmMechanics, type FirearmShotEffect, SHELL_LOAD_SECONDS } from '../src/game/firearmHandling.ts';
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
const PUMP_SAVE_REFUSAL = /tube state|calibre mismatch/;
const shellType = 'shell_12_gauge_00_buck';
const hullType = 'spent_case_12_h_gauge_h_00_h_buck';
const pose = { feet: [0, 0, 0] as Vec3, eye: [0, 3, 0] as Vec3, yaw: 0.4, pitch: 0.2, blockSize: 0.5 };
const fixture = (content = registry) => {
  const inventory = new Inventory(content);
  const gun = inventory.create('pump_shotgun');
  const bag = inventory.create('hiking_backpack');
  const box = inventory.create('shotshell_box');
  const shells = inventory.create(shellType, 20);
  if (
    !(
      inventory.add(gun, { kind: 'hand', side: 'right' }) &&
      inventory.add(bag, { kind: 'worn' }) &&
      inventory.add(box, { kind: 'pocket', owner: bag, pocket: 0 }) &&
      inventory.add(shells, { kind: 'pocket', owner: box, pocket: 0 })
    )
  ) {
    throw new Error('Pump fixture does not fit');
  }
  const queue = new HandlingQueue(inventory);
  const effects: FirearmShotEffect[] = [];
  const shots: PelletShot[] = [];
  const sounds: { event: SoundEventId; time: number }[] = [];
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: pose.blockSize,
    pose: () => pose,
    onEjection: (effect) => effects.push(effect),
    onShot: (shot) => shots.push(shot),
    onSound: (event, _position, time) => sounds.push({ event, time }),
  });
  const finish = (dt: number, time: number) => {
    queue.tick(dt);
    mechanics.advanceTo(time);
  };
  const load = (time: number) => {
    const refusal = mechanics.use(shells, time);
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
    finish(1.5, time + 1.5);
  };
  const fire = (time: number) => mechanics.fire({ ...pose, item: gun, seed: 71, simTime: time, debugMode: false });
  return { inventory, gun, shells, queue, mechanics, effects, shots, sounds, finish, load, rack, fire };
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
  });

describe('real pump ammunition', () => {
  it('conserves five loaded shells across tube/chamber, firing and manual hull ejection without an automatic cycle', () => {
    const f = fixture();
    expect(f.fire(0)).toBe(false);
    const mass = f.inventory.carriedWeight();
    for (let i = 0; i < 4; i++) {
      f.load(i);
    }
    expect(f.mechanics.loadReason(f.shells)).toBe('Tube is full');
    expect(f.gun.firearm?.tube).toHaveLength(4);
    f.rack(5);
    f.load(7);
    expect(f.inventory.carriedWeight()).toBe(mass);
    expect(f.shells.count).toBe(15);
    expect(f.gun.firearm).toMatchObject({
      chamber: 'round',
      roundType: shellType,
      tube: Array.from({ length: 4 }, () => shellType),
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
      tube: Array.from({ length: 3 }, () => shellType),
    });
    expect([...f.inventory.items()].filter((item) => item.type === hullType).map((item) => item.count)).toEqual([1]);
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
      hold: 'both',
      eye: pose.eye.map((v) => v * pose.blockSize) as Vec3,
      yaw: pose.yaw,
      pitch: pose.pitch,
    });
    expect(f.effects).toHaveLength(1);
    expect(f.effects[0]).toMatchObject({ ...expected, caseModelId: registry.items.get(shellType)!.model });
    expect(f.gun.firearm?.chamber).toBe('empty');
    const ground = [...f.inventory.piles.values()].flatMap((pile) => pile.items.map(({ item }) => item));
    expect(ground.map((item) => [item.type, item.count])).toEqual([[shellType, 1]]);
    f.finish(1.5 - at, 4.5);
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
      schemaVersion: 10,
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
    const restored = Inventory.restoreState(registry, decoded.snapshot.character.inventory);
    expect(restored.hands.right?.firearm).toEqual({
      chamber: 'round',
      roundType: shellType,
      tube: [shellType, shellType],
    });
    expect(f.gun.firearm?.cycle?.mode).toBe('hand');
    for (const tube of [Array.from({ length: 5 }, () => shellType), ['canned_beans']]) {
      const corrupt = structuredClone(decoded.snapshot.character.inventory);
      corrupt.hands.right!.firearm!.tube = tube;
      expect(() => Inventory.restoreState(registry, corrupt)).toThrow(PUMP_SAVE_REFUSAL);
    }
    expect(weightOf(registry, restored.hands.right!)).toBe(
      registry.items.get('pump_shotgun')!.weight + 3 * registry.items.get(shellType)!.weight,
    );
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
    expect(fromData.shots[0]).toMatchObject({ diameterMm: 9.1, damage: 20 * (9.1 / 8.38) ** 3 });
    expect(fromData.shots[0]!.directions).toHaveLength(7);
  });

  it('admits one loud F4 blast/noise before unavailable output can veto it', () => {
    const s = runtime(() => false);
    const f = fixture();
    f.load(0);
    f.rack(1);
    expect(s.inventory.add(s.inventory.create('pump_shotgun'), { kind: 'hand', side: 'right' })).toBe(true);
    const gun = s.inventory.hands.right!;
    gun.firearm = structuredClone(f.gun.firearm!);
    const events = s.sim.events.reader();
    expect(s.firearms.fire({ ...pose, item: gun, seed: 71, simTime: 3, debugMode: false })).toBe(true);
    const emitted = events.read().filter((event) => event.kind === 'sound' || event.kind === 'noise');
    expect(emitted.map((event) => [event.kind, event.event])).toEqual([
      ['sound', 'shotgun_blast'],
      ['noise', 'shotgun_blast'],
    ]);
    expect(s.playerAudio.vocalNoise?.radiusMetres).toBe(registry.sounds.get('shotgun_blast')!.noise.radiusMetres);
    expect(s.playerAudio.vocalNoise?.radiusMetres).toBeGreaterThanOrEqual(100);
    expect(s.audioState().events.find((event) => event.event === 'shotgun_blast')?.lastPlayedAt).toBe(3);
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
    const restored = Inventory.restoreState(registry, f.inventory.snapshotState());
    const cues: { event: SoundEventId; time: number }[] = [];
    const mechanics = new FirearmMechanics(restored, new HandlingQueue(restored), {
      blockSize: pose.blockSize,
      pose: () => pose,
      onEjection: () => undefined,
      onSound: (event, _position, time) => cues.push({ event, time }),
    });
    const landingAt = 4 + ejectAt + 0.48;
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
    expect(open.zombies.activeMeleeAction).toBeUndefined();
  });
});
