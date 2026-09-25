// Where entities (zombies, item piles, later vehicles) live. Systems use this
// interface only, so storage can move to typed arrays in a worker when the counts
// need it (CHALLENGES.md §4) without changing them. Slice 1 stores plain objects.

import type { Vec3 } from '../coords.ts';

export interface Entity {
  readonly id: number;
  /** Position in metres. */
  pos: Vec3;
}

export interface EntityStore<T extends Entity> {
  /** Adds an entity built from the data, assigning it a fresh id. */
  add: (data: Omit<T, 'id'>) => T;
  get: (id: number) => T | undefined;
  remove: (id: number) => boolean;
  readonly size: number;
  values: () => IterableIterator<T>;
}

export class MapEntityStore<T extends Entity> implements EntityStore<T> {
  private readonly items = new Map<number, T>();
  private nextId = 1;

  add(data: Omit<T, 'id'>): T {
    const entity = { ...data, id: this.nextId } as T;
    this.nextId += 1;
    this.items.set(entity.id, entity);
    return entity;
  }

  get(id: number): T | undefined {
    return this.items.get(id);
  }

  remove(id: number): boolean {
    return this.items.delete(id);
  }

  get size(): number {
    return this.items.size;
  }

  values(): IterableIterator<T> {
    return this.items.values();
  }
}
