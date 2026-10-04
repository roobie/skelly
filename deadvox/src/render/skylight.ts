// Only authored cellar sites allocate fields. One placement is active; distant placements never form a union.
import {
  Data3DTexture,
  LinearFilter,
  type Material,
  type Mesh,
  RedFormat,
  type Scene,
  UnsignedByteType,
  Vector3,
} from 'three';
import type { BlockEntities } from '../core/blockEntities.ts';
import { CHUNK, type Vec3 } from '../core/coords.ts';
import type { SolidAt } from '../core/raycast.ts';
import { buildSkylight, type SkyBounds, type SkyVolume, skyIndex } from '../core/skylight.ts';

interface Field {
  bounds: SkyBounds;
  above: Map<string, boolean>;
  dirty: boolean;
  volume?: SkyVolume;
  entityVersion: number;
  entityKey: string;
}

export class Skylight {
  private readonly texture = { value: new Data3DTexture(new Uint8Array([0]), 1, 1, 1) };
  private readonly patched = new WeakSet<Material>();
  private readonly fields: Field[];
  private active: Field | undefined;
  private readonly enabled = { value: 0 };
  private readonly minimum = { value: new Vector3() };
  private readonly extent = { value: new Vector3(1, 1, 1) };
  private meshVersion = -1;
  private entityVersion = -1;
  private readonly blockSize: number;
  private readonly top: number;

  constructor(boxes: readonly SkyBounds[], blockSize: number, top: number) {
    this.blockSize = blockSize;
    this.top = top;
    this.fields = boxes.map((box) => ({
      bounds: {
        min: box.min.map((value) => value - 2) as Vec3,
        max: box.max.map((value) => value + 2) as Vec3,
      },
      above: new Map(),
      dirty: true,
      entityVersion: -1,
      entityKey: '',
    }));
  }

  /** Chunk delivery/removal invalidates only intersecting columns, including cached occluders above the box. */
  chunkChanged(origin: Vec3): void {
    for (const field of this.fields) {
      const { min, max } = field.bounds;
      if (origin[0] >= max[0] || origin[0] + CHUNK <= min[0] || origin[2] >= max[2] || origin[2] + CHUNK <= min[2]) {
        continue;
      }
      field.dirty = true;
      if (origin[1] + CHUNK > max[1]) {
        field.above.clear();
      }
    }
  }

  private nearest(position: Vec3): Field | undefined {
    let nearest: Field | undefined;
    let distance = (32 / this.blockSize) ** 2; // Preload within 32 m; outside, every surface has visibility 1.
    for (const field of this.fields) {
      const squared = position.reduce(
        (sum, value, axis) => sum + Math.max(field.bounds.min[axis]! - value, 0, value - field.bounds.max[axis]!) ** 2,
        0,
      );
      if (squared < distance) {
        nearest = field;
        distance = squared;
      }
    }
    return nearest;
  }

  private refreshEntities(field: Field, entities: BlockEntities): void {
    if (field.entityVersion === entities.version) {
      return;
    }
    field.entityVersion = entities.version;
    const { min, max } = field.bounds;
    const key = JSON.stringify(
      [...entities.all]
        .filter((entity) =>
          entity.pos.every((value, axis) => value < max[axis]! && value + entity.size[axis]! > min[axis]!),
        )
        .map((entity) => [
          entity.uid,
          entity.type,
          entity.pos,
          entity.size,
          entity.facing,
          entities.registry.furniture.get(entity.type)?.door ? entity.open : false,
        ]),
    );
    if (field.entityKey !== key) {
      field.entityKey = key;
      field.dirty = true;
    }
  }

