import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Body } from '../src/core/body.ts';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { dropSpots, Inventory, type Target } from '../src/core/inventory.ts';
import { playerPockets } from '../src/core/options.ts';
import { decodeSave, encodeSave, SAVE_SCHEMA_VERSION, type SaveVersionComponents } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { itemActionsFor } from '../src/game/itemActions.ts';
import { MagazineHandling, ROUND_LOAD_SIM_SECONDS, ROUND_STRIP_SIM_SECONDS } from '../src/game/magazineHandling.ts';
import { selectPrimaryAction } from '../src/game/primaryAction.ts';
import { RELOAD_GESTURE_MS, ReloadInput } from '../src/game/reloadInput.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import {
  createMagazineLoadFrame,
  createMagazinePress,
  createMagazineRaise,
  MAGAZINE_LOAD_POSE,
  magazinePress,
  readMagazineLoadFrame,
  stepMagazineRaise,
} from '../src/render/magazineLoadPose.ts';
import { BODY_TUNING_FIXTURE } from './simulationFixture.ts';

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

const magazineType = 'magazine_akm_30';
const roundType = 'cartridge_7_d_62x39';
const otherCalibre = 'cartridge_5_d_56x45';
/** A second cartridge type of the magazine's calibre, so feed order is observable. */
const markedRound = 'test_marked_7_d_62x39';
/** Owns a small capacity rather than pinning the exported column's round count. */
const CAPACITY = 3;

const testContent = (): Registry => {
  const modelId = registry.items.get(magazineType)!.model!;
  return {
    ...registry,
    models: new Map(registry.models).set(modelId, { ...registry.models.get(modelId)!, capacity: CAPACITY }),
    items: new Map(registry.items).set(markedRound, { ...registry.items.get(roundType)!, id: markedRound }),
  };
};

/** Carried stacks in creation order: loading takes the lowest uid first. */
const fixture = (carried: readonly (readonly [string, number])[]) => {
  const inventory = new Inventory(testContent());
  const magazine = inventory.create(magazineType);
  const bag = inventory.create('hiking_backpack');
  const pocket = { kind: 'pocket', owner: bag, pocket: 0 } as const;
  if (
    !(
      inventory.add(magazine, { kind: 'hand', side: 'right' }) &&
      inventory.add(bag, { kind: 'worn' }) &&
      carried.every(([type, count]) => inventory.add(inventory.create(type, count), pocket))
    )
  ) {
    throw new Error('Magazine fixture does not fit');
  }
  const queue = new HandlingQueue(inventory);
  const sounds: string[] = [];
  const handling = new MagazineHandling(inventory, queue, {
    feet: () => [0, 0, 0],
    reloadFactor: () => 1,
    onSound: (event) => sounds.push(event),
  });
  const load = () => {
    const refusal = handling.loadNext(magazine.uid, 0);
    if (refusal) {
      throw new Error(refusal);
    }
    queue.tick(ROUND_LOAD_SIM_SECONDS);
  };
  const strip = () => {
    const refusal = handling.strip(magazine.uid, 0);
    if (refusal) {
      throw new Error(refusal);
    }
    queue.tick(ROUND_STRIP_SIM_SECONDS);
  };
  const loose = (type: string) =>
    [...inventory.items()].filter(({ item }) => item.type === type).reduce((sum, { item }) => sum + item.count, 0);
  const rounds = () => loose(roundType) + loose(markedRound) + magazine.cartridges!.length;
  return { inventory, magazine, bag, queue, handling, load, strip, loose, rounds, sounds };
};

const MARKED_THEN_PLAIN = [
  [markedRound, 1],
  [roundType, 10],
] as const;

const fillGrid = (inventory: Inventory, target: Target): void => {
  for (let attempt = 0; attempt < 10_000; attempt++) {
    if (!inventory.add(inventory.create(roundType), target)) {
      return;
    }
  }
  throw new Error('Test grid did not fill');
};

