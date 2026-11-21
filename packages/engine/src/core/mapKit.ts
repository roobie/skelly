import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { templateStockIssues } from './placementLoot.ts';
import { STRUCTURAL_MATERIAL_ROLES } from './schema/templates.ts';
import type { KitAnchor, KitPort, MapAssemblyDef, MapSiteDef } from './schema.ts';
import { TEMPLATE_BLOCK_SIZE } from './settlementSpawns.ts';
import { STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from './stairFlight.ts';
import { ownershipCell } from './templateOwnership.ts';
import {
  templateBodySpace,
  templateClimbCertificate,
  templateDoorIssues,
  templateGroundLootIssues,
  templateRoutePassable,
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
  section: 'mapStyles' | 'roadProfiles' | 'mapPieces' | 'mapAssemblies' | 'mapSites';
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

/** The authored claims one port makes about the piece around it: clearance inside the piece, an aperture that
 * admits the body, and a reserved mouth with a supported landing. */
const portClaimIssues = (registry: Registry, port: KitPort, template: CompiledTemplate): [string, string][] => {
  const path = `.ports.${port.id}`;
  const { min, size } = port.clearance;
  if (!inside(template.size, min) || min.some((value, axis) => value + size[axis]! > template.size[axis]!)) {
    return [[path, 'port clearance lies outside the piece']];
  }
  if (port.traversal === 'sealed') {
    return [];
  }
  if (!apertureFitsBody(port)) {
    return [[path, 'traversable aperture must admit the collision body']];
  }
  return validMouth(registry, template, port)
    ? []
    : [[path, 'port needs reserved mouth/body space and a supported landing']];
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
    const profile = registry.roadProfiles.get(port.type);
    if (profile && port.aperture[0] * TEMPLATE_BLOCK_SIZE !== profile.widthMetres) {
      issues.push([
        path,
        `road port must span the ${profile.widthMetres} m width of road profile "${profile.id}", not ${port.aperture[0] * TEMPLATE_BLOCK_SIZE} m`,
      ]);
    }
    issues.push(...portClaimIssues(registry, port, template));
  }
  return issues;
};

/** A compiled route's mouths must be two distinct walk ports, and every authored segment must carry a standing
 * body at clearance with support, so the route itself is the passage, not a promise that one exists nearby. */
const pieceRouteIssues = (registry: Registry, template: CompiledTemplate): [string, string][] => {
  const { route } = template;
  if (!route) {
    return [];
  }
  const mouthPort = (end: Vec3) =>
    (template.ports ?? []).find(
      (port) => port.traversal === 'walk' && port.at.every((value, axis) => value === end[axis]),
    );
  const mouths = [mouthPort(route[0]!), mouthPort(route.at(-1)!)];
  if (!(mouths[0] && mouths[1] && mouths[0] !== mouths[1])) {
    return [['.route', 'route endpoints must sit on two distinct walk ports']];
  }
  return templateRoutePassable(registry, template, route)
    ? []
    : [['.route', 'every route segment must carry a standing body at clearance with support']];
};

/** Whether a compiled kit's declared access, anchors, ports, doors, ground loot and spawns fit its geometry. */
const kitFitIssues = (registry: Registry, template: CompiledTemplate): [string, string][] => [
  ...templateStoreyIssues(template),
  ...(template.access && !reservedStanding(registry, template, template.access.entrance)
    ? [['.access.entrance', 'entrance needs reserved body clearance and known support'] as [string, string]]
    : []),
  ...anchorIssues(registry, template),
  ...portIssues(registry, template),
  ...pieceRouteIssues(registry, template),
  ...templateDoorIssues(registry, template),
  ...templateGroundLootIssues(registry, template),
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
  const issues = [
    ...templateStockIssues(registry, template),
    ...kitFitIssues(registry, template),
    ...routeIssues(registry, template, site),
  ];
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

const roadProfileIssues = (registry: Registry): MapKitIssue[] =>
  [...registry.roadProfiles.values()]
    .filter((profile) => !registry.blockIds.has(profile.surface))
    .map((profile) => ({
      section: 'roadProfiles',
      id: profile.id,
      path: '.surface',
      message: `no block "${profile.surface}"`,
    }));

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

type CompiledKit =
  | { section: 'mapPieces' | 'mapAssemblies'; id: string; template: CompiledTemplate }
  | { failures: MapKitIssue[] };

/** Every piece and assembly compiled at seed 0, or why it does not compile. */
function* compiledKits(registry: Registry): Generator<CompiledKit> {
  const pieceCache = new Map<string, CompiledTemplate>();
  const compile = (section: 'mapPieces' | 'mapAssemblies', id: string, run: () => CompiledTemplate): CompiledKit => {
    try {
      return { section, id, template: run() };
    } catch (error) {
      return { failures: [{ section, id, path: '', message: errorMessage(error) }] };
    }
  };
  for (const piece of registry.mapPieces.values()) {
    yield compile('mapPieces', piece.id, () =>
      compileMapPiece(registry, piece, { seed: 0, siteId: `validation:${piece.id}`, pieceCache }),
    );
  }
  for (const assembly of registry.mapAssemblies.values()) {
    const failures = slotSourceIssues(registry, assembly);
    yield failures.length > 0
      ? { failures }
      : compile('mapAssemblies', assembly.id, () =>
          compileAssembly(registry, assembly, { seed: 0, siteId: `validation:${assembly.id}`, pieceCache }),
        );
  }
}

/** What world generation needs of the kits: style blocks resolve, and pieces and assemblies compile and stock. */
export const mapKitIssues = (registry: Registry): MapKitIssue[] => {
  const issues: MapKitIssue[] = [];
  for (const style of registry.mapStyles.values()) {
    for (const [material, binding] of Object.entries(style.bindings)) {
      if (!registry.blockIds.has(binding.block)) {
        const path = `.bindings.${material}`;
        issues.push({ section: 'mapStyles', id: style.id, path, message: `no block "${binding.block}"` });
      }
    }
  }
  issues.push(...roadProfileIssues(registry));
  for (const kit of compiledKits(registry)) {
    if ('failures' in kit) {
      issues.push(...kit.failures);
      continue;
    }
    for (const [path, message] of templateStockIssues(registry, kit.template)) {
      issues.push({ section: kit.section, id: kit.id, path, message });
    }
  }
  return issues;
};

/**
 * Whether the kits fit what they declare, which nothing the game reads depends on: structural style blocks support a
 * body, each compiled kit fits its declarations, and each map site, a validation fixture, compiles and certifies its
 * routes. A kit that does not compile is left to `mapKitIssues`.
 */
export const mapKitFitIssues = (registry: Registry): MapKitIssue[] => {
  const issues = structuralStyleIssues(registry);
  for (const kit of compiledKits(registry)) {
    if ('failures' in kit) {
      continue;
    }
    for (const [path, message] of kitFitIssues(registry, kit.template)) {
      issues.push({ section: kit.section, id: kit.id, path, message });
    }
  }
  return [...issues, ...mapSiteIssues(registry)];
};

const structuralStyleIssues = (registry: Registry): MapKitIssue[] =>
  [...registry.mapStyles.values()].flatMap((style) =>
    Object.entries(style.bindings).flatMap(([material, binding]): MapKitIssue[] => {
      const block = registry.blocks[registry.blockIds.get(binding.block) ?? -1];
      const structural = (STRUCTURAL_MATERIAL_ROLES as readonly string[]).includes(binding.role);
      return block && !block.solid && structural
        ? [
            {
              section: 'mapStyles',
              id: style.id,
              path: `.bindings.${material}`,
              message: 'structural roles need a solid block',
            },
          ]
        : [];
    }),
  );

const mapSiteIssues = (registry: Registry): MapKitIssue[] =>
  [...registry.mapSites.values()].flatMap((site): MapKitIssue[] => {
    try {
      compileMapSite(registry, site, { seed: 0, siteId: site.id });
      return [];
    } catch (error) {
      return [{ section: 'mapSites', id: site.id, path: '', message: errorMessage(error) }];
    }
  });
