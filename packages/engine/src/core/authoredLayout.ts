// Content-side acceptance of an authored layout; shape/units are checked by schema.ts.
import { blocks, buildingFootprint, buildingSource, layoutBuildingSite, placementOf } from './authoredPlacement.ts';
import { LOT_APRON_M, lotOf, profileHeight, standingHeight, surfaceFoundation } from './authoredTerrain.mjs';
import { claimed } from './capabilities.ts';
import type { Registry } from './content.ts';
import { CHUNK, type Vec3 } from './coords.ts';
import { placementLootIssues } from './placementLoot.ts';
import { WORLD_BOTTOM_M, WORLD_TOP_M } from './scale.ts';
import type { SiteLayoutDef } from './schema.ts';
import { TEMPLATE_BLOCK_SIZE } from './settlementSpawns.ts';
import { loadedCatalogue, slotPlacement, slotProps } from './showroom.ts';
import { grow, type Rect, rectDistance, rectsOverlap } from './site.ts';
import { actorBodyDimensions, spawnOverlappingSolidBlock } from './spawnClearance.ts';
import {
  type CompiledTemplate,
  cellsOf,
  compiledLockIds,
  type Placement,
  placedBlockAt,
  placedPieces,
  templateResolves,
} from './templates.ts';

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

/** A slot row that names unknown furniture, outgrows its capacity or leaves the deck is reported, not placed. */
const showroomIssues = (
  layout: SiteLayoutDef,
  registry: Registry,
  solidAt: (x: number, y: number, z: number) => boolean,
): [string, string][] => {
  const showroom = layout.showroom!;
  const issues: [string, string][] = [];
  const { catalogue } = showroom;
  if (catalogue) {
    if (!registry.blockIds.has(catalogue.floor)) {
      issues.push(['.showroom.catalogue.floor', `no block "${catalogue.floor}"`]);
    }
    if (showroom.focusDistance >= catalogue.spacing) {
      issues.push(['.showroom.focusDistance', 'must be less than the catalogue spacing, so focus stands in an aisle']);
    }
  }
  if (showroom.slots.length > showroom.capacity) {
    issues.push(['.showroom.slots', `holds ${showroom.slots.length} slots; capacity is ${showroom.capacity}`]);
  }
  showroom.slots.forEach(({ furniture }, i) => {
    if (!registry.furniture.has(furniture)) {
      issues.push([`.showroom.slots[${i}].furniture`, `no furniture "${furniture}"`]);
    }
  });
  if (issues.length > 0) {
    return issues;
  }
  // An unknown row id is the row's own issue; the floor is measured once the rows resolve.
  const rowsResolve = [...registry.catalogueRows.values()].every(({ furniture }) =>
    furniture.every((id) => registry.furniture.has(id)),
  );
  const shown = catalogue && rowsResolve ? loadedCatalogue(registry, catalogue) : undefined;
  if (shown) {
    // Streaming whole columns, the startup ring can reach one column past its radius.
    const ready = claimed(registry.graphics, 'graphics')?.readyRadiusM;
    const [px, , pz] = layout.player.position;
    const distance = rectDistance(
      shown.rect,
      Math.floor(px / TEMPLATE_BLOCK_SIZE),
      Math.floor(pz / TEMPLATE_BLOCK_SIZE),
    );
    if (ready !== undefined && distance * TEMPLATE_BLOCK_SIZE <= ready + CHUNK * TEMPLATE_BLOCK_SIZE) {
      issues.push(['.showroom.catalogue.position', 'must lie beyond the startup ring, so it cannot delay the start']);
    }
  }
  const placement = slotPlacement(registry, layout);
  if (placement) {
    issues.push(
      ...placementLootIssues({ registry, context: layout.lootContext }, placement.template, [], '.showroom.slots'),
    );
  }
  slotProps(registry, showroom).forEach(({ pos, size }, i) => {
    const cells = [...cellsOf(size)].map(([dx, dy, dz]): Vec3 => [pos[0] + dx, pos[1] + dy, pos[2] + dz]);
    const blocked = cells.some((cell) => solidAt(...cell));
    const unsupported = cells.some(([x, y, z]) => y === pos[1] && !solidAt(x, y - 1, z));
    if (blocked || unsupported) {
      issues.push([`.showroom.slots[${i}]`, 'must stand clear on a solid deck']);
    }
  });
  return issues;
};

/**
 * Whether a building's id names exactly one template or assembly, and its style one the source can take. Composed-site
 * asks name their building the same way, so both report through this.
 */
