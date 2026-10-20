import { expect, it } from 'vitest';
import { SKILL_LEVEL_MAX } from '../src/core/character.ts';
import { actionOpenSeconds, ejectSeconds } from '../src/core/firearmAction.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { decodeSave, encodeSave, SAVE_SCHEMA_VERSION } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { FirearmMechanics, type FirearmShotEffect } from '../src/game/firearmHandling.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const rifle = [...registry.items.values()].find((item) => item.firearm?.bolt)!;
const model = registry.models.get(rifle.model!)!;
const ammo = [...registry.items.values()].find((item) => item.ammo?.calibre === model.calibre)!;
const pose = {
  feet: [0, 0, 0] as [number, number, number],
  eye: [0, 3, 0] as [number, number, number],
  yaw: 0,
  pitch: 0,
  blockSize: 0.5,
  ready: true,
  sprinting: false,
  aimFrame: { yaw: 0, pitch: 0 },
};
const fixture = (skill = 0) => {
  const content = {
    ...registry,
    items: new Map(registry.items)
      .set('fixture_bolt', { ...rifle, id: 'fixture_bolt', model: 'fixture_model' })
      .set('fixture_round', { ...ammo, id: 'fixture_round' }),
    models: new Map(registry.models).set('fixture_model', {
      ...model,
      id: 'fixture_model',
      internalMagazine: { capacity: 3 },
    }),
  };
  const inventory = new Inventory(content);
  const gun = inventory.create('fixture_bolt');
  const bag = inventory.create('hiking_backpack');
  const rounds = inventory.create('fixture_round', 12);
  if (
    !(
      inventory.add(gun, { kind: 'hand', side: 'right' }) &&
      inventory.add(bag, { kind: 'worn' }) &&
      inventory.add(rounds, { kind: 'pocket', owner: bag, pocket: 0 })
    )
  ) {
    throw new Error('Bolt fixture does not fit');
  }
  const queue = new HandlingQueue(inventory);
  const effects: FirearmShotEffect[] = [];
  const sounds: { event: string; time: number }[] = [];
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: 0.5,
    pose: () => pose,
    isSolid: (_x, y) => y < 0,
    onEjection: (effect) => effects.push(effect),
    onSound: (event, _position, time) => sounds.push({ event, time }),
    firearmsSkillLevel: () => skill,
  });
  let now = 0;
  const step = (dt: number) => {
    now += dt;
    const { failed } = queue.tick(dt);
    if (failed.length > 0) {
      throw new Error(JSON.stringify(failed));
    }
    mechanics.advanceTo(now);
  };
  const finish = () => step(queue.remaining);
  const complete = (reason: string | undefined) => {
    if (reason) {
      throw new Error(reason);
    }
    finish();
  };
  const load = () => complete(mechanics.load(rounds, now));
  const rack = () => complete(mechanics.cock(gun.uid, now));
  const fire = () => mechanics.fire({ ...pose, item: gun, seed: 37, simTime: now });
  const total = () =>
    [...inventory.items()]
      .filter(({ item }) => item.type === rounds.type)
      .reduce((sum, { item }) => sum + item.count, 0) +
    (gun.firearm?.tube?.length ?? 0) +
    (gun.firearm?.chamber === 'round' ? 1 : 0) +
    (gun.firearm?.retainedRoundType ? 1 : 0) +
    (gun.firearm?.landings?.filter((landing) => landing.type === rounds.type).length ?? 0);
  return {
    inventory,
    gun,
    rounds,
    queue,
    mechanics,
    effects,
    sounds,
    step,
    finish,
    load,
    rack,
    fire,
    total,
    time: () => now,
  };
};

