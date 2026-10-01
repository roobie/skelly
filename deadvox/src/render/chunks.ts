import {
  type Box3,
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Frustum,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Sphere,
} from 'three';
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

// Vertex colours are authored as sRGB bytes but three.js treats them as linear, so they render
// paler than authored. This is the exact piecewise sRGB EOTF (not pow 2.2, which crushes the
// darks differently), applied only while the `uLinearColors` uniform is 1.
const SRGB_TO_LINEAR = `
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}`;

/** Lambert with vertex colours, plus the per-block variation. `linearColors` is shared with the compiled shader. */
const chunkMaterial = (blockSize: number, linearColors: { value: number }): MeshLambertMaterial => {
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBlockSize = { value: blockSize };
    shader.uniforms.uLinearColors = linearColors;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uBlockSize;\n${CELL_VARYING}`)
      .replace(
        '#include <begin_vertex>',
        // Half a block inside the face, in world block coordinates.
        '#include <begin_vertex>\nvCell = (modelMatrix * vec4(position - normal * 0.5, 1.0)).xyz / uBlockSize;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uLinearColors;\n${CELL_VARYING}\n${CELL_HASH}\n${SRGB_TO_LINEAR}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (uLinearColors > 0.5) diffuseColor.rgb = srgbToLinear(diffuseColor.rgb);
diffuseColor.rgb *= 0.94 + 0.12 * cellHash(floor(vCell + 1e-3));`,
      );
  };
  material.customProgramCacheKey = () => 'deadvox-chunk';
  return material;
};

/**
 * Owns the three.js meshes for chunks, keyed by chunk key, and culls them: `cull` hides
 * the meshes whose tight box is outside the camera's frustum, far plane included.
 */
export class ChunkMeshes {
  readonly group = new Group();
  private readonly meshes = new Map<string, Mesh>();
  /** Each mesh's tight box, in metres. */
  private readonly boxes = new Map<Mesh, Box3>();
  private readonly material: MeshLambertMaterial;
  private readonly blockSize: number;
  private readonly linearColors = { value: 0 };
  private readonly frustum = new Frustum();
  private readonly viewProjection = new Matrix4();

  /** Meshes are in blocks; the group scales them to metres. */
  constructor(blockSize: number) {
    this.material = chunkMaterial(blockSize, this.linearColors);
    this.blockSize = blockSize;
    this.group.scale.setScalar(blockSize);
  }

  /** Whether block colours are decoded from sRGB to linear before lighting. Off by default. */
  get linearColorsOn(): boolean {
    return this.linearColors.value > 0.5;
  }

  /** Takes effect next frame; the uniform is shared, so no recompile. */
  setLinearColors(on: boolean): void {
    this.linearColors.value = on ? 1 : 0;
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
    // Tight bounds: a chunk with only ground in its bottom blocks gets a flat box, not a
    // box around the whole chunk.
    geometry.computeBoundingBox();
    geometry.boundingSphere = geometry.boundingBox!.getBoundingSphere(new Sphere());
    const mesh = new Mesh(geometry, this.material);
    mesh.position.set(...origin);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.frustumCulled = false; // `cull` does it, with the box
    // The group only scales, so a box in blocks becomes metres by the block size.
    const box = geometry.boundingBox!.clone().translate(mesh.position);
    box.min.multiplyScalar(this.blockSize);
    box.max.multiplyScalar(this.blockSize);
    this.meshes.set(key, mesh);
    this.boxes.set(mesh, box);
    this.group.add(mesh);
  }

  /** Shows only the meshes whose box meets the camera's frustum. The camera's matrices must be current. */
  cull(camera: Camera): void {
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    for (const [mesh, box] of this.boxes) {
      mesh.visible = this.frustum.intersectsBox(box);
    }
  }

  remove(key: string): void {
    const mesh = this.meshes.get(key);
    if (!mesh) {
      return;
    }
    this.group.remove(mesh);
    mesh.geometry.dispose();
    this.meshes.delete(key);
    this.boxes.delete(mesh);
  }
}
