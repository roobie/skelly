// Where each solid is drawn, so the datums an export writes (grips, anchors, round poses, collision boxes, centres of
// mass) read off the voxels the player sees rather than off the authored solids those voxels approximate.

import type { Resolved } from '@skelly/engine/assembly/schema.ts';
import { add, applyPoint, extrusionPoint, invert, type Transform, type Vec3 } from '@skelly/engine/foundation/math.ts';
import {
  clippedExtrudedPolygonPolyhedron,
  localSolidBounds,
  polyhedronMeasures,
} from '@skelly/engine/shapes/geometry.ts';
import { displayBevel, meshForSolid } from '@skelly/engine/shapes/mesh.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import type { VoxelGrains } from './exportTypes.ts';
import { latticeOrigin, partVoxelGrain } from './glb.ts';
import { measureVoxels } from './voxelize.ts';

/** A solid's bounds, centre and volume in its part's local frame and domain units. */
export interface SolidMeasure {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly centre: Vec3;
  readonly volume: number;
}

const authoredVolume = (solid: Solid): { readonly volume: number; readonly centre: Vec3 } => {
  if (solid.kind === 'box') {
    return { volume: 8 * solid.box.half[0] * solid.box.half[1] * solid.box.half[2], centre: solid.box.center };
  }
  if (solid.kind === 'extruded-polygon') {
    const shape = clippedExtrudedPolygonPolyhedron(solid);
    if (!shape) {
      return { volume: 0, centre: [0, 0, 0] };
    }
    const { volume, centroid } = polyhedronMeasures(shape);
    return { volume, centre: centroid };
  }
  let volume = 0;
  let moment = 0;
  for (let i = 0; i < solid.profile.length; i++) {
    const [a, r] = solid.profile[i]!;
    const [b, s] = solid.profile[(i + 1) % solid.profile.length]!;
    volume += ((b - a) * (r * r + r * s + s * s)) / 3;
    moment += ((b - a) * ((3 * a + b) * r * r + 2 * (a + b) * r * s + (a + 3 * b) * s * s)) / 12;
  }
  const axial = volume === 0 ? 0 : moment / volume;
  return {
    volume: Math.PI * Math.abs(volume),
    centre: add(solid.origin ?? [0, 0, 0], extrusionPoint(solid.axis ?? 'z', [0, 0], axial)),
  };
};

export const authoredMeasure = (solid: Solid): SolidMeasure => {
  const [min, max] = localSolidBounds(solid);
  return { min, max, ...authoredVolume(solid) };
};

/** The point at the same fraction of `drawn`'s bounds as `point` is of `authored`'s; a flat axis takes the middle. */
export const pointWithin = (authored: readonly [Vec3, Vec3], drawn: SolidMeasure, point: Vec3): Vec3 =>
  point.map((value, axis) => {
    const span = authored[1][axis]! - authored[0][axis]!;
    const fraction = span > 1e-12 ? (value - authored[0][axis]!) / span : 0.5;
    return drawn.min[axis]! + fraction * (drawn.max[axis]! - drawn.min[axis]!);
  }) as unknown as Vec3;

export interface DrawnGeometry {
  /** The solid of `part` as it is drawn; without a voxel grain, as it is authored. */
  readonly measure: (part: string, solid: Solid) => SolidMeasure;
  /**
   * An assembly point moved to its place on the drawn model. It keeps its fraction of the bounds of the smallest drawn
   * solid or whole part around it, or, outside them all, of the nearest one.
   */
  readonly point: (at: Vec3) => Vec3;
  /**
   * The grain of the lattice, anchored at the model origin, that `part`'s drawn faces lie on in the model frame: none
   * without a voxel grain, or when the part is turned off the axes and its boxes stand off every lattice plane.
   */
  readonly grain: (part: string) => number | undefined;
}

const onAxes = ({ r }: Transform): boolean => r.every((x) => [-1, 0, 1].some((q) => Math.abs(x - q) < 1e-9));

interface Region {
  readonly placed: Transform;
  readonly toLocal: Transform;
  readonly authored: readonly [Vec3, Vec3];
  readonly drawn: () => SolidMeasure;
}

const sizeOf = ([min, max]: readonly [Vec3, Vec3]): number => (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]);

const distanceTo = ([min, max]: readonly [Vec3, Vec3], point: Vec3): number =>
  Math.hypot(...point.map((value, axis) => Math.max(min[axis]! - value, 0, value - max[axis]!)));

