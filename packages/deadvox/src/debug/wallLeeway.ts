// Throwaway spike: compares wall contact against occupancy cells and against refined furniture boxes.

import defaults from '../config/wallLeeway.json' with { type: 'json' };
import { aimBasis, NEUTRAL_AIM } from '../core/aim.ts';
import { type BlockEntities, type BlockEntity, isBodyDoor, panelFor } from '../core/blockEntities.ts';
import type { FurnitureDef, ModelDef, Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { type HeldFirearmTransformInput, heldFirearmTransform, modelToView } from '../core/heldPose.ts';
import { rotationOf } from '../core/orientation.ts';
import type { SolidAt } from '../core/raycast.ts';
import type { World } from '../core/world.ts';
import { INSET } from '../render/furniture.ts';

export type WallMode = 'cells' | 'refined';

export type WallTuning = typeof defaults;

/** Content defaults, each overridable as `wall.<key>` in the page query. */
export const wallTuning = (search: string): WallTuning => {
  const params = new URLSearchParams(search);
  const tuning = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof WallTuning)[]) {
    const raw = params.get(`wall.${key}`);
    const value = raw === null ? Number.NaN : Number(raw);
    if (Number.isFinite(value)) {
      tuning[key] = value;
    }
  }
  return tuning;
};

export const wallModeFromUrl = (search: string): WallMode | undefined => {
  const mode = new URLSearchParams(search).get('wall');
  return mode === 'cells' || mode === 'refined' ? mode : undefined;
};

/** A world box in metres. `unrefined` names why refined mode kept a cell. */
export interface WallBox {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly kind: 'terrain' | 'cell' | 'shape' | 'box' | 'panel';
  readonly unrefined?: string;
}

export interface WallWorld {
  readonly world: World;
  readonly registry: Registry;
  readonly entities: BlockEntities;
  /** What `cells` treats as solid: the game's physical occupancy. */
  readonly solid: SolidAt;
  readonly blockSize: number;
}

const cellBox = ([x, y, z]: Vec3, s: number, kind: WallBox['kind'], unrefined?: string): WallBox => ({
  min: [x * s, y * s, z * s],
  max: [(x + 1) * s, (y + 1) * s, (z + 1) * s],
  kind,
  ...(unrefined ? { unrefined } : {}),
});

const centred = (center: Vec3, half: Vec3, kind: WallBox['kind']): WallBox => ({
  min: center.map((value, axis) => value - half[axis]!) as Vec3,
  max: center.map((value, axis) => value + half[axis]!) as Vec3,
  kind,
});

/** `FurnitureMeshes.shaped`: def-local boxes on the piece's own bottom centre, turned by `rotationOf`, in metres. */
export const shapeBoxes = (entity: BlockEntity, def: FurnitureDef, s: number): WallBox[] => {
  const rotation = rotationOf(entity);
  const [, up] = rotation;
  const [width, height, depth] = def.size;
  const origin = entity.pos.map((at, axis) => at + entity.size[axis]! / 2 - (up[axis]! * height) / 2) as Vec3;
  return (def.shape ?? []).map(({ position: [x, y, z], size: [w, h, d] }) => {
    const local: Vec3 = [x + w / 2 - width / 2, y + h / 2, z + d / 2 - depth / 2];
    const half: Vec3 = [w / 2, h / 2, d / 2];
    const center = [0, 1, 2].map(
      (axis) => (origin[axis]! + rotation.reduce((sum, own, index) => sum + own[axis]! * local[index]!, 0)) * s,
    ) as Vec3;
    const extent = [0, 1, 2].map(
      (axis) => rotation.reduce((sum, own, index) => sum + Math.abs(own[axis]!) * half[index]!, 0) * s,
    ) as Vec3;
    return centred(center, extent, 'shape');
  });
};

/** `FurnitureMeshes.box`: the occupied box less the renderer's inset. */
const plainBox = (entity: BlockEntity, s: number): WallBox => {
  const [w, h, d] = entity.size;
  const center = entity.pos.map((at, axis) => (at + entity.size[axis]! / 2) * s) as Vec3;
  return centred(center, [(w * s - INSET) / 2, (h * s - INSET / 2) / 2, (d * s - INSET) / 2], 'box');
};

