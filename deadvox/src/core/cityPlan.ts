import {
  cityLotIssues,
  cityLotQuotaIssues,
  lotRect,
  type PlannedLot,
  placeCityLots,
  rectsOverlap,
} from './cityLots.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { hash3, pickWeighted, Rng } from './random.ts';
import { BLOCK_SIZE } from './scale.ts';
import { composeScenario, type ScenarioComposition, scenarioCompositionIssues } from './scenarioComposition.ts';
import { portalLadderPoint, scenarioPortalIssues } from './scenarioPortal.ts';
import { scenarioStartIssues, startTemplate } from './scenarioStart.ts';
import type { CityBenchmarkDef, MapPoolDef, ScenarioDef } from './schema.ts';
import { admittedChoices, cityRowDepth, eligibilityExclusion } from './settlementPools.ts';
import type { Rect } from './site.ts';
import { freezeSnapshot } from './snapshotData.ts';
import { STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from './stairFlight.ts';
import type { BlockBox } from './structure.ts';
import {
  compileAssembly,
  compileTemplate,
  footprint,
  type Placement,
  placedPoint,
  stackTemplate,
  type Turn,
  templateResolves,
} from './templates.ts';

interface PoolRef {
  readonly id: string;
  readonly style?: string | undefined;
}
type PoolChoice = Readonly<PoolRef & { weight: number; atLeast?: number; atMost?: number }>;
const rowKey = ({ id, style }: PoolRef): string => `${id}@${style ?? ''}`;
export type CityGrid = Omit<ScenarioDef['city'], 'pool' | 'streetProps' | 'ring' | 'settlementKind'> & {
  readonly pool?: string | undefined;
  readonly settlementKind?: string | undefined;
  readonly templates: readonly PoolChoice[];
  readonly streetProps?: readonly string[] | undefined;
  readonly ring?: Readonly<{ pool: string; setback: number; templates: readonly PoolChoice[] }> | undefined;
};
type CityShape = Pick<
  ScenarioDef['city'],
  'blocksX' | 'blocksZ' | 'street' | 'blockX' | 'blockZ' | 'pad' | 'rows' | 'perimeter' | 'bounds'
> & { readonly ring?: Readonly<{ setback: number }> | undefined };
type Perimeter = NonNullable<ScenarioDef['city']['perimeter']>;
type Cell = readonly [number, number];
interface Portal {
  readonly upper: Readonly<Vec3>;
  readonly lower: Readonly<Vec3>;
  readonly envelope: { readonly min: Readonly<Vec3>; readonly max: Readonly<Vec3> };
}
export interface CityPlan {
  readonly grid: Readonly<CityGrid>;
  readonly floor: number;
  /** Everything the wall encloses. */
  readonly bounds: Rect;
  /** The street grid inside `bounds`, without the edge ring. */
  readonly core: Rect;
  readonly placements: readonly Placement[];
  readonly lots?: readonly PlannedLot[];
  readonly structures: readonly BlockBox[];
  readonly service: Placement | undefined;
  readonly serviceBlock: Cell | undefined;
  readonly candidates: readonly Cell[];
  readonly spawn: Readonly<Vec3>;
  readonly portal: Portal | undefined;
  readonly composition: ScenarioComposition | undefined;
}

export const benchmarkCityGrid = (registry: Registry): CityGrid => {
  const entries = [...registry.cityBenchmarks.values()];
  if (entries.length !== 1) {
    throw new Error('The stress-test city needs exactly one city benchmark definition');
  }
  return benchmarkGridOf(registry, entries[0]!);
};

const benchmarkGridOf = (registry: Registry, benchmark: CityBenchmarkDef): CityGrid => {
  const { id: _id, reachMetres, pool, ...geometry } = benchmark;
  const reach = reachMetres / BLOCK_SIZE;
  return {
    ...geometry,
    blocksX: Math.ceil(reach / (geometry.street + geometry.blockX)),
    blocksZ: Math.ceil(reach / (geometry.street + geometry.blockZ)),
    pool,
    templates: choicesOf(
      admittedChoices(registry, pool, geometry.settlementKind, {
        along: geometry.blockX - 2 * geometry.pad,
        depth: cityRowDepth(geometry),
      }),
    ),
  };
};

/** The street grid alone: every cell's street and block, out to the street along each edge. */
const cityCore = (grid: CityShape): Rect => {
  const pitchX = grid.street + grid.blockX;
  const pitchZ = grid.street + grid.blockZ;
  return {
    x0: Math.max(-grid.blocksX * pitchX, grid.bounds?.x0 ?? Number.NEGATIVE_INFINITY),
    z0: Math.max(-grid.blocksZ * pitchZ, grid.bounds?.z0 ?? Number.NEGATIVE_INFINITY),
    x1: Math.min(grid.blocksX * pitchX + grid.street, grid.bounds?.x1 ?? Number.POSITIVE_INFINITY),
    z1: Math.min(grid.blocksZ * pitchZ + grid.street, grid.bounds?.z1 ?? Number.POSITIVE_INFINITY),
  };
};

const cityBounds = (grid: CityShape): Rect => {
  if (grid.bounds) {
    return { ...grid.bounds };
  }
  const core = cityCore(grid);
  const grow = grid.ring ? cityRowDepth(grid) + grid.ring.setback : 0;
  return { x0: core.x0 - grow, z0: core.z0 - grow, x1: core.x1 + grow, z1: core.z1 + grow };
};

/** The wall as boxes: full-length west and east, and north and south between them, with no gap for the street. */
const cityPerimeter = (registry: Registry, perimeter: Perimeter, bounds: Rect, floor: number): BlockBox[] => {
  const { height, thickness, block, wire } = perimeter;
  const structures: BlockBox[] = [];
  const top = floor + height + 1;
  const walls: [Vec3, Vec3][] = [
    [
      [bounds.x0 - thickness, floor - thickness, bounds.z0 - thickness],
      [bounds.x0, top, bounds.z1 + thickness],
    ],
    [
      [bounds.x1, floor - thickness, bounds.z0 - thickness],
      [bounds.x1 + thickness, top, bounds.z1 + thickness],
    ],
    [
      [bounds.x0, floor - thickness, bounds.z0 - thickness],
      [bounds.x1, top, bounds.z0],
    ],
    [
      [bounds.x0, floor - thickness, bounds.z1],
      [bounds.x1, top, bounds.z1 + thickness],
    ],
  ];
  for (const [min, max] of walls) {
    structures.push({ min, max, block: registry.blockIds.get(block)! });
    if (wire) {
      structures.push({
        min: [min[0], top, min[2]],
        max: [max[0], top + wire.height, max[2]],
        block: registry.blockIds.get(wire.block)!,
      });
    }
  }
  return structures;
};

/** Spans of each side of `bounds` the wall leaves open somewhere below its full height. */
export const perimeterGaps = (
  structures: readonly BlockBox[],
  bounds: Rect,
  floor: number,
  height: number,
): string[] => {
  const sides = [
    { name: 'west', normal: 0, probe: bounds.x0 - 1, lo: bounds.z0, hi: bounds.z1 },
    { name: 'east', normal: 0, probe: bounds.x1, lo: bounds.z0, hi: bounds.z1 },
    { name: 'north', normal: 2, probe: bounds.z0 - 1, lo: bounds.x0, hi: bounds.x1 },
    { name: 'south', normal: 2, probe: bounds.z1, lo: bounds.x0, hi: bounds.x1 },
  ] as const;
  const gaps: string[] = [];
  for (const { name, normal, probe, lo, hi } of sides) {
    const tangent = 2 - normal;
    const spans = structures
      .filter(
        (box) =>
          box.min[normal] <= probe &&
          probe < box.max[normal] &&
          box.min[1] <= floor &&
          box.max[1] >= floor + height + 1,
      )
      .map((box) => [box.min[tangent]!, box.max[tangent]!] as const)
      .sort((a, b) => a[0] - b[0]);
    let cursor = lo;
    for (const [from, to] of spans) {
      if (from > cursor) {
        gaps.push(`${name} side is open from ${cursor} to ${Math.min(from, hi)}`);
      }
      cursor = Math.max(cursor, to);
    }
    if (cursor < hi) {
      gaps.push(`${name} side is open from ${cursor} to ${hi}`);
    }
  }
  return gaps;
};

/**
 * A street prop names a template, or a map pool of templates whose procedural variant each placement draws
 * from the world seed. An unknown name has no choices.
 */
const streetPropChoices = (registry: Registry, id: string): { id: string; weight: number }[] => {
  const pool = registry.mapPools.get(id);
  if (!pool) {
    return registry.templates.has(id) ? [{ id, weight: 1 }] : [];
  }
  return pool.choices.map(({ ref, weight }) => {
    if (ref.kind !== 'template') {
      throw new Error(`street prop pool "${id}" needs template refs, not ${ref.kind} ${ref.id}`);
    }
    return { id: ref.id, weight };
  });
};

const cityDecorationIssues = (registry: Registry, scenario: ScenarioDef): [string, string][] => {
  const { city } = scenario;
  const issues: [string, string][] = [];
  const { perimeter, ring } = city;
  if (ring && !perimeter) {
    issues.push(['.city.ring', 'an edge ring needs a perimeter wall to back onto']);
  }
  if (perimeter) {
    issues.push(...perimeterIssues(registry, scenario, perimeter));
  }
  for (const id of city.streetProps ?? []) {
    const kitRef = registry.mapPools.get(id)?.choices.find(({ ref }) => ref.kind !== 'template');
    if (kitRef) {
      issues.push(['.city.streetProps', `street prop pool "${id}" needs template refs, not ${kitRef.ref.kind}`]);
      continue;
    }
    const choices = streetPropChoices(registry, id);
    const fits = choices.every(({ id: templateId }) => {
      const prop = registry.templates.get(templateId);
      return (
        prop !== undefined &&
        prop.size[0] + STAIR_BODY_HALF_WIDTH <= city.street / 2 &&
        prop.size[2] <= Math.floor(city.blockZ / ((city.streetProps?.length ?? 0) + 1))
      );
    });
    if (choices.length === 0 || !fits) {
      issues.push(['.city.streetProps', `street prop "${id}" does not fit its lane`]);
    }
  }
  return issues;
};

const dressingIssues = (registry: Registry, city: ScenarioDef['city'], perimeter: Perimeter): [string, string][] => {
  const issues: [string, string][] = [];
  const depth = cityRowDepth(city);
  const { ring } = city;
  const dressings = [
    {
      field: 'lining',
      id: perimeter.lining?.assembly,
      fits: (size: readonly number[]) =>
        size[0]! <= (perimeter.lining?.pitch ?? 0) && size[2]! <= (ring ? ring.setback : city.street),
    },
    {
      field: 'gate',
      id: perimeter.gate?.assembly,
      fits: (size: readonly number[]) =>
        size[0]! <= city.street && size[2]! <= (ring ? ring.setback + depth : city.blockZ),
    },
  ];
  for (const { field, id, fits } of dressings) {
    const dressing = id === undefined ? undefined : (registry.mapAssemblies.get(id) ?? registry.templates.get(id));
    if (id !== undefined && !dressing) {
      issues.push([`.city.perimeter.${field}`, `no assembly or template "${id}"`]);
    } else if (dressing && !fits(dressing.size)) {
      issues.push([`.city.perimeter.${field}`, `"${id}" does not fit beside the wall`]);
    }
  }
  return issues;
};

const perimeterIssues = (registry: Registry, scenario: ScenarioDef, perimeter: Perimeter): [string, string][] => {
  const { city } = scenario;
  const blocks = [perimeter.block, ...(perimeter.wire ? [perimeter.wire.block] : [])];
  const issues: [string, string][] = blocks
    .filter((block) => !registry.blockIds.has(block))
    .map((block) => ['.city.perimeter', `no block "${block}"`]);
  issues.push(...dressingIssues(registry, city, perimeter));
  if (blocks.every((block) => registry.blockIds.has(block))) {
    const bounds = cityBounds(city);
    for (const gap of perimeterGaps(cityPerimeter(registry, perimeter, bounds, 0), bounds, 0, perimeter.height)) {
      issues.push(['.city.perimeter', gap]);
    }
  }
  return issues;
};

const choicesOf = (
  choices: readonly {
    ref: { id: string; style?: string | undefined };
    weight: number;
    atLeast?: number | undefined;
    atMost?: number | undefined;
  }[],
): PoolChoice[] =>
  choices.map(({ ref, weight, atLeast, atMost }) => ({
    id: ref.id,
    ...(ref.style ? { style: ref.style } : {}),
    weight,
    ...(atLeast === undefined ? {} : { atLeast }),
    ...(atMost === undefined ? {} : { atMost }),
  }));

/** The scenario's city with its named pools resolved to weighted building ids. */
export const cityGridOf = (registry: Registry, city: ScenarioDef['city']): CityGrid => {
  const { pool, ring, ...grid } = city;
  const resolve = (id: string, along: number) =>
    choicesOf(admittedChoices(registry, id, city.settlementKind, { along, depth: cityRowDepth(city) }));
  return {
    ...grid,
    pool,
    templates: resolve(pool, city.blockX - 2 * city.pad),
    ...(ring
      ? { ring: { ...ring, templates: resolve(ring.pool, Math.min(city.blockX, city.blockZ) - 2 * city.pad) } }
      : {}),
  };
};

const poolStyleIssue = (
  registry: Registry,
  { kind, id, style }: MapPoolDef['choices'][number]['ref'],
): string | undefined => {
  if (!style) {
    return undefined;
  }
  if (kind !== 'assembly') {
    return `style "${style}" needs an assembly, not template "${id}"`;
  }
  return registry.mapStyles.has(style) ? undefined : `no style "${style}"`;
};

/** Building slots every plan has: each row of each non-service block holds at least one building. */
const guaranteedSlots = (
  city: Pick<CityShape, 'blocksX' | 'blocksZ' | 'rows'>,
  incidental: number,
  hasStart: boolean,
): number => {
  const blocks = 4 * city.blocksX * city.blocksZ - 1 - Number(hasStart);
  return blocks * (city.rows - (incidental > 0 ? 1 : 0));
};

/** Building slots the edge ring always has: one per cell along each side. */
const ringSlots = (city: ScenarioDef['city']): number => 4 * (city.blocksX + city.blocksZ);

const poolRowIssues = (registry: Registry, pool: MapPoolDef, at: string): [string, string][] =>
  pool.choices.flatMap(({ ref }, index): [string, string][] => {
    const choiceAt = `${at}.choices[${index}].ref`;
    if (ref.kind === 'piece') {
      return [[choiceAt, `city pool "${pool.id}" needs a template or assembly, not piece "${ref.id}"`]];
    }
    if (registry.templates.has(ref.id) && registry.mapAssemblies.has(ref.id)) {
      return [[choiceAt, `ambiguous template and assembly "${ref.id}"`]];
    }
    const building = (ref.kind === 'template' ? registry.templates : registry.mapAssemblies).get(ref.id);
    if (!building) {
      return [[choiceAt, `no ${ref.kind} "${ref.id}" in pool "${pool.id}"`]];
    }
    const styleIssue = poolStyleIssue(registry, ref);
    if (styleIssue) {
      return [[`${choiceAt}.style`, styleIssue]];
    }
    return building.eligibility ? [] : [[choiceAt, `${ref.kind} "${ref.id}" has no building eligibility`]];
  });

const cityPoolIssues = (registry: Registry, scenario: ScenarioDef): [string, string][] => {
  const { city } = scenario;
  const depth = cityRowDepth(city);
  const pools = [
    {
      at: '.city.pool',
      id: city.pool,
      slots:
        city.fillRows === false
          ? 0
          : guaranteedSlots(
              city,
              scenario.composition?.incidentalTemplates.length ?? 0,
              scenario.composition !== undefined,
            ),
    },
    ...(city.ring ? [{ at: '.city.ring.pool', id: city.ring.pool, slots: ringSlots(city) }] : []),
  ];
  return pools.flatMap(({ at, id, slots }): [string, string][] => {
    const pool = registry.mapPools.get(id);
    if (!pool) {
      return [[at, `no map pool "${id}"`]];
    }
    const along = (at === '.city.ring.pool' ? Math.min(city.blockX, city.blockZ) : city.blockX) - 2 * city.pad;
    if (city.fillRows === false && at === '.city.pool') {
      return [];
    }
    const choices = admittedChoices(registry, id, city.settlementKind, { along, depth });
    const required = choices.reduce((sum, { atLeast }) => sum + (atLeast ?? 0), 0);
    const quotaIssues: [string, string][] =
      required > slots
        ? [[at, `pool "${pool.id}" needs ${required} quota buildings but the grid guarantees only ${slots}`]]
        : [];
    const emptyIssues: [string, string][] = choices.some(({ weight, atMost }) => weight > 0 && atMost !== 0)
      ? []
      : [[at, `pool "${id}" has no eligible weighted buildings for settlement kind "${city.settlementKind}"`]];
    return [...quotaIssues, ...poolRowIssues(registry, pool, at), ...emptyIssues];
  });
};

interface SettlementConsumer {
  section: 'scenarios' | 'cityBenchmarks';
  id: string;
  path: string;
  pool: string;
  kind: string;
  fit: { along: number; depth: number };
}

const benchmarkPoolIssues = (registry: Registry, benchmark: CityBenchmarkDef): [string, string][] => {
  const { pool, settlementKind } = benchmark;
  const issues: [string, string][] = [];
  if (registry.cityBenchmarks.size > 1) {
    issues.push(['.id', 'the stress-test city supports only one benchmark definition']);
  }
  const collection = registry.mapPools.get(pool);
  if (!collection) {
    return [...issues, ['.pool', `no map pool "${pool}"`]];
  }
  issues.push(...poolRowIssues(registry, collection, '.pool'));
  const grid = benchmarkGridOf(registry, benchmark);
  if (!grid.templates.some(({ weight, atMost }) => weight > 0 && atMost !== 0)) {
    issues.push(['.pool', `pool "${pool}" has no eligible weighted buildings for settlement kind "${settlementKind}"`]);
  }
  const required = grid.templates.reduce((sum, { atLeast }) => sum + (atLeast ?? 0), 0);
  const slots = 4 * grid.blocksX * grid.blocksZ * grid.rows;
  if (required > slots) {
    issues.push(['.pool', `pool "${pool}" needs ${required} quota buildings but the grid guarantees only ${slots}`]);
  }
  return issues;
};

const scenarioConsumers = ({ id, city }: ScenarioDef): SettlementConsumer[] => {
  const consumers: SettlementConsumer[] = [];
  const depth = cityRowDepth(city);
  if (city.fillRows !== false) {
    consumers.push({
      section: 'scenarios',
      id,
      path: '.city.pool',
      pool: city.pool,
      kind: city.settlementKind,
      fit: { along: city.blockX - 2 * city.pad, depth },
    });
  }
  for (const [index, lot] of (city.lots ?? []).entries()) {
    if (lot.source?.kind !== 'pool') {
      continue;
    }
    const [along, lotDepth] = lot.turn % 2 === 0 ? lot.size : [lot.size[1], lot.size[0]];
    consumers.push({
      section: 'scenarios',
      id,
      path: `.city.lots[${index}].source`,
      pool: lot.source.id,
      kind: city.settlementKind,
      fit: { along, depth: lotDepth },
    });
  }
  if (city.ring) {
    consumers.push({
      section: 'scenarios',
      id,
      path: '.city.ring.pool',
      pool: city.ring.pool,
      kind: city.settlementKind,
      fit: { along: Math.min(city.blockX, city.blockZ) - 2 * city.pad, depth },
    });
  }
  return consumers;
};

export const settlementCollectionIssues = (registry: Registry) => {
  const issues: { section: 'mapPools' | 'cityBenchmarks'; id: string; path: string; message: string }[] = [];
  const consumers = [...registry.scenarios.values()].flatMap(scenarioConsumers);
  for (const benchmark of registry.cityBenchmarks.values()) {
    const { id, pool, settlementKind } = benchmark;
    const fit = { along: benchmark.blockX - 2 * benchmark.pad, depth: cityRowDepth(benchmark) };
    consumers.push({ section: 'cityBenchmarks', id, path: '.pool', pool, kind: settlementKind, fit });
    for (const [path, message] of benchmarkPoolIssues(registry, benchmark)) {
      issues.push({ section: 'cityBenchmarks', id, path, message });
    }
  }
  for (const pool of registry.mapPools.values()) {
    const uses = consumers.filter((consumer) => consumer.pool === pool.id);
    if (uses.length === 0) {
      continue;
    }
    pool.choices.forEach(({ ref }, index) => {
      const reasons = uses.map(({ kind, fit, section, id, path }) => {
        const reason = eligibilityExclusion(registry, ref, kind, fit);
        return reason === undefined ? undefined : `${section} "${id}"${path}: ${reason}`;
      });
      if (reasons.every((reason) => reason !== undefined)) {
        issues.push({
          section: 'mapPools',
          id: pool.id,
          path: `.choices[${index}].ref`,
          message: `collection "${pool.id}" building "${ref.id}" is excluded for every consumer: ${reasons.join('; ')}`,
        });
      }
    });
  }
  return issues;
};

const reservedLotIssues = (
  registry: Registry,
  { city, composition, serviceTemplate }: ScenarioDef,
): [string, string][] => {
  const reserved = [
    ...(composition ? [{ id: composition.start.template, cell: composition.start.cell, turn: 0 }] : []),
    ...(city.service ? [{ id: serviceTemplate, ...city.service }] : []),
  ];
  const issues: [string, string][] = [];
  for (const building of reserved) {
    const definition = registry.mapAssemblies.get(building.id) ?? registry.templates.get(building.id);
    if (!definition) {
      continue;
    }
    const x0 = building.cell[0] * (city.street + city.blockX) + city.street + city.pad;
    const z0 = building.cell[1] * (city.street + city.blockZ) + city.street + city.pad;
    const [width, depth] =
      building.turn % 2 === 0 ? [definition.size[0], definition.size[2]] : [definition.size[2], definition.size[0]];
    const rect = { x0, z0, x1: x0 + width, z1: z0 + depth };
    if ((city.lots ?? []).some((lot) => rectsOverlap(rect, lotRect(lot)))) {
      issues.push(['.city.lots', `authored lot overlaps reserved building "${building.id}"`]);
    }
  }
  return issues;
};
const fixedServiceIssues = ({ city, composition }: ScenarioDef): [string, string][] => {
  if (!city.service) {
    return [];
  }
  const [x, z] = city.service.cell;
  const start = composition?.start.cell;
  const inGrid = x >= -city.blocksX && x < city.blocksX && z >= -city.blocksZ && z < city.blocksZ;
  const distinct = !start || x !== start[0] || z !== start[1];
  return inGrid && distinct
    ? []
    : [['.city.service.cell', 'service needs a reserved cell distinct from the start inside the grid']];
};

export const scenarioPlanIssues = (registry: Registry, scenario: ScenarioDef): [string, string][] => {
  const issues: [string, string][] = [];
  const { city, serviceTemplate, population } = scenario;
  if (population.roadsideOffset * 2 >= city.street) {
    issues.push([
      '.population.roadsideOffset',
      'stragglers must stand inside the street on both sides of its centreline',
    ]);
  }
  const width = city.blockX - 2 * city.pad;
  issues.push(...fixedServiceIssues(scenario), ...reservedLotIssues(registry, scenario));
  issues.push(
    ...cityDecorationIssues(registry, scenario),
    ...cityPoolIssues(registry, scenario),
    ...cityLotIssues(registry, city, cityBounds(city)),
    ...cityLotQuotaIssues(registry, city),
    ...scenarioStartIssues(registry, scenario),
  );
  const template = registry.templates.get(serviceTemplate);
  const assembly = registry.mapAssemblies.get(serviceTemplate);
  const service = template ?? assembly;
  if (!service || (template && assembly)) {
    return [...issues, ['.serviceTemplate', `missing or ambiguous template/assembly "${serviceTemplate}"`]];
  }
  if (Math.max(service.size[0], service.size[2]) > Math.min(width, city.blockZ - 2 * city.pad)) {
    issues.push(['.serviceTemplate', 'service template must fit every quarter turn inside its reserved block']);
  }
  if (template && !templateResolves(registry, template)) {
    return [...issues, ['.serviceTemplate', 'service template has unresolved palette references']];
  }
  try {
    const compiled = assembly
      ? compileAssembly(registry, assembly, { seed: 0, siteId: `scenario:${scenario.id}:service` })
      : compileTemplate(registry, template!);
    const decals = compiled.decals?.length ?? 0;
    if (decals > scenario.decalLimit) {
      issues.push(['.decalLimit', `service template places ${decals} decals; the limit is ${scenario.decalLimit}`]);
    }
    issues.push(...scenarioPortalIssues(registry, scenario, compiled));
    issues.push(...scenarioCompositionIssues(registry, scenario, compiled));
  } catch (error) {
    issues.push(['.serviceTemplate', error instanceof Error ? error.message : String(error)]);
  }
  return issues;
};

const portalOf = (service: Placement, scenario: ScenarioDef): Portal => {
  const upper = placedPoint(service, scenario.portal.upper);
  const lower = placedPoint(service, scenario.portal.lower);
  const shaft = placedPoint(service, portalLadderPoint(scenario, service.template));
  const min: Vec3 = [
    Math.min(upper[0], lower[0], shaft[0]) - STAIR_BODY_HALF_WIDTH,
    lower[1] - 1,
    Math.min(upper[2], lower[2], shaft[2]) - STAIR_BODY_HALF_WIDTH,
  ];
  const max: Vec3 = [
    Math.max(upper[0], lower[0], shaft[0]) + STAIR_BODY_HALF_WIDTH,
    upper[1] + STAIR_BODY_HEIGHT,
    Math.max(upper[2], lower[2], shaft[2]) + STAIR_BODY_HALF_WIDTH,
  ];
  return Object.freeze({
    upper: Object.freeze(upper),
    lower: Object.freeze(lower),
    envelope: Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) }),
  });
};

