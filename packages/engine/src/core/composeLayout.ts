import { inPolygon } from './authoredLayout.ts';
import { placementOf } from './authoredPlacement.ts';
import { buildingBounds, lotOf } from './authoredTerrain.mjs';
import { createAuthoredGround } from './authoredTerrainEvaluator.ts';
import { claimed } from './capabilities.ts';
import type { Registry } from './content.ts';
import { Rng } from './random.ts';
import type { ComposedSiteDef } from './schema/scenarios.ts';
import type { SiteLayoutDef } from './schema.ts';
import { placedPoint, placedSpawns } from './templates.ts';

export interface SiteReservation {
  ask: string;
  kind: 'building' | 'track' | 'anchor' | 'start';
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

type Issue = [path: string, message: string];

export const guaranteeIssues = (scenario: ComposedSiteDef): Issue[] =>
  Object.entries(scenario.guarantee).flatMap(([material, required]) => {
    const count = scenario.asks.filter((ask) => ask.supplies.includes(material)).length;
    return count < required
      ? [[`.guarantee.${material}`, `needs ${required} sources of "${material}", found ${count}`] as Issue]
      : [];
  });

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
    const template = registry.templates.get(ask.template);
    if (!template) {
      issues.push([`${path}.template`, `no template "${ask.template}" for ask "${ask.id}"`]);
      return;
    }
    const kind = ask.settlementKind ?? scenario.settlementKind;
    if (template.eligibility && !template.eligibility.settlementKinds.includes(kind)) {
      issues.push([
        `${path}.template`,
        `ask "${ask.id}" template "${ask.template}" excludes settlement kind "${kind}"`,
      ]);
    }
    if (ask.id === scenario.start.ask && !template.access) {
      issues.push([`${path}.template`, `start ask "${ask.id}" needs a template entrance`]);
    }
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
  const rects = layout.buildings.map((building) =>
    buildingBounds(building, registry.templates.get(building.template)!.size),
  );
  const ground = createAuthoredGround({
    blockSize: 0.5,
    seed,
    topography: tuning.topography,
    layout,
    protectedBuildings: rects,
    spawnPoints: [
      [layout.player.position[0], layout.player.position[2]],
      ...layout.buildings
        .flatMap((building) => placedSpawns(placementOf(registry, building, scenario.lootContext)))
        .map((marker): [number, number] => [marker.pos[0] * 0.5, marker.pos[2] * 0.5]),
    ],
    lots: layout.buildings.map((building, i) => lotOf(building, rects[i]!)),
    tracks: [],
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
  const placements = new Map<string, SiteLayoutDef['buildings'][number]>();
  const {
    bounds,
    placement: { apronMetres, attempts },
  } = scenario;
  for (const ask of scenario.asks) {
    const rng = Rng.stream(seed, `site:${scenario.id}:ask:${ask.id}`);
    const template = registry.templates.get(ask.template)!;
    let accepted = false;
    for (let attempt = 0; attempt < attempts; attempt++) {
      let x: number;
      let z: number;
      if (ask.distance) {
        const from = placements.get(ask.distance.from)!;
        const radius = weightedRadius(rng, ask.distance.curve);
        const angle = rng.next() * Math.PI * 2;
        x = from.position[0] + Math.cos(angle) * radius;
        z = from.position[2] + Math.sin(angle) * radius;
      } else {
        x = rng.range(bounds.x0, bounds.x1);
        z = rng.range(bounds.z0, bounds.z1);
      }
      const building: SiteLayoutDef['buildings'][number] = {
        template: ask.template,
        position: [Math.round(x * 2) / 2, scenario.ground, Math.round(z * 2) / 2],
        rotation: (rng.int(0, 3) * 90) as 0 | 90 | 180 | 270,
      };
      const rect = buildingBounds(building, template.size);
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
      buildings.push(building);
      placements.set(ask.id, building);
      reservations.push(reserved);
      accepted = true;
      break;
    }
    if (!accepted) {
      throw new Error(`Composed site "${scenario.id}": ask "${ask.id}" did not fit after ${attempts} attempts`);
    }
  }
  const start = placements.get(scenario.start.ask)!;
  const template = registry.templates.get(start.template)!;
  const { entrance } = template.access!;
  const position = placedPoint(placementOf(registry, start, scenario.lootContext), entrance).map((v) => v * 0.5) as [
    number,
    number,
    number,
  ];
  const [x, , z] = entrance;
  const sides = [z, template.size[0] - 1 - x, template.size[2] - 1 - z, x];
  const facing = sides.indexOf(Math.min(...sides));
  const layout: SiteLayoutDef = {
    id: scenario.id,
    ...(scenario.attemptPolicy ? { attemptPolicy: scenario.attemptPolicy } : {}),
    lootContext: scenario.lootContext,
    bounds,
    ground: scenario.ground,
    buildings,
    player: { position, bearing: (facing * 90 + start.rotation) % 360 },
    terrain: [],
    actors: [],
    woodlands: [],
    tracks: [],
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