/** `panelFor`'s oriented panel about its hinge, as a world box. Quarter turns keep it exact. */
export const panelBox = (entity: BlockEntity, def: FurnitureDef, s: number): WallBox => {
  const { pivot, center, size, rotationY } = panelFor(entity, def, s);
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const turned: Vec3 = [center[0] * cos + center[2] * sin, center[1], -center[0] * sin + center[2] * cos];
  const half: Vec3 = [
    (Math.abs(cos) * size[0] + Math.abs(sin) * size[2]) / 2,
    size[1] / 2,
    (Math.abs(sin) * size[0] + Math.abs(cos) * size[2]) / 2,
  ];
  return centred(pivot.map((value, axis) => value + turned[axis]!) as Vec3, half, 'panel');
};

/** Refined boxes for a blocking piece, or the reason it stays as cells. */
const refinedPieceBoxes = (entity: BlockEntity, def: FurnitureDef, s: number): WallBox[] | string => {
  if (def.id === 'workshop_lift') {
    return 'workshop lift';
  }
  if (def.vehicle) {
    return 'vehicle';
  }
  if (def.corpse) {
    return 'corpse';
  }
  if (def.appearance) {
    return `appearance mesh (${def.id})`;
  }
  if (def.door) {
    // A doorway leaf's shape swings on its hinge, but such a leaf blocks only while shut, where `shaped` puts it.
    const shape = def.shape && (isBodyDoor(def) || !entity.open) ? shapeBoxes(entity, def, s) : [];
    return [panelBox(entity, def, s), ...shape];
  }
  return def.shape ? shapeBoxes(entity, def, s) : [plainBox(entity, s)];
};

const overlaps = (entity: BlockEntity, low: Vec3, high: Vec3): boolean =>
  [0, 1, 2].every((axis) => entity.pos[axis]! <= high[axis]! && entity.pos[axis]! + entity.size[axis]! >= low[axis]!);

const terrainUnrefined = (world: WallWorld, [x, y, z]: Vec3): string | undefined => {
  const block = world.registry.blocks[world.world.getBlock(x, y, z)];
  return block?.wireMesh || block?.fencePosts ? `${block.name} (wire and posts)` : undefined;
};

/** A solid cell in refined mode: terrain stays a cell, refinable furniture is dropped for its boxes, the rest is labelled. */
const refinedCell = (world: WallWorld, cell: Vec3): WallBox | undefined => {
  const { entities, registry, blockSize: s } = world;
  const block = world.world.getBlock(...cell);
  if (block !== 0 && registry.blocks[block]!.solid) {
    return cellBox(cell, s, 'terrain', terrainUnrefined(world, cell));
  }
  const piece = entities.isSolid(...cell) ? entities.at(...cell) : undefined;
  if (!piece) {
    return cellBox(cell, s, 'cell', 'vehicle');
  }
  const refined = refinedPieceBoxes(piece, entities.defOf(piece), s);
  return typeof refined === 'string' ? cellBox(cell, s, 'cell', refined) : undefined;
};

const solidCells = (world: WallWorld, low: Vec3, high: Vec3): Vec3[] => {
  const cells: Vec3[] = [];
  const [x0, y0, z0] = low.map(Math.floor) as Vec3;
  const [x1, y1, z1] = high.map(Math.floor) as Vec3;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        if (world.solid(x, y, z)) {
          cells.push([x, y, z]);
        }
      }
    }
  }
  return cells;
};

/** The boxes a mode tests in a region of cells, in blocks, inclusive. */
export const gatherWallBoxes = (world: WallWorld, mode: WallMode, low: Vec3, high: Vec3): WallBox[] => {
  const { entities, blockSize: s } = world;
  const cells = solidCells(world, low, high);
  if (mode === 'cells') {
    return cells.map((cell) => cellBox(cell, s, 'cell'));
  }
  const boxes = cells.flatMap((cell) => refinedCell(world, cell) ?? []);
  // By the piece's whole extent, so parts below its solid-fill threshold still count.
  for (const piece of entities.near(low, high)) {
    if (piece.carried || !entities.blocks(piece) || !overlaps(piece, low, high)) {
      continue;
    }
    const refined = refinedPieceBoxes(piece, entities.defOf(piece), s);
    if (typeof refined !== 'string') {
      boxes.push(...refined);
    }
  }
  return boxes;
};

/** The gun proxy: a sphere of `radius` swept from the butt through the muzzle and `reach` past it, in world metres. */
export interface GunProxy {
  readonly butt: Vec3;
  readonly muzzle: Vec3;
  readonly tip: Vec3;
  readonly radius: number;
}