const freezePlacement = (placement: Placement): Placement => {
  Object.freeze(placement.origin);
  return Object.freeze(placement);
};

const cityCells = (grid: CityGrid): Cell[] => {
  const cells: Cell[] = [];
  for (let j = -grid.blocksZ; j < grid.blocksZ; j++) {
    for (let i = -grid.blocksX; i < grid.blocksX; i++) {
      const { bounds } = grid;
      const x0 = i * (grid.street + grid.blockX);
      const z0 = j * (grid.street + grid.blockZ);
      if (
        bounds &&
        (x0 < bounds.x0 ||
          z0 < bounds.z0 ||
          x0 + grid.street + grid.blockX > bounds.x1 ||
          z0 + grid.street + grid.blockZ > bounds.z1)
      ) {
        continue;
      }
      cells.push(Object.freeze([i, j] as const));
    }
  }
  return cells;
};

const compilePoolTemplate = (registry: Registry, id: string, storeys: number) => {
  const definition = registry.templates.get(id);
  if (!definition) {
    throw new Error(`Missing city template or assembly "${id}"`);
  }
  return stackTemplate(compileTemplate(registry, definition), storeys);
};

const templateCompiler = (registry: Registry, seed: number) => {
  const cache = new Map<string, ReturnType<typeof compileTemplate>>();
  const pieceCache = new Map<string, ReturnType<typeof compileTemplate>>();
  return ({ id, style }: PoolRef, storeys: number, siteId = 'dimensions') => {
    const assembly = registry.mapAssemblies.get(id);
    if (assembly && registry.templates.has(id)) {
      throw new Error(`Ambiguous city template and assembly "${id}"`);
    }
    const key = assembly ? JSON.stringify([id, siteId, style]) : JSON.stringify([id, storeys]);
    let template = cache.get(key);
    if (!template) {
      template = assembly
        ? compileAssembly(registry, assembly, { seed, siteId, pieceCache, ...(style ? { style } : {}) })
        : compilePoolTemplate(registry, id, storeys);
      cache.set(key, template);
    }
    return template;
  };
};

