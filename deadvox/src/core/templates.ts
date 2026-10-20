// Building templates (`DESIGN.md`, "Generating the world in layers"): ASCII layers
// with a palette. A template is compiled once against the registry: every cell gets a
// block id, and furniture marks become pieces anchored at their lowest corner. A
// placement puts it in the world at an origin, turned by quarter turns, and stamps
// whatever part of it falls inside a chunk, so buildings that span chunks come out
// the same whichever chunk generates first.

import type { Chunk } from './chunk.ts';
import type { SpawnTimeWindowField } from './clock.ts';
import type { Registry, TemplateDef } from './content.ts';
import { CHUNK, type Vec3 } from './coords.ts';
import type { LootContext } from './loot.ts';
import { pickWeighted, Rng } from './random.ts';
import type {
  DecalDef,
  DoorLockDef,
  GroundLootSupply,
  KitAnchor,
  KitPort,
  KitRef,
  MapAssemblyDef,
  MapPieceDef,
  TemplateAccess,
} from './schema.ts';
import { constructFlight } from './stairFlight.ts';
import { compileOwnership, ownershipCell } from './templateOwnership.ts';

/** Horizontal front facings follow WORLD_NORTH in coords.ts. */
export type Facing = 'n' | 'e' | 's' | 'w';
/** Quarter turns clockwise seen from above: a turn takes north to east. */
export type Turn = 0 | 1 | 2 | 3;

const FACINGS: readonly Facing[] = ['n', 'e', 's', 'w'];

export const turnFacing = (facing: Facing, turn: Turn): Facing => FACINGS[(FACINGS.indexOf(facing) + turn) % 4]!;

/** A piece's cells as [x, y, z], seen from the template: east- and west-facing pieces lie along z. */
export const pieceSize = (size: readonly [number, number, number], facing: Facing): Vec3 =>
  facing === 'e' || facing === 'w' ? [size[2], size[1], size[0]] : [size[0], size[1], size[2]];

/** Every [x, y, z] in a box, in (y, z, x) order: lowest layer first, then rows, then cells. */
export function* cellsOf([sx, sy, sz]: readonly [number, number, number]): Generator<Vec3> {
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        yield [x, y, z];
      }
    }
  }
}

type TemplateCells = Pick<TemplateDef, 'size' | 'layers'>;

/** The character at a template cell, or undefined outside the layers. */
const charAt = (template: TemplateCells, x: number, y: number, z: number): string | undefined => {
  const row = template.layers[y]?.[z] ?? '';
  return row.length === template.size[0] ? row[x] : [...row][x];
};

function* markedCells(template: TemplateCells, char: string): Generator<Vec3> {
  const [sx, sy, sz] = template.size;
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      const text = template.layers[y]?.[z] ?? '';
      const row = text.length === sx ? text : [...text];
      for (let x = row.indexOf(char); x >= 0 && x < sx; x = row.indexOf(char, x + 1)) {
        yield [x, y, z];
      }
    }
  }
}

/**
 * Splits the cells marked with a character into whole pieces of a size. Pieces are
 * found from their lowest corner: the first unclaimed marked cell in (y, z, x) order.
 * Returns the anchors, or why the marks don't split into whole pieces.
 */
export const findPieces = (
  template: TemplateCells,
  char: string,
  piece: Vec3,
): { anchors: Vec3[]; problem?: undefined } | { anchors?: undefined; problem: string } => {
  const claimed = new Set<string>();
  /** Claims the piece anchored at a cell; false if any of its cells isn't marked or is taken. */
  const claim = (x: number, y: number, z: number): boolean => {
    for (const [dx, dy, dz] of cellsOf(piece)) {
      const key = `${x + dx},${y + dy},${z + dz}`;
      if (charAt(template, x + dx, y + dy, z + dz) !== char || claimed.has(key)) {
        return false;
      }
      claimed.add(key);
    }
    return true;
  };
  const anchors: Vec3[] = [];
  for (const [x, y, z] of markedCells(template, char)) {
    if (claimed.has(`${x},${y},${z}`)) {
      continue;
    }
    if (!claim(x, y, z)) {
      return { problem: `the piece at [${x}, ${y}, ${z}] needs ${piece.join(' × ')} cells marked "${char}"` };
    }
    anchors.push([x, y, z]);
  }
  return { anchors };
};

/** Actual door-lock occurrences, not unused palette declarations; shared by content and site checks. */
export const templateLockIds = (registry: Registry, template: TemplateDef | MapPieceDef): string[] =>
  Object.entries(template.palette).flatMap(([char, entry]) => {
    if (typeof entry === 'string' || !('lock' in entry) || !entry.lock || !entry.furniture) {
      return [];
    }
    const furniture = registry.furniture.get(entry.furniture);
    if (!furniture?.door) {
      return [];
    }
    const { id } = entry.lock;
    return (findPieces(template, char, pieceSize(furniture.size, entry.facing ?? 'n')).anchors ?? []).map(() => id);
  });

