import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { type BlockEntities, panelFor } from '../core/blockEntities.ts';
import { DECAL_KINDS } from '../core/decalKinds.ts';
import { Rng } from '../core/random.ts';
import type { DecalDef } from '../core/schema.ts';
import { type Placement, placedDecals } from '../core/templates.ts';
import type { GameSeconds } from '../core/time.ts';
import { STAIN_NOISE_GLSL } from './bloodStain.ts';
import { patchHeightFog } from './heightFog.ts';

const faceNormals = {
  n: [0, 0, -1],
  e: [1, 0, 0],
  s: [0, 0, 1],
  w: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
} as const;

const decalVertices = (
  kind: DecalDef['kind'],
  strokes: DecalDef['variants'][number]['strokes'],
  vertex: (x: number, y: number, stain: number) => void,
): void => {
  if (DECAL_KINDS[kind] === 'stain') {
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
      [1, 1],
      [0, 1],
    ]) {
      vertex(x!, y!, 1);
    }
    return;
  }
  for (const [x0, y0, x1, y1, width] of strokes) {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const dx = ((-(y1 - y0) / length) * width) / 2;
    const dy = (((x1 - x0) / length) * width) / 2;
    for (const [x, y] of [
      [x0 + dx, y0 + dy],
      [x0 - dx, y0 - dy],
      [x1 - dx, y1 - dy],
      [x0 + dx, y0 + dy],
      [x1 - dx, y1 - dy],
      [x1 + dx, y1 + dy],
    ]) {
      vertex(x!, y!, 0);
    }
  }
};

/** Static, one-draw presentation. No entities, occupancy or saved state. */
export class AuthoredDecals {
  readonly mesh: Mesh<BufferGeometry, MeshLambertMaterial>;
  private readonly attachments: { anchor: [number, number, number]; start: number; end: number }[] = [];
  private readonly basePositions: Float32Array;
  private readonly baseNormals: Float32Array;
  private readonly blockSize: number;
  private drawn = -1;

  constructor(
    placements: readonly Placement[],
    {
      seed,
      blockSize,
      ageGameSeconds,
      limit,
    }: { seed: number; blockSize: number; ageGameSeconds: GameSeconds; limit: number },
  ) {
    this.blockSize = blockSize;
    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const looks: number[] = [];
    const normalValues: number[] = [];
    const point = new Vector3();
    const quaternion = new Quaternion();
    const front = new Vector3(0, 0, 1);
    const color = new Color();
    const aged = new Color();
    const add = (decal: DecalDef) => {
      const start = positions.length / 3;
      const rng = Rng.stream(seed, `decal:${decal.at.join(',')}:${decal.kind}`);
      const look = decal.variants[rng.int(0, decal.variants.length - 1)]!;
      const age = Math.min(1, ageGameSeconds / look.ageingGameHours);
      color.set(look.color).lerp(aged.set(look.agedColor), age);
      const opacity = look.opacity + (look.agedOpacity - look.opacity) * age;
      const normal = new Vector3(...faceNormals[decal.normal]);
      quaternion.setFromUnitVectors(front, normal).multiply(new Quaternion().setFromAxisAngle(front, decal.rotation));
      const vertex = (x: number, y: number, stain: number) => {
        point.set((x - 0.5) * look.sizeMetres[0], (y - 0.5) * look.sizeMetres[1], 0).applyQuaternion(quaternion);
        positions.push(
          point.x + decal.at[0] * blockSize,
          point.y + decal.at[1] * blockSize,
          point.z + decal.at[2] * blockSize,
        );
        colors.push(color.r, color.g, color.b);
        normalValues.push(...normal.toArray());
        uvs.push(x, y);
        looks.push(opacity, look.noiseScale, look.edgeRaggedness, stain);
      };
      decalVertices(decal.kind, look.strokes, vertex);
      if (decal.door) {
        this.attachments.push({ anchor: decal.door, start, end: positions.length / 3 });
      }
    };
    for (const decal of placements.flatMap(placedDecals).slice(0, limit)) {
      add(decal);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normalValues, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('decalLook', new Float32BufferAttribute(looks, 4));
    const material = new MeshLambertMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -1,
    });
    material.customProgramCacheKey = () => 'authored-decals';
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec4 decalLook; varying vec4 vDecalLook; varying vec2 vDecalUv;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDecalLook = decalLook; vDecalUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec4 vDecalLook; varying vec2 vDecalUv;\n${STAIN_NOISE_GLSL}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float edge = length((vDecalUv - 0.5) * 2.0);
          float noise = stainNoise(vec3(vDecalUv * vDecalLook.y, 0.0));
          if (vDecalLook.w > 0.5 && edge > 1.0 - noise * vDecalLook.z) discard;
          diffuseColor.a *= vDecalLook.x;
        `,
        );
      patchHeightFog(shader);
    };
    this.basePositions = Float32Array.from(positions);
    this.baseNormals = Float32Array.from(normalValues);
    this.mesh = new Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'authored-decals';
  }

  /** Door marks follow the ordinary panel owner; unloaded or removed doors show no floating mark. */
  sync(entities: BlockEntities): void {
    if (this.drawn === entities.version || this.attachments.length === 0) {
      return;
    }
    this.drawn = entities.version;
    const positions = this.mesh.geometry.getAttribute('position');
    const normals = this.mesh.geometry.getAttribute('normal');
    for (const { anchor, start, end } of this.attachments) {
      const entity = entities.doorAt(...anchor);
      if (!entity) {
        for (let i = start; i < end; i++) {
          positions.setXYZ(i, 0, 0, 0);
        }
        continue;
      }
      const panel = panelFor(entity, entities.defOf(entity), this.blockSize);
      const angle = panel.rotationY;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      for (let i = start; i < end; i++) {
        const x = this.basePositions[i * 3]! - panel.pivot[0];
        const z = this.basePositions[i * 3 + 2]! - panel.pivot[2];
        positions.setXYZ(
          i,
          panel.pivot[0] + x * cos + z * sin,
          this.basePositions[i * 3 + 1]!,
          panel.pivot[2] - x * sin + z * cos,
        );
        const nx = this.baseNormals[i * 3]!;
        const nz = this.baseNormals[i * 3 + 2]!;
        normals.setXYZ(i, nx * cos + nz * sin, this.baseNormals[i * 3 + 1]!, -nx * sin + nz * cos);
      }
    }
    positions.needsUpdate = true;
    normals.needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
