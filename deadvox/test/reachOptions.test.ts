import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { EAT_TIME, options, quickMove } from '../src/core/options.ts';
import { bindReach, type ReachPlayer } from '../src/core/reach.ts';
import { quickMoveModifier } from '../src/game/input.ts';

const directory = join(import.meta.dirname, '../src/content/base');
const { registry } = buildRegistry(
  readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ source: name, data: JSON.parse(readFileSync(join(directory, name), 'utf8')) as unknown })),
);

const setup = () => {
  const inventory = new Inventory(registry);
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

  it('stows a wielded right-hand item in the backpack before clothing pockets', () => {
    const t = setup();
    t.add('jeans', { kind: 'worn' });
    const bag = t.add('school_backpack', { kind: 'worn' });
    const item = t.add('canned_beans', { kind: 'hand', side: 'right' });
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

  it('treats the left-hand item as carried and drops it rather than stowing it', () => {
    const t = setup();
    t.add('school_backpack', { kind: 'worn' });
    const item = t.add('flashlight', { kind: 'hand', side: 'left' });
    expect(quickMove(item, t.view()).target).toEqual({ kind: 'pile', pos: [0, 0, 0] });
  });
});

it('maps Ctrl off macOS and Cmd on macOS, leaving unmodified and Shift-only clicks alone', () => {
  expect(quickMoveModifier({ ctrlKey: true, metaKey: false }, 'Linux x86_64')).toBe(true);
  expect(quickMoveModifier({ ctrlKey: false, metaKey: true }, 'MacIntel')).toBe(true);
  expect(quickMoveModifier({ ctrlKey: false, metaKey: true }, 'Win32')).toBe(false);
  expect(quickMoveModifier({ ctrlKey: true, metaKey: false }, 'MacIntel')).toBe(false);
  expect(quickMoveModifier({ ctrlKey: false, metaKey: false }, 'Linux x86_64')).toBe(false);
});
