// Block entities (`packages/deadvox/DESIGN.md`, "Block entities"): furniture with state, such as a
// cupboard's contents or whether a door is open. Each is anchored at its lowest
// corner and spans a box of cells; every cell points back at it, so collision and
// ray casts find it from any of them. Worldgen claims a piece by the corner it
// spawned at, its origin, which stays claimed wherever the piece is carried.

import { BLUEPRINTS } from '../vehicles/catalogue.ts';
import { solidBlocks } from '../vehicles/solid.ts';
import { claimed } from './capabilities.ts';
import type { FurnitureDef, Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import { coreMessage } from './coreText.ts';
import { type DestructibleHit, resolveDestructibleHit } from './destructibleHit.ts';
import {
  baselinePart,
  type HousingOverride,
  type HousingSlotView,
  housingBlueprint,
  housingOverridesIssue,
  slotAccepts,
} from './housing.ts';
import {
  damageAtCondition,
  type Item,
  type ItemFactory,
  type ItemState,
  type Placed,
  type PlacedState,
  restoreItem,
  restorePlaced,
  snapshotItem,
  snapshotPlaced,
  weightOf,
} from './items.ts';
import { type Pose, rotatedSize, rotationOf, type Tip } from './orientation.ts';
import { type Body, bodyOverlapsBlock } from './physics.ts';
import { BLOCK_SIZE } from './scale.ts';
import type { DoorBoardingDef, DoorLockDef, InventoryTuningDef, PartBlueprintDef } from './schema.ts';
import { shapeBlocks } from './shapeSolid.ts';
import { freezeSnapshot } from './snapshotData.ts';
import { cellsOf, type Facing } from './templates.ts';
import { contentVehicleBlocks } from './vehicleShapeSolid.ts';
import { type WindowState, windowParts } from './windowParts.ts';
import { type DoorSide, placementCells } from './worldDestination.ts';

interface ChargingState {
  batteryUid: number;
  atGameMilliseconds: number;
}

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
  /** The face it lies on; on its bottom when absent. */
  tip?: Tip | undefined;
  /** Held in the player's hands, so it covers no cells. */
  carried: boolean;
  /** Carrying constrained to the height where it was picked up. */
  floorLocked?: true | undefined;
  /** Fastened where it stands, so it can't be moved. */
  readonly fixed?: true;
  /** One grid per pocket of the furniture's container. */
  pockets?: Placed[][];
  /** The world job on this piece, running or paused, which reserves it (`BlockEntities.useRefusal`). */
  work?: Item | undefined;
  /**
   * The housing slots an event changed, in blueprint order; every other slot is its baseline. Only `BlockEntities`
   * writes them; readers use `BlockEntities.housingView`.
   */
  housing?: readonly HousingOverride<Item>[] | undefined;
  charging?: ChargingState | undefined;
  /** A container's contents show once it's been searched. */
  searched: boolean;
  window?: WindowState | undefined;
  /** Doors only. */
  open: boolean;
  lock?: DoorLockDef | undefined;
  bar?: DoorBar | undefined;
  boarding?: DoorBoarding | undefined;
  /** Strength of the blows the piece has taken toward its breach durability; absent while intact. */
  damage?: number | undefined;
  /** A door beaten in: it stands open with no lock and can't be shut again. */
  broken?: true;
}

/** A bar across a door: the side it lies on, which alone opens the door and lifts the bar, and the item it is. */
interface DoorBar {
  side: DoorSide;
  item: string;
}

/** Boards nailed on one side of a door leaf, a `doorBoardings` id: their side determines the look, while either face refuses opening. */
interface DoorBoarding {
  side: DoorSide;
  type: string;
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
  floorLocked?: true;
  fixed?: true;
  searched: boolean;
  open: boolean;
  window?: WindowState;
  lock?: DoorLockDef;
  bar?: DoorBar;
  boarding?: DoorBoarding;
  damage?: number;
  broken?: true;
  pockets?: PlacedState[][];
  work?: ItemState;
  housing?: HousingOverride<ItemState>[];
  charging?: ChargingState;
}

export type DoorOperation = 'open' | 'close' | 'lock' | 'unlock' | 'bar' | 'unbar';

/**
 * What one blow did: nothing below the piece's minimum strength, else damage that may break a door leaf or ruin any
 * other piece, which its caller then destroys (`src/core/furnitureMove.ts`, `ruinFurniture`).
 */
export type BashOutcome = 'resisted' | 'damaged' | 'broken' | 'ruined';

export interface BlockEntitiesState {
  nextUid: number;
  /** The world seed untouched housing slots derive from, so every copy computes the same baselines. */
  seed?: number;
  entities: BlockEntityState[];
}

