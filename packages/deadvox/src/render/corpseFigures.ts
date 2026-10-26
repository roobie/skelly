// Dead humans (`DESIGN.md`, "Dead humans"): each corpse piece drawn as its figure lying in the figure's corpse pose,
// dressed in the outfit its furniture row names. Only the drawing lives here; the piece stays furniture for loot,
// picking and saves.

import { Group, Matrix4, Vector3 } from 'three';
import type { BlockEntities, BlockEntity } from '../core/blockEntities.ts';
import type { Registry } from '../core/content.ts';
import { rotationOf } from '../core/orientation.ts';
import type { Body } from '../core/physics.ts';
import type { FurnitureDef } from '../core/schema.ts';
import type { ColumnReveal } from './columnReveal.ts';
import { type ModelLibrary, visibleBounds } from './models.ts';
import { FIGURE_PIVOT, PlayerMeshes } from './playerFigure.ts';

/** The world's default layer: a corpse blocks the flashlight's shadow like any other piece. */
const WORLD_LAYER = 0;

/** One dead body: `group` stands as the piece stands, and `laid` holds the figure lying in it. */
interface Corpse {
  group: Group;
  laid: Group;
  meshes: PlayerMeshes;
  /** Whether the figure is laid out and can be shown. */
  settled: boolean;
}

const STILL_BODY: Body = { pos: [0, 0, 0], vel: [0, 0, 0], halfWidth: 0, height: 0, onGround: true };

/**
 * Draws parts loaded since the last call; once all have, lays the figure with its head toward the piece's +x, centred
 * over the footprint and resting on its floor.
 */
const settle = (corpse: Corpse): void => {
  if (corpse.settled) {
    return;
  }
  const { group, laid, meshes } = corpse;
  meshes.sync({
    body: STILL_BODY,
    yaw: 0,
    stepOffset: 0,
    gaitPhase: 0,
    moving: false,
    stance: 'standing',
    dt: 0,
    thirdPerson: true,
  });
  if (!meshes.loaded) {
    return;
  }
  corpse.settled = true;
  // Measured detached, so the figure's own frame is the world frame whether or not the piece is placed yet.
  group.remove(laid);
  laid.updateMatrixWorld(true);
  const head = meshes.group.getObjectByName(FIGURE_PIVOT.head)!.getWorldPosition(new Vector3());
  meshes.group.rotation.y = Math.atan2(head.z, head.x);
  const box = visibleBounds(laid);
  const centre = box.getCenter(new Vector3());
  laid.position.set(-centre.x, -box.min.y, -centre.z);
  group.add(laid);
};

/** Stands the corpse's frame where `entity` stands: its footprint's bottom centre, turned as it is turned. */
const place = (corpse: Corpse, entity: BlockEntity, def: FurnitureDef, blockSize: number): void => {
  const [x, y, z] = entity.pos;
  const [width, height, depth] = entity.size;
  const [right, up, back] = rotationOf(entity).map((axis) => new Vector3(...axis));
  corpse.group.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right!, up!, back!));
  corpse.group.position
    .set(x + width / 2, y + height / 2, z + depth / 2)
    .addScaledVector(up!, -def.size[1] / 2)
    .multiplyScalar(blockSize);
};

export class CorpseFigures {
  readonly group = new Group();
  private readonly blockSize: number;
  private readonly registry: Registry;
  private readonly models: ModelLibrary;
  private readonly reveal: ColumnReveal | undefined;
  private corpses = new Map<BlockEntity, Corpse>();
  private drawn = '';

  constructor(blockSize: number, registry: Registry, models: ModelLibrary, reveal?: ColumnReveal) {
    this.blockSize = blockSize;
    this.registry = registry;
    this.models = models;
    this.reveal = reveal;
  }

  /** Follows the pieces as they are added, moved or taken away, and finishes figures whose models have loaded. */
  sync(entities: BlockEntities): void {
    const key = `${entities.standing}:${this.models.version}:${this.reveal?.revealVersion ?? 0}`;
    if (key === this.drawn) {
      return;
    }
    this.drawn = key;
    const corpses = new Map<BlockEntity, Corpse>();
    for (const entity of entities.all) {
      const def = entities.defOf(entity);
      if (!def.corpse) {
        continue;
      }
      const corpse = this.corpses.get(entity) ?? this.corpse(def.corpse);
      settle(corpse);
      place(corpse, entity, def, this.blockSize);
      corpse.group.visible = corpse.settled && (this.reveal?.isRevealed(entity.pos[0], entity.pos[2]) ?? true);
      corpses.set(entity, corpse);
    }
    this.group.clear();
    for (const corpse of corpses.values()) {
      this.group.add(corpse.group);
    }
    this.corpses = corpses;
  }

  /** A corpse built as it lies where `entity` stands, for drawing it away from the world, such as carried. */
  figure(entity: BlockEntity, def: FurnitureDef): Group {
    const corpse = this.corpse(def.corpse!);
    settle(corpse);
    place(corpse, entity, def, this.blockSize);
    corpse.group.visible = corpse.settled;
    return corpse.group;
  }

  private corpse({ figure: figureId, outfit }: NonNullable<FurnitureDef['corpse']>): Corpse {
    const figure = this.registry.figures.get(figureId)!;
    const meshes = new PlayerMeshes(this.blockSize, figure, this.registry.models, this.models);
    meshes.dress({ outfit: figure.outfits[outfit]!, layer: WORLD_LAYER });
    meshes.holdPose(figure.corpsePose);
    const laid = new Group().add(meshes.group);
    return { group: new Group().add(laid), laid, meshes, settled: false };
  }
}