interface FillContext {
  seed: number;
  floor: number;
  grid: CityGrid;
  registry: Registry;
  maxStoreys: number;
  incidentalTemplates: readonly string[];
  compiled: ReturnType<typeof templateCompiler>;
  /** Buildings placed so far in the current pass, by pool row (`rowKey`). */
  counts: Map<string, number>;
  /** Quota buildings the current pass must place at the earliest slot where each fits. */
  forced: PoolRef[];
}
export const cityRowStart = (grid: CityGrid, row: number): number =>
  grid.street + grid.pad + Math.floor(row / 2) * (2 * cityRowDepth(grid) + grid.street);

const groundedY = (template: Pick<Placement['template'], 'groundLayer'>, floor: number): number =>
  floor - (template.groundLayer ?? 0);

/** The next slot's building: a forced quota choice that fits, else the weighted draw over rows under their `atMost`. */
const chooseBuilding = (
  context: FillContext,
  fits: (ref: PoolRef) => boolean,
  incidental: boolean,
  stream: string,
): PoolRef | undefined => {
  const { seed, grid, counts, forced } = context;
  const open = grid.templates.filter(
    (choice) => (counts.get(rowKey(choice)) ?? 0) < (choice.atMost ?? Number.POSITIVE_INFINITY),
  );
  const pool: readonly (PoolRef & { weight: number })[] = incidental
    ? context.incidentalTemplates.map((id) => ({ id, weight: 1 }))
    : open;
  const selected = pickWeighted(pool, Rng.stream(seed, stream));
  const forcedAt = incidental ? -1 : forced.findIndex((ref) => fits(ref));
  if (forcedAt >= 0) {
    return forced.splice(forcedAt, 1)[0];
  }
  return selected && fits(selected) ? selected : open.find((choice) => choice.weight > 0 && fits(choice));
};

