import { describe, expect, it } from 'vitest';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { type Item, snapshotItem } from '../src/core/items.ts';
import { toggleLight } from '../src/core/lights.ts';
import { bindReach } from '../src/core/reach.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { gameSeconds, gameToSimSeconds } from '../src/core/time.ts';
import { decodeInputReplay, encodeInputReplay, InputReplayRecorder } from '../src/game/inputReplay.ts';
import {
  applyReplayActionPayload,
  isReplayActionPayload,
  type ReplayCommandOwners,
} from '../src/game/replayCommands.ts';
import { Survival } from '../src/game/survival.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { buildFixtureRegistry } from './economyFixtures.ts';
import { Simulation } from './simulationFixture.ts';
import {
  blockId,
  capture,
  createRuntime,
  encodeFixture,
  formatVersion,
  formatWorldOptions,
} from './snapshotTestSupport.ts';

const vessel = (id: string, amount: number, capacityMicrolitres = 12) => ({
  id,
  name: id,
  category: 'tool',
  size: [1, 1],
  weight: 10,
  vessel: {
    capacityMicrolitres,
    accepts: ['fixture_fuel'],
    initialContents: amount ? { kind: 'filled', liquid: 'fixture_fuel', volumeMicrolitres: amount } : { kind: 'empty' },
    pour: { incrementMicrolitres: 2, microlitresPerSimSecond: 4 },
  },
});
const built = buildFixtureRegistry([
  {
    source: 'fixture-pour.json',
    data: {
      liquids: [{ id: 'fixture_fuel', name: 'Fixture fuel', densityGramsPerMillilitre: 1 }],
      items: [
        vessel('fixture_source', 12),
        vessel('fixture_receiver', 0),
        vessel('fixture_small', 0, 3),
        {
          ...vessel('fixture_lamp', 1),
          light: {
            radius: 2,
            seenFrom: 10,
            color: '#ffffff',
            intensity: 1,
            liquidFuel: { accepts: ['fixture_fuel'], microlitresPerGameSecond: 1 },
            burning: { ignition: 'manual', douse: true, sprint: 'douse', stow: 'douse', drop: 'stay', relight: true },
          },
        },
      ],
    },
  },
]);
if (built.issues.length > 0) {
  throw new Error(JSON.stringify(built.issues));
}
const base = baseRegistry();
const registry = {
  ...base,
  dayCycle: { ...base.dayCycle!, clockRatio: 1 },
  items: new Map([...base.items, ...built.registry.items]),
  liquids: new Map([...base.liquids, ...built.registry.liquids]),
};
const volume = (item: Item) => (item.liquidContents?.kind === 'filled' ? item.liquidContents.volumeMicrolitres : 0);
const admit = (inventory: Inventory, type: string, side?: 'left' | 'right') => {
  const item = inventory.create(type);
  if (!inventory.add(item, side ? { kind: 'hand', side } : { kind: 'pile', pos: [0, 0, 0] })) {
    throw new Error('Fixture admission failed');
  }
  return item;
};
const fixture = (receiverType = 'fixture_receiver', held = true) => {
  const inventory = new Inventory(registry);
  const queue = new HandlingQueue(inventory);
  const sim = new Simulation({ seed: 1 });
  const survival = new Survival(sim, inventory, queue, {
    reach: bindReach({ inventory, position: [0, 0, 0], blockSize: 1, clock: BASE_CLOCK }),
    feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
    notice: () => undefined,
    read: () => undefined,
  });
  const source = admit(inventory, 'fixture_source', 'right');
  const receiver = admit(inventory, receiverType, held ? 'left' : undefined);
  return { inventory, queue, sim, survival, source, receiver };
};
const increment = (queue: HandlingQueue) => {
  if (!queue.busy) {
    throw new Error('Expected a pending increment');
  }
  return queue.tick(queue.jobs[0]!.duration - queue.jobs[0]!.elapsed);
};
const finish = (queue: HandlingQueue) => {
  for (let step = 0; queue.busy && step < 100; step++) {
    increment(queue);
  }
  if (queue.busy) {
    throw new Error('Pour did not terminate');
  }
};

