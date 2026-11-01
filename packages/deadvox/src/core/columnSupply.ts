import type { BlockEntity } from './blockEntities.ts';
import { CHUNK, type Vec3 } from './coords.ts';
import type { Inventory } from './inventory.ts';
import type { Item } from './items.ts';
import { lootPointStream, type Rolled, rollLoot } from './loot.ts';
import { type ColumnSource, columnArea, type FurnitureSpawn, type Rect } from './site.ts';

type Column = readonly [number, number];
interface Supply {
  column: Column;
  furniture: FurnitureSpawn[];
  ground: { pos: Vec3; loot: Rolled[] }[];
}
interface SupplyOwner {
  inventory: Inventory;
  consumed: Set<string>;
  seed: number;
  blockSize: number;
}
const keyOf = ([cx, cz]: Column) => `${cx},${cz}`;
const ordered = (columns: Iterable<Column>): Column[] => [...columns].sort(([ax, az], [bx, bz]) => ax - bx || az - bz);

const furnish = (inventory: Inventory, supply: Supply): (BlockEntity | undefined)[] => {
  const pieces = supply.furniture.map((spawn) => inventory.furnishSpawn(spawn));
  for (const { pos, loot } of supply.ground) {
    for (const rolled of loot) {
      if (!inventory.add(inventory.createRolled(rolled), { kind: 'pile', pos })) {
        throw new Error(`ground item "${rolled.type}" does not fit in its pile`);
      }
    }
  }
  return pieces;
};

const ownerState = (inventory: Inventory): string =>
  JSON.stringify([
    inventory.snapshotState(),
    inventory.vehicles.snapshotState(),
    inventory.version,
    inventory.entities.version,
    inventory.entities.standing,
    inventory.vehicles.version,
    inventory.foodClock(),
  ]);

/** Arrival and event planning share the same complete furnishing program. */
export const createColumnSupply = (inventory: Inventory, consumed: Set<string>, seed: number, blockSize: number) => {
  const owner: SupplyOwner = { inventory, consumed, seed, blockSize };
  const project = (source: ColumnSource) => new SupplyProjection(owner, source);
  return {
    project,
    arrive(cx: number, cz: number, source: ColumnSource): void {
      if (consumed.has(`${cx},${cz}`)) {
        return;
      }
      const projection = project(source);
      projection.include(cx, cz);
      projection.publish(projection.revision, () => undefined);
    },
  };
};

/** A closure revision invalidates all prior plans; stable handles survive its canonical rebuild. */
class SupplyProjection {
  private readonly baseline: string;
  private readonly consumedBaseline: string;
  private columns = new Map<string, Column>();
  private supplies: Supply[] = [];
  private handles = new Map<string, number | undefined>();
  private itemHandles = new Map<string, number>();
  private view: Inventory;
  private published = false;
  private generation = 0;
  private readonly owner: SupplyOwner;
  private readonly source: ColumnSource;

  constructor(owner: SupplyOwner, source: ColumnSource) {
    this.owner = owner;
    this.source = source;
    this.baseline = ownerState(owner.inventory);
    this.consumedBaseline = JSON.stringify([...owner.consumed].sort());
    this.view = owner.inventory.project();
  }

  get revision(): number {
    return this.generation;
  }

  get inventory(): Inventory {
    return this.view;
  }

  /** Stable source/spawn occurrence, not a discovery-order or live allocation identity. */
  handle(cx: number, cz: number, occurrence: number): string {
    return JSON.stringify([cx, cz, occurrence]);
  }

  entity(handle: string, inventory = this.view): BlockEntity | undefined {
    const uid = this.handles.get(handle);
    return uid === undefined ? undefined : inventory.entities.byUid(uid);
  }

  itemHandle(cx: number, cz: number, occurrence: number): string {
    return JSON.stringify([cx, cz, 'item', occurrence]);
  }

  item(handle: string, inventory = this.view): Item | undefined {
    const uid = this.itemHandles.get(handle);
    return uid === undefined ? undefined : inventory.itemByUid(uid);
  }

