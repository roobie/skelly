import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Character, dominantSide, offSide } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory, WORK_IN_PROGRESS } from '../src/core/inventory.ts';
import { EAT_TIME, options, pocketGroundItem, quickMove, toHands } from '../src/core/options.ts';
import { bindReach, type ReachPlayer } from '../src/core/reach.ts';

const directory = join(import.meta.dirname, '../src/content/base');
const { registry } = buildRegistry(
  readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ source: name, data: JSON.parse(readFileSync(join(directory, name), 'utf8')) as unknown })),
);

const setup = (handedness?: 'right' | 'left') => {
  const character = new Character(registry, handedness ? { handedness } : {});
  const inventory = new Inventory(registry, undefined, undefined, character);
  const player: ReachPlayer = { inventory, position: [0.5, 0, 0.5], blockSize: 1 };
  const view = bindReach(player);
  const queue = new HandlingQueue(inventory);
  const add = (type: string, target: Parameters<Inventory['add']>[1], count = 1) => {
    const item = inventory.create(type, count);
    if (!inventory.add(item, target)) {
      throw new Error(`Fixture item ${type} did not fit`);
    }
    return item;
  };
  return { inventory, player, view, queue, add };
};

// Two boundary classes, each checking both sides. The plain case also catches
// treating block distances as metres; the nested case catches omitted ground pockets.
it.each(['plain', 'nested'] as const)('%s ground items cross the absolute 2m boundary', (kind) => {
  const t = setup();
  const item =
    kind === 'plain'
      ? t.add('canned_beans', { kind: 'pile', pos: [0, 0, 0] })
      : t.add('canned_beans', {
          kind: 'pocket',
          owner: t.add('school_backpack', { kind: 'pile', pos: [0, 0, 0] }),
          pocket: 0,
        });
  const blockSize = kind === 'plain' ? 0.4 : 1;
  const player = {
    inventory: t.inventory,
    position: [0.5 - 1.999 / blockSize, 0, 0.5] as [number, number, number],
    blockSize,
  };
  const view = bindReach(player);
  expect(view().entries.some((entry) => entry.item === item)).toBe(true);
  player.position[0] = 0.5 - 2.001 / blockSize;
  expect(view().entries.some((entry) => entry.item === item)).toBe(false);
});

it('nearest furniture cell is reachable without revealing unsearched nested contents', () => {
  const t = setup();
  const def = [...registry.furniture.values()].find((definition) => definition.container)!;
  const entity = t.inventory.entities.add({ type: def.id, pos: [2, 0, 0], size: [4, 2, 1], facing: 'n' })!;
  const bag = t.add('school_backpack', { kind: 'furniture', entity, pocket: 0 });
  const beans = t.add('canned_beans', { kind: 'pocket', owner: bag, pocket: 0 });
  expect(t.view().furniture).toContain(entity);
  expect(t.view().entries).toHaveLength(0);
  t.inventory.entities.markSearched(entity);
  const entry = t.view().entries.find((row) => row.item === beans)!;
  expect(entry.location).toMatchObject({ kind: 'pocket', owner: bag });
  expect(entry.handlingTime).toBeGreaterThan(0);
  expect(t.view().workstations).toEqual([]);
});

it('lists workstation components only when their furniture box is within two metres', () => {
  const fixtureFurniture = new Map(registry.furniture);
  fixtureFurniture.set('fixture_reach_station', {
    id: 'fixture_reach_station',
    name: 'Fixture station',
    size: [1, 3, 1],
    color: '#ffffff',
    workstation: { id: 'fixture_station', qualities: { sawing: 1 }, workFactorBonus: 0.2 },
  });
  const fixtureRegistry = { ...registry, furniture: fixtureFurniture };
  const inventory = new Inventory(fixtureRegistry);
  const player: ReachPlayer = { inventory, position: [0, 0, 0], blockSize: 0.5 };
  const view = bindReach(player);
  const near = inventory.entities.add({
    type: 'fixture_reach_station',
    pos: [3, 0, 0],
    size: [1, 3, 1],
    facing: 'n',
  })!;
  inventory.entities.add({
    type: 'fixture_reach_station',
    pos: [5, 0, 0],
    size: [1, 3, 1],
    facing: 'n',
  });
  expect(view().workstations).toEqual([
    {
      entity: near,
      id: 'fixture_station',
      qualities: { sawing: 1 },
      workFactorBonus: 0.2,
    },
  ]);
});