const rowSpan = (obstacles: Rect[], start: number, end: number, gap: number): { x: number; next: number } => {
  let x = start;
  for (;;) {
    const occupied = obstacles.find((rect) => rect.x0 <= x && x < rect.x1);
    if (!occupied) {
      break;
    }
    x = occupied.x1 + gap;
  }
  return { x, next: Math.min(end, ...obstacles.filter((rect) => rect.x0 > x).map((rect) => rect.x0 - gap)) };
};
const isIncidental = (context: FillContext, index: number, row: number): boolean =>
  index === 0 && row === 0 && context.incidentalTemplates.length > 0;
const fillRow = (context: FillContext, [i, j]: Cell, row: number): Placement[] => {
  const { seed, floor, grid, registry, compiled, maxStoreys, counts } = context;
  const pitchX = grid.street + grid.blockX;
  const pitchZ = grid.street + grid.blockZ;
  const end = (i + 1) * pitchX - grid.pad;
  const turn = row % 2 === 0 ? 0 : 2;
  let x = i * pitchX + grid.street + grid.pad;
  const placements: Placement[] = [];
  const bank = j * pitchZ + cityRowStart(grid, row);
  const rowZ = bank + (row % 2) * cityRowDepth(grid);
  const obstacles = (grid.lots ?? [])
    .map(lotRect)
    .filter((rect) => rect.z0 < rowZ + cityRowDepth(grid) && rowZ < rect.z1);
  for (let k = 0; ; k++) {
    const span = rowSpan(obstacles, x, end, grid.gap);
    ({ x } = span);
    const { next } = span;
    const fits = ({ id, style }: PoolRef) =>
      footprint({ template: compiled({ id, style }, 1), origin: [0, 0, 0], turn })[0] <= next - x;
    const incidental = isIncidental(context, k, row);
    const building = chooseBuilding(context, fits, incidental, `city:${i},${j}/row:${row}/building:${k}/type`);
    if (!building) {
      if (next < end) {
        x = next + grid.gap;
        continue;
      }
      break;
    }
    if (!(incidental && context.incidentalTemplates.includes(building.id))) {
      counts.set(rowKey(building), (counts.get(rowKey(building)) ?? 0) + 1);
    }
    const limit = Math.min(maxStoreys, registry.templates.get(building.id)?.maxStoreys ?? maxStoreys);
    const storeys = 1 + Math.floor(hash3(seed, i, j * grid.rows + row, k + 1000) * limit);
    const template = compiled(building, storeys, `city:${i},${j}/row:${row}/building:${k}`);
    const [width, depth] = footprint({ template, origin: [0, 0, 0], turn });
    const z = row % 2 === 0 ? bank : bank + 2 * cityRowDepth(grid) - depth;
    placements.push(freezePlacement({ template, origin: [x, groundedY(template, floor), z], turn }));
    x += width + grid.gap;
  }
  return placements;
};

