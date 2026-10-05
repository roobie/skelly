// Block entities (DESIGN.md, "Block entities"): furniture with state, such as a
// cupboard's contents or whether a door is open. Each is anchored at its lowest
// corner and spans a box of cells; every cell points back at it, so collision and
// ray casts find it from any of them.

import type { FurnitureDef, Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type Placed, type PlacedState, restorePlaced, snapshotPlaced } from './items.ts';
import { type Body, bodyOverlapsBlock } from './physics.ts';
import type { DoorLockDef } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';
import { cellsOf, type Facing } from './templates.ts';

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
  lock?: DoorLockDef;
}

/** What worldgen asks for: a piece of furniture at a place. */
export interface BlockEntityState {
  uid: number;
  type: string;
  pos: Vec3;
  size: Vec3;
  facing: Facing;
  searched: boolean;
  open: boolean;
  lock?: DoorLockDef;
  pockets?: PlacedState[][];
}

export type DoorOperation = 'open' | 'close' | 'lock' | 'unlock';

export interface BlockEntitiesState {
  nextUid: number;
  entities: BlockEntityState[];
}

export interface EntitySpec {
  lock?: DoorLockDef;
  type: string;
  pos: Vec3;
  size: Vec3;
  facing: Facing;
}

/** Search time in seconds: 1 s for a small container up to 3 s for a wardrobe (DESIGN.md, "Handling time"). */
export const SEARCH = { min: 1, max: 3, cellsForMax: 48 } as const;
const DOOR_PANEL_THICKNESS = 0.06;
const DOOR_OPEN_TURN = { n: -Math.PI / 2, s: Math.PI / 2, e: -Math.PI / 2, w: Math.PI / 2 } as const;

/** Oriented door-panel box: metre dimensions and local centre around a world-metre hinge. */
export interface DoorPanelBox {
  pivot: Vec3;
  center: Vec3;
  size: Vec3;
  rotationY: number;
}

