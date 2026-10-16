import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { HAMLET_TEMPLATES } from './hamlet.ts';
import { hash3, pickWeighted, Rng } from './random.ts';
import { composeScenario, type ScenarioComposition, scenarioCompositionIssues } from './scenarioComposition.ts';
import { portalLadderPoint, scenarioPortalIssues } from './scenarioPortal.ts';
import type { MapPoolDef, ScenarioDef } from './schema.ts';
import type { Rect } from './site.ts';
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

export const CITY = { street: 12, blockX: 104, blockZ: 64, pad: 2, gap: 2, reach: 400, blend: 24 } as const;
interface PoolRef {
  readonly id: string;
  readonly style?: string | undefined;
}
type PoolChoice = Readonly<PoolRef & { weight: number; atLeast?: number; atMost?: number }>;
const rowKey = ({ id, style }: PoolRef): string => `${id}@${style ?? ''}`;
export type CityGrid = Omit<ScenarioDef['city'], 'pool' | 'streetProps'> & {
  readonly pool?: string | undefined;
  readonly templates: readonly PoolChoice[];
  readonly streetProps?: readonly string[] | undefined;
};
type Cell = readonly [number, number];
interface Portal {
  readonly upper: Readonly<Vec3>;
  readonly lower: Readonly<Vec3>;
  readonly envelope: { readonly min: Readonly<Vec3>; readonly max: Readonly<Vec3> };
}
export interface CityPlan {
  readonly grid: Readonly<CityGrid>;
  readonly floor: number;
  readonly bounds: Rect;
  readonly placements: readonly Placement[];
  readonly structures: readonly BlockBox[];
  readonly service: Placement | undefined;
  readonly serviceBlock: Cell | undefined;
  readonly candidates: readonly Cell[];
  readonly spawn: Readonly<Vec3>;
  readonly portal: Portal | undefined;
  readonly composition: ScenarioComposition | undefined;
}

export const benchmarkCityGrid = (): CityGrid => ({
  street: CITY.street,
  blockX: CITY.blockX,
  blockZ: CITY.blockZ,
  pad: CITY.pad,
  gap: CITY.gap,
  blend: CITY.blend,
  blocksX: Math.ceil(CITY.reach / (CITY.street + CITY.blockX)),
  blocksZ: Math.ceil(CITY.reach / (CITY.street + CITY.blockZ)),
  templates: HAMLET_TEMPLATES.map((id) => ({ id, weight: 1 })),
});

const cityDecorationIssues = (registry: Registry, city: Omit<CityGrid, 'templates'>): [string, string][] => {
  const issues: [string, string][] = [];
  if (city.perimeter && !registry.blockIds.has(city.perimeter.block)) {
    issues.push(['.city.perimeter.block', `no block "${city.perimeter.block}"`]);
  }
  for (const id of city.streetProps ?? []) {
    const prop = registry.templates.get(id);
    if (
      !prop ||
      prop.size[0] + STAIR_BODY_HALF_WIDTH > city.street / 2 ||
      prop.size[2] > Math.floor(city.blockZ / ((city.streetProps?.length ?? 0) + 1))
    ) {
      issues.push(['.city.streetProps', `street prop "${id}" does not fit its lane`]);
    }
  }
  return issues;
};

const cityPerimeter = (registry: Registry, grid: CityGrid, floor: number, bounds: Rect): BlockBox[] => {
  if (!grid.perimeter) {
    return [];
  }
  const { height, thickness, block } = grid.perimeter;
  const structures: BlockBox[] = [];
  const box = (min: Vec3, max: Vec3) => structures.push({ min, max, block: registry.blockIds.get(block)! });
  box(
    [bounds.x0 - thickness, floor - thickness, bounds.z0 - thickness],
    [bounds.x0, floor + height + 1, bounds.z1 + thickness],
  );
  box(
    [bounds.x1, floor - thickness, bounds.z0 - thickness],
    [bounds.x1 + thickness, floor + height + 1, bounds.z1 + thickness],
  );
  for (const z of [bounds.z0 - thickness, bounds.z1]) {
    box([bounds.x0, floor - thickness, z], [0, floor + height + 1, z + thickness]);
    box([grid.street, floor - thickness, z], [bounds.x1, floor + height + 1, z + thickness]);
  }
  return structures;
};

