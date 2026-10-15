import { describe, expect, it } from 'vitest';
import { compileJsonnetFile } from '../../tools/jsonnet/index.mjs';
import { buildCityPlan, scenarioPlanIssues } from '../src/core/cityPlan.ts';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { ownershipCell } from '../src/core/templateOwnership.ts';
import { type CompiledTemplate, compileAssembly, type PlacedPiece, placedPoint } from '../src/core/templates.ts';
import { buildBundledContent } from '../src/game/bundledContent.ts';
import { fixtureScenario } from './fixtures/scenario.ts';

const BUNDLED_CONTENT = buildBundledContent();

it('resolves one repeatable variant per slot and varies city assemblies across buildings and seeds', () => {
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
  const plan = (seed: number) => buildCityPlan({ seed, registry, floor: 0, grid });
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
  const selections = Array.from({ length: 8 }, (_, seed) => {
    const first = plan(seed);
    const selected = variants(first);
    expect(variants(plan(seed))).toEqual(selected);
    expect(first.placements.length).toBeGreaterThan(1);
    expect(first.placements.every((placement) => placement.template.id === 'fixture_route')).toBe(true);
    return selected;
  });
  expect(new Set(selections.flat())).toEqual(new Set(['room_a', 'room_b']));
  expect(selections.some((selected) => new Set(selected).size > 1)).toBe(true);
});

it('aligns the authored ground course with the city surface while keeping cellar floors below it', () => {
  const data = JSON.parse(compileJsonnetFile('deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;
  const building = data.mapAssemblies![0]!;
  building.size[1] *= 2;
  data.mapPieces!.push({ ...data.mapPieces![0]!, id: 'street_room', ports: [] });
  building.slots.push({
    ...building.slots[0]!,
    id: 'street_room',
    at: [0, 5, 0],
    choices: [{ ref: { kind: 'piece', id: 'street_room' }, weight: 1 }],
  });
  building.access = {
    ground: 'street',
    entrance: [1, 6, 2],
    storeys: [
      { id: 'cellar', floor: 1 },
      { id: 'street', floor: 6 },
    ],
    stairs: [],
  };
  data.mapSites = [];
  const { registry, issues } = buildRegistry([{ source: 'fixture-city-cellar.json', data }]);
  expect(issues).toEqual([]);
  const floor = 20;
  const plan = buildCityPlan({
    seed: 1,
    registry,
    floor,
    grid: {
      street: 4,
      blockX: 14,
      blockZ: 12,
      pad: 2,
      gap: 2,
      blend: 2,
      blocksX: 1,
      blocksZ: 1,
      templates: [building.id],
    },
  });
  expect(plan.placements.length).toBeGreaterThan(0);
  for (const placement of plan.placements) {
    expect(placedPoint(placement, placement.template.access!.entrance)[1]).toBe(floor + 1);
    const cellar = placement.template.access!.storeys.find((storey) => storey.id === 'cellar')!;
    expect(placedPoint(placement, [1, cellar.floor, 2])[1]).toBeLessThan(floor);
  }
});

it('rejects ambiguous city pool identities instead of choosing a template or assembly namespace', () => {
  const data = JSON.parse(compileJsonnetFile('deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;
  data.templates = [
    {
      id: 'fixture_route',
      size: [1, 1, 1],
      palette: { '.': 'air' },
      layers: [['.']],
      lootContext: data.mapAssemblies![0]!.lootContext,
    },
  ];
  const { registry, issues } = buildRegistry([{ source: 'fixture-city-kits.json', data }]);
  expect(issues).toEqual([]);
  const scenario = fixtureScenario();
  scenario.city.templates = ['fixture_route'];
  expect(scenarioPlanIssues(registry, scenario)).toContainEqual([
    '.city.templates',
    'ambiguous template and assembly "fixture_route"',
  ]);
});

const insideKitPlane = (compiled: CompiledTemplate, x: number, z: number, y: number): boolean =>
  x >= 0 && z >= 0 && y >= 0 && x < compiled.size[0] && z < compiled.size[2] && y < compiled.size[1];

/** Floods a wall plane from the given cells and returns the bounding box, in cells. */
const floodOpening = (
  seed: readonly (readonly [number, number])[],
  solid: (y: number, along: number) => boolean,
): { across: number; height: number } => {
  const pending: [number, number][] = seed.map(([y, along]) => [y, along]);
  const seen = new Set<string>();
  let minAlong = Number.POSITIVE_INFINITY;
  let maxAlong = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  while (pending.length > 0) {
    const [y, along] = pending.pop()!;
    const key = `${y},${along}`;
    if (seen.has(key) || solid(y, along)) {
      continue;
    }
    seen.add(key);
    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    pending.push([y + 1, along], [y - 1, along], [y, along + 1], [y, along - 1]);
  }
  return { across: maxAlong - minAlong + 1, height: maxY - minY + 1 };
};

const doorOpening = (registry: Registry, compiled: CompiledTemplate, piece: PlacedPiece) => {
  const acrossX = piece.facing === 'e' || piece.facing === 'w';
  const [px, py, pz] = piece.pos;
  const [sx, sy, sz] = piece.size;
  const plane = acrossX ? px : pz;
  const alongStart = acrossX ? pz : px;
  const alongLength = acrossX ? sz : sx;
  const solid = (y: number, along: number): boolean => {
    const x = acrossX ? plane : along;
    const z = acrossX ? along : plane;
    return (
      !insideKitPlane(compiled, x, z, y) ||
      registry.blocks[compiled.blocks[ownershipCell(compiled.size, [x, y, z])]!]?.solid === true
    );
  };
  const seed: [number, number][] = [];
  for (let y = py; y < py + sy; y++) {
    for (let along = alongStart; along < alongStart + alongLength; along++) {
      seed.push([y, along]);
    }
  }
  return floodOpening(seed, solid);
};

describe('gauntlet door openings', () => {
  it('places every wall door in an opening that matches the door size', () => {
    const { registry } = BUNDLED_CONTENT;
    const assemblies = [...registry.mapAssemblies.values()].filter((assembly) => assembly.id.startsWith('gauntlet'));
    expect(assemblies.length).toBeGreaterThan(0);
    let doors = 0;
    for (const assembly of assemblies) {
      const compiled = compileAssembly(registry, assembly, { seed: 1, siteId: `door-openings:${assembly.id}` });
      for (const piece of compiled.pieces) {
        const def = registry.furniture.get(piece.furniture);
        // A hatch opens through the space above and below it, not across a wall.
        if (!def?.door || def.shape || def.door.hatch) {
          continue;
        }
        doors += 1;
        const [width, height, depth] = piece.size;
        const acrossX = piece.facing === 'e' || piece.facing === 'w';
        const opening = doorOpening(registry, compiled, piece);
        const label = `${assembly.id} ${piece.furniture} at ${piece.pos.join(',')}`;
        expect(opening.across, `${label} opening width`).toBe(acrossX ? depth : width);
        expect(opening.height, `${label} opening height`).toBe(height);
      }
    }
    expect(doors).toBeGreaterThan(0);
  });
});
