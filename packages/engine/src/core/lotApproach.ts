// The local way a building type declares from its lot's road connection to its door; see `ApproachSchema`. The
// building's own access declares the way (kind, surface, width); the lot and terrain path that already places the
// building places the way too: authored and composed sites draw a trail as one more track and steps as ground
// shaping beside the lots (`packages/engine/src/core/authoredTerrainEvaluator.ts`, `approaches`), and a city draws a
// trail as one more surface rect (`packages/engine/src/core/citySite.ts`). No way is drawn where the door meets the
// road, where the front reaches no road, or where another building stands between.
import { buildingFootprint } from './authoredPlacement.ts';
import { polylineDistance, surfaceFoundation } from './authoredTerrain.mjs';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { Approach, SiteLayoutDef } from './schema.ts';
import { TEMPLATE_BLOCK_SIZE } from './settlementSpawns.ts';
import type { Rect } from './site.ts';
import { templateFrontOpening } from './templateSpatial.ts';
import { type Facing, footprint, type Placement, placedPoint, turnFacing } from './templates.ts';
import { cityPaving } from './terrainEvaluator.ts';

/** The outward horizontal step of a facing, in cells. */
const NORMAL: Record<Exclude<Facing, 'up' | 'down'>, readonly [number, number]> = {
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
};

export interface ApproachSearch {
  /** Whether a point lies on a road's surface. */
  readonly onRoad: (x: number, z: number) => boolean;
  /** Whether another building's footprint covers a point. */
  readonly blocked: (x: number, z: number) => boolean;
  readonly bounds: Rect;
  /** March step along the front, in the same units as `door`. */
  readonly step: number;
}

/**
 * Where the lot's front meets the road: the first point along the front from the door that lies on a road's surface.
 * Undefined when the door itself meets the road, when another building stands between, or when the front leaves the
 * bounds before reaching any road.
 */
export const roadConnection = (
  door: readonly [number, number],
  normal: readonly [number, number],
  { onRoad, blocked, bounds, step }: ApproachSearch,
): readonly [number, number] | undefined => {
  if (onRoad(door[0], door[1])) {
    return undefined;
  }
  for (let t = step; ; t += step) {
    const x = door[0] + normal[0] * t;
    const z = door[1] + normal[1] * t;
    if (x < bounds.x0 || z < bounds.z0 || x > bounds.x1 || z > bounds.z1) {
      return undefined;
    }
    if (onRoad(x, z)) {
      return [x, z];
    }
    if (blocked(x, z)) {
      return undefined;
    }
  }
};

/** The doorstep cell just outside the front-edge opening, and the front's outward normal, or undefined when the
 * building declares no approach its entrance walk can attach to. */
const approachCells = (
  registry: Registry,
  placement: Placement,
): { readonly approach: Approach; readonly door: Vec3; readonly normal: readonly [number, number] } | undefined => {
  const { access } = placement.template;
  const opening = access?.approach && templateFrontOpening(registry, placement.template);
  if (!(access?.approach && opening)) {
    return undefined;
  }
  const [dx, dz] = NORMAL[turnFacing(access.front ?? 'n', placement.turn)];
  return {
    approach: access.approach,
    door: placedPoint(placement, [opening[0] + dx, opening[1], opening[2] + dz]),
    normal: [dx, dz],
  };
};

/** One trail the terrain draws as a track, in metres: the same shape an authored road takes. */
export interface ApproachTrail {
  readonly points: readonly (readonly [number, number])[];
  readonly width: number;
  readonly surface: string;
}

/** One steps way before its surface resolves: the terrain evaluator takes the resolved block. */
export interface ApproachSteps {
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly width: number;
  readonly surface: string;
  readonly floor: number;
}

const inside = (rect: Rect, x: number, z: number): boolean =>
  x >= rect.x0 && x < rect.x1 && z >= rect.z0 && z < rect.z1;

