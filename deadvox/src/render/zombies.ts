import { BoxGeometry, DynamicDrawUsage, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import type { EntityId, EntityStore } from '../core/entities.ts';
import type { Zombie } from '../core/zombies.ts';
import { FIGURE_BOXES, FIGURE_PARTS, type FigurePart } from './figure.ts';
import { StepOffset } from './stepOffset.ts';

type Part = FigurePart;

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
      const material = new MeshLambertMaterial({ color: flesh ? 0x87_96_78 : 0x68_6f_5e });
      const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, capacity);
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.meshes.set(part, mesh);
      this.group.add(mesh);
    }
  }

  private verticalOffset(id: EntityId, zombie: Zombie, realDt: number): number {
    let stepOffset = this.stepOffsets.get(id);
    if (!stepOffset) {
      stepOffset = new StepOffset(0.5);
      this.stepOffsets.set(id, stepOffset);
    }
    const [x, y, z] = zombie.body.pos;
    return stepOffset.update(
      [x * this.blockSize, y * this.blockSize, z * this.blockSize],
      zombie.body.onGround,
      realDt,
    );
  }

  private discardMissingOffsets(activeIds: ReadonlySet<EntityId>): void {
    for (const id of this.stepOffsets.keys()) {
      if (!activeIds.has(id)) {
        this.stepOffsets.delete(id);
      }
    }
  }

  sync(store: EntityStore<Zombie>, realDt = 0): void {
    const zombies = [...store.entries()].map(([id, zombie]) => ({
      id,
      zombie,
      verticalOffset: this.verticalOffset(id, zombie, realDt),
    }));
    this.discardMissingOffsets(new Set(zombies.map(({ id }) => id)));
    const s = this.blockSize;
    for (const part of FIGURE_PARTS) {
      const mesh = this.meshes.get(part)!;
      mesh.count = Math.min(zombies.length, mesh.instanceMatrix.count);
      for (let i = 0; i < mesh.count; i++) {
        const { zombie, verticalOffset } = zombies[i]!;
        const box = FIGURE_BOXES[part];
        const [x, y, z] = zombie.body.pos;
        const yaw = Math.atan2(-zombie.facing[0], -zombie.facing[2]);
        const offsetX = box.at[0] * Math.cos(yaw) + box.at[2] * Math.sin(yaw);
        const offsetZ = -box.at[0] * Math.sin(yaw) + box.at[2] * Math.cos(yaw);
        const moving = Math.hypot(zombie.body.vel[0], zombie.body.vel[2]) > 0.05;
        const isLeg = part === 'leftLeg' || part === 'rightLeg';
        const stride = (part === 'leftLeg' ? 1 : -1) * Math.sin(zombie.gaitPhase) * 0.22;
        this.dummy.position.set(x * s + offsetX, y * s + verticalOffset + box.at[1], z * s + offsetZ);
        this.dummy.rotation.set(0, yaw, 0);
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
  }
}