/** A piece of furniture in a template, in template coordinates. */
interface Piece {
  lootUsage?: LootContext['usage'];
  lock?: DoorLockDef;
  fixed?: true;
  furniture: string;
  /** The palette's loot table. */
  loot?: string | undefined;
  facing: Facing;
  pos: Vec3;
  size: Vec3;
}

export interface GroundLootMarker {
  readonly pos: Vec3;
  readonly supply: GroundLootSupply;
  readonly lootUsage?: LootContext['usage'];
}

export interface SpawnMarker extends SpawnTimeWindowField {
  zombie: string;
  chance: number;
  pos: Vec3;
}

export interface VoxelProvenance {
  readonly owner: string;
  readonly source: string;
  readonly variant: string;
  readonly slotPath: string;
  readonly turn: Turn;
}

export interface CompiledTemplate {
  readonly lootContext: LootContext;
  readonly id: string;
  readonly size: Vec3;
  /** A block id per cell, x + sx * (z + sz * y). Furniture and spawn cells are air. */
  readonly blocks: Uint16Array;
  /** One where the cell is "the ground here": nothing is stamped and the site's surface shows. */
  readonly ground?: Uint8Array;
  /** Zero is unclaimed, one owns occupancy, two owns air. */
  readonly ownership?: Uint8Array;
  readonly reserved?: Uint8Array;
  readonly provenance?: readonly (VoxelProvenance | undefined)[];
  readonly anchors?: Readonly<Record<string, KitAnchor>>;
  readonly ports?: readonly KitPort[];
  readonly pieces: readonly Piece[];
  readonly spawns: readonly SpawnMarker[];
  readonly groundLoot?: readonly GroundLootMarker[];
  readonly decals?: readonly DecalDef[];
  readonly access?: TemplateAccess;
  /** The support layer of the declared ground floor, relative to the lowest template layer. */
  readonly groundLayer?: number;
}

/** Whether every block and furniture id in a template's palette exists; `compileTemplate` needs that. */
export const templateResolves = (registry: Registry, template: TemplateDef): boolean =>
  Object.values(template.palette).every((entry) =>
    typeof entry === 'string'
      ? registry.blockIds.has(entry)
      : (entry.furniture === undefined || registry.furniture.has(entry.furniture)) &&
        (entry.loot === undefined || registry.loot.has(entry.loot)) &&
        (entry.spawn === undefined || registry.zombies.has(entry.spawn)),
  );

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: palette compilation resolves furniture and spawn encodings in one authored scan.
const compileMarkers = (registry: Registry, template: TemplateDef) => {
  const pieces: Piece[] = [];
  const spawns: SpawnMarker[] = [];
  const groundLoot: GroundLootMarker[] = [];
  for (const [char, entry] of Object.entries(template.palette)) {
    if (typeof entry === 'string') {
      continue;
    }
    if (entry.groundLoot !== undefined) {
      for (const pos of markedCells(template, char)) {
        groundLoot.push({
          pos,
          supply: entry.groundLoot,
          ...(entry.lootUsage === undefined ? {} : { lootUsage: entry.lootUsage }),
        });
      }
      continue;
    }
    if (entry.spawn !== undefined) {
      for (const pos of cellsOf(template.size)) {
        if (charAt(template, ...pos) === char) {
          spawns.push({
            zombie: entry.spawn,
            chance: entry.chance ?? 1,
            pos,
            ...(entry.window ? { window: entry.window } : {}),
          });
        }
      }
      continue;
    }
    if (entry.furniture === undefined) {
      continue;
    }
    const def = registry.furniture.get(entry.furniture)!;
    const facing = entry.facing ?? 'n';
    const size = pieceSize(def.size, facing);
    for (const pos of findPieces(template, char, size).anchors ?? []) {
      pieces.push({
        furniture: def.id,
        loot: entry.loot,
        ...(entry.lootUsage === undefined ? {} : { lootUsage: entry.lootUsage }),
        facing,
        pos,
        size,
        ...(entry.lock ? { lock: entry.lock } : {}),
        ...(entry.fixed ? { fixed: true as const } : {}),
      });
    }
  }
  return { pieces, spawns, groundLoot };
};

const checkDecalDoors = (registry: Registry, template: TemplateDef, pieces: readonly Piece[]): void => {
  for (const decal of template.decals ?? []) {
    if (!decal.door) {
      continue;
    }
    const piece = pieces.find((candidate) => candidate.pos.every((v, axis) => v === decal.door![axis]));
    const door = piece && registry.furniture.get(piece.furniture)?.door;
    if (!door || door.hatch) {
      throw new Error(`${template.id}: decal attachment needs an upright door anchor`);
    }
  }
};

