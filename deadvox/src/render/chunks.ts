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
import { patchHeightFog } from './heightFog.ts';
import { SURFACE_PATTERN_GLSL } from './surfacePatterns.ts';

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

// Per-quad surface pattern: its id (constant per quad, so interpolation only needs rounding),
// the fragment's world position in metres and the face normal (object space is axis-aligned and
// the group only scales, so it is the world normal too).
const PATTERN_VARYING = 'varying float vPattern;\nvarying vec3 vWorld;\nvarying vec3 vFaceN;';

/**
 * Lambert with vertex colours, plus the per-block variation or, on patterned blocks, the surface
 * pattern. `linearColors` and `patterns` are shared with the compiled shader, so changing them
 * doesn't recompile.
 */
const chunkMaterial = (
  blockSize: number,
  linearColors: { value: number },
  patterns: { value: number },
): MeshLambertMaterial => {
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBlockSize = { value: blockSize };
    shader.uniforms.uLinearColors = linearColors;
    shader.uniforms.uPatterns = patterns;
    patchHeightFog(shader);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uBlockSize;\nattribute float pattern;\n${CELL_VARYING}\n${PATTERN_VARYING}`,
      )
      .replace(
        '#include <begin_vertex>',
        // Half a block inside the face, in world block coordinates.
        `#include <begin_vertex>
vCell = (modelMatrix * vec4(position - normalize(normal) * 0.5, 1.0)).xyz / uBlockSize;
vPattern = pattern;
vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
vFaceN = normalize(normal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uLinearColors;\nuniform float uPatterns;\n${CELL_VARYING}\n${PATTERN_VARYING}\n${CELL_HASH}\n${SRGB_TO_LINEAR}\n${SURFACE_PATTERN_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        // The sRGB decode comes first so patterns modulate decoded colour. A patterned block's own
        // shading replaces the per-block hash (its cell jitter would otherwise cut across joints);
        // with patterns off every block gets the hash, as before. The derivatives are taken here, in
        // uniform control flow, whatever the block.
        `#include <color_fragment>
if (uLinearColors > 0.5) diffuseColor.rgb = srgbToLinear(diffuseColor.rgb);
vec2 patUV = surfaceUV(vWorld, vFaceN);
vec2 patFw = fwidth(patUV);
float patId = floor(vPattern + 0.5);
float patSeed = dot(abs(vFaceN), vec3(7.13, 13.7, 3.31));
diffuseColor.rgb *= (uPatterns > 0.5 && patId > 0.5)
  ? patternShade(patId, patUV, max(patFw.x, patFw.y), patFw, patSeed)
  : 0.94 + 0.12 * cellHash(floor(vCell + 1e-3));`,
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
  private readonly patterns = { value: 1 };
  private readonly frustum = new Frustum();
  private readonly viewProjection = new Matrix4();
  private changes = 0;

  /** Meshes are in blocks; the group scales them to metres. */
  constructor(blockSize: number) {
    this.material = chunkMaterial(blockSize, this.linearColors, this.patterns);
    this.blockSize = blockSize;
    this.group.scale.setScalar(blockSize);
    // Never drawn and not in `boxes`, so `cull` leaves it hidden. It only puts the chunk material
    // on a mesh before any chunk exists, so `renderer.compile` can build the game's heaviest shader early.
    const warmUp = new Mesh(new BufferGeometry(), this.material);
    warmUp.visible = false;
    warmUp.receiveShadow = true;
    this.group.add(warmUp);
  }

  /** Bumps whenever a chunk mesh is added, replaced or removed, so a cached shadow map knows it is stale. */
  get version(): number {
    return this.changes;
  }

  /** Whether block colours are decoded from sRGB to linear before lighting. Off unless the game or debug controls turn it on. */
  get linearColorsOn(): boolean {
    return this.linearColors.value > 0.5;
  }

  /** Takes effect next frame; the uniform is shared, so no recompile. */
  setLinearColors(on: boolean): void {
    this.linearColors.value = on ? 1 : 0;
  }

  /** Whether patterned blocks draw their procedural surface pattern. On by default. */
  get patternsOn(): boolean {
    return this.patterns.value > 0.5;
  }

  /** Takes effect next frame; the uniform is shared, so no recompile. */
  setPatterns(on: boolean): void {
    this.patterns.value = on ? 1 : 0;
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
    geometry.setAttribute('pattern', new BufferAttribute(data.patterns, 1));
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
    mesh.receiveShadow = true; // every chunk receives; `selectShadowCasters` picks the ones that cast
    // The group only scales, so a box in blocks becomes metres by the block size.
    const box = geometry.boundingBox!.clone().translate(mesh.position);
    box.min.multiplyScalar(this.blockSize);
    box.max.multiplyScalar(this.blockSize);
    this.meshes.set(key, mesh);
    this.boxes.set(mesh, box);
    this.group.add(mesh);
    this.changes += 1;
  }

  /**
   * Makes the meshes whose tight box passes `casts` the shadow casters, and shows exactly those: the
   * shadow pass skips hidden meshes, so a chunk behind the camera can still shade what is in front of it.
   * The render's main pass is already queued when this runs (from the shadow hook), and `cull` sets
   * visibility afresh before the next one. Returns how many cast.
   */
  selectShadowCasters(casts: (box: Box3) => boolean): number {
    let count = 0;
    for (const [mesh, box] of this.boxes) {
      const on = casts(box);
      mesh.castShadow = on;
      mesh.visible = on;
      count += on ? 1 : 0;
    }
    return count;
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
    this.changes += 1;
  }
}