const quotaShortfalls = ({ grid, counts }: FillContext): PoolChoice[] =>
  grid.templates.flatMap((choice) =>
    Array.from({ length: Math.max(0, (choice.atLeast ?? 0) - (counts.get(rowKey(choice)) ?? 0)) }, () => choice),
  );

/**
 * Retries force every row that has fallen short so far, so a retry never drops an earlier row. It stops once the
 * quotas are met or a retry would force no new row, so it is bounded by the quota rows, never a search, and loud.
 */
const fillWithQuotas = (context: FillContext, fill: (forced: PoolRef[]) => Placement[], site: string): Placement[] => {
  let placements = fill([]);
  const forcedRows = new Set<string>();
  for (;;) {
    const short = new Set(quotaShortfalls(context).map(rowKey));
    if ([...short].every((key) => forcedRows.has(key))) {
      break;
    }
    for (const key of short) {
      forcedRows.add(key);
    }
    placements = fill(
      context.grid.templates.flatMap((choice) =>
        forcedRows.has(rowKey(choice)) ? Array.from({ length: choice.atLeast ?? 0 }, () => choice) : [],
      ),
    );
  }
  const [unmet] = quotaShortfalls(context);
  if (unmet) {
    throw new Error(
      `Pool "${context.grid.pool ?? 'city'}" quota unmet: could not place "${unmet.id}" at site ${site} (needs ${
        unmet.atLeast
      }, placed ${context.counts.get(rowKey(unmet)) ?? 0})`,
    );
  }
  return placements;
};

