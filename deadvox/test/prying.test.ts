import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { Character, practiceForNextLevel, SKILL_LEVEL_MAX } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { doorOptions } from '../src/core/options.ts';
import { pryPlan } from '../src/core/prying.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { DOOR_ACTION } from '../src/game/doorAction.ts';
import {
  advance,
  capture,
  contentLookup,
  createRuntime,
  encodeFixture,
  formatVersion,
  registry,
} from './snapshotTestSupport.ts';

const baseContent = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({
    source: file,
    data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown,
  }));
const doorDef = registry.furniture.get('wood_door')!;
const makeDoor = (runtime: ReturnType<typeof createRuntime>) => {
  const door = runtime.inventory.furnish({
    type: doorDef.id,
    pos: [0, 1, 1],
    size: doorDef.size,
    facing: 'n',
    lock: { id: 'test_shed', locked: true },
  });
  if (!door) {
    throw new Error('Could not place the prying fixture door');
  }
  return door;
};
const carryCrowbar = (runtime: ReturnType<typeof createRuntime>) => {
  const light = runtime.inventory.hands.left;
  if (!(light && runtime.inventory.consume(light))) {
    throw new Error('Could not free a hand for the fixture crowbar');
  }
  const crowbar = runtime.inventory.create('crowbar');
  if (!runtime.inventory.add(crowbar, { kind: 'hand', side: 'left' })) {
    throw new Error('Could not hold the fixture crowbar');
  }
  return crowbar;
};
const nearSpawn: [number, number, number] = [0, 1, 0];
const pryingQualityHint = /prying quality/;
const makePryRuntime = (snapshot?: Parameters<typeof createRuntime>[0], active = false) => {
  const runtime = createRuntime(snapshot, false, undefined, { spawn: nearSpawn, active });
  const floor = registry.blockIds.get('planks')!;
  for (let x = -1; x <= 1; x++) {
    for (let z = 0; z <= 6; z++) {
      runtime.world.setBlock(x, 0, z, floor);
    }
  }
  return runtime;
};

it('requires a carried tool meeting the door quality and takes its time from content', () => {
  const inventory = new Inventory(registry);
  const door = inventory.furnish({
    type: doorDef.id,
    pos: [0, 1, 1],
    size: doorDef.size,
    facing: 'n',
    lock: { id: 'test_shed', locked: true },
  })!;
  const tuning = doorDef.door?.prying;
  if (!tuning) {
    throw new Error('Fixture door has no prying tuning');
  }
  const missing = pryPlan(inventory, door);
  expect(missing.ok).toBe(false);
  if (missing.ok) {
    throw new Error('Prying started without a carried tool');
  }
  expect(missing.reason.toLowerCase()).toContain('quality');

  const backpack = inventory.create('hiking_backpack');
  const crowbar = inventory.create('crowbar');
  expect(inventory.add(backpack, { kind: 'hand', side: 'right' })).toBe(true);
  expect(inventory.add(crowbar, { kind: 'pocket', owner: backpack, pocket: 0 })).toBe(true);
  const plan = pryPlan(inventory, door);
  expect(plan.ok).toBe(true);
  if (!plan.ok) {
    throw new Error(plan.reason);
  }
  expect(plan.tool.uid).toBe(crowbar.uid);
  expect(plan.time).toBe(tuning.timeSimSeconds);
  expect(plan.strikeInterval).toBe(tuning.strikeIntervalSimSeconds);
});

