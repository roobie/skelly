// Pure ES6 shared by Tiled 1.11/Qt and the runtime. Metres throughout; no host/editor APIs.
// The runtime closure check refuses JSDoc module references, so these types spell out only the fields read
// here; authoredTerrain.d.mts gives callers the schema types.
/** @typedef {readonly [number, number]} Point */
/** @typedef {{ x0: number; z0: number; x1: number; z1: number }} Rect */
/**
 * @typedef {| { kind: 'ridge'; points: readonly Point[]; rise: number; width: number }
 *   | { kind: 'hill'; centre: Point; radii: Point; rise: number }
 *   | { kind: 'basin'; centre: Point; radii: Point; depth: number }} TerrainFeature
 */
/** @typedef {{ ground: number; terrain: readonly TerrainFeature[] }} TerrainProfile */
/** @typedef {TerrainProfile & { bounds: Rect }} BoundedProfile */
/** @typedef {{ template: string; position: readonly [number, number, number]; rotation: number }} LayoutBuilding */
/** @typedef {{ rect: Rect; floor: number; key: string }} GroundLot */

export const LOT_APRON_M = 2;
export const LOT_BLEND_M = 4;
const SITE_BLEND_M = 16;
/** @param {number} t */
export const smoothstep = (t) => t * t * (3 - 2 * t);
// Coordinates are cell centres; rectangle bounds are exclusive, in the same units.
/**
 * @param {Rect} r
 * @param {number} x
 * @param {number} z
 */
export const rectDistance = (r, x, z, cellSize = 0.5) => {
  const half = cellSize / 2;
  return Math.hypot(Math.max(r.x0 + half - x, 0, x - (r.x1 - half)), Math.max(r.z0 + half - z, 0, z - (r.z1 - half)));
};
/** @param {readonly Point[]} points */
export const hasSegment = (points) =>
  points.some((point, i) => {
    const previous = points[i - 1];
    return previous !== undefined && (point[0] !== previous[0] || point[1] !== previous[1]);
  });
/**
 * @param {number} x
 * @param {number} z
 * @param {readonly Point[]} points
 */
export const polylineDistanceAt = (x, z, points) => {
  let closest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = /** @type {Point} */ (points[i - 1]);
    const [bx, bz] = /** @type {Point} */ (points[i]);
    const dx = bx - ax;
    const dz = bz - az;
    const length2 = dx * dx + dz * dz;
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2));
    closest = Math.min(closest, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return closest;
};

/**
 * @param {Point} point
 * @param {readonly Point[]} points
 */
export const polylineDistance = ([x, z], points) => polylineDistanceAt(x, z, points);

// Overlapping hills take the highest rise and overlapping basins the deepest cut, so a basin on a hill flank cuts a tarn.
/**
 * @param {TerrainProfile} layout
 * @param {number} x
 * @param {number} z
 */
export const profileHeight = (layout, x, z) => {
  let rise = 0;
  let depth = 0;
  for (const feature of layout.terrain) {
    const distance =
      feature.kind === 'ridge'
        ? polylineDistance([x, z], feature.points) / feature.width
        : Math.hypot((x - feature.centre[0]) / feature.radii[0], (z - feature.centre[1]) / feature.radii[1]);
    const weight = 1 - smoothstep(Math.min(1, distance));
    if (feature.kind === 'basin') {
      depth = Math.max(depth, feature.depth * weight);
    } else {
      rise = Math.max(rise, feature.rise * weight);
    }
  }
  return layout.ground + rise - depth;
};

/**
 * @param {Pick<LayoutBuilding, 'position' | 'rotation'>} building
 * @param {readonly [number, number, number]} size
 * @returns {Rect}
 */
export const buildingBounds = (building, size) => {
  const [x, , z] = building.position;
  const [w, d] = building.rotation % 180 === 0 ? [size[0], size[2]] : [size[2], size[0]];
  return { x0: x, z0: z, x1: x + w * 0.5, z1: z + d * 0.5 };
};

// Seam for accepted cellar metadata: the surface foundation need not be the lowest storey's origin.
/** @param {LayoutBuilding} building */
export const surfaceFoundation = (building) => building.position[1];
/**
 * @param {LayoutBuilding} building
 * @param {Rect} rect
 * @returns {GroundLot}
 */
export const lotOf = (building, rect) => ({
  rect,
  floor: surfaceFoundation(building),
  key: `${building.template}:${building.position.join(',')}:${building.rotation}`,
});
/**
 * @param {TerrainProfile} layout
 * @param {Rect} rect
 */
export const defaultFoundation = (layout, rect) =>
  Math.round(profileHeight(layout, (rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2) * 2) / 2;

/**
 * @param {BoundedProfile} layout
 * @param {readonly GroundLot[]} lots
 * @param {Point} point
 * @param {number} natural
 */
export const layoutHeight = (layout, lots, [x, z], natural) => {
  const profile = profileHeight(layout, x, z);
  /** @type {GroundLot | undefined} */
  let closest;
  let nearest = Number.POSITIVE_INFINITY;
  for (const lot of lots) {
    const distance = rectDistance(lot.rect, x, z);
    if (!closest || distance < nearest || (distance === nearest && lot.key < closest.key)) {
      closest = lot;
      nearest = distance;
    }
  }
  if (closest) {
    const r = closest.rect;
    const distance = rectDistance(
      { x0: r.x0 - LOT_APRON_M, x1: r.x1 + LOT_APRON_M, z0: r.z0 - LOT_APRON_M, z1: r.z1 + LOT_APRON_M },
      x,
      z,
    );
    if (distance < LOT_BLEND_M) {
      return closest.floor + (profile - closest.floor) * smoothstep(distance / LOT_BLEND_M);
    }
  }
  const boundary = rectDistance(layout.bounds, x, z);
  return profile + (natural - profile) * smoothstep(Math.min(1, boundary / SITE_BLEND_M));
};

// Standing surface of the actual half-metre voxel at this point, including neighbouring lot transitions.
/**
 * @param {BoundedProfile} layout
 * @param {readonly GroundLot[]} lots
 * @param {number} x
 * @param {number} z
 */
export const standingHeight = (layout, lots, x, z) => {
  const cx = (Math.floor(x * 2) + 0.5) / 2;
  const cz = (Math.floor(z * 2) + 0.5) / 2;
  return Math.round(layoutHeight(layout, lots, [cx, cz], layout.ground) * 2) / 2 + 0.5;
};
