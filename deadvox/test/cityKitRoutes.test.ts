import { expect, it } from 'vitest';
import { templateStandingRoute } from '../src/core/templateSpatial.ts';
import { compileAssembly } from '../src/core/templates.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';

it('curated multi-storey buildings retain furnished entry and return routes to every standing anchor', () => {
  const { registry } = BUNDLED_CONTENT;
  const buildings = [...registry.mapAssemblies.values()].filter(
    (assembly) => (assembly.access?.storeys.length ?? 0) > 1,
  );
  expect(buildings.length).toBeGreaterThan(0);
  for (const building of buildings) {
    const alternatives = Math.max(...building.slots.map((slot) => slot.choices.length));
    for (let variant = 0; variant < alternatives; variant++) {
      const definition = {
        ...building,
        slots: building.slots.map((slot) => ({ ...slot, choices: [slot.choices[variant % slot.choices.length]!] })),
      };
      const compiled = compileAssembly(registry, definition, { seed: 1, siteId: 'route_witness' });
      const targets = Object.values(compiled.anchors!).filter((anchor) => anchor.kind === 'standing');
      expect(targets.some((anchor) => anchor.at[1] > compiled.access!.entrance[1])).toBe(true);
      for (const target of targets) {
        expect(
          templateStandingRoute(registry, compiled, compiled.access!.entrance, target.at),
          `${building.id}: entry`,
        ).toBe(true);
        expect(
          templateStandingRoute(registry, compiled, target.at, compiled.access!.entrance),
          `${building.id}: return`,
        ).toBe(true);
      }
    }
  }
});