const serviceOrigin = (
  template: Pick<Placement['template'], 'groundLayer'>,
  floor: number,
  grid: Pick<CityGrid, 'street' | 'blockX' | 'blockZ' | 'pad'>,
  [i, j]: Cell,
): Vec3 => [
  i * (grid.street + grid.blockX) + grid.street + grid.pad,
  groundedY(template, floor),
  j * (grid.street + grid.blockZ) + grid.street + grid.pad,
];

export const servicePlacement = ({
  template,
  floor,
  grid,
  cell,
  turn,
}: {
  template: ReturnType<typeof compileTemplate>;
  floor: number;
  grid: Pick<CityGrid, 'street' | 'blockX' | 'blockZ' | 'pad'>;
  cell: Cell;
  turn: Turn;
}): Placement =>
  freezePlacement({
    template,
    origin: serviceOrigin(template, floor, grid, cell),
    turn,
  });

const startPlacement = (context: FillContext, scenario?: ScenarioDef): Placement | undefined => {
  const definition = scenario?.composition?.start;
  if (!definition) {
    return undefined;
  }
  return servicePlacement({
    template: startTemplate(context.registry, definition.template, context.seed, `scenario:${scenario!.id}:start`),
    floor: context.floor,
    grid: context.grid,
    cell: definition.cell,
    turn: 0,
  });
};

const freezeChoices = (choices: readonly PoolChoice[]) =>
  Object.freeze(choices.map((choice) => Object.freeze({ ...choice })));

const freezeGrid = (grid: CityGrid): Readonly<CityGrid> =>
  Object.freeze({
    ...grid,
    templates: freezeChoices(grid.templates),
    ...(grid.service ? { service: freezeSnapshot(structuredClone(grid.service)) } : {}),
    ...(grid.perimeter
      ? {
          perimeter: Object.freeze({
            ...grid.perimeter,
            ...(grid.perimeter.wire ? { wire: Object.freeze({ ...grid.perimeter.wire }) } : {}),
            ...(grid.perimeter.lining ? { lining: Object.freeze({ ...grid.perimeter.lining }) } : {}),
            ...(grid.perimeter.gate ? { gate: Object.freeze({ ...grid.perimeter.gate }) } : {}),
          }),
        }
      : {}),
    ...(grid.ring ? { ring: Object.freeze({ ...grid.ring, templates: freezeChoices(grid.ring.templates) }) } : {}),
    ...(grid.streetProps ? { streetProps: Object.freeze([...grid.streetProps]) } : {}),
  });

