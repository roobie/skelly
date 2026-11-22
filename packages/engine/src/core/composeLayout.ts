import { buildingIdentityIssues } from './authoredLayout.ts';
import { buildingFootprint, buildingSource, layoutBuildingSite, placementOf } from './authoredPlacement.ts';
import { lotOf } from './authoredTerrain.mjs';
import { type AuthoredGroundData, createAuthoredGround } from './authoredTerrainEvaluator.ts';
import { createBaselineCover } from './baselineCover.ts';
import { claimed } from './capabilities.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { snapToPlacementGrid } from './placementGrid.ts';
import { pickWeighted, Rng } from './random.ts';
import type { ComposedSiteDef } from './schema/scenarios.ts';
import type { KitPort, MapAssemblyDef, MapPoolDef, SiteLayoutDef } from './schema.ts';
import { eligibilityExclusion, frontFacingTurn } from './settlementPools.ts';
import { TEMPLATE_BLOCK_SIZE } from './settlementSpawns.ts';
import type { Rect } from './site.ts';
import { rectsOverlap } from './site.ts';
import {
  type CompiledTemplate,
  compileAssembly,
  contentPointer,
  footprint,
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
  // An ask reserves its own footprint, so only the settlement kind can exclude it; the fit and the turn agree so the
  // size test stays vacuous whatever edge the building declares its front.
  const turn = frontFacingTurn(definition.access?.front);
  const [along, depth] = footprint({ template: definition, turn });
  const fit = { along, depth, turn };
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

/** Every draw an ask can place, with the row that names it, so a link endpoint checks each one it can draw. */
const askDraws = (registry: Registry, ask: Ask): { source: ReturnType<typeof buildingSource>; row: string }[] => {
  if (ask.template !== undefined) {
    return [{ source: buildingSource(registry, { template: ask.template }), row: ask.template }];
  }
  return (registry.mapPools.get(ask.pool!)?.choices ?? [])
    .filter(({ weight }) => weight > 0)
    .map(({ ref }) => ({ source: buildingSource(registry, { template: ref.id }), row: ref.id }));
};

interface LinkContext {
  readonly registry: Registry;
  readonly scenario: ComposedSiteDef;
  readonly compile: (assembly: MapAssemblyDef) => CompiledTemplate | undefined;
}

/** One compiled answer per assembly id, shared by every static link check of a scenario. */
const linkCompiler = (registry: Registry): LinkContext['compile'] => {
  const cache = new Map<string, CompiledTemplate | undefined>();
  return (assembly) => {
    if (!cache.has(assembly.id)) {
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
      cache.set(assembly.id, compiled);
    }
    return cache.get(assembly.id);
  };
};

/** Whether the port faces along the ground, so a road can dock with it. */
const horizontalPort = (port: KitPort): boolean => port.facing !== 'up' && port.facing !== 'down';

interface LinkGateContract {
  readonly type: string;
  readonly aperture: readonly [number, number];
}

/** The static contract a link endpoint needs from every draw its ask can place at that gate: each draw must be an
 * assembly carrying that road gate, so no runtime draw can surprise the link with a missing gate. */
const linkEndpointIssues = (
  { registry, scenario, compile }: LinkContext,
  link: ComposedSiteDef['links'][number],
  end: 'from' | 'to',
  path: string,
): { issues: Issue[]; gates: LinkGateContract[] } => {
  const endpoint = link[end];
  const ask = scenario.asks.find((candidate) => candidate.id === endpoint.ask);
  if (!ask) {
    return { issues: [[`${path}.${end}.ask`, `link "${link.id}" names no ask "${endpoint.ask}"`]], gates: [] };
  }
  const issues: Issue[] = [];
  const gates: LinkGateContract[] = [];
  for (const { source, row } of askDraws(registry, ask)) {
    if (source?.kind !== 'assembly') {
      issues.push([
        `${path}.${end}.ask`,
        `link "${link.id}" endpoint "${endpoint.ask}" must place an assembly carrying gate "${endpoint.port}", not "${row}"`,
      ]);
      continue;
    }
    const compiled = compile(source.definition);
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

/** Whether a point sits on a port's mouth, point for point. */
const onPortMouth = (point: Vec3, port: KitPort): boolean => port.at.every((value, axis) => value === point[axis]);

/** The transition piece's own static contract: it compiles, its two named ports share one walk road profile and
 * aperture with both gates, and its route runs between those two ports' mouths, in either authored order. */
const transitionIssues = (
  { registry, compile }: Pick<LinkContext, 'registry' | 'compile'>,
  link: ComposedSiteDef['links'][number],
  path: string,
  gates: readonly LinkGateContract[],
): Issue[] => {
  const transition = registry.mapAssemblies.get(link.transition.assembly);
  if (!transition) {
    return [[`${path}.transition.assembly`, `no map assembly "${link.transition.assembly}"`]];
  }
  const compiled = compile(transition);
  const portOf = (role: 'gate' | 'outward') =>
    compiled?.ports?.find((candidate) => candidate.id === link.transition[role]);
  const [gate, outward] = [portOf('gate'), portOf('outward')];
  if (!(compiled && gate && outward)) {
    return [
      [
        `${path}.transition`,
        `transition "${link.transition.assembly}" does not compile with gates "${link.transition.gate}" and "${link.transition.outward}"`,
      ],
    ];
  }
  const issues: Issue[] = [];
  const surfaceOf = (type: string): string | undefined => registry.roadProfiles.get(type)?.surface;
  const surfaces = new Set(
    [...gates.map((contract) => contract.type), gate.type, outward.type]
      .map(surfaceOf)
      .filter((surface) => surface !== undefined),
  );
  if (surfaces.size > 1) {
    issues.push([
      `${path}.transition`,
      `link "${link.id}" joins road profiles of different surfaces through transition "${link.transition.assembly}", which does not change surface`,
    ]);
  } else if (
    [gate, outward].some((port) => port.traversal !== 'walk' || !horizontalPort(port)) ||
    gate.type !== outward.type ||
    gate.aperture.some((value, axis) => value !== outward.aperture[axis]) ||
    gates.some(
      (contract) =>
        contract.type !== gate.type || contract.aperture.some((value, axis) => value !== gate.aperture[axis]),
    )
  ) {
    issues.push([
      `${path}.transition`,
      `link "${link.id}" gates and transition "${link.transition.assembly}" must share one walk road profile and aperture`,
    ]);
  }
  const { route } = compiled;
  const runsBetween = (a: KitPort, b: KitPort): boolean =>
    route !== undefined &&
    ((onPortMouth(route[0]!, a) && onPortMouth(route.at(-1)!, b)) ||
      (onPortMouth(route[0]!, b) && onPortMouth(route.at(-1)!, a)));
  if (!runsBetween(gate, outward)) {
    issues.push([
      `${path}.transition`,
      `transition "${link.transition.assembly}" needs a route between ports "${link.transition.gate}" and "${link.transition.outward}"`,
    ]);
  }
  return issues;
};

const linkIssues = ({ registry, scenario, compile }: LinkContext): Issue[] => {
  const issues: Issue[] = [];
  const askIndex = new Map(scenario.asks.map((ask, index) => [ask.id, index]));
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
      linkEndpointIssues({ registry, scenario, compile }, link, end, path),
    );
    issues.push(...ends.flatMap(({ issues: endIssues }) => endIssues));
    issues.push(
      ...transitionIssues(
        { registry, compile },
        link,
        path,
        ends.flatMap(({ gates }) => gates),
      ),
    );
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
  issues.push(...linkIssues({ registry, scenario, compile: linkCompiler(registry) }));
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
  {
    reservations,
    densityAt,
  }: {
    reservations: readonly SiteReservation[];
    densityAt: (x: number, z: number) => number;
  },
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
    !(anchor.clearOf.includes('woodland') && densityAt(x, z) >= anchor.woodlandDensityFloor)
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
  const groundData: AuthoredGroundData = {
    blockSize: 0.5,
    seed,
    topography: tuning.topography,
    layout,
    protectedBuildings: rects,
    spawnPoints: [
      [layout.player.position[0], layout.player.position[2]],
      ...layout.buildings
        .flatMap((building, i) =>
          placedSpawns(placementOf(registry, building, scenario.lootContext, layoutBuildingSite(seed, layout, i))),
        )
        .map((marker): [number, number] => [marker.pos[0] * 0.5, marker.pos[2] * 0.5]),
    ],
    lots: layout.buildings.map((building, i) => lotOf(building, rects[i]!)),
    tracks: layout.tracks.map((track) => ({ ...track, surface: registry.blockIds.get(track.surface) })),
    // Anchor resolution only needs the ground's shape; a composed site's ways arrive with its sites.
    approaches: [],
    catalogue: undefined,
  };
  const ground = createAuthoredGround(groundData);
  const cover = createBaselineCover({ ground: groundData, regions: layout.woodlands, vegetation: tuning.vegetation });
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
      if (!anchorCleared(anchor, cell, layout, { reservations, densityAt: cover.densityAt })) {
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

/** The outward horizontal step of a facing, in blocks. */
const PORT_NORMAL: Record<Exclude<KitPort['facing'], 'up' | 'down'>, readonly [number, number]> = {
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
};

/** One attribution for every way a link can fail, so source and destination refusals name the same contract. */
const linkDiagnostic = (registry: Registry, link: ComposedSiteDef['links'][number], profileId: string): string =>
  `link "${link.id}" cannot join ask "${link.from.ask}" port "${link.from.port}" to ask "${link.to.ask}" ` +
  `port "${link.to.port}" through road profile "${profileId}" with transition "${link.transition.assembly}" ` +
  `(${contentPointer(registry, 'mapAssemblies', link.transition.assembly)})`;

/** The rectangle a road's lead occupies past a mouth: one shoulder wide, reaching an apron beyond the mouth. */
const leadRect = (outward: KitPort, profile: { widthMetres: number }, apron: number): Rect => {
  const normal = PORT_NORMAL[outward.facing as keyof typeof PORT_NORMAL];
  const [mx, mz] = [outward.at[0] * TEMPLATE_BLOCK_SIZE, outward.at[2] * TEMPLATE_BLOCK_SIZE];
  const [dx, dz] = [normal[0] * (profile.widthMetres / 2 + apron), normal[1] * (profile.widthMetres / 2 + apron)];
  return {
    x0: Math.min(mx, mx + dx) - profile.widthMetres / 2,
    z0: Math.min(mz, mz + dz) - profile.widthMetres / 2,
    x1: Math.max(mx, mx + dx) + profile.widthMetres / 2,
    z1: Math.max(mz, mz + dz) + profile.widthMetres / 2,
  };
};

const insideBounds = (rect: Rect, bounds: Rect): boolean =>
  rect.x0 >= bounds.x0 && rect.z0 >= bounds.z0 && rect.x1 <= bounds.x1 && rect.z1 <= bounds.z1;

/**
 * Whether a link's source gate can host its road at all: the transition that docks there must stand inside the
 * bounds beside the placing compound, clear of the buildings and reservations already placed, with a lead past its
 * outward mouth. A source that blocks its own exit is retried here, because no later placement can unblock it.
 */
const fromExitFits = (
  { seed, registry, scenario, buildings, reservations, pieceCache }: LinkFit,
  link: ComposedSiteDef['links'][number],
  building: LayoutBuilding,
): string | undefined => {
  const describe = (profileId: string, reason: string): string =>
    `${linkDiagnostic(registry, link, profileId)}: ${reason}`;
  const gateAt = (placed: LayoutBuilding, at: number): KitPort | undefined => {
    const placement = placementOf(registry, placed, scenario.lootContext, layoutBuildingSite(seed, scenario, at));
    const port = placement.template.ports?.find((candidate) => candidate.id === link.from.port);
    return port && placedPort(placement, port);
  };
  const gate = gateAt(building, buildings.length);
  const profile = gate && registry.roadProfiles.get(gate.type);
  const transition = registry.mapAssemblies.get(link.transition.assembly);
  if (!(gate && profile && transition)) {
    return describe(gate?.type ?? '?', 'the named gate, road profile or transition is missing');
  }
  const compiled = compileAssembly(registry, transition, {
    ...layoutBuildingSite(seed, scenario, buildings.length + 1),
    pieceCache,
  });
  const dock = dockingPlacement(compiled, link.transition.gate, gate);
  const outwardPort = dock?.placement.template.ports?.find((candidate) => candidate.id === link.transition.outward);
  if (!(dock && outwardPort)) {
    return describe(
      gate.type,
      `transition "${link.transition.assembly}" cannot mate gate port "${link.transition.gate}"`,
    );
  }
  const transitionBuilding: LayoutBuilding = {
    template: link.transition.assembly,
    position: dock.placement.origin.map((value) => value * TEMPLATE_BLOCK_SIZE) as [number, number, number],
    rotation: (dock.placement.turn * 90) as 0 | 90 | 180 | 270,
  };
  const rect = buildingFootprint(registry, transitionBuilding);
  const withShoulder = expandRect(rect, profile.widthMetres / 2);
  const outward = placedPort(dock.placement, outwardPort);
  // The road must also have somewhere to go: a lead past the outward mouth, one shoulder wide, inside the bounds.
  const lead = leadRect(outward, profile, scenario.placement.apronMetres);
  const blocked =
    !(insideBounds(withShoulder, scenario.bounds) && insideBounds(lead, scenario.bounds)) ||
    buildings.some((placed) => rectsOverlap(buildingFootprint(registry, placed), rect)) ||
    reservations.some(
      (other) =>
        other.ask !== link.from.ask &&
        (overlaps({ ask: link.id, kind: 'track', ...rect }, other) ||
          overlaps({ ask: link.id, kind: 'track', ...lead }, other)),
    );
  return blocked ? describe(gate.type, `no room beside ask "${link.from.ask}" for the road to leave`) : undefined;
};

/** One try at where an ask's building stands: its fixed spot, else around the ask it keeps its distance from, else anywhere in bounds. */
const askCandidate = (
  rng: Rng,
  ask: Ask,
  scenario: ComposedSiteDef,
  placements: ReadonlyMap<string, LayoutBuilding>,
): Pick<LayoutBuilding, 'position' | 'rotation'> => {
  let x: number;
  let z: number;
  if (ask.at) {
    [x, z] = ask.at;
  } else if (ask.distance) {
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
    position: [snapToPlacementGrid(x), scenario.ground, snapToPlacementGrid(z)],
    rotation: (rng.int(0, 3) * 90) as 0 | 90 | 180 | 270,
  };
};

/** One Liang–Barsky clip step: the span of the segment left after this boundary, or none when it misses. */
const clipSpan = (t0: number, t1: number, p: number, q: number): [number, number] | undefined => {
  if (p === 0) {
    return q < 0 ? undefined : [t0, t1];
  }
  const t = q / p;
  if (p < 0) {
    return t > t1 ? undefined : [Math.max(t0, t), t1];
  }
  return t < t0 ? undefined : [t0, Math.min(t1, t)];
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
    const span = clipSpan(t0, t1, p, q);
    if (!span) {
      return false;
    }
    [t0, t1] = span;
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

/** A route oriented from one named mouth to the other, in whichever order it was authored. */
const orientedRoute = (
  route: readonly Vec3[],
  from: readonly number[],
  to: readonly number[],
): readonly Vec3[] | undefined => {
  const on = (point: Vec3, mouth: readonly number[]): boolean => point.every((value, axis) => value === mouth[axis]);
  const [first, last] = [route[0]!, route.at(-1)!];
  if (on(first, from) && on(last, to)) {
    return route;
  }
  if (on(first, to) && on(last, from)) {
    return [...route].reverse();
  }
  return undefined;
};

/** One docked transition of a link: where the piece stands, its outward mouth, and its projected route oriented
 * from the docked gate mouth to the outward mouth. */
const dockedTransition = (
  { seed, registry, scenario, pieceCache }: LinkFit,
  link: ComposedSiteDef['links'][number],
  gatePort: KitPort,
  siteIndex: number,
): { plan: PlannedTransition } | { failure: string } => {
  const transition = registry.mapAssemblies.get(link.transition.assembly);
  if (!transition) {
    return { failure: 'the transition assembly is missing' };
  }
  const compiled = compileAssembly(registry, transition, {
    ...layoutBuildingSite(seed, scenario, siteIndex),
    pieceCache,
  });
  const dock = dockingPlacement(compiled, link.transition.gate, gatePort);
  const portOf = (id: string) => dock?.placement.template.ports?.find((candidate) => candidate.id === id);
  const dockGate = dock && portOf(link.transition.gate);
  const outwardPort = dock && portOf(link.transition.outward);
  if (!(dock && dockGate && outwardPort)) {
    return { failure: `transition "${link.transition.assembly}" cannot mate gate port "${link.transition.gate}"` };
  }
  const outward = placedPort(dock.placement, outwardPort);
  const route = orientedRoute(dock.placement.template.route ?? [], dockGate.at, outwardPort.at);
  if (!route) {
    return { failure: 'its route does not run between the transition gate and outward mouths' };
  }
  const building: LayoutBuilding = {
    template: link.transition.assembly,
    position: dock.placement.origin.map((value) => value * TEMPLATE_BLOCK_SIZE) as [number, number, number],
    rotation: (dock.placement.turn * 90) as 0 | 90 | 180 | 270,
  };
  return {
    plan: {
      building,
      rect: buildingFootprint(registry, building),
      outward,
      route: route.map((point) => placedPoint(dock.placement, point)),
    },
  };
};

interface LinkSpace {
  readonly scenario: ComposedSiteDef;
  readonly footprints: readonly { rect: Rect; label: string }[];
  readonly reserved: readonly SiteReservation[];
  readonly ownAsks: ReadonlySet<string>;
  readonly margin: number;
}

/** Whether both docked transitions stand inside the bounds with a shoulder of the road's width, off every building
 * footprint and every other ask's or link's reserved area. */
const transitionsFit = (
  { scenario, footprints, reserved, ownAsks, margin }: LinkSpace,
  transitions: readonly PlannedTransition[],
): string | undefined => {
  for (const plan of transitions) {
    if (!insideBounds(expandRect(plan.rect, margin), scenario.bounds)) {
      return 'a transition of the road leaves the site bounds';
    }
    const crossed = footprints.find(({ rect }) => rectsOverlap(rect, plan.rect));
    if (crossed) {
      return `a transition of the road crosses the footprint of building "${crossed.label}"`;
    }
    const crossing = reserved
      .filter((other) => !ownAsks.has(other.ask))
      .find((other) => overlaps({ ask: '', kind: 'track', ...plan.rect }, other));
    if (crossing) {
      return `a transition of the road crosses the reserved area of ask "${crossing.ask}"`;
    }
  }
  return undefined;
};

const metres = (point: Vec3): [number, number] => [point[0] * TEMPLATE_BLOCK_SIZE, point[2] * TEMPLATE_BLOCK_SIZE];

/** The straight corridor between the two outward mouths, clear of buildings and other reservations and inside the
 * bounds with its apron, or the reason it cannot be. */
const roadCorridor = (
  { scenario, footprints, reserved, ownAsks, margin }: LinkSpace,
  transitions: readonly PlannedTransition[],
): { rect: Rect } | { failure: string } => {
  const from = metres(transitions[0]!.outward.at);
  const to = metres(transitions[1]!.outward.at);
  const crossedBuilding = footprints.find(({ rect }) => segmentEntersRect(from, to, expandRect(rect, margin)));
  if (crossedBuilding) {
    return { failure: `the road crosses building "${crossedBuilding.label}"` };
  }
  const crossedReservation = reserved
    .filter((other) => !ownAsks.has(other.ask))
    .find((other) => segmentEntersRect(from, to, expandRect(other, margin)));
  if (crossedReservation) {
    return { failure: `the road crosses the reserved area of ask "${crossedReservation.ask}"` };
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
  const outside =
    !insideBounds(corridor, scenario.bounds) ||
    reserved.some((other) => !ownAsks.has(other.ask) && overlaps({ ask: '', kind: 'track', ...corridor }, other));
  return outside
    ? { failure: 'the road leaves the site bounds or crosses a reserved area of another ask' }
    : { rect: corridor };
};

/**
 * One try at joining a link's gates: dock the authored transition at each gate with its route oriented gate to
 * outward, then check the transitions and the between-transition track against the bounds, the buildings'
 * footprints and every other reservation.
 */
const planLink = (
  fit: LinkFit,
  link: ComposedSiteDef['links'][number],
  toBuilding: LayoutBuilding,
): { road: PlannedRoad } | { failure: string } => {
  const { seed, registry, scenario, buildings, indices, reservations, plannedRoads } = fit;
  const gateAt = (building: LayoutBuilding, index: number, portId: string): KitPort | undefined => {
    const placement = placementOf(registry, building, scenario.lootContext, layoutBuildingSite(seed, scenario, index));
    const port = placement.template.ports?.find((candidate) => candidate.id === portId);
    return port && placedPort(placement, port);
  };
  const fromIndex = indices.get(link.from.ask) ?? 0;
  const fromGate = gateAt(buildings[fromIndex]!, fromIndex, link.from.port);
  const toGate = gateAt(toBuilding, buildings.length, link.to.port);
  if (!(fromGate && toGate)) {
    return {
      failure: `${linkDiagnostic(registry, link, fromGate?.type ?? toGate?.type ?? '?')}: a named gate is missing from its placed assembly`,
    };
  }
  const profile = registry.roadProfiles.get(fromGate.type);
  if (!profile) {
    return { failure: `${linkDiagnostic(registry, link, fromGate.type)}: the road profile is missing` };
  }
  const describe = (reason: string): { failure: string } => ({
    failure: `${linkDiagnostic(registry, link, fromGate.type)}: ${reason}`,
  });
  const transitions: PlannedTransition[] = [];
  for (const gatePort of [fromGate, toGate]) {
    const docked = dockedTransition(fit, link, gatePort, buildings.length + 1 + transitions.length);
    if ('failure' in docked) {
      return describe(docked.failure);
    }
    transitions.push(docked.plan);
  }
  const space: LinkSpace = {
    scenario,
    footprints: [
      ...buildings.map((building) => ({ rect: buildingFootprint(registry, building), label: building.template })),
      ...plannedRoads.flatMap((road) =>
        road.transitions.map((planned) => ({ rect: planned.rect, label: planned.building.template })),
      ),
      { rect: buildingFootprint(registry, toBuilding), label: toBuilding.template },
    ],
    reserved: [
      ...reservations,
      ...plannedRoads.flatMap((road) => [
        ...road.transitions.map((planned) => ({ ask: road.link.id, kind: 'track' as const, ...planned.rect })),
        { ask: road.link.id, kind: 'track' as const, ...road.corridor },
      ]),
    ],
    ownAsks: new Set([link.from.ask, link.to.ask]),
    margin: profile.widthMetres / 2,
  };
  const unfit = transitionsFit(space, transitions);
  if (unfit) {
    return describe(unfit);
  }
  const corridor = roadCorridor(space, transitions);
  if ('failure' in corridor) {
    return describe(corridor.failure);
  }
  const track = {
    points: [
      ...transitions[0]!.route.map((point) => metres(point)),
      ...[...transitions[1]!.route].reverse().map((point) => metres(point)),
    ],
    width: profile.widthMetres,
    surface: profile.surface,
  };
  return { road: { link, transitions, corridor: corridor.rect, track } };
};

/** The compass bearing of a horizontal facing. */
const BEARING: Record<Exclude<KitPort['facing'], 'up' | 'down'>, number> = { n: 0, e: 90, s: 180, w: 270 };

const entrancePlayer = (placement: Placement, start: LayoutBuilding): SiteLayoutDef['player'] => {
  const { template } = placement;
  const { entrance } = template.access!;
  const position = placedPoint(placement, entrance).map((v) => v * 0.5) as [number, number, number];
  const [x, , z] = entrance;
  const sides = [z, template.size[0] - 1 - x, template.size[2] - 1 - z, x];
  const facing = sides.indexOf(Math.min(...sides));
  return { position, bearing: (facing * 90 + start.rotation) % 360 };
};

/** When the start compound's own gate opens onto a road, the start stands just outside that gate facing along the
 * road, so a review walks straight out onto the link. */
const gatePlayer = (placement: Placement, portId: string): SiteLayoutDef['player'] | undefined => {
  const port = placement.template.ports?.find((candidate) => candidate.id === portId);
  if (!port || port.facing === 'up' || port.facing === 'down') {
    return undefined;
  }
  const placed = placedPort(placement, port);
  const normal = PORT_NORMAL[placed.facing as keyof typeof PORT_NORMAL];
  return {
    position: [placed.at[0] + normal[0], placed.at[1], placed.at[2] + normal[1]].map((v) => v * 0.5) as [
      number,
      number,
      number,
    ],
    bearing: BEARING[placed.facing as keyof typeof BEARING],
  };
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
    layoutBuildingSite(seed, scenario, buildings.indexOf(start)),
  );
  const road = scenario.links.find((link) => link.from.ask === scenario.start.ask);
  return (road && gatePlayer(placement, road.from.port)) ?? entrancePlayer(placement, start);
};

interface PlacementState {
  readonly seed: number;
  readonly registry: Registry;
  readonly scenario: ComposedSiteDef;
  readonly buildings: SiteLayoutDef['buildings'];
  readonly reservations: SiteReservation[];
  readonly placements: Map<string, LayoutBuilding>;
  readonly indices: Map<string, number>;
  readonly pieceCache: Map<string, CompiledTemplate>;
  readonly tracks: SiteLayoutDef['tracks'];
}

/** The ask's own reserved rectangle: its footprint with the placement apron around it. */
const askReservation = (scenario: ComposedSiteDef, ask: Ask, rect: Rect, apron: number): SiteReservation => ({
  ask: ask.id,
  kind: ask.id === scenario.start.ask ? 'start' : 'building',
  x0: rect.x0 - apron,
  z0: rect.z0 - apron,
  x1: rect.x1 + apron,
  z1: rect.z1 + apron,
});

/** One try at placing an ask's chosen building: in bounds, clear of other reservations, hosting every road that
 * leaves it, and joining every road that arrives at it. */
const tryAttempt = (
  state: PlacementState,
  ask: Ask,
  building: LayoutBuilding,
): { reserved: SiteReservation; roads: readonly PlannedRoad[] } | { failure: string | undefined } => {
  const { registry, scenario, buildings, indices, reservations, pieceCache, seed } = state;
  const rect = buildingFootprint(registry, building);
  const reserved = askReservation(scenario, ask, rect, scenario.placement.apronMetres);
  if (!insideBounds(reserved, scenario.bounds) || reservations.some((other) => overlaps(reserved, other))) {
    return { failure: undefined };
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
    return { failure: exitFailure };
  }
  // A link counts only once its gates mate, its transitions stand clear and its track connects, so an ask that
  // blocks the road is refused with the link's own reason rather than silently dropping the join.
  const roads: PlannedRoad[] = [];
  for (const link of scenario.links.filter(({ to }) => to.ask === ask.id)) {
    const planned = planLink(
      { seed, registry, scenario, buildings, indices, reservations, pieceCache, plannedRoads: roads },
      link,
      building,
    );
    if ('failure' in planned) {
      return { failure: planned.failure };
    }
    roads.push(planned.road);
  }
  return { reserved, roads };
};

/** Place one ask, refusing with the last link's own reason when no attempt could stand. */
const placeAsk = (state: PlacementState, ask: Ask): void => {
  const { seed, registry, scenario, buildings, reservations, placements, indices, tracks } = state;
  const rng = Rng.stream(seed, `site:${scenario.id}:ask:${ask.id}`);
  const chosen = askBuilding(seed, registry, scenario, ask);
  const { attempts } = scenario.placement;
  let linkFailure: string | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const building = { ...chosen, ...askCandidate(rng, ask, scenario, placements) };
    const accepted = tryAttempt(state, ask, building);
    if ('failure' in accepted) {
      linkFailure = accepted.failure ?? linkFailure;
      continue;
    }
    buildings.push(building);
    indices.set(ask.id, buildings.length - 1);
    placements.set(ask.id, building);
    reservations.push(accepted.reserved);
    for (const road of accepted.roads) {
      for (const transition of road.transitions) {
        buildings.push(transition.building);
        reservations.push({ ask: road.link.id, kind: 'track', ...transition.rect });
      }
      reservations.push({ ask: road.link.id, kind: 'track', ...road.corridor });
      tracks.push(road.track);
    }
    return;
  }
  throw new Error(
    `Composed site "${scenario.id}": ask "${ask.id}" did not fit after ${attempts} attempts` +
      (linkFailure ? `: ${linkFailure}` : ''),
  );
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
  const pieceCache = new Map<string, CompiledTemplate>();
  const tracks: SiteLayoutDef['tracks'] = [];
  const state: PlacementState = {
    seed,
    registry,
    scenario,
    buildings,
    reservations,
    placements,
    indices,
    pieceCache,
    tracks,
  };
  for (const ask of scenario.asks) {
    placeAsk(state, ask);
  }
  const layout: SiteLayoutDef = {
    id: scenario.id,
    ...(scenario.attemptPolicy ? { attemptPolicy: scenario.attemptPolicy } : {}),
    lootContext: scenario.lootContext,
    ...(scenario.aftermathOdds ? { aftermathOdds: scenario.aftermathOdds } : {}),
    bounds: scenario.bounds,
    ground: scenario.ground,
    buildings,
    player: startPlayer({ seed, registry, scenario, buildings, start: placements.get(scenario.start.ask)! }),
    terrain: [],
    actors: [],
    woodlands: scenario.woodlands,
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
