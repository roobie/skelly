import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bookReadingHooks } from '../src/core/bookReading.ts';
import { Character } from '../src/core/character.ts';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import { planCraft } from '../src/core/crafting.ts';
import { craftActionHooks } from '../src/core/craftWork.ts';
import { dropSpots, Inventory } from '../src/core/inventory.ts';
import { defOf, footprint } from '../src/core/items.ts';
import { bindReach } from '../src/core/reach.ts';
import { craftingActivityTier } from '../src/core/skillTraining.ts';
import { gameSecondsToMinutes } from '../src/core/time.ts';
import { craftRows } from '../src/ui/craftReadout.ts';
import { BODY_TUNING_FIXTURE, Simulation } from './simulationFixture.ts';

const baseContent = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({
    source: file,
    data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown,
  }));
const { registry } = buildRegistry(baseContent);
const make = (
  saved?: {
    inventory: ReturnType<Inventory['snapshotState']>;
    simulation: ReturnType<Simulation['snapshotState']>;
    action: ReturnType<Simulation['actions']['snapshotState']>;
  },
  contentRegistry: Registry = registry,
) => {
  const inv = saved ? Inventory.restoreState(contentRegistry, saved.inventory) : new Inventory(contentRegistry);
  const sim = new Simulation({ seed: 1, restRate: () => sim.actions.restRate });
  const character = new Character(contentRegistry);
  const reach = bindReach({ inventory: inv, position: [0, 0, 0], blockSize: 0.5 });
  sim.actions.craft = craftActionHooks(inv, character, reach, () => [0, 0, 0]);
  sim.actions.reading = bookReadingHooks(inv, character);
  if (saved) {
    sim.restoreState(saved.simulation);
    sim.actions.restoreState(saved.action);
    sim.paused = false;
  }
  return { inv, sim, character, reach };
};
const start = () => {
  const runtime = make();
  for (const [type, count] of [
    ['stick', 1],
    ['rag', 2],
    ['wax', 1],
    ['kitchen_knife', 1],
  ] as const) {
    if (!runtime.inv.add(runtime.inv.create(type, count), { kind: 'pile', pos: [0, 0, 0] })) {
      throw new Error('Cannot place fixture input');
    }
  }
  const result = planCraft(registry.recipes.get('torch')!, runtime.reach(), runtime.character);
  if (!('plan' in result)) {
    throw new Error(result.missing.reason);
  }
  const item = runtime.inv.beginWork(result.plan);
  if (!item) {
    throw new Error('Cannot gather fixture inputs');
  }
  const refused = runtime.sim.actions.startCraft(item.uid);
  if (refused) {
    throw new Error(refused);
  }
  return { ...runtime, item, payload: item.work! };
};
const snapshot = (runtime: ReturnType<typeof make>) => ({
  inventory: runtime.inv.snapshotState(),
  simulation: runtime.sim.snapshotState(),
  action: runtime.sim.actions.snapshotState(),
});
const resultCount = (inv: Inventory) =>
  [...inv.items()].filter(({ item }) => item.type === 'torch').reduce((sum, { item }) => sum + item.count, 0);
const startRepair = () => {
  const runtime = make();
  const target = runtime.inv.create('crowbar');
  target.condition = 0.2;
  for (const [type, pos] of [
    ['crowbar', [0, 0, 0]],
    ['repair_kit', [1, 0, 0]],
    ['scrap_metal', [2, 0, 0]],
    ['duct_tape', [3, 0, 0]],
  ] as const) {
    const item = type === 'crowbar' ? target : runtime.inv.create(type);
    if (!runtime.inv.add(item, { kind: 'pile', pos: [...pos] })) {
      throw new Error(`Cannot place repair fixture item ${type}`);
    }
  }
  const plan = planCraft(registry.recipes.get('repair_crowbar')!, runtime.reach(), runtime.character);
  if (!('plan' in plan)) {
    throw new Error(plan.missing.reason);
  }
  const repairAmount = registry.recipes.get('repair_crowbar')!.repair!.amount;
  const work = runtime.inv.beginWork(plan.plan, { targetUid: target.uid, amount: repairAmount });
  if (!work) {
    throw new Error('Cannot gather repair inputs');
  }
  if (runtime.sim.actions.startCraft(work.uid)) {
    throw new Error('Cannot start repair');
  }
  return { ...runtime, target, work, materials: plan.plan.components.map(({ item }) => item.uid) };
};

