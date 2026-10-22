import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { pickWeighted, Rng } from './random.ts';
import type { ScenarioRouteSpace } from './scenarioRoute.ts';
import type { MapPoolDef, PerimeterCrossingDef, ScenarioDef } from './schema.ts';
import { eligibilityExclusion } from './settlementPools.ts';
import { rectsOverlap } from './site.ts';
import { footprint, type Placement, placedPoint } from './templates.ts';

type Lot = NonNullable<ScenarioDef['city']['lots']>[number];
type Choice = MapPoolDef['choices'][number];
interface LotContext {
  lots?: ScenarioDef['city']['lots'];
  settlementKind?: string | undefined;
  pool?: string | undefined;
  fillRows?: boolean | undefined;
}
interface Ref {
  id: string;
  style?: string | undefined;
}
interface LotCompiler {
  seed: number;
  floor: number;
  compiled: (ref: Ref, storeys: number, siteId?: string) => Placement['template'];
}
export interface PlannedLot {
  readonly definition: Lot;
  readonly placement: Placement | undefined;
  readonly ref?: Ref;
}
type Issue = [string, string];
const frozenLot = (lot: Lot): Lot => {
  const copy = structuredClone(lot);
  Object.freeze(copy.position);
  Object.freeze(copy.size);
  if (copy.source) {
    Object.freeze(copy.source);
  }
  if (copy.routes) {
    for (const route of copy.routes) {
      Object.freeze(route.inside);
      Object.freeze(route.outside);
      Object.freeze(route);
    }
    Object.freeze(copy.routes);
  }
  return Object.freeze(copy);
};
export const lotRect = (lot: Lot) => ({
  x0: lot.position[0],
  z0: lot.position[1],
  x1: lot.position[0] + lot.size[0],
  z1: lot.position[1] + lot.size[1],
});

export const lotChoices = (registry: Registry, city: LotContext, lot: Lot): Choice[] => {
  if (!lot.source) {
    return [];
  }
  if (!city.settlementKind) {
    throw new Error('Authored building lots need a settlement kind');
  }
  const kind = city.settlementKind;
  const choices =
    lot.source.kind === 'pool'
      ? (registry.mapPools.get(lot.source.id)?.choices ?? [])
      : [{ ref: lot.source, weight: 1 }];
  const [along, depth] = lot.turn % 2 === 0 ? lot.size : [lot.size[1], lot.size[0]];
  return choices.filter(({ ref }) => eligibilityExclusion(registry, ref, kind, { along, depth }) === undefined);
};

const sourceIssues = (registry: Registry, city: LotContext, lot: Lot, path: string): Issue[] => {
  const issues: Issue[] = [];
  if (!lot.source) {
    return issues;
  }
  const refs =
    lot.source.kind === 'pool'
      ? (registry.mapPools.get(lot.source.id)?.choices ?? []).map(({ ref }) => ref)
      : [lot.source];
  for (const { id, kind, style } of refs) {
    if (registry.templates.has(id) && registry.mapAssemblies.has(id)) {
      issues.push([path, 'ambiguous template and assembly']);
    }
    if (style && (kind !== 'assembly' || !registry.mapStyles.has(style))) {
      issues.push([path, 'style needs an assembly and a known map style']);
    }
  }
  if (
    !lotChoices(registry, city, lot).some(
      ({ weight, atLeast, atMost }) => (weight > 0 || atLeast !== undefined) && atMost !== 0,
    )
  ) {
    issues.push([path, 'lot has no eligible building that fits its reserved footprint']);
  }
  return issues;
};
export const cityLotIssues = (registry: Registry, city: LotContext, bounds: ReturnType<typeof lotRect>): Issue[] => {
  const issues: Issue[] = [];
  const lots = city.lots ?? [];
  const ids = new Set<string>();
  lots.forEach((lot, index) => {
    const path = `.city.lots[${index}]`;
    if (ids.has(lot.id)) {
      issues.push([`${path}.id`, 'lot ids must be unique']);
    }
    ids.add(lot.id);
    const rect = lotRect(lot);
    if (rect.x0 < bounds.x0 || rect.z0 < bounds.z0 || rect.x1 > bounds.x1 || rect.z1 > bounds.z1) {
      issues.push([path, 'lot must fit inside the containment bounds']);
    }
    issues.push(...sourceIssues(registry, city, lot, `${path}.source`));
    if (lots.slice(0, index).some((other) => rectsOverlap(rect, lotRect(other)))) {
      issues.push([path, 'reserved lots must not overlap']);
    }
  });
  return issues;
};

interface PerimeterRoutes {
  readonly placement: Placement;
  readonly routes: readonly PerimeterCrossingDef[];
}

const crossingIssues = (
  { placement, routes }: PerimeterRoutes,
  space: ScenarioRouteSpace,
  entry: Vec3,
  path: string,
): Issue[] => {
  const issues: Issue[] = [];
  for (const [index, route] of routes.entries()) {
    const routePath = `${path}.routes[${index}]`;
    const inside = placedPoint(placement, route.inside);
    const outside = placedPoint(placement, route.outside);
    if (!space.path(entry, inside, { placement })) {
      issues.push([routePath, 'authored perimeter crossing must be reachable from the building entrance']);
    }
    if (!space.sweep(inside, outside)) {
      issues.push([routePath, 'authored entrance or breach must admit a direct supported body crossing']);
    }
  }
  return issues;
};
export const perimeterRouteIssues = (
  { placement, routes }: PerimeterRoutes,
  space: ScenarioRouteSpace,
  feet: readonly Readonly<Vec3>[],
  path: string,
): Issue[] => {
  const entrance = placement.template.access?.entrance;
  if (!entrance) {
    return [[path, 'authored building needs an entrance pose']];
  }
  const entry = placedPoint(placement, entrance);
  const issues: Issue[] = [];
  if (!feet.some((foot) => space.path(foot, entry))) {
    issues.push([path, 'authored building entrance is not reachable from the start']);
  }
  return [...issues, ...crossingIssues({ placement, routes }, space, entry, path)];
};