export interface EntitySpec {
  lock?: DoorLockDef;
  /** Boards an authored door starts with, as if a player had nailed them on that side. */
  boarding?: DoorBoarding;
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

/** A bar lying across a door's panel on its barred side, in the panel's frame (`doorPanel`), in metres. */
export const doorBarBox = (
  entity: BlockEntity,
  panel: DoorPanelBox,
  thickness: number,
): Pick<DoorPanelBox, 'center' | 'size'> => {
  const alongX = entity.facing === 'n' || entity.facing === 's';
  const across = alongX ? 2 : 0;
  const outward = FACE_OUTWARD[entity.facing] * (entity.bar?.side === 'back' ? -1 : 1);
  const center: Vec3 = [...panel.center];
  center[across] += (outward * (DOOR_PANEL_THICKNESS + thickness)) / 2;
  const size: Vec3 = [...panel.size];
  size[1] = thickness;
  size[across] = thickness;
  return { center, size };
};

/** The boards nailed on a door's boarded side, in the panel's frame (`doorPanel`), in metres, so they swing with it. */
export const doorBoardingBoxes = (
  entity: BlockEntity,
  panel: DoorPanelBox,
  boarding: DoorBoardingDef,
  blockSize: number,
): Pick<DoorPanelBox, 'center' | 'size'>[] => {
  if (!entity.boarding) {
    return [];
  }
  const alongX = entity.facing === 'n' || entity.facing === 's';
  const across = alongX ? 2 : 0;
  const outward = FACE_OUTWARD[entity.facing] * (entity.boarding.side === 'back' ? -1 : 1);
  const thickness = boarding.thicknessBlocks * blockSize;
  const [, height] = panel.size;
  const bottom = panel.center[1] - height / 2;
  return boarding.boards.map((board) => {
    const center: Vec3 = [...panel.center];
    center[across] += outward * (DOOR_PANEL_THICKNESS / 2 + thickness / 2);
    center[1] = bottom + (board.from + board.height / 2) * height;
    const size: Vec3 = [...panel.size];
    size[1] = board.height * height;
    size[across] = thickness;
    return { center, size };
  });
};

/** The panel a door shows and is picked by: a hatch's, or an upright door's. */
export const panelFor = (entity: BlockEntity, definition: FurnitureDef, blockSize: number): DoorPanelBox =>
  definition.door?.hatch ? hatchPanel(entity, blockSize) : doorPanel(entity, blockSize, isBodyDoor(definition));

export const searchTime = (def: FurnitureDef, { search }: InventoryTuningDef): number => {
  const cells = (def.container?.pockets ?? []).reduce((sum, p) => sum + (p.grid ? p.grid[0] * p.grid[1] : 0), 0);
  return search.minSimSeconds + (search.maxSimSeconds - search.minSimSeconds) * Math.min(1, cells / search.cellsForMax);
};

/**
 * A door that is the front of a shaped container (a cabinet, a safe): its cells are the furniture's body, so they
 * stay solid when it is open. Any other door is a leaf in a doorway, however it is shaped.
 */
export const isBodyDoor = (def: FurnitureDef): boolean =>
  def.door !== undefined && def.shape !== undefined && def.container !== undefined;

/**
 * Whether a kind of door can carry player boards: an upright doorway leaf that content hasn't boarded already. A
 * boarded side owns the boards' visible face; boarding refuses opening from either face. Admission, templates and saves share it.
 */
export const boardableDoor = (def: FurnitureDef): boolean =>
  def.door !== undefined && !def.door.hatch && !isBodyDoor(def) && def.door.barredFrom === undefined;

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const columnKey = (cx: number, cz: number) => `${cx},${cz}`;

/** Everything a piece's drawn look and blocking cells follow from, so a view can skip pieces that didn't change. */
export const poseKey = (entity: BlockEntity, wear = 0): string =>
  `${entity.pos}|${entity.size}|${entity.facing}|${entity.tip ?? ''}|${entity.open}|${entity.broken ?? false}|${entity.window ? `${entity.window.open}:${entity.window.pane}:${entity.window.damage}:${entity.window.latched}:${entity.window.frameRemnants}` : ''}|${wear}|${entity.bar?.side ?? ''}|${entity.boarding ? `${entity.boarding.side}:${entity.boarding.type}` : ''}`;

export interface BlockingBox {
  readonly pos: Readonly<Vec3>;
  readonly size: Readonly<Vec3>;
}

/** The offset of a cell's centre from the box's centre, in world blocks. */
const fromCentre = (entity: BlockEntity, [x, y, z]: Readonly<Vec3>): Vec3 =>
  [x, y, z].map((at, axis) => at + 0.5 - entity.pos[axis]! - entity.size[axis]! / 2) as Vec3;

/** The piece's own block, counted from its left, bottom and front, that a world cell lies in. */
const ownBlock = (entity: BlockEntity, size: Readonly<Vec3>, cell: Readonly<Vec3>): Vec3 => {
  const offset = fromCentre(entity, cell);
  return rotationOf(entity).map(
    (axis, own) => axis.reduce((sum, value, world) => sum + value * offset[world]!, 0) + size[own]! / 2 - 0.5,
  ) as Vec3;
};

/** The world cell a piece's own block lies in. */
const worldCell = (entity: BlockEntity, size: Readonly<Vec3>, block: Readonly<Vec3>): Vec3 => {
  const rotation = rotationOf(entity);
  return [0, 1, 2].map(
    (world) =>
      entity.pos[world]! +
      entity.size[world]! / 2 -
      0.5 +
      rotation.reduce((sum, axis, own) => sum + axis[world]! * (block[own]! + 0.5 - size[own]! / 2), 0),
  ) as Vec3;
};

/** The piece's own blocks that its drawn look fills, or undefined when the whole box blocks. */
const drawnBlocks = (
  def: FurnitureDef,
  registry: Registry,
  blockSize: number,
): readonly Readonly<Vec3>[] | undefined => {
  if (def.vehicle !== undefined) {
    return BLUEPRINTS[def.vehicle.blueprint] === undefined
      ? contentVehicleBlocks(registry, def.vehicle, def.size, blockSize)
      : solidBlocks(def.vehicle, def.size);
  }
  if (def.shape !== undefined && def.solidFill !== undefined) {
    return shapeBlocks(def.shape, def.solidFill);
  }
  return def.shape !== undefined && def.solid === false && def.door === undefined
    ? shapeBlocks(def.shape, 0)
    : undefined;
};

/** Whether a body's box overlaps any cell of a box of cells at a corner. */
export const boxIntersectsBody = (pos: Readonly<Vec3>, size: Readonly<Vec3>, body: Body): boolean =>
  [...cellsOf(size)].some(([x, y, z]) => bodyOverlapsBlock(body, [pos[0] + x, pos[1] + y, pos[2] + z]));

const leafState = (entity: BlockEntity): Pick<BlockEntityState, 'lock' | 'bar' | 'boarding' | 'damage' | 'broken'> => ({
  ...(entity.lock ? { lock: { ...entity.lock } } : {}),
  ...(entity.bar ? { bar: { ...entity.bar } } : {}),
  ...(entity.boarding ? { boarding: { ...entity.boarding } } : {}),
  ...(entity.damage === undefined ? {} : { damage: entity.damage }),
  ...(entity.broken ? { broken: true as const } : {}),
});

export class BlockEntities {
  readonly registry: Registry;
  private readonly byOrigin = new Map<string, BlockEntity>();
  private readonly cells = new Map<string, BlockEntity>();
  /** Doorway cells, kept apart so a piece can stand in an open door's cells while the door stays there. */
  private readonly doorways = new Map<string, BlockEntity>();
  private readonly masks = new WeakMap<FurnitureDef, ReadonlySet<string>>();
  private readonly boxes = new WeakMap<BlockEntity, { pose: string; boxes: readonly BlockingBox[] }>();
  /**
   * Derived from `byOrigin` and rebuilt on restore, never saved: every explored piece stays in memory, so a lookup
   * must not scan them all (`packages/deadvox/DESIGN.md`, "Edits persist").
   */
  private readonly uids = new Map<number, BlockEntity>();
  /** Each standing piece under every world column its cells reach into. */
  private readonly columns = new Map<string, Set<BlockEntity>>();
  /** Each piece's place in `byOrigin`, so a by-column lookup lists pieces in the order `all` does. */
  private readonly sequence = new Map<BlockEntity, number>();
  private sequenced = 0;
  /** Derived from the pieces' `carried`, never saved, so asking for the carried piece doesn't scan them all. */
  private held: BlockEntity | undefined;
  private nextUid = 1;
  private worldSeed: number | undefined;
  private windowLightAt = -1;
  private readonly windowLightCells = new Set<string>();
  /**
   * Derived, never saved: the piece each `standing` step after `journalFrom` changed, oldest first, so a view can
   * redraw only those (`standingChangesSince`).
   */
  private readonly journal: BlockEntity[] = [];
  private journalFrom = 0;
  /** Goes up on every change, so views know when to redraw. */
  version = 0;

  /**
   * `seed` is the world seed housing baselines derive from. A fixture without one can hold any piece but cannot read
   * a baseline part, so no part is ever drawn from a seed the save would not carry.
   */
  constructor(registry: Registry, seed?: number) {
    this.registry = registry;
    this.worldSeed = seed;
  }

  get seed(): number | undefined {
    return this.worldSeed;
  }

  /**
   * Goes up when the standing pieces' cells, poses or blocking change. Turning the carried piece, searching or a
   * lock leaves it, so collision and sky light don't rebuild for what can't change them.
   */
  get standing(): number {
    return this.journalFrom + this.journal.length;
  }

  /**
   * The pieces whose cells, pose or blocking changed since `standing` had the given value, repeats included; undefined
   * when the journal no longer reaches back that far, after a restore or for a reader far behind, so the reader must
   * look at every piece.
   */
  standingChangesSince(standing: number): readonly BlockEntity[] | undefined {
    return standing < this.journalFrom || standing > this.standing
      ? undefined
      : this.journal.slice(standing - this.journalFrom);
  }

  /**
   * The pieces standing in the world; a carried piece is in the player's hands instead. It walks the pieces lazily, so
   * a caller that adds or removes pieces on the way copies it first.
   */
  get all(): IterableIterator<BlockEntity> {
    return this.standingPieces();
  }

  private *standingPieces(): Generator<BlockEntity, undefined, undefined> {
    for (const entity of this.byOrigin.values()) {
      if (entity !== this.held) {
        yield entity;
      }
    }
  }

  /** Furniture's own content mass plus every item it contains. */
  massKg(entity: BlockEntity): number | undefined {
    const ownMassKg = this.defOf(entity).massKg;
    if (ownMassKg === undefined) {
      return undefined;
    }
    const contentsKg = (entity.pockets ?? [])
      .flat()
      .reduce((total, { item }) => total + weightOf(this.registry, item) / 1000, 0);
    return ownMassKg + contentsKg;
  }