describe('core long actions', () => {
  it('stops long-action progress while unconscious and resumes after wake', () => {
    const { sim } = make();
    let finished = 0;
    sim.actions.treatment = {
      validate: () => undefined,
      finish: () => {
        finished += 1;
        return true;
      },
    };
    expect(sim.actions.beginTreatment('torso', 1, 'rag', 10)).toBeUndefined();
    sim.body.impact(0, 'torso', { shockDamage: 100 });
    expect(sim.actions.beginTreatment('torso', 1, 'rag', 10)).toBeDefined();
    expect(sim.actions.resume()).toBeDefined();

    sim.scheduler.advance(BODY_TUNING_FIXTURE.knockoutSimSeconds);
    expect(sim.actions.job).toMatchObject({ jobType: 'treatment', stopped: true });
    expect(finished).toBe(0);
    expect(sim.body.unconscious).toBe(false);
    expect(sim.actions.resume()).toBeUndefined();
    const resumedJob = sim.actions.job;
    if (resumedJob?.jobType !== 'treatment') {
      throw new Error('Treatment action did not resume');
    }
    sim.scheduler.advance(resumedJob.duration - resumedJob.elapsed + 1);

    expect(finished).toBe(1);
    expect(sim.actions.job).toBeUndefined();
  });

  it('awards recipe-skill practice only when the craft finishes', () => {
    const starting = new Character(registry);
    const expected = new Character(registry);
    const torch = registry.recipes.get('torch')!;
    expected.awardPractice(
      'crafting',
      gameSecondsToMinutes(torch.timeGameMinutes),
      craftingActivityTier(torch.skills.crafting!, registry.skills.get('crafting')!.training!.craftingTierOffset!),
    );
    const runtime = start();
    expect(runtime.character.skills).toEqual(starting.skills);
    expect(runtime.character.practice).toEqual(starting.practice);
    runtime.sim.actions.stop();
    expect(runtime.character.skills).toEqual(starting.skills);
    expect(runtime.character.practice).toEqual(starting.practice);
    expect(runtime.sim.actions.resume()).toBeUndefined();
    const { duration } = runtime.payload;
    runtime.sim.scheduler.advance(duration / runtime.sim.clock.ratio + 2);
    expect(runtime.character.skills).toEqual(expected.skills);
    expect(runtime.character.practice).toEqual(expected.practice);
    expect(runtime.inv.hands.right?.type).toBe('torch');
    expect(runtime.sim.actions.job).toBeUndefined();
  });
  it('stopped prying resumes elapsed work without counting its pause', () => {
    const runtime = make();
    const { sim } = runtime;
    const strikes: number[] = [];
    let finished = false;
    sim.actions.prying = {
      validate: () => undefined,
      strike: (_entityUid, _toolUid, time) => strikes.push(time),
      finish: () => {
        finished = true;
      },
    };
    const duration = 100;
    const strikeInterval = 50;
    expect(sim.actions.beginPrying(7, 11, duration, strikeInterval)).toBeUndefined();
    expect(sim.compression.active).toBe(false);
    sim.scheduler.advance(10);
    sim.actions.stop();
    const { job } = sim.actions;
    const elapsed = job?.jobType === 'pry' ? job.elapsed : 0;
    expect(elapsed).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(strikeInterval);
    sim.scheduler.advance(200);
    expect(sim.actions.job).toMatchObject({ jobType: 'pry', stopped: true, elapsed });
    expect(strikes).toEqual([]);

    expect(sim.actions.resume()).toBeUndefined();
    expect(sim.compression.active).toBe(false);
    sim.scheduler.advance(10);
    const resumed = sim.actions.job;
    if (resumed?.jobType !== 'pry') {
      throw new Error('The resumed action was lost');
    }
    expect(resumed.elapsed).toBeGreaterThan(elapsed);
    expect(strikes).toEqual([]);
    expect(finished).toBe(false);
    sim.scheduler.advance(duration + 2);
    expect(sim.actions.job).toBeUndefined();
    expect(strikes).toHaveLength(2);
    expect(finished).toBe(true);
  });
  it('re-interacting with the same door resumes prying at its saved strike cursor', () => {
    const { sim } = make();
    sim.actions.prying = {
      validate: () => undefined,
      strike: () => undefined,
      finish: () => undefined,
    };
    expect(sim.actions.beginPrying(7, 11, 100, 50)).toBeUndefined();
    sim.scheduler.advance(10);
    sim.actions.stop();
    const stopped = sim.actions.job;
    if (stopped?.jobType !== 'pry') {
      throw new Error('The stopped pry was lost');
    }
    const { elapsed, nextStrike } = stopped;
    expect(sim.actions.beginPrying(7, 11, 100, 50)).toBeUndefined();
    expect(sim.actions.job).toMatchObject({ jobType: 'pry', stopped: false, elapsed, nextStrike });
  });
  it('Read resumes the same interrupted book from its saved progress', () => {
    const runtime = make();
    const book = runtime.inv.create('field_manual');
    expect(runtime.inv.add(book, { kind: 'hand', side: 'right' })).toBe(true);
    expect(runtime.sim.actions.beginReading(book.uid)).toBeUndefined();
    runtime.sim.scheduler.advance(10 / runtime.sim.clock.ratio);
    runtime.sim.actions.stop();
    expect(runtime.sim.actions.job).toMatchObject({
      jobType: 'reading',
      stopped: true,
      bookUid: book.uid,
      elapsed: 10,
    });

    expect(runtime.sim.actions.beginReading(book.uid)).toBeUndefined();
    expect(runtime.sim.actions.job).toMatchObject({
      jobType: 'reading',
      stopped: false,
      bookUid: book.uid,
      elapsed: 10,
    });
  });

  it('resumes reading the held book and teaches its recipes only once on completion', () => {
    const fixtureContent = {
      items: [
        {
          id: 'reading_fixture_book',
          name: 'Fixture manual',
          category: 'book',
          weight: 1,
          size: [1, 1],
          book: { title: 'Fixture manual', recipes: ['reading_fixture'], readingGameMinutes: 1 },
        },
      ],
      recipes: [
        {
          id: 'reading_fixture',
          result: { item: 'torch', count: 1 },
          timeGameMinutes: 1,
          skills: {},
          qualities: {},
          components: [[{ item: 'rag', count: 1 }]],
        },
      ],
    };
    const fixtureRegistry = buildRegistry([
      ...baseContent,
      { source: 'reading-fixture.json', data: fixtureContent },
    ]).registry;
    const runtime = make(undefined, fixtureRegistry);
    const item = runtime.inv.create('reading_fixture_book');
    const startingSkills = { ...runtime.character.skills };
    const startingPractice = { ...runtime.character.practice };
    expect(runtime.inv.add(item, { kind: 'hand', side: 'right' })).toBe(true);
    expect(runtime.character.knownRecipes.has('reading_fixture')).toBe(false);
    expect(runtime.sim.actions.beginReading(item.uid)).toBeUndefined();
    runtime.sim.scheduler.advance(10 / runtime.sim.clock.ratio);
    runtime.sim.actions.stop();
    expect(runtime.sim.actions.job).toMatchObject({ jobType: 'reading', stopped: true, elapsed: 10 });
    expect(runtime.character.knownRecipes.has('reading_fixture')).toBe(false);
    const restored = make(snapshot(runtime), fixtureRegistry);
    expect(restored.sim.actions.resume()).toBeUndefined();
    const reading = restored.sim.actions.job;
    if (reading?.jobType !== 'reading') {
      throw new Error('Reading action was not resumed');
    }
    restored.sim.scheduler.advance((reading.duration - reading.elapsed) / restored.sim.clock.ratio + 2);
    expect(restored.character.knownRecipes.has('reading_fixture')).toBe(true);
    expect(restored.character.skills).toEqual(startingSkills);
    expect(restored.character.practice).toEqual(startingPractice);
    expect(
      craftRows({
        registry: fixtureRegistry,
        character: restored.character,
        reach: restored.reach(),
        preferences: {},
        startReason: undefined,
      }).some((row) => row.id === 'reading_fixture'),
    ).toBe(true);
    expect(restored.sim.actions.job).toBeUndefined();
    expect(restored.inv.itemByUid(item.uid)?.type).toBe('reading_fixture_book');
    expect(restored.character.knownRecipes.size).toBe(new Character(fixtureRegistry).knownRecipes.size + 1);
  });
  it('insufficient bounded drop room retains all cancel inputs and a stopped descriptor', () => {
    const runtime = start();
    for (const pos of dropSpots([0, 0, 0])) {
      while (runtime.inv.add(runtime.inv.create('kitchen_knife'), { kind: 'pile', pos })) {
        /* fill without stack merging */
      }
    }
    // One 1×3 hole admits the first rag, but not the next 1×4 stick. No partial transfer.
    const filler = runtime.inv.pileAt([0, 0, 0])!.items[0]!.item;
    expect(runtime.inv.consume(filler)).toBe(true);
    const before = runtime.inv.snapshotState();
    const pileAt = runtime.inv.pileAt.bind(runtime.inv);
    runtime.inv.pileAt = (pos) => {
      if (!dropSpots([0, 0, 0]).some((spot) => spot.every((value, axis) => value === pos[axis]))) {
        throw new Error('Escaped bounded drop neighborhood');
      }
      return pileAt(pos);
    };
    runtime.sim.actions.cancel();
    expect(runtime.sim.compression.interruption).toBeDefined();
    expect(runtime.sim.actions.job).toMatchObject({ jobType: 'craft', stopped: true, workUid: runtime.item.uid });
    expect(runtime.inv.snapshotState()).toEqual(before);
  });
  it('sleep can replace a stopped craft and Continue retains its owned progress', () => {
    const runtime = start();
    runtime.sim.scheduler.advance(20);
    expect(runtime.sim.actions.startRest('sleep', -10, 1)).toBeDefined();
    runtime.sim.actions.stop();
    const { elapsed } = runtime.payload;
    expect(runtime.sim.actions.startRest('sleep', -10, 1)).toBeUndefined();
    runtime.sim.scheduler.advance(4);
    expect(runtime.payload.elapsed).toBe(elapsed);
    expect(runtime.sim.actions.startCraft(runtime.item.uid)).toBeUndefined();
    runtime.sim.scheduler.advance(1);
    expect(runtime.payload.elapsed).toBe(elapsed + runtime.sim.clock.ratio);
  });
  it('accumulates identical active work after Stop/Continue while stopped time advances only the world', () => {
    const direct = start();
    const interrupted = start();
    direct.sim.scheduler.advance(10);
    interrupted.sim.scheduler.advance(10);
    interrupted.sim.actions.stop();
    const { elapsed } = interrupted.payload;
    const { fatigue } = interrupted.sim.needs;
    interrupted.sim.scheduler.advance(27);
    expect(interrupted.sim.time).toBe(37);
    expect(interrupted.sim.needs.fatigue).toBeGreaterThan(fatigue);
    expect(interrupted.payload.elapsed).toBe(elapsed);
    expect(interrupted.sim.actions.resume()).toBeUndefined();
    direct.sim.scheduler.advance(1);
    interrupted.sim.scheduler.advance(1);
    expect(interrupted.payload.elapsed).toBe(direct.payload.elapsed);
    const remaining = Math.ceil(direct.payload.duration / direct.sim.clock.ratio) - 11;
    direct.sim.scheduler.advance(remaining);
    interrupted.sim.scheduler.advance(remaining);
    expect(interrupted.payload.elapsed).toBe(direct.payload.elapsed);
    expect(interrupted.payload.elapsed).toBe(interrupted.payload.duration);
    expect(resultCount(direct.inv)).toBe(1);
    expect(resultCount(interrupted.inv)).toBe(1);
    expect(interrupted.sim.actions.job).toBeUndefined();
    interrupted.sim.scheduler.advance(40);
    interrupted.sim.actions.resume();
    expect(resultCount(interrupted.inv)).toBe(1);
  });

  it.each([false, true])('round-trips a stopped=%s craft without duplicating its owning tree or finish', (stopped) => {
    const runtime = start();
    runtime.sim.scheduler.advance(13);
    if (stopped) {
      runtime.sim.actions.stop();
    }
    const before = snapshot(runtime);
    const restored = make(before);
    expect(snapshot(runtime)).toEqual(before); // snapshot did not stop or mutate the live action
    expect(snapshot(restored)).toEqual(before);
    const item = restored.inv.itemByUid(runtime.item.uid)!;
    expect(item.work).toEqual(runtime.payload);
    expect(restored.inv.hands.left).toBeUndefined();
    expect(new Set([...restored.inv.items()].map((entry) => entry.item.uid)).size).toBe(
      [...restored.inv.items()].length,
    );
    if (stopped) {
      restored.sim.scheduler.advance(17);
      expect(item.work!.elapsed).toBe(runtime.payload.elapsed);
      expect(restored.sim.actions.resume()).toBeUndefined();
    }
    restored.sim.scheduler.advance(
      Math.ceil((item.work!.duration - item.work!.elapsed) / restored.sim.clock.ratio) + 1,
    );
    expect(resultCount(restored.inv)).toBe(1);
    expect(restored.inv.itemByUid(runtime.item.uid)).toBeUndefined();
  });

  it('repairs the same target once after restoring a running repair action', () => {
    const source = startRepair();
    source.sim.scheduler.advance(1);
    const before = snapshot(source);
    const restored = make(before);
    expect(snapshot(restored)).toEqual(before);
    const savedWork = restored.inv.itemByUid(source.work.uid)!;
    expect(savedWork.work?.repairTargetUid).toBe(source.target.uid);
    expect(savedWork.work?.repairAmount).toBe(source.work.work?.repairAmount);
    const amount = savedWork.work!.repairAmount!;
    restored.sim.scheduler.advance(
      Math.ceil((savedWork.work!.duration - savedWork.work!.elapsed) / restored.sim.clock.ratio) + 1,
    );
    const repairedCondition = Math.min(1, source.target.condition + amount);
    expect(restored.inv.itemByUid(source.target.uid)?.condition).toBeCloseTo(repairedCondition);
    expect(source.materials.length).toBeGreaterThan(0);
    expect(source.materials.every((uid) => restored.inv.itemByUid(uid) === undefined)).toBe(true);
    expect(restored.inv.itemByUid(source.work.uid)).toBeUndefined();
    restored.sim.actions.resume();
    restored.sim.scheduler.advance(1000);
    expect(restored.inv.itemByUid(source.target.uid)?.condition).toBeCloseTo(repairedCondition);
  });

  it('rechecks tools on a tick and Continue, refusing without spending progress', () => {
    const runtime = start();
    runtime.sim.scheduler.advance(4);
    const { elapsed } = runtime.payload;
    const knife = [...runtime.inv.items()].find(({ item }) => item.type === 'kitchen_knife')!.item;
    runtime.inv.consume(knife);
    const refusal = runtime.sim.actions.craft!.validate(runtime.item.uid);
    expect(refusal).toBeDefined();
    runtime.sim.scheduler.advance(1);
    expect(runtime.payload.elapsed).toBe(elapsed);
    expect(runtime.sim.compression.interruption).toBe(refusal);
    expect(runtime.sim.actions.resume()).toBe(refusal);
    expect(runtime.payload.elapsed).toBe(elapsed);
    runtime.inv.add(runtime.inv.create('kitchen_knife'), { kind: 'pile', pos: [0, 0, 0] });
    expect(runtime.sim.actions.resume()).toBeUndefined();
  });

  it('cancels once and returns the exact escrow UIDs, counts and condition, with no result', () => {
    const runtime = start();
    const inputs = runtime.payload.components.map((item) => ({
      uid: item.uid,
      type: item.type,
      count: item.count,
      condition: item.condition,
    }));
    runtime.sim.scheduler.advance(5);
    runtime.sim.actions.cancel();
    runtime.sim.actions.cancel();
    runtime.sim.actions.resume();
    expect(resultCount(runtime.inv)).toBe(0);
    expect(runtime.inv.itemByUid(runtime.item.uid)).toBeUndefined();
    expect(inputs.map(({ uid }) => runtime.inv.itemByUid(uid))).toMatchObject(inputs);
    const cells: string[] = [];
    for (const pile of runtime.inv.piles.values()) {
      for (const { item, x, y, rotated } of pile.items) {
        const [w, h] = footprint(defOf(registry, item.type), rotated);
        for (let dx = 0; dx < w; dx += 1) {
          for (let dy = 0; dy < h; dy += 1) {
            cells.push(`${pile.pos.join(',')}:${x + dx},${y + dy}`);
          }
        }
      }
    }
    expect(new Set(cells).size).toBe(cells.length);
    expect(runtime.sim.actions.job).toBeUndefined();
  });

  it('rejects dangling job ownership and malformed saved recipe/input state before live restoration', () => {
    const runtime = start();
    const saved = structuredClone(snapshot(runtime));
    saved.action = { job: { jobType: 'craft', workUid: 9999, stopped: true, last: 0 } };
    expect(() => make(saved)).toThrow('Missing craft work item');
    saved.inventory.hands.right!.work!.components[0]!.count += 1;
    expect(() => Inventory.restoreState(registry, saved.inventory)).toThrow('Craft inputs do not match recipe');
  });
});
