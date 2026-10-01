import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, type Scene } from 'three';
import type { ZombieAim } from '../core/zombies.ts';

const GREEN = 0x00_ff_50;
const AMBER = 0xff_b5_00;
const BOX_EDGES = [
  [0, 1],
  [0, 2],
  [0, 4],
  [1, 3],
  [1, 5],
  [2, 3],
  [2, 6],
  [3, 7],
  [4, 5],
  [4, 6],
  [5, 7],
  [6, 7],
] as const;

/** Debug-only wireframe of exactly the posed voxel boxes returned by ZombieSystem.aimAt. */
export class DebugAimOverlay {
  readonly line: LineSegments<BufferGeometry, LineBasicMaterial>;
  private boxes: ZombieAim['boxes'] = [];
  private position = new BufferAttribute(new Float32Array(0), 3);
  private readonly blockSize: number;

  constructor(scene: Scene, blockSize: number) {
    this.blockSize = blockSize;
    this.line = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: GREEN, depthTest: false, transparent: true, opacity: 0.95 }),
    );
    this.line.frustumCulled = false;
    this.line.renderOrder = 1000;
    this.line.geometry.setAttribute('position', this.position);
    scene.add(this.line);
  }

  get aimedBoxes(): ZombieAim['boxes'] {
    return this.boxes;
  }

  update(aim: ZombieAim | undefined): void {
    this.boxes = aim?.boxes ?? [];
    this.line.visible = this.boxes.length > 0;
    this.line.material.color.setHex(aim?.inReach ? GREEN : AMBER);
    const vertices: number[] = [];
    for (const box of this.boxes) {
      const corners = Array.from({ length: 8 }, (_, index) => {
        const local = [
          index & 1 ? box.halfSize[0] : -box.halfSize[0],
          index & 2 ? box.halfSize[1] : -box.halfSize[1],
          index & 4 ? box.halfSize[2] : -box.halfSize[2],
        ];
        return [0, 1, 2].map(
          (axis) =>
            box.center[axis]! * this.blockSize +
            box.rotation[axis * 3]! * local[0]! +
            box.rotation[axis * 3 + 1]! * local[1]! +
            box.rotation[axis * 3 + 2]! * local[2]!,
        );
      });
      for (const [first, second] of BOX_EDGES) {
        vertices.push(...corners[first]!, ...corners[second]!);
      }
    }
    if (this.position.array.length !== vertices.length) {
      this.line.geometry.dispose();
      this.position = new BufferAttribute(new Float32Array(vertices.length), 3);
      this.line.geometry.setAttribute('position', this.position);
    }
    this.position.array.set(vertices);
    this.position.needsUpdate = true;
    this.line.geometry.setDrawRange(0, vertices.length / 3);
    if (vertices.length > 0) {
      this.line.geometry.computeBoundingSphere();
    } else {
      this.line.geometry.boundingSphere = null;
    }
  }

  dispose(): void {
    this.line.removeFromParent();
    this.line.geometry.dispose();
    this.line.material.dispose();
  }
}
