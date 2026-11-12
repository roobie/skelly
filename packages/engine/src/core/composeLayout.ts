import { placementOf } from './authoredPlacement.ts';
import { buildingBounds } from './authoredTerrain.mjs';
import type { Registry } from './content.ts';
import { Rng } from './random.ts';
import type { ComposedSiteDef } from './schema/scenarios.ts';
import type { SiteLayoutDef } from './schema.ts';
import { placedPoint } from './templates.ts';

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

export const composeLayout = (
  seed: number,
  registry: Registry,
  scenario: ComposedSiteDef,
): { layout: SiteLayoutDef; reservations: SiteReservation[] } => {
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
  return {
    layout: {
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
    },
    reservations,
  };
};