it('higher mechanics skill shortens prying and preserves its strike count', () => {
  const inventory = new Inventory(registry);
  const definition = registry.furniture.get('wood_door')!;
  const door = inventory.furnish({
    type: definition.id,
    pos: [0, 1, 1],
    size: definition.size,
    facing: 'n',
    lock: { id: 'test_shed', locked: true },
  })!;
  const crowbar = inventory.create('crowbar');
  expect(inventory.add(crowbar, { kind: 'hand', side: 'right' })).toBe(true);
  const character = new Character(registry);
  const slow = pryPlan(inventory, door, crowbar.uid, character);
  if (!slow.ok) {
    throw new Error(slow.reason);
  }
  const tuning = definition.door!.prying!;
  expect(slow.time).toBe(tuning.timeSimSeconds);
  while (character.skills.mechanics! < SKILL_LEVEL_MAX) {
    character.awardPractice('mechanics', practiceForNextLevel(character.skills.mechanics!), SKILL_LEVEL_MAX);
  }
  const fast = pryPlan(inventory, door, crowbar.uid, character);
  if (!fast.ok) {
    throw new Error(fast.reason);
  }
  expect(fast.time).toBe(tuning.fastestTimeSimSeconds);
  expect(fast.time).toBeLessThan(slow.time);
  expect(Math.floor(fast.time / fast.strikeInterval)).toBe(Math.floor(slow.time / slow.strikeInterval));
});

it('prying advances at normal simulation speed without compression', () => {
  const runtime = makePryRuntime();
  const control = makePryRuntime();
  const door = makeDoor(runtime);
  const crowbar = carryCrowbar(runtime);
  expect(runtime.session.pryDoor(door, crowbar.uid)).toBeUndefined();
  expect(runtime.sim.compression.active).toBe(false);

  runtime.sim.frame(1);
  control.sim.frame(1);

  expect(runtime.sim.time).toBe(control.sim.time);
  expect(runtime.sim.compression.active).toBe(false);
  expect(runtime.sim.actions.job?.jobType).toBe('pry');
  if (runtime.sim.actions.job?.jobType !== 'pry') {
    throw new Error('The normal-speed pry did not retain its action');
  }
  expect(runtime.sim.actions.job.stopped).toBe(false);
  expect(runtime.sim.actions.job.elapsed).toBeGreaterThan(0);
});

it('an interruption stops normal-speed prying with progress retained for the same-door interaction', () => {
  const runtime = makePryRuntime();
  const door = makeDoor(runtime);
  const crowbar = carryCrowbar(runtime);
  const notices: string[] = [];
  runtime.sim.actions.notice = (text) => notices.push(text);
  expect(runtime.session.pryDoor(door, crowbar.uid)).toBeUndefined();
  runtime.sim.frame(1);
  const before = runtime.sim.actions.job;
  if (before?.jobType !== 'pry') {
    throw new Error('The normal-speed pry did not retain its action');
  }
  expect(before.stopped).toBe(false);
  const reason = 'A test interruption';

  runtime.sim.emit({ kind: 'interrupt', reason });
  runtime.sim.frame(0.1);

  expect(runtime.sim.actions.job).toMatchObject({
    jobType: 'pry',
    stopped: true,
    entityUid: door.uid,
    toolUid: crowbar.uid,
    elapsed: before.elapsed,
  });
  expect(notices).toContain(reason);
  expect(runtime.sim.compression.interruption).toBeUndefined();
  expect(runtime.sim.compression.c).toBe(1);
  expect(runtime.sim.compression.active).toBe(false);
  expect(runtime.sim.compression.locksInput).toBe(false);

  expect(runtime.session.pryDoor(door, crowbar.uid)).toBeUndefined();
  expect(runtime.sim.actions.job).toMatchObject({ jobType: 'pry', stopped: false, elapsed: before.elapsed });
});

it('losing the carried tool stops prying without an input latch and leaves movement available', () => {
  const runtime = makePryRuntime(undefined, true);
  const door = makeDoor(runtime);
  const crowbar = carryCrowbar(runtime);
  const notices: string[] = [];
  runtime.sim.actions.notice = (text) => notices.push(text);
  expect(runtime.session.pryDoor(door, crowbar.uid)).toBeUndefined();
  runtime.sim.frame(1);
  const before = runtime.sim.actions.job;
  if (before?.jobType !== 'pry') {
    throw new Error('The normal-speed pry did not retain its action');
  }
  expect(before.elapsed).toBeGreaterThan(0);
  const drop = runtime.inventory.move(crowbar, {
    kind: 'pile',
    pos: [runtime.session.body.pos[0], runtime.session.body.pos[1], runtime.session.body.pos[2]],
  });
  if (!drop.ok) {
    throw new Error(`Could not drop the prying tool: ${drop.reason}`);
  }

  runtime.sim.frame(1);

  expect(runtime.sim.actions.job).toMatchObject({ jobType: 'pry', stopped: true, elapsed: before.elapsed });
  expect(notices.at(-1)).toMatch(pryingQualityHint);
  expect(runtime.sim.compression.interruption).toBeUndefined();
  expect(runtime.sim.compression.locksInput).toBe(false);
  const positionBeforeMove = [...runtime.session.body.pos];
  runtime.view.intent.forward = 1;
  runtime.sim.frame(0.5);
  expect(
    Math.hypot(
      runtime.session.body.pos[0]! - positionBeforeMove[0]!,
      runtime.session.body.pos[2]! - positionBeforeMove[2]!,
    ),
  ).toBeGreaterThan(0);
});

