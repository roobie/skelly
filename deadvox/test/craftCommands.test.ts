import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Character, practiceForNextLevel } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CraftCommands } from '../src/core/craftCommands.ts';
import { craftActionHooks } from '../src/core/craftWork.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { options } from '../src/core/options.ts';
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
const make = (unsafe?: () => string | undefined) => {
  const inventory = new Inventory(registry);
  const character = new Character(registry);
  const queue = new HandlingQueue(inventory);
  const sim = new Simulation({ seed: 1, ...(unsafe ? { unsafe } : {}) });
  const position: [number, number, number] = [0, 0, 0];
  const reach = bindReach({ inventory, position, blockSize: 0.5 });
  sim.actions.craft = craftActionHooks(inventory, character, reach, () => position);
  const commands = new CraftCommands({ inventory, character, sim, queue, reach });
  for (const [type, count] of [
    ['stick', 1],
    ['rag', 2],
    ['wax', 1],
    ['kitchen_knife', 1],
  ] as const) {
    if (!inventory.add(inventory.create(type, count), { kind: 'pile', pos: [0, 0, 0] })) {
      throw new Error('fixture input did not fit');
    }
  }
  return { inventory, character, queue, sim, commands, position, reach };
};
const workOf = (r: ReturnType<typeof make>) => r.inventory.hands.right!.work!;