  include(cx: number, cz: number): boolean {
    return this.includeColumns([[cx, cz]]);
  }

  readColumn(cx: number, cz: number): boolean {
    return this.read(columnArea(cx, cz));
  }

  /** Admit terrain read columns plus every source whose authored destinations intersect the query. */
  read(area: Rect): boolean {
    const columns: Column[] = [...this.source.supplySourcesIn(area)];
    for (let cx = Math.floor(area.x0 / CHUNK); cx < Math.ceil(area.x1 / CHUNK); cx++) {
      for (let cz = Math.floor(area.z0 / CHUNK); cz < Math.ceil(area.z1 / CHUNK); cz++) {
        columns.push([cx, cz]);
      }
    }
    return this.includeColumns(columns);
  }

  private assertCurrent(): void {
    if (
      this.published ||
      ownerState(this.owner.inventory) !== this.baseline ||
      JSON.stringify([...this.owner.consumed].sort()) !== this.consumedBaseline
    ) {
      throw new Error('Stale supply projection');
    }
  }

  private includeColumns(additions: readonly Column[]): boolean {
    this.assertCurrent();
    const columns = new Map(this.columns);
    for (const column of additions) {
      const key = keyOf(column);
      if (!(this.owner.consumed.has(key) || columns.has(key))) {
        columns.set(key, column);
      }
    }
    if (columns.size === this.columns.size) {
      return false;
    }
    // Rebuild rather than letting discovery order choose collisions, UIDs or reservations.
    const view = this.owner.inventory.project();
    const handles = new Map<string, number | undefined>();
    const itemHandles = new Map<string, number>();
    const supplies = ordered(columns.values()).map((column): Supply => {
      const [cx, cz] = column;
      const supply: Supply = {
        column,
        furniture: structuredClone(this.source.furnitureIn(cx, cz)),
        ground: this.source
          .lootPointsIn(cx, cz)
          .filter((point) => point.channel === 'ground')
          .map((point) => ({
            pos: [...point.destination],
            loot: rollLoot(view.registry, point, lootPointStream(this.owner.seed, point), this.owner.blockSize),
          })),
      };
      const firstItem = view.factory.next;
      for (const [i, entity] of furnish(view, supply).entries()) {
        handles.set(this.handle(cx, cz, i), entity?.uid);
      }
      for (let uid = firstItem; uid < view.factory.next; uid++) {
        itemHandles.set(this.itemHandle(cx, cz, uid - firstItem), uid);
      }
      return supply;
    });
    this.columns = columns;
    this.view = view;
    this.handles = handles;
    this.itemHandles = itemHandles;
    this.supplies = supplies;
    this.generation += 1;
    return true;
  }

  /**
   * Only an admitted, synchronous plan may publish. Replay against the unchanged owners preserves existing
   * object aliases; provisional UIDs resolve through those owners, never by retaining scratch objects.
   */
  publish(
    revision: number,
    ensureColumn: (cx: number, cz: number) => void,
    apply: (inventory: Inventory) => undefined = () => undefined,
  ): void {
    this.assertCurrent();
    if (revision !== this.revision) {
      throw new Error('Supply closure changed; replan before publication');
    }
    const install = new Map(this.columns);
    for (const supply of this.supplies) {
      for (const spawn of supply.furniture) {
        const { pos, size } = spawn.spec;
        for (let cx = Math.floor(pos[0] / CHUNK); cx < Math.ceil((pos[0] + size[0]) / CHUNK); cx++) {
          for (let cz = Math.floor(pos[2] / CHUNK); cz < Math.ceil((pos[2] + size[2]) / CHUNK); cz++) {
            install.set(keyOf([cx, cz]), [cx, cz]);
          }
        }
      }
    }
    for (const [cx, cz] of ordered(install.values())) {
      ensureColumn(cx, cz);
    }
    for (const supply of this.supplies) {
      furnish(this.owner.inventory, supply);
    }
    apply(this.owner.inventory);
    for (const column of this.columns.values()) {
      this.owner.consumed.add(keyOf(column));
    }
    this.published = true;
  }
}