export const templateEnvelope = (
  definition: TemplateDef | MapAssemblyDef,
): Pick<CompiledTemplate, 'size' | 'groundLayer'> => {
  const ground = definition.access?.storeys.find((storey) => storey.id === definition.access?.ground);
  return {
    size: [...definition.size],
    ...(definition.access ? { groundLayer: (ground?.floor ?? 1) - 1 } : {}),
  };
};

/** Resolves a template's palette against the registry. The validator has already checked it. */
export const compileTemplate = (
  registry: Registry,
  template: TemplateDef,
  source = contentPointer(registry, 'templates', template.id),
): CompiledTemplate => {
  const [sx, sy, sz] = template.size;
  const blocks = new Uint16Array(sx * sy * sz);
  const { pieces, spawns, groundLoot } = compileMarkers(registry, template);
  checkDecalDoors(registry, template, pieces);
  const ground = new Uint8Array(blocks.length);
  for (const [x, y, z] of cellsOf(template.size)) {
    const entry = template.palette[charAt(template, x, y, z) ?? ''];
    const index = x + sx * (z + sz * y);
    blocks[index] = typeof entry === 'string' ? registry.blockIds.get(entry)! : 0;
    ground[index] = Number(typeof entry === 'object' && entry.ground === true);
  }
  if (template.ownership && (template.access?.stairs.length ?? 0) > 0) {
    throw new Error(`${template.id}: owned pieces must author stair geometry, not use a post-pass flight`);
  }
  for (const stair of template.access?.stairs ?? []) {
    constructFlight(blocks, template.size, stair, registry.blockIds.get(stair.block) ?? 0);
  }
  return {
    id: template.id,
    lootContext: template.lootContext,
    ...templateEnvelope(template),
    blocks,
    ...(ground.includes(1) ? { ground } : {}),
    ...compileOwnership(template, blocks, pieces, source),
    pieces,
    spawns,
    groundLoot,
    ...(template.decals ? { decals: template.decals } : {}),
    ...(template.access ? { access: template.access } : {}),
  };
};

/** A template put in the world. `origin` is the lowest corner of its turned footprint; layer 0 is at origin[1]. */
export interface Placement {
  readonly lootContext?: LootContext;
  readonly template: CompiledTemplate;
  readonly origin: Vec3;
  readonly turn: Turn;
}

/** Width along x and depth along z once turned. */
export const footprint = ({ template, turn }: Placement): [number, number] =>
  turn % 2 === 0 ? [template.size[0], template.size[2]] : [template.size[2], template.size[0]];

/** Where a template cell's (x, z) lands, relative to the origin. */
const turned = (size: Vec3, turn: Turn, x: number, z: number): [number, number] => {
  const [sx, , sz] = size;
  switch (turn) {
    case 1:
      return [sz - 1 - z, x];
    case 2:
      return [sx - 1 - x, sz - 1 - z];
    case 3:
      return [z, sx - 1 - x];
    default:
      return [x, z];
  }
};

/** The template cell that lands on (u, v) relative to the origin: the inverse of `turned`. */
const unturned = (size: Vec3, turn: Turn, u: number, v: number): [number, number] => {
  const [sx, , sz] = size;
  switch (turn) {
    case 1:
      return [v, sz - 1 - u];
    case 2:
      return [sx - 1 - u, sz - 1 - v];
    case 3:
      return [sx - 1 - v, u];
    default:
      return [u, v];
  }
};

/** The authored block at a world cell, including air; undefined outside this placement. */
export const placedBlockAt = (placement: Placement, [x, y, z]: Vec3): number | undefined => {
  const { template, origin, turn } = placement;
  const [u, v] = unturned(template.size, turn, x - origin[0], z - origin[2]);
  const h = y - origin[1];
  const [sx, sy, sz] = template.size;
  if (!(u >= 0 && u < sx && v >= 0 && v < sz && h >= 0 && h < sy)) {
    return undefined;
  }
  const index = u + sx * (v + sz * h);
  return template.ownership?.[index] === 0 || template.ground?.[index] ? undefined : template.blocks[index];
};

/** Writes the part of a placed template that falls inside the chunk. */
export const stampPlacement = (chunk: Chunk, placement: Placement): void => {
  const { template, origin, turn } = placement;
  const [sx, sy, sz] = template.size;
  const [w, d] = footprint(placement);
  const base: Vec3 = [chunk.cx * CHUNK, chunk.cy * CHUNK, chunk.cz * CHUNK];
  const lo = [origin[0], origin[1], origin[2]].map((v, i) => Math.max(v - base[i]!, 0));
  const hi = [origin[0] + w, origin[1] + sy, origin[2] + d].map((v, i) => Math.min(v - base[i]!, CHUNK));
  for (let ly = lo[1]!; ly < hi[1]!; ly++) {
    const y = base[1] + ly - origin[1];
    for (let lz = lo[2]!; lz < hi[2]!; lz++) {
      for (let lx = lo[0]!; lx < hi[0]!; lx++) {
        const [x, z] = unturned(template.size, turn, base[0] + lx - origin[0], base[2] + lz - origin[2]);
        const index = x + sx * (z + sz * y);
        if (template.ownership?.[index] !== 0 && !template.ground?.[index]) {
          chunk.set(lx, ly, lz, template.blocks[index]!);
        }
      }
    }
  }
};

