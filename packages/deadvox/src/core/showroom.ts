// The test house showroom (`docs/test-house.md`, "Showroom"): an authored slot row and a catalogue derived from
// content furniture. Content owns where they stand and how far apart; this module owns the packing.

import { smoothstep } from './authoredTerrain.mjs';
import type { Registry } from './content.ts';
import { toChunk, type Vec3, yawFromBearing } from './coords.ts';
import type { SiteLayoutDef } from './schema.ts';
import { TEMPLATE_BLOCK_SIZE } from './settlementSpawns.ts';
import { type FurnitureSpawn, type Rect, rectDistance, SupplyFootprints } from './site.ts';
import type { CompiledTemplate, Placement } from './templates.ts';

export type ShowroomDef = NonNullable<SiteLayoutDef['showroom']>;
type SlotDef = ShowroomDef['slots'][number];

const S = TEMPLATE_BLOCK_SIZE;
const toBlocks = (metres: number): number => Math.round(metres / S);

/** A showroom prop: its lowest corner and size in world blocks, and the way its front faces. */
export interface ShowroomProp {
  readonly furniture: string;
  readonly pos: Vec3;
  readonly size: Vec3;
  readonly facing: 'n' | 's';
}

/** Feet in metres and a camera yaw, like `Site['spawn']`. */
export interface ShowroomPose {
  readonly pos: Vec3;
  readonly yaw: number;
}

const sizeOf = (registry: Registry, furniture: string): Vec3 => {
  const def = registry.furniture.get(furniture);
  if (!def) {
    throw new Error(`showroom furniture "${furniture}" is not in content`);
  }
  // Rows face north or south, so a piece keeps its authored width along x.
  return [...def.size];
};

/** The yaw that looks from a point to a target, both in metres on the ground plane. */
export const yawToward = (from: readonly number[], [x, , z]: readonly number[]): number =>
  yawFromBearing((Math.atan2(x! - from[0]!, -(z! - from[2]!)) * 180) / Math.PI);

/** The prop's centre in metres, at its feet. */
export const propCentre = ({ pos, size }: ShowroomProp): Vec3 => [
  (pos[0] + size[0] / 2) * S,
  pos[1] * S,
  (pos[2] + size[2] / 2) * S,
];

/** Where to stand to look at a prop: in front of it, on the floor it stands on, facing its centre. */
const facingPose = (prop: ShowroomProp, distance: number): ShowroomPose => {
  const centre = propCentre(prop);
  const front = prop.facing === 's' ? (prop.pos[2] + prop.size[2]) * S + distance : prop.pos[2] * S - distance;
  const pos: Vec3 = [centre[0], centre[1], front];
  return { pos, yaw: yawToward(pos, centre) };
};

/** The slot row, oldest first: fronts on the row line, each slot east of the one before. */
export const slotProps = (registry: Registry, showroom: ShowroomDef): ShowroomProp[] => {
  const [x0, y, z] = showroom.row.map(toBlocks) as Vec3;
  let x = x0;
  return showroom.slots.map(({ furniture }) => {
    const size = sizeOf(registry, furniture);
    const prop: ShowroomProp = {
      furniture,
      pos: [x, y, showroom.facing === 's' ? z - size[2] : z],
      size,
      facing: showroom.facing,
    };
    x += size[0] + toBlocks(showroom.spacing);
    return prop;
  });
};

/**
 * The slots as one placement whose cells are all "the ground here", so it stamps nothing and its pieces are
 * ordinary authored furniture: fixture stock, the demo loot rule and house power reach them as they reach the house.
 */
export const slotPlacement = (registry: Registry, layout: SiteLayoutDef): Placement | undefined => {
  const { showroom } = layout;
  if (!showroom || showroom.slots.length === 0) {
    return undefined;
  }
  const props = slotProps(registry, showroom);
  const origin = [0, 1, 2].map((axis) => Math.min(...props.map(({ pos }) => pos[axis]!))) as Vec3;
  const size = [0, 1, 2].map(
    (axis) => Math.max(...props.map(({ pos, size: extent }) => pos[axis]! + extent[axis]!)) - origin[axis]!,
  ) as Vec3;
  const cells = size[0] * size[1] * size[2];
  const piece = (prop: ShowroomProp, { fixed, items }: SlotDef) => ({
    furniture: prop.furniture,
    facing: prop.facing,
    pos: prop.pos.map((value, axis) => value - origin[axis]!) as Vec3,
    size: prop.size,
    ...(fixed ? { fixed } : {}),
    ...(items ? { items } : {}),
  });
  const template: CompiledTemplate = {
    id: `${layout.id}_showroom_slots`,
    lootContext: layout.lootContext,
    size,
    blocks: new Uint16Array(cells),
    ground: new Uint8Array(cells).fill(1),
    pieces: props.map((prop, i) => piece(prop, showroom.slots[i]!)),
    spawns: [],
    groundLoot: [],
  };
  return { template, origin, turn: 0, lootContext: layout.lootContext };
};

