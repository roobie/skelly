import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { primaryActionForDefinition, primaryActionHint, selectPrimaryAction } from '../src/game/primaryAction.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);

const hold = (right?: string, left?: string) => {
  const inventory = new Inventory(registry);
  if (right) {
    inventory.hands.right = inventory.create(right);
  }
  if (left) {
    inventory.hands.left = inventory.create(left);
  }
  return inventory;
};

describe('held-item primary action', () => {
  it('dispatches by item capability, not item id', () => {
    expect(primaryActionForDefinition(registry.items.get('baseball_bat')!)).toBe('melee');
    expect(primaryActionForDefinition(registry.items.get('flashlight')!)).toBe('light');
    expect(primaryActionForDefinition(registry.items.get('rag')!)).toBe('none');
  });

  it('uses a right-hand action before a left-hand action, including a two-handed melee item', () => {
    const inventory = hold('baseball_bat', 'flashlight');
    expect(selectPrimaryAction(registry, inventory.hands)).toEqual({
      kind: 'melee',
      hand: 'right',
      item: inventory.hands.right,
    });
  });

  it('falls through an unsupported right-hand item to an actionable left-hand light', () => {
    const inventory = hold('rag', 'flashlight');
    expect(selectPrimaryAction(registry, inventory.hands)).toEqual({
      kind: 'light',
      hand: 'left',
      item: inventory.hands.left,
    });
  });

  it('selects fists only when both hands are empty', () => {
    expect(selectPrimaryAction(registry, {})).toEqual({ kind: 'fists' });
    const inventory = hold('flashlight');
    expect(selectPrimaryAction(registry, inventory.hands)).toMatchObject({ kind: 'light', hand: 'right' });
  });

  it('returns a non-action item for a hint instead of falling back to fists', () => {
    const inventory = hold('rag', 'bandage');
    expect(selectPrimaryAction(registry, inventory.hands)).toEqual({
      kind: 'none',
      item: inventory.hands.right,
    });
    expect(primaryActionHint(registry, inventory.hands.right!)).toBe('Nothing to do with rag');
  });
});