const unionOf = (boxes: readonly (readonly [Vec3, Vec3])[]): [Vec3, Vec3] => [
  [0, 1, 2].map((axis) => Math.min(...boxes.map(([min]) => min[axis]!))) as unknown as Vec3,
  [0, 1, 2].map((axis) => Math.max(...boxes.map(([, max]) => max[axis]!))) as unknown as Vec3,
];

/**
 * Reads datums off the drawn voxels of `resolved` at the export's grains: each solid is sampled alone on its part's
 * lattice, as `glb.ts` samples it for the file. Without a grain the file holds the authored meshes, so datums stay on
 * the authored solids.
 */
export const drawnGeometry = (
  resolved: Resolved,
  options: Partial<VoxelGrains> & { readonly revolveFacets?: number | undefined } = {},
): DrawnGeometry => {
  const { voxelGrain, voxelDetailGrain } = options;
  const unit = resolved.domain.units.metresPerUnit;
  const measures = new Map<Solid, SolidMeasure>();
  const measure = (partId: string, solid: Solid): SolidMeasure => {
    const known = measures.get(solid);
    if (known) {
      return known;
    }
    const def = resolved.defs.get(partId);
    const placed = resolved.placed.get(partId);
    if (!(def && placed)) {
      throw new Error(`No placed part ${partId} to read a datum from`);
    }
    let found = authoredMeasure(solid);
    if (voxelGrain !== undefined) {
      const grain = partVoxelGrain(def, { voxelGrain, voxelDetailGrain });
      const bevel = solid.display?.mergeGroup === undefined ? displayBevel(solid, resolved.domain.units) : 0;
      const mesh = meshForSolid(solid, bevel, options.revolveFacets);
      const voxels = measureVoxels(
        [{ positions: mesh.positions.map((x) => x * unit), indices: mesh.indices, group: 0 }],
        grain,
        latticeOrigin(placed, grain, unit),
      );
      if (!voxels) {
        throw new Error(`Solid ${solid.id} of ${partId} draws no voxels to read its datums from`);
      }
      const inUnits = (v: readonly number[]): Vec3 => [v[0]! / unit, v[1]! / unit, v[2]! / unit];
      found = {
        min: inUnits(voxels.min),
        max: inUnits(voxels.max),
        centre: inUnits(voxels.centroid),
        volume: voxels.voxels * (grain / unit) ** 3,
      };
    }
    measures.set(solid, found);
    return found;
  };
  let regions: Region[] | undefined;
  const regionsOf = (): Region[] => {
    regions ??= [...resolved.defs].flatMap(([part, def]) => {
      const placed = resolved.placed.get(part);
      const solids = def.displaySolids ?? def.solids;
      if (!placed || solids.length === 0) {
        return [];
      }
      const toLocal = invert(placed);
      const own = solids.map(
        (solid): Region => ({
          placed,
          toLocal,
          authored: localSolidBounds(solid),
          drawn: () => measure(part, solid),
        }),
      );
      const whole: Region = {
        placed,
        toLocal,
        authored: unionOf(own.map(({ authored }) => authored)),
        drawn: () => {
          const [min, max] = unionOf(own.map(({ drawn }) => [drawn().min, drawn().max]));
          return { min, max, centre: [0, 0, 0], volume: 0 };
        },
      };
      return [...own, whole];
    });
    return regions;
  };
  const point = (at: Vec3): Vec3 => {
    if (voxelGrain === undefined) {
      return at;
    }
    const located = regionsOf().map((region) => {
      const local = applyPoint(region.toLocal, at);
      return { region, local, distance: distanceTo(region.authored, local), size: sizeOf(region.authored) };
    });
    const inside = located.filter(({ distance }) => distance <= 1e-9);
    const [chosen] = (inside.length > 0 ? inside : located).sort((a, b) =>
      inside.length > 0 ? a.size - b.size : a.distance - b.distance,
    );
    if (!chosen) {
      throw new Error('No drawn solid to place a datum on');
    }
    return applyPoint(chosen.region.placed, pointWithin(chosen.region.authored, chosen.region.drawn(), chosen.local));
  };
  const grain = (part: string): number | undefined => {
    const def = resolved.defs.get(part);
    const placed = resolved.placed.get(part);
    return voxelGrain !== undefined && def && placed && onAxes(placed)
      ? partVoxelGrain(def, { voxelGrain, voxelDetailGrain })
      : undefined;
  };
  return { measure, point, grain };
};
