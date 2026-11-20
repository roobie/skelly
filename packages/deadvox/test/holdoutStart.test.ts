import { composeLayout } from '@skelly/engine/internal/core/composeLayout.ts';
import { paperMapAt, paperMapBounds } from '@skelly/engine/internal/core/paperMap.ts';
import { expect, it } from 'vitest';
import { startupContent } from './baseRegistry.ts';

// Metres a start keeps from every edge of its sheet; a property of the placement, not a pinned coordinate.
const EDGE_MARGIN_METRES = 64;

const holdout = () => {
  const content = startupContent();
  const scenario = content.registry.scenarios.get('holdout');
  if (scenario?.kind !== 'composedSite') {
    throw new Error('Holdout needs a composed scenario');
  }
  const start = content.registry.starts.get('holdout');
  if (!start) {
    throw new Error('Holdout needs its start row');
  }
  return { registry: content.registry, scenario, start };
};

it.each([11, 73])('the Holdout shelter stands at the centre of the site bounds (seed %s)', (seed) => {
  const { registry, scenario } = holdout();
  const { layout, reservations } = composeLayout(seed, registry, scenario);
  // Buildings and reservations are pushed together, in ask order.
  const index = reservations.findIndex((reservation) => reservation.ask === scenario.start.ask);
  const shelter = layout.buildings[index];
  const { x0, z0, x1, z1 } = scenario.bounds;
  expect(shelter?.position[0]).toBe((x0 + x1) / 2);
  expect(shelter?.position[2]).toBe((z0 + z1) / 2);
});

it.each([11, 73])('the Holdout start lies on the sheet its kit map covers, away from the edges (seed %s)', (seed) => {
  const { registry, scenario, start } = holdout();
  const mapRow = start.kit.find((row) => row.paperMap !== undefined);
  expect(mapRow?.paperMap).toBeDefined();
  const { layout } = composeLayout(seed, registry, scenario);
  const [x, , z] = layout.player.position;
  expect(paperMapAt(x, z)).toEqual(mapRow!.paperMap);
  const sheet = paperMapBounds(mapRow!.paperMap!);
  expect(Math.min(x - sheet.x0, sheet.x1 - x, z - sheet.z0, sheet.z1 - z)).toBeGreaterThanOrEqual(EDGE_MARGIN_METRES);
});