/**
 * Every content furniture piece, deepest first so each row holds pieces of like depth, then by id. Rows run east
 * up to the content width; each faces south onto its own aisle.
 */
const catalogueProps = (registry: Registry, catalogue: ShowroomDef['catalogue']): ShowroomProp[] => {
  const [x0, y, z0] = catalogue.position.map(toBlocks) as Vec3;
  const width = toBlocks(catalogue.width);
  const gap = toBlocks(catalogue.spacing);
  const pieces = [...registry.furniture.values()]
    .map(({ id }) => ({ furniture: id, size: sizeOf(registry, id) }))
    .sort((a, b) => b.size[2] - a.size[2] || a.furniture.localeCompare(b.furniture));
  const rows: { furniture: string; size: Vec3 }[][] = [];
  let used = Number.POSITIVE_INFINITY;
  for (const piece of pieces) {
    if (used + piece.size[0] > width) {
      rows.push([]);
      used = 0;
    }
    rows.at(-1)!.push(piece);
    used += piece.size[0] + gap;
  }
  const props: ShowroomProp[] = [];
  let back = z0;
  for (const row of rows) {
    const front = back + Math.max(...row.map(({ size }) => size[2]));
    let x = x0;
    for (const { furniture, size } of row) {
      props.push({ furniture, pos: [x, y, front - size[2]], size, facing: 's' });
      x += size[0] + gap;
    }
    back = front + gap;
  }
  return props;
};

/** The catalogue: its props and the flat floor they stand on. Coordinates are blocks. */
export class ShowroomCatalogue {
  readonly props: readonly ShowroomProp[];
  /** The floor, including each row's aisle. */
  readonly rect: Rect;
  /** The floor's top block. */
  readonly floor: number;
  private readonly blend: number;
  private readonly floorBlock: number;

  constructor(registry: Registry, catalogue: ShowroomDef['catalogue']) {
    const block = registry.blockIds.get(catalogue.floor);
    if (block === undefined) {
      throw new Error(`content does not define block "${catalogue.floor}"`);
    }
    this.floorBlock = block;
    this.props = catalogueProps(registry, catalogue);
    const [x0, y, z0] = catalogue.position.map(toBlocks) as Vec3;
    this.floor = y - 1;
    this.blend = toBlocks(catalogue.blend);
    this.rect = {
      x0,
      z0,
      x1: Math.max(...this.props.map(({ pos, size }) => pos[0] + size[0])),
      z1: Math.max(...this.props.map(({ pos, size }) => pos[2] + size[2])) + toBlocks(catalogue.spacing),
    };
  }

  /** Level inside the floor, blending into the natural ground around it. */
  height(x: number, z: number, natural: number): number {
    const distance = rectDistance(this.rect, x, z);
    if (distance >= this.blend) {
      return natural;
    }
    return Math.round(natural + smoothstep(1 - distance / this.blend) * (this.floor - natural));
  }

  top(x: number, z: number): number | undefined {
    return rectDistance(this.rect, x, z) === 0 ? this.floorBlock : undefined;
  }

  supplySourcesIn(area: Rect) {
    return new SupplyFootprints(this.props, []).in(area);
  }

  /** Each piece stands empty: the catalogue shows furniture, not supply. */
  furnitureIn(cx: number, cz: number): FurnitureSpawn[] {
    return this.props
      .filter(({ pos }) => toChunk(pos[0]) === cx && toChunk(pos[2]) === cz)
      .map(({ furniture, pos, size, facing }) => ({
        spec: { type: furniture, pos: [...pos], size: [...size], facing },
        loot: [],
      }));
  }
}

/** The pose that looks at the named prop, or undefined when none of these props is that furniture. */
export const focusPose = (
  props: readonly ShowroomProp[],
  furniture: string,
  distance: number,
): ShowroomPose | undefined => {
  const prop = props.find((candidate) => candidate.furniture === furniture);
  return prop && facingPose(prop, distance);
};
