import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue, type MoveStart } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';

const base = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(base)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(`${base}/${file}`, 'utf8')) as unknown })),
);

const dressedInventory = () => {
  const inventory = new Inventory(registry);
  const backpack = inventory.create('school_backpack');
  inventory.worn.back = backpack;
  const item = inventory.create('canned_beans');
  if (!inventory.add(item, { kind: 'pile', pos: [0, 0, 0] })) {
    throw new Error('could not put fixture item on floor');
  }
  if (!inventory.move(item, { kind: 'pocket', owner: backpack, pocket: 0 }).ok) {
    throw new Error('could not put fixture item in worn pocket');
  }
  return { inventory, backpack, item };
};

describe('handling move sound hooks', () => {
  it('announces a worn-pocket extraction when its handling job starts, then completes only on placement', () => {
    const { inventory, item } = dressedInventory();
    const started: MoveStart[] = [];
    const completed: MoveStart[] = [];
    const queue = new HandlingQueue(
      inventory,
      (move) => started.push(move),
      (move) => completed.push(move),
    );
    const result = queue.enqueue(item, { kind: 'hand', side: 'left' });

    expect(result.ok).toBe(true);
    expect(started).toHaveLength(1);
    expect(started[0]?.from).toMatchObject({ kind: 'pocket' });
    expect(completed).toHaveLength(0);
    queue.tick(result.ok ? result.job.duration : 0);
    expect(completed).toHaveLength(1);
    expect(inventory.locate(item)).toMatchObject({ kind: 'hand', side: 'left' });
  });

  it('announces a pile landing only after a successful move, and identifies same-pile UI moves', () => {
    const { inventory, item } = dressedInventory();
    const completed: MoveStart[] = [];
    const queue = new HandlingQueue(inventory, undefined, (move) => completed.push(move));
    const first = queue.enqueue(item, { kind: 'pile', pos: [0, 0, 0] });
    expect(first.ok).toBe(true);
    expect(completed).toHaveLength(0);
    queue.tick(first.ok ? first.job.duration : 0);
    expect(completed).toHaveLength(1);
    expect(completed[0]?.target.kind).toBe('pile');

    const samePile = queue.enqueue(item, { kind: 'pile', pos: [0, 0, 0], at: { x: 1, y: 0, rotated: false } });
    expect(samePile.ok).toBe(true);
    queue.tick(samePile.ok ? samePile.job.duration : 0);
    expect(completed).toHaveLength(2);
    expect(completed[1]?.from).toMatchObject({ kind: 'pile' });
  });
});
