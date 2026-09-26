// Block entities (DESIGN.md, "Block entities"): furniture with state, such as a
// cupboard's contents or whether a door is open. Each is anchored at its lowest
// corner and spans a box of cells; every cell points back at it, so collision and
// ray casts find it from any of them.

import type { FurnitureDef, Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { Placed } from './items.ts';
import type { Facing } from './templates.ts';

export interface BlockEntity {
  readonly uid: number;
  /** Furniture id. */
  readonly type: string;
  /** Lowest corner, in blocks. */
  readonly pos: Vec3;
  /** Cells along x, y and z. */
  readonly size: Vec3;
  readonly facing: Facing;
  /** One grid per pocket of the furniture's container. */
  pockets?: Placed[][];
  /** A container's contents show once it's been searched. */
  searched: boolean;
  /** Doors only. */
  open: boolean;
}

/** What worldgen asks for: a piece of furniture at a place. */
export interface EntitySpec {
  type: string;
  pos: Vec3;
  size: Vec3;
  facing: Facing;
}

/** Search time in seconds: 1 s for a small container up to 3 s for a wardrobe (DESIGN.md, "Handling time"). */
export const SEARCH = { min: 1, max: 3, cellsForMax: 48 } as const;

export const searchTime = (def: FurnitureDef): number => {
  const cells = (def.container?.pockets ?? []).reduce((sum, p) => sum + p.grid[0] * p.grid[1], 0);
  return SEARCH.min + (SEARCH.max - SEARCH.min) * Math.min(1, cells / SEARCH.cellsForMax);
};

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

export class BlockEntities {
  readonly registry: Registry;
  private readonly byAnchor = new Map<string, BlockEntity>();
  private readonly cells = new Map<string, BlockEntity>();
  private nextUid = 1;
  /** Goes up on every change, so views know when to redraw. */
  version = 0;

  constructor(registry: Registry) {
    this.registry = registry;
  }

  get all(): IterableIterator<BlockEntity> {
    return this.byAnchor.values();
  }

  defOf(entity: BlockEntity): FurnitureDef {
    return this.registry.furniture.get(entity.type)!;
  }

  /**
   * Adds a piece of furniture. A spec whose anchor already has an entity is ignored
   * and returns undefined, so a column that generates again doesn't duplicate it.
   */
  add(spec: EntitySpec): BlockEntity | undefined {
    const anchor = key(...spec.pos);
    if (this.byAnchor.has(anchor)) {
      return undefined;
    }
    const def = this.registry.furniture.get(spec.type);
    if (!def) {
      throw new Error(`content does not define furniture "${spec.type}"`);
    }
    const entity: BlockEntity = {
      uid: this.nextUid,
      type: spec.type,
      pos: [...spec.pos],
      size: [...spec.size],
      facing: spec.facing,
      searched: false,
      open: false,
    };
    this.nextUid += 1;
    if (def.container) {
      entity.pockets = def.container.pockets.map(() => []);
    }
    this.byAnchor.set(anchor, entity);
    const [x0, y0, z0] = spec.pos;
    for (let y = y0; y < y0 + spec.size[1]; y++) {
      for (let z = z0; z < z0 + spec.size[2]; z++) {
        for (let x = x0; x < x0 + spec.size[0]; x++) {
          this.cells.set(key(x, y, z), entity);
        }
      }
    }
    this.version += 1;
    return entity;
  }

  /** The entity covering a cell. */
  at(x: number, y: number, z: number): BlockEntity | undefined {
    return this.cells.get(key(x, y, z));
  }

  /** Whether an entity's cell stops movement: closed doors and solid furniture do. */
  blocks(entity: BlockEntity): boolean {
    const def = this.defOf(entity);
    return def.door ? !entity.open : def.solid !== false;
  }

  isSolid(x: number, y: number, z: number): boolean {
    const entity = this.at(x, y, z);
    return entity !== undefined && this.blocks(entity);
  }

  /** Opens or closes a door. */
  setOpen(entity: BlockEntity, open: boolean): void {
    entity.open = open;
    this.version += 1;
  }

  markSearched(entity: BlockEntity): void {
    entity.searched = true;
    this.version += 1;
  }

  /** Blocks from a point to the nearest point of an entity's box. */
  distance(entity: BlockEntity, point: Vec3): number {
    const d = point.map((v, i) => {
      const lo = entity.pos[i]!;
      const hi = lo + entity.size[i]!;
      return v < lo ? lo - v : Math.max(0, v - hi);
    });
    return Math.hypot(...d);
  }

  /** Containers within `radius` blocks of a point, nearest first. */
  containersNear(point: Vec3, radius: number): BlockEntity[] {
    return [...this.byAnchor.values()]
      .filter((e) => e.pockets !== undefined && this.distance(e, point) <= radius)
      .sort((a, b) => this.distance(a, point) - this.distance(b, point));
  }
}
