import { BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial, Sphere, Vector3 } from 'three';
import { CHUNK } from '../core/coords.ts';
import type { MeshData } from '../core/mesher.ts';

// Per-block brightness variation stands in for textures. It's computed in the
// fragment shader from the block each fragment belongs to, so the mesher can merge
// faces of the same block type into large quads.
const CELL_VARYING = 'varying vec3 vCell;';
const CELL_HASH = `
float cellHash(vec3 c) {
  c = mod(c, 4096.0);
  return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}`;

/** Lambert with vertex colours, plus the per-block variation. */
const chunkMaterial = (blockSize: number): MeshLambertMaterial => {
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBlockSize = { value: blockSize };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uBlockSize;\n${CELL_VARYING}`)
      .replace(
        '#include <begin_vertex>',
        // Half a block inside the face, in world block coordinates.
        '#include <begin_vertex>\nvCell = (modelMatrix * vec4(position - normal * 0.5, 1.0)).xyz / uBlockSize;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CELL_VARYING}\n${CELL_HASH}`)
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= 0.94 + 0.12 * cellHash(floor(vCell + 1e-3));',
      );
  };
  material.customProgramCacheKey = () => 'deadvox-chunk';
  return material;
};

/** Owns the three.js meshes for chunks, keyed by chunk key. */
export class ChunkMeshes {
  readonly group = new Group();
  private readonly meshes = new Map<string, Mesh>();
  private readonly material: MeshLambertMaterial;

  /** Meshes are in blocks; the group scales them to metres. */
  constructor(blockSize: number) {
    this.material = chunkMaterial(blockSize);
    this.group.scale.setScalar(blockSize);
  }

  get count(): number {
    return this.meshes.size;
  }

  keys(): IterableIterator<string> {
    return this.meshes.keys();
  }

  set(key: string, origin: [number, number, number], data: MeshData): void {
    this.remove(key);
    if (data.indices.length === 0) {
      return;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(data.normals, 3, true));
    geometry.setAttribute('color', new BufferAttribute(data.colors, 3, true));
    geometry.setIndex(new BufferAttribute(data.indices, 1));
    geometry.boundingSphere = new Sphere(new Vector3(CHUNK / 2, CHUNK / 2, CHUNK / 2), (CHUNK * Math.sqrt(3)) / 2);
    const mesh = new Mesh(geometry, this.material);
    mesh.position.set(...origin);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.meshes.set(key, mesh);
    this.group.add(mesh);
  }

  remove(key: string): void {
    const mesh = this.meshes.get(key);
    if (!mesh) {
      return;
    }
    this.group.remove(mesh);
    mesh.geometry.dispose();
    this.meshes.delete(key);
  }
}
