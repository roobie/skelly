import type { Registry } from '@skelly/engine/content';
import { kitSlotChoices, type TemplateAssembly } from '@skelly/engine/internal/core/templates.ts';
import { expect, it } from 'vitest';
import damaged from '../mods/skelly.deadvox.buildings/rural-damaged.json' with { type: 'json' };
import { startupContent } from './baseRegistry.ts';

const expectNewGeometry = (
  registry: Registry,
  after: TemplateAssembly['slots'][number],
  before: TemplateAssembly['slots'][number],
): void => {
  const shapes = kitSlotChoices(registry, before).flatMap(({ ref }) =>
    ref.kind === 'piece' ? [registry.mapPieces.get(ref.id)!.layers] : [],
  );
  for (const { ref } of kitSlotChoices(registry, after)) {
    if (ref.kind === 'piece') {
      // Renaming an unchanged piece is a private copy, not breach geometry.
      // biome-ignore lint/suspicious/noMisplacedAssertion: this helper runs only inside the sharing test.
      expect(shapes).not.toContainEqual(registry.mapPieces.get(ref.id)!.layers);
    }
  }
};

it.each(damaged.mapAssemblies)('$id retains every slot not supplied by the breach kit', (row) => {
  const { registry } = startupContent();
  const replacementPieces = new Set(damaged.mapPieces.map(({ id }) => id));
  const replacementAssemblies = new Set(damaged.mapAssemblies.map(({ id }) => id));
  const answer = registry.mapAssemblies.get(row.id)!;
  const intact = [...registry.mapAssemblies.values()].find(
    (candidate) =>
      !replacementAssemblies.has(candidate.id) &&
      candidate.brief === answer.brief &&
      candidate.size.every((value, axis) => value === answer.size[axis]),
  );
  expect(intact, `${answer.id}: needs an intact twin`).toBeDefined();
  const shared: TemplateAssembly['slots'] = [];
  const changed: TemplateAssembly['slots'] = [];
  for (const slot of answer.slots) {
    const original = intact!.slots.find(({ id }) => id === slot.id);
    expect(original, `${answer.id}/${slot.id}: needs its original slot`).toBeDefined();
    const replaced = kitSlotChoices(registry, slot).some(({ ref }) =>
      ref.kind === 'piece' ? replacementPieces.has(ref.id) : replacementAssemblies.has(ref.id),
    );
    if (replaced) {
      changed.push(slot);
      expect({ ...slot, choices: original!.choices }).toEqual(original);
      expectNewGeometry(registry, slot, original!);
    } else {
      shared.push(slot);
      expect(slot).toEqual(original);
    }
  }
  // Neither a completely separate answer nor a renamed intact answer proves sharing.
  expect(shared.length).toBeGreaterThan(0);
  expect(changed.length).toBeGreaterThan(0);
  expect(answer.slots.map(({ id }) => id)).toEqual(intact!.slots.map(({ id }) => id));
  expect(answer.anchors).toEqual(intact!.anchors);
  expect(answer.access).toEqual(intact!.access);
});