it('a queued move rechecks proximity after its displayed option was admitted', () => {
  const t = setup();
  const item = t.add('canned_beans', { kind: 'pile', pos: [0, 0, 0] });
  expect(t.queue.enqueue(item, { kind: 'hand', side: 'right' }).ok).toBe(true);
  t.player.position[0] = 10;
  t.queue.tick(10);
  expect(t.inventory.locate(item)?.kind).toBe('pile');
  expect(t.inventory.hands.right).toBeUndefined();
});

it('beans expose the eat time and a refusal when both hands hold other items', () => {
  const t = setup();
  const beans = t.add('canned_beans', { kind: 'hand', side: 'right' });
  expect(options(beans, t.view()).find((option) => option.kind === 'use')).toMatchObject({
    plan: { ok: true, time: EAT_TIME },
  });
  const backpack = t.add('school_backpack', { kind: 'worn' });
  t.inventory.move(beans, { kind: 'pocket', owner: backpack, pocket: 0 });
  t.add('flashlight', { kind: 'hand', side: 'right' });
  t.add('chocolate_bar', { kind: 'hand', side: 'left' });
  expect(options(beans, t.view()).find((option) => option.kind === 'use')).toMatchObject({
    plan: { ok: false, reason: 'Take the can of beans in your hands first' },
  });
});

