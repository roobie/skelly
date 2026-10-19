// Block entities (`DESIGN.md`, "Block entities"): furniture with state, such as a
// cupboard's contents or whether a door is open. Each is anchored at its lowest
// corner and spans a box of cells; every cell points back at it, so collision and
// ray casts find it from any of them. Worldgen claims a piece by the corner it
// spawned at, its origin, which stays claimed wherever the piece is carried.

import type { FurnitureDef, Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type Placed, type PlacedState, restorePlaced, snapshotPlaced } from './items.ts';
import { type Body, bodyOverlapsBlock } from './physics.ts';
import type { DoorLockDef, InventoryTuningDef } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';
import { cellsOf, type Facing, pieceSize } from './templates.ts';

/** Which face a tipped piece lies on: its back, or its right side. */
export type Tip = 'back' | 'side';

/** A piece's own [width, height, depth] once tipped: on its back the depth stands up, on its side the width lies down. */
const tippedSize = ([w, h, d]: readonly [number, number, number], tip: Tip | undefined): Vec3 => {
  if (tip === 'back') {
    return [w, d, h];
  }
  return tip === 'side' ? [h, w, d] : [w, h, d];
};

export interface BlockEntity {
  readonly uid: number;
  /** Furniture id. */
  readonly type: string;
  /** Lowest corner where worldgen spawned it, in blocks. */
  readonly origin: Vec3;
  /** Lowest corner, in blocks; while carried, where it was lifted from. */
  pos: Vec3;
  /** Cells along x, y and z. */
  size: Vec3;
  facing: Facing;
  /** Laid over onto its back or its side; upright when absent. */
  tip?: Tip | undefined;
  /** Held in the player's hands, so it covers no cells. */
  carried: boolean;
  /** Fastened where it stands, so it can't be moved. */
  readonly fixed?: true;
  /** One grid per pocket of the furniture's container. */
  pockets?: Placed[][];
  /** A container's contents show once it's been searched. */
  searched: boolean;
  /** Doors only. */
  open: boolean;
  lock?: DoorLockDef | undefined;
}

/** What worldgen asks for: a piece of furniture at a place. */
export interface BlockEntityState {
  uid: number;
  type: string;
  origin: Vec3;
  pos: Vec3;
  size: Vec3;
  facing: Facing;
  tip?: Tip;
  carried?: true;
  fixed?: true;
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
  fixed?: true;
  type: string;
  pos: Vec3;
  size: Vec3;
  facing: Facing;
  tip?: Tip;
}

const DOOR_PANEL_THICKNESS = 0.06;
const DOOR_FACE_CLEARANCE = 0.001;
const DOOR_OPEN_TURN = { n: -Math.PI / 2, s: Math.PI / 2, e: -Math.PI / 2, w: Math.PI / 2 } as const;
const FACE_OUTWARD = { n: -1, s: 1, e: 1, w: -1 } as const;

const bodyFacePanelOffset = (facing: Facing, onBodyFace: boolean): number =>
  onBodyFace ? FACE_OUTWARD[facing] * (DOOR_PANEL_THICKNESS / 2 + DOOR_FACE_CLEARANCE) : 0;

const doorPanelTurn = (entity: BlockEntity, onBodyFace: boolean): number => {
  if (!entity.open) {
    return 0;
  }
  const turn = DOOR_OPEN_TURN[entity.facing];
  return onBodyFace ? -turn : turn;
};

/** Oriented door-panel box: metre dimensions and local centre around a world-metre hinge. */
export interface DoorPanelBox {
  pivot: Vec3;
  center: Vec3;
  size: Vec3;
  rotationY: number;
}

/** The visible/pickable thin panel, open or closed, shared by renderer and core picking. */
export const doorPanel = (entity: BlockEntity, blockSize: number, onBodyFace = false): DoorPanelBox => {
  const [x, y, z] = entity.pos;
  const [w, h, d] = entity.size;
  const alongX = entity.facing === 'n' || entity.facing === 's';
  const width = (alongX ? w : d) * blockSize;
  const height = h * blockSize;
  const panelX = onBodyFace ? x + (entity.facing === 'e' ? w : 0) : x + w / 2;
  const panelZ = onBodyFace ? z + (entity.facing === 's' ? d : 0) : z + d / 2;
  const panelOffset = bodyFacePanelOffset(entity.facing, onBodyFace);
  const openTurn = doorPanelTurn(entity, onBodyFace);
  return alongX
    ? {
        pivot: [x * blockSize, y * blockSize, panelZ * blockSize],
        center: [width / 2, height / 2, panelOffset],
        size: [width, height, DOOR_PANEL_THICKNESS],
        rotationY: openTurn,
      }
    : {
        pivot: [panelX * blockSize, y * blockSize, z * blockSize],
        center: [panelOffset, height / 2, width / 2],
        size: [DOOR_PANEL_THICKNESS, height, width],
        rotationY: openTurn,
      };
};