  /** Every piece, the carried one too, so what it holds stays owned while it travels. */
  get records(): IterableIterator<BlockEntity> {
    return this.byOrigin.values();
  }

  get next(): number {
    return this.nextUid;
  }

  /** Origin claims survive movement; occupancy cannot identify an authored fixture behind a barricade. */
  atOrigin(origin: Readonly<Vec3>): BlockEntity | undefined {
    return this.byOrigin.get(key(...origin));
  }

  byUid(uid: number): BlockEntity | undefined {
    return this.uids.get(uid);
  }

  /**
   * The standing pieces whose cells reach into any world column that a box of points, in blocks, spans, in the order
   * `all` lists them. Columns are coarse, so callers still test each piece's own box.
   */
  near(low: Readonly<Vec3>, high: Readonly<Vec3>): BlockEntity[] {
    const found = new Set<BlockEntity>();
    for (let cx = toChunk(Math.floor(low[0])); cx <= toChunk(Math.floor(high[0])); cx++) {
      for (let cz = toChunk(Math.floor(low[2])); cz <= toChunk(Math.floor(high[2])); cz++) {
        for (const entity of this.columns.get(columnKey(cx, cz)) ?? []) {
          found.add(entity);
        }
      }
    }
    return this.listed(found);
  }

  /** Live pieces in the order `all` lists them. */
  listed(pieces: Iterable<BlockEntity>): BlockEntity[] {
    return [...pieces].sort((a, b) => this.sequence.get(a)! - this.sequence.get(b)!);
  }

  /** The piece in the player's hands. */
  carrying(): BlockEntity | undefined {
    return this.held;
  }

  /** Whether a piece stands in this world: live and not carried. */
  stands(entity: BlockEntity): boolean {
    return this.uids.get(entity.uid) === entity && entity !== this.held;
  }

  snapshotState(foodAt?: number): Readonly<BlockEntitiesState> {
    return this.stateOf([...this.byOrigin.values()], foodAt);
  }

  /** The pieces claiming these origins, as a state that restores on its own with the live allocator. */
  snapshotAt(origins: readonly Readonly<Vec3>[]): Readonly<BlockEntitiesState> {
    const found = new Set<BlockEntity>();
    for (const origin of origins) {
      const entity = this.byOrigin.get(key(...origin));
      if (entity) {
        found.add(entity);
      }
    }
    return this.stateOf([...found]);
  }

  private windowSnapshot(entity: BlockEntity): Pick<BlockEntityState, 'window'> {
    return entity.window ? { window: { ...entity.window } } : {};
  }

  private stateOf(entities: readonly BlockEntity[], foodAt?: number): Readonly<BlockEntitiesState> {
    return freezeSnapshot({
      nextUid: this.nextUid,
      ...(this.worldSeed === undefined ? {} : { seed: this.worldSeed }),
      entities: entities.map((entity) => ({
        uid: entity.uid,
        type: entity.type,
        origin: [...entity.origin],
        pos: [...entity.pos],
        size: [...entity.size],
        facing: entity.facing,
        ...(entity.tip ? { tip: entity.tip } : {}),
        ...(entity.carried ? { carried: true as const } : {}),
        ...(entity.floorLocked ? { floorLocked: true as const } : {}),
        ...(entity.fixed ? { fixed: true as const } : {}),
        searched: entity.searched,
        open: entity.open,
        ...leafState(entity),
        ...this.windowSnapshot(entity),
        ...(entity.charging ? { charging: { ...entity.charging } } : {}),
        ...(entity.pockets === undefined
          ? {}
          : { pockets: entity.pockets.map((grid) => grid.map((placed) => snapshotPlaced(placed, foodAt))) }),
        ...(entity.work === undefined ? {} : { work: snapshotItem(entity.work, foodAt) as ItemState }),
        ...this.housingSnapshot(entity, foodAt),
      })),
    });
  }

  private housingSnapshot(entity: BlockEntity, foodAt: number | undefined): Pick<BlockEntityState, 'housing'> {
    return entity.housing === undefined
      ? {}
      : {
          housing: entity.housing.map(({ slot, item }) =>
            item ? { slot, item: snapshotItem(item, foodAt) as ItemState } : { slot },
          ),
        };
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
    this.reindex();
    this.nextUid = restored.nextUid;
    this.worldSeed = restored.worldSeed;
    // A restored count could repeat one a view cached for another state, and the view would keep the stale state.
    this.version = Math.max(this.version, restored.version) + 1;
    // Every piece is new, so the journal restarts past every step a view could have drawn.
    this.journalFrom = this.standing + 1;
    this.journal.length = 0;
  }

  static restoreState(registry: Registry, state: BlockEntitiesState): BlockEntities {
    if (state.seed !== undefined && !Number.isSafeInteger(state.seed)) {
      throw new Error('Invalid block entity world seed');
    }
    const entities = new BlockEntities(registry, state.seed);
    const ids = new Set<number>();
    for (const saved of state.entities) {
      if (!Number.isSafeInteger(saved.uid) || saved.uid < 1 || ids.has(saved.uid)) {
        throw new Error(`Invalid or duplicate block entity id ${saved.uid}`);
      }
      ids.add(saved.uid);
      entities.validateCarry(saved);
      entities.restoreEntity(saved);
    }
    const maxUid = [...ids].reduce((max, uid) => Math.max(max, uid), 0);
    if (!Number.isSafeInteger(state.nextUid) || state.nextUid <= maxUid) {
      throw new Error('Invalid next block entity id');
    }
    entities.nextUid = state.nextUid;
    return entities;
  }

  private reindex(): void {
    this.uids.clear();
    this.columns.clear();
    this.sequence.clear();
    this.held = undefined;
    for (const entity of this.byOrigin.values()) {
      this.track(entity);
      if (!entity.carried) {
        this.index(entity, true);
      }
    }
  }

  private track(entity: BlockEntity): void {
    this.uids.set(entity.uid, entity);
    this.sequence.set(entity, this.sequenced);
    this.sequenced += 1;
    if (entity.carried) {
      this.held = entity;
    }
  }

  /** Inventory changes only restage pieces whose look depends on their contents. */
  contentsChanged(entity: BlockEntity): void {
    if (this.defOf(entity).stockAppearance) {
      this.version += 1;
      this.standingChanged(entity);
    }
  }

  /** Records a change to a piece's cells, pose or blocking: a `standing` step. */
  private standingChanged(entity: BlockEntity): void {
    this.journal.push(entity);
    if (this.journal.length > this.byOrigin.size) {
      // Past one step per piece, replaying the journal costs a reader more than looking at every piece.
      const dropped = Math.ceil(this.journal.length / 2);
      this.journal.splice(0, dropped);
      this.journalFrom += dropped;
    }
  }

  private index(entity: BlockEntity, filled: boolean): void {
    for (let cx = toChunk(entity.pos[0]); cx <= toChunk(entity.pos[0] + entity.size[0] - 1); cx++) {
      for (let cz = toChunk(entity.pos[2]); cz <= toChunk(entity.pos[2] + entity.size[2] - 1); cz++) {
        const column = columnKey(cx, cz);
        const pieces = this.columns.get(column);
        if (filled) {
          (pieces ?? this.columns.set(column, new Set()).get(column)!).add(entity);
        } else if (pieces?.delete(entity) && pieces.size === 0) {
          this.columns.delete(column);
        }
      }
    }
  }

