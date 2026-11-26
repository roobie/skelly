import type { BlockEntities, FallRecord } from '@skelly/engine/world';
import { BoxGeometry, Group, Mesh, MeshLambertMaterial, Object3D } from 'three';

interface ActiveDrop {
  readonly model: Object3D;
  readonly distance: number;
  readonly duration: number;
  elapsed: number;
  readonly landing?: FallRecord['to'];
}

/** Draws every reported gravity move through one real-time path. */
export class FallDrops {
  readonly group = new Group();
  private readonly box = new BoxGeometry(1, 1, 1);
  private readonly terrain = new MeshLambertMaterial({ color: '#777777' });
  private readonly active: ActiveDrop[] = [];

  private readonly blockSize: number;
  private readonly gravity: number;
  private readonly piece: (uid: number) => Object3D | undefined;
  private readonly mask: (cells: readonly FallRecord['to'][]) => void;
  private readonly unmask: (cells: readonly FallRecord['to'][]) => void;

  constructor(
    blockSize: number,
    gravity: number,
    piece: (uid: number) => Object3D | undefined,
    mask: (cells: readonly FallRecord['to'][]) => void,
    unmask: (cells: readonly FallRecord['to'][]) => void,
  ) {
    this.blockSize = blockSize;
    this.gravity = gravity;
    this.piece = piece;
    this.mask = mask;
    this.unmask = unmask;
  }

  read(records: readonly FallRecord[], _entities: BlockEntities): void {
    for (const record of records) {
      const distance = (record.from[1] - record.to[1]) * this.blockSize;
      if (distance <= 0) {
        continue;
      }
      const model = this.model(record);
      if (!model) {
        continue;
      }
      const duration = Math.sqrt((2 * distance) / this.gravity);
      this.active.push({ model, distance, duration, elapsed: 0, ...(record.kind === 'terrain' ? { landing: record.to } : {}) });
      this.group.add(model);
      if (record.kind === 'terrain') {
        this.mask([record.to]);
      }
    }
  }

  update(dt: number): void {
    const landed: FallRecord['to'][] = [];
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const drop = this.active[index]!;
      drop.elapsed += dt;
      const travelled = Math.min(drop.distance, (this.gravity * drop.elapsed ** 2) / 2);
      drop.model.position.y = drop.distance - travelled;
      if (travelled < drop.distance) {
        continue;
      }
      this.group.remove(drop.model);
      this.active.splice(index, 1);
      if (drop.landing) {
        landed.push(drop.landing);
      }
    }
    if (landed.length > 0) {
      this.unmask(landed);
    }
  }

  dispose(): void {
    this.group.clear();
    this.active.length = 0;
    this.box.dispose();
    this.terrain.dispose();
  }

  private model(record: FallRecord): Object3D | undefined {
    if (record.kind === 'piece') {
      const model = record.uid === undefined ? undefined : this.piece(record.uid);
      if (model) {
        model.position.y += (record.from[1] - record.to[1]) * this.blockSize;
      }
      return model;
    }
    if (record.kind === 'terrain') {
      const model = new Mesh(this.box, this.terrain);
      model.position.set(
        (record.from[0] + 0.5) * this.blockSize,
        (record.from[1] + 0.5) * this.blockSize,
        (record.from[2] + 0.5) * this.blockSize,
      );
      return model;
    }
    return undefined;
  }
}