/** A hatch's panel: flat across the top of its cells while shut, upright on its hinge edge (its facing side) when open. */
const hatchPanel = (entity: BlockEntity, blockSize: number): DoorPanelBox => {
  const w = entity.size[0] * blockSize;
  const h = entity.size[1] * blockSize;
  const d = entity.size[2] * blockSize;
  const t = DOOR_PANEL_THICKNESS;
  const pivot: Vec3 = [entity.pos[0] * blockSize, entity.pos[1] * blockSize, entity.pos[2] * blockSize];
  if (!entity.open) {
    return { pivot, center: [w / 2, h - t / 2, d / 2], size: [w, t, d], rotationY: 0 };
  }
  const upright: Record<Facing, Pick<DoorPanelBox, 'center' | 'size'>> = {
    n: { center: [w / 2, h + d / 2, t / 2], size: [w, d, t] },
    s: { center: [w / 2, h + d / 2, d - t / 2], size: [w, d, t] },
    e: { center: [w - t / 2, h + w / 2, d / 2], size: [t, w, d] },
    w: { center: [t / 2, h + w / 2, d / 2], size: [t, w, d] },
  };
  return { pivot, ...upright[entity.facing], rotationY: 0 };
};

/** The panel a door shows and is picked by: a hatch's, or an upright door's. */
export const panelFor = (entity: BlockEntity, definition: FurnitureDef, blockSize: number): DoorPanelBox =>
  definition.door?.hatch ? hatchPanel(entity, blockSize) : doorPanel(entity, blockSize, isBodyDoor(definition));

export const searchTime = (def: FurnitureDef, { search }: InventoryTuningDef): number => {
  const cells = (def.container?.pockets ?? []).reduce((sum, p) => sum + p.grid[0] * p.grid[1], 0);
  return search.minSimSeconds + (search.maxSimSeconds - search.minSimSeconds) * Math.min(1, cells / search.cellsForMax);
};

/**
 * A door that is the front of a shaped container (a cabinet, a safe): its cells are the furniture's body, so they
 * stay solid when it is open. Any other door is a leaf in a doorway, however it is shaped.
 */
export const isBodyDoor = (def: FurnitureDef): boolean =>
  def.door !== undefined && def.shape !== undefined && def.container !== undefined;

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** Whether a body's box overlaps any cell of a box of cells at a corner. */
export const boxIntersectsBody = (pos: Readonly<Vec3>, size: Readonly<Vec3>, body: Body): boolean =>
  [...cellsOf(size)].some(([x, y, z]) => bodyOverlapsBlock(body, [pos[0] + x, pos[1] + y, pos[2] + z]));

export class BlockEntities {
  readonly registry: Registry;
  private readonly byOrigin = new Map<string, BlockEntity>();
  private readonly cells = new Map<string, BlockEntity>();
  /** Doorway cells, kept apart so a piece can stand in an open door's cells while the door stays there. */
  private readonly doorways = new Map<string, BlockEntity>();
  private nextUid = 1;
  /** Goes up on every change, so views know when to redraw. */
  version = 0;

  constructor(registry: Registry) {
    this.registry = registry;
  }

  /** The pieces standing in the world; a carried piece is in the player's hands instead. */
  get all(): IterableIterator<BlockEntity> {
    return [...this.byOrigin.values()].filter((entity) => !entity.carried).values();
  }

  /** Every piece, the carried one too, so what it holds stays owned while it travels. */
  get records(): IterableIterator<BlockEntity> {
    return this.byOrigin.values();
  }

  get next(): number {
    return this.nextUid;
  }

  byUid(uid: number): BlockEntity | undefined {
    return [...this.byOrigin.values()].find((entity) => entity.uid === uid);
  }

  /** The piece in the player's hands. */
  carrying(): BlockEntity | undefined {
    return [...this.byOrigin.values()].find((entity) => entity.carried);
  }

  snapshotState(): Readonly<BlockEntitiesState> {
    return freezeSnapshot({
      nextUid: this.nextUid,
      entities: [...this.byOrigin.values()].map((entity) => ({
        uid: entity.uid,
        type: entity.type,
        origin: [...entity.origin],
        pos: [...entity.pos],
        size: [...entity.size],
        facing: entity.facing,
        ...(entity.tip ? { tip: entity.tip } : {}),
        ...(entity.carried ? { carried: true as const } : {}),
        ...(entity.fixed ? { fixed: true as const } : {}),
        searched: entity.searched,
        open: entity.open,
        ...(entity.lock ? { lock: { ...entity.lock } } : {}),
        ...(entity.pockets === undefined ? {} : { pockets: entity.pockets.map((grid) => grid.map(snapshotPlaced)) }),
      })),
    });
  }