  update(
    scene: Scene,
    position: Vec3,
    { meshVersion, entities }: { meshVersion: number; entities: BlockEntities },
    opaque: SolidAt,
  ): void {
    const field = this.nearest(position);
    const changed = this.active !== field;
    this.active = field;
    this.enabled.value = field ? 1 : 0;
    if (field) {
      this.refreshEntities(field, entities);
      if (field.dirty) {
        const above = (x: number, z: number): boolean => {
          const key = `${x},${z}`;
          const cached = field.above.get(key);
          if (cached !== undefined) {
            return cached;
          }
          let open = true;
          for (let y = this.top; y >= field.bounds.max[1]; y--) {
            if (opaque(x, y, z)) {
              open = false;
              break;
            }
          }
          field.above.set(key, open);
          return open;
        };
        field.volume = buildSkylight(field.bounds, this.top, opaque, above);
      }
      if (changed || field.dirty) {
        const volume = field.volume!;
        const next = new Data3DTexture(volume.light, volume.size[0], volume.size[2], volume.size[1]);
        next.format = RedFormat;
        next.type = UnsignedByteType;
        next.minFilter = LinearFilter;
        next.magFilter = LinearFilter;
        next.unpackAlignment = 1;
        next.needsUpdate = true;
        this.texture.value.dispose();
        this.texture.value = next;
        this.minimum.value.set(...field.bounds.min).multiplyScalar(this.blockSize);
        this.extent.value
          .set(...field.bounds.max)
          .multiplyScalar(this.blockSize)
          .sub(this.minimum.value);
        field.dirty = false;
      }
    }
    // Material hooks are shared and survive uploads. No per-frame scene traversal.
    if (meshVersion !== this.meshVersion || entities.version !== this.entityVersion) {
      this.meshVersion = meshVersion;
      this.entityVersion = entities.version;
      scene.traverse((object) => {
        const { material } = object as Mesh;
        if (material) {
          for (const entry of Array.isArray(material) ? material : [material]) {
            this.patch(entry);
          }
        }
      });
    }
  }

  /** Same local sky estimate as the world shader, for flashlight adaptation. Metres. */
  at(position: Vec3): number {
    const field = this.active;
    if (!field?.volume) {
      return 1;
    }
    const { size, light } = field.volume;
    const cell = position.map((value, axis) => Math.floor(value / this.blockSize) - field.bounds.min[axis]!) as Vec3;
    if (cell.some((value, axis) => value < 0 || value >= size[axis]!)) {
      return 1;
    }
    return light[skyIndex(size, ...cell)]! / 255;
  }

  private patch(material: Material): void {
    if (this.patched.has(material)) {
      return;
    }
    this.patched.add(material);
    const compile = material.onBeforeCompile;
    const key = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      if (!shader.fragmentShader.includes('#include <lights_fragment_end>')) {
        return;
      }
      shader.uniforms.uSkyVolume = this.texture;
      shader.uniforms.uSkyMinimum = this.minimum;
      shader.uniforms.uSkyExtent = this.extent;
      shader.uniforms.uSkyEnabled = this.enabled;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSkyWorld;\nvarying vec3 vSkyNormal;')
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
vec4 skyPosition = vec4(transformed, 1.0);
vec3 skyNormal = objectNormal;
#ifdef USE_INSTANCING
skyPosition = instanceMatrix * skyPosition;
skyNormal = mat3(instanceMatrix) * skyNormal;
#endif
vSkyWorld = (modelMatrix * skyPosition).xyz;
vSkyNormal = normalize(mat3(modelMatrix) * skyNormal);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform highp sampler3D uSkyVolume;
uniform vec3 uSkyMinimum;
uniform vec3 uSkyExtent;
uniform float uSkyEnabled;
varying vec3 vSkyWorld;
varying vec3 vSkyNormal;
float skyVisibility() {
  if (uSkyEnabled < 0.5) return 1.0;
  vec3 cell = (vSkyWorld + normalize(vSkyNormal) * ${this.blockSize * 0.5} - uSkyMinimum) / uSkyExtent;
  if (any(lessThan(cell, vec3(0.0))) || any(greaterThanEqual(cell, vec3(1.0)))) return 1.0;
  return texture(uSkyVolume, cell.xzy).r;
}`,
        )
        .replace('#include <lights_fragment_end>', 'irradiance *= skyVisibility();\n#include <lights_fragment_end>');
    };
    material.customProgramCacheKey = () => `${key.call(material)}:bounded-voxel-skylight`;
    material.needsUpdate = true;
  }
}