export const buildingIdentityIssues = (
  registry: Registry,
  { template: id, style }: Pick<SiteLayoutDef['buildings'][number], 'template' | 'style'>,
  path: string,
): [string, string][] => {
  if (registry.templates.has(id) && registry.mapAssemblies.has(id)) {
    return [[`${path}.template`, `ambiguous template and assembly "${id}"`]];
  }
  const source = buildingSource(registry, { template: id });
  if (!source) {
    return [[`${path}.template`, `no template or assembly "${id}"`]];
  }
  if (style === undefined) {
    return [];
  }
  if (source.kind === 'template') {
    return [[`${path}.style`, `style "${style}" needs an assembly, not template "${id}"`]];
  }
  return registry.mapStyles.has(style) ? [] : [[`${path}.style`, `no style "${style}"`]];
};

/** A building names one template or assembly; an assembly owns its floors and resolves its furniture per seed. */
const buildingSourceIssues = (
  registry: Registry,
  building: SiteLayoutDef['buildings'][number],
  path: string,
): [string, string][] => {
  const { template: id, storeys } = building;
  const issues = buildingIdentityIssues(registry, building, path);
  const source = buildingSource(registry, building);
  if (!source) {
    return issues;
  }
  if (source.kind === 'template') {
    if (source.definition.access && (storeys ?? 1) !== 1) {
      issues.push([`${path}.storeys`, 'explicit storeys cannot be stress-test stacked']);
    }
    return issues;
  }
  if (storeys !== undefined) {
    issues.push([`${path}.storeys`, `assembly "${id}" owns its floors; storeys cannot stack it`]);
  }
  if (building.fixedLoot !== undefined) {
    issues.push([`${path}.fixedLoot`, `assembly "${id}" resolves its furniture per seed; fixed loot needs a template`]);
  }
  return issues;
};

/**
 * A building's placement without a world seed, or why it cannot compile. The map kit check reports an assembly's own
 * fault; this records that the building cannot stand.
 */
