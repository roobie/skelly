import { describe, expect, it } from 'vitest';
import { Chunk } from '../src/core/chunk.ts';
import {
  buildCityPlan,
  cityGridOf,
  perimeterGaps,
  scenarioPlanIssues,
  servicePlacement,
} from '../src/core/cityPlan.ts';
import { CitySite } from '../src/core/citySite.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { CHUNK, toChunk, type Vec3 } from '../src/core/coords.ts';
import { GauntletSite } from '../src/core/gauntlet.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ScenarioDef } from '../src/core/schema.ts';
import type { HordeSpawn, ZombieSpawn } from '../src/core/site.ts';
import { siteGenerationOf, sitePalette, terrainShapeOf } from '../src/core/sitePalette.ts';
import {
  cellsOf,
  compileAssembly,
  compileTemplate,
  footprint,
  kitSlotChoices,
  placedSpawns,
} from '../src/core/templates.ts';
import { generateChunk } from '../src/core/worldgen.ts';
import { startupContent } from './baseRegistry.ts';
import { fixtureScenario, fixtureScenarioSources } from './fixtures/scenario.ts';
import { GAUNTLET_SITE_MS } from './siteTimeouts.ts';

const BUNDLED_CONTENT = startupContent();

const profile = fixtureScenario();
const { registry, issues } = buildRegistry(fixtureScenarioSources(profile));
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}
const scale = makeScale(0.5);
const floor = CHUNK;
const fixtureGrid = cityGridOf(registry, profile.city);
const planned = (pool = fixtureGrid.templates) =>
  buildCityPlan({
    seed: 73,
    registry,
    floor,
    grid: { ...fixtureGrid, templates: pool },
    maxStoreys: 4,
    scenario: profile,
  });
const mod = (value: number, period: number) => ((value % period) + period) % period;

const chunkCells = (plan: ReturnType<typeof planned>): Vec3[] => {
  const cells = new Map<string, Vec3>();
  for (const placement of plan.placements) {
    const [width, depth] = footprint(placement);
    for (let cz = toChunk(placement.origin[2]); cz <= toChunk(placement.origin[2] + depth - 1); cz++) {
      for (
        let cy = toChunk(placement.origin[1]);
        cy <= toChunk(placement.origin[1] + placement.template.size[1] - 1);
        cy++
      ) {
        for (let cx = toChunk(placement.origin[0]); cx <= toChunk(placement.origin[0] + width - 1); cx++) {
          cells.set(`${cx},${cy},${cz}`, [cx, cy, cz]);
        }
      }
    }
  }
  return [...cells.values()];
};

const generated = (reverse: boolean) => {
  const plan = planned();
  const site = new CitySite(73, registry, scale, plan);
  const cells = chunkCells(plan);
  if (reverse) {
    cells.reverse();
  }
  const chunks = new Map<string, Uint16Array>();
  for (const [cx, cy, cz] of cells) {
    const chunk = new Chunk(cx, cy, cz);
    site.stamp(chunk);
    chunks.set(`${cx},${cy},${cz}`, chunk.toArray());
  }
  const columns = new Map(cells.map(([cx, , cz]) => [`${cx},${cz}`, [cx, cz] as const]));
  const furniture = [...columns.values()]
    .flatMap(([cx, cz]) => site.furnitureIn(cx, cz))
    .sort((a, b) => a.spec.pos.join(',').localeCompare(b.spec.pos.join(',')));
  return { chunks, furniture };
};

// Slot choices are enumerated, not rolled: a seeded roll may never pick the style that breaks the rule.
const nativeDefinitions = (id: string, style?: string) => {
  const native = BUNDLED_CONTENT.registry;
  const alternatives = Math.max(
    ...[...native.mapAssemblies.values()].flatMap((candidate) =>
      candidate.slots.map((slot) => kitSlotChoices(native, slot).length),
    ),
  );
  return Array.from({ length: alternatives }, (_, variant) => {
    const selected = {
      ...native,
      mapAssemblies: new Map(
        [...native.mapAssemblies.values()].map((candidate) => [
          candidate.id,
          {
            ...candidate,
            slots: candidate.slots.map(({ pool: _pool, ...slot }) => {
              const choices = kitSlotChoices(native, { ...slot, pool: _pool });
              return { ...slot, choices: [choices[variant % choices.length]!] };
            }),
          },
        ]),
      ),
    };
    return compileAssembly(selected, selected.mapAssemblies.get(id)!, {
      seed: 73,
      siteId: 'facade-course-witness',
      ...(style ? { style } : {}),
    });
  });
};

