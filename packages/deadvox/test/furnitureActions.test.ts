import { describe, expect, it } from 'vitest';
import { FurnitureActionSelection, radialEntries, radialEntryIndex } from '../src/game/furnitureActions.ts';

const piece = { uid: 7 };
const actions = radialEntries(
  [
    { id: 'use', label: 'Use' },
    { id: 'push', label: 'Push' },
  ],
  { use: 0, push: 180 },
);

it('keeps content-authored action slots when another action appears or order changes', () => {
  const pair = [
    { id: 'fixture_a', label: 'A' },
    { id: 'fixture_b', label: 'B' },
  ];
  const third = { id: 'fixture_c', label: 'C' };
  const slots = Object.fromEntries([
    ['fixture_a', 25],
    ['fixture_b', 180],
    ['fixture_c', 270],
  ]);
  const original = radialEntries(pair, slots);
  const extended = radialEntries([third, ...pair.toReversed()], slots);
  for (const action of original) {
    expect(extended.find(({ id }) => id === action.id)?.angleRadians).toBe(action.angleRadians);
  }
  const radius = 50;
  const deadZone = 5;
  for (const entries of [original, extended]) {
    entries.forEach((action, index) => {
      const angle = action.angleRadians;
      expect(radialEntryIndex(Math.sin(angle) * radius, -Math.cos(angle) * radius, entries, deadZone)).toBe(index);
    });
  }
  expect(radialEntryIndex(0, 0, extended, deadZone)).toBeUndefined();
  expect(radialEntryIndex(deadZone, 0, extended, deadZone)).toBeUndefined();
  expect(radialEntryIndex(0, -radius, [], deadZone)).toBeUndefined();
});

it('release runs only the visibly chosen action, never a remembered action in the dead zone', () => {
  const selection = new FurnitureActionSelection('fixture open can');
  const tuning = { radiusPixels: 50, deadZonePixels: 5, entryCap: 4 };
  selection.open(piece, actions);
  expect(selection.choice(piece, actions)).toBeUndefined();
  expect(selection.confirm(piece, actions)).toBeUndefined();

  selection.open(piece, actions);
  selection.point(piece, actions, { x: 0, y: -20 }, tuning);
  expect(selection.choice(piece, actions)?.id).toBe(actions[0]!.id);
  expect(selection.confirm(piece, actions)?.id).toBe(actions[0]!.id);

  selection.open(piece, actions);
  selection.step(piece, actions, 1);
  expect(selection.choice(piece, actions)?.id).toBe(actions[1]!.id);
  selection.point(piece, actions, { x: 0, y: -20 }, tuning);
  selection.point(piece, actions, { x: 0, y: 20 }, tuning);
  expect(selection.choice(piece, actions)).toBeUndefined();
  expect(selection.confirm(piece, actions)).toBeUndefined();

  selection.open(piece, [actions[0]!]);
  selection.step(piece, [actions[0]!], 1);
  expect(selection.confirm(piece, [actions[0]!])?.id).toBe(actions[0]!.id);
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