export const cityLotRouteIssues = (
  lots: readonly PlannedLot[],
  space: ScenarioRouteSpace,
  feet: readonly Readonly<Vec3>[],
): Issue[] => {
  const issues: Issue[] = [];
  for (const [index, lot] of lots.entries()) {
    if (!lot.placement || lot.definition.source?.kind === 'pool') {
      continue;
    }
    const path = `.city.lots[${index}]`;
    issues.push(
      ...perimeterRouteIssues({ placement: lot.placement, routes: lot.definition.routes ?? [] }, space, feet, path),
    );
  }
  return issues;
};

const matchQuotas = (required: Choice[], available: Lot[], candidates: Map<Lot, Choice[]>): Map<Lot, Choice> => {
  const owners = new Map<Lot, number>();
  const assign = (index: number, seen: Set<Lot>): boolean => {
    const choice = required[index]!;
    for (const lot of available) {
      if (seen.has(lot) || !candidates.get(lot)!.includes(choice)) {
        continue;
      }
      seen.add(lot);
      const previous = owners.get(lot);
      if (previous === undefined || assign(previous, seen)) {
        owners.set(lot, index);
        return true;
      }
    }
    return false;
  };
  for (let index = 0; index < required.length; index++) {
    if (!assign(index, new Set())) {
      throw new Error(`Pool quota cannot fit authored lots: ${required[index]!.ref.id}`);
    }
  }
  return new Map([...owners].map(([lot, index]) => [lot, required[index]!]));
};

const poolSelections = (registry: Registry, city: LotContext, poolId: string, seed: number): Map<Lot, Ref> => {
  const pool = registry.mapPools.get(poolId);
  if (!pool) {
    throw new Error(`Missing authored lot pool "${poolId}"`);
  }
  const available = (city.lots ?? []).filter((lot) => lot.source?.kind === 'pool' && lot.source.id === poolId);
  const candidates = new Map(available.map((lot) => [lot, lotChoices(registry, city, lot)]));
  const required =
    city.fillRows !== false && poolId === city.pool
      ? []
      : pool.choices.flatMap((choice) => Array.from({ length: choice.atLeast ?? 0 }, () => choice));
  const assigned = matchQuotas(required, available, candidates);
  const counts = new Map<Choice, number>();
  for (const choice of assigned.values()) {
    counts.set(choice, (counts.get(choice) ?? 0) + 1);
  }
  for (const lot of available) {
    if (assigned.has(lot)) {
      continue;
    }
    const choices = candidates
      .get(lot)!
      .filter((candidate) => (counts.get(candidate) ?? 0) < (candidate.atMost ?? Number.POSITIVE_INFINITY));
    const choice = pickWeighted(choices, Rng.stream(seed, `city:lot:${lot.id}`));
    if (!choice) {
      throw new Error(`Pool "${poolId}" cannot fill authored lot "${lot.id}" within its quotas`);
    }
    assigned.set(lot, choice);
    counts.set(choice, (counts.get(choice) ?? 0) + 1);
  }
  return new Map([...assigned].map(([lot, choice]) => [lot, choice.ref]));
};

const placedLot = (definition: Lot, ref: Ref | undefined, { floor, compiled }: LotCompiler): PlannedLot => {
  if (!ref) {
    return Object.freeze({ definition: frozenLot(definition), placement: undefined });
  }
  const template = compiled(ref, 1, `city:lot:${definition.id}`);
  const { turn } = definition;
  const extent = footprint({ template, origin: [0, 0, 0], turn });
  if (extent[0] > definition.size[0] || extent[1] > definition.size[1]) {
    throw new Error(`Building exceeds authored lot "${definition.id}"`);
  }
  const origin: Vec3 = [definition.position[0], floor - (template.groundLayer ?? 0), definition.position[1]];
  Object.freeze(origin);
  return Object.freeze({
    definition: frozenLot(definition),
    ref: Object.freeze({ ...ref }),
    placement: Object.freeze({ template, turn, origin }),
  });
};
const selectLotSources = (registry: Registry, city: LotContext, seed: number): Map<Lot, Ref> => {
  const lots = city.lots ?? [];
  const selected = new Map<Lot, Ref>();
  const pools = new Set(lots.flatMap((lot) => (lot.source?.kind === 'pool' ? [lot.source.id] : [])));
  for (const poolId of pools) {
    for (const [lot, ref] of poolSelections(registry, city, poolId, seed)) {
      selected.set(lot, ref);
    }
  }
  return selected;
};
export const cityLotQuotaIssues = (registry: Registry, city: LotContext): Issue[] => {
  try {
    selectLotSources(registry, city, 0);
    return [];
  } catch (error) {
    return [['.city.lots', error instanceof Error ? error.message : String(error)]];
  }
};
export const placeCityLots = (registry: Registry, city: LotContext, compiler: LotCompiler): readonly PlannedLot[] => {
  const selected = selectLotSources(registry, city, compiler.seed);
  return Object.freeze(
    (city.lots ?? []).map((lot) =>
      placedLot(lot, lot.source?.kind === 'pool' ? selected.get(lot) : lot.source, compiler),
    ),
  );
};
