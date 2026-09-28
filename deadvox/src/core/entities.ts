// Where entities (zombies, later animals and vehicles) live. Slice 1 keeps plain
// objects in a Map. Systems only use this interface, so the storage can move to
// typed arrays in a worker when there are hundreds of zombies without changing them
// (DESIGN.md, "Entities"; CHALLENGES.md, "Many zombies in a browser").

export type EntityId = number;

export interface EntityStore<T> {
  readonly size: number;
  readonly nextId: number;
  /** Stores an entity and returns its id. Ids are never reused. */
  add: (entity: T) => EntityId;
  get: (id: EntityId) => T | undefined;
  /** Returns whether the entity existed. */
  remove: (id: EntityId) => boolean;
  /** Entities in the order they were added. */
  entries: () => IterableIterator<[EntityId, T]>;
  restore: (entries: readonly (readonly [EntityId, T])[], nextId: number) => void;
}

export class MapEntityStore<T> implements EntityStore<T> {
  private readonly map = new Map<EntityId, T>();

  get size(): number {
    return this.map.size;
  }

  get nextId(): number {
    return this.next;
  }

  private next = 1;

  add(entity: T): EntityId {
    const id = this.next;
    this.next += 1;
    this.map.set(id, entity);
    return id;
  }

  get(id: EntityId): T | undefined {
    return this.map.get(id);
  }

  remove(id: EntityId): boolean {
    return this.map.delete(id);
  }

  entries(): IterableIterator<[EntityId, T]> {
    return this.map.entries();
  }

  restore(entries: readonly (readonly [EntityId, T])[], nextId: number): void {
    const ids = new Set<number>();
    for (const [id] of entries) {
      if (!Number.isSafeInteger(id) || id < 1 || ids.has(id)) {
        throw new Error(`Invalid or duplicate entity id ${id}`);
      }
      ids.add(id);
    }
    const maxId = [...ids].reduce((max, id) => Math.max(max, id), 0);
    if (!Number.isSafeInteger(nextId) || nextId <= maxId) {
      throw new Error('Invalid next entity id');
    }
    this.map.clear();
    for (const [id, entity] of entries) {
      this.map.set(id, entity);
    }
    this.next = nextId;
  }
}
