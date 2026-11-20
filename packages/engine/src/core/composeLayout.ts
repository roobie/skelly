import { buildingIdentityIssues, inPolygon } from './authoredLayout.ts';
import { buildingFootprint, buildingSource, layoutBuildingSite, placementOf } from './authoredPlacement.ts';
import { lotOf } from './authoredTerrain.mjs';
import { createAuthoredGround } from './authoredTerrainEvaluator.ts';
import { claimed } from './capabilities.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { pickWeighted, Rng } from './random.ts';
import type { ComposedSiteDef } from './schema/scenarios.ts';
import type { KitPort, MapAssemblyDef, MapPoolDef, SiteLayoutDef } from './schema.ts';
import { eligibilityExclusion } from './settlementPools.ts';
import { TEMPLATE_BLOCK_SIZE } from './settlementSpawns.ts';
import type { Rect } from './site.ts';
import { rectsOverlap } from './site.ts';
import {
  type CompiledTemplate,
  compileAssembly,
  contentPointer,
  type Placement,
  placedPoint,
  placedPort,
  placedSpawns,
  portsMate,
} from './templates.ts';

export interface SiteReservation {
  ask: string;
  kind: 'building' | 'track' | 'anchor' | 'start';
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

type Issue = [path: string, message: string];
type LayoutBuilding = SiteLayoutDef['buildings'][number];
type Ask = ComposedSiteDef['asks'][number];
type PoolRef = MapPoolDef['choices'][number]['ref'];
type AskBuilding = Pick<LayoutBuilding, 'template' | 'style'>;
interface AskSite {
  scenario: ComposedSiteDef;
  ask: Ask;
  path: string;
}

export const guaranteeIssues = (scenario: ComposedSiteDef): Issue[] =>
  Object.entries(scenario.guarantee).flatMap(([material, required]) => {
    const count = scenario.asks.filter((ask) => ask.supplies.includes(material)).length;
    return count < required
      ? [[`.guarantee.${material}`, `needs ${required} sources of "${material}", found ${count}`] as Issue]
      : [];
  });

/** Why one building an ask may place cannot stand at this site, at the paths a template ask reports them. */
const askBuildingIssues = (registry: Registry, { scenario, ask, path }: AskSite, ref: PoolRef): Issue[] => {
  const identity = buildingIdentityIssues(registry, { template: ref.id, style: ref.style }, path);
  const source = buildingSource(registry, { template: ref.id });
  if (!source || identity.length > 0) {
    return identity;
  }
  const { definition } = source;
  const issues: Issue[] = [];
  // An ask reserves its own footprint, so only the settlement kind can exclude it.
  const fit = { along: definition.size[0], depth: definition.size[2] };
  const excluded =
    definition.eligibility && eligibilityExclusion(registry, ref, ask.settlementKind ?? scenario.settlementKind, fit);
  if (excluded) {
    issues.push([`${path}.template`, `ask "${ask.id}" ${ref.kind} "${ref.id}": ${excluded}`]);
  }
  if (ask.id === scenario.start.ask && !definition.access) {
    issues.push([`${path}.template`, `start ask "${ask.id}" needs a building entrance`]);
  }
  return issues;
};

/** A template ask answers for its template; a pool ask for every row it can draw, since any of them may stand there. */
const askIssues = (registry: Registry, site: AskSite): Issue[] => {
  const { ask, path } = site;
  if (ask.template !== undefined) {
    const kind = buildingSource(registry, { template: ask.template })?.kind ?? 'template';
    return askBuildingIssues(registry, site, { kind, id: ask.template, style: ask.style });
  }
  const pool = registry.mapPools.get(ask.pool!);
  if (!pool) {
    return [[`${path}.pool`, `no map pool "${ask.pool}"`]];
  }
  return pool.choices.flatMap(({ ref, weight, atLeast, atMost }): Issue[] => {
    if (weight <= 0) {
      return [];
    }
    const row = `pool "${pool.id}" row "${ref.id}"`;
    const counted: Issue[] =
      atLeast === undefined && atMost === undefined
        ? []
        : [[`${path}.pool`, `${row}: an ask places one building, so atLeast and atMost mean nothing`]];
    return [
      ...counted,
      ...askBuildingIssues(registry, site, ref).map(([, message]): Issue => [`${path}.pool`, `${row}: ${message}`]),
    ];
  });
};

/** Every assembly an ask may place, with the row that names it, so a link endpoint can check each one it can draw. */
const askAssemblies = (registry: Registry, ask: Ask): { assembly: MapAssemblyDef; row: string }[] => {
  if (ask.template !== undefined) {
    const source = buildingSource(registry, { template: ask.template });
    return source?.kind === 'assembly' ? [{ assembly: source.definition, row: ask.template }] : [];
  }
  return (registry.mapPools.get(ask.pool!)?.choices ?? []).flatMap(({ ref, weight }) =>
    weight > 0 && ref.kind === 'assembly' && registry.mapAssemblies.has(ref.id)
      ? [{ assembly: registry.mapAssemblies.get(ref.id)!, row: ref.id }]
      : [],
  );
};

const compileForLinks = (
  registry: Registry,
  assembly: MapAssemblyDef,
  cache: ReadonlyMap<string, CompiledTemplate | undefined>,
  setCache: (id: string, template: CompiledTemplate | undefined) => void,
): CompiledTemplate | undefined => {
  if (cache.has(assembly.id)) {
    return cache.get(assembly.id);
  }
  let compiled: CompiledTemplate | undefined;
  try {
    compiled = compileAssembly(registry, assembly, {
      seed: 0,
      siteId: `validation:${assembly.id}`,
      pieceCache: new Map(),
    });
  } catch {
    compiled = undefined;
  }
  setCache(assembly.id, compiled);
  return compiled;
};

/** Whether the port faces along the ground, so a road can dock with it. */
const horizontalPort = (port: KitPort): boolean => port.facing !== 'up' && port.facing !== 'down';

interface LinkGateContract {
  readonly type: string;
  readonly aperture: readonly [number, number];
}

/** The static contract a link endpoint needs from every assembly its ask can place at that gate. */
const linkEndpointIssues = (
  registry: Registry,
  scenario: ComposedSiteDef,
  link: ComposedSiteDef['links'][number],
  end: 'from' | 'to',
  path: string,
  cache: Map<string, CompiledTemplate | undefined>,
  setCache: (id: string, template: CompiledTemplate | undefined) => void,
): { issues: Issue[]; gates: LinkGateContract[] } => {
  const endpoint = link[end];
  const ask = scenario.asks.find((candidate) => candidate.id === endpoint.ask);
  if (!ask) {
    return { issues: [[`${path}.${end}.ask`, `link "${link.id}" names no ask "${endpoint.ask}"`]], gates: [] };
  }
  const issues: Issue[] = [];
  const gates: LinkGateContract[] = [];
  for (const { assembly, row } of askAssemblies(registry, ask)) {
    const compiled = compileForLinks(registry, assembly, cache, setCache);
    const port = compiled?.ports?.find((candidate) => candidate.id === endpoint.port);
    if (!(compiled && port)) {
      issues.push([
        `${path}.${end}.port`,
        `link "${link.id}" endpoint "${endpoint.ask}.${endpoint.port}" has no gate on assembly "${row}"`,
      ]);
      continue;
    }
    if (port.traversal !== 'walk' || !horizontalPort(port)) {
      issues.push([
        `${path}.${end}.port`,
        `link "${link.id}" endpoint "${endpoint.ask}.${endpoint.port}" on assembly "${row}" must be a ground-level walk gate`,
      ]);
      continue;
    }
    if (!registry.roadProfiles.has(port.type)) {
      issues.push([
        `${path}.${end}.port`,
        `link "${link.id}" endpoint "${endpoint.ask}.${endpoint.port}" on assembly "${row}" names no road profile "${port.type}"`,
      ]);
      continue;
    }
    gates.push({ type: port.type, aperture: port.aperture });
  }
  return { issues, gates };
};

const linkIssues = (registry: Registry, scenario: ComposedSiteDef): Issue[] => {
  const issues: Issue[] = [];
  const cache = new Map<string, CompiledTemplate | undefined>();
  const setCache = (id: string, template: CompiledTemplate | undefined): void => {
    cache.set(id, template);
  };
  const askIndex = new Map(scenario.asks.map((ask) => [ask.id, scenario.asks.indexOf(ask)]));
  const linkIds = new Set<string>();
  scenario.links.forEach((link, index) => {
    const path = `.links[${index}]`;
    if (linkIds.has(link.id)) {
      issues.push([`${path}.id`, `duplicate link "${link.id}"`]);
    }
    linkIds.add(link.id);
    const from = askIndex.get(link.from.ask);
    const to = askIndex.get(link.to.ask);
    if (from !== undefined && to !== undefined && from >= to) {
      issues.push([`${path}.from.ask`, `link "${link.id}" must leave an ask placed before "${link.to.ask}"`]);
    }
    const ends = (['from', 'to'] as const).map((end) =>
      linkEndpointIssues(registry, scenario, link, end, path, cache, setCache),
    );
    issues.push(...ends.flatMap(({ issues: endIssues }) => endIssues));
    const gates = ends.flatMap(({ gates: endGates }) => endGates);
    const transition = registry.mapAssemblies.get(link.transition.assembly);
    if (!transition) {
      issues.push([`${path}.transition.assembly`, `no map assembly "${link.transition.assembly}"`]);
      return;
    }
    const compiled = compileForLinks(registry, transition, cache, setCache);
    const transitionPorts = (['gate', 'outward'] as const).map((role) => ({
      role,
      port: compiled?.ports?.find((candidate) => candidate.id === link.transition[role]),
    }));
    if (!compiled || transitionPorts.some(({ port }) => !port)) {
      issues.push([
        `${path}.transition`,
        `transition "${link.transition.assembly}" does not compile with gates "${link.transition.gate}" and "${link.transition.outward}"`,
      ]);
      return;
    }
    const roles = transitionPorts.map(({ port }) => port!);
    if (
      roles.some((port) => port.traversal !== 'walk' || !horizontalPort(port)) ||
      roles[0]!.type !== roles[1]!.type ||
      roles[0]!.aperture.some((value, axis) => value !== roles[1]!.aperture[axis]) ||
      gates.some(
        (gate) =>
          gate.type !== roles[0]!.type || gate.aperture.some((value, axis) => value !== roles[0]!.aperture[axis]),
      )
    ) {
      issues.push([
        `${path}.transition`,
        `link "${link.id}" gates and transition "${link.transition.assembly}" must share one walk road profile and aperture`,
      ]);
    }
    if (!compiled.route) {
      issues.push([`${path}.transition`, `transition "${link.transition.assembly}" has no route through it`]);
    }
    if (!registry.blockIds.has(link.surface)) {
      issues.push([`${path}.surface`, `no block "${link.surface}"`]);
    }
  });
  return issues;
};

export const composedSiteIssues = (registry: Registry, scenario: ComposedSiteDef): Issue[] => {
  const issues = guaranteeIssues(scenario);
  const ids = new Set<string>();
  scenario.asks.forEach((ask, index) => {
    const path = `.asks[${index}]`;
    if (ids.has(ask.id)) {
      issues.push([`${path}.id`, `duplicate ask "${ask.id}"`]);
    }
    if (ask.distance && !ids.has(ask.distance.from)) {
      issues.push([`${path}.distance.from`, `ask "${ask.distance.from}" must precede "${ask.id}"`]);
    }
    ids.add(ask.id);
    issues.push(...askIssues(registry, { scenario, ask, path }));
  });
  if (!ids.has(scenario.start.ask)) {
    issues.push(['.start.ask', `no start ask "${scenario.start.ask}"`]);
  }
  const anchors = new Set<string>();
  scenario.anchors.forEach((anchor, index) => {
    if (anchors.has(anchor.id)) {
      issues.push([`.anchors[${index}].id`, `duplicate anchor "${anchor.id}"`]);
    }
    anchors.add(anchor.id);
  });
  scenario.eventRules.forEach((rule, index) => {
    rule.effects.forEach((effect, effectIndex) => {
      for (const id of typeof effect.at === 'string' ? [effect.at] : effect.at) {
        if (!anchors.has(id)) {
          issues.push([`.eventRules[${index}].effects[${effectIndex}].at`, `no anchor "${id}"`]);
        }
      }
    });
  });
  issues.push(...linkIssues(registry, scenario));
  return issues;
};

const overlaps = (a: SiteReservation, b: SiteReservation): boolean =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

// Integrating r * weight(r) makes the curve a density per area, not per radius.
const ringIntegral = ({ a, wa, b, wb }: { a: number; wa: number; b: number; wb: number }, radius: number): number => {
  const slope = (wb - wa) / (b - a);
  const t = radius - a;
  return a * wa * t + ((wa + a * slope) * t * t) / 2 + (slope * t * t * t) / 3;
};

const weightedRadius = (rng: Rng, curve: [number, number][]): number => {
  const segments = curve.slice(1).map(([b, wb], i) => {
    const [a, wa] = curve[i]!;
    return { a, wa, b, wb, mass: ringIntegral({ a, wa, b, wb }, b) };
  });
  let target = rng.next() * segments.reduce((sum, segment) => sum + segment.mass, 0);
  for (const segment of segments) {
    if (target > segment.mass) {
      target -= segment.mass;
      continue;
    }
    let low = segment.a;
    let high = segment.b;
    while (true) {
      const mid = low + (high - low) / 2;
      if (mid === low || mid === high) {
        return mid;
      }
      if (ringIntegral(segment, mid) < target) {
        low = mid;
      } else {
        high = mid;
      }
    }
  }
  return curve.at(-1)![0];
};

const anchorReservation = (
  anchor: ComposedSiteDef['anchors'][number],
  cell: [number, number, number],
): SiteReservation => ({
  ask: anchor.id,
  kind: 'anchor',
  x0: cell[0] * 0.5 - anchor.spawnMarginMetres,
  x1: (cell[0] + 1) * 0.5 + anchor.spawnMarginMetres,
  z0: cell[2] * 0.5 - anchor.spawnMarginMetres,
  z1: (cell[2] + 1) * 0.5 + anchor.spawnMarginMetres,
});

export const anchorCleared = (
  anchor: ComposedSiteDef['anchors'][number],
  cell: [number, number, number],
  layout: SiteLayoutDef,
  reservations: readonly SiteReservation[],
): boolean => {
  const x = cell[0] * 0.5;
  const z = cell[2] * 0.5;
  const reserved = anchorReservation(anchor, cell);
  return (
    x >= layout.bounds.x0 &&
    x < layout.bounds.x1 &&
    z >= layout.bounds.z0 &&
    z < layout.bounds.z1 &&
    Math.hypot(x - layout.player.position[0], z - layout.player.position[2]) >= anchor.minDistance &&
    !reservations.some(
      (other) =>
        (other.kind === 'anchor' ||
          (anchor.clearOf.includes('building') && (other.kind === 'building' || other.kind === 'start'))) &&
        overlaps(reserved, other),
    ) &&
    !(
      anchor.clearOf.includes('woodland') &&
      layout.woodlands.some((wood) => wood.density >= anchor.woodlandDensityFloor && inPolygon([x, z], wood.polygon))
    )
  );
};

const edgeCell = (rng: Rng, bounds: SiteLayoutDef['bounds']): [number, number] => {
  const width = bounds.x1 - bounds.x0;
  const depth = bounds.z1 - bounds.z0;
  const along = rng.next() * 2 * (width + depth);
  let point: [number, number];
  if (along < width) {
    point = [bounds.x0 + along, bounds.z0];
  } else if (along < width + depth) {
    point = [bounds.x1 - 0.5, bounds.z0 + along - width];
  } else if (along < 2 * width + depth) {
    point = [bounds.x1 - (along - width - depth), bounds.z1 - 0.5];
  } else {
    point = [bounds.x0, bounds.z1 - (along - 2 * width - depth)];
  }
  return [Math.floor(point[0] * 2), Math.floor(point[1] * 2)];
};

function resolveAnchors({
  seed,
  registry,
  scenario,
  layout,
  reservations,
}: {
  seed: number;
  registry: Registry;
  scenario: ComposedSiteDef;
  layout: SiteLayoutDef;
  reservations: SiteReservation[];
}): Record<string, [number, number, number]> {
  const tuning = claimed(registry.siteGeneration, 'authoredSite');
  if (!tuning) {
    throw new Error('Missing authored site generation tuning');
  }
  const rects = layout.buildings.map((building) => buildingFootprint(registry, building));
  const ground = createAuthoredGround({
    blockSize: 0.5,
    seed,
    topography: tuning.topography,
    layout,
    protectedBuildings: rects,
    spawnPoints: [
      [layout.player.position[0], layout.player.position[2]],
      ...layout.buildings
        .flatMap((building, i) =>
          placedSpawns(placementOf(registry, building, scenario.lootContext, layoutBuildingSite(seed, layout.id, i))),
        )
        .map((marker): [number, number] => [marker.pos[0] * 0.5, marker.pos[2] * 0.5]),
    ],
    lots: layout.buildings.map((building, i) => lotOf(building, rects[i]!)),
    tracks: layout.tracks.map((track) => ({
      points: track.points,
      width: track.width,
      surface: registry.blockIds.get(track.surface),
    })),
    catalogue: undefined,
  });
  const anchors: Record<string, [number, number, number]> = Object.create(null);
  for (const anchor of scenario.anchors) {
    const rng = Rng.stream(seed, `site:${scenario.id}:anchor:${anchor.id}`);
    let accepted = false;
    const attempts = anchor.kind === 'cell' ? 1 : scenario.placement.attempts;
    for (let attempt = 0; attempt < attempts; attempt++) {
      let cell: [number, number, number];
      if (anchor.kind === 'cell') {
        cell = [...anchor.at];
      } else {
        const [cx, cz] = edgeCell(rng, layout.bounds);
        cell = [cx, ground.height(cx, cz, scenario.ground * 2) + 1, cz];
      }
      if (!anchorCleared(anchor, cell, layout, reservations)) {
        continue;
      }
      anchors[anchor.id] = cell;
      reservations.push(anchorReservation(anchor, cell));
      accepted = true;
      break;
    }
    if (!accepted) {
      throw new Error(`Composed site "${scenario.id}": anchor "${anchor.id}" could not resolve`);
    }
  }
  return anchors;
}

/**
 * The building an ask places: its own template, or one pool row drawn from a stream of its own, so a pool ask leaves
 * every placement stream as a template ask would.
 */
const askBuilding = (seed: number, registry: Registry, scenario: ComposedSiteDef, ask: Ask): AskBuilding => {
  const { id: template, style } =
    ask.template === undefined
      ? pickWeighted(
          registry.mapPools.get(ask.pool!)!.choices,
          Rng.stream(seed, `site:${scenario.id}:ask:${ask.id}:pool`),
        )!.ref
      : { id: ask.template, style: ask.style };
  return { template, ...(style ? { style } : {}) };
};

/**
 * Whether a link's source gate can host its road at all: the transition that docks there must stand inside the
 * bounds beside the placing compound, clear of the buildings and reservations already placed. A source that
 * blocks its own exit is retried here, because no later placement can unblock it.
 */
const fromExitFits = (
  { seed, registry, scenario, buildings, reservations, pieceCache }: LinkFit,
  link: ComposedSiteDef['links'][number],
  building: LayoutBuilding,
): string | undefined => {
  const gateAt = (placed: LayoutBuilding, at: number): KitPort | undefined => {
    const placement = placementOf(registry, placed, scenario.lootContext, layoutBuildingSite(seed, scenario.id, at));
    const port = placement.template.ports?.find((candidate) => candidate.id === link.from.port);
    return port && placedPort(placement, port);
  };
  const gate = gateAt(building, buildings.length);
  const profile = gate && registry.roadProfiles.get(gate.type);
  const transition = registry.mapAssemblies.get(link.transition.assembly);
  if (!(gate && profile && transition)) {
    return `link "${link.id}" names a gate, road profile or transition that is missing`;
  }
  const compiled = compileAssembly(registry, transition, {
    ...layoutBuildingSite(seed, scenario.id, buildings.length + 1),
    pieceCache,
  });
  const dock = dockingPlacement(compiled, link.transition.gate, gate);
  const outwardPort =
    dock && dock.placement.template.ports?.find((candidate) => candidate.id === link.transition.outward);
  if (!(dock && outwardPort)) {
    return `link "${link.id}" transition "${link.transition.assembly}" cannot mate gate port "${link.transition.gate}"`;
  }
  const transitionBuilding: LayoutBuilding = {
    template: link.transition.assembly,
    position: dock.placement.origin.map((value) => value * TEMPLATE_BLOCK_SIZE) as [number, number, number],
    rotation: (dock.placement.turn * 90) as 0 | 90 | 180 | 270,
  };
  const rect = buildingFootprint(registry, transitionBuilding);
  const withShoulder = expandRect(rect, profile.widthMetres / 2);
  const { bounds } = scenario;
  // The road must also have somewhere to go: a lead past the outward mouth, one shoulder wide, inside the bounds.
  const outward = placedPort(dock.placement, outwardPort);
  const normal = (
    {
      n: [0, -1],
      s: [0, 1],
      e: [1, 0],
      w: [-1, 0],
    } as Record<'n' | 'e' | 's' | 'w', readonly [number, number]>
  )[outward.facing as 'n' | 'e' | 's' | 'w'];
  const mouth: readonly [number, number] = [outward.at[0] * TEMPLATE_BLOCK_SIZE, outward.at[2] * TEMPLATE_BLOCK_SIZE];
  const reach = profile.widthMetres / 2 + scenario.placement.apronMetres;
  const lead: Rect = {
    x0: Math.min(mouth[0], mouth[0] + normal[0] * reach) - profile.widthMetres / 2,
    z0: Math.min(mouth[1], mouth[1] + normal[1] * reach) - profile.widthMetres / 2,
    x1: Math.max(mouth[0], mouth[0] + normal[0] * reach) + profile.widthMetres / 2,
    z1: Math.max(mouth[1], mouth[1] + normal[1] * reach) + profile.widthMetres / 2,
  };
  if (
    withShoulder.x0 < bounds.x0 ||
    withShoulder.z0 < bounds.z0 ||
    withShoulder.x1 > bounds.x1 ||
    withShoulder.z1 > bounds.z1 ||
    lead.x0 < bounds.x0 ||
    lead.z0 < bounds.z0 ||
    lead.x1 > bounds.x1 ||
    lead.z1 > bounds.z1 ||
    buildings.some((placed) => rectsOverlap(buildingFootprint(registry, placed), rect)) ||
    reservations.some(
      (other) =>
        other.ask !== link.from.ask &&
        (overlaps({ ask: link.id, kind: 'track', ...rect }, other) ||
          overlaps({ ask: link.id, kind: 'track', ...lead }, other)),
    )
  ) {
    return `link "${link.id}" has no room beside ask "${link.from.ask}" for its road to leave`;
  }
  return undefined;
};

/** One try at where an ask's building stands: around the ask it keeps its distance from, else anywhere in bounds. */
const askCandidate = (
  rng: Rng,
  ask: Ask,
  scenario: ComposedSiteDef,
  placements: ReadonlyMap<string, LayoutBuilding>,
): Pick<LayoutBuilding, 'position' | 'rotation'> => {
  let x: number;
  let z: number;
  if (ask.distance) {
    const from = placements.get(ask.distance.from)!;
    const radius = weightedRadius(rng, ask.distance.curve);
    const angle = rng.next() * Math.PI * 2;
    x = from.position[0] + Math.cos(angle) * radius;
    z = from.position[2] + Math.sin(angle) * radius;
  } else {
    x = rng.range(scenario.bounds.x0, scenario.bounds.x1);
    z = rng.range(scenario.bounds.z0, scenario.bounds.z1);
  }
  return {
    position: [Math.round(x * 2) / 2, scenario.ground, Math.round(z * 2) / 2],
    rotation: (rng.int(0, 3) * 90) as 0 | 90 | 180 | 270,
  };
};

/** Whether any part of the segment lies inside the rectangle. */
const segmentEntersRect = (
  [ax, az]: readonly [number, number],
  [bx, bz]: readonly [number, number],
  rect: Rect,
): boolean => {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  for (const [p, q] of [
    [-dx, ax - rect.x0],
    [dx, rect.x1 - ax],
    [-dz, az - rect.z0],
    [dz, rect.z1 - az],
  ] as const) {
    if (p === 0) {
      if (q < 0) {
        return false;
      }
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) {
          return false;
        }
        if (t > t0) {
          t0 = t;
        }
      } else {
        if (t < t0) {
          return false;
        }
        if (t < t1) {
          t1 = t;
        }
      }
    }
  }
  return true;
};

