import { describe, expect, it } from 'vitest';
import { reachTuning } from '../src/core/reach.ts';
import {
  FurnitureActionSelection,
  furnitureActionsFor,
  heldMenuActions,
  radialEntries,
  radialEntryIndex,
} from '../src/game/furnitureActions.ts';
import { baseRegistryWith } from './baseRegistry.ts';
import {
  AMOUNT,
  DURABILITY,
  OTHER_PIECE,
  PIECE,
  RECIPE,
  worldRepairFixture,
  worldRepairSources,
} from './worldRepairFixture.ts';

const piece = { uid: 7 };
const actions = radialEntries(
  [
    { id: 'use', label: 'Use' },
    { id: 'push', label: 'Push' },
  ],
  { use: 0, push: 180 },
);

it('groups treatment regions behind one operation without dropping direct held actions', () => {
  const direct = [{ id: 'fixture-direct', label: 'Direct' }];
  const regions = [
    {
      id: 'fixture-treatment:head',
      label: 'Head',
      treatment: { itemType: 'fixture-treatment', region: 'head' as const },
    },
    {
      id: 'fixture-treatment:torso',
      label: 'Torso',
      treatment: { itemType: 'fixture-treatment', region: 'torso' as const },
    },
  ];
  expect(heldMenuActions(direct, 'Fixture treat')).toEqual(direct);
  expect(heldMenuActions([...regions, ...direct], 'Fixture treat')).toEqual([
    ...direct,
    { id: 'treat', label: 'Fixture treat' },
  ]);
});

it('returns from held-region choices to a neutral first-level menu using the shared owner', () => {
  const selection = new FurnitureActionSelection('fixture opening');
  const entries = radialEntries([{ id: 'treat', label: 'Fixture treat' }], { treat: 0 });
  selection.open(piece, entries, 'held');
  selection.point(piece, entries, { x: 0, y: -20 }, { radiusPixels: 50, deadZonePixels: 5, entryCap: 8 });
  expect(selection.choice(piece, entries)?.id).toBe('treat');
  selection.showRegions();
  expect(selection.regionsOpen).toBe(true);
  expect(selection.choice(piece, entries)).toBeUndefined();
  selection.open(piece, entries, 'held');
  expect(selection.regionsOpen).toBe(false);
  expect(selection.source).toBe('held');
  expect(selection.confirm(piece, entries)).toBeUndefined();
});

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

describe('furniture service choices', () => {
  const registry = baseRegistryWith(worldRepairSources());

  it.each(['damaged', 'intact', 'ruined', 'unknown'] as const)(
    'offers repair only for a damaged target with an admitted recipe: %s',
    (state) => {
      const { inventory, target } = worldRepairFixture(registry);
      if (state === 'intact') {
        expect(inventory.entities.repair(target, DURABILITY)).toBe(true);
      } else if (state === 'ruined') {
        expect(inventory.entities.bash(target, DURABILITY)).toBe('ruined');
      }
      const knownRecipes = state === 'unknown' ? [] : [RECIPE];
      const choices = furnitureActionsFor(inventory, target, 0.5, knownRecipes);
      expect(choices.some(({ id }) => id === 'repair')).toBe(state === 'damaged');
    },
  );

  it('does not offer a known repair recipe on a different furniture type', () => {
    const { inventory, character } = worldRepairFixture(registry);
    const target = inventory.entities.add({ type: OTHER_PIECE, pos: [1, 1, 1], size: [1, 1, 1], facing: 'n' })!;
    expect(inventory.entities.bash(target, AMOUNT)).toBe('damaged');
    expect(character.knownRecipes.has(RECIPE)).toBe(true);
    expect(furnitureActionsFor(inventory, target, 0.5, character.knownRecipes).some(({ id }) => id === 'repair')).toBe(
      false,
    );
  });

  it.each(['damaged', 'intact', 'debug-off'] as const)(
    'keeps lift in the held list on a small movable piece: %s',
    (state) => {
      const { inventory, target } = worldRepairFixture(registry);
      if (state === 'intact') {
        expect(inventory.entities.repair(target, DURABILITY)).toBe(true);
      }
      const blockSize = reachTuning(registry).furnitureMove.maxSizeMetres / 2;
      const choices = furnitureActionsFor(inventory, target, blockSize, state === 'debug-off' ? undefined : [RECIPE]);
      expect(choices.some(({ id }) => id === 'lift')).toBe(true);
    },
  );

  it('keeps fitted small-piece controls available so movement can explain its refusal', () => {
    const { inventory } = worldRepairFixture(registry);
    const target = inventory.entities.add({ type: PIECE, pos: [5, 1, 0], size: [1, 1, 1], facing: 'n', fixed: true })!;
    expect(furnitureActionsFor(inventory, target, 0.5).some(({ id }) => id === 'lift')).toBe(true);
  });

  it('offers repair alongside drag in the same target-bound choice list', () => {
    const { inventory } = worldRepairFixture(registry);
    const target = inventory.entities.add({ type: PIECE, pos: [8, 1, 0], size: [4, 1, 1], facing: 'n' })!;
    expect(inventory.entities.bash(target, AMOUNT)).toBe('damaged');
    const blockSize = reachTuning(registry).furnitureMove.maxSizeMetres / 2;
    const choices = furnitureActionsFor(inventory, target, blockSize, [RECIPE]);
    expect(choices.some(({ id }) => id === 'drag')).toBe(true);
    expect(choices.some(({ id }) => id === 'repair')).toBe(true);
    const selection = new FurnitureActionSelection('fixture open can');
    selection.open(target, choices);
    const repairIndex = choices.findIndex(({ id }) => id === 'repair');
    for (const _choice of choices.slice(0, repairIndex)) {
      selection.step(target, choices, 1);
    }
    expect(selection.confirm(target, choices)?.id).toBe('repair');
    expect(selection.isOpen(target)).toBe(false);
  });
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
