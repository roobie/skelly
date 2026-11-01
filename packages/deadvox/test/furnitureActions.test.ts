import { describe, expect, it } from 'vitest';
import { FurnitureActionSelection, radialEntryIndex } from '../src/game/furnitureActions.ts';

const piece = { uid: 7 };
const actions = [
  { id: 'use', label: 'Use' },
  { id: 'push', label: 'Push' },
];

it('maps clockwise directions from the top to entries while the dead zone preserves selection', () => {
  const radius = 50;
  const deadZone = 5;
  for (const count of [1, 2, 3, 7]) {
    for (let index = 0; index < count; index++) {
      const angle = (index * Math.PI * 2) / count;
      expect(radialEntryIndex(Math.sin(angle) * radius, -Math.cos(angle) * radius, count, deadZone)).toBe(index);
    }
  }
  expect(radialEntryIndex(0, 0, 3, deadZone)).toBeUndefined();
  expect(radialEntryIndex(deadZone, 0, 3, deadZone)).toBeUndefined();
  expect(radialEntryIndex(0, -radius, 0, deadZone)).toBeUndefined();
});

describe('furniture action menu lifetime', () => {
  it('requires reopening after confirming an action', () => {
    const selection = new FurnitureActionSelection('fixture open can');
    selection.open(piece, actions);
    selection.step(piece, actions, 1);
    expect(selection.confirm(piece, actions)?.id).toBe('push');
    expect(selection.isOpen(piece)).toBe(false);
    expect(selection.confirm(piece, actions)).toBeUndefined();
    selection.open(piece, actions);
    expect(selection.isOpen(piece)).toBe(true);
  });

  it('does not preserve an open menu across pause even if aim never changes', () => {
    const selection = new FurnitureActionSelection('fixture open can');
    selection.open(piece, actions);
    selection.sync(piece.uid);
    expect(selection.isOpen(piece)).toBe(true);
    selection.sync(piece.uid, true);
    selection.sync(piece.uid, false);
    expect(selection.confirm(piece, actions)).toBeUndefined();
  });

  it('does not preserve an open menu when aim leaves the piece', () => {
    const selection = new FurnitureActionSelection('fixture open can');
    selection.open(piece, actions);
    selection.sync(piece.uid + 1);
    selection.sync(piece.uid);
    expect(selection.confirm(piece, actions)).toBeUndefined();
    selection.open(piece, actions);
    selection.sync(undefined);
    expect(selection.isOpen(piece)).toBe(false);
  });
});