const expandRect = ({ x0, z0, x1, z1 }: Rect, by: number): Rect => ({
  x0: x0 - by,
  z0: z0 - by,
  x1: x1 + by,
  z1: z1 + by,
});

interface PlannedTransition {
  readonly building: LayoutBuilding;
  readonly rect: Rect;
  readonly outward: KitPort;
  readonly route: readonly Vec3[];
}

interface PlannedRoad {
  readonly link: ComposedSiteDef['links'][number];
  readonly transitions: readonly PlannedTransition[];
  readonly corridor: Rect;
  readonly track: SiteLayoutDef['tracks'][number];
}

/** The turn and origin that dock one of a template's ports exactly against an already-placed gate. */
const dockingPlacement = (
  template: CompiledTemplate,
  portId: string,
  gate: KitPort,
): { placement: Placement } | undefined => {
  const port = template.ports?.find((candidate) => candidate.id === portId);
  if (!port) {
    return undefined;
  }
  for (const turn of [0, 1, 2, 3] as const) {
    const offset = placedPoint({ template, origin: [0, 0, 0], turn }, port.at);
    const placement: Placement = {
      template,
      origin: gate.at.map((value, axis) => value - offset[axis]!) as Vec3,
      turn,
    };
    if (portsMate(gate, placedPort(placement, port))) {
      return { placement };
    }
  }
  return undefined;
};