describe('magazines loaded round by round', () => {
  it('conserves rounds and carried weight through loading and stripping, stripping the last round loaded', () => {
    const f = fixture(MARKED_THEN_PLAIN);
    const rounds = f.rounds();
    const weight = f.inventory.carriedWeight();
    for (let i = 0; i < CAPACITY; i++) {
      f.load();
      expect(f.rounds()).toBe(rounds);
      expect(f.inventory.carriedWeight()).toBe(weight);
    }
    // The first round loaded sits at the bottom; the top round is the next fed or stripped.
    expect(f.magazine.cartridges!.at(-1)).toBe(markedRound);
    expect(f.magazine.cartridges![0]).toBe(roundType);
    f.strip();
    expect(f.magazine.cartridges).toHaveLength(CAPACITY - 1);
    expect(f.magazine.cartridges!.at(-1)).toBe(markedRound);
    expect(f.rounds()).toBe(rounds);
    expect(f.inventory.carriedWeight()).toBe(weight);
  });

  it('refuses a full magazine and other calibres without consuming a round', () => {
    const full = fixture(MARKED_THEN_PLAIN);
    for (let i = 0; i < CAPACITY; i++) {
      full.load();
    }
    const loose = full.loose(roundType);
    expect(full.handling.loadNext(full.magazine.uid, 0)).toBeDefined();
    expect(full.queue.jobs).toEqual([]);
    expect(full.loose(roundType)).toBe(loose);
    const wrong = fixture([[otherCalibre, 5]]);
    expect(wrong.handling.loadNext(wrong.magazine.uid, 0)).toBeDefined();
    expect(wrong.queue.jobs).toEqual([]);
    expect(wrong.loose(otherCalibre)).toBe(5);
    expect(wrong.magazine.cartridges).toEqual([]);
  });

  it('offers stripping as the held magazine’s item action, only while it holds a round', () => {
    const f = fixture(MARKED_THEN_PLAIN);
    const body = new Body(BODY_TUNING_FIXTURE);
    expect(selectPrimaryAction(f.inventory, 'right')).toMatchObject({ kind: 'magazine', item: f.magazine });
    expect(itemActionsFor(f.magazine, f.inventory, body)).toEqual([]);
    f.load();
    expect(itemActionsFor(f.magazine, f.inventory, body).map(({ magazine }) => magazine)).toEqual(['strip']);
  });

  it('continues a held strip through per-step polls without refusals until empty', () => {
    const f = fixture(MARKED_THEN_PLAIN);
    for (let i = 0; i < CAPACITY; i++) {
      f.load();
    }
    expect(f.handling.strip(f.magazine.uid, 0, true)).toBeUndefined();
    const frame = createMagazineLoadFrame();
    const stepsPerRound = 4;
    const stepSeconds = ROUND_STRIP_SIM_SECONDS / stepsPerRound;
    let time = 0;

    for (let round = 0; round < CAPACITY; round++) {
      for (let step = 0; step < stepsPerRound; step++) {
        expect(f.queue.jobs).toHaveLength(1);
        const [job] = f.queue.jobs;
        expect(job).toMatchObject({ kind: 'action', jobType: 'magazine.strip' });
        expect(readMagazineLoadFrame(f.inventory, job, frame)).toBe(true);
        expect(frame.strip).toBe(true);
        const result = f.queue.tick(stepSeconds);
        expect(result.failed).toEqual([]);
        time += stepSeconds;
        expect(f.handling.advanceHeldStrip(f.magazine.uid, time, true)).toBeUndefined();
        expect(f.queue.jobs).toHaveLength(step === stepsPerRound - 1 && round === CAPACITY - 1 ? 0 : 1);
      }
      expect(f.magazine.cartridges).toHaveLength(CAPACITY - round - 1);
    }

    expect(f.sounds.filter((event) => event === 'magazine_round_strip')).toHaveLength(CAPACITY);
  });

  it('stops a held strip after its in-progress round completes when released', () => {
    const f = fixture(MARKED_THEN_PLAIN);
    for (let i = 0; i < CAPACITY; i++) {
      f.load();
    }
    expect(f.handling.strip(f.magazine.uid, 0, true)).toBeUndefined();
    const stepsPerRound = 4;
    const stepSeconds = ROUND_STRIP_SIM_SECONDS / stepsPerRound;
    let time = 0;

    for (let step = 0; step < stepsPerRound; step++) {
      expect(f.queue.jobs).toHaveLength(1);
      const result = f.queue.tick(stepSeconds);
      expect(result.failed).toEqual([]);
      time += stepSeconds;
      const held = step < 2;
      expect(f.handling.advanceHeldStrip(f.magazine.uid, time, held)).toBeUndefined();
      expect(f.queue.jobs).toHaveLength(step < stepsPerRound - 1 ? 1 : 0);
    }

    expect(f.magazine.cartridges).toHaveLength(CAPACITY - 1);
    expect(f.queue.jobs).toEqual([]);
    expect(f.handling.advanceHeldStrip(f.magazine.uid, time, true)).toBeUndefined();
    expect(f.queue.jobs).toEqual([]);
  });

  it('stops a held strip when a completed round has nowhere to go', () => {
    const f = fixture(MARKED_THEN_PLAIN);
    for (let i = 0; i < CAPACITY; i++) {
      f.load();
    }
    const pockets = playerPockets(f.inventory);
    for (const { owner, pocket } of pockets) {
      fillGrid(f.inventory, { kind: 'pocket', owner, pocket });
    }
    for (const pos of dropSpots([0, 0, 0])) {
      fillGrid(f.inventory, { kind: 'pile', pos });
    }
    for (const { owner, pocket } of pockets) {
      expect(f.inventory.planAdd(f.inventory.create(roundType), { kind: 'pocket', owner, pocket }).ok).toBe(false);
    }
    for (const pos of dropSpots([0, 0, 0])) {
      expect(f.inventory.planAdd(f.inventory.create(roundType), { kind: 'pile', pos }).ok).toBe(false);
    }

    expect(f.handling.strip(f.magazine.uid, 0, true)).toBeUndefined();
    const stepsPerRound = 4;
    const stepSeconds = ROUND_STRIP_SIM_SECONDS / stepsPerRound;
    let time = 0;
    let noRoom = false;

    for (let step = 0; step < stepsPerRound; step++) {
      expect(f.queue.jobs).toHaveLength(1);
      const result = f.queue.tick(stepSeconds);
      noRoom ||= result.failed.some(({ reason }) => reason === 'No room for the round nearby');
      time += stepSeconds;
      expect(f.handling.advanceHeldStrip(f.magazine.uid, time, true)).toBeUndefined();
      expect(f.queue.jobs).toHaveLength(step < stepsPerRound - 1 ? 1 : 0);
    }

    expect(noRoom).toBe(true);
    expect(f.magazine.cartridges).toHaveLength(CAPACITY);
    expect(f.queue.jobs).toEqual([]);
  });

  it('R release cancels a partial load without losing a round', () => {
    const f = fixture(MARKED_THEN_PLAIN);
    const input = new ReloadInput();
    const binding = {
      uid: f.magazine.uid,
      busy: () => f.queue.busy,
      load: () => f.handling.loadNext(f.magazine.uid, 0.25) === undefined,
      rack: () => false,
      remove: () => undefined,
      cancelLoad: () => f.handling.cancelLoad(f.magazine.uid),
    };
    const rounds = f.rounds();
    input.keyDown(0, binding);
    input.advance(RELOAD_GESTURE_MS.hold, binding);
    f.queue.tick(ROUND_LOAD_SIM_SECONDS / 2);
    expect(f.queue.jobs).toHaveLength(1);
    input.keyUp(750);
    input.advance(1000, binding);
    expect(f.magazine.cartridges).toEqual([]);
    expect(f.rounds()).toBe(rounds);
    expect(f.queue.jobs).toEqual([]);
  });

  it('keeps the loaded rounds and their order through a save, and rejects over-capacity or wrong-calibre contents', async () => {
    const f = fixture(MARKED_THEN_PLAIN);
    f.load();
    f.load();
    const loaded = [...f.magazine.cartridges!];
    const session = createSession({
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
      audio: { play: () => undefined },
      notice: () => undefined,
      onRead: () => undefined,
    });
    const snapshot = session.snapshot({ worldId: 'magazine-world', characterId: 'magazine-character' });
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
    expect(restored.hands.right?.cartridges).toEqual(loaded);
    for (const cartridges of [Array.from({ length: CAPACITY + 1 }, () => roundType), [otherCalibre]]) {
      const corrupt = structuredClone(decoded.snapshot.character.inventory);
      corrupt.hands.right!.cartridges = cartridges;
      expect(() => Inventory.restoreState(f.inventory.registry, corrupt)).toThrow();
    }
  });
});