/** The farthest authored anchor or hold from the butt-to-muzzle line, in model metres. */
export const authoredProxyRadius = (model: ModelDef): number => {
  if (!(model.hands && model.anchors?.muzzle && model.grip)) {
    throw new Error(`Model ${model.id} needs hands, a grip and a muzzle for the wall proxy`);
  }
  const { butt } = model.hands;
  const axis = model.anchors.muzzle.map((value, index) => value - butt[index]!) as Vec3;
  const length = Math.hypot(...axis);
  const points: Vec3[] = [
    ...Object.values(model.anchors),
    model.grip.at,
    model.hands.firing.at,
    model.hands.support.at,
    ...(model.gun?.sight?.eye ? [model.gun.sight.eye] : []),
  ];
  return Math.max(
    0,
    ...points.map((point) => {
      const offset = point.map((value, index) => value - butt[index]!) as Vec3;
      const along = (offset[0] * axis[0] + offset[1] * axis[1] + offset[2] * axis[2]) / length;
      return Math.sqrt(Math.max(0, offset[0] ** 2 + offset[1] ** 2 + offset[2] ** 2 - along * along));
    }),
  );
};

export interface WallPoseSample {
  /** `heldFirearmTransform` input without the spike's lowering. */
  readonly pose: Omit<HeldFirearmTransformInput, 'extraLoweredPitch'>;
  /** Actor eye, in blocks. */
  readonly eye: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly blockSize: number;
}

export const gunProxy = (sample: WallPoseSample, lower: number, radius: number, reach: number): GunProxy => {
  const { model } = sample.pose;
  const pose = heldFirearmTransform({ ...sample.pose, extraLoweredPitch: lower });
  const { right, up, forward } = aimBasis(sample.yaw, sample.pitch, NEUTRAL_AIM);
  const world = (vector: Vec3): Vec3 =>
    [0, 1, 2].map((axis) => right[axis]! * vector[0] + up[axis]! * vector[1] - forward[axis]! * vector[2]) as Vec3;
  const rotate = (vector: Vec3): Vec3 =>
    [0, 1, 2].map((axis) =>
      pose.rootRotation.reduce((sum, column, index) => sum + column[axis]! * vector[index]!, 0),
    ) as Vec3;
  const root = sample.eye.map((value, axis) => value * sample.blockSize + world(pose.rootOffset)[axis]!) as Vec3;
  const buttFromGrip = model.hands!.butt.map((value, index) => value - model.grip!.at[index]!) as Vec3;
  const butt = root.map((value, axis) => value + world(rotate(modelToView(model, buttFromGrip)))[axis]!) as Vec3;
  const muzzle = root.map((value, axis) => value + world(pose.muzzleOffset)[axis]!) as Vec3;
  const direction = world(pose.muzzleDirection);
  const tip = muzzle.map((value, axis) => value + direction[axis]! * reach) as Vec3;
  return { butt, muzzle, tip, radius };
};

/** Squared distance from the point at `t` on segment `a`→`a + d` to the box. */
const squaredAt = (a: Vec3, d: Vec3, box: WallBox, t: number): number => {
  let sum = 0;
  for (let axis = 0; axis < 3; axis++) {
    const p = a[axis]! + d[axis]! * t;
    const outside = Math.max(box.min[axis]! - p, p - box.max[axis]!, 0);
    sum += outside * outside;
  }
  return sum;
};

const breaks = new Float64Array(8);

/** Inserts a crossing strictly inside the segment into `breaks`, kept sorted; returns the new count. */
const addBreak = (t: number, count: number): number => {
  if (!(t > 0 && t < 1)) {
    return count;
  }
  let at = count;
  while (at > 0 && breaks[at - 1]! > t) {
    breaks[at] = breaks[at - 1]!;
    at -= 1;
  }
  breaks[at] = t;
  return count + 1;
};

/** The minimising t of the squared distance on piece `breaks[piece]`..`breaks[piece + 1]`, where each axis keeps one side of its slab. */
const pieceMinimum = (a: Vec3, d: Vec3, box: WallBox, piece: number): number => {
  const t0 = breaks[piece]!;
  const t1 = breaks[piece + 1]!;
  const middle = (t0 + t1) / 2;
  // f(t) = A t² + B t + C on this piece; only A and B place the minimum.
  let quadratic = 0;
  let linear = 0;
  for (let axis = 0; axis < 3; axis++) {
    const p = a[axis]! + d[axis]! * middle;
    let bound: number | undefined;
    if (p < box.min[axis]!) {
      bound = box.min[axis]!;
    } else if (p > box.max[axis]!) {
      bound = box.max[axis]!;
    }
    if (bound !== undefined) {
      quadratic += d[axis]! * d[axis]!;
      linear += 2 * d[axis]! * (a[axis]! - bound);
    }
  }
  return quadratic > 0 ? Math.min(t1, Math.max(t0, -linear / (2 * quadratic))) : t0;
};

