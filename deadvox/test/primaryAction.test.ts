import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { ACTION_HAND_BINDINGS, selectPrimaryAction } from '../src/game/primaryAction.ts';
import { primaryActionHint } from '../src/ui/primaryActionHint.ts';

const capabilities = [
  {
    id: 'held_blunt',
    kind: 'melee',
    weapon: { melee: { damage: 1, reach: 1, cooldown: 1, stamina: 0, type: 'blunt' } },
  },
  { id: 'held_light', kind: 'light', light: { radius: 1, seenFrom: 1, color: '#ffffff', intensity: 1 } },
  { id: 'held_gun', kind: 'firearm', firearm: {} },
  { id: 'held_key', kind: 'key', key: { lock: 'fixture_lock' } },
  { id: 'held_book', kind: 'read', book: { title: 'Fixture manual', recipes: ['fixture_recipe'], readingTime: 1 } },
  { id: 'held_box', kind: 'unpack', unpack: { item: 'held_plain', count: 1 } },
  {
    id: 'held_plain',
    kind: 'none',
    stack: 2,
    disassembly: {
      time: 1,
      skill: 'crafting',
      yields: [{ item: 'held_plain', count: 1, fractions: [0.5, 1], rounding: 'floor' }],
    },
  },
] as const;
const { registry, issues } = buildRegistry([
  {
    source: 'hand-action-fixture',
    data: {
      skills: [{ id: 'crafting', name: 'Crafting' }],
      furniture: [
        { id: 'fixture_door', name: 'Fixture door', size: [1, 1, 1], color: '#666666', door: { handling: 0 } },
      ],
      templates: [
        {
          id: 'fixture_locked_room',
          size: [1, 1, 1],
          palette: { D: { furniture: 'fixture_door', lock: { id: 'fixture_lock', locked: true } } },
          layers: [['D']],
        },
      ],
      recipes: [
        {
          id: 'fixture_recipe',
          result: { item: 'held_plain', count: 1 },
          time: 1,
          skills: {},
          qualities: {},
          components: [[{ item: 'held_plain', count: 1 }]],
        },
      ],
      items: capabilities.map(({ kind, ...fields }) => ({
        ...fields,
        name: fields.id,
        category: kind === 'read' ? 'book' : 'tool',
        weight: 1,
        size: [1, 1],
      })),
    },
  },
]);
if (issues.length > 0) {
  throw new Error(`Invalid hand-action fixture: ${JSON.stringify(issues)}`);
}

const hold = (right?: string, left?: string) => {
  const inventory = new Inventory(registry);
  for (const [side, type] of [
    ['right', right],
    ['left', left],
  ] as const) {
    if (type && !inventory.add(inventory.create(type), { kind: 'hand', side })) {
      throw new Error(`Hand-action fixture cannot hold ${type} in ${side}`);
    }
  }
  return inventory;
};

describe('held-item hand action', () => {
  it.each(capabilities)('routes the owned $kind capability through the selected hand', ({ id, kind }) => {
    const inventory = hold(id);
    const selected = selectPrimaryAction(registry, inventory.hands, 'right');
    expect(selected).toEqual({
      kind,
      ...(kind === 'none' ? {} : { hand: 'right' }),
      item: inventory.hands.right,
    });
  });

  it('refuses a ruined held melee weapon instead of attacking with it', () => {
    const inventory = hold('held_blunt');
    inventory.hands.right!.condition = 0;
    expect(selectPrimaryAction(registry, inventory.hands, 'right')).toEqual({
      kind: 'none',
      item: inventory.hands.right,
    });
  });

  it('routes the initial primary and off inputs to their own occupied physical hands', () => {
    const inventory = hold('held_blunt', 'held_light');
    expect(selectPrimaryAction(registry, inventory.hands, ACTION_HAND_BINDINGS.primaryClick)).toEqual({
      kind: 'melee',
      hand: 'right',
      item: inventory.hands.right,
    });
    expect(selectPrimaryAction(registry, inventory.hands, ACTION_HAND_BINDINGS.leftHandKey)).toEqual({
      kind: 'light',
      hand: 'left',
      item: inventory.hands.left,
    });
  });

  it('uses a right-hand jab rather than punching with a held left-hand item', () => {
    const inventory = hold(undefined, 'held_light');
    expect(selectPrimaryAction(registry, inventory.hands, 'right')).toEqual({ kind: 'fists', hand: 'right' });
    expect(selectPrimaryAction(registry, inventory.hands, 'left')).toMatchObject({ kind: 'light', hand: 'left' });
  });

  it('alternates fists only when both hands are empty and does nothing for an empty left hand', () => {
    expect(selectPrimaryAction(registry, {}, 'right')).toEqual({ kind: 'fists' });
    expect(selectPrimaryAction(registry, {}, 'left')).toEqual({ kind: 'noop' });
  });

  it('hints for the selected unsupported hand without falling back to the other hand', () => {
    const inventory = hold('held_plain', 'held_light');
    expect(selectPrimaryAction(registry, inventory.hands, 'right')).toEqual({
      kind: 'none',
      item: inventory.hands.right,
    });
    expect(primaryActionHint(registry, inventory.hands.right!).trim()).not.toBe('');
    expect(selectPrimaryAction(registry, inventory.hands, 'left')).toMatchObject({ kind: 'light', hand: 'left' });

    const leftOnly = hold(undefined, 'held_plain');
    expect(selectPrimaryAction(registry, leftOnly.hands, 'left')).toEqual({ kind: 'none', item: leftOnly.hands.left });
    expect(primaryActionHint(registry, leftOnly.hands.left!).trim()).not.toBe('');
  });
});