it('the matching key still unlocks a pryable door silently', () => {
  const runtime = makePryRuntime();
  const door = makeDoor(runtime);
  const light = runtime.inventory.hands.left;
  if (!(light && runtime.inventory.consume(light))) {
    throw new Error('Could not free a hand for the fixture key');
  }
  if (!runtime.inventory.add(runtime.inventory.create('shed_key'), { kind: 'hand', side: 'left' })) {
    throw new Error('Could not hold the fixture key');
  }
  const unlock = doorOptions(runtime.inventory, door)[1]!;
  if (!unlock.plan.ok) {
    throw new Error(unlock.plan.reason);
  }
  runtime.session.queue.enqueueAction(DOOR_ACTION, unlock.label, unlock.plan.time, {
    entityUid: door.uid,
    locked: false,
  });
  expect(runtime.session.queue.tick(unlock.plan.time).failed).toEqual([]);
  expect(door.lock).toEqual({ id: 'test_shed', locked: false });
  expect(runtime.heardSounds).toEqual([]);
});

it('refuses a carried tool below the content quality threshold', () => {
  const { quality } = doorDef.door!.prying!;
  const { registry: weakRegistry, issues } = buildRegistry([
    ...baseContent,
    {
      source: 'weak-prying-tool.json',
      data: {
        items: [
          {
            id: 'weak_crowbar',
            name: 'Weak crowbar',
            category: 'tool',
            weight: 1,
            size: [1, 1],
            tool: { qualities: { prying: quality - 1 } },
          },
        ],
      },
    },
  ]);
  expect(issues).toEqual([]);
  const inventory = new Inventory(weakRegistry);
  const weakDoor = inventory.furnish({
    type: doorDef.id,
    pos: [0, 1, 1],
    size: doorDef.size,
    facing: 'n',
    lock: { id: 'test_shed', locked: true },
  })!;
  const weakTool = inventory.create('weak_crowbar');
  expect(inventory.add(weakTool, { kind: 'hand', side: 'right' })).toBe(true);
  const plan = pryPlan(inventory, weakDoor);
  expect(plan.ok).toBe(false);
  if (plan.ok) {
    throw new Error('An under-quality tool began prying');
  }
  expect(plan.reason.toLowerCase()).toContain('quality');
});

it('a prying strike travels through the sound-hearing path and draws a shambler', () => {
  const runtime = makePryRuntime();
  const door = makeDoor(runtime);
  const crowbar = carryCrowbar(runtime);
  const shamblerType = registry.zombies.get('shambler')!;
  const id = runtime.zombies.add({ ...shamblerType, sight: 0, nightSight: 0 }, [0, 1, 5], [1, 0, 0]);
  const shambler = runtime.zombies.store.get(id)!;
  expect(runtime.session.pryDoor(door, crowbar.uid)).toBeUndefined();

  const { strikeIntervalSimSeconds: strikeInterval } = doorDef.door!.prying!;
  runtime.sim.scheduler.advance(strikeInterval + 2);

  const action = runtime.sim.actions.job;
  if (action?.jobType !== 'pry') {
    throw new Error('The short prying observation unexpectedly finished its action');
  }
  expect(runtime.heardSounds.filter(({ event }) => event === 'lock_pry')).toHaveLength(
    Math.floor(action.elapsed / strikeInterval),
  );
  expect(shambler.mode).toBe('investigate');
});

