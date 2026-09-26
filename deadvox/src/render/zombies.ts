import { BoxGeometry, DynamicDrawUsage, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import type { EntityStore } from '../core/entities.ts';
import type { Zombie } from '../core/zombies.ts';

type Part = 'body' | 'head' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
const PARTS: readonly Part[] = ['body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
const BOXES: Record<Part, { size: [number, number, number]; at: [number, number, number] }> = {
  body: { size: [0.42, 0.78, 0.28], at: [0, 1.02, 0] },
  head: { size: [0.3, 0.32, 0.3], at: [0, 1.58, 0] },
  leftArm: { size: [0.15, 0.68, 0.16], at: [-0.225, 1.02, 0] },
  rightArm: { size: [0.15, 0.68, 0.16], at: [0.225, 1.02, 0] },
  leftLeg: { size: [0.18, 0.62, 0.2], at: [-0.12, 0.62, 0] },
  rightLeg: { size: [0.18, 0.62, 0.2], at: [0.12, 0.62, 0] },
};

/** Six instanced boxes, never one draw object per shambler. */
export class ZombieMeshes {
  readonly group = new Group();
  private readonly meshes = new Map<Part, InstancedMesh>();
  private readonly dummy = new Object3D();
  private readonly blockSize: number;

  constructor(blockSize: number, capacity = 64) {
    this.blockSize = blockSize;
    for (const part of PARTS) {
      const flesh = part === 'body' || part === 'head';
      const material = new MeshLambertMaterial({
        color: flesh ? 0x87_96_78 : 0x68_6f_5e,
        emissive: flesh ? 0x17_22_14 : 0x11_15_0f,
      });
      const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, capacity);
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.meshes.set(part, mesh);
      this.group.add(mesh);
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: builds every body part's transform in a single render synchronization pass.
  sync(store: EntityStore<Zombie>): void {
    const zombies = [...store.entries()];
    const s = this.blockSize;
    for (const part of PARTS) {
      const mesh = this.meshes.get(part)!;
      mesh.count = Math.min(zombies.length, mesh.instanceMatrix.count);
      for (let i = 0; i < mesh.count; i++) {
        const [, zombie] = zombies[i]!;
        const box = BOXES[part];
        const [x, y, z] = zombie.body.pos;
        const yaw = Math.atan2(-zombie.facing[0], -zombie.facing[2]);
        const offsetX = box.at[0] * Math.cos(yaw) + box.at[2] * Math.sin(yaw);
        const offsetZ = -box.at[0] * Math.sin(yaw) + box.at[2] * Math.cos(yaw);
        const moving = Math.hypot(zombie.body.vel[0], zombie.body.vel[2]) > 0.05;
        const frame = moving && Math.floor(zombie.shuffle * 4) % 2 === 0 ? 1 : -1;
        const isLeg = part === 'leftLeg' || part === 'rightLeg';
        const stride = part === 'leftLeg' ? frame * 0.22 : -frame * 0.22;
        this.dummy.position.set(x * s + offsetX, y * s + box.at[1], z * s + offsetZ);
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