export type TemplateSlot = MapAssemblyDef['slots'][number];
export type TemplateAssembly = MapAssemblyDef;

export interface AssemblyContext {
  readonly seed: number;
  readonly siteId: string;
  readonly slotPath?: string;
  readonly ancestors?: readonly string[];
  readonly style?: string;
  readonly pieceCache?: Map<string, CompiledTemplate>;
}

export const contentPointer = (registry: Registry, section: string, id: string): string => {
  const origin = registry.contentOrigins.get(`${section}:${id}`);
  return origin ? `${origin.source}:${origin.path}` : `${section}:${id}`;
};

const compilePieceTemplate = (registry: Registry, piece: MapPieceDef, styleId: string): CompiledTemplate => {
  const source = contentPointer(registry, 'mapPieces', piece.id);
  const style = registry.mapStyles.get(styleId);
  if (!style) {
    throw new Error(`${source}: missing style ${styleId}`);
  }
  const palette: TemplateDef['palette'] = {};
  for (const [char, entry] of Object.entries(piece.palette)) {
    if (!('role' in entry)) {
      palette[char] = entry;
      continue;
    }
    const binding = style.bindings[entry.material];
    if (!binding || binding.role !== entry.role || !registry.blockIds.has(binding.block)) {
      throw new Error(
        `${source}.palette[${char}]: ${entry.role} cannot take material ${entry.material} from ${contentPointer(registry, 'mapStyles', style.id)}`,
      );
    }
    palette[char] = binding.block;
  }
  const literal: TemplateDef = {
    id: piece.id,
    lootContext: piece.lootContext,
    size: piece.size,
    layers: piece.layers,
    ...(piece.decals ? { decals: piece.decals } : {}),
    palette,
    ownership: piece.ownership,
  };
  if (!templateResolves(registry, literal)) {
    throw new Error(`${source}: unresolved piece palette`);
  }
  return compileTemplate(registry, literal, source);
};

export const compileMapPiece = (
  registry: Registry,
  piece: MapPieceDef,
  context?: AssemblyContext,
): CompiledTemplate => {
  const styleId = context?.style ?? piece.style;
  const key = JSON.stringify([piece.id, styleId]);
  let compiled = context?.pieceCache?.get(key);
  if (!compiled) {
    compiled = compilePieceTemplate(registry, piece, styleId);
    context?.pieceCache?.set(key, compiled);
  }
  const owner = context?.slotPath ?? piece.id;
  return {
    ...compiled,
    anchors: piece.anchors,
    ports: piece.ports,
    provenance: compiled.provenance!.map((entry) => entry && { ...entry, owner, slotPath: owner }),
  };
};

const compileKitRef = (registry: Registry, ref: KitRef, inherited: AssemblyContext): CompiledTemplate => {
  const context = ref.style ? { ...inherited, style: ref.style } : inherited;
  if (ref.style && !registry.mapStyles.has(ref.style)) {
    throw new Error(`seed=${context.seed} slot=${context.slotPath}: unknown style ${ref.style}`);
  }
  if (ref.kind === 'piece') {
    const piece = registry.mapPieces.get(ref.id);
    if (!piece) {
      throw new Error(`seed=${context.seed} slot=${context.slotPath}: missing piece ${ref.id}`);
    }
    return compileMapPiece(registry, piece, context);
  }
  const assembly = registry.mapAssemblies.get(ref.id);
  if (!assembly) {
    throw new Error(`seed=${context.seed} slot=${context.slotPath}: missing assembly ${ref.id}`);
  }
  return compileAssembly(registry, assembly, context);
};

const slotLabel = (context: AssemblyContext, assembly: TemplateAssembly, slot: TemplateSlot): string =>
  `seed=${context.seed} site=${context.siteId} slot=${context.slotPath ?? assembly.id}/${slot.id} turn=${slot.turn}`;

