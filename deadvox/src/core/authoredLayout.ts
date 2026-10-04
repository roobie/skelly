// Content-side acceptance of an authored layout; shape/units are checked by schema.ts.
import type { Registry, TemplateDef } from './content.ts';
import type { SiteLayoutDef } from './schema.ts';
import type { Rect } from './site.ts';
import { templateLockIds } from './templates.ts';
import { rectsOverlap } from './vegetation.ts';

export type LayoutPoint = readonly [number, number];
export const insideLayout = (bounds: Rect, [x, z]: LayoutPoint, inset = 0): boolean =>
  x >= bounds.x0 + inset && z >= bounds.z0 + inset && x <= bounds.x1 - inset && z <= bounds.z1 - inset;

/** Half-metre ASCII cells; position is the lowest corner AFTER rotation, as Placement expects. */
export const buildingBounds = (building: SiteLayoutDef['buildings'][number], size: readonly number[]): Rect => {
  const [x, , z] = building.position;
  const [w, d] = building.rotation % 180 === 0 ? [size[0]!, size[2]!] : [size[2]!, size[0]!];
  return { x0: x, z0: z, x1: x + w * 0.5, z1: z + d * 0.5 };
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
  const locks = new Set<string>();
  const checkLocks = (template: TemplateDef, storeys: number, i: number) => {
    for (let storey = 0; storey < storeys; storey += 1) {
      for (const id of templateLockIds(registry, template)) {
        if (locks.has(id)) {
          issues.push([`.buildings[${i}]`, `lock "${id}" is used more than once in this site`]);
        }
        locks.add(id);
      }
    }
  };
  layout.buildings.forEach((building, i) => {
    const template = registry.templates.get(building.template);
    if (!template) {
      issues.push([`.buildings[${i}].template`, `no template "${building.template}"`]);
      return;
    }
    checkLocks(template, building.storeys ?? 1, i);
    const rect = buildingBounds(building, template.size);
    check([rect.x0, rect.z0], `.buildings[${i}].position`);
    check([rect.x1, rect.z1], `.buildings[${i}].position`);
    for (const prior of footprints) {
      if (rectsOverlap(prior.rect, rect)) {
        issues.push([`.buildings[${i}]`, `overlaps buildings[${prior.index}]`]);
      }
    }
    footprints.push({ rect, index: i });
  });
  checkSpawn([layout.player.position[0], layout.player.position[2]], '.player.position');
  layout.shamblers.forEach((spawn, i) => {
    if (!registry.zombies.has(spawn.type)) {
      issues.push([`.shamblers[${i}].type`, `no zombie type "${spawn.type}"`]);
    }
    checkSpawn([spawn.position[0], spawn.position[2]], `.shamblers[${i}].position`);
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

export const polylineDistance = ([x, z]: LayoutPoint, points: readonly LayoutPoint[]): number => {
  let closest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1]!;
    const [bx, bz] = points[i]!;
    const dx = bx - ax;
    const dz = bz - az;
    const length2 = dx * dx + dz * dz;
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2));
    closest = Math.min(closest, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return closest;
};