  restoreState(state: BlockEntitiesState): void {
    const restored = BlockEntities.restoreState(this.registry, state);
    this.byOrigin.clear();
    this.cells.clear();
    this.doorways.clear();
    for (const [origin, entity] of restored.byOrigin) {
      this.byOrigin.set(origin, entity);
    }
    for (const [cell, entity] of restored.cells) {
      this.cells.set(cell, entity);
    }
    for (const [cell, entity] of restored.doorways) {
      this.doorways.set(cell, entity);
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
      if (saved.carried && entities.carrying()) {
        throw new Error('Only one block entity can be carried');
      }
      entities.restoreEntity(saved);
    }
    const maxUid = [...ids].reduce((max, uid) => Math.max(max, uid), 0);
    if (!Number.isSafeInteger(state.nextUid) || state.nextUid <= maxUid) {
      throw new Error('Invalid next block entity id');
    }
    entities.nextUid = state.nextUid;
    return entities;
  }

  private restoreEntity(saved: BlockEntityState): void {
    const entity = this.addWithUid(saved, saved.uid, saved.origin);
    if (!entity) {
      throw new Error(`Duplicate block entity origin ${saved.origin.join(',')}`);
    }
    entity.searched = saved.searched;
    if (saved.open && entity.lock?.locked) {
      throw new Error('A locked door cannot be open');
    }
    entity.open = saved.open;
    if (saved.pockets) {
      entity.pockets = saved.pockets.map((grid) => grid.map((placed) => restorePlaced(this.registry, placed)));
    }
  }

  defOf(entity: BlockEntity): FurnitureDef {
    return this.registry.furniture.get(entity.type)!;
  }

  /**
   * Adds a piece of furniture. A spec whose origin is already claimed is ignored and
   * returns undefined, so a column that generates again doesn't bring back a piece
   * the player moved away.
   */
  add(spec: EntitySpec): BlockEntity | undefined {
    const entity = this.addWithUid(spec, this.nextUid, spec.pos);
    if (entity) {
      this.nextUid += 1;
    }
    return entity;
  }