  private validateCarry(saved: BlockEntityState): void {
    if (saved.floorLocked && !saved.carried) {
      throw new Error('Only a carried block entity can be floor locked');
    }
    if (saved.carried && this.carrying()) {
      throw new Error('Only one block entity can be carried');
    }
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
    this.restoreWindow(entity, saved.window);
    this.restoreDamage(entity, saved);
    if (saved.bar) {
      if (this.barRefusal(entity) || !this.registry.items.get(saved.bar.item)?.doorBar) {
        throw new Error('Invalid door bar');
      }
      entity.bar = { side: saved.bar.side, item: saved.bar.item };
    }
    if (saved.boarding) {
      this.restoreBoarding(entity, saved.boarding);
    }
    if (saved.pockets) {
      entity.pockets = saved.pockets.map((grid) => grid.map((placed) => restorePlaced(this.registry, placed)));
    }
    if (saved.work) {
      if (saved.carried) {
        throw new Error('A carried piece cannot hold a world job');
      }
      entity.work = restoreItem(this.registry, saved.work);
    }
    if (saved.charging) {
      this.restoreCharging(entity, saved.charging);
    }
    if (saved.housing) {
      this.restoreHousing(entity, saved.housing);
    }
  }

  private restoreHousing(entity: BlockEntity, saved: readonly HousingOverride<ItemState>[]): void {
    const issue = housingOverridesIssue(this.registry, entity.type, saved);
    if (issue) {
      throw new Error(`Invalid saved housing: ${issue}`);
    }
    entity.housing = saved.map(({ slot, item }) =>
      item ? { slot, item: restoreItem(this.registry, item) } : { slot },
    );
  }

  /**
   * A housing's slots as readers see them, deeply frozen and holding no live items: an untouched slot shows its
   * baseline part, computed without writing, so no observation changes what a snapshot or the next item id would be.
   */
  housingView(entity: BlockEntity): readonly HousingSlotView[] {
    const slots = housingBlueprint(this.registry, entity.type)?.slots ?? [];
    return Object.freeze(slots.map((slot) => this.slotView(entity, slot)));
  }

  private slotView(entity: BlockEntity, slot: PartBlueprintDef['slots'][number]): HousingSlotView {
    const override = entity.housing?.find((entry) => entry.slot === slot.id);
    const item = override?.item;
    const part = override
      ? item && Object.freeze({ type: item.type, condition: item.condition, uid: item.uid })
      : slot.initial && baselinePart(this.baselineSeed(), entity, slot);
    return Object.freeze(part ? { slot: slot.id, part } : { slot: slot.id });
  }

  private baselineSeed(): number {
    if (this.worldSeed === undefined) {
      throw new Error('Housing baseline needs a world seed; give these block entities one');
    }
    return this.worldSeed;
  }

  /**
   * Detaches a slot's part, the stored one or a baseline part materialised by `factory`, and records the slot as
   * removed. Its caller has already admitted where the part goes, so a refusal never reaches here.
   */
  takeHousingPart(entity: BlockEntity, slot: string, factory: ItemFactory): Item {
    const part = this.housingView(entity).find((view) => view.slot === slot)?.part;
    if (!part) {
      throw new Error(`Housing slot "${slot}" holds no part`);
    }
    const item =
      entity.housing?.find((entry) => entry.slot === slot)?.item ??
      factory.create(this.registry, part.type, 1, { condition: part.condition });
    this.overrideHousing(entity, slot, undefined);
    return item;
  }

  /** Fits a loose part its caller admitted into an empty slot. */
  fitHousingPart(entity: BlockEntity, slot: string, item: Item): void {
    const def = housingBlueprint(this.registry, entity.type)?.slots.find(({ id }) => id === slot);
    if (!def || this.housingView(entity).find((view) => view.slot === slot)?.part || !slotAccepts(def, item)) {
      throw new Error(`Housing slot "${slot}" cannot take "${item.type}"`);
    }
    this.overrideHousing(entity, slot, item);
  }

  /** Overrides stay once written, even when they match the baseline again: the event happened. */
  private overrideHousing(entity: BlockEntity, slot: string, item: Item | undefined): void {
    const order = (housingBlueprint(this.registry, entity.type)?.slots ?? []).map(({ id }) => id);
    entity.housing = [
      ...(entity.housing ?? []).filter((entry) => entry.slot !== slot),
      item ? { slot, item } : { slot },
    ].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
    this.version += 1;
  }

  /**
   * Boards saved on a boardable door, never beside a bar, so the door's opening side stays one answer. A broken leaf
   * keeps its boards: breaking it is how the street gets past them.
   */
  private restoreBoarding(entity: BlockEntity, { side, type }: DoorBoarding): void {
    if (
      !boardableDoor(this.defOf(entity)) ||
      entity.bar ||
      !this.registry.doorBoardings.has(type) ||
      (side !== 'front' && side !== 'back')
    ) {
      throw new Error('Invalid door boarding');
    }
    entity.boarding = { side, type };
  }

  private restoreWindow(entity: BlockEntity, saved: WindowState | undefined): void {
    const spec = this.defOf(entity).window;
    if (!spec) {
      if (saved !== undefined) {
        throw new Error('Window state on a non-window');
      }
      return;
    }
    if (
      !(
        saved &&
        typeof saved.open === 'boolean' &&
        typeof saved.latched === 'boolean' &&
        typeof saved.frameRemnants === 'boolean' &&
        (saved.pane === 'intact' || saved.pane === 'missing') &&
        Number.isFinite(saved.damage) &&
        saved.damage >= 0 &&
        (saved.pane === 'intact'
          ? saved.damage < spec.breakForce && !saved.frameRemnants
          : saved.damage === spec.breakForce) &&
        !(saved.open && saved.latched) &&
        !entity.open &&
        !entity.tip
      )
    ) {
      throw new Error('Invalid window state');
    }
    entity.window = { ...saved };
  }

  private restoreCharging(entity: BlockEntity, charging: ChargingState): void {
    entity.charging = { ...charging };
    const spec = this.registry.furniture.get(entity.type)?.charger;
    const grid = spec && entity.pockets?.[spec.pocket];
    if (
      !(spec && grid) ||
      grid.length !== 1 ||
      grid[0]!.item.uid !== charging.batteryUid ||
      grid[0]!.item.count !== 1 ||
      !spec.batteries.includes(grid[0]!.item.type) ||
      !Number.isSafeInteger(charging.atGameMilliseconds) ||
      charging.atGameMilliseconds < 0 ||
      entity.carried
    ) {
      throw new Error('Invalid saved charger ownership');
    }
  }

  private restoreDamage(entity: BlockEntity, { damage, broken }: BlockEntityState): void {
    if (damage !== undefined && !(Number.isFinite(damage) && damage > 0)) {
      throw new Error('Invalid furniture damage');
    }
    const { durability } = this.defOf(entity).breach;
    if (damage !== undefined && (this.breachable(entity) ? damage >= durability : damage > durability)) {
      throw new Error("A standing piece's damage must stay within its durability, and a door's below it");
    }
    if (!broken) {
      entity.damage = damage;
      return;
    }
    if (!this.breachable(entity)) {
      throw new Error('Only a door leaf can be broken');
    }
    if (!(entity.open && entity.lock === undefined)) {
      throw new Error('A broken door stands open without a lock');
    }
    entity.damage = damage;
    entity.broken = true;
  }

  defOf(entity: BlockEntity): FurnitureDef {
    return this.registry.furniture.get(entity.type)!;
  }

  /**
   * Adds a piece of furniture. A spec whose origin is already claimed is ignored and returns undefined. A moved or
   * removed piece stays away because a column is furnished once (`packages/engine/src/game/session.ts`, `rolledColumns`), not
   * because of this claim.
   */
  add(spec: EntitySpec): BlockEntity | undefined {
    const entity = this.addWithUid(spec, this.nextUid, spec.pos);
    if (entity) {
      this.nextUid += 1;
      if (spec.boarding) {
        this.restoreBoarding(entity, spec.boarding);
      }
    }
    return entity;
  }