/**
 * The segment parameter nearest the box. Between the points where the segment crosses a slab plane, each axis is
 * either inside its slab or a fixed side of it, so the squared distance is one quadratic there: minimising each
 * piece and keeping the least is exact. Ties keep the earliest piece.
 */
const nearestT = (a: Vec3, d: Vec3, box: WallBox): number => {
  breaks[0] = 0;
  let count = 1;
  for (let axis = 0; axis < 3; axis++) {
    if (d[axis] !== 0) {
      count = addBreak((box.min[axis]! - a[axis]!) / d[axis]!, count);
      count = addBreak((box.max[axis]! - a[axis]!) / d[axis]!, count);
    }
  }
  breaks[count] = 1;
  count += 1;
  let bestT = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let piece = 0; piece + 1 < count; piece++) {
    const t = pieceMinimum(a, d, box, piece);
    const value = squaredAt(a, d, box, t);
    if (value < best) {
      best = value;
      bestT = t;
    }
  }
  return bestT;
};

const segmentOf = (proxy: GunProxy): Vec3 => [
  proxy.tip[0] - proxy.butt[0],
  proxy.tip[1] - proxy.butt[1],
  proxy.tip[2] - proxy.butt[2],
];

/** The proxy's clearance from one box: surface distance minus radius. */
export const boxClearance = (proxy: GunProxy, box: WallBox, d: Vec3 = segmentOf(proxy)): number =>
  Math.sqrt(squaredAt(proxy.butt, d, box, nearestT(proxy.butt, d, box))) - proxy.radius;

/** Whether the box is farther than `reach` from the proxy's axis on some axis, so it cannot be within `reach`. */
export const boxBeyond = (proxy: GunProxy, box: WallBox, reach: number): boolean => {
  for (let axis = 0; axis < 3; axis++) {
    const low = Math.min(proxy.butt[axis]!, proxy.tip[axis]!) - reach;
    const high = Math.max(proxy.butt[axis]!, proxy.tip[axis]!) + reach;
    if (box.min[axis]! > high || box.max[axis]! < low) {
      return true;
    }
  }
  return false;
};

/** Whether every box keeps `margin` clear of the proxy; stops at the first that does not. */
const keepsMargin = (proxy: GunProxy, boxes: readonly WallBox[], margin: number): boolean => {
  const d = segmentOf(proxy);
  const reach = proxy.radius + margin;
  for (const box of boxes) {
    if (!boxBeyond(proxy, box, reach) && boxClearance(proxy, box, d) < margin) {
      return false;
    }
  }
  return true;
};

export interface WallContact {
  /** Surface distance minus the proxy radius; negative means overlap. */
  readonly clearance: number;
  /** The nearest point on the nearest box. */
  readonly hit?: Vec3;
  /** The proxy axis point nearest it. */
  readonly from?: Vec3;
  readonly box?: WallBox;
}

/** The swept proxy's nearest box, its hit points, and optionally every box's clearance in `clearances`. */
export const proxyContact = (proxy: GunProxy, boxes: readonly WallBox[], clearances?: Float64Array): WallContact => {
  const d = segmentOf(proxy);
  let clearance = Number.POSITIVE_INFINITY;
  let bestIndex = -1;
  let bestT = 0;
  for (let index = 0; index < boxes.length; index++) {
    const box = boxes[index]!;
    const t = nearestT(proxy.butt, d, box);
    const own = Math.sqrt(squaredAt(proxy.butt, d, box, t)) - proxy.radius;
    if (clearances) {
      clearances[index] = own;
    }
    if (own < clearance) {
      clearance = own;
      bestIndex = index;
      bestT = t;
    }
  }
  if (bestIndex < 0) {
    return { clearance };
  }
  const box = boxes[bestIndex]!;
  const from = proxy.butt.map((value, axis) => value + d[axis]! * bestT) as Vec3;
  const hit = from.map((value, axis) => Math.min(box.max[axis]!, Math.max(box.min[axis]!, value))) as Vec3;
  return { clearance, hit, from, box };
};

interface WallLowering {
  readonly coefficient: number;
  readonly radians: number;
  readonly resolved: boolean;
  readonly proxy: GunProxy;
}

const loweringAngle = (coefficient: number, tuning: WallTuning): number =>
  ((tuning.maxLowerDegrees * Math.PI) / 180) * coefficient ** tuning.curveExponent;

