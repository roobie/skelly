import { describe, expect, it } from 'vitest';
import { reachTuning } from '../src/core/reach.ts';
import { FurnitureActionSelection, furnitureActionsFor } from '../src/game/furnitureActions.ts';
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
const actions = [
  { id: 'use', label: 'Use' },
  { id: 'push', label: 'Push' },
];

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