describe('live craft commands', () => {
  it('starts repair in the shared craft owner using the target and live skill-scaled effect', () => {
    const r = make();
    r.character.awardPractice('crafting', practiceForNextLevel(0));
    const target = r.inventory.create('crowbar', 1, 0.5);
    for (const item of [
      target,
      r.inventory.create('scrap_metal'),
      r.inventory.create('duct_tape'),
      r.inventory.create('repair_kit'),
    ]) {
      if (!r.inventory.add(item, { kind: 'pile', pos: [0, 0, 0] })) {
        throw new Error('repair fixture item did not fit');
      }
    }
    expect(r.commands.start('repair_crowbar')).toBeUndefined();
    const work = workOf(r);
    const effect = registry.recipes.get('repair_crowbar')!.repair!;
    expect(work.repairTargetUid).toBe(target.uid);
    expect(work.repairAmount).toBe(effect.amount + effect.perSkill * r.character.skills[effect.skill]!);
    expect(r.sim.actions.job?.jobType).toBe('craft');
  });

  it('sleep replacing a stopped craft owns Continue instead of the held work', () => {
    const r = make();
    expect(r.commands.start('torch')).toBeUndefined();
    r.sim.actions.stop();
    expect(r.commands.currentUid).toBe(r.inventory.hands.right!.uid);
    expect(r.sim.actions.startRest('sleep', -10)).toBeUndefined();
    expect(r.commands.currentUid).toBeUndefined();
  });
  it('a stopped sleep releases Continue to the held work', () => {
    const r = make();
    expect(r.commands.start('torch')).toBeUndefined();
    r.sim.actions.stop();
    const workUid = r.inventory.hands.right!.uid;
    expect(r.sim.actions.startRest('sleep', -10)).toBeUndefined();
    r.sim.actions.stop();
    expect(r.commands.currentUid).toBe(workUid);
  });
  it('Inventory refuses a work item in the left hand without changing its owning tree', () => {
    const r = make();
    expect(r.commands.start('torch')).toBeUndefined();
    r.sim.actions.stop();
    const item = r.inventory.hands.right!;
    const before = r.inventory.snapshotState();
    const leftHand = options(item, r.reach()).find(
      (option) => option.kind === 'move' && option.target.kind === 'hand' && option.target.side === 'left',
    )!;
    const refusal = r.inventory.plan(item, { kind: 'hand', side: 'left' });
    expect(leftHand.plan).toEqual(refusal);
    expect(refusal.ok).toBe(false);
    expect(r.inventory.move(item, { kind: 'hand', side: 'left' })).toEqual(refusal);
    expect(r.inventory.snapshotState()).toEqual(before);
    expect(r.commands.options(item.uid)[0]!.plan.ok).toBe(true);
  });
  it('native begin rechecks knowledge after planning before any escrow or compression', () => {
    const r = make();
    const result = r.commands.preview('torch')!;
    if (!('plan' in result)) {
      throw new Error(result.missing.reason);
    }
    r.character.knownRecipes.delete('torch');
    const before = r.inventory.snapshotState();
    expect(r.sim.actions.beginCraft(result.plan)).toBeDefined();
    expect(r.sim.compression.active).toBe(false);
    expect(r.inventory.snapshotState()).toEqual(before);
  });
  it('native escrow refusal stops compression without creating or moving an item', () => {
    const r = make();
    const result = r.commands.preview('torch')!;
    if (!('plan' in result)) {
      throw new Error(result.missing.reason);
    }
    expect(
      r.inventory.move(r.inventory.pileAt([0, 0, 0])!.items.find(({ item }) => item.type === 'kitchen_knife')!.item, {
        kind: 'hand',
        side: 'left',
      }).ok,
    ).toBe(true);
    const before = r.inventory.snapshotState();
    expect(r.sim.actions.beginCraft(result.plan)).toBeDefined();
    expect(r.sim.compression.active).toBe(false);
    expect(r.sim.actions.job).toBeUndefined();
    expect(r.inventory.snapshotState()).toEqual(before);
  });

  it('native release-by-UID returns an unreferenced work tree exactly once', () => {
    const r = make();
    const result = r.commands.preview('torch')!;
    if (!('plan' in result)) {
      throw new Error(result.missing.reason);
    }
    const work = r.inventory.beginWork(result.plan)!;
    const uids = work.work!.components.map(({ uid }) => uid).sort();
    expect(r.sim.actions.job).toBeUndefined();
    expect(r.sim.actions.cancelCraft(work.uid)).toBeUndefined();
    expect(
      r.inventory
        .pileAt([0, 0, 0])!
        .items.filter(({ item }) => item.type !== 'kitchen_knife')
        .map(({ item }) => item.uid)
        .sort(),
    ).toEqual(uids);
    const before = r.inventory.snapshotState();
    expect(r.sim.actions.cancelCraft(work.uid)).toBeDefined();
    expect(r.inventory.snapshotState()).toEqual(before);
  });
  it('unsafe start refuses before escrowing inputs or allocating a work UID', () => {
    const refusal = 'test-owned unsafe reason';
    const r = make(() => refusal);
    const before = r.inventory.snapshotState();
    expect(r.commands.start('torch')).toBe(refusal);
    expect(r.inventory.snapshotState()).toEqual(before);
    expect(r.sim.actions.job).toBeUndefined();
  });
  it('refuses occupied hands without creating work or moving any inputs', () => {
    const r = make();
    const held = r.inventory.create('rag');
    r.inventory.add(held, { kind: 'hand', side: 'left' });
    const before = r.inventory.snapshotState();
    expect(r.commands.start('torch')).toBe(r.commands.startReason());
    expect(r.inventory.snapshotState()).toEqual(before);
  });
  it('refuses a pending handling chain before escrowing components', () => {
    const r = make();
    const knife = [...r.inventory.items()].find(({ item }) => item.type === 'kitchen_knife')!.item;
    expect(r.queue.enqueue(knife, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(r.commands.start('torch')).toBe(r.commands.startReason());
    expect(r.inventory.hands.right).toBeUndefined();
    expect(r.queue.jobs).toHaveLength(1);
  });
  it('re-plans a clicked recipe after displayed component stock is replaced', () => {
    const r = make();
    expect(r.commands.preview('torch')).toHaveProperty('plan');
    const wax = [...r.inventory.items()].find(({ item }) => item.type === 'wax')!.item;
    r.inventory.consume(wax);
    const replacement = r.inventory.create('wax');
    r.inventory.add(replacement, { kind: 'pile', pos: [0, 0, 0] });
    expect(r.commands.start('torch')).toBeUndefined();
    expect(workOf(r).components.map((i) => i.uid)).toContain(replacement.uid);
    expect(workOf(r).components.map((i) => i.uid)).not.toContain(wax.uid);
  });
  it('starts a second work tree with free hands while preserving the stopped work on the ground', () => {
    const r = make();
    expect(r.commands.start('torch')).toBeUndefined();
    r.sim.actions.stop();
    const item = r.inventory.hands.right!;
    expect(r.inventory.move(item, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    expect(r.inventory.add(r.inventory.create('wax', 2), { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    expect(r.inventory.add(r.inventory.create('rag'), { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    expect(r.commands.preview('candle')).toHaveProperty('plan');
    const inputs = structuredClone(item.work!.components);
    expect(r.commands.start('candle')).toBeUndefined();
    expect(r.inventory.itemByUid(item.uid)).toBe(item);
    expect(item.work!.components).toEqual(inputs);
    expect([...r.inventory.items()].filter((entry) => entry.item.work)).toHaveLength(2);
  });
  it('Continue checks the held root again rather than trusting an earlier enabled option', () => {
    const r = make();
    r.commands.start('torch');
    r.sim.actions.stop();
    const item = r.inventory.hands.right!;
    expect(r.commands.options(item.uid)[0]!.plan.ok).toBe(true);
    expect(r.inventory.move(item, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    const continuePlan = r.commands.options(item.uid).find(({ operation }) => operation === 'continue')!.plan;
    if (continuePlan.ok) {
      throw new Error('continue unexpectedly planned without both hands');
    }
    expect(r.commands.act(item.uid, 'continue')).toBe(continuePlan.reason);
    expect(r.sim.actions.job?.stopped).toBe(true);
    expect(r.inventory.move(item, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(r.commands.act(item.uid, 'continue')).toBeUndefined();
  });
  it('Take apart refuses a work UID outside reach and retains its owned input tree', () => {
    const r = make();
    r.commands.start('torch');
    r.sim.actions.stop();
    const item = r.inventory.hands.right!;
    r.inventory.move(item, { kind: 'pile', pos: [0, 0, 0] });
    r.position[0] = 20;
    const apartPlan = r.commands.options(item.uid).find(({ operation }) => operation === 'apart')!.plan;
    if (apartPlan.ok) {
      throw new Error('take-apart unexpectedly planned outside reach');
    }
    const before = structuredClone(item.work!.components);
    expect(r.commands.act(item.uid, 'apart')).toBe(apartPlan.reason);
    expect(r.inventory.itemByUid(item.uid)!.work!.components).toEqual(before);
    r.position[0] = 0;
    expect(r.commands.act(item.uid, 'apart')).toBeUndefined();
    expect(r.inventory.itemByUid(item.uid)).toBeUndefined();
  });
});