/** The scenario's city with its named pool resolved to weighted building ids. */
export const cityGridOf = (registry: Registry, city: ScenarioDef['city']): CityGrid => {
  const { pool, ...grid } = city;
  const choices = registry.mapPools.get(pool)?.choices;
  if (!choices) {
    throw new Error(`Missing city pool "${pool}"`);
  }
  return {
    ...grid,
    pool,
    templates: choices.map(({ ref, weight, atLeast, atMost }) => ({
      id: ref.id,
      ...(ref.style ? { style: ref.style } : {}),
      weight,
      ...(atLeast === undefined ? {} : { atLeast }),
      ...(atMost === undefined ? {} : { atMost }),
    })),
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
const guaranteedSlots = (city: ScenarioDef['city'], incidental: number): number => {
  const blocks = 4 * city.blocksX * city.blocksZ - 1;
  return blocks * ((city.rows ?? 2) - (incidental > 0 ? 1 : 0));
};

const cityPoolIssues = (registry: Registry, scenario: ScenarioDef): [string, string][] => {
  const { city } = scenario;
  const pool = registry.mapPools.get(city.pool);
  if (!pool) {
    return [['.city.pool', `no map pool "${city.pool}"`]];
  }
  const grid = { ...city, templates: [] };
  const required = pool.choices.reduce((sum, { atLeast }) => sum + (atLeast ?? 0), 0);
  const slots = guaranteedSlots(city, scenario.composition?.incidentalTemplates.length ?? 0);
  const quotaIssues: [string, string][] =
    required > slots
      ? [['.city.pool', `pool "${pool.id}" needs ${required} quota buildings but the grid guarantees only ${slots}`]]
      : [];
  const rowIssues = pool.choices.flatMap(({ ref }, index): [string, string][] => {
    const at = `.city.pool.choices[${index}].ref`;
    const { id } = ref;
    if (registry.templates.has(id) && registry.mapAssemblies.has(id)) {
      return [[at, `ambiguous template and assembly "${id}"`]];
    }
    const building = (ref.kind === 'template' ? registry.templates : registry.mapAssemblies).get(id);
    if (!building) {
      return [[at, `no ${ref.kind} "${id}" in pool "${pool.id}"`]];
    }
    const styleIssue = poolStyleIssue(registry, ref);
    if (styleIssue) {
      return [[`${at}.style`, styleIssue]];
    }
    return building.size[0] > city.blockX - 2 * city.pad || building.size[2] > cityRowDepth(grid)
      ? [[at, `${ref.kind} "${id}" does not fit the reserved row`]]
      : [];
  });
  return [...quotaIssues, ...rowIssues];
};

export const scenarioPlanIssues = (registry: Registry, scenario: ScenarioDef): [string, string][] => {
  const issues: [string, string][] = [];
  if (!registry.blockIds.has('asphalt')) {
    issues.push(['.city', 'city needs asphalt content']);
  }
  const { city, serviceTemplate } = scenario;
  const width = city.blockX - 2 * city.pad;
  issues.push(...cityDecorationIssues(registry, city), ...cityPoolIssues(registry, scenario));
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
  return ({ id, style }: PoolRef, storeys: number, siteId = 'dimensions') => {
    const assembly = registry.mapAssemblies.get(id);
    if (assembly && registry.templates.has(id)) {
      throw new Error(`Ambiguous city template and assembly "${id}"`);
    }
    const key = assembly ? JSON.stringify([id, siteId, style]) : JSON.stringify([id, storeys]);
    let template = cache.get(key);
    if (!template) {
      template = assembly
        ? compileAssembly(registry, assembly, { seed, siteId, ...(style ? { style } : {}) })
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
export const cityRowDepth = (grid: CityGrid): number =>
  Math.floor((grid.blockZ - 2 * grid.pad - ((grid.rows ?? 2) / 2 - 1) * grid.street) / (grid.rows ?? 2));

export const cityRowStart = (grid: CityGrid, row: number): number =>
  grid.street + grid.pad + Math.floor(row / 2) * (2 * cityRowDepth(grid) + grid.street);

const groundedY = (template: Placement['template'], floor: number): number => floor - (template.groundLayer ?? 0);

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

const fillRow = (context: FillContext, [i, j]: Cell, row: number): Placement[] => {
  const { seed, floor, grid, registry, compiled, maxStoreys, counts } = context;
  const pitchX = grid.street + grid.blockX;
  const pitchZ = grid.street + grid.blockZ;
  const end = (i + 1) * pitchX - grid.pad;
  const turn = row % 2 === 0 ? 0 : 2;
  let x = i * pitchX + grid.street + grid.pad;
  const placements: Placement[] = [];
  for (let k = 0; ; k++) {
    const fits = ({ id, style }: PoolRef) =>
      footprint({ template: compiled({ id, style }, 1), origin: [0, 0, 0], turn })[0] <= end - x;
    const incidental = k === 0 && row === 0 && context.incidentalTemplates.length > 0;
    const building = chooseBuilding(context, fits, incidental, `city:${i},${j}/row:${row}/building:${k}/type`);
    if (!building) {
      break;
    }
    if (!(incidental && context.incidentalTemplates.includes(building.id))) {
      counts.set(rowKey(building), (counts.get(rowKey(building)) ?? 0) + 1);
    }
    const limit = Math.min(maxStoreys, registry.templates.get(building.id)?.maxStoreys ?? maxStoreys);
    const storeys = 1 + Math.floor(hash3(seed, i, j * (grid.rows ?? 2) + row, k + 1000) * limit);
    const template = compiled(building, storeys, `city:${i},${j}/row:${row}/building:${k}`);
    const [width, depth] = footprint({ template, origin: [0, 0, 0], turn });
    const bank = j * pitchZ + cityRowStart(grid, row);
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

export const servicePlacement = ({
  template,
  floor,
  grid,
  cell: [i, j],
  turn,
}: {
  template: ReturnType<typeof compileTemplate>;
  floor: number;
  grid: CityGrid;
  cell: Cell;
  turn: Turn;
}): Placement =>
  freezePlacement({
    template,
    origin: [
      i * (grid.street + grid.blockX) + grid.street + grid.pad,
      groundedY(template, floor),
      j * (grid.street + grid.blockZ) + grid.street + grid.pad,
    ],
    turn,
  });

const freezeGrid = (grid: CityGrid): Readonly<CityGrid> =>
  Object.freeze({
    ...grid,
    templates: Object.freeze(grid.templates.map((choice) => Object.freeze({ ...choice }))),
    ...(grid.perimeter ? { perimeter: Object.freeze({ ...grid.perimeter }) } : {}),
    ...(grid.streetProps ? { streetProps: Object.freeze([...grid.streetProps]) } : {}),
  });

const streetPropPlacements = (context: FillContext, cells: Cell[], pitchX: number, pitchZ: number): Placement[] => {
  const { grid, floor } = context;
  const props = grid.streetProps ?? [];
  return cells.flatMap(([i, j]) =>
    props.map((id, index) =>
      freezePlacement({
        template: context.compiled({ id }, 1),
        turn: 0,
        origin: [i * pitchX, floor, j * pitchZ + grid.street + (grid.blockZ * (index + 1)) / (props.length + 1)].map(
          Math.floor,
        ) as Vec3,
      }),
    ),
  );
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
  const candidates = cells.filter(([i, j]) => i !== 0 || j !== 0);
  const serviceBlock = scenario
    ? candidates[Rng.stream(seed, `scenario:${scenario.id}:service-block`).int(0, candidates.length - 1)]!
    : undefined;
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
  const service =
    scenario && serviceBlock
      ? servicePlacement({
          template: context.compiled({ id: scenario.serviceTemplate }, 1, `scenario:${scenario.id}:service`),
          floor,
          grid,
          cell: serviceBlock,
          turn: Rng.stream(seed, `scenario:${scenario.id}:service-turn`).int(0, 3) as Turn,
        })
      : undefined;
  const composition = service && scenario ? composeScenario(registry, scenario, service, floor) : undefined;
  const fillCells = (forced: PoolRef[]): Placement[] => {
    context.counts = new Map();
    context.forced = forced;
    return cells.flatMap(([i, j]) =>
      service && serviceBlock?.[0] === i && serviceBlock[1] === j
        ? [service]
        : Array.from({ length: grid.rows ?? 2 }, (_, row) => fillRow(context, [i, j], row)).flat(),
    );
  };
  const placements = fillWithQuotas(context, fillCells, scenario ? `scenario:${scenario.id}:city` : 'city');
  if (composition) {
    placements.push(...composition.leads, ...composition.landmarks);
  }
  const pitchX = grid.street + grid.blockX;
  const pitchZ = grid.street + grid.blockZ;
  const spawn: Vec3 = [grid.street / 2, floor + 1, grid.street / 2];
  const bounds = {
    x0: -grid.blocksX * pitchX,
    z0: -grid.blocksZ * pitchZ,
    x1: grid.blocksX * pitchX + grid.street,
    z1: grid.blocksZ * pitchZ + grid.street,
  };
  placements.push(...streetPropPlacements(context, cells, pitchX, pitchZ));
  const structures = cityPerimeter(registry, grid, floor, bounds);
  return Object.freeze({
    grid: freezeGrid(grid),
    floor,
    bounds: Object.freeze(bounds),
    structures: Object.freeze(
      structures.map((box) => {
        Object.freeze(box.min);
        Object.freeze(box.max);
        return Object.freeze(box);
      }),
    ),
    placements: Object.freeze(placements),
    service,
    serviceBlock,
    candidates: Object.freeze(candidates),
    spawn: Object.freeze(spawn),
    portal: service && scenario ? portalOf(service, scenario) : undefined,
    composition,
  });
};