/** Exterior floor and roof courses of a compiled building, each with the wall block below it. */
const floorCourses = (id: string, template: ReturnType<typeof compileTemplate>, style?: string) => {
  const native = BUNDLED_CONTENT.registry;
  const shellBlocksByPiece = new Map(
    [...native.mapPieces.values()].map((piece) => [
      piece.id,
      new Set(
        Object.values(native.mapStyles.get(style ?? piece.style)!.bindings)
          .filter(({ role }) => role === 'shell')
          .map(({ block }) => native.blockIds.get(block)),
      ),
    ]),
  );
  const assembly = native.mapAssemblies.get(id)!;
  const [sx, sy, sz] = template.size;
  const at = (x: number, y: number, z: number) =>
    x < 0 || x >= sx || y < 0 || y >= sy || z < 0 || z >= sz ? 0 : template.blocks[x + sx * (z + sz * y)]!;
  const solid = (block: number) => native.blocks[block]?.solid === true;
  const slabLayers = new Set([
    ...template.access!.storeys.map((storey) => storey.floor - 1),
    ...assembly.slots.filter((slot) => slot.id.includes('roof')).map((slot) => slot.at[1]),
  ]);
  const courses: [number, number, string][] = [];
  let scanned = 0;
  for (const [x, y, z] of cellsOf(template.size)) {
    if (!slabLayers.has(y)) {
      continue;
    }
    const wall = at(x, y - 1, z);
    const owner = template.provenance?.[x + sx * (z + sz * (y - 1))];
    if (!(shellBlocksByPiece.get(owner?.variant ?? '')?.has(wall) && solid(wall)) || at(x, y - 2, z) !== wall) {
      continue;
    }
    scanned += 1;
    const exposed = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dz]) => !solid(at(x + dx!, y - 1, z + dz!)));
    const slab = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dz]) => solid(at(x + dx!, y, z + dz!)) && at(x + dx!, y, z + dz!) !== wall);
    if (!(exposed && slab && solid(at(x, y, z)))) {
      continue;
    }
    courses.push([at(x, y, z), wall, `${id}: exterior course at ${x},${y},${z}`]);
  }
  return { courses, scanned };
};

