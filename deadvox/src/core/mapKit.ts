import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { pieceItemIssues } from './placementLoot.ts';
import type { KitAnchor, KitPort, MapAssemblyDef, MapSiteDef } from './schema.ts';
import { STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from './stairFlight.ts';
import { ownershipCell } from './templateOwnership.ts';
import {
  templateBodySpace,
  templateClimbCertificate,
  templateDoorIssues,
  templateGroundLootIssues,
  templateSpawnClearanceIssues,
  templateStandingRoute,
  templateStoreyIssues,
} from './templateSpatial.ts';
import {
  type AssemblyContext,
  type CompiledTemplate,
  cellsOf,
  compileAssembly,
  compileMapPiece,
  contentPointer,
  kitSlotChoices,
  type Placement,
  placedPoint,
} from './templates.ts';

export interface MapKitIssue {
  section: 'mapStyles' | 'mapPieces' | 'mapAssemblies' | 'mapSites';
  id: string;
  path: string;
  message: string;
}

const inside = (size: Vec3, point: Vec3): boolean => point.every((value, axis) => value >= 0 && value <= size[axis]!);

const reservedCell = (template: CompiledTemplate, cell: Vec3): boolean =>
  cell.every((value, axis) => value >= 0 && value < template.size[axis]!) &&
  template.reserved?.[ownershipCell(template.size, cell)] === 1;

const reservedStanding = (registry: Registry, template: CompiledTemplate, point: Vec3): boolean => {
  const [x, feet, z] = point;
  let supported = false;
  for (let bz = Math.floor(z - STAIR_BODY_HALF_WIDTH); bz < Math.ceil(z + STAIR_BODY_HALF_WIDTH); bz++) {
    for (let bx = Math.floor(x - STAIR_BODY_HALF_WIDTH); bx < Math.ceil(x + STAIR_BODY_HALF_WIDTH); bx++) {
      for (let y = Math.floor(feet); y < Math.ceil(feet + STAIR_BODY_HEIGHT); y++) {
        const cell: Vec3 = [bx, y, bz];
        if (!reservedCell(template, cell)) {
          return false;
        }
      }
      const floor: Vec3 = [bx, feet - 1, bz];
      if (inside(template.size, floor)) {
        supported ||= registry.blocks[template.blocks[ownershipCell(template.size, floor)] ?? 0]?.solid === true;
      }
    }
  }
  return supported && templateBodySpace(registry, template).standing(point);
};

const anchorIssues = (registry: Registry, template: CompiledTemplate): [string, string][] =>
  Object.entries(template.anchors ?? {}).flatMap(([id, anchor]: [string, KitAnchor]) => {
    if (!inside(template.size, anchor.at)) {
      return [[`.anchors.${id}`, 'anchor lies outside the piece']];
    }
    return anchor.kind === 'standing' && !reservedStanding(registry, template, anchor.at)
      ? [[`.anchors.${id}`, 'standing anchor needs reserved body clearance and solid block support']]
      : [];
  });

const portFace = (port: KitPort, size: Vec3): boolean => {
  const axis = { n: 2, e: 0, s: 2, w: 0, up: 1, down: 1 }[port.facing];
  const positive = ['e', 's', 'up'].includes(port.facing);
  return port.at[axis] === (positive ? size[axis] : 0);
};

const mouthEnvelope = (port: KitPort, size: Vec3): boolean => {
  const { min, size: extent } = port.clearance;
  const max = min.map((value, index) => value + extent[index]!);
  const axis = { n: 2, e: 0, s: 2, w: 0, up: 1, down: 1 }[port.facing];
  const positive = ['e', 's', 'up'].includes(port.facing);
  if ((positive ? max[axis] : min[axis]) !== (positive ? size[axis] : 0)) {
    return false;
  }
  const across = axis === 0 ? 2 : 0;
  const vertical = axis === 1 ? 2 : 1;
  const bottom = axis === 1 ? port.at[vertical]! - port.aperture[1] / 2 : port.at[vertical]!;
  if (
    min[across]! > port.at[across]! - port.aperture[0] / 2 ||
    max[across]! < port.at[across]! + port.aperture[0] / 2 ||
    min[vertical]! > bottom ||
    max[vertical]! < bottom + port.aperture[1]
  ) {
    return false;
  }
  const [x, feet, z] = port.standing;
  return (
    min[0] <= x - STAIR_BODY_HALF_WIDTH &&
    max[0]! >= x + STAIR_BODY_HALF_WIDTH &&
    min[1] <= feet &&
    max[1]! >= feet + STAIR_BODY_HEIGHT &&
    min[2] <= z - STAIR_BODY_HALF_WIDTH &&
    max[2]! >= z + STAIR_BODY_HALF_WIDTH
  );
};

const validPortAnchor = (template: CompiledTemplate, port: KitPort): boolean =>
  inside(template.size, port.at) && portFace(port, template.size);

const validMouth = (registry: Registry, template: CompiledTemplate, port: KitPort): boolean => {
  const { min, size } = port.clearance;
  const reserved = [...cellsOf(size)].every((cell) =>
    reservedCell(template, cell.map((value, axis) => value + min[axis]!) as Vec3),
  );
  return reserved && mouthEnvelope(port, template.size) && reservedStanding(registry, template, port.standing);
};

const apertureFitsBody = (port: KitPort): boolean => {
  const height = port.facing === 'up' || port.facing === 'down' ? 2 * STAIR_BODY_HALF_WIDTH : STAIR_BODY_HEIGHT;
  return port.aperture[0] >= Math.ceil(2 * STAIR_BODY_HALF_WIDTH) && port.aperture[1] >= Math.ceil(height);
};

const portIssues = (registry: Registry, template: CompiledTemplate): [string, string][] => {
  const issues: [string, string][] = [];
  const ids = new Set<string>();
  for (const port of template.ports ?? []) {
    const path = `.ports.${port.id}`;
    if (ids.has(port.id) || !validPortAnchor(template, port)) {
      issues.push([path, 'ports need unique ids and an anchor on their declared face']);
    }
    ids.add(port.id);
    const { min, size } = port.clearance;
    if (!inside(template.size, min) || min.some((value, axis) => value + size[axis]! > template.size[axis]!)) {
      issues.push([path, 'port clearance lies outside the piece']);
      continue;
    }
    if (port.traversal === 'sealed') {
      continue;
    }
    if (!apertureFitsBody(port)) {
      issues.push([path, 'traversable aperture must admit the collision body']);
    }
    if (!validMouth(registry, template, port)) {
      issues.push([path, 'port needs reserved mouth/body space and a supported landing']);
    }
  }
  return issues;
};

const compiledKitIssues = (registry: Registry, template: CompiledTemplate): [string, string][] => [
  ...templateStoreyIssues(template),
  ...(template.access && !reservedStanding(registry, template, template.access.entrance)
    ? [['.access.entrance', 'entrance needs reserved body clearance and known support'] as [string, string]]
    : []),
  ...anchorIssues(registry, template),
  ...portIssues(registry, template),
  ...templateDoorIssues(registry, template),
  ...templateGroundLootIssues(registry, template),
  ...pieceItemIssues(registry, template),
  ...templateSpawnClearanceIssues(registry, template),
];

const climbIssues = (
  registry: Registry,
  placement: Placement,
  [from, to]: readonly [Vec3, Vec3],
  path: string,
): [string, string][] => {
  const a = placedPoint(placement, from);
  const b = placedPoint(placement, to);
  const issue = templateClimbCertificate(
    registry,
    placement,
    a[1] > b[1] ? { upper: a, lower: b } : { upper: b, lower: a },
  );
  return issue ? [[path, issue]] : [];
};

const routeIssues = (registry: Registry, template: CompiledTemplate, site: MapSiteDef): [string, string][] => {
  const issues: [string, string][] = [];
  for (const [index, route] of site.routes.entries()) {
    const from = template.anchors?.[route.from];
    const to = template.anchors?.[route.to];
    const path = `.routes[${index}]`;
    if (from?.kind !== 'standing' || to?.kind !== 'standing') {
      issues.push([path, 'route endpoints must name standing anchors']);
      continue;
    }
    if (
      route.traversal === 'walk' &&
      (!templateStandingRoute(registry, template, from.at, to.at) ||
        (route.return && !templateStandingRoute(registry, template, to.at, from.at)))
    ) {
      issues.push([path, 'intended walking route and its declared return must have supported body paths']);
    }
    if (route.traversal === 'climb') {
      issues.push(...climbIssues(registry, { template, origin: site.origin, turn: site.turn }, [from.at, to.at], path));
    }
  }
  return issues;
};

export const compileMapSite = (registry: Registry, site: MapSiteDef, context: AssemblyContext): Placement => {
  const assembly = registry.mapAssemblies.get(site.assembly);
  const source = contentPointer(registry, 'mapSites', site.id);
  if (!assembly) {
    throw new Error(`seed=${context.seed} source=${source}: missing assembly ${site.assembly}`);
  }
  const template = compileAssembly(registry, assembly, context);
  const issues = [...compiledKitIssues(registry, template), ...routeIssues(registry, template, site)];
  if (issues.length > 0) {
    throw new Error(
      `seed=${context.seed} site=${context.siteId} slot=${context.slotPath ?? assembly.id} variant=${template.id} turn=${site.turn} source=${source}: ${issues.map(([path, message]) => `${path}: ${message}`).join('; ')}`,
    );
  }
  return { template, origin: [...site.origin], turn: site.turn };
};

const slotSourceIssues = (registry: Registry, assembly: MapAssemblyDef): MapKitIssue[] =>
  assembly.slots.flatMap((slot, index) => {
    try {
      kitSlotChoices(registry, slot);
      return [];
    } catch (error) {
      return [
        {
          section: 'mapAssemblies' as const,
          id: assembly.id,
          path: `.slots[${index}]`,
          message: error instanceof Error ? error.message : String(error),
        },
      ];
    }
  });

export const mapKitIssues = (registry: Registry): MapKitIssue[] => {
  const issues: MapKitIssue[] = [];
  for (const style of registry.mapStyles.values()) {
    for (const [material, binding] of Object.entries(style.bindings)) {
      const block = registry.blocks[registry.blockIds.get(binding.block) ?? -1];
      if (!block || (['shell', 'interior_floor', 'support'].includes(binding.role) && !block.solid)) {
        issues.push({
          section: 'mapStyles',
          id: style.id,
          path: `.bindings.${material}`,
          message: 'material needs a resolving block and structural roles need solid support',
        });
      }
    }
  }
  const check = (
    section: 'mapPieces' | 'mapAssemblies' | 'mapSites',
    id: string,
    compile: () => CompiledTemplate,
  ): void => {
    try {
      const template = compile();
      for (const [path, message] of compiledKitIssues(registry, template)) {
        issues.push({ section, id, path, message });
      }
    } catch (error) {
      issues.push({ section, id, path: '', message: error instanceof Error ? error.message : String(error) });
    }
  };
  const pieceCache = new Map<string, CompiledTemplate>();
  for (const piece of registry.mapPieces.values()) {
    check('mapPieces', piece.id, () =>
      compileMapPiece(registry, piece, { seed: 0, siteId: `validation:${piece.id}`, pieceCache }),
    );
  }
  for (const assembly of registry.mapAssemblies.values()) {
    const slotIssues = slotSourceIssues(registry, assembly);
    issues.push(...slotIssues);
    if (slotIssues.length > 0) {
      continue;
    }
    check('mapAssemblies', assembly.id, () =>
      compileAssembly(registry, assembly, { seed: 0, siteId: `validation:${assembly.id}`, pieceCache }),
    );
  }
  for (const site of registry.mapSites.values()) {
    check('mapSites', site.id, () => compileMapSite(registry, site, { seed: 0, siteId: site.id }).template);
  }
  return issues;
};