const traversalContract = (registry: Registry, template: CompiledTemplate): string => {
  const occupied = new Set<number>();
  const ladders: string[] = [];
  const layer = template.size[0] * template.size[2];
  for (const piece of template.pieces) {
    const def = registry.furniture.get(piece.furniture)!;
    if (def.climbable) {
      ladders.push(JSON.stringify([piece.pos, piece.size, piece.facing]));
    }
    const blocksBody = def.door ? piece.lock?.locked === true : def.solid !== false;
    if (!blocksBody) {
      continue;
    }
    for (const offset of cellsOf(piece.size)) {
      const at = offset.map((value, axis) => value + piece.pos[axis]!) as Vec3;
      const index = ownershipCell(template.size, at);
      if (template.reserved?.[index] === 1 || template.reserved?.[index + layer] === 1) {
        occupied.add(index);
      }
    }
  }
  return JSON.stringify([
    Object.entries(template.anchors ?? {})
      .sort(([a], [b]) => {
        if (a === b) {
          return 0;
        }
        return a < b ? -1 : 1;
      })
      .map(([id, anchor]) => [id, anchor.kind, anchor.at]),
    [...occupied].sort((a, b) => a - b),
    ladders.sort(),
  ]);
};

export const kitSlotChoices = (registry: Registry, slot: TemplateSlot): { ref: KitRef; weight: number }[] => {
  if ((slot.choices === undefined) === (slot.pool === undefined)) {
    throw new Error('needs exactly one of choices or pool');
  }
  if (slot.choices) {
    return slot.choices;
  }
  const pool = registry.mapPools.get(slot.pool!);
  if (!pool) {
    throw new Error(`unknown map pool ${slot.pool}`);
  }
  return pool.choices.map(({ ref, weight, atLeast, atMost }) => {
    if (atLeast !== undefined || atMost !== undefined) {
      throw new Error(`slot pool ${pool.id} cannot carry atLeast or atMost`);
    }
    if (ref.kind === 'template') {
      throw new Error(`slot pool ${pool.id} needs a piece or assembly, not template ${ref.id}`);
    }
    return { ref, weight };
  });
};