/** Inward-facing quarter turn for each wall: the template front faces north at turn 0. */
const SIDES = [
  { side: 'north', turn: 2, alongX: true },
  { side: 'south', turn: 0, alongX: true },
  { side: 'west', turn: 1, alongX: false },
  { side: 'east', turn: 3, alongX: false },
] as const;

/** Where a building of footprint `[fx, fz]` stands against a wall's inside face, `at` blocks along the wall. */
type Side = (typeof SIDES)[number];
type Extent = readonly [number, number];

const againstWall = (
  { side, bounds, setback }: { side: Side['side']; bounds: Rect; setback: number },
  { y, at, extent: [fx, fz] }: { y: number; at: number; extent: Extent },
): Vec3 => {
  const origins: Record<Side['side'], Vec3> = {
    north: [at, y, bounds.z0 + setback],
    south: [at, y, bounds.z1 - setback - fz],
    west: [bounds.x0 + setback, y, at],
    east: [bounds.x1 - setback - fx, y, at],
  };
  return origins[side];
};

/** The row of buildings along one cell of one wall, backs to the wall and fronts to the outermost street. */
const fillRingCell = (
  context: FillContext,
  wall: { bounds: Rect; setback: number },
  { side, turn, alongX, sideIndex }: Side & { sideIndex: number },
  index: number,
): Placement[] => {
  const { seed, floor, grid, registry, compiled, maxStoreys, counts } = context;
  const depth = cityRowDepth(grid);
  const pitch = grid.street + (alongX ? grid.blockX : grid.blockZ);
  const end = (index + 1) * pitch - grid.pad;
  const placements: Placement[] = [];
  let at = index * pitch + grid.street + grid.pad;
  for (let k = 0; ; k++) {
    const fits = (ref: PoolRef) => {
      const [fx, fz] = footprint({ template: compiled(ref, 1), origin: [0, 0, 0], turn });
      return (alongX ? fx : fz) <= end - at && (alongX ? fz : fx) <= depth;
    };
    const building = chooseBuilding(context, fits, false, `city:ring:${side}:${index}/building:${k}/type`);
    if (!building) {
      return placements;
    }
    counts.set(rowKey(building), (counts.get(rowKey(building)) ?? 0) + 1);
    const limit = Math.min(maxStoreys, registry.templates.get(building.id)?.maxStoreys ?? maxStoreys);
    const storeys = 1 + Math.floor(hash3(seed, index, sideIndex + 5000, k + 1000) * limit);
    const template = compiled(building, storeys, `city:ring:${side}:${index}/building:${k}`);
    const extent = footprint({ template, origin: [0, 0, 0], turn });
    const origin = againstWall({ side, ...wall }, { y: groundedY(template, floor), at, extent });
    placements.push(freezePlacement({ template, origin, turn }));
    at += (alongX ? extent[0] : extent[1]) + grid.gap;
  }
};

/** One row of buildings per side of the grid. */
const fillRing = (context: FillContext, bounds: Rect, setback: number): Placement[] =>
  SIDES.flatMap((side, sideIndex) => {
    const cells = side.alongX ? context.grid.blocksX : context.grid.blocksZ;
    return Array.from({ length: 2 * cells }, (_, n) =>
      fillRingCell(context, { bounds, setback }, { ...side, sideIndex }, n - cells),
    ).flat();
  });

/** Stands a wall dressing against the wall's inside face; `at` gives its position along the wall from its footprint. */
const standAtWall = (
  context: FillContext,
  bounds: Rect,
  side: Side,
  { id, siteId, at }: { id: string; siteId: string; at: (extent: Extent) => number },
): { placement: Placement; extent: Extent } => {
  const template = context.compiled({ id }, 1, siteId);
  const extent = footprint({ template, origin: [0, 0, 0], turn: side.turn });
  // Dressing's authored air must not excavate the top solid terrain voxel.
  const origin = againstWall(
    { side: side.side, bounds, setback: 0 },
    { y: groundedY(template, context.floor + 1), at: at(extent), extent },
  );
  return { placement: freezePlacement({ template, origin, turn: side.turn }), extent };
};

/** Lining along one wall's inside face, leaving the gate's span clear on walls the gate stands in. */
const liningPlacements = (
  context: FillContext,
  bounds: Rect,
  side: Side,
  { lining, gated }: { lining: NonNullable<Perimeter['lining']>; gated: boolean },
): Placement[] => {
  const [lo, hi] = side.alongX ? [bounds.x0, bounds.x1] : [bounds.z0, bounds.z1];
  const extentAt = (k: number) =>
    footprint({
      template: context.compiled({ id: lining.assembly }, 1, `perimeter:${side.side}:${k}`),
      origin: [0, 0, 0],
      turn: side.turn,
    });
  const inset = extentAt(0)[side.alongX ? 1 : 0];
  const placements: Placement[] = [];
  for (let k = 0, at = lo + inset; ; k++, at += lining.pitch) {
    const [fx, fz] = extentAt(k);
    const along = side.alongX ? fx : fz;
    if (at + along > hi - inset) {
      return placements;
    }
    if (!(gated && at < context.grid.street && at + along > 0)) {
      const siteId = `perimeter:${side.side}:${k}`;
      placements.push(standAtWall(context, bounds, side, { id: lining.assembly, siteId, at: () => at }).placement);
    }
  }
};

/** The gate where the central street meets the wall, and the lining along each wall's inside face. */
const wallPlacements = (context: FillContext, bounds: Rect, { gate, lining }: Perimeter): Placement[] => [
  ...SIDES.filter(({ alongX }) => gate && alongX).map(
    (side) =>
      standAtWall(context, bounds, side, {
        id: gate!.assembly,
        siteId: `perimeter:gate:${side.side}`,
        at: ([fx]) => Math.floor((context.grid.street - fx) / 2),
      }).placement,
  ),
  ...(lining
    ? SIDES.flatMap((side) =>
        liningPlacements(context, bounds, side, { lining, gated: gate !== undefined && side.alongX }),
      )
    : []),
];