  private addWithUid(
    spec: EntitySpec & { carried?: true; floorLocked?: true },
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
    const window = this.createWindow(spec, def);
    const entity: BlockEntity = {
      uid,
      type: spec.type,
      origin: [...originAt],
      pos: [...spec.pos],
      size: [...spec.size],
      facing: spec.facing,
      ...(spec.tip ? { tip: spec.tip } : {}),
      carried: spec.carried === true,
      ...(spec.floorLocked ? { floorLocked: true as const } : {}),
      ...(spec.fixed ? { fixed: true as const } : {}),
      searched: false,
      open: false,
      window,
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
    this.track(entity);
    if (!entity.carried) {
      this.occupy(entity, true);
    }
    this.version += 1;
    this.standingChanged(entity);
    return entity;
  }

  private createWindow(spec: EntitySpec, def: FurnitureDef): WindowState | undefined {
    if (!def.window) {
      return undefined;
    }
    if (
      spec.tip !== undefined ||
      !spec.size.every((extent, axis) => extent === rotatedSize(def.size, rotationOf(spec))[axis])
    ) {
      throw new Error('Invalid window aperture geometry');
    }
    return {
      open: false,
      latched: def.window.initialLatched,
      pane: def.window.initialPane,
      damage: def.window.initialPane === 'missing' ? def.window.breakForce : 0,
      frameRemnants: def.window.initialPane === 'missing',
    };
  }

  private occupy(entity: BlockEntity, filled: boolean): void {
    const cells = this.inDoorway(entity) ? this.doorways : this.cells;
    for (const pos of placementCells(entity)) {
      const cell = key(...pos);
      if (filled) {
        cells.set(cell, entity);
      } else if (cells.get(cell) === entity) {
        cells.delete(cell);
      }
    }
    this.index(entity, filled);
  }

  /**
   * An upright door that swings out of its cells: open, they are a passage, which a piece may barricade. A body
   * door's panel stays in its cells, and an open hatch is a drop, so both keep their cells to themselves.
   */
  private inDoorway(entity: BlockEntity): boolean {
    const def = this.defOf(entity);
    return def.window !== undefined || (def.door !== undefined && !def.door.hatch && !isBodyDoor(def));
  }

  /** Whether a standing piece keeps other pieces out of its cells: everything does but a door open in its doorway. */
  fills(entity: BlockEntity): boolean {
    return entity.window
      ? !entity.window.open && entity.window.pane === 'intact'
      : !(entity.open && this.inDoorway(entity));
  }

  /** Takes a standing piece out of its cells into the player's hands. */
  lift(entity: BlockEntity, floorLocked = false): void {
    if (entity.carried || this.carrying()) {
      throw new Error('Already carrying a block entity');
    }
    this.occupy(entity, false);
    entity.carried = true;
    this.held = entity;
    entity.floorLocked = floorLocked ? true : undefined;
    this.version += 1;
    this.standingChanged(entity);
  }

  /** Records a floor-drag step, so canceling a drag leaves the piece there. */
  moveCarried(entity: BlockEntity, pos: Readonly<Vec3>): void {
    if (!entity.carried) {
      throw new Error('Only a carried block entity can move');
    }
    if (entity.pos.every((value, axis) => value === pos[axis])) {
      return;
    }
    entity.pos = [...pos];
    this.version += 1;
  }

  /** Turns and tips the carried piece; its box follows, so fit and the put-down preview read the turned box. */
  orient(entity: BlockEntity, pose: Pose): void {
    if (!entity.carried) {
      throw new Error('Only a carried block entity can be turned');
    }
    entity.size = rotatedSize(this.defOf(entity).size, rotationOf(pose));
    entity.facing = pose.facing;
    entity.tip = pose.tip;
    this.version += 1;
  }

  /** Whether any other piece covers a cell of a box at a corner. */
  covered(pos: Readonly<Vec3>, size: Readonly<Vec3>): boolean {
    return [...placementCells({ pos: [...pos], size: [...size] })].some((cell) => this.filling(...cell) !== undefined);
  }

  /** The standing piece that keeps other pieces out of a cell, if any. */
  filling(x: number, y: number, z: number): BlockEntity | undefined {
    const cell = key(x, y, z);
    const piece = this.cells.get(cell);
    if (piece !== undefined) {
      return piece;
    }
    const door = this.doorways.get(cell);
    return door !== undefined && this.fills(door) ? door : undefined;
  }

  /** Stands the carried piece with its lowest corner at a cell; callers check the world there first. */
  place(entity: BlockEntity, pos: Readonly<Vec3>): void {
    if (!entity.carried || this.covered(pos, entity.size)) {
      throw new Error('Cannot place a block entity there');
    }
    entity.pos = [...pos];
    entity.carried = false;
    this.held = undefined;
    entity.floorLocked = undefined;
    this.occupy(entity, true);
    this.version += 1;
    this.standingChanged(entity);
  }

  /** Reindexes a standing floor step without ever claiming the player's hands. */
  slide(entity: BlockEntity, pos: Readonly<Vec3>): void {
    this.occupy(entity, false);
    entity.pos = [...pos];
    this.occupy(entity, true);
    this.version += 1;
    this.standingChanged(entity);
  }

  /** Moves a standing piece straight down, for a piece whose support was taken. */
  drop(entity: BlockEntity, y: number): void {
    this.occupy(entity, false);
    entity.pos = [entity.pos[0], y, entity.pos[2]];
    this.occupy(entity, true);
    this.version += 1;
    this.standingChanged(entity);
  }

  /**
   * Why a standing piece can't be taken out of the world by itself: it holds items, in its pockets or its housing
   * slots, untouched baseline parts included, or it is a door with a piece barricading its doorway. What rests on it
   * is the mover's to check (`src/core/furnitureMove.ts`, `removalRefusal`). See `packages/deadvox/DESIGN.md`,
   * "Edits persist".
   */
  removalRefusal(entity: BlockEntity): string | undefined {
    const messages = claimed(this.registry.ui, 'interface')!.furnitureMoveMessages;
    if (entity.pockets?.some((grid) => grid.length > 0) || this.housingView(entity).some(({ part }) => part)) {
      return messages.holdsItems;
    }
    const barricaded = this.inDoorway(entity) && [...placementCells(entity)].some((pos) => this.cells.has(key(...pos)));
    return barricaded ? messages.barricaded : undefined;
  }

  /**
   * Takes a standing piece out of the world for good. A handle from before a restore throws, since its cells now
   * belong to the restored piece; so does a piece `removalRefusal` refuses.
   */
  remove(entity: BlockEntity): void {
    if (this.byOrigin.get(key(...entity.origin)) !== entity) {
      throw new Error('Cannot remove a block entity that is no longer live');
    }
    if (entity.carried) {
      throw new Error('Cannot remove a carried block entity');
    }
    if (entity.work) {
      throw new Error('Cannot remove a block entity that holds a world job');
    }
    const refusal = this.removalRefusal(entity);
    if (refusal) {
      throw new Error(refusal);
    }
    this.unlink(entity);
  }

  /**
   * Takes a ruined piece out of the world for good, and its pockets with it; the caller lays what they held on
   * piles (`src/core/furnitureMove.ts`, `ruinFurniture`): a blow can't be refused, so the removal refusals don't apply
   * (`packages/deadvox/DESIGN.md`, "Edits persist").
   */
  destroy(entity: BlockEntity): void {
    if (this.byOrigin.get(key(...entity.origin)) !== entity || entity.carried) {
      throw new Error('Only a live standing block entity can be destroyed');
    }
    this.unlink(entity);
  }

  private unlink(entity: BlockEntity): void {
    this.occupy(entity, false);
    this.byOrigin.delete(key(...entity.origin));
    this.uids.delete(entity.uid);
    this.sequence.delete(entity);
    this.version += 1;
    this.standingChanged(entity);
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
    if (entity.window) {
      return true;
    }
    return def.door && !isBodyDoor(def) ? !entity.open : def.solid !== false;
  }

  nonWindowSolid(x: number, y: number, z: number): boolean {
    const entity = this.at(x, y, z);
    return entity !== undefined && !entity.window && this.blocks(entity) && this.hasPartAt(x, y, z);
  }

  isSolid(x: number, y: number, z: number): boolean {
    const entity = this.at(x, y, z);
    const opening = this.doorways.get(key(x, y, z));
    return (
      (entity !== undefined && this.blocks(entity) && this.hasPartAt(x, y, z)) ||
      (opening !== undefined && opening !== entity && this.windowBlocksCell(opening, x, y, z))
    );
  }

  /** Whether the entity covering a cell has a part there: a vehicle's or shaped piece's only where it is drawn. */
  hasPartAt(x: number, y: number, z: number): boolean {
    const entity = this.at(x, y, z);
    if (entity === undefined) {
      return false;
    }
    const def = this.defOf(entity);
    if (entity.window) {
      return this.windowBlocksCell(entity, x, y, z);
    }
    const mask = this.mask(def);
    if (mask === undefined) {
      return true;
    }
    if (entity.pos.every(Number.isInteger)) {
      return mask.has(ownBlock(entity, def.size, [x, y, z]).join(','));
    }
    return this.blockingBoxes(entity).some(
      ({ pos, size }) =>
        pos[0] < x + 1 &&
        pos[0] + size[0] > x &&
        pos[1] < y + 1 &&
        pos[1] + size[1] > y &&
        pos[2] < z + 1 &&
        pos[2] + size[2] > z,
    );
  }

  /** A fitted opening with collision in this cell, even behind furniture in its doorway. */
  windowCollisionAt(x: number, y: number, z: number): BlockEntity | undefined {
    const entity = this.doorways.get(key(x, y, z));
    return entity?.window && this.windowBlocksCell(entity, x, y, z) ? entity : undefined;
  }

  private windowBlocksCell(entity: BlockEntity, x: number, y: number, z: number): boolean {
    const state = entity.window;
    const spec = this.defOf(entity).window;
    if (!(state && spec)) {
      return false;
    }
    const alongX = entity.facing === 'n' || entity.facing === 's';
    const across = (alongX ? x : z) - entity.pos[alongX ? 0 : 2];
    const up = y - entity.pos[1];
    const width = entity.size[alongX ? 0 : 2];
    const rim = spec.frameWidthBlocks + (state.open ? 0 : spec.sashWidthBlocks);
    return (
      across < rim ||
      across + 1 > width - rim ||
      up < rim ||
      up + 1 > entity.size[1] - rim ||
      (!state.open && state.pane === 'intact')
    );
  }

  obstructs(x: number, y: number, z: number, _channel: 'sight' | 'light'): boolean {
    const cell = key(x, y, z);
    if (this.windowLightAt !== this.standing) {
      this.windowLightCells.clear();
      for (const entity of this.all) {
        if (entity.window) {
          for (const { pos } of this.lightBlockingBoxes(entity)) {
            this.windowLightCells.add(key(...pos));
          }
        }
      }
      this.windowLightAt = this.standing;
    }
    return (
      this.windowLightCells.has(cell) ||
      [this.cells.get(cell), this.doorways.get(cell)].some(
        (entity) => entity && !entity.window && this.blocks(entity) && this.hasPartAt(x, y, z),
      )
    );
  }

  lightBlockingBoxes(entity: BlockEntity): readonly BlockingBox[] {
    if (!entity.window) {
      return this.blockingBoxes(entity);
    }
    const cells = new Map<string, BlockingBox>();
    for (const { kind, box } of windowParts(entity, this.defOf(entity), 1)) {
      if (kind === 'pane') {
        continue;
      }
      const c = Math.cos(box.rotationY);
      const s = Math.sin(box.rotationY);
      const center: Vec3 = [
        box.pivot[0] + c * box.center[0] + s * box.center[2],
        box.pivot[1] + box.center[1],
        box.pivot[2] - s * box.center[0] + c * box.center[2],
      ];
      const size: Vec3 = [
        Math.abs(c) * box.size[0] + Math.abs(s) * box.size[2],
        box.size[1],
        Math.abs(s) * box.size[0] + Math.abs(c) * box.size[2],
      ];
      const low = center.map((value, axis) => Math.floor(value - size[axis]! / 2 + 1e-9));
      const high = center.map((value, axis) => Math.ceil(value + size[axis]! / 2 - 1e-9));
      for (let x = low[0]!; x < high[0]!; x++) {
        for (let y = low[1]!; y < high[1]!; y++) {
          for (let z = low[2]!; z < high[2]!; z++) {
            cells.set(key(x, y, z), { pos: [x, y, z], size: [1, 1, 1] });
          }
        }
      }
    }
    return [...cells.values()];
  }

  /** Grid consumers stay conservative; fitted-aperture body clearance follows its thin rails instead. */
  blockingBoxes(entity: BlockEntity): readonly BlockingBox[] {
    const pose = poseKey(entity);
    const cached = this.boxes.get(entity);
    if (cached?.pose === pose) {
      return cached.boxes;
    }
    const boxes = this.blockingBoxesOf(entity);
    this.boxes.set(entity, { pose, boxes });
    return boxes;
  }

  private blockingBoxesOf(entity: BlockEntity): readonly BlockingBox[] {
    if (!this.blocks(entity)) {
      return [];
    }
    const def = this.defOf(entity);
    if (entity.window) {
      return [...placementCells(entity)]
        .filter(([x, y, z]) => this.windowBlocksCell(entity, x, y, z))
        .map((pos) => ({ pos, size: [1, 1, 1] as Vec3 }));
    }
    const mask = this.mask(def);
    if (mask === undefined) {
      return [{ pos: [...entity.pos], size: [...entity.size] }];
    }
    return [...mask].map((block) => ({
      pos: worldCell(entity, def.size, block.split(',').map(Number) as Vec3),
      size: [1, 1, 1],
    }));
  }

  private mask(def: FurnitureDef): ReadonlySet<string> | undefined {
    let mask = this.masks.get(def);
    if (mask === undefined) {
      const blocks = drawnBlocks(def, this.registry, BLOCK_SIZE);
      if (blocks === undefined) {
        return undefined;
      }
      mask = new Set(blocks.map((block) => block.join(',')));
      this.masks.set(def, mask);
    }
    return mask;
  }

  /** Whether a body's box overlaps any cell occupied by an entity. */
  bodyIntersects(entity: BlockEntity, body: Body): boolean {
    return !entity.carried && boxIntersectsBody(entity.pos, entity.size, body);
  }

  /** Close an open door only when neither the player nor any other body or piece occupies its cells. */
  closeDoor(entity: BlockEntity, player: Body, otherBodies: Iterable<Body>): 'player' | 'other' | undefined {
    if (!(this.defOf(entity).door && entity.open) || entity.broken) {
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

  windowRefusal(
    entity: BlockEntity,
    operation: 'open' | 'close' | 'latch' | 'unlatch',
    from: Vec3,
  ): string | undefined {
    const state = entity.window;
    const spec = this.defOf(entity).window;
    if (!(state && spec)) {
      return coreMessage(this.registry, 'notWindow');
    }
    if (operation === 'open') {
      if (state.open) {
        return coreMessage(this.registry, 'alreadyOpen');
      }
      return state.latched ? coreMessage(this.registry, 'windowLatched') : undefined;
    }
    if (operation === 'close') {
      return state.open ? undefined : coreMessage(this.registry, 'alreadyClosed');
    }
    return this.windowLatchRefusal(entity, operation, from);
  }

  private windowLatchRefusal(entity: BlockEntity, operation: 'latch' | 'unlatch', from: Vec3): string | undefined {
    const state = entity.window!;
    const spec = this.defOf(entity).window!;
    if (this.sideOf(entity, from) !== spec.inside && state.pane === 'intact') {
      return coreMessage(this.registry, 'windowLatchInside');
    }
    if (state.open) {
      return coreMessage(this.registry, 'windowOpen');
    }
    return state.latched === (operation === 'latch')
      ? coreMessage(this.registry, operation === 'latch' ? 'windowLatched' : 'windowUnlatched')
      : undefined;
  }

  operateWindow(
    entity: BlockEntity,
    operation: 'open' | 'close' | 'latch' | 'unlatch',
    from: Vec3,
    bodies: Iterable<Body>,
  ): string | undefined {
    const reason = this.useRefusal(entity) ?? this.windowRefusal(entity, operation, from);
    if (reason) {
      return reason;
    }
    if (
      operation === 'close' &&
      ([...bodies].some((body) => this.bodyIntersects(entity, body)) ||
        [...placementCells(entity)].some((pos) => this.cells.has(key(...pos))))
    ) {
      return coreMessage(this.registry, 'windowOccupied');
    }
    const state = entity.window!;
    if (operation === 'open' || operation === 'close') {
      state.open = operation === 'open';
    } else {
      state.latched = operation === 'latch';
    }
    this.version += 1;
    this.standingChanged(entity);
    return undefined;
  }

  hitWindowPane(entity: BlockEntity, hit: DestructibleHit): ReturnType<typeof resolveDestructibleHit> | undefined {
    const state = entity.window;
    const spec = this.defOf(entity).window;
    if (!(this.stands(entity) && state && spec && state.pane === 'intact')) {
      return undefined;
    }
    const result = resolveDestructibleHit(state.damage, hit, spec);
    state.damage = result.damage;
    if (result.outcome === 'broken') {
      state.pane = 'missing';
      state.frameRemnants = true;
    }
    this.version += 1;
    this.standingChanged(entity);
    return result;
  }

  /** Native eligibility shared by options and effects; key ids come from held definitions. */
  doorRefusal(entity: BlockEntity, operation: DoorOperation, keys: readonly string[], from?: Vec3): string | undefined {
    const { door } = this.defOf(entity);
    if (!door) {
      return coreMessage(this.registry, 'notDoor');
    }
    switch (operation) {
      case 'open':
        return this.openRefusal(entity, door, from);
      case 'close':
        return this.closeRefusal(entity);
      case 'bar':
        return (
          this.barRefusal(entity) ??
          (entity.open
            ? coreMessage(this.registry, 'barDoorOpen')
            : entity.bar && coreMessage(this.registry, 'alreadyBarred'))
        );
      case 'unbar':
        return this.unbarRefusal(entity, from);
      default:
        return this.lockRefusal(entity, operation === 'lock', keys);
    }
  }

  private openRefusal(
    entity: BlockEntity,
    door: NonNullable<FurnitureDef['door']>,
    from: Vec3 | undefined,
  ): string | undefined {
    if (entity.open) {
      return coreMessage(this.registry, 'alreadyOpen');
    }
    if (door.barredFrom || entity.boarding) {
      return coreMessage(this.registry, 'boardedUp');
    }
    if (entity.bar && from) {
      return this.sideOf(entity, from) === entity.bar.side
        ? coreMessage(this.registry, 'liftBarFirst')
        : coreMessage(this.registry, 'barredOtherSide');
    }
    if (door.hatch && this.lyingOn(entity)) {
      return claimed(this.registry.ui, 'interface')!.furnitureMoveMessages.hatchCovered;
    }
    return entity.lock?.locked ? coreMessage(this.registry, 'locked') : undefined;
  }

  private unbarRefusal(entity: BlockEntity, from: Vec3 | undefined): string | undefined {
    if (!entity.bar) {
      return coreMessage(this.registry, 'notBarred');
    }
    return from && this.sideOf(entity, from) === entity.bar.side
      ? undefined
      : coreMessage(this.registry, 'barredOtherSide');
  }

  /** Why a door can't hold a bar at all, open or shut: a hatch, a cabinet's front, a broken or boarded-up leaf. */
  private barRefusal(entity: BlockEntity): string | undefined {
    if (!this.leafDoor(entity)) {
      return coreMessage(this.registry, 'cantBar');
    }
    if (entity.broken) {
      return coreMessage(this.registry, 'broken');
    }
    return this.defOf(entity).door!.barredFrom || entity.boarding ? coreMessage(this.registry, 'boardedUp') : undefined;
  }

  /** An upright doorway leaf: not a hatch or a cabinet's front, so a bar or boards can lie across it. */
  private leafDoor(entity: BlockEntity): boolean {
    const def = this.defOf(entity);
    return def.door !== undefined && !def.door.hatch && !isBodyDoor(def);
  }

  /**
   * Why boards can't be nailed on this door now: not an upright leaf, broken, barred, or boarded already. Boards hang
   * on the leaf, so an open door can take them and they swing with it.
   */
  boardingRefusal(entity: BlockEntity): string | undefined {
    const def = this.defOf(entity);
    if (!boardableDoor(def)) {
      return coreMessage(this.registry, def.door?.barredFrom ? 'alreadyBoarded' : 'cantBoard');
    }
    if (entity.broken) {
      return coreMessage(this.registry, 'broken');
    }
    if (entity.boarding) {
      return coreMessage(this.registry, 'alreadyBoarded');
    }
    return entity.bar ? coreMessage(this.registry, 'liftBarFirst') : undefined;
  }

  /** Nails boards of a `doorBoardings` type on one side of a door; that side controls their look and either face refuses opening. */
  board(entity: BlockEntity, side: DoorSide, type: string): string | undefined {
    const reason = this.boardingRefusal(entity);
    if (reason) {
      return reason;
    }
    if (!this.registry.doorBoardings.has(type)) {
      throw new Error(`Unknown door boarding "${type}"`);
    }
    entity.boarding = { side, type };
    this.version += 1;
    this.standingChanged(entity);
    return undefined;
  }

  private closeRefusal(entity: BlockEntity): string | undefined {
    if (entity.broken) {
      return coreMessage(this.registry, 'broken');
    }
    return entity.open ? undefined : coreMessage(this.registry, 'alreadyClosed');
  }

  /** Whether a piece lies on the cells just above a hatch, where its lid would swing. */
  private lyingOn(hatch: BlockEntity): boolean {
    const above: Vec3 = [hatch.pos[0], hatch.pos[1] + hatch.size[1], hatch.pos[2]];
    return this.covered(above, [hatch.size[0], 1, hatch.size[2]]);
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
      return coreMessage(this.registry, 'noLock');
    }
    if (entity.open) {
      return coreMessage(this.registry, 'doorOpen');
    }
    if (keys.length === 0) {
      return coreMessage(this.registry, 'noKey');
    }
    if (!keys.includes(entity.lock.id)) {
      return coreMessage(this.registry, 'wrongKey');
    }
    return entity.lock.locked === locked
      ? coreMessage(this.registry, locked ? 'alreadyLocked' : 'alreadyUnlocked')
      : undefined;
  }

  /** Use closeDoor for a gameplay close, which also checks occupying bodies. */
  setOpen(entity: BlockEntity, open: boolean): string | undefined {
    const reason = open ? this.doorRefusal(entity, 'open', []) : entity.broken && this.doorRefusal(entity, 'close', []);
    if (reason) {
      return reason;
    }
    entity.open = open;
    this.version += 1;
    this.standingChanged(entity);
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

  /** Drops a bar of item type `item` across a shut door on the side `from` stands on. */
  setBar(entity: BlockEntity, from: Vec3, item: string): string | undefined {
    const reason = this.doorRefusal(entity, 'bar', [], from);
    if (reason) {
      return reason;
    }
    entity.bar = { side: this.sideOf(entity, from), item };
    this.version += 1;
    this.standingChanged(entity);
    return undefined;
  }

  /** Lifts the bar from its own side; returns the bar's item type, or why not. */
  liftBar(entity: BlockEntity, from: Vec3): { item: string } | { reason: string } {
    const reason = this.doorRefusal(entity, 'unbar', [], from);
    if (reason) {
      return { reason };
    }
    const { item } = entity.bar!;
    entity.bar = undefined;
    this.version += 1;
    this.standingChanged(entity);
    return { item };
  }

  /** Prying destroys a closed padlock; the door remains unlocked and cannot be relocked. */
  breakLock(entity: BlockEntity): string | undefined {
    if (!(this.defOf(entity).door && entity.lock?.locked)) {
      return coreMessage(this.registry, 'noPadlock');
    }
    if (entity.open) {
      return coreMessage(this.registry, 'doorOpen');
    }
    entity.lock = undefined;
    this.version += 1;
    return undefined;
  }

  /** A piece that stops movement and a body's box overlaps, such as the door or crate an actor presses against. */
  pieceTouching(body: Body): BlockEntity | undefined {
    const halfDepth = body.halfDepth ?? body.halfWidth;
    const [px, py, pz] = body.pos;
    for (let x = Math.floor(px - body.halfWidth); x <= Math.floor(px + body.halfWidth); x++) {
      for (let y = Math.floor(py); y <= Math.floor(py + body.height); y++) {
        for (let z = Math.floor(pz - halfDepth); z <= Math.floor(pz + halfDepth); z++) {
          if (this.isSolid(x, y, z) && bodyOverlapsBlock(body, [x, y, z])) {
            return this.at(x, y, z);
          }
        }
      }
    }
    return undefined;
  }

  /** A leaf that blows can break: an upright door or a hatch, not a cabinet's front, whose body stays standing. */
  breachable(entity: BlockEntity): boolean {
    const def = this.defOf(entity);
    return def.door !== undefined && !isBodyDoor(def);
  }

  /**
   * How many of its material's damage looks a piece has reached, 0 when none; a view redraws a piece when this
   * changes, not on every blow (`FurnitureMeshes.damageLook`).
   */
  wearOf(entity: BlockEntity): number {
    const { material, breach } = this.defOf(entity);
    const steps = this.registry.furnitureMaterials.get(material)?.damaged;
    if (!(steps && entity.damage)) {
      return 0;
    }
    const fraction = entity.damage / breach.durability;
    return steps.filter((step) => step.from <= fraction).length;
  }

  /**
   * Worldgen's way to place a piece already worn: sets its damage to a share of its durability. The share stays below
   * 1 because a ruined piece is gone, and worldgen never places one.
   */
  wear(entity: BlockEntity, share: number): void {
    if (!(Number.isFinite(share) && share >= 0 && share < 1)) {
      throw new Error('Worn share must be at least 0 and below 1');
    }
    const worn = this.wearOf(entity);
    entity.damage = share === 0 ? undefined : share * this.defOf(entity).breach.durability;
    this.version += 1;
    if (this.wearOf(entity) !== worn) {
      this.standingChanged(entity);
    }
  }

  /** The share of its durability a piece has left, from 1 intact to 0 broken; derived from damage, never stored. */
  conditionOf(entity: BlockEntity): number {
    return entity.broken ? 0 : Math.max(0, 1 - (entity.damage ?? 0) / this.defOf(entity).breach.durability);
  }

  /** The damage left after a repair of `amount` damage points, held at the repair's condition `ceiling`. */
  private repairedDamage(entity: BlockEntity, amount: number, ceiling: number): number {
    const { durability } = this.defOf(entity).breach;
    const damage = entity.damage ?? 0;
    return Math.min(damage, Math.max(damageAtCondition(ceiling, durability), damage - amount));
  }

  /** The condition a repair of `amount` damage points would leave, as `repair` applies it. */
  conditionAfterRepair(entity: BlockEntity, amount: number, ceiling: number): number {
    return entity.broken
      ? 0
      : Math.max(0, 1 - this.repairedDamage(entity, amount, ceiling) / this.defOf(entity).breach.durability);
  }

  canRepair(entity: BlockEntity, amount: number, ceiling: number): boolean {
    if (
      !(Number.isFinite(amount) && amount > 0) ||
      this.byUid(entity.uid) !== entity ||
      entity.carried ||
      entity.broken
    ) {
      return false;
    }
    const damage = entity.damage ?? 0;
    if (!(damage > 0 && damage < this.defOf(entity).breach.durability)) {
      return false;
    }
    return this.repairedDamage(entity, amount, ceiling) < damage;
  }

  repair(entity: BlockEntity, amount: number, ceiling: number): boolean {
    if (!this.canRepair(entity, amount, ceiling)) {
      return false;
    }
    const remaining = this.repairedDamage(entity, amount, ceiling);
    const worn = this.wearOf(entity);
    entity.damage = remaining === 0 ? undefined : remaining;
    this.version += 1;
    if (this.wearOf(entity) !== worn) {
      this.standingChanged(entity);
    }
    return true;
  }

  /**
   * One blow against a standing piece, an actor's bash or a player's strike alike; an open leaf is a gap, not a
   * target. A blow below the piece's minimum strength leaves no mark, so waiting never lets a weak attacker through;
   * stronger blows add their strength until it reaches the durability. A broken leaf stands open and its lock and
   * bar are gone, so the breach is one-way, as forcing is. Any other piece is ruined, its damage set to its durability, and
   * the caller destroys it at once (`src/core/furnitureMove.ts`, `ruinFurniture`). Where that finds no room the piece
   * stands at full damage, and the next blow that lands ruins it again.
   */
  bash(entity: BlockEntity, strength: number): BashOutcome | undefined {
    const { breach } = this.defOf(entity);
    const leaf = this.breachable(entity);
    if (entity.carried || (leaf && entity.open)) {
      return undefined;
    }
    const hit = resolveDestructibleHit(
      entity.damage ?? 0,
      { force: strength, continuation: 0 },
      { minimumForce: breach.minimumStrength, breakForce: breach.durability, forceTaken: breach.durability },
    );
    if (hit.outcome === 'resisted') {
      return 'resisted';
    }
    const { damage } = hit;
    this.version += 1;
    if (damage < breach.durability || !leaf) {
      const worn = this.wearOf(entity);
      entity.damage = Math.min(damage, breach.durability);
      if (this.wearOf(entity) !== worn) {
        this.standingChanged(entity);
      }
      return damage < breach.durability ? 'damaged' : 'ruined';
    }
    entity.damage = undefined;
    entity.broken = true;
    entity.lock = undefined;
    entity.bar = undefined;
    entity.open = true;
    this.standingChanged(entity);
    return 'broken';
  }

  /** Sets or clears the world job a standing piece holds, for the item tree's owner (`src/core/inventory.ts`, `Inventory`). */
  hostWork(entity: BlockEntity, work: Item | undefined): void {
    if (work && (this.byUid(entity.uid) !== entity || entity.carried || entity.work)) {
      throw new Error('Only a live standing block entity with no job can hold one');
    }
    entity.work = work;
    this.version += 1;
  }

  /**
   * Why a piece can't be used now: a world job on it, running or paused, holds it, so another use can't take the
   * target from under the job (`packages/deadvox/DESIGN.md`, "Edits persist"). Only that job's own work item may still
   * use it. Every use path that refuses a missing piece asks.
   */
  useRefusal(entity: BlockEntity, asking?: Item): string | undefined {
    return entity.work !== undefined && entity.work !== asking
      ? claimed(this.registry.ui, 'interface')!.furnitureMoveMessages.reserved
      : undefined;
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
