import { describe, expect, it } from 'vitest';
import { HandlingQueue, type MoveStart } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { handlingMoveCompleteCue, handlingMoveStartCue } from '../src/game/audioPresentation.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();

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
    const startedMove = started[0]!;
    const ownerLocation = startedMove.from.kind === 'pocket' ? inventory.locate(startedMove.from.owner) : undefined;
    const startCue = handlingMoveStartCue(startedMove, ownerLocation, [4, 2, -3]);
    expect(startCue).toEqual({ event: 'pouch_take', position: [4, 2, -3] });
    expect(completed).toHaveLength(0);
    queue.tick(result.ok ? result.job.duration : 0);
    expect(completed).toHaveLength(1);
    expect(inventory.locate(item)).toMatchObject({ kind: 'hand', side: 'left' });
  });

  it('announces a pile landing only after a successful move, and identifies same-pile UI moves', () => {
    const { inventory, item } = dressedInventory();
    const completed: MoveStart[] = [];
    const queue = new HandlingQueue(inventory, undefined, (move) => completed.push(move));
    const first = queue.enqueue(item, { kind: 'pile', pos: [0, 4, 0] });
    expect(first.ok).toBe(true);
    expect(completed).toHaveLength(0);
    queue.tick(first.ok ? first.job.duration : 0);
    expect(completed).toHaveLength(1);
    expect(completed[0]?.target.kind).toBe('pile');
    const dropCue = handlingMoveCompleteCue(completed[0]!);
    expect(dropCue).toEqual({ event: 'item_drop_wood', position: [0.5, 4, 0.5] });

    const samePile = queue.enqueue(item, { kind: 'pile', pos: [0, 4, 0], at: { x: 1, y: 0, rotated: false } });
    expect(samePile.ok).toBe(true);
    queue.tick(samePile.ok ? samePile.job.duration : 0);
    expect(completed).toHaveLength(2);
    expect(completed[1]?.from).toMatchObject({ kind: 'pile' });
    expect(handlingMoveCompleteCue(completed[1]!)).toBeUndefined();
  });
});