describe('handling move admission', () => {
  it('refuses an identical quick move and spends only the first job time', () => {
    const t = setup();
    t.add('school_backpack', { kind: 'worn' });
    const item = t.add('canned_beans', { kind: 'pile', pos: [0, 0, 0] });
    const first = t.queue.enqueue(item, quickMove(item, t.view()).target);
    if (!first.ok) {
      throw new Error(first.reason);
    }
    expect
      .soft(t.queue.enqueue(item, quickMove(item, t.view()).target))
      .toEqual({ ok: false, reason: 'Already queued' });
    expect.soft(t.queue.jobs).toHaveLength(1);
    expect(t.queue.tick(first.job.duration).done).toEqual([first.job]);
    expect(t.queue.remaining).toBe(0);
    expect(t.queue.busy).toBe(false);
    // Same uid/target with a different requested count is not an exact duplicate.
    const stack = t.add('rag', { kind: 'pile', pos: [0, 0, 0] }, 2);
    const { target } = quickMove(stack, t.view());
    expect(t.queue.enqueue(stack, target, 1).ok).toBe(true);
    expect(t.queue.enqueue(stack, target, 2).ok).toBe(true);
    t.queue.cancel();
  });

  it.each(['moved', 'consumed'] as const)('drops a %s item move at its turn without spending time', (change) => {
    const t = setup();
    const bag = t.add('school_backpack', { kind: 'worn' });
    const item = t.add('rag', { kind: 'pile', pos: [0, 0, 0] });
    const target = { kind: 'pocket', owner: bag, pocket: 0 } as const;
    t.queue.registerAction('fixture.change', () => {
      if (change === 'consumed') {
        t.inventory.consume(item);
        return;
      }
      const result = t.inventory.move(item, target);
      return result.ok ? undefined : result.reason;
    });
    t.queue.enqueueAction('fixture.change', 'Change item', 1);
    const move = t.queue.enqueue(item, target);
    if (!move.ok) {
      throw new Error(move.reason);
    }
    const result = t.queue.tick(1);
    expect(result.done).toHaveLength(1);
    expect(result.failed).toEqual([
      { job: move.job, reason: change === 'consumed' ? "It isn't there any more" : "It's already there" },
    ]);
    expect(move.job.elapsed).toBe(0);
    expect(t.queue.remaining).toBe(0);
    expect(t.queue.jobs).toEqual([]);
  });

  it('keeps same-item different-target chains and re-plans their time at the head', () => {
    const t = setup();
    const item = t.add('rag', { kind: 'pile', pos: [0, 0, 0] });
    const first = t.queue.enqueue(item, { kind: 'hand', side: 'left' });
    const second = t.queue.enqueue(item, { kind: 'hand', side: 'right' });
    if (!(first.ok && second.ok)) {
      throw new Error('Fixture chain did not queue');
    }
    // A 1x1 rag takes 1.05s from the floor, then zero handling time hand-to-hand.
    const result = t.queue.tick(1.05);
    expect(result.done).toEqual([first.job, second.job]);
    expect(result.failed).toEqual([]);
    expect(second.job.duration).toBe(0);
    expect(t.inventory.hands.right).toBe(item);
    expect(t.inventory.hands.left).toBeUndefined();
    expect(t.queue.remaining).toBe(0);
  });

  it('keeps a ground item in its pile when no player pocket can carry it', () => {
    const t = setup();
    const item = t.add('rag', { kind: 'pile', pos: [0, 0, 0] });

    expect(pocketGroundItem(t.inventory, t.queue, item)).toEqual(expect.any(String));
    expect(t.inventory.locate(item)).toMatchObject({ kind: 'pile' });
    expect(t.queue.busy).toBe(false);
  });

  it('wears a ground backpack through the ordinary worn-slot handling path when the back is free', () => {
    const t = setup();
    const backpack = t.add('school_backpack', { kind: 'pile', pos: [0, 0, 0] });
    const target = { kind: 'worn' } as const;
    const plan = t.inventory.plan(backpack, target);
    if (!plan.ok) {
      throw new Error(plan.reason);
    }

    expect(pocketGroundItem(t.inventory, t.queue, backpack)).toBeUndefined();
    expect(t.queue.jobs[0]).toMatchObject({
      kind: 'move',
      itemUid: backpack.uid,
      target: t.inventory.targetState(target),
      duration: plan.time,
    });
    t.queue.tick(plan.time);
    expect(t.inventory.worn.back).toBe(backpack);
  });

  it('pockets a ground backpack when the back slot is occupied', () => {
    const t = setup();
    const worn = t.add('hiking_backpack', { kind: 'worn' });
    const backpack = t.add('school_backpack', { kind: 'pile', pos: [0, 0, 0] });
    expect(pocketGroundItem(t.inventory, t.queue, backpack)).toBeUndefined();
    const [job] = t.queue.jobs;
    if (!job) {
      throw new Error('Backpack pocketing did not queue a handling job');
    }
    if (job.kind !== 'move') {
      throw new Error('Backpack pocketing queued a non-move handling job');
    }
    expect(job.itemUid).toBe(backpack.uid);
    expect(job.target).toMatchObject({ kind: 'pocket', ownerUid: worn.uid });
    t.queue.tick(job.duration);
    expect(t.inventory.worn.back).toBe(worn);
    expect(t.inventory.locate(backpack)).toMatchObject({ kind: 'pocket', owner: worn });
  });

  it('stows both occupied hands in a backpack before wielding a two-handed item', () => {
    const t = setup();
    const leading = dominantSide(t.inventory.character);
    const secondary = offSide(t.inventory.character);
    const backpack = t.add('school_backpack', { kind: 'worn' });
    const first = t.add('duct_tape', { kind: 'hand', side: leading });
    const second = t.add('rag', { kind: 'hand', side: secondary });
    const type = [...registry.items.values()].find(
      (definition) => definition.twoHanded && definition.id !== WORK_IN_PROGRESS,
    )?.id;
    if (!type) {
      throw new Error('Two-handed fixture is missing');
    }
    const item = t.add(type, { kind: 'pile', pos: [0, 0, 0] });

    expect(toHands(t.inventory, t.queue, item, [0, 0, 0])).toBeUndefined();
    const jobs = [...t.queue.jobs];
    for (const job of jobs) {
      t.queue.tick(job.duration);
    }
    expect(t.inventory.locate(first)).toMatchObject({ kind: 'pocket', owner: backpack });
    expect(t.inventory.locate(second)).toMatchObject({ kind: 'pocket', owner: backpack });
    expect(t.inventory.hands[leading]).toBe(item);
    expect(t.inventory.hands[secondary]).toBeUndefined();
    expect(t.queue.busy).toBe(false);
  });

  it('drops both displaced items when wielding a two-handed item and no pocket fits', () => {
    const t = setup();
    const leading = dominantSide(t.inventory.character);
    const secondary = offSide(t.inventory.character);
    const first = t.add('duct_tape', { kind: 'hand', side: leading });
    const second = t.add('rag', { kind: 'hand', side: secondary });
    const type = [...registry.items.values()].find(
      (definition) => definition.twoHanded && definition.id !== WORK_IN_PROGRESS,
    )?.id;
    if (!type) {
      throw new Error('Two-handed fixture is missing');
    }
    const item = t.add(type, { kind: 'pile', pos: [0, 0, 0] });

    expect(toHands(t.inventory, t.queue, item, [0, 0, 0])).toBeUndefined();
    const jobs = [...t.queue.jobs];
    for (const job of jobs) {
      t.queue.tick(job.duration);
    }
    expect(t.inventory.locate(first)?.kind).toBe('pile');
    expect(t.inventory.locate(second)?.kind).toBe('pile');
    expect(t.inventory.hands[leading]).toBe(item);
    expect(t.inventory.hands[secondary]).toBeUndefined();
    expect(t.queue.busy).toBe(false);
  });

  it.each(['right', 'left'] as const)(
    '%s-dominant deferred toHands take re-plans after freeing its occupied slot',
    (handedness) => {
      const t = setup(handedness);
      const leading = dominantSide(t.inventory.character);
      const jeans = t.add('jeans', { kind: 'worn' });
      const held = t.add('duct_tape', { kind: 'hand', side: leading });
      t.add('flashlight', { kind: 'hand', side: offSide(t.inventory.character) });
      const item = t.add('rag', { kind: 'pile', pos: [0, 0, 0] });
      let pocketTime: number | undefined;
      t.queue.registerAction('fixture.pocket', () => {
        const result = t.inventory.move(item, { kind: 'pocket', owner: jeans, pocket: 0 });
        if (result.ok) {
          const from = t.inventory.locate(item)!;
          pocketTime = t.inventory.handlingTime(item, from, { kind: 'hand', side: leading });
        }
        return result.ok ? undefined : result.reason;
      });
      t.queue.enqueueAction('fixture.pocket', 'Pocket rag', 1);
      expect(toHands(t.inventory, t.queue, item, [0, 0, 0])).toBeUndefined();
      const jobs = [...t.queue.jobs];
      const results = jobs.map((job) => t.queue.tick(job.duration));
      expect(results.flatMap((result) => result.done)).toEqual(jobs);
      expect(results.flatMap((result) => result.failed)).toEqual([]);
      expect(jobs.at(-1)!.duration).toBe(pocketTime);
      expect(t.inventory.locate(held)).toMatchObject({ kind: 'pocket', owner: jeans });
      expect(t.inventory.hands[leading]).toBe(item);
      expect(t.queue.busy).toBe(false);
    },
  );
});

