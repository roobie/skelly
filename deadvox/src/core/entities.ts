// Where entities (zombies, later animals and vehicles) live. Slice 1 keeps plain
// objects in a Map. Systems only use this interface, so the storage can move to
// typed arrays in a worker when there are hundreds of zombies without changing them
// (DESIGN.md, "Entities"; CHALLENGES.md, "Many zombies in a browser").

export type EntityId = number;

export interface EntityStore<T> {
  readonly size: number;
  /** Stores an entity and returns its id. Ids are never reused. */
  add: (entity: T) => EntityId;
  get: (id: EntityId) => T | undefined;
  /** Returns whether the entity existed. */
  remove: (id: EntityId) => boolean;
  /** Entities in the order they were added. */
  entries: () => IterableIterator<[EntityId, T]>;
}

export class MapEntityStore<T> implements EntityStore<T> {
  private readonly map = new Map<EntityId, T>();
  private nextId = 1;

  get size(): number {
    return this.map.size;
  }

  add(entity: T): EntityId {
    const id = this.nextId;
    this.nextId += 1;
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
}
