import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../tools/jsonnet/index.mjs';
import { buildCityPlan } from '../src/core/cityPlan.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { ContentFile } from '../src/core/schema.ts';

it('resolves city assembly alternatives per building rather than caching one selection for the pool', () => {
  const data = JSON.parse(compileJsonnetFile('deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;
  const { registry, issues } = buildRegistry([{ source: 'fixture-city-kits.json', data }]);
  expect(issues).toEqual([]);
  const grid = {
    street: 4,
    blockX: 14,
    blockZ: 12,
    pad: 2,
    gap: 2,
    blend: 2,
    blocksX: 1,
    blocksZ: 1,
    templates: ['fixture_route'],
  };
  const plan = () => buildCityPlan({ seed: 73, registry, floor: 0, grid });
  const first = plan();
  const variants = (result: ReturnType<typeof plan>) =>
    result.placements.map((placement) => {
      const choices = new Set(
        placement.template
          .provenance!.filter((owner) => owner?.slotPath === 'fixture_route/front')
          .map((owner) => owner!.variant),
      );
      expect(choices.size).toBe(1);
      return [...choices][0]!;
    });
  const selected = variants(first);
  expect(new Set(selected)).toEqual(new Set(['room_a', 'room_b']));
  expect(variants(plan())).toEqual(selected);
  expect(first.placements.every((placement) => placement.template.id === 'fixture_route')).toBe(true);
});
