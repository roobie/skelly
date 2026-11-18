import { buildRegistry } from '@skelly/engine/content';
import type { ContentFile } from '@skelly/engine/internal/core/schema.ts';
import { placeFitting } from '@skelly/engine/internal/core/vehicleBlueprint.ts';
import { contentVehicleBlocks } from '@skelly/engine/internal/core/vehicleShapeSolid.ts';
import { BLOCK_SIZE } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { baseSources } from '../src/product/content.ts';

// Only the vehicle content the fixture's part needs, so this case loads no furniture of its own: a removal defect
// shows here as this case's failure rather than as a base content load error.
const VEHICLE_SOURCES = [
  'vehicles.json',
  'models-items.json',
  'inventory.json',
  'item-wear.json',
  'natural-sounds.json',
  'sounds-impact.json',
];
const sources = baseSources.filter(({ source }) => VEHICLE_SOURCES.some((file) => source.endsWith(`/${file}`)));

it('clears a removed fitting’s cells, leaving what a build without it blocks', () => {
  // Any content part, and a copy stacked clear above it: the copy shares the part's columns, so taking it off moves
  // neither the look's centring nor its lowest point, and only the cells it filled can change.
  const base = buildRegistry(sources).registry;
  const { part } = [...base.vehicleBlueprints.values()][0]!.fittings[0]!;
  const lower = { id: 'lower', part, at: [0, 0, 0] as [number, number, number], supportedBy: [] };
  const boxes = placeFitting(base, lower).collision;
  const height = Math.max(...boxes.map(({ max }) => max[1])) - Math.min(...boxes.map(({ min }) => min[1]));
  const upper = { ...lower, id: 'upper', at: [0, height + 2 * BLOCK_SIZE, 0] as [number, number, number] };
  const fixture: ContentFile = {
    vehicleBlueprints: [
      { id: 'fixture_stack', name: 'Stack', fittings: [lower, upper] },
      { id: 'fixture_single', name: 'Single', fittings: [lower] },
    ],
  };
  const { registry, issues } = buildRegistry([...sources, { source: 'fixture-stack.json', data: fixture }]);
  expect(issues.filter(({ source }) => source === 'fixture-stack.json')).toEqual([]);
  const size: [number, number, number] = [20, 40, 40];
  const cells = (blueprint: string, removed: string[]) =>
    new Set(contentVehicleBlocks(registry, { blueprint, removed, solidFill: 0.4 }, size, BLOCK_SIZE).map(String));
  const whole = cells('fixture_stack', []);
  const stripped = cells('fixture_stack', ['upper']);
  expect(stripped.size).toBeGreaterThan(0);
  expect(stripped).toEqual(cells('fixture_single', []));
  expect(stripped.size).toBeLessThan(whole.size);
  expect([...stripped].every((cell) => whole.has(cell))).toBe(true);
});
