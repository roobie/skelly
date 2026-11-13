import type { ColumnReveal } from '@skelly/engine/mesh';
import { FIGURE_BOXES, FIGURE_PARTS, type FigurePart, type HumanoidHitRegion } from '@skelly/engine/pose';
import { type Actor, BACKGROUND_ACTOR_RATE, type EntityId, type EntityStore } from '@skelly/engine/sim';
import type { Vec3 } from '@skelly/engine/world';
import { type Box3, BoxGeometry, DynamicDrawUsage, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import { withHeightFog } from './heightFog.ts';
import { castsAndReceives } from './shadowFlags.ts';
import { freezeMatrices } from './staticMatrices.ts';
import { StepOffset } from './stepOffset.ts';

type Part = FigurePart;
interface RenderActor {
  id: EntityId;
  actor: Actor;
  position: Vec3;
  yaw: number;
  headYaw: number;
  gaitPhase: number;
  verticalOffset: number;
}
const PARTS: readonly Part[] = FIGURE_PARTS;
const REGION_FOR_PART: Readonly<Record<Part, HumanoidHitRegion>> = {
  body: 'torso',
  head: 'head',
  leftArm: 'leftArm',
  rightArm: 'rightArm',
  leftLeg: 'leftLeg',
  rightLeg: 'rightLeg',
};

/** Six instanced boxes, never one draw object per actor. */
export class ActorMeshes {
  readonly group = new Group();
  private readonly meshes = new Map<Part, InstancedMesh>();
  private readonly dummy = new Object3D();
  private readonly stepOffsets = new Map<EntityId, StepOffset>();
  private readonly blockSize: number;
  private readonly reveal: ColumnReveal | undefined;

  constructor(blockSize: number, capacity = 64, reveal?: ColumnReveal) {
    this.blockSize = blockSize;
    this.reveal = reveal;
    for (const part of FIGURE_PARTS) {
      const flesh = part === 'body' || part === 'head';
      const material = withHeightFog(new MeshLambertMaterial({ color: flesh ? 0x87_96_78 : 0x68_6f_5e }), 'actor');
      const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, capacity);
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.meshes.set(part, mesh);
      // Actors pose through instance matrices; the boxes themselves never move.
      freezeMatrices(mesh);
      this.group.add(castsAndReceives(mesh));
    }
  }

  private verticalOffset(id: EntityId, position: Vec3, grounded: boolean, realDt: number): number {
    let stepOffset = this.stepOffsets.get(id);
    if (!stepOffset) {
      stepOffset = new StepOffset(0.5);
      this.stepOffsets.set(id, stepOffset);
    }
    const [x, y, z] = position;
    return stepOffset.update([x * this.blockSize, y * this.blockSize, z * this.blockSize], grounded, realDt);
  }

  private discardMissingOffsets(activeIds: ReadonlySet<EntityId>): void {
    for (const id of this.stepOffsets.keys()) {
      if (!activeIds.has(id)) {
        this.stepOffsets.delete(id);
      }
    }
  }

  private renderPose(id: EntityId, actor: Actor, blend: number, realDt: number): RenderActor {
    const previous = actor.renderPrevious;
    const position: Vec3 = [
      previous.pos[0] + (actor.body.pos[0] - previous.pos[0]) * blend,
      previous.pos[1] + (actor.body.pos[1] - previous.pos[1]) * blend,
      previous.pos[2] + (actor.body.pos[2] - previous.pos[2]) * blend,
    ];
    const yawBefore = Math.atan2(-previous.facing[0], -previous.facing[2]);
    const yawAfter = Math.atan2(-actor.facing[0], -actor.facing[2]);
    const yawDelta = Math.atan2(Math.sin(yawAfter - yawBefore), Math.cos(yawAfter - yawBefore));
    return {
      id,
      actor,
      position,
      yaw: yawBefore + yawDelta * blend,
      headYaw: previous.headYaw + (actor.headYaw - previous.headYaw) * blend,
      gaitPhase: previous.gaitPhase + (actor.gaitPhase - previous.gaitPhase) * blend,
      verticalOffset: this.verticalOffset(id, position, actor.body.onGround, realDt),
    };
  }

  private syncPart(part: Part, actors: RenderActor[]): void {
    const mesh = this.meshes.get(part)!;
    const visible = actors.filter(({ actor }) =>
      actor.type.model === 'fused-mass'
        ? part === 'body' && actor.regions['core.trunk']! > 0
        : actor.regions[REGION_FOR_PART[part]]! > 0,
    );
    mesh.count = Math.min(visible.length, mesh.instanceMatrix.count);
    const s = this.blockSize;
    for (let i = 0; i < mesh.count; i++) {
      const { actor, position, yaw, headYaw, gaitPhase, verticalOffset } = visible[i]!;
      const box =
        actor.type.model === 'fused-mass' && part === 'body'
          ? {
              size: [
                actor.body.halfWidth * 2 * s,
                actor.body.height * s,
                (actor.body.halfDepth ?? actor.body.halfWidth) * 2 * s,
              ] as [number, number, number],
              at: [0, actor.body.height * s * 0.5, 0] as [number, number, number],
            }
          : FIGURE_BOXES[part];
      const [x, y, z] = position;
      const partYaw = yaw + (part === 'head' ? headYaw : 0);
      const offsetX = box.at[0] * Math.cos(yaw) + box.at[2] * Math.sin(yaw);
      const offsetZ = -box.at[0] * Math.sin(yaw) + box.at[2] * Math.cos(yaw);
      const moving = Math.hypot(actor.body.vel[0], actor.body.vel[2]) > 0.05;
      const isLeg = part === 'leftLeg' || part === 'rightLeg';
      const stride = (part === 'leftLeg' ? 1 : -1) * Math.sin(gaitPhase) * 0.22;
      this.dummy.position.set(x * s + offsetX, y * s + verticalOffset + box.at[1], z * s + offsetZ);
      this.dummy.rotation.set(0, partYaw, 0);
      if (isLeg && moving) {
        this.dummy.rotateX(stride);
      }
      if (isLeg) {
        // Put the local box's top at the hip, so each stride pivots about the joint.
        this.dummy.translateY(-box.size[1] / 2);
      }
      this.dummy.scale.set(...box.size);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.boundingSphere = null;
  }

  /** The boxes carry their own world positions, so three.js culls them like any mesh; the per-light
   * picking the crowd figures need (render/shadows.ts, CrowdCasters) has nothing to pick here. */
  selectShadowCasters: (slot: number, casts: (box: Box3) => boolean) => void = () => undefined;
  reserveShadowSlots: (slots: number) => void = () => undefined;

  // biome-ignore lint/complexity/useMaxParams: Keep the renderer interface aligned with existing direct callers.
  sync(
    store: EntityStore<Actor>,
    realDt = 0,
    alpha = 1,
    freezeLiving = false,
    backgroundAlpha = alpha,
    simulationTime?: number,
  ): void {
    const blend = Math.max(0, Math.min(1, alpha));
    const backgroundBlend = Math.max(0, Math.min(1, backgroundAlpha));
    const actors = [...store.entries()].map(([id, actor]) => {
      const previousTime = actor.renderPrevious.time;
      const actorBackgroundBlend =
        simulationTime !== undefined && previousTime !== undefined
          ? Math.max(0, Math.min(1, (simulationTime - previousTime) * BACKGROUND_ACTOR_RATE))
          : backgroundBlend;
      return this.renderPose(
        id,
        actor,
        actor.tier === 'background' ? actorBackgroundBlend : blend,
        freezeLiving ? 0 : realDt,
      );
    });
    this.discardMissingOffsets(new Set(actors.map(({ id }) => id)));
    const revealed = actors.filter(({ position }) => this.reveal?.isRevealed(position[0], position[2]) ?? true);
    for (const part of PARTS) {
      this.syncPart(part, revealed);
    }
  }
}