describe('the magazine load animation follows each round’s job', () => {
  /** Doesn't divide a round's job, so samples land mid-press and across job ends. */
  const stepsPerRound = 3.5;

  it('presses one round per round loaded, at the running job’s own progress, showing the round that goes in', () => {
    const f = fixture(MARKED_THEN_PLAIN);
    const frame = createMagazineLoadFrame();
    let presses = 0;
    let wasRunning = false;
    let pressed: string | undefined;
    const sample = () => {
      const [job] = f.queue.jobs;
      const running = readMagazineLoadFrame(f.inventory, job, frame);
      expect(running).toBe(job !== undefined);
      if (job) {
        expect(frame.progress).toBeCloseTo(job.elapsed / job.duration);
        pressed = frame.roundType;
      } else if (pressed !== undefined) {
        expect(f.magazine.cartridges![0]).toBe(pressed);
        pressed = undefined;
      }
      presses += running && !wasRunning ? 1 : 0;
      wasRunning = running;
      // A press ends exactly when its round's job does, so finished presses are the rounds loaded.
      expect(presses - (running ? 1 : 0)).toBe(f.magazine.cartridges!.length);
    };
    for (let step = 0; step < 10 * CAPACITY && f.magazine.cartridges!.length < CAPACITY; step++) {
      if (!f.queue.busy) {
        expect(f.handling.loadNext(f.magazine.uid, 0)).toBeUndefined();
        sample();
      }
      f.queue.tick(ROUND_LOAD_SIM_SECONDS / stepsPerRound);
      sample();
    }
    expect(presses).toBe(CAPACITY);
  });

  it('drops the press on cancel, and keeps the magazine raised only across the gap between rounds', () => {
    const f = fixture(MARKED_THEN_PLAIN);
    const frame = createMagazineLoadFrame();
    const raise = createMagazineRaise();
    const { holdRealSeconds, raiseRealSeconds } = MAGAZINE_LOAD_POSE;
    expect(f.handling.loadNext(f.magazine.uid, 0)).toBeUndefined();
    f.queue.tick(ROUND_LOAD_SIM_SECONDS / 2);
    expect(readMagazineLoadFrame(f.inventory, f.queue.jobs[0], frame)).toBe(true);
    stepMagazineRaise(raise, frame, raiseRealSeconds);
    expect(raise.weight).toBe(1);
    // Each round is its own job, so the queue is empty for a frame between rounds.
    stepMagazineRaise(raise, undefined, holdRealSeconds / 2);
    expect(raise.weight).toBe(1);
    f.handling.cancelLoad(f.magazine.uid);
    expect(readMagazineLoadFrame(f.inventory, f.queue.jobs[0], frame)).toBe(false);
    expect(f.magazine.cartridges).toEqual([]);
    stepMagazineRaise(raise, undefined, holdRealSeconds + raiseRealSeconds);
    expect(raise).toMatchObject({ weight: 0, side: undefined });
  });

  it('strips the top round with the load press played backwards', () => {
    const f = fixture([
      [roundType, 1],
      [markedRound, 5],
    ]);
    for (let i = 0; i < CAPACITY; i++) {
      f.load();
    }
    const [top] = f.magazine.cartridges!;
    const loose = f.loose(top!);
    expect(f.handling.strip(f.magazine.uid, 0)).toBeUndefined();
    const strip = createMagazineLoadFrame();
    const stripPress = createMagazinePress();
    const loadPress = createMagazinePress();
    while (readMagazineLoadFrame(f.inventory, f.queue.jobs[0], strip)) {
      expect(strip).toMatchObject({ strip: true, roundType: top });
      magazinePress(strip, stripPress);
      magazinePress({ ...strip, strip: false, progress: 1 - strip.progress }, loadPress);
      expect(stripPress).toEqual(loadPress);
      f.queue.tick(ROUND_STRIP_SIM_SECONDS / stepsPerRound);
    }
    expect(f.loose(top!)).toBe(loose + 1);
  });
});
