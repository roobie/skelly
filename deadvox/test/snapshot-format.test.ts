import { createHash } from 'node:crypto';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { NEGATIVE_ZERO_TAG } from '../src/core/canonicalJson.ts';
import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MIN } from '../src/core/character.ts';
import { CHUNK, toChunk } from '../src/core/coords.ts';
import { PILE_GRID } from '../src/core/inventory.ts';
import { decodeSave, encodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { chunksFor } from '../src/core/scale.ts';
import { zombiePoseInputFor } from '../src/core/zombiePose.ts';
import { posedShamblerRegionBoxes } from '../src/core/zombieRegions.ts';
import type { MeleeWeapon } from '../src/core/zombies.ts';
import { startPlayerMelee } from '../src/game/melee.ts';
import { PLAYER } from '../src/game/player.ts';
import {
  advance,
  blockId,
  capture,
  contentLookup,
  createRuntime,
  encodeFixture,
  formatVersion,
  formatWorldOptions,
  inspect,
  prepareAudioContinuation,
  registry,
  scale,
  startRest,
} from './snapshotTestSupport.ts';

const TEN_HOUR_SAVE_BUDGET_BYTES = 5 * 1024 * 1024; // ~17× headroom over the current synthetic fixture; catches meaningful growth.
// biome-ignore lint/style/noProcessEnv: distinguish local measurements from the named CI runner.
const measurementRunner = process.env.GITHUB_ACTIONS === 'true' ? 'ubuntu-latest' : 'local';

const editBudgetChunk = (runtime: ReturnType<typeof createRuntime>, cx: number, cy: number, cz: number): void => {
  for (let cell = 0; cell < 8; cell++) {
    const x = cx * CHUNK + 4 + cell;
    const y = cy * CHUNK + 4;
    const z = cz * CHUNK + 6;
    const current = runtime.world.getBlock(x, y, z);
    runtime.world.setBlock(x, y, z, current === blockId('planks') ? blockId('dirt') : blockId('planks'));
  }
};

// PROJECT.md/config.ts default radius is 96 m; 32-block chunks at 0.5 m are 16 m,
// so config.ts/streamer.ts cover a 13x13 mesh square, with 8 vertical layers from scale.ts.
// The 25%-edited / 8-cells-per-edited-chunk load is an explicit high-side stress assumption.
const applyBudgetWorldEdits = (runtime: ReturnType<typeof createRuntime>) => {
  const radiusChunks = chunksFor(scale, 96);
  const centerX = toChunk(Math.floor(runtime.hamlet.spawn.pos[0] / scale.blockSize));
  const centerZ = toChunk(Math.floor(runtime.hamlet.spawn.pos[2] / scale.blockSize));
  const visitedChunks = (radiusChunks * 2 + 1) ** 2 * (scale.maxCy - scale.minCy + 1);
  let ordinal = 0;
  let editedChunks = 0;
  // 13x13 horizontal columns x 8 vertical layers: one edited layer in four, 8 block changes.
  for (let cz = centerZ - radiusChunks; cz <= centerZ + radiusChunks; cz++) {
    for (let cx = centerX - radiusChunks; cx <= centerX + radiusChunks; cx++) {
      runtime.session.onColumn(cx, cz, runtime.hamlet);
      for (let cy = scale.minCy; cy <= scale.maxCy; cy++) {
        const editThisChunk = ordinal % 4 === 0;
        ordinal += 1;
        if (!editThisChunk) {
          continue;
        }
        editedChunks += 1;
        editBudgetChunk(runtime, cx, cy, cz);
      }
    }
  }
  return { visitedChunks, editedChunks };
};

// One full floor pile per hamlet lot each game hour over the ten-hour scenario.
// PILE_GRID is 8x6 and duct_tape is a real 1x1 non-stackable content item.
const applyBudgetPiles = (runtime: ReturnType<typeof createRuntime>) => {
  const baselinePileCount = runtime.inventory.piles.size;
  const baselinePileItems = [...runtime.inventory.piles.values()].reduce((sum, pile) => sum + pile.items.length, 0);
  const pileCount = 10 * runtime.hamlet.lots.length;
  const pileCapacity = PILE_GRID.w * PILE_GRID.h;
  const centerX = toChunk(Math.floor(runtime.hamlet.spawn.pos[0] / scale.blockSize));
  const centerZ = toChunk(Math.floor(runtime.hamlet.spawn.pos[2] / scale.blockSize));
  const pileY = Math.floor(runtime.hamlet.spawn.pos[1] / scale.blockSize);
  let addedItems = 0;
  for (let index = 0; index < pileCount; index++) {
    const pos: [number, number, number] = [
      centerX * CHUNK + 4 + (index % 10) * 2,
      pileY,
      centerZ * CHUNK + 4 + Math.floor(index / 10) * 2,
    ];
    for (let cell = 0; cell < pileCapacity; cell++) {
      const added = runtime.inventory.add(runtime.inventory.create('duct_tape'), {
        kind: 'pile',
        pos,
        at: { x: cell % PILE_GRID.w, y: Math.floor(cell / PILE_GRID.w), rotated: false },
      });
      addedItems += Number(added);
    }
  }
  return { baselinePileCount, baselinePileItems, pileCount, pileCapacity, addedItems };
};

// Exercise idempotent column arrival; one group marker can own several live actors.
const touchBudgetFurnitureAndZombies = (runtime: ReturnType<typeof createRuntime>) => {
  const touchedContainers = [...runtime.entities.all].filter((entity) => entity.pockets);
  for (const entity of touchedContainers) {
    runtime.entities.markSearched(entity);
  }
  return {
    touchedContainers: touchedContainers.length,
    spawned: runtime.spawner.snapshotState().length,
    alive: runtime.zombies.store.size,
  };
};

const setBudgetClock = (runtime: ReturnType<typeof createRuntime>): void => {
  const scheduler = runtime.sim.scheduler.snapshotState();
  runtime.sim.scheduler.restoreState({
    time: 4500,
    systems: scheduler.systems.map((cursor) => ({ ...cursor, done: 4500 })),
  });
};

const lightCandleWithOffHandMatches = (runtime: ReturnType<typeof createRuntime>) => {
  const pos: import('../src/core/coords.ts').Vec3 = [...runtime.session.body.pos];
  const backpack = runtime.inventory.hands.right!;
  if (!runtime.inventory.move(backpack, { kind: 'pile', pos }).ok) {
    throw new Error('Could not clear the right hand for the light fixture');
  }
  const flashlight = runtime.inventory.hands.left!;
  const flashlightReason = runtime.survival.use(flashlight);
  if (flashlightReason || !runtime.inventory.move(flashlight, { kind: 'pile', pos }).ok) {
    throw new Error(flashlightReason ?? 'Could not clear the left hand for the light fixture');
  }
  const candle = runtime.inventory.create('candle');
  if (!runtime.inventory.add(candle, { kind: 'hand', side: 'right' })) {
    throw new Error('Could not place the candle in hand');
  }
  const matches = runtime.inventory.create('matches');
  if (!runtime.inventory.add(matches, { kind: 'hand', side: 'left' })) {
    throw new Error('Could not place the matches in hand');
  }
  const candleReason = runtime.survival.use(candle);
  if (candleReason) {
    throw new Error(candleReason);
  }
  return candle;
};

it('a doused candle keeps its remaining burn through save and relighting', async () => {
  const source = createRuntime();
  const candle = lightCandleWithOffHandMatches(source);
  const duration = registry.items.get('candle')!.light!.burnTimeGameHours!;
  source.sim.setDebugCalendarTime(source.sim.calendar + duration / 2);
  source.sim.scheduler.advance(1);
  expect(candle.on).toBe(true);
  const remaining = candle.burnRemainingGameSeconds!;
  expect(remaining).toBeGreaterThan(0);
  expect(source.survival.use(candle)).toBeUndefined();
  expect(candle.on).toBe(false);
  expect(candle.litAtGameTimestamp).toBeUndefined();

  const decoded = await decodeSave(await encodeFixture(capture(source)), { version: formatVersion, contentLookup });
  const loaded = createRuntime(decoded.snapshot);
  const restored = loaded.inventory.itemByUid(candle.uid)!;
  expect(restored.on).toBe(false);
  expect(restored.burnRemainingGameSeconds).toBeCloseTo(remaining, 9);
  expect(restored.litAtGameTimestamp).toBeUndefined();
  expect(loaded.survival.use(restored)).toBeUndefined();
  expect(restored.on).toBe(true);
  expect(restored.litAtGameTimestamp).toBe(loaded.sim.calendar);
  expect(restored.burnRemainingGameSeconds).toBeCloseTo(remaining, 9);
});

it('a lit light saves its active ignition time and remaining burn', async () => {
  const source = createRuntime();
  const candle = lightCandleWithOffHandMatches(source);

  const decoded = await decodeSave(await encodeFixture(capture(source)), { version: formatVersion, contentLookup });
  const loaded = createRuntime(decoded.snapshot);
  expect(loaded.inventory.itemByUid(candle.uid)).toMatchObject({
    on: true,
    burnRemainingGameSeconds: candle.burnRemainingGameSeconds,
    litAtGameTimestamp: source.sim.calendar,
  });
});

it('restoring a left character ignores a fresh right choice and retains the physical inventory slots', async () => {
  const source = createRuntime(undefined, 'left');
  const saved = capture(source);
  const decoded = await decodeSave(await encodeFixture(saved), { version: formatVersion, contentLookup });
  const restored = createRuntime(decoded.snapshot, 'right');
  expect(restored.session.character.handedness).toBe('left');
  expect(restored.inventory.character).toBe(restored.session.character);
  expect(restored.inventory.snapshotState()).toEqual(saved.character.inventory);
});

it.each([undefined, 'ambidextrous'])(
  'the save encoder refuses handedness %s rather than inventing character identity',
  async (handedness) => {
    const saved = structuredClone(capture(createRuntime()));
    Reflect.set(saved.character.progression, 'handedness', handedness);
    await expect(encodeFixture(saved)).rejects.toThrow();
  },
);

it('a door lock survives the save codec and fresh native entity owner, independently of the source object', async () => {
  const source = createRuntime();
  const door = [...source.entities.all].find((entity) => registry.furniture.get(entity.type)?.door)!;
  door.lock = { id: 'test_shed', locked: true }; // authored metadata in this hamlet save fixture
  const snapshot = capture(source);
  expect(source.entities.setLocked(door, false, ['test_shed'])).toBeUndefined();
  const decoded = await decodeSave(await encodeFixture(snapshot), { version: formatVersion, contentLookup });
  const loaded = createRuntime(decoded.snapshot);
  const restored = loaded.entities.byUid(door.uid)!;
  expect(restored.lock).toEqual({ id: 'test_shed', locked: true });
  expect(loaded.entities.setOpen(restored, true)).toBe("It's locked");
  expect(loaded.entities.setLocked(restored, false, ['test_shed'])).toBeUndefined();
  expect(loaded.entities.setOpen(restored, true)).toBeUndefined();
});

const jsonCanonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(jsonCanonical).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${jsonCanonical(object[key])}`).join(',')}}`;
};
const sealEnvelope = async (envelope: Record<string, unknown>, preserveLength = false): Promise<Uint8Array> => {
  const { payload } = envelope;
  const payloadBytes = new TextEncoder().encode(jsonCanonical(payload));
  if (!preserveLength) {
    envelope.payloadByteLength = payloadBytes.byteLength;
  }
  const digest = await crypto.subtle.digest('SHA-256', payloadBytes.slice().buffer as ArrayBuffer);
  envelope.checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return new TextEncoder().encode(jsonCanonical(envelope));
};
const parseEnvelope = (bytes: Uint8Array): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
const getObject = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;
const reverseObjectKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(reverseObjectKeys);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, child]) => [key, reverseObjectKeys(child)]),
  );
};
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: recursive matcher explicitly checks every primitive with Object.is.
const assertNumbersObjectIs = (expected: unknown, actual: unknown, path = '$'): void => {
  if (typeof expected === 'number') {
    if (typeof actual !== 'number' || !Object.is(actual, expected)) {
      throw new Error(`Number differs at ${path}`);
    }
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new Error(`Array differs at ${path}`);
    }
    for (const [index, value] of expected.entries()) {
      assertNumbersObjectIs(value, actual[index], `${path}[${index}]`);
    }
    return;
  }
  if (typeof expected === 'object' && expected !== null) {
    if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
      throw new Error(`Object differs at ${path}`);
    }
    const left = Object.keys(expected).sort();
    const right = Object.keys(actual).sort();
    if (left.join('\\u0000') !== right.join('\\u0000')) {
      throw new Error(`Object keys differ at ${path}`);
    }
    for (const key of left) {
      assertNumbersObjectIs(
        (expected as Record<string, unknown>)[key],
        (actual as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
    }
    return;
  }
  if (!Object.is(actual, expected)) {
    throw new Error(`Value differs at ${path}`);
  }
};