interface LinkFit {
  readonly seed: number;
  readonly registry: Registry;
  readonly scenario: ComposedSiteDef;
  readonly buildings: readonly LayoutBuilding[];
  readonly indices: ReadonlyMap<string, number>;
  readonly reservations: readonly SiteReservation[];
  readonly pieceCache: Map<string, CompiledTemplate>;
  /** Roads this ask already accepted in the same attempt, so a later link cannot cross an earlier one. */
  readonly plannedRoads: readonly PlannedRoad[];
}

/**
 * One try at joining a link's gates: dock the authored transition at each gate, then check the transitions and the
 * between-transition track against the bounds, the buildings' footprints and every other reservation.
 */
const planLink = (
  { seed, registry, scenario, buildings, indices, reservations, pieceCache, plannedRoads }: LinkFit,
  link: ComposedSiteDef['links'][number],
  toBuilding: LayoutBuilding,
): { road: PlannedRoad } | { failure: string } => {
  const bounds = scenario.bounds;
  const gateAt = (building: LayoutBuilding, index: number, portId: string): KitPort | undefined => {
    const placement = placementOf(
      registry,
      building,
      scenario.lootContext,
      layoutBuildingSite(seed, scenario.id, index),
    );
    const port = placement.template.ports?.find((candidate) => candidate.id === portId);
    return port && placedPort(placement, port);
  };
  const describe = (reason: string): { failure: string } => ({
    failure:
      `link "${link.id}" cannot join ask "${link.from.ask}" port "${link.from.port}" to ask "${link.to.ask}" ` +
      `port "${link.to.port}" through road profile "${profileId}" with transition "${link.transition.assembly}" ` +
      `(${contentPointer(registry, 'mapAssemblies', link.transition.assembly)}): ${reason}`,
  });
  const fromIndex = indices.get(link.from.ask) ?? 0;
  const fromGate = gateAt(buildings[fromIndex]!, fromIndex, link.from.port);
  const toGate = gateAt(toBuilding, buildings.length, link.to.port);
  const profileId = fromGate?.type ?? toGate?.type ?? '?';
  if (!(fromGate && toGate)) {
    return describe('a named gate is missing from its placed assembly');
  }
  const profile = registry.roadProfiles.get(fromGate.type);
  const transition = registry.mapAssemblies.get(link.transition.assembly);
  if (!(profile && transition)) {
    return describe('the road profile or transition assembly is missing');
  }
  const transitions: PlannedTransition[] = [];
  for (const gatePort of [fromGate, toGate]) {
    const compiled = compileAssembly(registry, transition, {
      ...layoutBuildingSite(seed, scenario.id, buildings.length + 1 + transitions.length),
      pieceCache,
    });
    const dock = dockingPlacement(compiled, link.transition.gate, gatePort);
    const outwardPort =
      dock && dock.placement.template.ports?.find((candidate) => candidate.id === link.transition.outward);
    if (!(dock && outwardPort)) {
      return describe(`transition "${link.transition.assembly}" cannot mate gate port "${link.transition.gate}"`);
    }
    const building: LayoutBuilding = {
      template: link.transition.assembly,
      position: dock.placement.origin.map((value) => value * TEMPLATE_BLOCK_SIZE) as [number, number, number],
      rotation: (dock.placement.turn * 90) as 0 | 90 | 180 | 270,
    };
    transitions.push({
      building,
      rect: buildingFootprint(registry, building),
      outward: placedPort(dock.placement, outwardPort),
      route: (dock.placement.template.route ?? []).map((point) => placedPoint(dock.placement, point)),
    });
  }
  const margin = profile.widthMetres / 2;
  const footprints = [
    ...buildings.map((building) => ({ rect: buildingFootprint(registry, building), label: building.template })),
    ...plannedRoads.flatMap((road) =>
      road.transitions.map((transition) => ({ rect: transition.rect, label: transition.building.template })),
    ),
    { rect: buildingFootprint(registry, toBuilding), label: toBuilding.template },
  ];
  const ownAsks = new Set([link.from.ask, link.to.ask]);
  for (const transitionPlan of transitions) {
    const withShoulder = expandRect(transitionPlan.rect, margin);
    if (
      withShoulder.x0 < bounds.x0 ||
      withShoulder.z0 < bounds.z0 ||
      withShoulder.x1 > bounds.x1 ||
      withShoulder.z1 > bounds.z1
    ) {
      return describe('a transition of the road leaves the site bounds');
    }
    if (footprints.some(({ rect }) => rectsOverlap(rect, transitionPlan.rect))) {
      return describe(
        `a transition of the road crosses the footprint of building "${transitionPlan.building.template}"`,
      );
    }
  }
  const metres = (point: Vec3): [number, number] => [point[0] * TEMPLATE_BLOCK_SIZE, point[2] * TEMPLATE_BLOCK_SIZE];
  const from = metres(transitions[0]!.outward.at);
  const to = metres(transitions[1]!.outward.at);
  const trackReservations: SiteReservation[] = plannedRoads.flatMap((road) => [
    ...road.transitions.map((transition) => ({ ask: road.link.id, kind: 'track' as const, ...transition.rect })),
    { ask: road.link.id, kind: 'track' as const, ...road.corridor },
  ]);
  const crossedBuilding = footprints.find(({ rect }) => segmentEntersRect(from, to, expandRect(rect, margin)));
  const crossedReservation = [...reservations, ...trackReservations]
    .filter((other) => !ownAsks.has(other.ask))
    .find((other) => segmentEntersRect(from, to, expandRect(other, margin)));
  if (crossedBuilding) {
    return describe(`the road crosses building "${crossedBuilding.label}"`);
  }
  if (crossedReservation) {
    return describe(`the road crosses the reserved area of ask "${crossedReservation.ask}"`);
  }
  const corridor = expandRect(
    {
      x0: Math.min(from[0], to[0]),
      z0: Math.min(from[1], to[1]),
      x1: Math.max(from[0], to[0]),
      z1: Math.max(from[1], to[1]),
    },
    margin + scenario.placement.apronMetres,
  );
  if (
    corridor.x0 < bounds.x0 ||
    corridor.z0 < bounds.z0 ||
    corridor.x1 > bounds.x1 ||
    corridor.z1 > bounds.z1 ||
    [...reservations, ...trackReservations].some(
      (other) => !ownAsks.has(other.ask) && overlaps({ ask: link.id, kind: 'track', ...corridor }, other),
    )
  ) {
    return describe('the road leaves the site bounds or crosses a reserved area of another ask');
  }
  const track = {
    points: [
      ...transitions[0]!.route.map((point) => metres(point)),
      ...[...transitions[1]!.route].reverse().map((point) => metres(point)),
    ],
    width: profile.widthMetres,
    surface: link.surface,
  };
  return { road: { link, transitions, corridor, track } };
};

