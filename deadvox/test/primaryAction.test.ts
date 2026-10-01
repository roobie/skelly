import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { ACTION_HAND_BINDINGS, primaryActionForDefinition, selectPrimaryAction } from '../src/game/primaryAction.ts';
import { primaryActionHint } from '../src/ui/primaryActionHint.ts';

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

describe('held-item hand action', () => {
  it('keeps the initial BR hand mapping in one table', () => {
    expect(ACTION_HAND_BINDINGS).toEqual({ primaryClick: 'right', leftHandKey: 'left' });
  });

  it('dispatches by item capability, not item id', () => {
    expect(primaryActionForDefinition(registry.items.get('baseball_bat')!)).toBe('melee');
    expect(primaryActionForDefinition(registry.items.get('flashlight')!)).toBe('light');
    expect(primaryActionForDefinition(registry.items.get('rag')!)).toBe('none');
  });

  it('routes the firearm extension marker from item data without an item-id branch', () => {
    const { registry: firearmRegistry } = buildRegistry([
      {
        source: 'test-firearm.json',
        data: {
          items: [
            {
              id: 'test_firearm',
              name: 'Test firearm',
              category: 'weapon',
              weight: 1,
              size: [1, 1],
              firearm: {},
            },
          ],
        },
      },
    ]);
    const inventory = new Inventory(firearmRegistry);
    inventory.hands.right = inventory.create('test_firearm');
    expect(selectPrimaryAction(firearmRegistry, inventory.hands)).toEqual({
      kind: 'firearm',
      hand: 'right',
      item: inventory.hands.right,
    });
  });

  it('binds left-click to the right hand and `=` to the left hand when both have items', () => {
    const inventory = hold('baseball_bat', 'flashlight');
    expect(selectPrimaryAction(registry, inventory.hands, 'right')).toEqual({
      kind: 'melee',
      hand: 'right',
      item: inventory.hands.right,
    });
    expect(selectPrimaryAction(registry, inventory.hands, 'left')).toEqual({
      kind: 'light',
      hand: 'left',
      item: inventory.hands.left,
    });
  });

  it('uses a right-hand jab rather than punching with a held left-hand item', () => {
    const inventory = hold(undefined, 'flashlight');
    expect(selectPrimaryAction(registry, inventory.hands, 'right')).toEqual({ kind: 'fists', hand: 'right' });
    expect(selectPrimaryAction(registry, inventory.hands, 'left')).toMatchObject({ kind: 'light', hand: 'left' });
  });

  it('alternates fists only when both hands are empty and does nothing for an empty left hand', () => {
    expect(selectPrimaryAction(registry, {}, 'right')).toEqual({ kind: 'fists' });
    expect(selectPrimaryAction(registry, {}, 'left')).toEqual({ kind: 'noop' });
  });

  it('hints for the selected hand only instead of falling back to the other hand', () => {
    const inventory = hold('rag', 'flashlight');
    const right = selectPrimaryAction(registry, inventory.hands, 'right');
    expect(right).toEqual({ kind: 'none', item: inventory.hands.right });
    expect(primaryActionHint(registry, inventory.hands.right!)).toBe('Nothing to do with rag');
    expect(selectPrimaryAction(registry, inventory.hands, 'left')).toMatchObject({ kind: 'light', hand: 'left' });

    const leftOnlyUnsupported = hold(undefined, 'bandage');
    const left = selectPrimaryAction(registry, leftOnlyUnsupported.hands, 'left');
    expect(left).toEqual({ kind: 'none', item: leftOnlyUnsupported.hands.left });
    expect(primaryActionHint(registry, leftOnlyUnsupported.hands.left!)).toBe('Nothing to do with bandage');
  });
});
