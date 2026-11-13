// Dead humans (`packages/deadvox/DESIGN.md`, "Dead humans"): each corpse piece drawn as its figure lying in the figure's corpse pose,
// dressed in the outfit its furniture row names. Only the drawing lives here; the piece stays furniture for loot,
// picking and saves.

import type { FurnitureDef, Registry } from '@skelly/engine/content';
import type { ColumnReveal } from '@skelly/engine/mesh';
import { type BlockEntities, type BlockEntity, type Body, rotationOf } from '@skelly/engine/world';
import { Group, Matrix4, Vector3 } from 'three';
import { bakeMeshes, disposeBaked } from './bakedMeshes.ts';
import { type ModelLibrary, visibleBounds } from './models.ts';
import { FIGURE_PIVOT, PlayerMeshes } from './playerFigure.ts';
import { freezeMatrices } from './staticMatrices.ts';

/** The world's default layer: a corpse blocks the flashlight's shadow like any other piece. */
const WORLD_LAYER = 0;

/** One dead body: `group` stands as the piece stands, and `laid` holds the figure lying in it. */
interface Corpse {
  group: Group;
  laid: Group;
  meshes: PlayerMeshes;
  /** Whether the figure is laid out and can be shown. */
  settled: boolean;
  /** The settled figure merged in place of `laid`, so a body in the world costs a few draws, not one per part. */
  baked?: Group;
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

/** Swaps a settled figure for its merged stand-in; a settled figure never moves again within its piece. */
const bake = (corpse: Corpse): void => {
  if (!corpse.settled || corpse.baked) {
    return;
  }
  corpse.baked = bakeMeshes(corpse.laid);
  corpse.group.remove(corpse.laid);
  corpse.group.add(corpse.baked);
};

const dispose = (corpse: Corpse): void => {
  if (corpse.baked) {
    disposeBaked(corpse.baked);
  }
  corpse.meshes.dispose();
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
      bake(corpse);
      place(corpse, entity, def, this.blockSize);
      corpse.group.visible = corpse.settled && (this.reveal?.isRevealed(entity.pos[0], entity.pos[2]) ?? true);
      // Each sync re-places before freezing, so a moved body recomposes once and then stands still until
      // the next sync. A body still loading stays unfrozen: `settle` moves its parts in place, and the
      // carried `figure` clones stay unfrozen with their holder.
      if (corpse.settled) {
        freezeMatrices(corpse.group);
      }
      corpses.set(entity, corpse);
    }
    for (const [entity, corpse] of this.corpses) {
      if (corpses.get(entity) !== corpse) {
        dispose(corpse);
      }
    }
    this.group.clear();
    for (const corpse of corpses.values()) {
      this.group.add(corpse.group);
    }
    this.corpses = corpses;
  }

  /** Frees what the drawn bodies own; the shared models and their materials stay with the model library. */
  dispose(): void {
    for (const corpse of this.corpses.values()) {
      dispose(corpse);
    }
    this.corpses.clear();
    this.group.clear();
    this.drawn = '';
  }

  /**
   * A corpse built as it lies where `entity` stands, for drawing it away from the world, such as carried. It stays
   * unbaked: its holder drops it without freeing anything, and one body is no draw cost worth owning geometry for.
   */
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