/**
 * The player at the start building's entrance, facing out of its nearest side. It reads the building as the site will
 * compile it for this seed, so an assembly start uses the alternative that is stamped.
 */
const startPlayer = ({
  seed,
  registry,
  scenario,
  buildings,
  start,
}: {
  seed: number;
  registry: Registry;
  scenario: ComposedSiteDef;
  buildings: SiteLayoutDef['buildings'];
  start: LayoutBuilding;
}): SiteLayoutDef['player'] => {
  const placement = placementOf(
    registry,
    start,
    scenario.lootContext,
    layoutBuildingSite(seed, scenario.id, buildings.indexOf(start)),
  );
  const { template } = placement;
  const { entrance } = template.access!;
  const position = placedPoint(placement, entrance).map((v) => v * 0.5) as [number, number, number];
  const [x, , z] = entrance;
  const sides = [z, template.size[0] - 1 - x, template.size[2] - 1 - z, x];
  const facing = sides.indexOf(Math.min(...sides));
  return { position, bearing: (facing * 90 + start.rotation) % 360 };
};

export const composeLayout = (
  seed: number,
  registry: Registry,
  scenario: ComposedSiteDef,
): {
  layout: SiteLayoutDef;
  reservations: SiteReservation[];
  anchors: Record<string, [number, number, number]>;
  eventRules: import('./schema/scenarios.ts').EventRuleDef[];
} => {
  const issues = composedSiteIssues(registry, scenario);
  if (issues.length > 0) {
    throw new Error(
      `Composed site "${scenario.id}": ${issues.map(([path, message]) => `${path}: ${message}`).join('; ')}`,
    );
  }
  const buildings: SiteLayoutDef['buildings'] = [];
  const reservations: SiteReservation[] = [];
  const placements = new Map<string, LayoutBuilding>();
  const indices = new Map<string, number>();
  const tracks: SiteLayoutDef['tracks'] = [];
  const pieceCache = new Map<string, CompiledTemplate>();
  const {
    bounds,
    placement: { apronMetres, attempts },
  } = scenario;
  for (const ask of scenario.asks) {
    const rng = Rng.stream(seed, `site:${scenario.id}:ask:${ask.id}`);
    const chosen = askBuilding(seed, registry, scenario, ask);
    const links = scenario.links.filter(({ to }) => to.ask === ask.id);
    let accepted = false;
    let linkFailure: string | undefined;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const building = { ...chosen, ...askCandidate(rng, ask, scenario, placements) };
      const rect = buildingFootprint(registry, building);
      const reserved: SiteReservation = {
        ask: ask.id,
        kind: ask.id === scenario.start.ask ? 'start' : 'building',
        x0: rect.x0 - apronMetres,
        z0: rect.z0 - apronMetres,
        x1: rect.x1 + apronMetres,
        z1: rect.z1 + apronMetres,
      };
      if (
        reserved.x0 < bounds.x0 ||
        reserved.z0 < bounds.z0 ||
        reserved.x1 > bounds.x1 ||
        reserved.z1 > bounds.z1 ||
        reservations.some((other) => overlaps(reserved, other))
      ) {
        continue;
      }
      // A source compound whose gate cannot host its road is retried like any other bad candidate; only a
      // destination's full road is fitted below, once its own placement exists to fit against.
      const exitFailure = scenario.links
        .filter((link) => link.from.ask === ask.id && link.to.ask !== ask.id)
        .map((link) =>
          fromExitFits(
            { seed, registry, scenario, buildings, indices, reservations, pieceCache, plannedRoads: [] },
            link,
            building,
          ),
        )
        .find((reason): reason is string => reason !== undefined);
      if (exitFailure) {
        linkFailure = exitFailure;
        continue;
      }
      // A link counts only once its gates mate, its transitions stand clear and its track connects, so an ask that
      // blocks the road is refused with the link's own reason rather than silently dropping the join.
      const roads: PlannedRoad[] = [];
      linkFailure = undefined;
      for (const link of links) {
        const planned = planLink(
          { seed, registry, scenario, buildings, indices, reservations, pieceCache, plannedRoads: roads },
          link,
          building,
        );
        if ('failure' in planned) {
          linkFailure = planned.failure;
          break;
        }
        roads.push(planned.road);
      }
      if (linkFailure) {
        continue;
      }
      buildings.push(building);
      indices.set(ask.id, buildings.length - 1);
      placements.set(ask.id, building);
      reservations.push(reserved);
      for (const road of roads) {
        for (const transition of road.transitions) {
          buildings.push(transition.building);
          reservations.push({ ask: road.link.id, kind: 'track', ...transition.rect });
        }
        reservations.push({ ask: road.link.id, kind: 'track', ...road.corridor });
        tracks.push(road.track);
      }
      accepted = true;
      break;
    }
    if (!accepted) {
      throw new Error(
        `Composed site "${scenario.id}": ask "${ask.id}" did not fit after ${attempts} attempts` +
          (linkFailure ? `: ${linkFailure}` : ''),
      );
    }
  }
  const layout: SiteLayoutDef = {
    id: scenario.id,
    ...(scenario.attemptPolicy ? { attemptPolicy: scenario.attemptPolicy } : {}),
    lootContext: scenario.lootContext,
    bounds,
    ground: scenario.ground,
    buildings,
    player: startPlayer({ seed, registry, scenario, buildings, start: placements.get(scenario.start.ask)! }),
    terrain: [],
    actors: [],
    woodlands: [],
    tracks,
  };
  const anchors = resolveAnchors({ seed, registry, scenario, layout, reservations });
  const eventRules = scenario.eventRules.map((rule) => {
    const rng = Rng.stream(seed, `site:${scenario.id}:wave:${rule.id}`);
    return {
      ...rule,
      effects: rule.effects.map((effect) => {
        const ids = typeof effect.at === 'string' ? [effect.at] : effect.at;
        return { ...effect, at: [...anchors[ids[rng.int(0, ids.length - 1)]!]!] as [number, number, number] };
      }),
    };
  });
  return { layout, reservations, anchors, eventRules };
};