/**
 * The ways one authored layout's buildings declare. `placements` holds each building's placement, in the layout's
 * order; trails join the layout's tracks and steps shape its ground, so both ride the terrain path that already
 * draws the site.
 */
export const layoutApproaches = (
  registry: Registry,
  layout: SiteLayoutDef,
  placements: readonly Placement[],
): { readonly trails: readonly ApproachTrail[]; readonly steps: readonly ApproachSteps[] } => {
  const trails: ApproachTrail[] = [];
  const steps: ApproachSteps[] = [];
  const rects = layout.buildings.map((building) => buildingFootprint(registry, building));
  const onRoad = (x: number, z: number): boolean =>
    layout.tracks.some((track) => polylineDistance([x, z], track.points) <= track.width / 2);
  layout.buildings.forEach((building, index) => {
    const cells = placements[index] ? approachCells(registry, placements[index]!) : undefined;
    if (!cells) {
      return;
    }
    const blocked = (x: number, z: number): boolean =>
      rects.some((rect, other) => other !== index && inside(rect, x, z));
    // Layouts are in metres; cells are half-metre blocks.
    const door = [cells.door[0] * TEMPLATE_BLOCK_SIZE, cells.door[2] * TEMPLATE_BLOCK_SIZE] as const;
    const connection = roadConnection(door, cells.normal, { onRoad, blocked, bounds: layout.bounds, step: 0.25 });
    if (!connection) {
      return;
    }
    const width = cells.approach.widthMetres ?? 1;
    if (cells.approach.kind === 'trail') {
      trails.push({ points: [connection, door], width, surface: cells.approach.surface });
    } else {
      steps.push({
        from: connection,
        to: door,
        width,
        surface: cells.approach.surface,
        floor: surfaceFoundation(building),
      });
    }
  });
  return { trails, steps };
};

/** One city trail, as the surface rect the city's terrain draws it as, in block cells. */
export interface CityWay {
  readonly rect: Rect;
  readonly block: number;
}

/** The city a lot way searches: its streets, its placed buildings and the bounds both live in. */
export interface CityWayPlan {
  readonly grid: Parameters<typeof cityPaving>[0];
  readonly core: Rect;
  readonly bounds: Rect;
  readonly placements: readonly Placement[];
}

/**
 * The trails a city's buildings declare, in block cells: a rect from the street's edge to the door, on the axis the
 * front-facing turn keeps every front. Steps draw nothing in a city, because its lots and streets share one flat
 * floor, so no door stands above its road connection.
 */
export const cityLotWays = (registry: Registry, plan: CityWayPlan): readonly CityWay[] => {
  const onRoad = cityPaving(plan.grid, plan.core, plan.bounds);
  const ways: CityWay[] = [];
  const rects = plan.placements.map((placement) => {
    const [width, depth] = footprint(placement);
    return {
      x0: placement.origin[0],
      z0: placement.origin[2],
      x1: placement.origin[0] + width,
      z1: placement.origin[2] + depth,
    };
  });
  plan.placements.forEach((placement, index) => {
    const cells = approachCells(registry, placement);
    if (!cells) {
      return;
    }
    if (cells.approach.kind !== 'trail') {
      return;
    }
    const block = registry.blockIds.get(cells.approach.surface);
    if (block === undefined) {
      return;
    }
    const blocked = (x: number, z: number): boolean =>
      rects.some((rect, other) => other !== index && inside(rect, x, z));
    const door = [cells.door[0], cells.door[2]] as const;
    const connection = roadConnection(door, cells.normal, { onRoad, blocked, bounds: plan.bounds, step: 0.25 });
    if (!connection) {
      return;
    }
    const half = (cells.approach.widthMetres ?? 1) / 2 / TEMPLATE_BLOCK_SIZE;
    ways.push({
      rect: {
        x0: Math.min(door[0], connection[0]) - half,
        x1: Math.max(door[0], connection[0]) + half,
        z0: Math.min(door[1], connection[1]) - half,
        z1: Math.max(door[1], connection[1]) + half,
      },
      block,
    });
  });
  return ways;
};
