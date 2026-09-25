import * as THREE from 'three';
import { CHUNK } from '../core/coords.ts';
import type { MeshData } from '../core/mesher.ts';

/** Owns the three.js meshes for chunks, keyed by chunk key. */
export class ChunkMeshes {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });

  get count(): number {
    return this.meshes.size;
  }

  keys(): IterableIterator<string> {
    return this.meshes.keys();
  }

  set(key: string, origin: [number, number, number], data: MeshData): void {
    this.remove(key);
    if (data.indices.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3, true));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3, true));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(CHUNK / 2, CHUNK / 2, CHUNK / 2),
      (CHUNK * Math.sqrt(3)) / 2,
    );
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(...origin);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.meshes.set(key, mesh);
    this.group.add(mesh);
  }

  remove(key: string): void {
    const mesh = this.meshes.get(key);
    if (!mesh) return;
    this.group.remove(mesh);
    mesh.geometry.dispose();
    this.meshes.delete(key);
  }
}
