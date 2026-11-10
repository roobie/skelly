import { ActionMenu, furnitureActionsFor, reachTuning } from '@skelly/engine/sim';
import { describe, expect, it } from 'vitest';
import { baseRegistryWith } from './baseRegistry.ts';
import { AMOUNT, DURABILITY, PIECE, worldRepairFixture, worldRepairSources } from './worldRepairFixture.ts';

const piece = { uid: 7 };
const actions = [
  { id: 'use', label: 'Use' },
  { id: 'push', label: 'Push' },
];

describe('furniture service choices', () => {
  const registry = baseRegistryWith(worldRepairSources());

  it.each(['damaged', 'intact'] as const)('keeps lift in the held list on a small movable piece: %s', (state) => {
    const { inventory, target } = worldRepairFixture(registry);
    if (state === 'intact') {
      expect(inventory.entities.repair(target, DURABILITY)).toBe(true);
    }
    const blockSize = reachTuning(registry).furnitureMove.maxSizeMetres / 2;
    const choices = furnitureActionsFor(inventory, target, blockSize);
    expect(choices.some(({ id }) => id === 'lift')).toBe(true);
  });

  it('offers push and drag instead of lift for a wide movable piece', () => {
    const { inventory } = worldRepairFixture(registry);
    const target = inventory.entities.add({ type: PIECE, pos: [8, 1, 0], size: [4, 1, 1], facing: 'n' })!;
    expect(inventory.entities.bash(target, AMOUNT)).toBe('damaged');
    const blockSize = reachTuning(registry).furnitureMove.maxSizeMetres / 2;
    const choices = furnitureActionsFor(inventory, target, blockSize);
    expect(choices.some(({ id }) => id === 'push')).toBe(true);
    expect(choices.some(({ id }) => id === 'drag')).toBe(true);
    expect(choices.some(({ id }) => id === 'lift')).toBe(false);
  });
});

describe('furniture action menu lifetime', () => {
  it('requires reopening after confirming an action', () => {
    const selection = new ActionMenu('fixture open can');
    selection.open(piece, actions);
    selection.step(piece, actions, 1);
    expect(selection.confirm(piece, actions)?.id).toBe('push');
    expect(selection.isOpen(piece)).toBe(false);
    expect(selection.confirm(piece, actions)).toBeUndefined();
    selection.open(piece, actions);
    expect(selection.isOpen(piece)).toBe(true);
  });

  it('does not preserve an open menu across pause even if aim never changes', () => {
    const selection = new ActionMenu('fixture open can');
    selection.open(piece, actions);
    selection.sync(piece.uid);
    expect(selection.isOpen(piece)).toBe(true);
    selection.sync(piece.uid, true);
    selection.sync(piece.uid, false);
    expect(selection.confirm(piece, actions)).toBeUndefined();
  });

  it('does not preserve an open menu when aim leaves the piece', () => {
    const selection = new ActionMenu('fixture open can');
    selection.open(piece, actions);
    selection.sync(piece.uid + 1);
    selection.sync(piece.uid);
    expect(selection.confirm(piece, actions)).toBeUndefined();
    selection.open(piece, actions);
    selection.sync(undefined);
    expect(selection.isOpen(piece)).toBe(false);
  });
});