/** The fixture's inventory as a save writes it and a load decodes it again. */
const savedInventory = async (f: ReturnType<typeof fixture>) => {
  const session = createSession({
    registry,
    world: new World(),
    isSolid: () => false,
    isOpaque: () => false,
    scale: makeScale(0.5),
    seed: 1,
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
  const source = session.snapshot({ worldId: 'bolt-fixture', characterId: 'bolt-character' });
  const snapshot = { ...source, character: { ...source.character, inventory: f.inventory.snapshotState() } };
  const version = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    simulationHash: 'a'.repeat(64),
    generators: {},
    contentPacks: [],
  };
  const bytes = await encodeSave(snapshot, {
    generation: 1,
    version,
    worldOptions: { blockSize: 0.5, site: 'testHouse', storeys: 1, density: 0.75 },
  });
  return (await decodeSave(bytes, { version, contentLookup: () => true })).snapshot.character.inventory;
};

it('retains a spent case until the rack ejects it and feeds; a live rack lands a pickup', () => {
  const f = fixture();
  f.load();
  f.load();
  f.rack();
  expect(f.fire()).toBe(true);
  expect(f.gun.firearm?.chamber).toBe('case');
  expect(f.gun.firearm?.cycle).toBeUndefined();
  expect(f.fire()).toBe(false);
  f.rack();
  expect(f.effects).toHaveLength(1);
  expect(f.gun.firearm?.chamber).toBe('round');
  f.rack();
  f.step(1);
  expect(f.effects).toHaveLength(2);
  const pickups = [...f.inventory.items()].filter(
    ({ item, location }) => item.type === f.rounds.type && location.kind === 'pile',
  );
  expect(pickups.reduce((sum, { item }) => sum + item.count, 0)).toBe(1);
});

it('opens before loading, consumes one round per job, closes to feed, and refuses full or mismatched ammunition', () => {
  const f = fixture();
  const wrong = [...registry.items.values()].find((item) => item.ammo && item.ammo.calibre !== ammo.ammo!.calibre)!;
  const other = f.inventory.create(wrong.id);
  expect(f.inventory.add(other, { kind: 'hand', side: 'left' })).toBe(true);
  expect(f.mechanics.loadReason(other)).toBeDefined();
  expect(f.mechanics.load(f.rounds, 0)).toBeUndefined();
  expect(f.queue.jobs.map((job) => job.kind === 'action' && job.jobType)).toEqual(['firearm.cock', 'firearm.load']);
  f.step(f.queue.jobs[0]!.duration);
  expect(f.gun.firearm?.actionOpen).toBe(true);
  expect(f.rounds.count).toBe(12);
  f.finish();
  expect(f.rounds.count).toBe(11);
  expect(f.gun.firearm?.tube).toEqual([f.rounds.type]);
  f.load();
  f.load();
  expect(f.mechanics.loadReason(f.rounds)).toBeDefined();
  expect(f.mechanics.loadNext(f.gun.uid, f.time())).toBeDefined();
  f.finish();
  expect(f.gun.firearm?.actionOpen).toBe(false);
  expect(f.gun.firearm?.chamber).toBe('round');
  expect(f.gun.firearm?.tube).toHaveLength(2);
});

it('tops up the full magazine while keeping the separately chambered round', () => {
  const f = fixture();
  f.load();
  f.rack();
  const before = f.total();
  const { capacity } = f.inventory.registry.models.get('fixture_model')!.internalMagazine!;
  for (let index = 0; index < capacity; index++) {
    f.load();
  }
  f.mechanics.cancelLoad(f.gun.uid);
  f.finish();
  expect(f.gun.firearm?.tube).toHaveLength(capacity);
  expect(f.gun.firearm?.chamber).toBe('round');
  expect(f.total()).toBe(before);
});

it('top-up retains the extracted live round and its mass outside the magazine until closing', () => {
  const f = fixture();
  f.load();
  f.rack();
  const before = f.total();
  const mass = f.inventory.carriedWeight();
  f.load();
  expect(f.gun.firearm?.actionOpen).toBe(true);
  expect(f.gun.firearm?.tube).toHaveLength(1);
  expect(f.gun.firearm?.retainedRoundType).toBe(f.rounds.type);
  expect(f.inventory.carriedWeight()).toBe(mass);
  expect(f.effects).toEqual([]);
  expect(f.total()).toBe(before);
  f.mechanics.cancelLoad(f.gun.uid);
  f.finish();
  expect(f.gun.firearm?.chamber).toBe('round');
  expect(f.gun.firearm?.retainedRoundType).toBeUndefined();
  expect(f.total()).toBe(before);
});

it('cancelling a round leaves it carried and the bolt open; an open rack only pushes and locks', () => {
  const f = fixture();
  f.load();
  expect(f.mechanics.load(f.rounds, f.time())).toBeUndefined();
  f.step(f.queue.remaining / 2);
  const { count } = f.rounds;
  f.mechanics.cancelLoad(f.gun.uid);
  expect(f.rounds.count).toBe(count);
  expect(f.gun.firearm?.actionOpen).toBe(true);
  expect(f.mechanics.fireReason(f.gun.uid)).toBeDefined();
  expect(f.mechanics.cock(f.gun.uid, f.time())).toBeUndefined();
  expect(f.queue.remaining).toBeCloseTo(model.action!.hand.durationSimSeconds - actionOpenSeconds(model.action!));
  f.finish();
  expect(f.gun.firearm?.chamber).toBe('round');
  expect(f.effects).toEqual([]);
});

it('removal ejects the chambered round then strips magazine rounds without consuming them', () => {
  const f = fixture();
  f.load();
  f.load();
  f.rack();
  const before = f.total();
  const carriedAfterRemoval = f.rounds.count + f.gun.firearm!.tube!.length;
  expect(f.mechanics.removeMagazine(f.gun.uid, f.time())).toBeUndefined();
  f.finish();
  f.step(1);
  expect(f.gun.firearm?.actionOpen).toBe(true);
  expect(f.gun.firearm?.tube).toEqual([]);
  expect(f.gun.firearm?.chamber).toBe('empty');
  expect(f.rounds.count).toBe(carriedAfterRemoval);
  expect(f.total()).toBe(before);
});

it('removal recovers a retained top-up round before stripping the magazine', () => {
  const f = fixture();
  f.load();
  f.rack();
  f.load();
  expect(f.gun.firearm?.retainedRoundType).toBe(f.rounds.type);
  const before = f.total();
  expect(f.mechanics.removeMagazine(f.gun.uid, f.time())).toBeUndefined();
  f.finish();
  expect(f.gun.firearm?.retainedRoundType).toBeUndefined();
  expect(f.gun.firearm?.tube).toEqual([]);
  expect(f.mechanics.stillLoaded(f.gun.uid)).toBe(false);
  expect(f.effects).toEqual([]);
  expect(f.total()).toBe(before);
});

it('skill scales the bolt clock and ejection includes the exported unlock phase', () => {
  const novice = fixture();
  const experienced = fixture(SKILL_LEVEL_MAX);
  for (const f of [novice, experienced]) {
    expect(f.mechanics.cock(f.gun.uid, 0)).toBeUndefined();
  }
  expect(experienced.queue.remaining).toBeLessThan(novice.queue.remaining);
  const action = model.action!;
  expect(ejectSeconds(action, 'hand')).toBeCloseTo(
    action.hand.unlockSimSeconds! + action.hand.rearwardSimSeconds * action.ejectAt,
  );
});

it('a top-up save retains the extracted round outside the magazine and cancels only manual motion', async () => {
  const f = fixture();
  f.load();
  f.rack();
  expect(f.mechanics.load(f.rounds, f.time())).toBeUndefined();
  f.step((ejectSeconds(model.action!, 'hand') + actionOpenSeconds(model.action!)) / 2);
  expect(f.gun.firearm?.cycle?.phase).toBe('open');
  const state = await savedInventory(f);
  const restored = Inventory.restoreState(f.inventory.registry, state);
  expect(restored.hands.right?.firearm?.actionOpen).toBe(true);
  expect(restored.hands.right?.firearm?.cycle).toBeUndefined();
  expect(f.gun.firearm?.cycle?.phase).toBe('open');
  expect(restored.hands.right?.firearm?.tube).toEqual([]);
  expect(restored.hands.right?.firearm?.retainedRoundType).toBe(f.rounds.type);
  expect(restored.carriedWeight()).toBe(f.inventory.carriedWeight());
  expect(restored.itemByUid(f.rounds.uid)?.count).toBe(f.rounds.count);
  const corrupt = structuredClone(state);
  corrupt.hands.right!.firearm!.chamber = 'round';
  corrupt.hands.right!.firearm!.roundType = f.rounds.type;
  expect(() => Inventory.restoreState(f.inventory.registry, corrupt)).toThrow();
});

it('a fired bolt keeps its hammer down through a save', async () => {
  const f = fixture();
  f.load();
  f.rack();
  expect(f.fire()).toBe(true);
  expect(f.gun.firearm?.hammerDown).toBe(true);
  const restored = Inventory.restoreState(f.inventory.registry, await savedInventory(f));
  expect(restored.hands.right?.firearm?.hammerDown).toBe(true);
});

it('opening and closing the bolt each play their own stroke; a full cycle closes once the bolt is open', () => {
  const f = fixture();
  const { boltOpenSound, boltCloseSound } = rifle.firearm!;
  expect(boltOpenSound).toBeDefined();
  expect(boltCloseSound).not.toBe(boltOpenSound);
  const strokes = () => f.sounds.filter(({ event }) => event === boltOpenSound || event === boltCloseSound);
  f.load();
  expect(f.gun.firearm?.actionOpen).toBe(true);
  expect(strokes().map(({ event }) => event)).toEqual([boltOpenSound]);
  f.sounds.length = 0;
  f.rack();
  expect(strokes().map(({ event }) => event)).toEqual([boltCloseSound]);
  expect(f.fire()).toBe(true);
  f.sounds.length = 0;
  const start = f.time();
  f.rack();
  const [open, close, ...rest] = strokes();
  expect([open?.event, close?.event, rest]).toEqual([boltOpenSound, boltCloseSound, []]);
  expect(open?.time).toBe(start);
  expect(close?.time).toBeCloseTo(start + actionOpenSeconds(model.action!));
});
