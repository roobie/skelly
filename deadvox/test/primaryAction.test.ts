import { describe, expect, it } from 'vitest';
import { Character, dominantSide, offSide } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import { Simulation } from '../src/core/sim.ts';
import { activatePrimaryUse, selectPrimaryAction } from '../src/game/primaryAction.ts';
import { Survival } from '../src/game/survival.ts';
import { primaryActionHint } from '../src/ui/primaryActionHint.ts';

const capabilities = [
  {
    id: 'held_blunt',
    kind: 'melee',
    weapon: { melee: { damage: 1, reach: 1, cooldown: 1, stamina: 0, type: 'blunt' } },
  },
  { id: 'held_light', kind: 'light', light: { radius: 1, seenFrom: 1 } },
  { id: 'held_food', kind: 'use', category: 'food', food: { calories: 1, water: 0 } },
  { id: 'held_drink', kind: 'use', category: 'drink', food: { calories: 0, water: 1 } },
  { id: 'held_bandage', kind: 'use', category: 'medical' },
  { id: 'held_gun', kind: 'firearm', firearm: {}, twoHanded: true },
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
      yields: [{ item: 'held_blunt', count: 1, fractions: [0.5, 1], rounding: 'floor' }],
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
        category: ('category' in fields ? fields.category : undefined) ?? (kind === 'read' ? 'book' : 'tool'),
        weight: 1,
        size: [1, 1],
      })),
    },
  },
]);
if (issues.length > 0) {
  throw new Error(`Invalid hand-action fixture: ${JSON.stringify(issues)}`);
}

const hold = (right?: string, left?: string, handedness?: 'right' | 'left') => {
  const character = new Character(registry, { handedness });
  const inventory = new Inventory(registry, undefined, undefined, character);
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
  it('a two-handed item in the off slot reserves the empty dominant hand rather than punching or redirecting', () => {
    const inventory = hold('held_gun', undefined, 'left');
    expect(selectPrimaryAction(inventory)).toEqual({ kind: 'noop' });
  });
  it.each(capabilities)('routes the owned $kind capability through the selected hand', ({ id, kind }) => {
    const inventory = hold(id);
    const selected = selectPrimaryAction(inventory, 'right');
    expect(selected).toEqual({
      kind,
      ...(kind === 'none' ? {} : { hand: 'right' }),
      item: inventory.hands.right,
    });
  });

  it.each(['held_food', 'held_drink', 'held_bandage'])('runs the held %s primary use through Survival.use', (type) => {
    const inventory = hold(type);
    const action = selectPrimaryAction(inventory, 'right');
    if (action.kind !== 'use') {
      throw new Error(`Expected ${type} to select its use action`);
    }
    const simulation = new Simulation({ seed: 1 });
    const queue = new HandlingQueue(inventory);
    const player = { inventory, position: [0, 0, 0] as [number, number, number], blockSize: 1 };
    const survival = new Survival(simulation, inventory, queue, {
      reach: bindReach(player),
      feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
      notice: () => {
        throw new Error('Unexpected use notice in primary-action fixture');
      },
      read: () => {
        throw new Error('Unexpected reading in primary-action fixture');
      },
    });

    const refusal = activatePrimaryUse(action, (item) => survival.use(item));
    if (type === 'held_bandage') {
      expect(refusal).toBeTruthy();
      expect(queue.jobs).toHaveLength(0);
    } else {
      expect(refusal).toBeUndefined();
      expect(queue.jobs).toMatchObject([
        { kind: 'action', jobType: 'survival.eat', params: { itemUid: action.item.uid } },
      ]);
    }
  });

  it('refuses a ruined held melee weapon instead of attacking with it', () => {
    const inventory = new Inventory(registry);
    const ruined = inventory.create('held_blunt', 1, 0);
    expect(inventory.add(ruined, { kind: 'hand', side: 'right' })).toBe(true);
    expect(selectPrimaryAction(inventory, 'right')).toEqual({ kind: 'none', item: ruined });
  });

  it("resolves a left character's default dominant use and explicit off use to their own physical slots", () => {
    const inventory = hold('held_light', 'held_blunt', 'left');
    const leading = dominantSide(inventory.character);
    const secondary = offSide(inventory.character);
    expect(selectPrimaryAction(inventory)).toEqual({
      kind: 'melee',
      hand: leading,
      item: inventory.hands[leading],
    });
    expect(selectPrimaryAction(inventory, secondary)).toEqual({
      kind: 'light',
      hand: secondary,
      item: inventory.hands[secondary],
    });
  });

  it('uses a right-hand jab rather than punching with a held left-hand item', () => {
    const inventory = hold(undefined, 'held_light');
    expect(selectPrimaryAction(inventory, 'right')).toEqual({ kind: 'fists', hand: 'right' });
    expect(selectPrimaryAction(inventory, 'left')).toMatchObject({ kind: 'light', hand: 'left' });
  });

  it('alternates fists only when both hands are empty and does nothing for an empty off hand', () => {
    const inventory = hold();
    expect(selectPrimaryAction(inventory)).toEqual({ kind: 'fists' });
    expect(selectPrimaryAction(inventory, offSide(inventory.character))).toEqual({ kind: 'noop' });
  });

  it('hints for the selected unsupported hand without falling back to the other hand', () => {
    const inventory = hold('held_plain', 'held_light');
    expect(selectPrimaryAction(inventory, 'right')).toEqual({
      kind: 'none',
      item: inventory.hands.right,
    });
    expect(primaryActionHint(registry, inventory.hands.right!).trim()).not.toBe('');
    expect(selectPrimaryAction(inventory, 'left')).toMatchObject({ kind: 'light', hand: 'left' });

    const leftOnly = hold(undefined, 'held_plain');
    expect(selectPrimaryAction(leftOnly, 'left')).toEqual({ kind: 'none', item: leftOnly.hands.left });
    expect(primaryActionHint(registry, leftOnly.hands.left!).trim()).not.toBe('');
  });
});
