import { Box3, Group, type Mesh, type Object3D, type Quaternion, Vector3 } from 'three';
import type { BlockEntities, BlockEntity } from '../core/blockEntities.ts';
import type { Vec3 } from '../core/coords.ts';
import type { FurnitureDef, InventoryTuningDef } from '../core/schema.ts';

export type CarriedViewTuning = InventoryTuningDef['furnitureMove']['carriedView'];

/**
 * The held piece reads the carry owner so its presentation cannot outlive the hold (`DESIGN.md`, "Moving furniture").
 */
export class CarriedPiece {
  /**
   * Lives in a group that follows the camera, so its position is in view metres; it undoes the camera's turn so the
   * piece keeps the world heading it will be set down at (`DESIGN.md`, "Moving furniture").
   */
  readonly group = new Group();
  readonly floorGroup = new Group();
  private readonly entities: BlockEntities;
  private readonly build: (entity: BlockEntity, def: FurnitureDef) => Object3D;
  private readonly tuning: CarriedViewTuning;
  private readonly modelsVersion: () => number;
  private readonly bounds = new Box3();
  private readonly centre = new Vector3();
  private readonly size = new Vector3();
  private drawn = '';
  private bobRealSeconds = 0;
  private floorUid: number | undefined;

  /**
   * `modelsVersion` goes up as models load (`src/render/models.ts`, `ModelLibrary`): a piece built before its models
   * arrived, such as one carried in a loaded save, is rebuilt and refitted once they do.
   */
  constructor(
    entities: BlockEntities,
    build: (entity: BlockEntity, def: FurnitureDef) => Object3D,
    tuning: CarriedViewTuning,
    modelsVersion: () => number = () => 0,
  ) {
    this.group.name = 'carried-piece';
    this.group.visible = false;
    this.entities = entities;
    this.build = build;
    this.tuning = tuning;
    this.modelsVersion = modelsVersion;
  }

  /** Whether a carried piece is drawn. */
  get shown(): boolean {
    return this.group.children.length > 0 || this.floorGroup.children.length > 0;
  }

  /** Catches up with the carry state and bobs the piece; `dt` is real seconds, `camera` the view's world turn. */
  update(dt: number, camera: Quaternion, blockSize: number, floorPlacement?: Readonly<Vec3>): void {
    const carried = this.entities.carrying();
    const key = carried ? `${carried.uid}:${this.entities.version}:${this.modelsVersion()}` : '';
    if (key !== this.drawn) {
      this.drawn = key;
      this.group.clear();
      this.floorGroup.clear();
      this.bobRealSeconds = 0;
      if (carried) {
        (carried.floorLocked ? this.floorGroup : this.group).add(this.fitted(carried));
      }
      this.group.visible = this.group.children.length > 0;
    }
    if (!carried) {
      this.floorUid = undefined;
      return;
    }
    if (carried.floorLocked) {
      if (this.floorUid !== carried.uid) {
        this.floorUid = carried.uid;
        this.floorGroup.position.set(0, 0, 0);
      }
      if (floorPlacement) {
        this.floorGroup.position.set(
          (floorPlacement[0] - carried.pos[0]) * blockSize,
          0,
          (floorPlacement[2] - carried.pos[2]) * blockSize,
        );
      }
      return;
    }
    this.bobRealSeconds += dt;
    const { offsetMetres, bobMetres, bobPerRealSecond } = this.tuning;
    const bob = bobMetres * Math.sin(this.bobRealSeconds * bobPerRealSecond * 2 * Math.PI);
    this.group.position.set(offsetMetres[0], offsetMetres[1] + bob, offsetMetres[2]);
    this.group.quaternion.copy(camera).invert();
  }

  /** Floor-locked pieces retain their world geometry so the hold cannot visually lift them. */
  private fitted(entity: BlockEntity): Object3D {
    const piece = this.build(entity, this.entities.defOf(entity));
    if (entity.floorLocked) {
      return piece;
    }
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
