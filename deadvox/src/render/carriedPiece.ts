import { Box3, Group, type Mesh, type Object3D, Vector3 } from 'three';
import type { BlockEntities, BlockEntity } from '../core/blockEntities.ts';
import type { FurnitureDef, InventoryTuningDef } from '../core/schema.ts';

export type CarriedViewTuning = InventoryTuningDef['furnitureMove']['carriedView'];

/**
 * The piece the player carries, held in front of the first-person view (`DESIGN.md`, "Moving furniture"). It reads
 * the carry state each frame rather than keeping its own, so it is gone as soon as the piece is no longer carried.
 */
export class CarriedPiece {
  /** Lives in a group that follows the camera, so its position is in view metres. */
  readonly group = new Group();
  private readonly entities: BlockEntities;
  private readonly build: (entity: BlockEntity, def: FurnitureDef) => Object3D;
  private readonly tuning: CarriedViewTuning;
  private readonly bounds = new Box3();
  private readonly centre = new Vector3();
  private readonly size = new Vector3();
  private drawn = '';
  private bobRealSeconds = 0;

  constructor(
    entities: BlockEntities,
    build: (entity: BlockEntity, def: FurnitureDef) => Object3D,
    tuning: CarriedViewTuning,
  ) {
    this.group.name = 'carried-piece';
    this.entities = entities;
    this.build = build;
    this.tuning = tuning;
  }

  /** Whether a carried piece is drawn. */
  get shown(): boolean {
    return this.group.children.length > 0;
  }

  /** Catches up with the carry state and bobs the piece; `dt` is real seconds. */
  update(dt: number): void {
    const carried = this.entities.carrying();
    const key = carried ? `${carried.uid}:${this.entities.version}` : '';
    if (key !== this.drawn) {
      this.drawn = key;
      this.group.clear();
      this.bobRealSeconds = 0;
      if (carried) {
        this.group.add(this.fitted(carried));
      }
    }
    if (!carried) {
      return;
    }
    this.bobRealSeconds += dt;
    const { offsetMetres, bobMetres, bobPerRealSecond } = this.tuning;
    const bob = bobMetres * Math.sin(this.bobRealSeconds * bobPerRealSecond * 2 * Math.PI);
    this.group.position.set(offsetMetres[0], offsetMetres[1] + bob, offsetMetres[2]);
  }

  /** The piece centred on the group and shrunk to the tuned size. Like held items, it takes shadow but casts none. */
  private fitted(entity: BlockEntity): Object3D {
    const piece = this.build(entity, this.entities.defOf(entity));
    piece.updateMatrixWorld(true);
    this.bounds.setFromObject(piece);
    this.bounds.getCenter(this.centre);
    this.bounds.getSize(this.size);
    piece.position.sub(this.centre);
    piece.traverse((object) => {
      if ((object as Mesh).isMesh) {
        object.castShadow = false;
        object.receiveShadow = true;
      }
    });
    const holder = new Group();
    holder.add(piece);
    holder.scale.setScalar(this.tuning.sizeMetres / Math.max(this.size.x, this.size.y, this.size.z, Number.MIN_VALUE));
    return holder;
  }
}
