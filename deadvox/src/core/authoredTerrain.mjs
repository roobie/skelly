// Pure ES6 shared by Tiled 1.11/Qt and the runtime. Metres throughout; no host/editor APIs.
export const smoothstep = (t) => t * t * (3 - 2 * t);
// Distance to half-metre block centres, preserving the native nearest-owner metric.
const rectDistance = (r, x, z) =>
  Math.hypot(Math.max(r.x0 + 0.25 - x, 0, x - (r.x1 - 0.25)), Math.max(r.z0 + 0.25 - z, 0, z - (r.z1 - 0.25)));
export const polylineDistance = ([x, z], points) => {
  let closest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const dx = bx - ax;
    const dz = bz - az;
    const length2 = dx * dx + dz * dz;
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2));
    closest = Math.min(closest, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return closest;
};

export const profileHeight = (layout, x, z) => {
  let rise = 0;
  for (const feature of layout.terrain) {
    const distance =
      feature.kind === 'ridge'
        ? polylineDistance([x, z], feature.points) / feature.width
        : Math.hypot((x - feature.centre[0]) / feature.radii[0], (z - feature.centre[1]) / feature.radii[1]);
    rise = Math.max(rise, feature.rise * (1 - smoothstep(Math.min(1, distance))));
  }
  return layout.ground + rise;
};

export const buildingBounds = (building, size) => {
  const [x, , z] = building.position;
  const [w, d] = building.rotation % 180 === 0 ? [size[0], size[2]] : [size[2], size[0]];
  return { x0: x, z0: z, x1: x + w * 0.5, z1: z + d * 0.5 };
};

// Seam for accepted cellar metadata: the surface foundation need not be the lowest storey's origin.
export const surfaceFoundation = (building) => building.position[1];
export const lotOf = (building, rect) => ({
  rect,
  floor: surfaceFoundation(building),
  key: `${building.template}:${building.position.join(',')}:${building.rotation}`,
});
export const defaultFoundation = (layout, rect) =>
  Math.round(profileHeight(layout, (rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2) * 2) / 2;

export const layoutHeight = (layout, lots, [x, z], natural) => {
  const profile = profileHeight(layout, x, z);
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
    const distance = rectDistance({ x0: r.x0 - 2, x1: r.x1 + 2, z0: r.z0 - 2, z1: r.z1 + 2 }, x, z);
    if (distance < 4) {
      return closest.floor + (profile - closest.floor) * smoothstep(distance / 4);
    }
  }
  const boundary = rectDistance(layout.bounds, x, z);
  return profile + (natural - profile) * smoothstep(Math.min(1, boundary / 16));
};

// Standing surface of the actual half-metre voxel at this point, including neighbouring lot transitions.
export const standingHeight = (layout, lots, x, z) => {
  const cx = (Math.floor(x * 2) + 0.5) / 2;
  const cz = (Math.floor(z * 2) + 0.5) / 2;
  return Math.round(layoutHeight(layout, lots, [cx, cz], layout.ground) * 2) / 2 + 0.5;
};
