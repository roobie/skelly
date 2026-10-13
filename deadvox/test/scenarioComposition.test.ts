import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildCityPlan, scenarioPlanIssues, servicePlacement } from '../src/core/cityPlan.ts';
import { CitySite } from '../src/core/citySite.ts';
import { worldSolid } from '../src/core/collision.ts';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { toChunk, type Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { composeScenario } from '../src/core/scenarioComposition.ts';
import { STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from '../src/core/stairFlight.ts';
import { compileTemplate, type Placement, placedPieces } from '../src/core/templates.ts';
import { World } from '../src/core/world.ts';
import { generateChunk, terrainBlockIds } from '../src/core/worldgen.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { fixtureScenario, fixtureScenarioSources, fixtureService } from './fixtures/scenario.ts';

const fixture = () => {
  const profile = fixtureScenario();
  profile.city.street = 8;
  const service = fixtureService();
  service.palette.C = { furniture: 'fixture_crate' };
  service.layers[1]![2] = '..C.....==';
  profile.composition = {
    fixedLoot: [
      {
        at: [2, 1, 2],
        items: [
          { item: 'fixture_token', count: 3 },
          { item: 'fixture_token', placement: 'surface' },
        ],
      },
    ],
    leads: ['fixture_note_a', 'fixture_note_b'],
    landmarks: ['fixture_landmark_a', 'fixture_landmark_b'],
    incidentalTemplates: ['fixture_small_house'],
    objective: [2, 1, 2],
    objectiveFace: [2, 1, 4],
    retreat: [2, 7, 2],
    resources: [{ at: [2, 1, 2], standing: [2, 1, 4] }],
    storeys: [{ id: 'lower', standing: [2, 1, 4] }],
    descents: [{ ladder: [4, 1, 3], lower: [3, 1, 4], upper: [3, 7, 4] }],
  };
  const sources = fixtureScenarioSources(profile, service);
  sources.push({
    source: 'composition-fixture.json',
    data: {
      furniture: [
        {
          id: 'fixture_note',
          name: 'Fixture note',
          size: [1, 1, 1],
          color: '#ffffff',
          solid: false,
          readable: { title: 'Fixture lead', text: 'An independent fixture lead.' },
        },
      ],
      templates: ['fixture_note_a', 'fixture_note_b', 'fixture_landmark_a', 'fixture_landmark_b'].map((id) => ({
        id,
        size: [1, 2, 1],
        palette: { '=': 'fixture_solid', N: { furniture: 'fixture_note' } },
        layers: [['='], ['N']],
      })),
    },
  } satisfies ContentSource);
  const built = buildRegistry(sources);
  if (built.issues.length > 0) {
    throw new Error(JSON.stringify(built.issues));
  }
  return { profile, registry: built.registry };
};

describe('authored scenario composition', () => {
  it('places fixed container and surface items at the turned anchor independent of column requests', () => {
    const { profile, registry } = fixture();
    const base = buildCityPlan({ seed: 7, registry, floor: 32, grid: profile.city, scenario: profile });
    const compiled = compileTemplate(registry, registry.templates.get(profile.serviceTemplate)!);
    for (const turn of [0, 1, 2, 3] as const) {
      const service = servicePlacement({ template: compiled, floor: 32, grid: profile.city, cell: [-1, 0], turn });
      const composition = composeScenario(registry, profile, service, 32)!;
      const site = new CitySite(7, registry, makeScale(0.5), {
        ...base,
        service,
        composition,
        placements: [service, ...composition.leads, ...composition.landmarks],
      });
      const anchor = placedPieces(service).find((piece) => piece.furniture === 'fixture_crate')!.pos;
      const read = () =>
        site
          .furnitureIn(toChunk(anchor[0]), toChunk(anchor[2]))
          .find((spawn) => spawn.spec.pos.join(',') === anchor.join(','))!;
      const before = read();
      expect(before).toBeDefined();
      expect(
        before.loot.filter((item) => item.type === 'fixture_token').reduce((sum, item) => sum + item.count, 0),
      ).toBeGreaterThanOrEqual(3);
      expect(before.surfaceLoot?.map((item) => item.type)).toEqual(['fixture_token']);
      site.furnitureIn(90, -90);
      expect(read()).toEqual(before);
      expect(composition.resources[0]!.at).toEqual(anchor);
      expect(Object.isFrozen(composition.descents[0]!.lower)).toBe(true);
      expect(site.authoredPlacements).toBe(site.placements);
    }
  });

  it('rejects dangling resource, unreadable public lead and out-of-block landmark metadata', () => {
    const { profile, registry } = fixture();
    profile.composition!.resources[0]!.at = [0, 0, 0];
    profile.composition!.leads[0] = 'fixture_small_house';
    profile.composition!.landmarks[0] = profile.serviceTemplate;
    const issues = scenarioPlanIssues(registry, profile);
    expect(issues.some(([path]) => path === '.composition.resources[0].at')).toBe(true);
    expect(issues.some(([path]) => path === '.composition.leads[0]')).toBe(true);
    expect(issues.some(([path]) => path === '.composition.landmarks[0]')).toBe(true);
  });

  it('keeps public leads at separate locations and destination landmarks in the finished plan', () => {
    const { profile, registry } = fixture();
    const plan = buildCityPlan({ seed: 8, registry, floor: 32, grid: profile.city, scenario: profile });
    const { leads, landmarks } = plan.composition!;
    expect(leads[0]!.origin).not.toEqual(leads[1]!.origin);
    for (const placement of [...leads, ...landmarks]) {
      expect(plan.placements).toContain(placement);
    }
    const benchmark = buildCityPlan({ seed: 8, registry, floor: 32, grid: profile.city });
    expect(new CitySite(8, registry, makeScale(0.5), benchmark).authoredPlacements).toEqual([]);
  });
});

function* envelope([x, feet, z]: Readonly<Vec3>): Generator<Vec3> {
  for (let y = Math.floor(feet) - 1; y < Math.ceil(feet + STAIR_BODY_HEIGHT); y++) {
    for (let bz = Math.floor(z - STAIR_BODY_HALF_WIDTH); bz < Math.ceil(z + STAIR_BODY_HALF_WIDTH); bz++) {
      for (let bx = Math.floor(x - STAIR_BODY_HALF_WIDTH); bx < Math.ceil(x + STAIR_BODY_HALF_WIDTH); bx++) {
        yield [bx, y, bz];
      }
    }
  }
}

it('samples shipped resource and objective standing envelopes against real composed chunks and furniture', () => {
  const { registry } = BUNDLED_CONTENT;
  const profile = [...registry.scenarios.values()].find((scenario) => scenario.composition)!;
  expect(profile).toBeDefined();
  const scale = makeScale(0.5);
  const plan = buildCityPlan({ seed: 9, registry, floor: 64, grid: profile.city, scenario: profile });
  const site = new CitySite(9, registry, scale, plan);
  const world = new World();
  const entities = new BlockEntities(registry);
  const loaded = new Set<string>();
  const terrain = {
    seed: 9,
    scale,
    blocks: terrainBlockIds((id) => registry.blockIds.get(id)!),
    surface: site.surface,
    stamp: (chunk: Parameters<CitySite['stamp']>[0]) => site.stamp(chunk),
  };
  const load = (x: number, y: number, z: number) => {
    const cell: Vec3 = [toChunk(x), toChunk(y), toChunk(z)];
    const key = cell.join(',');
    if (loaded.has(key)) {
      return;
    }
    loaded.add(key);
    const chunk = generateChunk(terrain, cell);
    site.stamp(chunk);
    world.addChunk(chunk);
  };
  const columns = new Set<string>();
  const points = [
    plan.spawn,
    ...plan.composition!.resources.map((resource) => resource.standing),
    plan.composition!.objectiveFace,
    plan.composition!.retreat,
  ];
  for (const point of points) {
    for (const [x, y, z] of envelope(point)) {
      load(x, y, z);
      const key = `${toChunk(x)},${toChunk(z)}`;
      if (!columns.has(key)) {
        columns.add(key);
        for (const spawn of site.furnitureIn(toChunk(x), toChunk(z))) {
          entities.add(spawn.spec);
        }
      }
    }
  }
  const solid = worldSolid(world, registry, entities);
  expect(loaded.size).toBeGreaterThan(1);
  for (const point of points) {
    const cells = [...envelope(point)];
    expect(
      cells.filter((cell) => cell[1] < point[1]).some((cell) => solid(...cell)),
      JSON.stringify(point),
    ).toBe(true);
    const body = cells.filter((cell) => cell[1] >= point[1]);
    expect(body.length).toBeGreaterThan(0);
    for (const cell of body) {
      expect(solid(...cell), JSON.stringify({ point, cell })).toBe(false);
    }
  }
  expect(
    site.placements.some((placement: Placement) =>
      profile.composition!.incidentalTemplates.includes(placement.template.id),
    ),
  ).toBe(true);
});
