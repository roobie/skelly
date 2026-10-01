import { BoxGeometry, DynamicDrawUsage, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import type { Vec3 } from '../core/coords.ts';
import type { EntityId, EntityStore } from '../core/entities.ts';
import { FIGURE_BOXES, FIGURE_PARTS, type FigurePart, type ZombieRegion } from '../core/zombieRegions.ts';
import type { Zombie } from '../core/zombies.ts';
import { withHeightFog } from './heightFog.ts';
import { StepOffset } from './stepOffset.ts';

type Part = FigurePart;
interface RenderZombie {
  id: EntityId;
  zombie: Zombie;
  position: Vec3;
  yaw: number;
  headYaw: number;
  gaitPhase: number;
  verticalOffset: number;
}
const PARTS: readonly Part[] = FIGURE_PARTS;
const REGION_FOR_PART: Readonly<Record<Part, ZombieRegion>> = {
  body: 'torso',
  head: 'head',
  leftArm: 'leftArm',
  rightArm: 'rightArm',
  leftLeg: 'leftLeg',
  rightLeg: 'rightLeg',
};

/** Six instanced boxes, never one draw object per shambler. */
export class ZombieMeshes {
  readonly group = new Group();
  private readonly meshes = new Map<Part, InstancedMesh>();
  private readonly dummy = new Object3D();
  private readonly stepOffsets = new Map<EntityId, StepOffset>();
  private readonly blockSize: number;

  constructor(blockSize: number, capacity = 64) {
    this.blockSize = blockSize;
    for (const part of FIGURE_PARTS) {
      const flesh = part === 'body' || part === 'head';
      const material = withHeightFog(new MeshLambertMaterial({ color: flesh ? 0x87_96_78 : 0x68_6f_5e }));
      const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, capacity);
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.meshes.set(part, mesh);
      this.group.add(mesh);
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

  private renderPose(id: EntityId, zombie: Zombie, blend: number, realDt: number): RenderZombie {
    const previous = zombie.renderPrevious;
    const position: Vec3 = [
      previous.pos[0] + (zombie.body.pos[0] - previous.pos[0]) * blend,
      previous.pos[1] + (zombie.body.pos[1] - previous.pos[1]) * blend,
      previous.pos[2] + (zombie.body.pos[2] - previous.pos[2]) * blend,
    ];
    const yawBefore = Math.atan2(-previous.facing[0], -previous.facing[2]);
    const yawAfter = Math.atan2(-zombie.facing[0], -zombie.facing[2]);
    const yawDelta = Math.atan2(Math.sin(yawAfter - yawBefore), Math.cos(yawAfter - yawBefore));
    return {
      id,
      zombie,
      position,
      yaw: yawBefore + yawDelta * blend,
      headYaw: previous.headYaw + (zombie.headYaw - previous.headYaw) * blend,
      gaitPhase: previous.gaitPhase + (zombie.gaitPhase - previous.gaitPhase) * blend,
      verticalOffset: this.verticalOffset(id, position, zombie.body.onGround, realDt),
    };
  }

  private syncPart(part: Part, zombies: RenderZombie[]): void {
    const mesh = this.meshes.get(part)!;
    const visible = zombies.filter(({ zombie }) => zombie.regions[REGION_FOR_PART[part]] > 0);
    mesh.count = Math.min(visible.length, mesh.instanceMatrix.count);
    const s = this.blockSize;
    for (let i = 0; i < mesh.count; i++) {
      const { zombie, position, yaw, headYaw, gaitPhase, verticalOffset } = visible[i]!;
      const box = FIGURE_BOXES[part];
      const [x, y, z] = position;
      const partYaw = yaw + (part === 'head' ? headYaw : 0);
      const offsetX = box.at[0] * Math.cos(yaw) + box.at[2] * Math.sin(yaw);
      const offsetZ = -box.at[0] * Math.sin(yaw) + box.at[2] * Math.cos(yaw);
      const moving = Math.hypot(zombie.body.vel[0], zombie.body.vel[2]) > 0.05;
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

  sync(store: EntityStore<Zombie>, realDt = 0, alpha = 1, freezeLiving = false): void {
    const blend = Math.max(0, Math.min(1, alpha));
    const zombies = [...store.entries()].map(([id, zombie]) =>
      this.renderPose(id, zombie, blend, freezeLiving ? 0 : realDt),
    );
    this.discardMissingOffsets(new Set(zombies.map(({ id }) => id)));
    for (const part of PARTS) {
      this.syncPart(part, zombies);
    }
  }
}
