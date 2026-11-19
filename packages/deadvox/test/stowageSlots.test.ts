import { buildRegistry, type ContentSource } from '@skelly/engine/content';
import { coreMessage } from '@skelly/engine/internal/core/coreText.ts';
import { Inventory } from '@skelly/engine/inventory';
import { describe, expect, it } from 'vitest';
import { baseContentSources } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';

const content = baseRegistry();
const seatsOf = (type: string) => content.models.get(content.items.get(type)?.model ?? '')?.stowage?.seats ?? [];
const items = [...content.items.values()];
const seated = items.find(({ id, container }) => !container && seatsOf(id).length > 0)!;
const unseated = items.find(({ id, model, container }) => model && !container && seatsOf(id).length === 0)!;
const word = seatsOf(seated.id)[0]!.standard;

const frame = { position: [0, 0, 0], normal: [1, 0, 0], up: [0, 1, 0] };
const envelope = { min: [0, 0, 0], max: [1, 1, 1] };
const slotPocket = (slot: string) => ({ layout: 'pile', slot, handlingSimSeconds: 1 });

/** A rack of two slots seating the word an authored item stows by. */
const stowage = (pockets: readonly object[]): ContentSource => ({
  source: 'stowage-fixture.json',
  data: {
    models: [
      {
        id: 'fixture_rack_model',
        file: content.models.get(unseated.model!)!.file,
        stowage: {
          slots: [
            { id: 'hook_a', accepts: [word], envelope, frame },
            { id: 'hook_b', accepts: [word], envelope, frame },
          ],
        },
      },
    ],
    items: [
      {
        ...unseated,
        id: 'fixture_rack',
        name: 'Fixture rack',
        weight: 1000,
        model: 'fixture_rack_model',
        container: { pockets },
      },
    ],
  },
});

const base = baseContentSources();
const build = (pockets: readonly object[]) => buildRegistry([...base, stowage(pockets)]);
const fixtureIssues = (pockets: readonly object[]) =>
  build(pockets).issues.filter(({ source }) => source === 'stowage-fixture.json');

describe('stowage slot pockets', () => {
  const { registry, issues } = build([slotPocket('hook_a'), slotPocket('hook_b')]);

  it('admit content whose slot pockets name distinct slots of the model', () => {
    expect(issues.filter(({ source }) => source === 'stowage-fixture.json')).toEqual([]);
  });

  it('refuse a slot the model does not list, a slot pocket laid out as a grid, and one slot twice', () => {
    expect(fixtureIssues([slotPocket('hook_c')])).not.toEqual([]);
    expect(fixtureIssues([{ ...slotPocket('hook_a'), layout: 'grid', grid: [1, 1] }])).not.toEqual([]);
    expect(fixtureIssues([slotPocket('hook_a'), slotPocket('hook_a')])).not.toEqual([]);
  });

  it('seat one item whose seat word the slot accepts', () => {
    const inventory = new Inventory(registry);
    const rack = inventory.create('fixture_rack');
    expect(inventory.add(rack, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    const hook = { kind: 'pocket', owner: rack, pocket: 0 } as const;

    const other = inventory.create(unseated.id);
    expect(inventory.add(other, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.move(other, hook)).toMatchObject({ ok: false, reason: coreMessage(registry, 'slotNotFor') });

    const first = inventory.create(seated.id);
    expect(inventory.add(first, { kind: 'hand', side: 'left' })).toBe(true);
    expect(inventory.move(first, hook).ok).toBe(true);

    const second = inventory.create(seated.id);
    expect(inventory.add(second, { kind: 'hand', side: 'left' })).toBe(true);
    expect(inventory.move(second, hook)).toMatchObject({ ok: false, reason: coreMessage(registry, 'slotTaken') });
    expect(inventory.move(second, { ...hook, pocket: 1 }).ok).toBe(true);
  });

  it('refuse a save whose slot holds what it does not seat', () => {
    const inventory = new Inventory(registry);
    const rack = inventory.create('fixture_rack');
    expect(inventory.add(rack, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    expect(inventory.add(inventory.create(seated.id), { kind: 'pocket', owner: rack, pocket: 0 })).toBe(true);
    const state = JSON.parse(JSON.stringify(inventory.snapshotState()));
    expect(() => Inventory.restoreState(registry, state)).not.toThrow();
    const [pile] = state.piles;
    pile.items[0].item.pockets[0][0].item.type = unseated.id;
    expect(() => Inventory.restoreState(registry, state)).toThrow('does not seat');
  });
});
