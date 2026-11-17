import type { Vec3 } from '@skelly/engine/world';
import { Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';

/** A content look for a shot drawn as a plain sphere. */
export interface GlobLook {
  readonly color: string;
  readonly radiusMetres: number;
}

/** One unlit sphere per shot in flight, so every kind of shot is drawn alike; positions are in blocks. */
export class ShotGlobs {
  readonly group = new Group();
  private readonly geometry = new SphereGeometry(1, 8, 6);
  private readonly meshes: Mesh<SphereGeometry, MeshBasicMaterial>[] = [];
  private readonly blockSize: number;

  constructor(blockSize: number) {
    this.blockSize = blockSize;
  }

  sync<T extends { readonly pos: Vec3 }>(shots: readonly T[], look: (shot: T) => GlobLook): void {
    while (this.meshes.length > shots.length) {
      const mesh = this.meshes.pop()!;
      mesh.removeFromParent();
      mesh.material.dispose();
    }
    for (const [index, shot] of shots.entries()) {
      let mesh = this.meshes[index];
      if (!mesh) {
        mesh = new Mesh(this.geometry, new MeshBasicMaterial());
        this.group.add(mesh);
        this.meshes.push(mesh);
      }
      const { color, radiusMetres } = look(shot);
      mesh.material.color.set(color);
      mesh.scale.setScalar(radiusMetres);
      mesh.position.set(shot.pos[0] * this.blockSize, shot.pos[1] * this.blockSize, shot.pos[2] * this.blockSize);
    }
  }

  /** Shots drawn, for tests and the smoke flow. */
  get count(): number {
    return this.meshes.length;
  }

  dispose(): void {
    this.geometry.dispose();
    for (const mesh of this.meshes) {
      mesh.material.dispose();
    }
    this.meshes.length = 0;
    this.group.clear();
  }
}
