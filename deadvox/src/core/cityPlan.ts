import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { HAMLET_TEMPLATES } from './hamlet.ts';
import { hash3, Rng } from './random.ts';
import { composeScenario, type ScenarioComposition, scenarioCompositionIssues } from './scenarioComposition.ts';
import { portalLadderPoint, scenarioPortalIssues } from './scenarioPortal.ts';
import type { ScenarioDef } from './schema.ts';
import type { Rect } from './site.ts';
import { STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from './stairFlight.ts';
import {
  compileTemplate,
  footprint,
  type Placement,
  placedPoint,
  stackTemplate,
  type Turn,
  templateResolves,
} from './templates.ts';

export const CITY = { street: 12, blockX: 104, blockZ: 64, pad: 2, gap: 2, reach: 400, blend: 24 } as const;
const SINGLE_STOREY = new Set(['gas_station', 'shed']);
export type CityGrid = Omit<ScenarioDef['city'], 'templates'> & { readonly templates: readonly string[] };
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
  templates: [...HAMLET_TEMPLATES],
});

export const scenarioPlanIssues = (registry: Registry, scenario: ScenarioDef): [string, string][] => {
  const issues: [string, string][] = [];
  if (!registry.blockIds.has('asphalt')) {
    issues.push(['.city', 'city needs asphalt content']);
  }
  const { city, serviceTemplate } = scenario;
  const width = city.blockX - 2 * city.pad;
  const depth = city.blockZ - 2 * city.pad;
  for (const id of city.templates) {
    const template = registry.templates.get(id);
    if (!template) {
      issues.push(['.city.templates', `no template "${id}"`]);
    } else if (template.size[0] > width || 2 * template.size[2] > depth) {
      issues.push(['.city.templates', `template "${id}" does not fit the two reserved-apron rows`]);
    }
  }
  const service = registry.templates.get(serviceTemplate);
  if (service) {
    if (Math.max(service.size[0], service.size[2]) > Math.min(width, depth)) {
      issues.push(['.serviceTemplate', 'service template must fit every quarter turn inside its reserved block']);
    }
    if (templateResolves(registry, service)) {
      const compiled = compileTemplate(registry, service);
      issues.push(...scenarioPortalIssues(registry, scenario, compiled));
      issues.push(...scenarioCompositionIssues(registry, scenario, compiled));
    } else {
      issues.push(['.serviceTemplate', 'service template has unresolved palette references']);
    }
  } else {
    issues.push(['.serviceTemplate', `no template "${serviceTemplate}"`]);
  }
  return issues;
};

const portalOf = (registry: Registry, service: Placement, scenario: ScenarioDef): Portal => {
  const upper = placedPoint(service, scenario.portal.upper);
  const lower = placedPoint(service, scenario.portal.lower);
  const shaft = placedPoint(service, portalLadderPoint(registry, scenario, service.template));
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

const templateCompiler = (registry: Registry) => {
  const cache = new Map<string, ReturnType<typeof compileTemplate>>();
  return (id: string, storeys: number) => {
    const key = `${id}:${storeys}`;
    let template = cache.get(key);
    if (!template) {
      const definition = registry.templates.get(id);
      if (!definition) {
        throw new Error(`Missing city template "${id}"`);
      }
      template = stackTemplate(compileTemplate(registry, definition), storeys);
      cache.set(key, template);
    }
    return template;
  };
};

interface FillContext {
  seed: number;
  floor: number;
  grid: CityGrid;
  maxStoreys: number;
  incidentalTemplates: readonly string[];
  compiled: ReturnType<typeof templateCompiler>;
}
const fillRow = (context: FillContext, [i, j]: Cell, row: 0 | 1): Placement[] => {
  const { seed, floor, grid, compiled, maxStoreys } = context;
  const pitchX = grid.street + grid.blockX;
  const pitchZ = grid.street + grid.blockZ;
  const end = (i + 1) * pitchX - grid.pad;
  const turn = row === 0 ? 0 : 2;
  let x = i * pitchX + grid.street + grid.pad;
  const placements: Placement[] = [];
  for (let k = 0; ; k++) {
    const fits = (name: string) => footprint({ template: compiled(name, 1), origin: [0, 0, 0], turn })[0] <= end - x;
    const pool =
      k === 0 && row === 0 && context.incidentalTemplates.length > 0 ? context.incidentalTemplates : grid.templates;
    const first = pool[Math.floor(hash3(seed, i * 64 + k, j * 2 + row, 0) * pool.length)]!;
    const id = fits(first) ? first : grid.templates.find(fits);
    if (!id) {
      break;
    }
    const storeys = SINGLE_STOREY.has(id) ? 1 : 1 + Math.floor(hash3(seed, i, j * 2 + row, k + 1000) * maxStoreys);
    const template = compiled(id, storeys);
    const [width, depth] = footprint({ template, origin: [0, 0, 0], turn });
    const z = row === 0 ? j * pitchZ + grid.street + grid.pad : (j + 1) * pitchZ - grid.pad - depth;
    placements.push(freezePlacement({ template, origin: [x, floor, z], turn }));
    x += width + grid.gap;
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
      floor - (template.groundLayer ?? 0),
      j * (grid.street + grid.blockZ) + grid.street + grid.pad,
    ],
    turn,
  });

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
    maxStoreys: scenario ? 1 : maxStoreys,
    incidentalTemplates: scenario?.composition?.incidentalTemplates ?? [],
    compiled: templateCompiler(registry),
  };
  const service =
    scenario && serviceBlock
      ? servicePlacement({
          template: context.compiled(scenario.serviceTemplate, 1),
          floor,
          grid,
          cell: serviceBlock,
          turn: Rng.stream(seed, `scenario:${scenario.id}:service-turn`).int(0, 3) as Turn,
        })
      : undefined;
  const composition = service && scenario ? composeScenario(registry, scenario, service, floor) : undefined;
  const placements = cells.flatMap(([i, j]) =>
    service && serviceBlock?.[0] === i && serviceBlock[1] === j
      ? [service]
      : [...fillRow(context, [i, j], 0), ...fillRow(context, [i, j], 1)],
  );
  if (composition) {
    placements.push(...composition.leads, ...composition.landmarks);
  }
  const pitchX = grid.street + grid.blockX;
  const pitchZ = grid.street + grid.blockZ;
  const spawn: Vec3 = [grid.street / 2, floor + 1, grid.street / 2];
  return Object.freeze({
    grid: Object.freeze({ ...grid, templates: Object.freeze([...grid.templates]) }),
    floor,
    bounds: Object.freeze({
      x0: -grid.blocksX * pitchX,
      z0: -grid.blocksZ * pitchZ,
      x1: grid.blocksX * pitchX + grid.street,
      z1: grid.blocksZ * pitchZ + grid.street,
    }),
    placements: Object.freeze(placements),
    service,
    serviceBlock,
    candidates: Object.freeze(candidates),
    spawn: Object.freeze(spawn),
    portal: service && scenario ? portalOf(registry, service, scenario) : undefined,
    composition,
  });
};