describe('progressive explicit pouring', () => {
  it.each([true, false])('keeps exactly the selected endpoints and their owners (held receiver: %s)', (held) => {
    const { inventory, queue, survival, source, receiver } = fixture('fixture_receiver', held);
    const spare = admit(inventory, 'fixture_source');
    const spareBefore = structuredClone(spare.liquidContents);
    const locations = [inventory.locate(source), inventory.locate(receiver)];
    const total = volume(source) + volume(receiver);
    expect(held ? survival.use(source) : survival.pour(source.uid, receiver.uid)).toBeUndefined();
    increment(queue);
    expect(volume(receiver)).toBeGreaterThan(0);
    expect(volume(source)).toBeGreaterThan(0);
    expect(volume(source) + volume(receiver)).toBe(total);
    finish(queue);
    expect(volume(source)).toBe(0);
    expect(volume(receiver)).toBe(total);
    expect(spare.liquidContents).toEqual(spareBefore);
    expect([inventory.locate(source), inventory.locate(receiver)]).toEqual(locations);
    expect(survival.pour(receiver.uid, source.uid)).toEqual(held ? undefined : expect.any(String));
    if (held) {
      finish(queue);
      expect(volume(source)).toBe(total);
      expect(volume(receiver)).toBe(0);
    }
  });

  it('cancellation and the save-copy boundary retain only committed increments', () => {
    const { inventory, queue, survival, source, receiver } = fixture();
    expect(survival.pour(source.uid, receiver.uid)).toBeUndefined();
    increment(queue);
    const before = inventory.snapshotState();
    expect(queue.snapshotCancelled().jobs).toEqual([]);
    expect(queue.busy).toBe(true);
    queue.tick(queue.remaining / 2);
    queue.cancel();
    queue.tick(100);
    expect(inventory.snapshotState()).toEqual(before);
    expect(volume(receiver)).toBeGreaterThan(0);
    expect(volume(source)).toBeGreaterThan(0);
  });

  it.each(['reach', 'ignition', 'full', 'moved'] as const)(
    'revalidates %s after admission and preserves committed liquid without substituting stock',
    (change) => {
      const { inventory, queue, survival, source, receiver } = fixture('fixture_lamp', false);
      const spare = admit(inventory, 'fixture_source');
      expect(survival.pour(source.uid, receiver.uid)).toBeUndefined();
      increment(queue);
      expect(volume(receiver)).toBeGreaterThan(1);
      if (change === 'reach') {
        inventory.canReach = () => false;
      }
      if (change === 'ignition') {
        expect(toggleLight(registry, receiver, 0)).toBeUndefined();
      }
      if (change === 'full') {
        expect(inventory.transferLiquid(spare.uid, receiver.uid).ok).toBe(true);
      }
      if (change === 'moved') {
        expect(inventory.move(source, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
      }
      const before = inventory.snapshotState();
      expect(increment(queue).failed).toHaveLength(1);
      expect(queue.busy).toBe(false);
      expect(inventory.snapshotState()).toEqual(before);
    },
  );

  it('bounds the final increment by receiver room and leaves later queued handling in order', () => {
    const { inventory, queue, survival, source, receiver } = fixture('fixture_small');
    const total = volume(source);
    let observed = 0;
    queue.registerAction('fixture.after', () => {
      observed = volume(receiver);
    });
    expect(survival.pour(source.uid, receiver.uid)).toBeUndefined();
    queue.enqueueAction('fixture.after', 'After', 1);
    finish(queue);
    expect(observed).toBe(registry.items.get(receiver.type)!.vessel!.capacityMicrolitres);
    expect(volume(source) + volume(receiver)).toBe(total);
    expect(inventory.itemByUid(source.uid)).toBe(source);
  });

  it('fills, burns a set-down lamp, douses and decants into the selected bottle before reloading', async () => {
    const runtime = createRuntime(undefined, false, undefined, { registry });
    const { inventory, survival, session, sim } = runtime;
    const ground = { kind: 'pile', pos: session.feet() } as const;
    const [x, y, z] = ground.pos;
    runtime.world.setBlock(x, y - 1, z, blockId('stone'));
    for (const item of Object.values(inventory.hands)) {
      const moved = inventory.move(item, ground);
      expect(moved.ok, JSON.stringify(moved)).toBe(true);
    }
    const bottle = admit(inventory, 'fixture_source', 'right');
    const lamp = admit(inventory, 'fixture_lamp', 'left');
    const identities = () => [...inventory.items()].map(({ item }) => [item.uid, item.type]);
    const initialIdentities = identities();
    const unchangedShells = () => {
      expect(identities()).toEqual(expect.arrayContaining(initialIdentities));
      expect(identities()).toHaveLength(initialIdentities.length);
      expect(lamp.slots).toBeUndefined();
      expect(bottle.slots).toBeUndefined();
    };
    const initialOil = volume(bottle) + volume(lamp);
    expect(survival.use(bottle)).toBeUndefined();
    finish(session.queue);
    expect(volume(lamp)).toBeGreaterThan(1);
    expect(volume(lamp) + volume(bottle)).toBe(initialOil);
    unchangedShells();
    sim.paused = false;
    session.frame(1 / 60);
    expect(survival.use(lamp)).toBeUndefined();
    expect(lamp.on).toBe(true);
    expect(inventory.move(lamp, ground).ok).toBe(true);
    const burnSpan = gameToSimSeconds(sim.clock, gameSeconds(3));
    const frames = Math.ceil(burnSpan * 60);
    for (let frame = 0; frame < frames; frame++) {
      session.frame(burnSpan / frames);
    }
    expect(inventory.locate(lamp)?.kind).toBe('pile');
    expect(lamp.on).toBe(true);
    expect(volume(lamp) + volume(bottle)).toBeLessThan(initialOil);
    expect(volume(lamp)).toBeGreaterThan(0);
    unchangedShells();
    expect(inventory.move(lamp, { kind: 'hand', side: 'left' })).toMatchObject({ ok: true });
    expect(survival.use(lamp)).toBeUndefined();
    expect(lamp.on).toBe(false);
    const remainingOil = volume(lamp) + volume(bottle);
    expect(inventory.move(bottle, ground).ok).toBe(true);
    expect(survival.pour(lamp.uid, bottle.uid)).toBeUndefined();
    finish(session.queue);
    expect(lamp.liquidContents).toEqual({ kind: 'empty' });
    expect(volume(bottle)).toBe(remainingOil);
    expect(inventory.locate(bottle)?.kind).toBe('pile');
    expect(inventory.locate(lamp)).toEqual({ kind: 'hand', side: 'left' });
    unchangedShells();
    const snapshot = capture(runtime);
    const decoded = await decodeSave(await encodeFixture(snapshot), {
      version: formatVersion,
      contentLookup: (kind, id, item) => contentLookup(registry, kind, id, item),
    });
    const restored = createRuntime(decoded.snapshot, false, runtime.columns, {
      registry,
      start: sim.clock.start,
    });
    for (const original of [lamp, bottle]) {
      expect(snapshotItem(restored.inventory.itemByUid(original.uid)!)).toEqual(snapshotItem(original));
    }
    expect(capture(restored).character.inventory).toEqual(snapshot.character.inventory);
  });

  it('captures explicit endpoint payloads and replays the same committed balances', async () => {
    const live = createRuntime(undefined, false, undefined, { registry });
    for (const item of Object.values(live.inventory.hands)) {
      expect(live.inventory.move(item, { kind: 'pile', pos: [...live.player.body.pos] }).ok).toBe(true);
    }
    const source = admit(live.inventory, 'fixture_source', 'right');
    const receiver = admit(live.inventory, 'fixture_receiver', 'left');
    const start = capture(live);
    const payload = { kind: 'liquid.pour', sourceUid: source.uid, receiverUid: receiver.uid } as const;
    expect(isReplayActionPayload(payload)).toBe(true);
    expect(isReplayActionPayload({ ...payload, receiverUid: undefined })).toBe(false);
    const recorder = new InputReplayRecorder(start);
    recorder.queueAction(payload.kind, 'down', 'inventory', { payload });
    recorder.recordTick({
      active: true,
      inputLocked: true,
      intent: {
        forward: 0,
        right: 0,
        jump: false,
        sprint: false,
        walk: false,
        useDominant: false,
        useDominantHeld: false,
        useOff: false,
      },
      yaw: 0,
      pitch: 0,
      walking: false,
      descending: false,
      worldReady: true,
    });
    expect(live.survival.pour(source.uid, receiver.uid)).toBeUndefined();
    finish(live.session.queue);
    const bytes = await encodeInputReplay(start, recorder.copyInputs(), formatWorldOptions, capture(live));
    const decoded = await decodeInputReplay(bytes, { contentLookup: (kind, id) => contentLookup(registry, kind, id) });
    const replay = createRuntime(decoded.snapshot, false, undefined, { registry });
    const { actions } = decoded.inputs;
    expect(actions).toHaveLength(1);
    expect(actions[0]!.payload).toEqual(payload);
    expect(
      applyReplayActionPayload(actions[0]!.payload!, {
        pour: (from, to) => replay.survival.pour(from, to),
      } as ReplayCommandOwners),
    ).toBeUndefined();
    finish(replay.session.queue);
    expect(replay.inventory.snapshotState()).toEqual(live.inventory.snapshotState());
  });
});