/** Lower only: the smallest coefficient step whose proxy keeps the margin, or full lowering marked unresolved. */
const solveLowering = (
  sample: WallPoseSample,
  boxes: readonly WallBox[],
  radius: number,
  tuning: WallTuning,
): WallLowering => {
  const steps = Math.max(1, Math.round(tuning.steps));
  let last: WallLowering | undefined;
  for (let step = 0; step <= steps; step++) {
    const coefficient = step / steps;
    const radians = loweringAngle(coefficient, tuning);
    const proxy = gunProxy(sample, radians, radius, tuning.reachMetres);
    last = { coefficient, radians, resolved: keepsMargin(proxy, boxes, tuning.marginMetres), proxy };
    if (last.resolved) {
      return last;
    }
  }
  return last!;
};

/** One mode's CPU cost for one sample, in milliseconds, with the counts that drive it. */
interface WallModeCost {
  readonly gatherRealMs: number;
  readonly solveRealMs: number;
  /** Lowering steps tried, the resolved one included. */
  readonly steps: number;
}

interface WallModeResult {
  readonly boxes: readonly WallBox[];
  /** The intended (unlowered) proxy's contact. */
  readonly contact: WallContact;
  /** The intended proxy's clearance from each of `boxes`, by index. */
  readonly clearances: Float64Array;
  readonly lowering: WallLowering;
  readonly cost: WallModeCost;
}

export interface WallComparison {
  readonly radius: number;
  readonly intended: GunProxy;
  /** The modes asked for; the comparison fields need both. */
  readonly modes: Readonly<Partial<Record<WallMode, WallModeResult>>>;
  /** Refined clearance minus cells clearance at the intended pose, in metres; NaN with one mode. */
  readonly gap: number;
  /** Cells lowering minus refined lowering, in degrees: how much less refined lowers the gun; NaN with one mode. */
  readonly lowerGapDegrees: number;
  readonly unrefined: readonly string[];
}

const BOTH_MODES: readonly WallMode[] = ['cells', 'refined'];

/** The asked modes from one proxy, one curve and one margin: only the boxes differ. */
export const compareWalls = (
  world: WallWorld,
  sample: WallPoseSample,
  tuning: WallTuning,
  only: readonly WallMode[] = BOTH_MODES,
): WallComparison => {
  const radius = authoredProxyRadius(sample.pose.model) * tuning.radiusScale + tuning.radiusExtraMetres;
  const intended = gunProxy(sample, 0, radius, tuning.reachMetres);
  // The muzzle sweeps an arc, so sample it rather than only its ends.
  const points = [0, 0.25, 0.5, 0.75, 1].flatMap((coefficient) => {
    const proxy = gunProxy(sample, loweringAngle(coefficient, tuning), radius, tuning.reachMetres);
    return [proxy.butt, proxy.tip];
  });
  const pad = (radius + tuning.marginMetres) / sample.blockSize + tuning.regionPaddingBlocks;
  const low = [0, 1, 2].map(
    (axis) => Math.min(...points.map((point) => point[axis]!)) / sample.blockSize - pad,
  ) as Vec3;
  const high = [0, 1, 2].map(
    (axis) => Math.max(...points.map((point) => point[axis]!)) / sample.blockSize + pad,
  ) as Vec3;
  const run = (mode: WallMode): WallModeResult => {
    const start = performance.now();
    const boxes = gatherWallBoxes(world, mode, low, high);
    const gathered = performance.now();
    const clearances = new Float64Array(boxes.length);
    const contact = proxyContact(intended, boxes, clearances);
    const lowering = solveLowering(sample, boxes, radius, tuning);
    const steps = Math.round(lowering.coefficient * Math.max(1, Math.round(tuning.steps))) + 1;
    const cost = { gatherRealMs: gathered - start, solveRealMs: performance.now() - gathered, steps };
    return { boxes, contact, clearances, lowering, cost };
  };
  const modes: Partial<Record<WallMode, WallModeResult>> = Object.fromEntries(only.map((mode) => [mode, run(mode)]));
  const { cells, refined } = modes;
  const unrefined = [...new Set((refined?.boxes ?? []).flatMap((box) => (box.unrefined ? [box.unrefined] : [])))];
  return {
    radius,
    intended,
    modes,
    gap: cells && refined ? refined.contact.clearance - cells.contact.clearance : Number.NaN,
    lowerGapDegrees:
      cells && refined ? ((cells.lowering.radians - refined.lowering.radians) * 180) / Math.PI : Number.NaN,
    unrefined,
  };
};