const resolveSlot = (
  registry: Registry,
  assembly: TemplateAssembly,
  slot: TemplateSlot,
  context: AssemblyContext,
): Placement => {
  const label = `${slotLabel(context, assembly, slot)} source=${contentPointer(registry, 'mapAssemblies', assembly.id)}.slots[${assembly.slots.indexOf(slot)}]`;
  let resolved: ReturnType<typeof kitSlotChoices>;
  try {
    resolved = kitSlotChoices(registry, slot);
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  const refKey = (ref: KitRef) => `${ref.kind}:${ref.id}${ref.style ? `@${ref.style}` : ''}`;
  const choices = [...resolved].sort((a, b) => {
    const left = refKey(a.ref);
    const right = refKey(b.ref);
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  });
  if (choices.length === 0 || new Set(choices.map((choice) => refKey(choice.ref))).size !== choices.length) {
    throw new Error(`${label}: choices must be nonempty and unique`);
  }
  const candidates = choices.map((choice) => {
    if (!(Number.isFinite(choice.weight) && choice.weight > 0)) {
      throw new Error(`${label} variant=${refKey(choice.ref)}: weight must be finite and positive`);
    }
    let template: CompiledTemplate;
    try {
      template = compileKitRef(registry, choice.ref, {
        ...context,
        slotPath: `${context.slotPath ?? assembly.id}/${slot.id}`,
      });
    } catch (error) {
      throw new Error(
        `${label} variant=${refKey(choice.ref)}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    const placement = { template, origin: slot.at, turn: slot.turn };
    const [width, depth] = footprint(placement);
    if (width !== slot.size[0] || template.size[1] !== slot.size[1] || depth !== slot.size[2]) {
      throw new Error(`${label} variant=${template.id}: piece must equal its delegated slot`);
    }
    return { weight: choice.weight, placement };
  });
  const reference = candidates[0]!.placement.template;
  const portContract = (template: CompiledTemplate) =>
    JSON.stringify([...(template.ports ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1)));
  for (const { placement } of candidates) {
    if (
      placement.template.ownership!.some(
        (claim, index) =>
          (claim !== 0) !== (reference.ownership![index] !== 0) ||
          placement.template.reserved![index] !== reference.reserved![index],
      ) ||
      placement.template.blocks.some(
        (block, index) =>
          Boolean(registry.blocks[block]?.solid) !== Boolean(registry.blocks[reference.blocks[index]!]?.solid),
      ) ||
      portContract(placement.template) !== portContract(reference) ||
      traversalContract(registry, placement.template) !== traversalContract(registry, reference)
    ) {
      throw new Error(
        `${label} variant=${placement.template.id}: alternatives need the same ownership domain and reserved voids, with equal solid support and ports, anchors, reserved-body furniture collision and ladder geometry`,
      );
    }
  }
  return pickWeighted(
    candidates,
    Rng.stream(context.seed, JSON.stringify([context.siteId, context.slotPath ?? assembly.id, slot.id])),
  )!.placement;
};

const placedPort = (placement: Placement, port: KitPort): KitPort => {
  const low = placedPoint(placement, port.clearance.min);
  const high = placedPoint(
    placement,
    port.clearance.min.map((value, axis) => value + port.clearance.size[axis]!) as Vec3,
  );
  return {
    ...port,
    at: placedPoint(placement, port.at),
    standing: placedPoint(placement, port.standing),
    facing: port.facing === 'up' || port.facing === 'down' ? port.facing : turnFacing(port.facing, placement.turn),
    clearance: {
      min: low.map((value, axis) => Math.min(value, high[axis]!)) as Vec3,
      size: low.map((value, axis) => Math.abs(value - high[axis]!)) as Vec3,
    },
  };
};

const OPPOSITE_PORT: Record<KitPort['facing'], KitPort['facing']> = {
  n: 's',
  e: 'w',
  s: 'n',
  w: 'e',
  up: 'down',
  down: 'up',
};
const validateJoins = (
  assembly: TemplateAssembly,
  resolved: readonly { slot: TemplateSlot; placement: Placement }[],
  source: string,
): KitPort[] => {
  if (new Set(assembly.joins.map((join) => join.id)).size !== assembly.joins.length) {
    throw new Error(`${source}: duplicate join id`);
  }
  const endpoint = (slotId: string, portId: string): KitPort => {
    const placement = resolved.find(({ slot }) => slot.id === slotId)?.placement;
    const port = placement?.template.ports?.find((item) => item.id === portId);
    if (!(placement && port)) {
      throw new Error(`${source}: missing port ${slotId}.${portId}`);
    }
    return placedPort(placement, port);
  };
  const mate = (a: KitPort, b: KitPort): void => {
    if (
      a.type !== b.type ||
      a.traversal !== b.traversal ||
      a.facing !== OPPOSITE_PORT[b.facing] ||
      a.at.some((value, axis) => value !== b.at[axis]) ||
      a.aperture.some((value, axis) => value !== b.aperture[axis])
    ) {
      throw new Error(`${source}: incompatible ports ${a.id} and ${b.id}`);
    }
  };
  const connected = new Set<string>();
  for (const join of assembly.joins) {
    for (const end of [join.a, join.b]) {
      const key = `${end.slot}.${end.port}`;
      if (connected.has(key) || !assembly.slots.some((slot) => slot.id === end.slot)) {
        throw new Error(`${source}: port ${key} is missing or joined more than once`);
      }
      connected.add(key);
    }
    mate(endpoint(join.a.slot, join.a.port), endpoint(`seam_${join.id}`, join.seam.a));
    mate(endpoint(join.b.slot, join.b.port), endpoint(`seam_${join.id}`, join.seam.b));
    connected.add(`seam_${join.id}.${join.seam.a}`);
    connected.add(`seam_${join.id}.${join.seam.b}`);
  }
  const exported = assembly.ports.map((port) => {
    const key = `${port.slot}.${port.port}`;
    if (connected.has(key) || !assembly.slots.some((slot) => slot.id === port.slot)) {
      throw new Error(`${source}: port ${key} cannot be both joined and exported`);
    }
    connected.add(key);
    return { ...endpoint(port.slot, port.port), id: port.id };
  });
  for (const { slot, placement } of resolved) {
    for (const port of placement.template.ports ?? []) {
      if (!connected.has(`${slot.id}.${port.id}`)) {
        throw new Error(`${source}: unmatched port ${slot.id}.${port.id}`);
      }
    }
  }
  return exported;
};

const validateSlots = (assembly: TemplateAssembly): void => {
  const ids = new Set<string>();
  for (const slot of assembly.slots) {
    if (ids.has(slot.id)) {
      throw new Error(`${assembly.id}: duplicate slot ${slot.id}`);
    }
    ids.add(slot.id);
    if (
      slot.at.some(
        (value, axis) => !Number.isInteger(value) || value < 0 || value + slot.size[axis]! > assembly.size[axis]!,
      ) ||
      slot.size.some((value) => !Number.isInteger(value) || value <= 0)
    ) {
      throw new Error(`${assembly.id}/${slot.id}: delegated slot lies outside assembly`);
    }
  }
  if (assembly.size.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error(`${assembly.id}: dimensions must be positive integers`);
  }
};

export const compileAssembly = (
  registry: Registry,
  assembly: TemplateAssembly,
  context: AssemblyContext,
): CompiledTemplate => {
  if ((assembly.access?.stairs.length ?? 0) > 0) {
    throw new Error(`${assembly.id}: owned pieces must author stair geometry, not use a post-pass flight`);
  }
  const source = contentPointer(registry, 'mapAssemblies', assembly.id);
  if (context.ancestors?.includes(assembly.id)) {
    throw new Error(`${source}: nesting cycle ${[...context.ancestors, assembly.id].join(' -> ')}`);
  }
  // Keep reusable leaf buffers within one immutable compilation, never across registry edits.
  const childContext = {
    ...context,
    pieceCache: context.pieceCache ?? new Map<string, CompiledTemplate>(),
    ancestors: [...(context.ancestors ?? []), assembly.id],
  };
  const seams: TemplateSlot[] = assembly.joins.map((join) => {
    const piece = registry.mapPieces.get(join.seam.piece);
    if (!piece) {
      throw new Error(`${source}.joins[${join.id}]: missing seam piece ${join.seam.piece}`);
    }
    const size: Vec3 = join.seam.turn % 2 === 0 ? [...piece.size] : [piece.size[2], piece.size[1], piece.size[0]];
    return {
      id: `seam_${join.id}`,
      at: join.seam.at,
      size,
      turn: join.seam.turn,
      choices: [{ ref: { kind: 'piece', id: piece.id }, weight: 1 }],
    };
  });
  const slots = [...assembly.slots, ...seams];
  try {
    validateSlots({ ...assembly, slots });
  } catch (error) {
    throw new Error(
      `seed=${context.seed} slot=${context.slotPath ?? assembly.id} source=${source}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  // Resolving every slot first prevents chunk demand from owning selection.
  const resolved = slots.map((slot) => ({ slot, placement: resolveSlot(registry, assembly, slot, childContext) }));
  const ports = validateJoins(
    assembly,
    resolved,
    `seed=${context.seed} slot=${context.slotPath ?? assembly.id} source=${source}`,
  );
  return {
    id: assembly.id,
    lootContext: assembly.lootContext,
    anchors: assembly.anchors,
    ports,
    ...templateEnvelope(assembly),
    ...composeAssemblyVoxels(assembly, resolved, context),
    pieces: resolved.flatMap(({ placement }) => placedPieces(placement)),
    spawns: resolved.flatMap(({ placement }) => placedSpawns(placement)),
    groundLoot: resolved.flatMap(({ placement }) => placedGroundLoot(placement)),
    decals: resolved.flatMap(({ placement }) => placedDecals(placement)),
    ...(assembly.access ? { access: assembly.access } : {}),
  };
};

const emptyVoxels = (size: Vec3) => {
  const volume = size[0] * size[1] * size[2];
  return {
    size,
    blocks: new Uint16Array(volume),
    ownership: new Uint8Array(volume),
    reserved: new Uint8Array(volume),
    provenance: new Array<VoxelProvenance | undefined>(volume),
  };
};

const composeAssemblyVoxels = (
  assembly: TemplateAssembly,
  resolved: readonly { slot: TemplateSlot; placement: Placement }[],
  context: AssemblyContext,
) => {
  const voxels = emptyVoxels(assembly.size);
  for (const { slot, placement } of resolved) {
    const collide = (to: number, at: Vec3, inherited: VoxelProvenance): never => {
      const { reserved, provenance } = voxels;
      throw new Error(
        `${slotLabel(context, assembly, slot)} variant=${placement.template.id} source=${inherited.source}: ` +
          `${reserved[to] ? 'reserved circulation collision' : 'ownership collision'} at ${at.join(',')} between ${provenance[to]!.owner} (${provenance[to]!.source}) and ${inherited.owner}`,
      );
    };
    composePlacement(slot, placement, voxels, collide);
  }
  const { size: _size, ...composed } = voxels;
  return composed;
};

// Hot at content build: plain index arithmetic, no per-cell tuples.
const composePlacement = (
  slot: TemplateSlot,
  { template, origin, turn }: Placement,
  { size, blocks, ownership, reserved, provenance }: ReturnType<typeof emptyVoxels>,
  collide: (to: number, at: Vec3, inherited: VoxelProvenance) => never,
) => {
  const [sx, sy, sz] = template.size;
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const from = x + sx * (z + sz * y);
        if (template.ownership![from] === 0) {
          continue;
        }
        const [u, v] = turned(template.size, turn, x, z);
        const at: Vec3 = [origin[0] + u, origin[1] + y, origin[2] + v];
        const to = ownershipCell(size, at);
        const inherited = template.provenance![from]!;
        if (ownership[to] !== 0) {
          collide(to, at, inherited);
        }
        blocks[to] = template.blocks[from]!;
        ownership[to] = template.ownership![from]!;
        reserved[to] = template.reserved![from]!;
        provenance[to] = { ...inherited, turn: ((inherited.turn + slot.turn) % 4) as Turn };
      }
    }
  }
};

/** A placed piece in world coordinates. */
export interface PlacedPiece {
  lootUsage?: LootContext['usage'];
  lock?: DoorLockDef;
  fixed?: true;
  furniture: string;
  loot?: string | undefined;
  facing: Facing;
  /** Its lowest corner, in blocks. */
  pos: Vec3;
  /** Cells along world x, y and z. */
  size: Vec3;
}

/** Every piece of furniture of a placed template, in world coordinates. */
export const placedPieces = ({ template, origin, turn }: Placement): PlacedPiece[] =>
  template.pieces.map((piece) => {
    const [ax, az] = turned(template.size, turn, piece.pos[0], piece.pos[2]);
    const [bx, bz] = turned(template.size, turn, piece.pos[0] + piece.size[0] - 1, piece.pos[2] + piece.size[2] - 1);
    return {
      furniture: piece.furniture,
      ...(piece.lock ? { lock: piece.lock } : {}),
      ...(piece.fixed ? { fixed: true as const } : {}),
      loot: piece.loot,
      ...(piece.lootUsage === undefined ? {} : { lootUsage: piece.lootUsage }),
      facing: turnFacing(piece.facing, turn),
      pos: [origin[0] + Math.min(ax, bx), origin[1] + piece.pos[1], origin[2] + Math.min(az, bz)],
      size: [Math.abs(bx - ax) + 1, piece.size[1], Math.abs(bz - az) + 1],
    };
  });

/** Point rotation uses the footprint edges, not the cell-index correction used by turned(). */
export const placedPoint = ({ template, origin, turn }: Placement, [x, y, z]: Vec3): Vec3 => {
  const [u, v] = turned(template.size, turn, x - 0.5, z - 0.5);
  return [origin[0] + u + 0.5, origin[1] + y, origin[2] + v + 0.5];
};

export const placedDecals = (placement: Placement): DecalDef[] =>
  (placement.template.decals ?? []).map((decal) => ({
    ...decal,
    at: placedPoint(placement, decal.at),
    ...(decal.door
      ? {
          door: placedPieces(placement)[
            placement.template.pieces.findIndex((piece) => piece.pos.every((v, axis) => v === decal.door![axis]))
          ]!.pos,
        }
      : {}),
    normal: decal.normal === 'up' || decal.normal === 'down' ? decal.normal : turnFacing(decal.normal, placement.turn),
    rotation:
      decal.rotation +
      ((Number(decal.normal === 'down') - Number(decal.normal === 'up')) * placement.turn * Math.PI) / 2,
  }));

export const placedGroundLoot = ({ template, origin, turn }: Placement): GroundLootMarker[] =>
  (template.groundLoot ?? []).map((point) => {
    const [x, z] = turned(template.size, turn, point.pos[0], point.pos[2]);
    return { ...point, pos: [origin[0] + x, origin[1] + point.pos[1], origin[2] + z] };
  });

export const placedSpawns = ({ template, origin, turn }: Placement): SpawnMarker[] =>
  template.spawns.map((spawn) => {
    const [x, z] = turned(template.size, turn, spawn.pos[0], spawn.pos[2]);
    return { ...spawn, pos: [origin[0] + x, origin[1] + spawn.pos[1], origin[2] + z] };
  });

/**
 * A template with its storeys repeated: layer 0 once, then every layer above it
 * (the top one, the roof, becomes the next storey's floor) `storeys` times. For the
 * stress-test city: there are no stairs between the storeys.
 */
export const stackTemplate = (template: CompiledTemplate, storeys: number): CompiledTemplate => {
  if (storeys <= 1) {
    return template;
  }
  if (template.access || template.ownership) {
    throw new Error('Explicit storeys and owned pieces cannot be stress-test stacked');
  }
  const [sx, sy, sz] = template.size;
  const layer = sx * sz;
  const perStorey = sy - 1;
  const height = 1 + perStorey * storeys;
  const blocks = new Uint16Array(sx * height * sz);
  blocks.set(template.blocks.subarray(0, layer), 0);
  const pieces: Piece[] = [];
  const spawns: SpawnMarker[] = [];
  const groundLoot: GroundLootMarker[] = [];
  for (let k = 0; k < storeys; k++) {
    blocks.set(template.blocks.subarray(layer), layer * (1 + k * perStorey));
    pieces.push(...template.pieces.map((p) => ({ ...p, pos: [p.pos[0], p.pos[1] + k * perStorey, p.pos[2]] as Vec3 })));
    groundLoot.push(
      ...(template.groundLoot ?? []).map((point) => ({
        ...point,
        pos: [point.pos[0], point.pos[1] + k * perStorey, point.pos[2]] as Vec3,
      })),
    );
    spawns.push(
      ...template.spawns.map((spawn) => ({
        ...spawn,
        pos: [spawn.pos[0], spawn.pos[1] + k * perStorey, spawn.pos[2]] as Vec3,
      })),
    );
  }
  return {
    decals: Array.from({ length: storeys }, (_, k) =>
      (template.decals ?? []).map((decal) => ({
        ...decal,
        at: [decal.at[0], decal.at[1] + k * perStorey, decal.at[2]] as Vec3,
        ...(decal.door ? { door: [decal.door[0], decal.door[1] + k * perStorey, decal.door[2]] as Vec3 } : {}),
      })),
    ).flat(),
    id: `${template.id}×${storeys}`,
    lootContext: template.lootContext,
    size: [sx, height, sz],
    blocks,
    pieces,
    spawns,
    groundLoot,
  };
};
