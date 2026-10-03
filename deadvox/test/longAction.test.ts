import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Character } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { planCraft } from '../src/core/crafting.ts';
import { craftActionHooks } from '../src/core/craftWork.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import { Simulation } from '../src/core/sim.ts';

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
    runtime.sim.scheduler.advance(1);
    expect(runtime.payload.elapsed).toBe(elapsed);
    expect(runtime.sim.compression.interruption).toContain('cutting');
    expect(runtime.sim.actions.resume()).toContain('cutting');
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
