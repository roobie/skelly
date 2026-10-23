import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/core/inventory.ts';
import { craftComponentEligible, ItemFactory, isEmpty, stackRoom, weightOf } from '../src/core/items.ts';
import type { LiquidContents } from '../src/core/schema.ts';
import { baseRegistry } from './baseRegistry.ts';
import { buildFixtureRegistry } from './economyFixtures.ts';

const capacityMicrolitres = 8000;
const densityGramsPerMillilitre = 1.25;
const shellGrams = 17;
const filled = (volumeMicrolitres: number): LiquidContents => ({
  kind: 'filled',
  liquid: 'fixture_liquid',
  volumeMicrolitres,
});
const vessel = (id: string, initialContents: LiquidContents) => ({
  id,
  name: id,
  category: 'tool',
  weight: shellGrams,
  size: [1, 1],
  vessel: { capacityMicrolitres, accepts: ['fixture_liquid'], initialContents },
});
const liquids = [
  { id: 'fixture_liquid', name: 'Fixture liquid', densityGramsPerMillilitre },
  { id: 'fixture_other', name: 'Other liquid', densityGramsPerMillilitre: 2 },
];
const build = (items: unknown[], definitions: unknown[] = liquids) =>
  buildFixtureRegistry([{ source: 'fixture-liquid-vessels.json', data: { liquids: definitions, items } }]);
const fixture = () => {
  const result = build([
    vessel('fixture_empty', { kind: 'empty' }),
    vessel('fixture_partial', filled(capacityMicrolitres / 2)),
    vessel('fixture_full', filled(capacityMicrolitres)),
    {
      ...vessel('fixture_other_vessel', { kind: 'filled', liquid: 'fixture_other', volumeMicrolitres: 2000 }),
      vessel: {
        capacityMicrolitres,
        accepts: ['fixture_other'],
        initialContents: { kind: 'filled', liquid: 'fixture_other', volumeMicrolitres: 2000 },
      },
    },
  ]);
  if (result.issues.length > 0) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.registry;
};

describe('liquid vessel foundation', () => {
  it('initializes distinct explicit empty, partial and full balances from content', () => {
    const registry = fixture();
    const factory = new ItemFactory();
    const empty = factory.create(registry, 'fixture_empty');
    const partial = factory.create(registry, 'fixture_partial');
    const full = factory.create(registry, 'fixture_full');
    expect(empty.liquidContents).toEqual({ kind: 'empty' });
    expect(partial.liquidContents).toEqual(filled(capacityMicrolitres / 2));
    expect(full.liquidContents).toEqual(filled(capacityMicrolitres));
    expect(partial.liquidContents).not.toBe(registry.items.get(partial.type)!.vessel!.initialContents);
    expect(factory.create(registry, partial.type).liquidContents).not.toBe(partial.liquidContents);
    expect(factory.create(registry, 'fixture_other_vessel').liquidContents).toMatchObject({ liquid: 'fixture_other' });
    expect(() => factory.create(registry, empty.type, 2)).toThrow();
    expect(stackRoom(registry, empty, factory.create(registry, empty.type))).toBe(0);
  });

  it('retains the same measured instance on movement and counts only shell plus authored liquid mass', () => {
    const registry = fixture();
    const inventory = new Inventory({ ...baseRegistry(), items: registry.items, liquids: registry.liquids });
    const partial = inventory.create('fixture_partial');
    const originalContents = partial.liquidContents;
    expect(inventory.add(partial, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    expect(inventory.move(partial, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(inventory.hands.right).toBe(partial);
    expect(partial.liquidContents).toBe(originalContents);
    const partialMass = shellGrams + (capacityMicrolitres / 2 / 1000) * densityGramsPerMillilitre;
    expect(inventory.carriedWeight()).toBe(partialMass);
    expect(weightOf(registry, inventory.create('fixture_empty'))).toBe(shellGrams);
    expect(weightOf(registry, inventory.create('fixture_full')) - partialMass).toBe(
      (capacityMicrolitres / 2 / 1000) * densityGramsPerMillilitre,
    );
    expect(weightOf(registry, inventory.create('fixture_other_vessel'))).toBe(shellGrams + 2 * 2);
  });

  it('refuses filled craft stock even when a recipe consumes fitted parts, while permitting empty shells', () => {
    const registry = fixture();
    const factory = new ItemFactory();
    const partial = factory.create(registry, 'fixture_partial');
    const empty = factory.create(registry, 'fixture_empty');
    expect(isEmpty(partial)).toBe(false);
    expect(craftComponentEligible(partial)).toBe(false);
    expect(craftComponentEligible(partial, true)).toBe(false);
    expect(isEmpty(empty)).toBe(true);
    expect(craftComponentEligible(empty, true)).toBe(true);
  });

  it.each([
    ['unknown accepted kind', { accepts: ['missing'] }],
    [
      'incompatible initial kind',
      { initialContents: { kind: 'filled', liquid: 'fixture_other', volumeMicrolitres: 1 } },
    ],
    ['over capacity', { initialContents: filled(capacityMicrolitres + 1) }],
    ['missing initial contents', { initialContents: undefined }],
    ['missing capacity', { capacityMicrolitres: undefined }],
    ['empty accepted kinds', { accepts: [] }],
    ['fractional capacity', { capacityMicrolitres: 1.5 }],
    ['zero filled balance', { initialContents: filled(0) }],
    ['unsafe quantity', { capacityMicrolitres: Number.MAX_SAFE_INTEGER + 1 }],
    ['ambiguous empty balance', { initialContents: { kind: 'empty', volumeMicrolitres: 0 } }],
  ])('rejects %s', (_name, patch) => {
    const item = vessel('fixture_invalid', { kind: 'empty' });
    const { issues } = build([{ ...item, vessel: { ...item.vessel, ...patch } }]);
    expect(issues.some((issue) => issue.path.startsWith('items[0].vessel'))).toBe(true);
  });

  it.each([
    { stack: 2 },
    { canister: { capacity: 5 } },
    { igniter: { capacity: 5, perIgnition: 1 } },
    { unpack: { item: 'fixture_invalid', count: 1, simSeconds: 1 } },
  ])('rejects unsupported vessel mechanism combinations %o', (patch) => {
    const { issues } = build([{ ...vessel('fixture_invalid', { kind: 'empty' }), ...patch }]);
    expect(issues.some((issue) => issue.message.includes('liquid vessels'))).toBe(true);
  });

  it.each([0, -1, Number.POSITIVE_INFINITY])('rejects invalid density %s', (density) => {
    const { issues } = build([], [{ ...liquids[0], densityGramsPerMillilitre: density }]);
    expect(issues.some((issue) => issue.path === 'liquids[0].densityGramsPerMillilitre')).toBe(true);
  });
});
