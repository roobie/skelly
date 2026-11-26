import type { FallRecord } from '@skelly/engine/world';
import { Group, type Object3D } from 'three';

interface ActiveDrop {
  readonly model: Object3D;
  readonly distance: number;
  readonly landingY: number;
  elapsedRealSeconds: number;
  readonly record: FallRecord;
}

/** Draws every reported gravity move through one real-time path. */
export class FallDrops {
  readonly group = new Group();
  readonly hiddenPieceUids = new Set<number>();
  readonly hiddenItemUids = new Set<number>();
  private readonly active: ActiveDrop[] = [];

  private readonly terrain: (block: number) => Object3D;
  private readonly blockSize: number;
  private readonly gravity: number;
  private readonly piece: (uid: number) => Object3D | undefined;
  private readonly pile: (uid: number) => Object3D | undefined;
  private readonly mask: (cells: readonly FallRecord['to'][]) => void;
  private readonly unmask: (cells: readonly FallRecord['to'][]) => void;

  constructor(
    blockSize: number,
    gravity: number,
    {
      piece,
      pile,
      terrain,
    }: {
      piece: (uid: number) => Object3D | undefined;
      pile: (uid: number) => Object3D | undefined;
      terrain: (block: number) => Object3D;
    },
    {
      mask,
      unmask,
    }: {
      mask: (cells: readonly FallRecord['to'][]) => void;
      unmask: (cells: readonly FallRecord['to'][]) => void;
    },
  ) {
    this.terrain = terrain;
    this.blockSize = blockSize;
    this.gravity = gravity;
    this.piece = piece;
    this.pile = pile;
    this.mask = mask;
    this.unmask = unmask;
  }

  read(records: readonly FallRecord[]): void {
    for (const record of records) {
      const distance = (record.from[1] - record.to[1]) * this.blockSize;
      if (distance <= 0) {
        continue;
      }
      const model = this.model(record);
      if (!model) {
        continue;
      }
      this.active.push({
        model,
        distance,
        landingY: model.position.y - distance,
        elapsedRealSeconds: 0,
        record,
      });
      this.group.add(model);
      if (record.kind === 'terrain') {
        this.mask([record.to]);
      } else {
        (record.kind === 'piece' ? this.hiddenPieceUids : this.hiddenItemUids).add(record.uid);
      }
    }
  }

  update(dt: number): void {
    const landed: FallRecord['to'][] = [];
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const drop = this.active[index]!;
      drop.elapsedRealSeconds += dt;
      const travelled = Math.min(drop.distance, (this.gravity * drop.elapsedRealSeconds ** 2) / 2);
      drop.model.position.y = drop.landingY + drop.distance - travelled;
      if (travelled < drop.distance) {
        continue;
      }
      this.group.remove(drop.model);
      this.active.splice(index, 1);
      if (drop.record.kind === 'terrain') {
        landed.push(drop.record.to);
      }
    }
    this.hiddenPieceUids.clear();
    this.hiddenItemUids.clear();
    for (const { record } of this.active) {
      if (record.kind !== 'terrain') {
        (record.kind === 'piece' ? this.hiddenPieceUids : this.hiddenItemUids).add(record.uid);
      }
    }
    if (landed.length > 0) {
      this.unmask(landed);
    }
  }

  dispose(): void {
    this.group.clear();
    this.active.length = 0;
    this.hiddenPieceUids.clear();
    this.hiddenItemUids.clear();
  }

  private model(record: FallRecord): Object3D | undefined {
    if (record.kind === 'piece') {
      const model = this.piece(record.uid);
      if (model) {
        model.position.y += (record.from[1] - record.to[1]) * this.blockSize;
      }
      return model;
    }
    if (record.kind === 'pile') {
      const model = this.pile(record.uid);
      if (model) {
        model.position.y += (record.from[1] - record.to[1]) * this.blockSize;
      }
      return model;
    }
    if (record.kind === 'terrain') {
      const model = this.terrain(record.block);
      model.position.set(
        record.from[0] * this.blockSize,
        record.from[1] * this.blockSize,
        record.from[2] * this.blockSize,
      );
      return model;
    }
    return undefined;
  }
}
