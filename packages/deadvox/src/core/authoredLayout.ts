// Content-side acceptance of an authored layout; shape/units are checked by schema.ts.
import { blocks, placementOf } from './authoredPlacement.ts';
import { buildingBounds, lotOf, profileHeight, standingHeight, surfaceFoundation } from './authoredTerrain.mjs';
import type { Registry, TemplateDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import { placementLootIssues } from './placementLoot.ts';
import { WORLD_BOTTOM_M } from './scale.ts';
import type { SiteLayoutDef } from './schema.ts';
import { HORDE_TYPE, TEMPLATE_BLOCK_SIZE } from './settlementSpawns.ts';
import { type Rect, rectsOverlap } from './site.ts';
import { spawnOverlappingSolidBlock, zombieBodyDimensions } from './spawnClearance.ts';
import { type Placement, placedBlockAt, placedPieces, templateLockIds, templateResolves } from './templates.ts';

export type LayoutPoint = readonly [number, number];
const insideLayout = (bounds: Rect, [x, z]: LayoutPoint, inset = 0): boolean =>
  x >= bounds.x0 + inset && z >= bounds.z0 + inset && x <= bounds.x1 - inset && z <= bounds.z1 - inset;

/** Maximum intentional levelling of the raw profile at any half-metre footprint cell. */
const FOUNDATION_TOLERANCE = 1;
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
  if (['city', 'forest'].includes(layout.id)) {
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
  const checkFootprint = (rect: Rect, i: number) => {
    check([rect.x0, rect.z0], `.buildings[${i}].position`);
    check([rect.x1, rect.z1], `.buildings[${i}].position`);
    for (const prior of footprints) {
      if (rectsOverlap(prior.rect, rect)) {
        issues.push([`.buildings[${i}]`, `overlaps buildings[${prior.index}]`]);
      }
    }
    footprints.push({ rect, index: i });
  };
  layout.buildings.forEach((building, i) => {
    const template = registry.templates.get(building.template);
    if (!template) {
      issues.push([`.buildings[${i}].template`, `no template "${building.template}"`]);
      return;
    }
    checkLocks(template, building.storeys ?? 1, i);
    if (template.access && (building.storeys ?? 1) !== 1) {
      issues.push([`.buildings[${i}].storeys`, 'explicit storeys cannot be stress-test stacked']);
      return;
    }
    const rect = buildingBounds(building, template.size);
    checkFootprint(rect, i);
    if (
      insideLayout(layout.bounds, [rect.x0, rect.z0]) &&
      insideLayout(layout.bounds, [rect.x1, rect.z1]) &&
      !foundationFits(layout, building, rect)
    ) {
      issues.push([`.buildings[${i}].position`, `foundation cut or fill exceeds ${FOUNDATION_TOLERANCE} m`]);
    }
    if (!templateResolves(registry, template)) {
      return; // checkTemplates reports the palette; the placement can't compile without it.
    }
    const placement = placementOf(registry, building, layout.lootContext);
    issues.push(
      ...placementLootIssues(
        { registry, context: placement.lootContext! },
        placement.template,
        building.fixedLoot ?? [],
        `.buildings[${i}].fixedLoot`,
      ),
    );
    if (placement.origin[1] * TEMPLATE_BLOCK_SIZE < WORLD_BOTTOM_M) {
      issues.push([`.buildings[${i}].position`, 'cellar extends below the world floor']);
    }
    placements.push(placement);
  });
  const lots = footprints.map(({ rect, index }) => lotOf(layout.buildings[index]!, rect));
  const solidFurniture = placements.flatMap(placedPieces).filter((piece) => {
    const furniture = registry.furniture.get(piece.furniture);
    return furniture && furniture.solid !== false;
  });
  const solidAt = (x: number, y: number, z: number): boolean =>
    placements.some((placement) => {
      const block = placedBlockAt(placement, [x, y, z]);
      return block !== undefined && registry.blocks[block]?.solid === true;
    }) ||
    solidFurniture.some(
      (piece) =>
        x >= piece.pos[0] &&
        x < piece.pos[0] + piece.size[0] &&
        y >= piece.pos[1] &&
        y < piece.pos[1] + piece.size[1] &&
        z >= piece.pos[2] &&
        z < piece.pos[2] + piece.size[2],
    );
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
  layout.bays?.forEach(({ position }, i) => {
    const path = `.bays[${i}].position`;
    checkSpawn([position[0], position[2]], path);
    supported(position, path);
  });
  if (layout.repairStock !== undefined) {
    const stock = placements.filter(({ template }) => template.id === layout.repairStock);
    if (stock.length !== 1) {
      issues.push(['.repairStock', `"${layout.repairStock}" must name exactly one building in this site`]);
    } else if (!placedPieces(stock[0]!).some(({ furniture }) => registry.furniture.get(furniture)?.container)) {
      issues.push(['.repairStock', `"${layout.repairStock}" has no container furniture`]);
    }
  }
  supported(layout.player.position, '.player.position');
  checkSpawn([layout.player.position[0], layout.player.position[2]], '.player.position');
  const authoredHordes = layout.hordes ?? [];
  const hordeType = registry.zombies.get(HORDE_TYPE);
  if (authoredHordes.length > 0 && !hordeType) {
    issues.push(['.hordes', `no zombie type "${HORDE_TYPE}"`]);
  }
  const hordeIds = new Set<string>();
  authoredHordes.forEach(({ id, position }, i) => {
    const path = `.hordes[${i}].position`;
    if (hordeIds.has(id)) {
      issues.push([`.hordes[${i}].id`, `horde id "${id}" is used more than once in this site`]);
    }
    hordeIds.add(id);
    checkSpawn([position[0], position[2]], path);
    supported(position, path);
    if (hordeType) {
      const blocked = spawnOverlappingSolidBlock(
        blocks(position),
        zombieBodyDimensions(hordeType, TEMPLATE_BLOCK_SIZE),
        solidAt,
      );
      if (blocked) {
        issues.push([path, `spawn body overlaps solid cell [${blocked.join(',')}]`]);
      }
    }
  });
  layout.shamblers.forEach((spawn, i) => {
    const type = registry.zombies.get(spawn.type);
    if (!type) {
      issues.push([`.shamblers[${i}].type`, `no zombie type "${spawn.type}"`]);
    }
    checkSpawn([spawn.position[0], spawn.position[2]], `.shamblers[${i}].position`);
    supported(spawn.position, `.shamblers[${i}].position`);
    if (type) {
      const blocked = spawnOverlappingSolidBlock(
        blocks(spawn.position),
        zombieBodyDimensions(type, TEMPLATE_BLOCK_SIZE),
        solidAt,
      );
      if (blocked) {
        issues.push([`.shamblers[${i}].position`, `spawn body overlaps solid cell [${blocked.join(',')}]`]);
      }
    }
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
    if (!registry.blockIds.has(track.surface)) {
      issues.push([`.tracks[${i}].surface`, `no block "${track.surface}"`]);
    }
  });
  const beatIds = new Set<string>();
  layout.beats?.forEach(({ id, area }, i) => {
    if (beatIds.has(id)) {
      issues.push([`.beats[${i}].id`, `beat "${id}" is used more than once`]);
    }
    beatIds.add(id);
    check([area.x0, area.z0], `.beats[${i}].area`);
    check([area.x1, area.z1], `.beats[${i}].area`);
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