  private addWithUid(
    spec: EntitySpec & { carried?: true },
    uid: number,
    originAt: Readonly<Vec3>,
  ): BlockEntity | undefined {
    const origin = key(...originAt);
    if (this.byOrigin.has(origin)) {
      return undefined;
    }
    const def = this.registry.furniture.get(spec.type);
    if (!def) {
      throw new Error(`content does not define furniture "${spec.type}"`);
    }
    const entity: BlockEntity = {
      uid,
      type: spec.type,
      origin: [...originAt],
      pos: [...spec.pos],
      size: [...spec.size],
      facing: spec.facing,
      ...(spec.tip ? { tip: spec.tip } : {}),
      carried: spec.carried === true,
      ...(spec.fixed ? { fixed: true as const } : {}),
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
    this.byOrigin.set(origin, entity);
    if (!entity.carried) {
      this.occupy(entity, true);
    }
    this.version += 1;
    return entity;
  }

  private occupy(entity: BlockEntity, filled: boolean): void {
    const [x0, y0, z0] = entity.pos;
    const cells = this.inDoorway(entity) ? this.doorways : this.cells;
    for (const [x, y, z] of cellsOf(entity.size)) {
      const cell = key(x0 + x, y0 + y, z0 + z);
      if (filled) {
        cells.set(cell, entity);
      } else if (cells.get(cell) === entity) {
        cells.delete(cell);
      }
    }
  }

  /**
   * An upright door that swings out of its cells: open, they are a passage, which a piece may barricade. A body
   * door's panel stays in its cells, and an open hatch is a drop, so both keep their cells to themselves.
   */
  private inDoorway(entity: BlockEntity): boolean {
    const def = this.defOf(entity);
    return def.door !== undefined && !def.door.hatch && !isBodyDoor(def);
  }

  /** Whether a standing piece keeps other pieces out of its cells: everything does but a door open in its doorway. */
  fills(entity: BlockEntity): boolean {
    return !(entity.open && this.inDoorway(entity));
  }

  /** Takes a standing piece out of its cells into the player's hands. */
  lift(entity: BlockEntity): void {
    if (entity.carried || this.carrying()) {
      throw new Error('Already carrying a block entity');
    }
    this.occupy(entity, false);
    entity.carried = true;
    this.version += 1;
  }

  /** Turns and tips the carried piece; its box follows, so fit and the put-down preview read the turned box. */
  orient(entity: BlockEntity, facing: Facing, tip: Tip | undefined): void {
    if (!entity.carried) {
      throw new Error('Only a carried block entity can be turned');
    }
    entity.size = pieceSize(tippedSize(this.defOf(entity).size, tip), facing);
    entity.facing = facing;
    entity.tip = tip;
    this.version += 1;
  }

  /** Whether any other piece covers a cell of a box at a corner. */
  covered(pos: Readonly<Vec3>, size: Readonly<Vec3>): boolean {
    return [...cellsOf(size)].some(([x, y, z]) => {
      const cell = key(pos[0] + x, pos[1] + y, pos[2] + z);
      const door = this.doorways.get(cell);
      return this.cells.has(cell) || (door !== undefined && this.fills(door));
    });
  }

  /** Stands the carried piece with its lowest corner at a cell; callers check the world there first. */
  place(entity: BlockEntity, pos: Readonly<Vec3>): void {
    if (!entity.carried || this.covered(pos, entity.size)) {
      throw new Error('Cannot place a block entity there');
    }
    entity.pos = [...pos];
    entity.carried = false;
    this.occupy(entity, true);
    this.version += 1;
  }

  /** Moves a standing piece straight down, for a piece whose support was taken. */
  drop(entity: BlockEntity, y: number): void {
    this.occupy(entity, false);
    entity.pos = [entity.pos[0], y, entity.pos[2]];
    this.occupy(entity, true);
    this.version += 1;
  }

  /** The entity covering a cell: a piece barricading a doorway, rather than its door. */
  at(x: number, y: number, z: number): BlockEntity | undefined {
    const cell = key(x, y, z);
    return this.cells.get(cell) ?? this.doorways.get(cell);
  }

  /** The door in a cell, even behind a piece barricading its doorway. */
  doorAt(x: number, y: number, z: number): BlockEntity | undefined {
    const cell = key(x, y, z);
    const entity = this.doorways.get(cell) ?? this.cells.get(cell);
    return entity && this.defOf(entity).door ? entity : undefined;
  }

  /** Whether an entity's cell stops movement: closed doors and solid furniture do. */
  blocks(entity: BlockEntity): boolean {
    const def = this.defOf(entity);
    return def.door && !isBodyDoor(def) ? !entity.open : def.solid !== false;
  }

  isSolid(x: number, y: number, z: number): boolean {
    const entity = this.at(x, y, z);
    return entity !== undefined && this.blocks(entity);
  }

  /** Whether a body's box overlaps any cell occupied by an entity. */
  bodyIntersects(entity: BlockEntity, body: Body): boolean {
    return !entity.carried && boxIntersectsBody(entity.pos, entity.size, body);
  }

  /** Close an open door only when neither the player nor any other body or piece occupies its cells. */
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
    if (this.inDoorway(entity) && this.covered(entity.pos, entity.size)) {
      return 'other';
    }
    this.setOpen(entity, false);
    return undefined;
  }

  /** Native eligibility shared by options and effects; key ids come from held definitions. */
  doorRefusal(entity: BlockEntity, operation: DoorOperation, keys: readonly string[], from?: Vec3): string | undefined {
    const { door } = this.defOf(entity);
    if (!door) {
      return "It isn't a door";
    }
    if (operation === 'open') {
      if (entity.open) {
        return "It's already open";
      }
      if (door.barredFrom && from && this.sideOf(entity, from) === door.barredFrom) {
        return "It's boarded up";
      }
      return entity.lock?.locked ? "It's locked" : undefined;
    }
    if (operation === 'close') {
      return entity.open ? undefined : "It's already closed";
    }
    return this.lockRefusal(entity, operation === 'lock', keys);
  }

  /** Which face of a door a point is on: the facing side is the front. */
  private sideOf(entity: BlockEntity, point: Vec3): 'front' | 'back' {
    const alongX = entity.facing === 'e' || entity.facing === 'w';
    const axis = alongX ? 0 : 2;
    const offset = point[axis]! - (entity.pos[axis]! + entity.size[axis]! / 2);
    return offset * FACE_OUTWARD[entity.facing] >= 0 ? 'front' : 'back';
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

  /** Prying destroys a closed padlock; the door remains unlocked and cannot be relocked. */
  breakLock(entity: BlockEntity): string | undefined {
    if (!(this.defOf(entity).door && entity.lock?.locked)) {
      return "There's no locked padlock to pry";
    }
    if (entity.open) {
      return 'Close the door first';
    }
    entity.lock = undefined;
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