const validationPlacement = (registry: Registry, layout: SiteLayoutDef, index: number): Placement | string => {
  try {
    return placementOf(registry, layout.buildings[index]!, layout.lootContext, layoutBuildingSite(0, layout.id, index));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
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
  const checkLocks = (template: CompiledTemplate, i: number) => {
    for (const id of compiledLockIds(registry, template)) {
      if (locks.has(id)) {
        issues.push([`.buildings[${i}]`, `lock "${id}" is used more than once in this site`]);
      }
      locks.add(id);
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
    const sourceIssues = buildingSourceIssues(registry, building, `.buildings[${i}]`);
    const source = buildingSource(registry, building);
    if (!source || sourceIssues.length > 0) {
      issues.push(...sourceIssues);
      return;
    }
    const rect = buildingFootprint(registry, building);
    checkFootprint(rect, i);
    if (
      insideLayout(layout.bounds, [rect.x0, rect.z0]) &&
      insideLayout(layout.bounds, [rect.x1, rect.z1]) &&
      !foundationFits(layout, building, rect)
    ) {
      issues.push([`.buildings[${i}].position`, `foundation cut or fill exceeds ${FOUNDATION_TOLERANCE} m`]);
    }
    if (source.kind === 'template' && !templateResolves(registry, source.definition)) {
      return; // checkTemplates reports the palette; the placement can't compile without it.
    }
    const placement = validationPlacement(registry, layout, i);
    if (typeof placement === 'string') {
      issues.push([`.buildings[${i}].template`, placement]);
      return;
    }
    checkLocks(placement.template, i);
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
  if (layout.showroom) {
    issues.push(...showroomIssues(layout, registry, solidAt));
  }
  supported(layout.player.position, '.player.position');
  checkSpawn([layout.player.position[0], layout.player.position[2]], '.player.position');
  const authoredHordes = layout.hordes ?? [];
  const hordeType = claimed(registry.actors, 'settlementHorde');
  if (authoredHordes.length > 0 && !hordeType) {
    issues.push(['.hordes', 'missing required capability "settlementHorde"']);
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
        actorBodyDimensions(hordeType, TEMPLATE_BLOCK_SIZE),
        solidAt,
      );
      if (blocked) {
        issues.push([path, `spawn body overlaps solid cell [${blocked.join(',')}]`]);
      }
    }
  });
  layout.actors.forEach((spawn, i) => {
    const type = registry.actors.get(spawn.type);
    if (!type) {
      issues.push([`.actors[${i}].type`, `no actor type "${spawn.type}"`]);
    }
    checkSpawn([spawn.position[0], spawn.position[2]], `.actors[${i}].position`);
    supported(spawn.position, `.actors[${i}].position`);
    if (type) {
      const blocked = spawnOverlappingSolidBlock(
        blocks(spawn.position),
        actorBodyDimensions(type, TEMPLATE_BLOCK_SIZE),
        solidAt,
      );
      if (blocked) {
        issues.push([`.actors[${i}].position`, `spawn body overlaps solid cell [${blocked.join(',')}]`]);
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
  issues.push(...waterIssues(layout, footprints, check));
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
  if (layout.practice && !beatIds.has(layout.practice.exitMark)) {
    issues.push(['.practice.exitMark', `no stage mark "${layout.practice.exitMark}"`]);
  }
  return issues;
};

/** Half-metre cell centres of a rectangle in metres. */
function* cellCentres(rect: Rect): Generator<LayoutPoint> {
  for (let z = Math.floor(rect.z0 * 2) / 2 + 0.25; z < rect.z1; z += 0.5) {
    for (let x = Math.floor(rect.x0 * 2) / 2 + 0.25; x < rect.x1; x += 0.5) {
      yield [x, z];
    }
  }
}

/**
 * Every half-metre cell centre of a rectangle, each once, on halving strides: the first pass
 * spans the rectangle and each later one fills between the last. A search for one cell with a
 * property that covers a wide area, like water in a basin, ends in the first few passes instead
 * of costing the rectangle's whole area, so a lake of any size validates in bounded time.
 */
function* coarseToFineCentres(rect: Rect): Generator<LayoutPoint> {
  const x0 = Math.floor(rect.x0 * 2) / 2;
  const z0 = Math.floor(rect.z0 * 2) / 2;
  const columns = Math.ceil((rect.x1 - x0) * 2 - 0.5);
  const rows = Math.ceil((rect.z1 - z0) * 2 - 0.5);
  let stride = 1;
  while (stride < Math.max(columns, rows)) {
    stride *= 2;
  }
  for (let first = true; stride >= 1; stride /= 2, first = false) {
    for (let j = 0; j < rows; j += stride) {
      for (let i = 0; i < columns; i += stride) {
        if (first || i % (2 * stride) !== 0 || j % (2 * stride) !== 0) {
          yield [x0 + i / 2 + 0.25, z0 + j / 2 + 0.25];
        }
      }
    }
  }
}

/**
 * No unintended inundation. Reads the noise-free surface: the authored shape is what the author meant,
 * and near lots, where flooding matters, the topography noise is too weak to move a block.
 */
const waterIssues = (
  layout: SiteLayoutDef,
  footprints: readonly { rect: Rect; index: number }[],
  check: (p: LayoutPoint, path: string) => void,
): [string, string][] => {
  const rows = layout.water ?? [];
  if (rows.length === 0) {
    return [];
  }
  const lots = footprints.map(({ rect, index }) => lotOf(layout.buildings[index]!, rect));
  const issues: [string, string][] = [];
  rows.forEach((row, i) => {
    row.polygon.forEach((p, j) => {
      check(p, `.water[${i}].polygon[${j}]`);
    });
    if (row.level > WORLD_TOP_M) {
      issues.push([`.water[${i}].level`, 'above the world top']);
    }
    const xs = row.polygon.map(([x]) => x);
    const zs = row.polygon.map(([, z]) => z);
    const extent = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    let holdsWater = false;
    for (const p of coarseToFineCentres(extent)) {
      if (inPolygon(p, row.polygon) && standingHeight(layout, lots, p[0], p[1]) < row.level) {
        holdsWater = true;
        break;
      }
    }
    if (!holdsWater) {
      issues.push([`.water[${i}]`, 'holds no water: every bed inside the polygon reaches the level']);
    }
  });
  for (const { rect, index } of footprints) {
    if (layout.buildings[index]!.overWater) {
      continue;
    }
    for (const p of cellCentres(grow(rect, LOT_APRON_M))) {
      const standing = standingHeight(layout, lots, p[0], p[1]);
      const flooding = rows.findIndex((row) => inPolygon(p, row.polygon) && standing < row.level);
      if (flooding >= 0) {
        issues.push([`.buildings[${index}]`, `lot is flooded by water[${flooding}]; raise it or set overWater`]);
        break;
      }
    }
  }
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
