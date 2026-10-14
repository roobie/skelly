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
import { Rng } from './random.ts';
import type { DoorLockDef, TemplateAccess } from './schema.ts';
import { constructFlight } from './stairFlight.ts';
import { compileOwnership, ownershipCell } from './templateOwnership.ts';

/** Horizontal front facings follow WORLD_NORTH in coords.ts. */
export type Facing = 'n' | 'e' | 's' | 'w';
/** Quarter turns clockwise seen from above: a turn takes north to east. */
export type Turn = 0 | 1 | 2 | 3;

const FACINGS: readonly Facing[] = ['n', 'e', 's', 'w'];

const turnFacing = (facing: Facing, turn: Turn): Facing => FACINGS[(FACINGS.indexOf(facing) + turn) % 4]!;

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

/** The character at a template cell, or undefined outside the layers. */
const charAt = (template: TemplateDef, x: number, y: number, z: number): string | undefined => {
  const row = template.layers[y]?.[z] ?? '';
  return row.length === template.size[0] ? row[x] : [...row][x];
};

function* markedCells(template: TemplateDef, char: string): Generator<Vec3> {
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
  template: TemplateDef,
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
export const templateLockIds = (registry: Registry, template: TemplateDef): string[] =>
  Object.entries(template.palette).flatMap(([char, entry]) => {
    if (typeof entry === 'string' || !entry.lock || !entry.furniture) {
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
  furniture: string;
  /** The palette's loot table, or the furniture's own. */
  loot?: string | undefined;
  facing: Facing;
  pos: Vec3;
  size: Vec3;
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
  /** Zero is unclaimed, one owns occupancy, two owns air. */
  readonly ownership?: Uint8Array;
  readonly reserved?: Uint8Array;
  readonly provenance?: readonly (VoxelProvenance | undefined)[];
  readonly pieces: readonly Piece[];
  readonly spawns: readonly SpawnMarker[];
  readonly access?: TemplateAccess;
  /** The support layer of the declared ground floor, relative to the lowest template layer. */
  readonly groundLayer?: number;
}

/** Whether every block and furniture id in a template's palette exists; `compileTemplate` needs that. */
export const templateResolves = (registry: Registry, template: TemplateDef): boolean =>
  Object.values(template.palette).every((entry) =>
    typeof entry === 'string'
      ? registry.blockIds.has(entry)
      : entry.furniture === undefined || registry.furniture.has(entry.furniture),
  );

/** Resolves a template's palette against the registry. The validator has already checked it. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: palette compilation resolves the template's block, furniture, and spawn encodings in one pass.
export const compileTemplate = (registry: Registry, template: TemplateDef): CompiledTemplate => {
  const [sx, sy, sz] = template.size;
  const blocks = new Uint16Array(sx * sy * sz);
  const pieces: Piece[] = [];
  const spawns: SpawnMarker[] = [];
  for (const [char, entry] of Object.entries(template.palette)) {
    if (typeof entry === 'string') {
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
        loot: entry.loot ?? def.loot,
        ...(entry.lootUsage === undefined ? {} : { lootUsage: entry.lootUsage }),
        facing,
        pos,
        size,
        ...(entry.lock ? { lock: entry.lock } : {}),
      });
    }
  }
  for (const [x, y, z] of cellsOf(template.size)) {
    const entry = template.palette[charAt(template, x, y, z) ?? ''];
    blocks[x + sx * (z + sz * y)] = typeof entry === 'string' ? registry.blockIds.get(entry)! : 0;
  }
  if (template.ownership && (template.access?.stairs.length ?? 0) > 0) {
    throw new Error(`${template.id}: owned pieces must author stair geometry, not use a post-pass flight`);
  }
  for (const stair of template.access?.stairs ?? []) {
    constructFlight(blocks, template.size, stair, registry.blockIds.get(stair.block) ?? 0);
  }
  const groundLayer = template.access?.storeys.find((floor) => floor.id === template.access?.ground)?.floor;
  return {
    id: template.id,
    lootContext: template.lootContext,
    size: [sx, sy, sz],
    blocks,
    ...compileOwnership(template, blocks, pieces),
    pieces,
    spawns,
    ...(template.access ? { access: template.access, groundLayer: (groundLayer ?? 1) - 1 } : {}),
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
  return template.ownership?.[index] === 0 ? undefined : template.blocks[index];
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
        if (template.ownership?.[index] !== 0) {
          chunk.set(lx, ly, lz, template.blocks[index]!);
        }
      }
    }
  }
};

export interface TemplateSlot {
  readonly id: string;
  readonly at: Vec3;
  readonly size: Vec3;
  readonly turn: Turn;
  readonly choices: readonly { readonly template: string; readonly weight: number }[];
}

export interface TemplateAssembly {
  readonly id: string;
  readonly lootContext: CompiledTemplate['lootContext'];
  readonly size: Vec3;
  readonly slots: readonly TemplateSlot[];
  readonly access?: TemplateAccess;
}

export interface AssemblyContext {
  readonly seed: number;
  readonly siteId: string;
}

const slotLabel = (context: AssemblyContext, assembly: TemplateAssembly, slot: TemplateSlot): string =>
  `seed=${context.seed} site=${context.siteId} slot=${assembly.id}/${slot.id} turn=${slot.turn}`;

const resolveSlot = (
  registry: Registry,
  assembly: TemplateAssembly,
  slot: TemplateSlot,
  context: AssemblyContext,
): Placement => {
  const label = slotLabel(context, assembly, slot);
  const choices = [...slot.choices].sort((a, b) => {
    if (a.template === b.template) {
      return 0;
    }
    return a.template < b.template ? -1 : 1;
  });
  if (choices.length === 0 || new Set(choices.map((choice) => choice.template)).size !== choices.length) {
    throw new Error(`${label}: choices must be nonempty and unique`);
  }
  const candidates = choices.map((choice) => {
    if (!(Number.isFinite(choice.weight) && choice.weight > 0)) {
      throw new Error(`${label} variant=${choice.template}: weight must be finite and positive`);
    }
    const definition = registry.templates.get(choice.template);
    if (!(definition?.ownership && templateResolves(registry, definition))) {
      throw new Error(`${label} source=${choice.template}: missing or unresolved owned literal piece`);
    }
    const template = compileTemplate(registry, definition);
    const placement = { template, origin: slot.at, turn: slot.turn };
    const [width, depth] = footprint(placement);
    if (width !== slot.size[0] || template.size[1] !== slot.size[1] || depth !== slot.size[2]) {
      throw new Error(`${label} variant=${template.id} source=${definition.id}: piece must equal its delegated slot`);
    }
    return { choice, placement };
  });
  const reference = candidates[0]!.placement.template;
  for (const { placement } of candidates) {
    if (
      placement.template.ownership!.some(
        (claim, index) =>
          (claim !== 0) !== (reference.ownership![index] !== 0) ||
          placement.template.reserved![index] !== reference.reserved![index],
      )
    ) {
      throw new Error(
        `${label} variant=${placement.template.id}: alternatives need the same ownership domain and reserved voids`,
      );
    }
  }
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  if (!Number.isFinite(total)) {
    throw new Error(`${label}: total weight must be finite`);
  }
  let roll = Rng.stream(context.seed, JSON.stringify([context.siteId, assembly.id, slot.id])).range(0, total);
  for (const { choice, placement } of candidates) {
    roll -= choice.weight;
    if (roll < 0) {
      return placement;
    }
  }
  return candidates.at(-1)!.placement;
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
  validateSlots(assembly);
  // Resolving every slot first prevents chunk demand from owning selection.
  const resolved = assembly.slots.map((slot) => ({ slot, placement: resolveSlot(registry, assembly, slot, context) }));
  const volume = assembly.size[0] * assembly.size[1] * assembly.size[2];
  const blocks = new Uint16Array(volume);
  const ownership = new Uint8Array(volume);
  const reserved = new Uint8Array(volume);
  const provenance: (VoxelProvenance | undefined)[] = new Array(volume);
  for (const { slot, placement } of resolved) {
    for (const cell of cellsOf(placement.template.size)) {
      const from = ownershipCell(placement.template.size, cell);
      if (placement.template.ownership![from] === 0) {
        continue;
      }
      const point = placedPoint(placement, [cell[0] + 0.5, cell[1], cell[2] + 0.5]);
      const at: Vec3 = [point[0] - 0.5, point[1], point[2] - 0.5];
      const to = ownershipCell(assembly.size, at);
      const owner = `${assembly.id}/${slot.id}`;
      if (ownership[to] !== 0) {
        throw new Error(
          `${slotLabel(context, assembly, slot)} variant=${placement.template.id} source=${placement.template.id}: ` +
            `${reserved[to] ? 'reserved circulation collision' : 'ownership collision'} at ${at.join(',')} between ${provenance[to]!.owner} and ${owner}`,
        );
      }
      blocks[to] = placement.template.blocks[from]!;
      ownership[to] = placement.template.ownership![from]!;
      reserved[to] = placement.template.reserved![from]!;
      provenance[to] = {
        owner,
        source: placement.template.id,
        variant: placement.template.id,
        slotPath: owner,
        turn: slot.turn,
      };
    }
  }
  const ground = assembly.access?.storeys.find((storey) => storey.id === assembly.access?.ground);
  return {
    id: assembly.id,
    lootContext: assembly.lootContext,
    size: [...assembly.size],
    blocks,
    ownership,
    reserved,
    provenance,
    pieces: resolved.flatMap(({ placement }) => placedPieces(placement)),
    spawns: resolved.flatMap(({ placement }) => placedSpawns(placement)),
    ...(assembly.access ? { access: assembly.access, groundLayer: (ground?.floor ?? 1) - 1 } : {}),
  };
};

/** A placed piece in world coordinates. */
export interface PlacedPiece {
  lootUsage?: LootContext['usage'];
  lock?: DoorLockDef;
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
  for (let k = 0; k < storeys; k++) {
    blocks.set(template.blocks.subarray(layer), layer * (1 + k * perStorey));
    pieces.push(...template.pieces.map((p) => ({ ...p, pos: [p.pos[0], p.pos[1] + k * perStorey, p.pos[2]] as Vec3 })));
    spawns.push(
      ...template.spawns.map((spawn) => ({
        ...spawn,
        pos: [spawn.pos[0], spawn.pos[1] + k * perStorey, spawn.pos[2]] as Vec3,
      })),
    );
  }
  return {
    id: `${template.id}×${storeys}`,
    lootContext: template.lootContext,
    size: [sx, height, sz],
    blocks,
    pieces,
    spawns,
  };
};
