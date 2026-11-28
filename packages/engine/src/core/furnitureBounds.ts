import type { BlockEntities, BlockEntity } from './blockEntities.ts';
import type { Vec3 } from './coords.ts';
import type { SkyBlocker } from './skylight.ts';

interface BoundsOwner {
  standing: number;
  pieces: Map<BlockEntity, readonly SkyBlocker[]>;
}
const owners = new WeakMap<BlockEntities, BoundsOwner>();

const refreshOwner = (entities: BlockEntities): BoundsOwner => {
  let owner = owners.get(entities);
  if (!owner) {
    owner = { standing: -1, pieces: new Map() };
    owners.set(entities, owner);
  }
  if (owner.standing !== entities.standing) {
    const changed = entities.standingChangesSince(owner.standing);
    if (!changed) {
      owner.pieces.clear();
    }
    for (const piece of new Set(changed ?? entities.all)) {
      if (!entities.stands(piece)) {
        owner.pieces.delete(piece);
        continue;
      }
      owner.pieces.set(
        piece,
        entities.lightBlockingBoxes(piece).map(({ pos, size }) => ({
          min: [...pos] as Vec3,
          max: pos.map((value, axis) => value + size[axis]!) as Vec3,
          shade: 1,
        })),
      );
    }
    owner.standing = entities.standing;
  }
  return owner;
};

/** Consumer cursors retain old bounds for local invalidation; geometry has one owner per world. */
export class FurnitureBoundsView {
  private standing = -1;
  private readonly pieces = new Map<BlockEntity, readonly SkyBlocker[]>();
  private readonly entities: BlockEntities;

  constructor(entities: BlockEntities) {
    this.entities = entities;
  }

  refresh(changed: (box: SkyBlocker) => void): void {
    if (this.standing === this.entities.standing) {
      return;
    }
    const owner = refreshOwner(this.entities);
    const changes = this.entities.standingChangesSince(this.standing);
    if (!changes) {
      for (const boxes of this.pieces.values()) {
        boxes.forEach(changed);
      }
      this.pieces.clear();
    }
    for (const piece of new Set(changes ?? this.entities.all)) {
      const before = this.pieces.get(piece) ?? [];
      const after = owner.pieces.get(piece) ?? [];
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        before.forEach(changed);
        after.forEach(changed);
      }
      if (this.entities.stands(piece)) {
        this.pieces.set(piece, after);
      } else {
        this.pieces.delete(piece);
      }
    }
    this.standing = this.entities.standing;
  }

  *boxes(): IterableIterator<SkyBlocker> {
    for (const boxes of this.pieces.values()) {
      yield* boxes;
    }
  }
}