/** The visible/pickable thin panel, open or closed, shared by renderer and core picking. */
export const doorPanel = (entity: BlockEntity, blockSize: number): DoorPanelBox => {
  const [x, y, z] = entity.pos;
  const [w, h, d] = entity.size;
  const alongX = entity.facing === 'n' || entity.facing === 's';
  const width = (alongX ? w : d) * blockSize;
  const height = h * blockSize;
  return alongX
    ? {
        pivot: [x * blockSize, y * blockSize, (z + d / 2) * blockSize],
        center: [width / 2, height / 2, 0],
        size: [width, height, DOOR_PANEL_THICKNESS],
        rotationY: entity.open ? DOOR_OPEN_TURN[entity.facing] : 0,
      }
    : {
        pivot: [(x + w / 2) * blockSize, y * blockSize, z * blockSize],
        center: [0, height / 2, width / 2],
        size: [DOOR_PANEL_THICKNESS, height, width],
        rotationY: entity.open ? DOOR_OPEN_TURN[entity.facing] : 0,
      };
};

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

  get next(): number {
    return this.nextUid;
  }

  byUid(uid: number): BlockEntity | undefined {
    return [...this.byAnchor.values()].find((entity) => entity.uid === uid);
  }

  snapshotState(): Readonly<BlockEntitiesState> {
    return freezeSnapshot({
      nextUid: this.nextUid,
      entities: [...this.byAnchor.values()].map((entity) => ({
        uid: entity.uid,
        type: entity.type,
        pos: [...entity.pos],
        size: [...entity.size],
        facing: entity.facing,
        searched: entity.searched,
        open: entity.open,
        ...(entity.lock ? { lock: { ...entity.lock } } : {}),
        ...(entity.pockets === undefined ? {} : { pockets: entity.pockets.map((grid) => grid.map(snapshotPlaced)) }),
      })),
    });
  }

  restoreState(state: BlockEntitiesState): void {
    const restored = BlockEntities.restoreState(this.registry, state);
    this.byAnchor.clear();
    this.cells.clear();
    for (const [anchor, entity] of restored.byAnchor) {
      this.byAnchor.set(anchor, entity);
    }
    for (const [cell, entity] of restored.cells) {
      this.cells.set(cell, entity);
    }
    this.nextUid = restored.nextUid;
    this.version = restored.version;
  }

  static restoreState(registry: Registry, state: BlockEntitiesState): BlockEntities {
    const entities = new BlockEntities(registry);
    const ids = new Set<number>();
    for (const saved of state.entities) {
      if (!Number.isSafeInteger(saved.uid) || saved.uid < 1 || ids.has(saved.uid)) {
        throw new Error(`Invalid or duplicate block entity id ${saved.uid}`);
      }
      ids.add(saved.uid);
      const entity = entities.addWithUid(saved, saved.uid);
      if (!entity) {
        throw new Error(`Duplicate block entity anchor ${saved.pos.join(',')}`);
      }
      entity.searched = saved.searched;
      if (saved.open && entity.lock?.locked) {
        throw new Error('A locked door cannot be open');
      }
      entity.open = saved.open;
      if (saved.pockets) {
        entity.pockets = saved.pockets.map((grid) => grid.map((placed) => restorePlaced(registry, placed)));
      }
    }
    const maxUid = [...ids].reduce((max, uid) => Math.max(max, uid), 0);
    if (!Number.isSafeInteger(state.nextUid) || state.nextUid <= maxUid) {
      throw new Error('Invalid next block entity id');
    }
    entities.nextUid = state.nextUid;
    return entities;
  }

  defOf(entity: BlockEntity): FurnitureDef {
    return this.registry.furniture.get(entity.type)!;
  }

  /**
   * Adds a piece of furniture. A spec whose anchor already has an entity is ignored
   * and returns undefined, so a column that generates again doesn't duplicate it.
   */
  add(spec: EntitySpec): BlockEntity | undefined {
    const entity = this.addWithUid(spec, this.nextUid);
    if (entity) {
      this.nextUid += 1;
    }
    return entity;
  }

  private addWithUid(spec: EntitySpec, uid: number): BlockEntity | undefined {
    const anchor = key(...spec.pos);
    if (this.byAnchor.has(anchor)) {
      return undefined;
    }
    const def = this.registry.furniture.get(spec.type);
    if (!def) {
      throw new Error(`content does not define furniture "${spec.type}"`);
    }
    const entity: BlockEntity = {
      uid,
      type: spec.type,
      pos: [...spec.pos],
      size: [...spec.size],
      facing: spec.facing,
      searched: false,
      open: false,
    };
    if (spec.lock) {
      if (!(def.door && spec.lock.id) || typeof spec.lock.locked !== 'boolean') {
        throw new Error('Invalid door lock');
      }
      entity.lock = { ...spec.lock };
    }
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

  /** Whether a body's box overlaps any cell occupied by an entity. */
  bodyIntersects(entity: BlockEntity, body: Body): boolean {
    const [x0, y0, z0] = entity.pos;
    for (const [x, y, z] of cellsOf(entity.size)) {
      if (bodyOverlapsBlock(body, [x0 + x, y0 + y, z0 + z])) {
        return true;
      }
    }
    return false;
  }

  /** Close an open door only when neither the player nor any other body occupies its cells. */
  closeDoor(entity: BlockEntity, player: Body, otherBodies: Iterable<Body>): 'player' | 'other' | undefined {
    if (!(this.defOf(entity).door && entity.open)) {
      return undefined;
    }
    if (this.bodyIntersects(entity, player)) {
      return 'player';
    }
    for (const body of otherBodies) {
      if (this.bodyIntersects(entity, body)) {
        return 'other';
      }
    }
    this.setOpen(entity, false);
    return undefined;
  }

  /** Native eligibility shared by options and effects; key ids come from held definitions. */
  doorRefusal(entity: BlockEntity, operation: DoorOperation, keys: readonly string[]): string | undefined {
    if (!this.defOf(entity).door) {
      return "It isn't a door";
    }
    if (operation === 'open') {
      if (entity.open) {
        return "It's already open";
      }
      return entity.lock?.locked ? "It's locked" : undefined;
    }
    if (operation === 'close') {
      return entity.open ? undefined : "It's already closed";
    }
    return this.lockRefusal(entity, operation === 'lock', keys);
  }

  private lockRefusal(entity: BlockEntity, locked: boolean, keys: readonly string[]): string | undefined {
    if (!entity.lock) {
      return 'The door has no lock';
    }
    if (entity.open) {
      return 'Close the door first';
    }
    if (keys.length === 0) {
      return 'Hold the key in your hands';
    }
    if (!keys.includes(entity.lock.id)) {
      return "The key doesn't fit";
    }
    return entity.lock.locked === locked ? `It's already ${locked ? 'locked' : 'unlocked'}` : undefined;
  }

  /** Use closeDoor for a gameplay close, which also checks occupying bodies. */
  setOpen(entity: BlockEntity, open: boolean): string | undefined {
    if (open) {
      const reason = this.doorRefusal(entity, 'open', []);
      if (reason) {
        return reason;
      }
    }
    entity.open = open;
    this.version += 1;
    return undefined;
  }

  setLocked(entity: BlockEntity, locked: boolean, keys: readonly string[]): string | undefined {
    const reason = this.doorRefusal(entity, locked ? 'lock' : 'unlock', keys);
    if (reason) {
      return reason;
    }
    entity.lock!.locked = locked;
    this.version += 1;
    return undefined;
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
}