describe('one finished city plan', () => {
  it('keeps compiled building floor and roof courses in the exterior wall material', () => {
    const native = BUNDLED_CONTENT.registry;
    const scenario = [...native.scenarios.values()].find((candidate) => candidate.composition)!;
    for (const { id, style } of cityGridOf(native, scenario.city).templates) {
      for (const [variant, template] of nativeDefinitions(id, style).entries()) {
        const { courses, scanned } = floorCourses(id, template, style);
        expect(scanned, `${id}@${style} variant ${variant}: no shell wall was scanned`).toBeGreaterThan(0);
        for (const [actual, wall, message] of courses) {
          expect(actual, `${style} variant ${variant} ${message}`).toBe(wall);
        }
      }
    }
  });
  describe('gauntlet population from scenario content', () => {
    const native = BUNDLED_CONTENT.registry;
    const bundled = [...native.scenarios.values()].find((candidate) => candidate.composition)!;
    const fixture = registry.templates.get('fixture_house')!;
    const solid = native.blocks.find((block) => block.solid)!.id;
    const cityRegistry = {
      ...native,
      templates: new Map([
        ...native.templates,
        [
          fixture.id,
          {
            ...fixture,
            eligibility: { settlementKinds: [bundled.city.settlementKind] },
            palette: { '=': solid, C: solid },
          },
        ],
      ]),
      mapPools: new Map([
        ...native.mapPools,
        [
          bundled.city.pool,
          { id: bundled.city.pool, choices: [{ ref: { kind: 'template' as const, id: fixture.id }, weight: 1 }] },
        ],
      ]),
    };
    const populationOf = (population: Partial<ScenarioDef['population']>) => {
      const site = new GauntletSite({
        seed: 73,
        registry: cityRegistry,
        scale,
        scenario: { ...bundled, population: { ...bundled.population, ...population } },
      });
      const spawns: ZombieSpawn[] = [];
      const hordes: HordeSpawn[] = [];
      for (let cz = toChunk(site.bounds.z0); cz <= toChunk(site.bounds.z1); cz++) {
        for (let cx = toChunk(site.bounds.x0); cx <= toChunk(site.bounds.x1); cx++) {
          spawns.push(...site.zombiesIn(cx, cz));
          hordes.push(...site.hordesIn(cx, cz));
        }
      }
      return { spawns, hordes };
    };

    it(
      'spawns each composed event marker once',
      () => {
        const scenario = structuredClone(bundled);
        const event = scenario.composition!.events![0]!;
        const template = native.templates.get(event.template)!;
        const markerTemplate = {
          ...template,
          id: 'fixture_event_marker',
          palette: { ...template.palette, Z: { spawn: 'shambler', chance: 1 } },
        };
        const testRegistry = {
          ...native,
          templates: new Map([...native.templates, [markerTemplate.id, markerTemplate]]),
        };
        scenario.composition!.events = [{ ...event, template: markerTemplate.id }];
        const site = new GauntletSite({ seed: 73, registry: testRegistry, scale, scenario });
        const markers = placedSpawns(site.plan.composition!.events[0]!);
        const spawns = Array.from({ length: toChunk(site.bounds.x1) - toChunk(site.bounds.x0) + 1 }, (_, column) =>
          // biome-ignore lint/suspicious/noShadow: The nested chunk coordinates are independent axes.
          Array.from({ length: toChunk(site.bounds.z1) - toChunk(site.bounds.z0) + 1 }, (_, row) =>
            site.zombiesIn(toChunk(site.bounds.x0) + column, toChunk(site.bounds.z0) + row),
          ),
        ).flat(2);
        for (const marker of markers) {
          expect(spawns.filter((spawn) => spawn.pos.join(',') === marker.pos.join(','))).toHaveLength(1);
        }
      },
      GAUNTLET_SITE_MS,
    );

    it(
      'supplies ordinary wanderers and hordes even when city buildings have no spawn markers',
      () => {
        const { spawns, hordes } = populationOf({});
        expect(spawns.length).toBeGreaterThan(0);
        expect(hordes.length).toBeGreaterThan(0);
        expect(hordes.every((horde) => horde.members > 0)).toBe(true);
      },
      GAUNTLET_SITE_MS,
    );

    // Zero and two distinguish omitted spawns from distinct configured areas without a redundant one-horde case.
    const hordeCases = [0, 2];
    it(
      'places exactly the horde count the scenario asks for in distinct authored areas',
      () => {
        for (const hordes of hordeCases) {
          const area = bundled.population.hordeAreas![0]!;
          const midpoint = (area.x0 + area.x1) / 2;
          const hordeAreas = [
            { ...area, x1: midpoint },
            { ...area, x0: midpoint },
          ];
          const placed = populationOf({ hordes, hordeAreas }).hordes;
          expect(placed).toHaveLength(hordes);
          expect(new Set(placed.map(({ id }) => id)).size).toBe(hordes);
        }
      },
      hordeCases.length * GAUNTLET_SITE_MS,
    );

    it(
      'adds more stragglers when the scenario asks for extras',
      () => {
        const base = populationOf({ extraStragglers: 0 }).spawns.length;
        expect(populationOf({ extraStragglers: 3 }).spawns.length).toBeGreaterThan(base);
      },
      2 * GAUNTLET_SITE_MS,
    );

    it(
      'leaves no zombies or hordes when settlement pressure and authored markers are both off',
      () => {
        const { spawns, hordes } = populationOf({ settlementPressure: false, authoredMarkers: false });
        expect(spawns).toEqual([]);
        expect(hordes).toEqual([]);
      },
      GAUNTLET_SITE_MS,
    );

    it(
      'rejects more hordes than the city has spawn areas',
      () => {
        expect(() => populationOf({ groupSize: 64, hordes: 16 })).toThrow('.population.hordes');
      },
      GAUNTLET_SITE_MS,
    );
  });

  it('fills paired inner banks while keeping alleys, perimeter gates and the service reserve clear', () => {
    const scenario = fixtureScenario();
    scenario.city = {
      ...scenario.city,
      blockX: 40,
      blockZ: 40,
      rows: 4,
      perimeter: { block: 'fixture_solid', height: 6, thickness: 2 },
    };
    const admitted = buildRegistry(fixtureScenarioSources(scenario));
    expect(admitted.issues).toEqual([]);
    const plan = buildCityPlan({
      seed: 73,
      registry: admitted.registry,
      floor,
      grid: cityGridOf(admitted.registry, scenario.city),
      scenario,
    });
    const normal = plan.placements.filter((placement) => placement !== plan.service);
    const banks = new Set(
      normal
        .filter((placement) => placement.origin[0] > 0 && placement.origin[2] > 0)
        .map((placement) => placement.origin[2]),
    );
    expect(banks.size).toBe(scenario.city.rows);
    const site = new CitySite(73, admitted.registry, scale, plan);
    const alleyZ =
      scenario.city.street +
      scenario.city.pad +
      2 * Math.floor((scenario.city.blockZ - 2 * scenario.city.pad - scenario.city.street) / scenario.city.rows);
    expect(site.surface.top(scenario.city.street + scenario.city.pad + 2, alleyZ)).toBe(
      sitePalette(admitted.registry).paving,
    );
    expect(plan.structures.length).toBeGreaterThan(0);
    const occupied = (point: Vec3) =>
      plan.structures.some(({ min, max }) => point.every((value, axis) => value >= min[axis]! && value < max[axis]!));
    for (const z of [plan.bounds.z0 - 1, plan.bounds.z1]) {
      expect(occupied([plan.spawn[0], floor + 1, z])).toBe(true);
      expect(occupied([-scenario.city.street, floor + 1, z])).toBe(true);
    }
    const [width, depth] = footprint(plan.service!);
    expect(
      normal.every((placement) => {
        const [w, d] = footprint(placement);
        return (
          placement.origin[0] + w <= plan.service!.origin[0] ||
          placement.origin[0] >= plan.service!.origin[0] + width ||
          placement.origin[2] + d <= plan.service!.origin[2] ||
          placement.origin[2] >= plan.service!.origin[2] + depth
        );
      }),
    ).toBe(true);
  });

  it.each([
    { blocksX: 1, blocksZ: 1, ring: false },
    { blocksX: 2, blocksZ: 1, ring: true },
    { blocksX: 1, blocksZ: 3, ring: false },
    { blocksX: 3, blocksZ: 2, ring: true },
  ])(
    'walls the whole loop with no street gap for $blocksX x $blocksZ cells, ring $ring',
    ({ blocksX, blocksZ, ring }) => {
      const scenario = fixtureScenario();
      scenario.city = {
        ...scenario.city,
        blocksX,
        blocksZ,
        blockX: 40,
        blockZ: 40,
        rows: 4,
        perimeter: { block: 'fixture_solid', height: 6, thickness: 2 },
        ...(ring ? { ring: { pool: 'fixture_pool', setback: 6 } } : {}),
      };
      const admitted = buildRegistry(fixtureScenarioSources(scenario));
      expect(admitted.issues).toEqual([]);
      const plan = buildCityPlan({
        seed: 73,
        registry: admitted.registry,
        floor,
        grid: cityGridOf(admitted.registry, scenario.city),
        scenario,
      });
      expect(perimeterGaps(plan.structures, plan.bounds, floor, scenario.city.perimeter!.height)).toEqual([]);
    },
  );

  it('stands enclosure dressing above the surface without carving pits in its footprint', () => {
    const scenario = fixtureScenario();
    scenario.city.perimeter = {
      block: 'fixture_solid',
      height: 6,
      thickness: 2,
      lining: { assembly: 'fixture_lining', pitch: 6 },
      gate: { assembly: 'fixture_gate' },
    };
    const sources = fixtureScenarioSources(scenario);
    sources.push({
      source: 'enclosure-fixture.json',
      data: {
        templates: ['fixture_lining', 'fixture_gate'].map((id) => ({
          id,
          size: [4, 2, 2],
          lootContext: registry.templates.get('fixture_house')!.lootContext,
          palette: { '.': 'air', '=': 'fixture_solid' },
          layers: [
            ['....', '===='],
            ['....', '===='],
          ],
        })),
      },
    });
    const admitted = buildRegistry(sources);
    expect(admitted.issues).toEqual([]);
    const plan = buildCityPlan({
      seed: 73,
      registry: admitted.registry,
      floor,
      grid: cityGridOf(admitted.registry, scenario.city),
      scenario,
    });
    const site = new CitySite(73, admitted.registry, scale, plan);
    const dressings = plan.placements.filter(({ template }) =>
      ['fixture_lining', 'fixture_gate'].includes(template.id),
    );
    expect(dressings.some(({ template }) => template.id === 'fixture_lining')).toBe(true);
    expect(dressings.some(({ template }) => template.id === 'fixture_gate')).toBe(true);
    const solid = admitted.registry.blockIds.get('fixture_solid')!;
    const chunks = new Map<string, Chunk>();
    for (const placement of dressings) {
      const [width, depth] = footprint(placement);
      const [x0, y0, z0] = placement.origin;
      for (let z = z0; z < z0 + depth; z++) {
        for (let x = x0; x < x0 + width; x++) {
          const ground = site.surface.height(x, z, floor + 1);
          expect(y0 + (placement.template.groundLayer ?? 0)).toBe(ground + 1);
          const cell: Vec3 = [toChunk(x), toChunk(ground), toChunk(z)];
          const key = cell.join(',');
          let chunk = chunks.get(key);
          if (!chunk) {
            chunk = generateChunk(
              {
                seed: 73,
                shape: terrainShapeOf(registry),
                scale,
                surface: site.surface,
                blocks: { grass: solid, dirt: solid, rock: solid, sand: solid },
              },
              cell,
            );
            site.stamp(chunk);
            chunks.set(key, chunk);
          }
          expect(admitted.registry.blocks[chunk.get(mod(x, CHUNK), mod(ground, CHUNK), mod(z, CHUNK))]!.solid).toBe(
            true,
          );
        }
      }
    }
  });

  it('reports a gap when a stretch of the north wall is missing', () => {
    const scenario = fixtureScenario();
    scenario.city = {
      ...scenario.city,
      blockX: 40,
      blockZ: 40,
      rows: 4,
      perimeter: { block: 'fixture_solid', height: 6, thickness: 2 },
    };
    const admitted = buildRegistry(fixtureScenarioSources(scenario));
    expect(admitted.issues).toEqual([]);
    const plan = buildCityPlan({
      seed: 73,
      registry: admitted.registry,
      floor,
      grid: cityGridOf(admitted.registry, scenario.city),
      scenario,
    });
    const { height } = scenario.city.perimeter!;
    const probe = plan.bounds.z0 - 1;
    const covers = ({ min, max }: (typeof plan.structures)[number]) => min[2] <= probe && probe < max[2];
    expect(perimeterGaps(plan.structures, plan.bounds, floor, height)).toEqual([]);
    const cut = plan.structures.filter(
      (box) => !(covers(box) && box.min[0] <= plan.spawn[0] && plan.spawn[0] < box.max[0]),
    );
    expect(cut.length).toBeLessThan(plan.structures.length);
    expect(perimeterGaps(cut, plan.bounds, floor, height).join('\n')).toContain('north side is open');
  });

  it('fails validation when the edge ring names a pool that does not exist', () => {
    const scenario = fixtureScenario();
    scenario.city = {
      ...scenario.city,
      perimeter: { block: 'fixture_solid', height: 6, thickness: 2 },
      ring: { pool: 'missing_pool', setback: 6 },
    };
    const { registry: admitted } = buildRegistry(fixtureScenarioSources(fixtureScenario()));
    expect(scenarioPlanIssues(admitted, scenario).map(([path]) => path)).toContain('.city.ring.pool');
  });

  it(
    'keeps every gauntlet spawn inside the walled area and clear of the wall',
    () => {
      const native = BUNDLED_CONTENT.registry;
      const scenario = [...native.scenarios.values()].find((candidate) => candidate.composition)!;
      const site = new GauntletSite({ seed: 73, registry: native, scale, scenario });
      const spawns: { pos: Vec3 }[] = [];
      for (let cz = toChunk(site.bounds.z0) - 2; cz <= toChunk(site.bounds.z1) + 2; cz++) {
        for (let cx = toChunk(site.bounds.x0) - 2; cx <= toChunk(site.bounds.x1) + 2; cx++) {
          spawns.push(...site.zombiesIn(cx, cz), ...site.hordesIn(cx, cz));
        }
      }
      expect(spawns.length).toBeGreaterThan(0);
      const inWall = ([x, y, z]: Vec3) =>
        site.plan.structures.some(
          ({ min, max }) => x >= min[0] && x < max[0] && y >= min[1] && y < max[1] && z >= min[2] && z < max[2],
        );
      for (const { pos } of spawns) {
        expect(pos[0]).toBeGreaterThanOrEqual(site.bounds.x0);
        expect(pos[0]).toBeLessThan(site.bounds.x1);
        expect(pos[2]).toBeGreaterThanOrEqual(site.bounds.z0);
        expect(pos[2]).toBeLessThan(site.bounds.z1);
        expect(inWall(pos)).toBe(false);
      }
    },
    GAUNTLET_SITE_MS,
  );

  it('reserves each candidate/turn class inside the apron and keeps ordinary rows out of street space', () => {
    const plan = planned();
    expect(plan.candidates.length).toBeGreaterThan(0);
    expect(plan.candidates.some(([i, j]) => i === 0 && j === 0)).toBe(false);
    const service = compileTemplate(registry, registry.templates.get(profile.serviceTemplate)!);
    const grid = fixtureGrid;
    const pitchX = grid.street + grid.blockX;
    const pitchZ = grid.street + grid.blockZ;
    for (const cell of plan.candidates) {
      for (const turn of [0, 1, 2, 3] as const) {
        const placement = servicePlacement({ template: service, floor, grid, cell, turn });
        const [width, depth] = footprint(placement);
        expect(placement.origin[0]).toBeGreaterThanOrEqual(cell[0] * pitchX + grid.street + grid.pad);
        expect(placement.origin[0] + width).toBeLessThanOrEqual((cell[0] + 1) * pitchX - grid.pad);
        expect(placement.origin[2] + depth).toBeLessThanOrEqual((cell[1] + 1) * pitchZ - grid.pad);
        expect(placement.origin[1] + service.groundLayer!).toBe(floor);
      }
    }
    expect(plan.service).toBeDefined();
    expect(plan.portal).toBeDefined();
    expect(plan.portal!.envelope.min[1]).toBeLessThanOrEqual(plan.portal!.lower[1] - 1);
    expect(plan.portal!.envelope.max[1]).toBeGreaterThan(plan.portal!.upper[1]);
    expect(plan.placements.length).toBeGreaterThan(1);
    for (const placement of plan.placements) {
      if (placement !== plan.service) {
        expect(fixtureGrid.templates.some(({ id }) => id === placement.template.id)).toBe(true);
      }
      const [width, depth] = footprint(placement);
      expect(mod(placement.origin[0], pitchX)).toBeGreaterThanOrEqual(grid.street + grid.pad);
      expect(mod(placement.origin[0], pitchX) + width).toBeLessThanOrEqual(pitchX - grid.pad);
      expect(mod(placement.origin[2], pitchZ)).toBeGreaterThanOrEqual(grid.street + grid.pad);
      expect(mod(placement.origin[2], pitchZ) + depth).toBeLessThanOrEqual(pitchZ - grid.pad);
    }
    expect(mod(plan.spawn[0], pitchX)).toBeLessThan(grid.street);
    expect(mod(plan.spawn[2], pitchZ)).toBeLessThan(grid.street);
    const site = new CitySite(73, registry, scale, plan);
    expect(site.surface.height(plan.spawn[0], plan.spawn[2], floor + 9)).toBe(floor);
    expect(site.surface.top(plan.spawn[0], plan.spawn[2])).toBe(sitePalette(registry).paving);
  });

  it('paves its streets with the block the site palette names, not a fixed block id', () => {
    const entry = siteGenerationOf(registry);
    const other = [...registry.blockIds.keys()].find((name) => name !== entry.palette.paving)!;
    const repaved = {
      ...registry,
      siteGeneration: new Map(registry.siteGeneration).set(CORE_CONTENT_IDS.authoredSite, {
        ...entry,
        palette: { ...entry.palette, paving: other },
      }),
    };
    const site = new CitySite(73, repaved, scale, planned());
    expect(site.surface.top(site.plan.spawn[0], site.plan.spawn[2])).toBe(registry.blockIds.get(other));
  });

  it('never stacks a template past its authored maxStoreys while an unlimited one still stacks', () => {
    const limited = registry.templates.get('fixture_house')!;
    const capped = {
      ...registry,
      templates: new Map(registry.templates).set(limited.id, { ...limited, maxStoreys: 1 }),
    };
    const plan = buildCityPlan({
      seed: 73,
      registry: capped,
      floor,
      grid: {
        ...fixtureGrid,
        blocksX: 3,
        blocksZ: 3,
        templates: [
          { id: 'fixture_house', weight: 1 },
          { id: 'fixture_small_house', weight: 1 },
        ],
      },
      maxStoreys: 4,
    });
    const heights = (id: string) =>
      plan.placements
        .filter((placement) => placement.template.id.split('×')[0] === id)
        .map((placement) => placement.template.size[1]);
    const [, unstacked] = limited.size;
    expect(heights('fixture_house').length).toBeGreaterThan(0);
    expect(heights('fixture_house').every((height) => height === unstacked)).toBe(true);
    expect(heights('fixture_small_house').some((height) => height > unstacked)).toBe(true);
  });

  it('chooses the service block/turn independently of incidental template selection', () => {
    const forPool = (templates: typeof fixtureGrid.templates) =>
      buildCityPlan({ seed: 74, registry, floor, grid: { ...fixtureGrid, templates }, scenario: profile });
    const first = forPool(fixtureGrid.templates);
    const varied = forPool([{ id: 'fixture_small_house', weight: 1 }]);
    expect(varied.placements.some((placement) => placement.template.id === 'fixture_small_house')).toBe(true);
    expect(varied.serviceBlock).toEqual(first.serviceBlock);
    expect(varied.service?.turn).toEqual(first.service?.turn);
    expect(varied.portal).toEqual(first.portal);
    expect(Object.isFrozen(first.placements)).toBe(true);
    expect(first.placements.every((placement) => Object.isFrozen(placement.origin))).toBe(true);
  });

  it('stamps all vertical and horizontal chunks plus furniture identically in reverse request order', () => {
    const first = generated(false);
    const reversed = generated(true);
    expect(first.chunks.size).toBeGreaterThan(1);
    expect([...first.chunks.values()].some((blocks) => blocks.some((block) => block !== 0))).toBe(true);
    expect(reversed.chunks.size).toBe(first.chunks.size);
    for (const [key, blocks] of first.chunks) {
      expect(Buffer.from(reversed.chunks.get(key)!.buffer).equals(Buffer.from(blocks.buffer)), key).toBe(true);
    }
    expect(first.furniture.length).toBeGreaterThan(0);
    expect(reversed.furniture).toEqual(first.furniture);
  });
});
