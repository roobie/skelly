// Content-side acceptance of an authored layout; shape/units are checked by schema.ts.
import { buildingBounds, lotOf, profileHeight, standingHeight, surfaceFoundation } from './authoredTerrain.mjs';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { SiteLayoutDef } from './schema.ts';
import type { Rect } from './site.ts';
import { compileTemplate, type Placement, placedBlockAt, stackTemplate, type Turn } from './templates.ts';
import { rectsOverlap } from './vegetation.ts';

export type LayoutPoint = readonly [number, number];
export const insideLayout = (bounds: Rect, [x, z]: LayoutPoint, inset = 0): boolean =>
  x >= bounds.x0 + inset && z >= bounds.z0 + inset && x <= bounds.x1 - inset && z <= bounds.z1 - inset;

/** Maximum intentional levelling of the raw profile at any half-metre footprint cell. */
export const FOUNDATION_TOLERANCE = 1;
const foundationFits = (layout: SiteLayoutDef, building: SiteLayoutDef['buildings'][number], rect: Rect): boolean => {
  for (let z = rect.z0 + 0.25; z < rect.z1; z += 0.5) {
    for (let x = rect.x0 + 0.25; x < rect.x1; x += 0.5) {
      if (Math.abs(surfaceFoundation(building) - profileHeight(layout, x, z)) > FOUNDATION_TOLERANCE) {
        return false;
      }
    }
  }
  return true;
};

export const authoredLayoutIssues = (layout: SiteLayoutDef, registry: Registry): [string, string][] => {
  const issues: [string, string][] = [];
  if (['hamlet', 'city', 'forest'].includes(layout.id)) {
    issues.push(['.id', 'reserved built-in site id']);
  }
  const check = (p: LayoutPoint, path: string, inset = 0) => {
    if (!insideLayout(layout.bounds, p, inset)) {
      issues.push([path, 'outside site bounds']);
    }
  };
  const checkSpawn = ([x, z]: LayoutPoint, path: string) => {
    if (!insideLayout(layout.bounds, [x, z]) || x === layout.bounds.x1 || z === layout.bounds.z1) {
      issues.push([path, 'outside site bounds']);
    }
  };
  const footprints: { rect: Rect; index: number }[] = [];
  const placements: Placement[] = [];
  layout.buildings.forEach((building, i) => {
    const template = registry.templates.get(building.template);
    if (!template) {
      issues.push([`.buildings[${i}].template`, `no template "${building.template}"`]);
      return;
    }
    const rect = buildingBounds(building, template.size);
    check([rect.x0, rect.z0], `.buildings[${i}].position`);
    check([rect.x1, rect.z1], `.buildings[${i}].position`);
    for (const prior of footprints) {
      if (rectsOverlap(prior.rect, rect)) {
        issues.push([`.buildings[${i}]`, `overlaps buildings[${prior.index}]`]);
      }
    }
    footprints.push({ rect, index: i });
    if (
      insideLayout(layout.bounds, [rect.x0, rect.z0]) &&
      insideLayout(layout.bounds, [rect.x1, rect.z1]) &&
      !foundationFits(layout, building, rect)
    ) {
      issues.push([`.buildings[${i}].position`, `foundation cut or fill exceeds ${FOUNDATION_TOLERANCE} m`]);
    }
    placements.push({
      template: stackTemplate(compileTemplate(registry, template), building.storeys ?? 1),
      origin: building.position.map((v) => v * 2) as Vec3,
      turn: (building.rotation / 90) as Turn,
    });
  });
  const lots = footprints.map(({ rect, index }) => lotOf(layout.buildings[index]!, rect));
  const supported = (position: Vec3, path: string) => {
    const [x, y, z] = position;
    const below: Vec3 = [Math.floor(x * 2), Math.round(y * 2) - 1, Math.floor(z * 2)];
    let support = standingHeight(layout, lots, x, z);
    let buried = false;
    for (const placement of placements) {
      const block = placedBlockAt(placement, below);
      if (block !== undefined) {
        support = registry.blocks[block]?.solid ? y : Number.NaN;
      }
      const atFeet = placedBlockAt(placement, [below[0], below[1] + 1, below[2]]);
      buried ||= atFeet !== undefined && registry.blocks[atFeet]?.solid === true;
    }
    if (buried || !Number.isFinite(support) || Math.abs(y - support) > 0.001 || !Number.isInteger(y * 2)) {
      issues.push([path, 'spawn must stand on a supported surface']);
    }
  };
  supported(layout.player.position, '.player.position');
  checkSpawn([layout.player.position[0], layout.player.position[2]], '.player.position');
  layout.shamblers.forEach((spawn, i) => {
    if (!registry.zombies.has(spawn.type)) {
      issues.push([`.shamblers[${i}].type`, `no zombie type "${spawn.type}"`]);
    }
    checkSpawn([spawn.position[0], spawn.position[2]], `.shamblers[${i}].position`);
    supported(spawn.position, `.shamblers[${i}].position`);
  });
  layout.terrain.forEach((feature, i) => {
    const points = feature.kind === 'ridge' ? feature.points : [feature.centre];
    points.forEach((point, j) => {
      check(point, `.terrain[${i}].points[${j}]`);
    });
  });
  layout.woodlands.forEach((wood, i) => {
    wood.polygon.forEach((p, j) => {
      check(p, `.woodlands[${i}].polygon[${j}]`);
    });
  });
  layout.tracks.forEach((track, i) => {
    track.points.forEach((p, j) => {
      check(p, `.tracks[${i}].points[${j}]`, track.width / 2);
    });
  });
  return issues;
};

/** Even-odd polygon fill; woodland edges are deliberately rough in this spike. */
export const inPolygon = ([x, z]: LayoutPoint, polygon: readonly LayoutPoint[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [ax, az] = polygon[i]!;
    const [bx, bz] = polygon[j]!;
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) {
      inside = !inside;
    }
  }
  return inside;
};