const streetPropPlacements = (context: FillContext, cells: Cell[], pitchX: number, pitchZ: number): Placement[] => {
  const { grid, floor, registry, seed } = context;
  const props = grid.streetProps ?? [];
  return cells.flatMap(([i, j]) =>
    props.map((prop, index) =>
      freezePlacement({
        template: context.compiled(
          pickWeighted(streetPropChoices(registry, prop), Rng.stream(seed, `city:${i},${j}/street-prop:${index}`))!,
          1,
        ),
        turn: 0,
        origin: [i * pitchX, floor, j * pitchZ + grid.street + (grid.blockZ * (index + 1)) / (props.length + 1)].map(
          Math.floor,
        ) as Vec3,
      }),
    ),
  );
};

const ringPlacements = (context: FillContext, bounds: Rect, scenario?: ScenarioDef): Placement[] => {
  const { ring } = context.grid;
  if (!ring) {
    return [];
  }
  const ringContext: FillContext = {
    ...context,
    grid: { ...context.grid, templates: ring.templates, pool: ring.pool },
    counts: new Map(),
    forced: [],
  };
  return fillWithQuotas(
    ringContext,
    (forced) => {
      ringContext.counts = new Map();
      ringContext.forced = forced;
      return fillRing(ringContext, bounds, ring.setback);
    },
    scenario ? `scenario:${scenario.id}:ring` : 'ring',
  );
};

const countsForLots = (lots: readonly PlannedLot[], pool: string | undefined): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const { definition, ref } of lots) {
    if (definition.source?.kind !== 'pool' || definition.source.id !== pool || !ref) {
      continue;
    }
    const key = rowKey(ref);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};
const checkReservedLots = (lots: readonly PlannedLot[], reserved: (Placement | undefined)[]): void => {
  for (const placement of reserved) {
    if (!placement) {
      continue;
    }
    const [width, depth] = footprint(placement);
    const rect = {
      x0: placement.origin[0],
      z0: placement.origin[2],
      x1: placement.origin[0] + width,
      z1: placement.origin[2] + depth,
    };
    if (lots.some(({ definition }) => rectsOverlap(rect, lotRect(definition)))) {
      throw new Error(`Authored lot overlaps reserved building "${placement.template.id}"`);
    }
  }
};

const planService = (
  context: FillContext,
  scenario: ScenarioDef | undefined,
  candidates: Cell[],
): { service: Placement | undefined; serviceBlock: Cell | undefined } => {
  if (!scenario) {
    return { service: undefined, serviceBlock: undefined };
  }
  const { grid, seed, floor } = context;
  const serviceBlock =
    grid.service?.cell ??
    candidates[Rng.stream(seed, `scenario:${scenario.id}:service-block`).int(0, candidates.length - 1)]!;
  const service = servicePlacement({
    template: context.compiled({ id: scenario.serviceTemplate }, 1, `scenario:${scenario.id}:service`),
    floor,
    grid,
    cell: serviceBlock,
    turn: grid.service?.turn ?? (Rng.stream(seed, `scenario:${scenario.id}:service-turn`).int(0, 3) as Turn),
  });
  return { service, serviceBlock };
};

export const buildCityPlan = ({
  seed,
  registry,
  floor,
  grid,
  maxStoreys = 1,
  scenario,
}: {
  seed: number;
  registry: Registry;
  floor: number;
  grid: CityGrid;
  maxStoreys?: number;
  scenario?: ScenarioDef;
}): CityPlan => {
  const cells = cityCells(grid);
  const startCell = scenario?.composition?.start.cell ?? [0, 0];
  const candidates = cells.filter(([i, j]) => i !== startCell[0] || j !== startCell[1]);
  const context: FillContext = {
    seed,
    floor,
    grid,
    registry,
    maxStoreys: scenario ? 1 : maxStoreys,
    incidentalTemplates: scenario?.composition?.incidentalTemplates ?? [],
    compiled: templateCompiler(registry, seed),
    counts: new Map(),
    forced: [],
  };
  const { service, serviceBlock } = planService(context, scenario, candidates);
  const lots = placeCityLots(registry, grid, { seed, floor, compiled: context.compiled });
  const start = startPlacement(context, scenario);
  const composition =
    service && scenario && start ? composeScenario(registry, scenario, service, { floor, start, lots }) : undefined;
  const lotCounts = countsForLots(lots, grid.pool);
  const fillCells = (forced: PoolRef[]): Placement[] => {
    context.counts = new Map(lotCounts);
    context.forced = forced;
    if (grid.fillRows === false) {
      return [service, start].filter((placement): placement is Placement => placement !== undefined);
    }
    return cells.flatMap(([i, j]) => {
      if (service && serviceBlock?.[0] === i && serviceBlock[1] === j) {
        return [service];
      }
      if (start && i === startCell[0] && j === startCell[1]) {
        return [start];
      }
      return Array.from({ length: grid.rows }, (_, row) => fillRow(context, [i, j], row)).flat();
    });
  };
  const placements =
    grid.fillRows === false
      ? fillCells([])
      : fillWithQuotas(context, fillCells, scenario ? `scenario:${scenario.id}:city` : 'city');
  placements.unshift(...lots.flatMap(({ placement }) => (placement ? [placement] : [])));
  checkReservedLots(lots, [service, start]);
  if (composition) {
    placements.push(...composition.leads, ...composition.landmarks);
  }
  const pitchX = grid.street + grid.blockX;
  const pitchZ = grid.street + grid.blockZ;
  const spawn: Vec3 = composition ? [...composition.start.spawn] : [grid.street / 2, floor + 1, grid.street / 2];
  const core = cityCore(grid);
  const bounds = cityBounds(grid);
  const { perimeter } = grid;
  placements.push(
    ...ringPlacements(context, bounds, scenario),
    ...streetPropPlacements(context, cells, pitchX, pitchZ),
    ...(perimeter ? wallPlacements(context, bounds, perimeter) : []),
  );
  const structures = perimeter ? cityPerimeter(registry, perimeter, bounds, floor) : [];
  return Object.freeze({
    grid: freezeGrid(grid),
    floor,
    bounds: Object.freeze(bounds),
    core: Object.freeze(core),
    structures: Object.freeze(
      structures.map((box) => {
        Object.freeze(box.min);
        Object.freeze(box.max);
        return Object.freeze(box);
      }),
    ),
    placements: Object.freeze(placements),
    lots,
    service,
    serviceBlock,
    candidates: Object.freeze(candidates),
    spawn: Object.freeze(spawn),
    portal: service && scenario ? portalOf(service, scenario) : undefined,
    composition,
  });
};
