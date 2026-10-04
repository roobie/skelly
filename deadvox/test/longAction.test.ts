import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bookReadingHooks } from '../src/core/bookReading.ts';
import { Character } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { planCraft } from '../src/core/crafting.ts';
import { craftActionHooks } from '../src/core/craftWork.ts';
import { dropSpots, Inventory } from '../src/core/inventory.ts';
import { defOf, footprint } from '../src/core/items.ts';
import { bindReach } from '../src/core/reach.ts';
import { Simulation } from '../src/core/sim.ts';
import { craftRows } from '../src/ui/craftReadout.ts';

const { registry } = buildRegistry(
  readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: file,
      data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown,
    })),
);
const make = (saved?: {
  inventory: ReturnType<Inventory['snapshotState']>;
  simulation: ReturnType<Simulation['snapshotState']>;
  action: ReturnType<Simulation['actions']['snapshotState']>;
}) => {
  const inv = saved ? Inventory.restoreState(registry, saved.inventory) : new Inventory(registry);
  const sim = new Simulation({ seed: 1, restRate: () => sim.actions.restRate });
  const character = new Character(registry);
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

describe('core long actions', () => {
  it('awards recipe-skill practice only when the craft finishes', () => {
    const runtime = start();
    expect(runtime.character.skills.crafting).toBe(0);
    runtime.sim.actions.stop();
    expect(runtime.character.skills.crafting).toBe(0);
    expect(runtime.sim.actions.resume()).toBeUndefined();
    const { duration } = runtime.payload;
    runtime.sim.scheduler.advance(duration / runtime.sim.clock.ratio + 2);
    expect(runtime.character.skills.crafting).toBe(1);
    expect(runtime.inv.hands.right?.type).toBe('torch');
    expect(runtime.sim.actions.job).toBeUndefined();
  });
  it('resumes reading the held book and teaches its recipes only once on completion', () => {
    registry.recipes.set('reading_fixture', {
      id: 'reading_fixture',
      result: { item: 'torch', count: 1 },
      time: 1,
      skills: {},
      qualities: {},
      components: [[{ item: 'rag', count: 1 }]],
    });
    registry.items.set('sample_note', {
      ...registry.items.get('sample_note')!,
      book: { title: 'Fixture manual', recipes: ['reading_fixture'], readingTime: 1 },
    });
    const runtime = make();
    const item = runtime.inv.create('sample_note');
    expect(runtime.inv.add(item, { kind: 'hand', side: 'right' })).toBe(true);
    expect(runtime.character.knownRecipes.has('reading_fixture')).toBe(false);
    expect(runtime.sim.actions.beginReading(item.uid)).toBeUndefined();
    runtime.sim.scheduler.advance(10 / runtime.sim.clock.ratio);
    runtime.sim.actions.stop();
    expect(runtime.sim.actions.job).toMatchObject({ jobType: 'reading', stopped: true, elapsed: 10 });
    expect(runtime.character.knownRecipes.has('reading_fixture')).toBe(false);
    const restored = make(snapshot(runtime));
    expect(restored.sim.actions.resume()).toBeUndefined();
    const reading = restored.sim.actions.job;
    if (reading?.jobType !== 'reading') {
      throw new Error('Reading action was not resumed');
    }
    restored.sim.scheduler.advance((reading.duration - reading.elapsed) / restored.sim.clock.ratio + 2);
    expect(restored.character.knownRecipes.has('reading_fixture')).toBe(true);
    expect(
      craftRows({
        registry,
        character: restored.character,
        reach: restored.reach(),
        preferences: {},
        startReason: undefined,
      }).some((row) => row.id === 'reading_fixture'),
    ).toBe(true);
    expect(restored.sim.actions.job).toBeUndefined();
    expect(restored.inv.itemByUid(item.uid)?.type).toBe('sample_note');
    expect(restored.character.knownRecipes.size).toBe(new Character(registry).knownRecipes.size + 1);
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
    expect(runtime.sim.actions.startRest('sleep', -10)).toBeDefined();
    runtime.sim.actions.stop();
    const { elapsed } = runtime.payload;
    expect(runtime.sim.actions.startRest('sleep', -10)).toBeUndefined();
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