describe('canonical save format', () => {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: integration test couples save round-trip, tick advancement and single-contact restore.
  it('round-trips an active player swing and resolves its one pending hit after restore', async () => {
    const source = createRuntime();
    source.sim.frame(0.049);
    expect(source.sim.time).toBeCloseTo(0.049);
    for (const [id] of [...source.zombies.store.entries()]) {
      source.zombies.store.remove(id);
    }
    const id = source.zombies.add(
      registry.zombies.get('shambler')!,
      [source.player.body.pos[0] + 5, source.player.body.pos[1], source.player.body.pos[2]],
      [0, 0, 1],
    );
    const zombie = source.zombies.store.get(id)!;
    zombie.body.onGround = true;
    source.zombies.setFrozen(true);
    const posed = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, scale.blockSize));
    const { center } = posed.head.find((box) => box.bone === 'head')!;
    const origin: import('../src/core/coords.ts').Vec3 = [
      source.player.body.pos[0],
      source.player.body.pos[1] + PLAYER.eye / scale.blockSize,
      source.player.body.pos[2],
    ];
    const delta: import('../src/core/coords.ts').Vec3 = [
      center[0] - origin[0],
      center[1] - origin[1],
      center[2] - origin[2],
    ];
    const length = Math.hypot(...delta);
    const direction = delta.map((value) => value / length) as import('../src/core/coords.ts').Vec3;
    const bluntTuning = registry.meleeClasses.get('blunt')!;
    const weapon: MeleeWeapon = {
      damage: 1,
      reach: 4,
      cooldown: 0.8,
      stamina: 4,
      impulse: 4,
      damageVariance: bluntTuning.damageVariance,
      headDamageMultiplier: bluntTuning.headDamageMultiplier,
      limbDamageMultiplier: bluntTuning.limbDamageMultiplier,
      speedMultiplier: bluntTuning.speedMultiplier,
      type: 'blunt',
    };
    expect(source.zombies.aimAt(origin, direction, weapon)?.inReach).toBe(true);
    const hands = {
      right: source.inventory.hands.right?.uid ?? null,
      left: source.inventory.hands.left?.uid ?? null,
    };
    expect(
      startPlayerMelee(source.session.playerCombat, source.sim.needs, {
        origin,
        direction,
        weapon,
        profile: 'blunt',
        hand: 'right',
        twoHanded: false,
        hands,
      }),
    ).toBe('started');
    const initialHealth = zombie.regions.head;
    const snapshot = capture(source);
    const bytes = await encodeFixture(snapshot);
    const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
    expect(decoded.snapshot.character.playerCombat.meleeAction).toEqual(snapshot.character.playerCombat.meleeAction);
    const loaded = createRuntime(decoded.snapshot);
    loaded.zombies.setFrozen(true);
    expect(loaded.session.playerCombat.activeMeleeAction?.elapsed).toBe(0);

    let restoredContactHealth: number | undefined;
    for (const runtime of [source, loaded]) {
      const held = {
        right: runtime.inventory.hands.right?.uid ?? null,
        left: runtime.inventory.hands.left?.uid ?? null,
      };
      for (let tick = 1; tick < 15; tick++) {
        runtime.session.playerCombat.tick(1 / 60, held);
        if (tick % 3 === 0) {
          runtime.zombies.tick(0.05, tick / 20, held);
        }
        expect(runtime.zombies.store.get(id)?.regions.head).toBe(initialHealth);
      }
      runtime.session.playerCombat.tick(1 / 60, held);
      runtime.zombies.tick(0.05, 0.25, held);
      const contactHealth = runtime.zombies.store.get(id)?.regions.head;
      expect(contactHealth).toBeLessThan(initialHealth);
      if (restoredContactHealth === undefined) {
        restoredContactHealth = contactHealth;
      } else {
        expect(contactHealth).toBe(restoredContactHealth);
      }
      for (let tick = 0; tick < 48; tick++) {
        runtime.session.playerCombat.tick(1 / 60, held);
        if (tick % 3 === 2) {
          runtime.zombies.tick(0.05, 0.3 + (tick + 1) / 60, held);
        }
      }
      expect(runtime.zombies.store.get(id)?.regions.head).toBe(restoredContactHealth);
    }
  });

  it('persists severed and damaged zombie regions through encode, decode, and restore', async () => {
    const source = createRuntime();
    const id = source.zombies.add(registry.zombies.get('shambler')!, [3, 4, 5]);
    const zombie = source.zombies.store.get(id)!;
    zombie.regions.leftArm = 0;
    zombie.regions.head = 37;
    zombie.regions.torso = 44;

    const snapshot = capture(source);
    const bytes = await encodeFixture(snapshot);
    const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
    const loaded = createRuntime(decoded.snapshot);
    const restored = loaded.zombies.store.get(id)!;

    expect(restored.regions).toEqual(zombie.regions);
    expect(capture(loaded)).toEqual(decoded.snapshot);
  });

  it('preserves an authored site id through the save codec', async () => {
    const snapshot = capture(createRuntime());
    const bytes = await encodeSave(snapshot, {
      generation: 1,
      version: formatVersion,
      worldOptions: { ...formatWorldOptions, site: 'lone_house' },
    });
    const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
    expect(decoded.worldOptions.site).toBe('lone_house');
  });

  it('round-trips an edited hamlet byte-exactly and continues deterministically from the restored bytes', async () => {
    const source = createRuntime(undefined, true);
    expect(startRest(source, 'rest')).toBeUndefined();
    advance(source, 2);
    prepareAudioContinuation(source);
    const snapshot = capture(source);
    const sourceHash = createHash('sha256').update(jsonCanonical(snapshot)).digest('hex');
    const started = performance.now();
    const bytes = await encodeFixture(snapshot);
    const encodedAt = performance.now();
    const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
    const decodedAt = performance.now();
    const wirePayload = getObject(parseEnvelope(bytes).payload);
    const wireWorld = getObject(wirePayload.world);
    expect(Object.keys(getObject(wireWorld.regions)).length).toBeGreaterThan(0);

    expect(decoded.generation).toBe(7);
    expect(decoded.worldOptions).toEqual({
      ...formatWorldOptions,
      seed: snapshot.character.simulation.seed,
      clock: snapshot.character.simulation.clock,
    });
    expect(decoded.snapshot).toEqual(snapshot);
    const loaded = createRuntime(decoded.snapshot, true);
    expect(createHash('sha256').update(jsonCanonical(decoded.snapshot)).digest('hex')).toBe(sourceHash);
    advance(source, 1);
    advance(loaded, 1);
    expect(inspect(loaded)).toEqual(inspect(source));

    const interruptedSnapshot = structuredClone(snapshot);
    interruptedSnapshot.character.simulation.pendingInterrupt = 'format round-trip';
    const interruptedBytes = await encodeFixture(interruptedSnapshot);
    const interruptedDecoded = await decodeSave(interruptedBytes, { version: formatVersion, contentLookup });
    expect(interruptedDecoded.snapshot.character.simulation.pendingInterrupt).toBe('format round-trip');
    expect(interruptedDecoded.snapshot).toEqual(interruptedSnapshot);
    const interruptedLoaded = createRuntime(interruptedDecoded.snapshot, true);
    expect(capture(interruptedLoaded).character.simulation.pendingInterrupt).toBe('format round-trip');

    const reversed = reverseObjectKeys(snapshot) as SaveSnapshot;
    expect(await encodeFixture(reversed)).toEqual(bytes);
    expect(encodedAt - started).toBeGreaterThanOrEqual(0);
    expect(decodedAt - encodedAt).toBeGreaterThanOrEqual(0);
  }, 20_000);

  it('checks a representative ten-hour hamlet save and records its size and timings', async () => {
    const runtime = createRuntime(undefined, true);
    const worldStats = applyBudgetWorldEdits(runtime);
    const pileStats = applyBudgetPiles(runtime);
    const population = touchBudgetFurnitureAndZombies(runtime);
    expect(worldStats.visitedChunks).toBeGreaterThan(0);
    expect(worldStats.editedChunks).toBeGreaterThan(0);
    expect(worldStats.editedChunks).toBeLessThan(worldStats.visitedChunks);
    expect(pileStats.pileCount).toBeGreaterThan(0);
    expect(pileStats.addedItems).toBe(pileStats.pileCount * pileStats.pileCapacity);
    expect(population.touchedContainers).toBeGreaterThan(0);
    expect(population.spawned).toBeGreaterThan(0);

    // 1:8 clock ratio makes 4,500 simulation seconds ten game hours. Advance
    // scheduler cursors without running the fixed-rate physics ticks.
    setBudgetClock(runtime);
    const snapshot = capture(runtime);
    expect(snapshot.world.diffs.chunks.length).toBeGreaterThanOrEqual(worldStats.editedChunks);
    expect(snapshot.world.spawned.length).toBe(population.spawned);
    expect(snapshot.world.zombies.zombies.length).toBe(population.alive);
    expect(snapshot.character.inventory.piles.length).toBe(pileStats.pileCount + pileStats.baselinePileCount);
    expect(snapshot.character.inventory.piles.reduce((sum, pile) => sum + pile.items.length, 0)).toBe(
      pileStats.pileCount * pileStats.pileCapacity + pileStats.baselinePileItems,
    );
    expect(snapshot.character.inventory.entities.entities.filter((entity) => entity.searched).length).toBe(
      population.touchedContainers,
    );
    const encodeStarted = performance.now();
    const bytes = await encodeSave(snapshot, { generation: 1, worldOptions: formatWorldOptions });
    const encodeMs = performance.now() - encodeStarted;
    expect(bytes.byteLength).toBeLessThan(TEN_HOUR_SAVE_BUDGET_BYTES);

    const decodeStarted = performance.now();
    const decoded = await decodeSave(bytes, { contentLookup });
    const decodeMs = performance.now() - decodeStarted;
    const loadStarted = performance.now();
    const loaded = createRuntime(decoded.snapshot, true);
    const restoreMs = performance.now() - loadStarted;
    const loadMs = decodeMs + restoreMs;
    expect(capture(loaded)).toEqual(decoded.snapshot);
    process.stdout.write(
      `SAVE_BUDGET_TEN_HOUR runner=${measurementRunner} visited=${worldStats.visitedChunks} edited=${worldStats.editedChunks} edits=${worldStats.editedChunks * 8} syntheticPiles=${pileStats.pileCount} totalPiles=${snapshot.character.inventory.piles.length} items=${pileStats.pileCount * pileStats.pileCapacity + pileStats.baselinePileItems} touchedContainers=${population.touchedContainers} spawnedKeys=${population.spawned} alive=${population.alive} size=${bytes.byteLength} encodeMs=${encodeMs.toFixed(1)} decodeMs=${decodeMs.toFixed(1)} restoreMs=${restoreMs.toFixed(1)} loadMs=${loadMs.toFixed(1)}\n`,
    );
  }, 30_000);

  it('preserves signed zero, subnormals, the largest safe integer, and ordinary decimal values exactly', async () => {
    const snapshot = structuredClone(capture(createRuntime())) as SaveSnapshot;
    snapshot.character.player.yaw = -0;
    snapshot.character.progression.skills.crafting = -0;
    snapshot.character.simulation.needs.stamina = Number.MIN_VALUE;
    snapshot.character.simulation.needs.calories = 2.225_073_858_507_201e-308;
    snapshot.character.player.body.pos[0] = 0.1 + 0.2;
    snapshot.character.inventory.nextItemUid = Number.MAX_SAFE_INTEGER;
    const decoded = await decodeSave(await encodeFixture(snapshot), { version: formatVersion, contentLookup });
    assertNumbersObjectIs(snapshot, decoded.snapshot);
    const loaded = createRuntime(decoded.snapshot).session.character;
    expect(Object.is(loaded.skills.crafting, -0)).toBe(true);

    await Promise.all(
      [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map(async (value) => {
        const invalid = structuredClone(snapshot);
        invalid.character.player.yaw = value;
        await expect(encodeFixture(invalid)).rejects.toThrow('snapshot.character.player.yaw');
      }),
    );
  });

  it('rejects user objects that collide with the reserved negative-zero tag', async () => {
    const snapshot = structuredClone(capture(createRuntime())) as SaveSnapshot;
    (snapshot.character.player as unknown as Record<string, unknown>).surprise = { [NEGATIVE_ZERO_TAG]: '-0' };
    await expect(encodeFixture(snapshot)).rejects.toThrow('Reserved number tag');
  });

  it('keeps the Git revision as diagnostic metadata, outside save compatibility', async () => {
    const snapshot = capture(createRuntime());
    const bytes = await encodeSave(snapshot, {
      generation: 1,
      version: formatVersion,
      buildRevision: 'saved-git-revision',
      worldOptions: formatWorldOptions,
    });
    const decoded = await decodeSave(bytes, {
      version: formatVersion,
      buildRevision: 'running-git-revision',
      contentLookup,
    });
    expect(decoded.versionIdentity.buildRevision).toBe('saved-git-revision');
    expect(decoded.versionIdentity.components.simulationHash).toBe(formatVersion.simulationHash);
  });

  it('refuses an exact version mismatch before content lookup and never mutates the input bytes', async () => {
    const bytes = await encodeSave(capture(createRuntime()), {
      generation: 1,
      version: formatVersion,
      buildRevision: 'saved-git-revision-aaaaaaaa',
      worldOptions: formatWorldOptions,
    });
    const original = bytes.slice();
    let lookups = 0;
    const otherVersion = { ...formatVersion, simulationHash: 'f'.repeat(64) };
    let mismatch: unknown;
    try {
      await decodeSave(bytes, {
        version: otherVersion,
        buildRevision: 'running-git-revision-bbbbbbbb',
        contentLookup: () => {
          lookups += 1;
          return true;
        },
      });
    } catch (error) {
      mismatch = error;
    }
    expect(lookups).toBe(0);
    expect(mismatch).toBeInstanceOf(Error);
    expect((mismatch as Error).message).toContain('Save version mismatch');
    expect((mismatch as Error).message).toContain('saved-git-revision-aaaaaaaa');
    expect((mismatch as Error).message).toContain('running-git-revision-bbbbbbbb');
    expect((mismatch as Error).message).toContain(formatVersion.simulationHash);
    expect((mismatch as Error).message).toContain(otherVersion.simulationHash);
    expect(bytes).toEqual(original);
  });

  it('identifies content-pack-only differences in the refusal message', async () => {
    const savedVersion = {
      ...formatVersion,
      contentPacks: formatVersion.contentPacks.map((pack) => ({ ...pack, canonicalHash: 'f'.repeat(64) })),
    };
    const bytes = await encodeSave(capture(createRuntime()), {
      generation: 1,
      version: savedVersion,
      buildRevision: 'saved-content-revision',
      worldOptions: formatWorldOptions,
    });
    let mismatch: unknown;
    try {
      await decodeSave(bytes, {
        version: formatVersion,
        buildRevision: 'running-content-revision',
        contentLookup: () => true,
      });
    } catch (error) {
      mismatch = error;
    }
    expect(mismatch).toBeInstanceOf(Error);
    expect((mismatch as Error).message).toContain('content packs');
    expect((mismatch as Error).message).toContain('deadvox.base');
    expect((mismatch as Error).message).toContain(formatVersion.simulationHash);
  });

  it('accepts saved legendary skills and rejects levels outside the character scale', async () => {
    const valid = await encodeFixture(capture(createRuntime()));
    const legendary = parseEnvelope(valid);
    const legendaryPayload = getObject(legendary.payload);
    const legendaryCharacter = getObject(legendaryPayload.character);
    const legendaryProgression = getObject(legendaryCharacter.progression);
    const legendarySkills = getObject(legendaryProgression.skills);
    const skill = Object.keys(legendarySkills)[0]!;
    legendarySkills[skill] = SKILL_LEVEL_LEGENDARY;
    const decoded = await decodeSave(await sealEnvelope(legendary), { version: formatVersion, contentLookup });
    expect(decoded.snapshot.character.progression.skills[skill]).toBe(SKILL_LEVEL_LEGENDARY);

    await Promise.all(
      [SKILL_LEVEL_LEGENDARY + 1, SKILL_LEVEL_MIN - 1].map(async (level) => {
        const envelope = parseEnvelope(valid);
        const invalidPayload = getObject(envelope.payload);
        const invalidCharacter = getObject(invalidPayload.character);
        const invalidProgression = getObject(invalidCharacter.progression);
        const invalidSkills = getObject(invalidProgression.skills);
        const invalidSkill = Object.keys(invalidSkills)[0]!;
        invalidSkills[invalidSkill] = level;
        await expect(
          decodeSave(await sealEnvelope(envelope), { version: formatVersion, contentLookup }),
        ).rejects.toThrow();
      }),
    );
  });

  it('rejects truncated, corrupted, non-canonical, over-limit, invalid-version, and malformed payloads', async () => {
    const valid = await encodeFixture(capture(createRuntime()));
    const malformed: {
      name: string;
      bytes: Promise<Uint8Array> | Uint8Array;
      options?: { maxPayloadBytes?: number };
      message: string;
    }[] = [];
    malformed.push({ name: 'truncated', bytes: valid.slice(0, -1), message: 'truncated' });
    malformed.push({ name: 'over limit', bytes: valid, options: { maxPayloadBytes: 16 }, message: 'configured limit' });
    malformed.push({
      name: 'noncanonical',
      bytes: new TextEncoder().encode(` ${new TextDecoder().decode(valid)}`),
      message: 'Non-canonical',
    });

    const badChecksum = parseEnvelope(valid);
    badChecksum.checksum = `${String(badChecksum.checksum)[0] === '0' ? '1' : '0'}${String(badChecksum.checksum).slice(1)}`;
    malformed.push({
      name: 'checksum',
      bytes: new TextEncoder().encode(jsonCanonical(badChecksum)),
      message: 'checksum mismatch',
    });
    const badLength = parseEnvelope(valid);
    badLength.payloadByteLength = Number(badLength.payloadByteLength) + 1;
    malformed.push({ name: 'length', bytes: sealEnvelope(badLength, true), message: 'Payload length mismatch' });
    const badMagic = parseEnvelope(valid);
    badMagic.magic = 'NOT_A_SAVE';
    malformed.push({ name: 'magic', bytes: sealEnvelope(badMagic), message: 'Invalid value' });
    const badSchema = parseEnvelope(valid);
    badSchema.schemaVersion = 1;
    malformed.push({ name: 'schema version', bytes: sealEnvelope(badSchema), message: 'schema mismatch' });

    const badRle = parseEnvelope(valid);
    const rlePayload = getObject(badRle.payload);
    const rleWorld = getObject(rlePayload.world);
    const rleRegions = Object.values(getObject(rleWorld.regions)) as Record<string, unknown>[];
    const rleChunks = rleRegions.find((region) => (region.chunks as unknown[]).length > 0)!.chunks as Record<
      string,
      unknown
    >[];
    const firstChunk = rleChunks[0]!;
    const firstRun = (firstChunk.runs as Record<string, unknown>[])[0]!;
    firstRun.id = (firstChunk.palette as unknown[]).length;
    malformed.push({ name: 'RLE', bytes: sealEnvelope(badRle), message: 'Malformed RLE run' });
    const adjacentSnapshot = structuredClone(capture(createRuntime())) as SaveSnapshot;
    const changedChunk = adjacentSnapshot.world.diffs.chunks[0]!;
    changedChunk.cells.push({ ...changedChunk.cells[0]!, index: changedChunk.cells[0]!.index + 1 });
    const nonMaximalRle = parseEnvelope(await encodeFixture(adjacentSnapshot));
    const nonMaximalPayload = getObject(nonMaximalRle.payload);
    const nonMaximalWorld = getObject(nonMaximalPayload.world);
    const nonMaximalRegion = Object.values(getObject(nonMaximalWorld.regions))[0] as Record<string, unknown>;
    const nonMaximalChunk = (nonMaximalRegion.chunks as Record<string, unknown>[])[0]!;
    const nonMaximalRuns = nonMaximalChunk.runs as Record<string, unknown>[];
    const maximalRun = nonMaximalRuns[0]!;
    const runStart = Number(maximalRun.start);
    const runLength = Number(maximalRun.length);
    expect(runLength).toBeGreaterThan(1);
    nonMaximalRuns.splice(
      0,
      1,
      { ...maximalRun, length: 1 },
      { ...maximalRun, start: runStart + 1, length: runLength - 1 },
    );
    malformed.push({ name: 'non-maximal RLE', bytes: sealEnvelope(nonMaximalRle), message: 'Non-maximal RLE runs' });

    const duplicate = parseEnvelope(valid);
    const duplicatePayload = getObject(duplicate.payload);
    const duplicateCharacter = getObject(duplicatePayload.character);
    const duplicateInventory = getObject(duplicateCharacter.inventory);
    const hands = getObject(duplicateInventory.hands);
    getObject(hands.left).uid = getObject(hands.right).uid;
    malformed.push({ name: 'duplicate item ID', bytes: sealEnvelope(duplicate), message: 'Duplicate item id' });

    const unknownField = parseEnvelope(valid);
    const unknownPayload = getObject(unknownField.payload);
    const unknownCharacter = getObject(unknownPayload.character);
    getObject(unknownCharacter.player).surprise = true;
    malformed.push({ name: 'unknown field', bytes: sealEnvelope(unknownField), message: 'Unknown field' });
    const missingField = parseEnvelope(valid);
    const missingPayload = getObject(missingField.payload);
    const missingCharacter = getObject(missingPayload.character);
    Reflect.deleteProperty(getObject(missingCharacter.player), 'pitch');
    malformed.push({ name: 'missing field', bytes: sealEnvelope(missingField), message: 'Missing field' });
    const invalidRange = parseEnvelope(valid);
    const invalidPayload = getObject(invalidRange.payload);
    const invalidCharacter = getObject(invalidPayload.character);
    const invalidInventory = getObject(invalidCharacter.inventory);
    getObject(getObject(invalidInventory.hands).right).uid = 0;
    malformed.push({ name: 'invalid item ID range', bytes: sealEnvelope(invalidRange), message: 'Invalid number' });

    const unknownId = parseEnvelope(valid);
    const unknownIdPayload = getObject(unknownId.payload);
    const unknownIdCharacter = getObject(unknownIdPayload.character);
    const unknownInventory = getObject(unknownIdCharacter.inventory);
    getObject(getObject(unknownInventory.hands).right).type = 'not_a_real_item';
    malformed.push({ name: 'unknown content ID', bytes: sealEnvelope(unknownId), message: 'Unknown item content id' });
    const unknownSystem = parseEnvelope(valid);
    const unknownSystemPayload = getObject(unknownSystem.payload);
    const unknownSystemCharacter = getObject(unknownSystemPayload.character);
    const unknownSimulation = getObject(unknownSystemCharacter.simulation);
    const unknownScheduler = getObject(unknownSimulation.scheduler);
    (unknownScheduler.systems as Record<string, unknown>[])[0]!.id = 'missing_system';
    malformed.push({
      name: 'unknown scheduler system',
      bytes: sealEnvelope(unknownSystem),
      message: 'Unknown scheduler content id',
    });

    await Promise.all(
      malformed.map(async (test) => {
        const bytes = await test.bytes;
        let rejection: unknown;
        try {
          await decodeSave(bytes, { version: formatVersion, contentLookup, ...test.options });
        } catch (error) {
          rejection = error;
        }
        expect(rejection, test.name).toBeInstanceOf(Error);
        expect((rejection as Error).message, test.name).toContain(test.message);
      }),
    );
  }, 20_000);
});