describe('quick move rules', () => {
  it('drops a worn container at the feet with its contents and ordinary take-off time', () => {
    const t = setup();
    const bag = t.add('school_backpack', { kind: 'worn' });
    const beans = t.add('canned_beans', { kind: 'pocket', owner: bag, pocket: 0 });
    const option = quickMove(bag, t.view());
    expect(option.target).toEqual({ kind: 'pile', pos: [0, 0, 0] });
    expect(option.plan).toEqual(t.inventory.plan(bag, option.target));
    expect(option.plan.ok).toBe(true);
    expect(t.queue.enqueue(bag, option.target).ok).toBe(true);
    expect(t.queue.tick(10).failed).toEqual([]);
    expect(t.inventory.locate(bag)?.kind).toBe('pile');
    expect(t.inventory.locate(beans)).toMatchObject({ kind: 'pocket', owner: bag });
  });

  it('stows a left-dominant wielded item in the backpack before clothing pockets', () => {
    const t = setup('left');
    t.add('jeans', { kind: 'worn' });
    const bag = t.add('school_backpack', { kind: 'worn' });
    const item = t.add('canned_beans', { kind: 'hand', side: dominantSide(t.inventory.character) });
    expect(quickMove(item, t.view()).target).toMatchObject({ kind: 'pocket', owner: bag });
  });

  it('keeps a wielded item in hand and returns the fit hint when there is no room', () => {
    const t = setup();
    const item = t.add('canned_beans', { kind: 'hand', side: 'right' });
    expect(quickMove(item, t.view()).plan).toMatchObject({ ok: false, reason: "It doesn't fit in your inventory" });
    expect(t.inventory.hands.right).toBe(item);
  });

  it('takes a floor item into the backpack only after ordinary queued handling time', () => {
    const t = setup();
    const bag = t.add('school_backpack', { kind: 'worn' });
    const item = t.add('canned_beans', { kind: 'pile', pos: [0, 0, 0] });
    const option = quickMove(item, t.view());
    expect(option.target).toMatchObject({ kind: 'pocket', owner: bag });
    if (!option.plan.ok) {
      throw new Error(option.plan.reason);
    }
    t.queue.enqueue(item, option.target);
    t.queue.tick(option.plan.time - 0.01);
    expect(t.inventory.locate(item)?.kind).toBe('pile');
    t.queue.tick(0.02);
    expect(t.inventory.locate(item)).toMatchObject({ kind: 'pocket', owner: bag });
  });

  it('falls through to a clothing pocket when no worn bag is available', () => {
    const t = setup();
    const jeans = t.add('jeans', { kind: 'worn' });
    const item = t.add('chocolate_bar', { kind: 'pile', pos: [0, 0, 0] });
    expect(quickMove(item, t.view()).target).toMatchObject({ kind: 'pocket', owner: jeans });
  });

  it('returns the fit hint and leaves a floor item in place when no inventory slot fits', () => {
    const t = setup();
    const item = t.add('canned_beans', { kind: 'pile', pos: [0, 0, 0] });
    expect(quickMove(item, t.view()).plan).toMatchObject({ ok: false, reason: "It doesn't fit in your inventory" });
    expect(t.inventory.locate(item)?.kind).toBe('pile');
  });

  it('wears a floor backpack with its nested contents when the back slot is free', () => {
    const t = setup();
    const bag = t.add('school_backpack', { kind: 'pile', pos: [0, 0, 0] });
    const item = t.add('canned_beans', { kind: 'pocket', owner: bag, pocket: 0 });
    const option = quickMove(bag, t.view());
    expect(option.target).toEqual({ kind: 'worn' });
    t.queue.enqueue(bag, option.target);
    t.queue.tick(10);
    expect(t.inventory.worn.back).toBe(bag);
    expect(t.inventory.locate(item)).toMatchObject({ kind: 'pocket', owner: bag });
  });

  it('moves the whole stack without splitting its UID or count', () => {
    const t = setup();
    t.add('school_backpack', { kind: 'worn' });
    const item = t.add('nails', { kind: 'pile', pos: [0, 0, 0] }, 25);
    t.queue.enqueue(item, quickMove(item, t.view()).target);
    t.queue.tick(10);
    expect(t.inventory.locate(item)?.kind).toBe('pocket');
    expect(item.count).toBe(25);
    expect(t.inventory.itemByUid(item.uid)).toBe(item);
  });

  it('drops the right off-hand item of a left character rather than stowing it', () => {
    const t = setup('left');
    t.add('school_backpack', { kind: 'worn' });
    const item = t.add('flashlight', { kind: 'hand', side: offSide(t.inventory.character) });
    expect(quickMove(item, t.view()).target).toEqual({ kind: 'pile', pos: [0, 0, 0] });
  });
});