it('saves a running pry just before a long-action tick and completes on the same frame after load', async () => {
  const framesBeforeSave = 300;
  const uninterrupted = makePryRuntime();
  const split = makePryRuntime();
  const uninterruptedDoor = makeDoor(uninterrupted);
  const splitDoor = makeDoor(split);
  const uninterruptedCrowbar = carryCrowbar(uninterrupted);
  const splitCrowbar = carryCrowbar(split);
  expect(uninterrupted.session.pryDoor(uninterruptedDoor, uninterruptedCrowbar.uid)).toBeUndefined();
  expect(split.session.pryDoor(splitDoor, splitCrowbar.uid)).toBeUndefined();

  advance(uninterrupted, framesBeforeSave);
  advance(split, framesBeforeSave);
  const savedJob = split.sim.actions.job;
  if (savedJob?.jobType !== 'pry') {
    throw new Error('The pry ended before its continuation save');
  }
  expect(savedJob.last).toBeGreaterThan(split.sim.time);

  const bytes = await encodeFixture(capture(split));
  const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
  const loaded = makePryRuntime(decoded.snapshot);
  const loadedDoor = [...loaded.entities.all].find((entity) => entity.uid === splitDoor.uid);
  if (!loadedDoor) {
    throw new Error('The saved door was not restored');
  }
  expect(loaded.sim.actions.job).toMatchObject({ jobType: 'pry', stopped: false, elapsed: savedJob.elapsed });

  const frameLimit = Math.ceil((savedJob.duration - savedJob.elapsed) * 60) + 60;
  let completionFrame: number | undefined;
  for (let frame = 1; frame <= frameLimit; frame++) {
    advance(uninterrupted, 1);
    advance(loaded, 1);
    if (uninterruptedDoor.lock === undefined || loadedDoor.lock === undefined) {
      expect(uninterruptedDoor.lock).toBeUndefined();
      expect(loadedDoor.lock).toBeUndefined();
      completionFrame = frame;
      break;
    }
  }
  expect(completionFrame).toBeDefined();
  expect(uninterrupted.sim.actions.job).toBeUndefined();
  expect(loaded.sim.actions.job).toBeUndefined();
});

it('a stopped part-done pry and a destroyed lock round-trip through save and load', async () => {
  const runtime = makePryRuntime();
  const door = makeDoor(runtime);
  const crowbar = carryCrowbar(runtime);
  const tuning = doorDef.door!.prying!;
  expect(runtime.session.pryDoor(door, crowbar.uid)).toBeUndefined();

  runtime.sim.scheduler.advance(tuning.strikeIntervalSimSeconds / 2);
  runtime.sim.actions.stop();
  const elapsed = runtime.sim.actions.job?.jobType === 'pry' ? runtime.sim.actions.job.elapsed : 0;
  expect(elapsed).toBeGreaterThan(0);
  const bytes = await encodeFixture(capture(runtime));
  const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
  const loaded = makePryRuntime(decoded.snapshot);
  expect(loaded.sim.actions.job).toMatchObject({ jobType: 'pry', stopped: true, elapsed });
  expect(loaded.sim.actions.resume()).toBeUndefined();
  loaded.sim.scheduler.advance(tuning.timeSimSeconds - elapsed + 2);

  const loadedDoor = [...loaded.entities.all].find(
    (entity) => entity.type === doorDef.id && entity.pos.every((coordinate, axis) => coordinate === door.pos[axis]),
  );
  expect(loadedDoor).toBeDefined();
  expect(loadedDoor!.lock).toBeUndefined();
  expect(loaded.entities.setOpen(loadedDoor!, true)).toBeUndefined();

  const finalBytes = await encodeFixture(capture(loaded));
  const finalDecoded = await decodeSave(finalBytes, { version: formatVersion, contentLookup });
  const final = makePryRuntime(finalDecoded.snapshot);
  const finalDoor = [...final.entities.all].find(
    (entity) => entity.type === doorDef.id && entity.pos.every((coordinate, axis) => coordinate === door.pos[axis]),
  );
  expect(finalDoor).toMatchObject({ open: true });
  expect(finalDoor!.lock).toBeUndefined();
});
