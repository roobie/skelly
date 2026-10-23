import { describe, expect, it } from 'vitest';
import { Character } from '../src/core/character.ts';
import { CraftCommands } from '../src/core/craftCommands.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { type HandSide, Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import { gameMinutes } from '../src/core/time.ts';
import { ItemActionSelection, itemActionsFor } from '../src/game/itemActions.ts';
import { selectPrimaryAction } from '../src/game/primaryAction.ts';
import { Sharpening, sharpeningTargetForHand } from '../src/game/sharpening.ts';
import { craftRows } from '../src/ui/craftReadout.ts';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { Simulation } from './simulationFixture.ts';

const fixture = (side: HandSide = 'right') => {
  const base = baseRegistry();
  const bladeDef = { ...base.items.get('kitchen_knife')!, id: 'fixture_blade' };
  const common = {
    activation: 'sharpen' as const,
    kind: 'repair' as const,
    result: { item: bladeDef.id, count: 1 },
    repair: { skill: 'crafting', amount: 0.2, perSkill: 0.05 },
    timeGameMinutes: gameMinutes(1),
    skills: { crafting: 0 },
    components: [],
  };
  const field = { ...common, id: 'fixture_hone', qualities: { sharpening: 1 } };
  const wheel = {
    ...common,
    id: 'fixture_grind',
    qualities: {},
    workstation: 'grinding_wheel',
    repair: { ...common.repair, amount: 0.5 },
  };
  const registry = {
    ...base,
    items: new Map(base.items).set(bladeDef.id, bladeDef),
    recipes: new Map(base.recipes).set(field.id, field).set(wheel.id, wheel),
  };
  const character = new Character(registry);
  character.learnRecipes([field.id, wheel.id]);
  const inventory = new Inventory(registry, undefined, undefined, character);
  const blade = inventory.create(bladeDef.id, 1, 0.3);
  const stone = inventory.create('whetstone');
  const other: HandSide = side === 'right' ? 'left' : 'right';
  if (!(inventory.add(blade, { kind: 'hand', side }) && inventory.add(stone, { kind: 'hand', side: other }))) {
    throw new Error('Held sharpening fixture does not fit');
  }
  const queue = new HandlingQueue(inventory);
  const reach = bindReach({ inventory, position: [0, 0, 0], blockSize: 1, clock: BASE_CLOCK });
  const sharpening = new Sharpening(inventory, queue, { character, reach, clockRatio: BASE_CLOCK.ratio });
  return { registry, character, inventory, blade, stone, side, other, queue, reach, sharpening, field, wheel };
};

describe('held sharpening', () => {
  it.each(['right', 'left'] as const)(
    'hones from either member with the blade in %s, without an accidental swing',
    (side) => {
      const f = fixture(side);
      const { body } = new Simulation({ seed: 1 });
      const selection = new ItemActionSelection();
      const actions = itemActionsFor(f.blade, f.inventory, body);
      expect(selectPrimaryAction(f.inventory, side).kind).toBe('melee');
      expect(selection.step(f.blade, actions, 1)).toBe(true);
      expect(selectPrimaryAction(f.inventory, side, selection.forItem(f.blade, actions)?.id).kind).toBe('sharpen');
      expect(selectPrimaryAction(f.inventory, f.other).kind).toBe('sharpen');
      for (const hand of [side, f.other]) {
        expect(sharpeningTargetForHand(f.inventory, hand)).toBe(f.blade);
        const before = f.blade.condition;
        expect(f.sharpening.activate(hand)).toBeUndefined();
        expect(f.blade.condition).toBe(before);
        expect(f.queue.tick(f.queue.remaining).failed).toEqual([]);
        expect(f.blade.condition).toBeGreaterThan(before);
        expect(f.inventory.hands[side]).toBe(f.blade);
      }
      expect(f.inventory.move(f.stone, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
      const missingActions = itemActionsFor(f.blade, f.inventory, body);
      expect(selectPrimaryAction(f.inventory, side, selection.forItem(f.blade, missingActions)?.id).kind).toBe(
        'sharpen',
      );
      expect(f.sharpening.activate(side)).toBeDefined();
      expect(selection.step(f.blade, missingActions, 1)).toBe(true);
      expect(selectPrimaryAction(f.inventory, side, selection.forItem(f.blade, missingActions)?.id).kind).toBe('melee');
    },
  );

  it('grinds the held blade at reachable wheel furniture, not a blade on the ground', () => {
    const f = fixture();
    expect(f.inventory.move(f.stone, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    const station = f.inventory.entities.add({
      type: 'grinding_wheel',
      pos: [1, 0, 0],
      facing: 'n',
      size: f.registry.furniture.get('grinding_wheel')!.size,
    });
    expect(station).toBeDefined();
    expect(f.sharpening.wheelMethod(f.blade, station)).toBe(f.wheel);
    const before = f.blade.condition;
    expect(f.sharpening.activate(f.side, station)).toBeUndefined();
    expect(f.queue.tick(f.queue.remaining).failed).toEqual([]);
    expect(f.blade.condition).toBeGreaterThan(before);
    expect(f.inventory.move(f.blade, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    expect(f.sharpening.activate(f.side, station)).toBeDefined();
    expect(f.queue.busy).toBe(false);
  });

  it('never offers sharpening in the craft list or admits it through craft commands', () => {
    const f = fixture();
    const rows = craftRows({
      registry: f.registry,
      character: f.character,
      reach: f.reach(),
      preferences: {},
      startReason: undefined,
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const method of [f.field, f.wheel]) {
      expect(rows.some((row) => row.id === method.id)).toBe(false);
    }
    const sim = new Simulation({ seed: 1 });
    const commands = new CraftCommands({
      inventory: f.inventory,
      character: f.character,
      sim,
      queue: f.queue,
      reach: f.reach,
    });
    expect(commands.preview(f.field.id)).toBeUndefined();
    expect(commands.preview(f.wheel.id)).toBeUndefined();
  });

  it('requires the other hand, not a nearby stone, and rechecks its identity at completion', () => {
    const f = fixture();
    const before = f.blade.condition;
    expect(f.sharpening.activate(f.side)).toBeUndefined();
    expect(f.inventory.move(f.stone, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    expect(f.queue.tick(f.queue.remaining).failed).toHaveLength(1);
    expect(f.blade.condition).toBe(before);
    expect(f.sharpening.activate(f.side)).toBeDefined();
    expect(f.queue.busy).toBe(false);
    const wrongTool = f.inventory.create('can_opener');
    expect(f.inventory.add(wrongTool, { kind: 'hand', side: f.other })).toBe(true);
    expect(f.sharpening.activate(f.side)).toBeDefined();
    expect(f.queue.busy).toBe(false);
  });

  it('does not restore condition if the wheel leaves reach during work', () => {
    const f = fixture();
    const station = f.inventory.entities.add({
      type: 'grinding_wheel',
      pos: [1, 0, 0],
      facing: 'n',
      size: f.registry.furniture.get('grinding_wheel')!.size,
    })!;
    expect(f.sharpening.activate(f.side, station)).toBeUndefined();
    const before = f.blade.condition;
    f.inventory.entities.lift(station);
    expect(f.queue.tick(f.queue.remaining).failed).toHaveLength(1);
    expect(f.blade.condition).toBe(before);
  });
});
