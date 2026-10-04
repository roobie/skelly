// Only authored cellar sites allocate fields. Resident placements never form a union across gaps.
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

const RESIDENT_FIELDS = 4;
const FIELD_PADDING_BLOCKS = 2;
interface Field {
  index: number;
  bounds: SkyBounds;
  above: Map<string, boolean>;
  dirty: boolean;
  volume: SkyVolume | undefined;
  entityVersion: number;
  entityKey: string;
}
const vectors = () => Array.from({ length: RESIDENT_FIELDS }, () => new Vector3());
const volumeTexture = (light: Uint8Array, [x, y, z]: Vec3): Data3DTexture => {
  const texture = new Data3DTexture(light, x, z, y);
  texture.format = RedFormat;
  texture.type = UnsignedByteType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
};
export class Skylight {
  private readonly texture = { value: volumeTexture(new Uint8Array([255]), [1, 1, 1]) };
  private readonly patched = new WeakSet<Material>();
  private readonly fields: Field[];
  private active: Field[] = [];
  private readonly enabled = { value: 0 };
  private readonly minimum = { value: vectors() };
  private readonly extent = { value: vectors() };
  private readonly atlasScale = { value: vectors() };
  private readonly atlasOffset = { value: new Float32Array(RESIDENT_FIELDS) };
  private readonly blockSize: number;
  private readonly top: number;
  private readonly rangeSquared: number;

  constructor(boxes: readonly SkyBounds[], blockSize: number, top: number, viewRadiusM: number) {
    this.blockSize = blockSize;
    this.top = top;
    this.rangeSquared = (viewRadiusM / blockSize) ** 2;
    this.fields = boxes.map((box, index) => ({
      index,
      bounds: {
        min: box.min.map((value) => value - FIELD_PADDING_BLOCKS) as Vec3,
        max: box.max.map((value) => value + FIELD_PADDING_BLOCKS) as Vec3,
      },
      above: new Map(),
      volume: undefined,
      dirty: true,
      entityVersion: -1,
      entityKey: '',
    }));
  }

  /** Data and mesh changes invalidate intersecting columns, including cached occluders above the box. */
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

  private nearby(position: Vec3): Field[] {
    return (
      this.fields
        .map((field) => ({
          field,
          distance: position.reduce(
            (sum, value, axis) =>
              sum + Math.max(field.bounds.min[axis]! - value, 0, value - field.bounds.max[axis]!) ** 2,
            0,
          ),
        }))
        .filter(({ distance }) => distance <= this.rangeSquared)
        .sort((a, b) => a.distance - b.distance || a.field.index - b.field.index)
        .slice(0, RESIDENT_FIELDS)
        .map(({ field }) => field)
        // Atlas slots do not swap just because two already-resident fields trade nearest rank.
        .sort((a, b) => a.index - b.index)
    );
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

  update(scene: Scene, position: Vec3, { entities }: { entities: BlockEntities }, opaque: SolidAt): void {
    const resident = this.nearby(position);
    let upload =
      resident.length !== this.active.length || resident.some((field, index) => field !== this.active[index]);
    for (const field of this.active) {
      if (!resident.includes(field)) {
        field.volume = undefined;
        field.above.clear();
        field.dirty = true;
      }
    }
    this.active = resident;
    this.enabled.value = resident.length;
    for (const field of resident) {
      this.refreshEntities(field, entities);
      if (field.dirty) {
        field.volume = buildSkylight(field.bounds, this.top, opaque, field.above);
        field.dirty = false;
        upload = true;
      }
    }
    if (upload) {
      this.upload();
    }
    // Drops, lazy spent-case meshes and asynchronously prepared models need no mesh/entity revision.
    scene.traverse((object) => {
      const { material } = object as Mesh;
      if (material) {
        for (const entry of Array.isArray(material) ? material : [material]) {
          this.patch(entry);
        }
      }
    });
  }

  private upload(): void {
    const size: Vec3 = [
      Math.max(1, ...this.active.map((field) => field.volume!.size[0])),
      Math.max(
        1,
        this.active.reduce((sum, field) => sum + field.volume!.size[1], 0),
      ),
      Math.max(1, ...this.active.map((field) => field.volume!.size[2])),
    ];
    const light = new Uint8Array(size[0] * size[1] * size[2]).fill(255);
    let offset = 0;
    this.active.forEach((field, slot) => {
      const volume = field.volume!;
      for (let y = 0; y < volume.size[1]; y++) {
        for (let z = 0; z < volume.size[2]; z++) {
          const start = skyIndex(volume.size, 0, y, z);
          light.set(volume.light.subarray(start, start + volume.size[0]), skyIndex(size, 0, offset + y, z));
        }
      }
      this.minimum.value[slot]!.set(...field.bounds.min).multiplyScalar(this.blockSize);
      this.extent.value[slot]!.set(...volume.size).multiplyScalar(this.blockSize);
      this.atlasScale.value[slot]!.set(volume.size[0] / size[0], volume.size[2] / size[2], volume.size[1] / size[1]);
      this.atlasOffset.value[slot] = offset / size[1];
      offset += volume.size[1];
    });
    this.texture.value.dispose();
    this.texture.value = volumeTexture(light, size);
  }

  /** Same resident-field sky estimate as the world shader, for flashlight adaptation. Metres. */
  at(position: Vec3): number {
    for (const field of this.active) {
      const { size, light } = field.volume!;
      const cell = position.map((value, axis) => Math.floor(value / this.blockSize) - field.bounds.min[axis]!) as Vec3;
      if (cell.every((value, axis) => value >= 0 && value < size[axis]!)) {
        return light[skyIndex(size, ...cell)]! / 255;
      }
    }
    return 1;
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
      shader.uniforms.uSkyAtlasScale = this.atlasScale;
      shader.uniforms.uSkyAtlasOffset = this.atlasOffset;
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
uniform vec3 uSkyMinimum[${RESIDENT_FIELDS}];
uniform vec3 uSkyExtent[${RESIDENT_FIELDS}];
uniform vec3 uSkyAtlasScale[${RESIDENT_FIELDS}];
uniform float uSkyAtlasOffset[${RESIDENT_FIELDS}];
uniform float uSkyEnabled;
varying vec3 vSkyWorld;
varying vec3 vSkyNormal;
float skyVisibility() {
  for (int i = 0; i < ${RESIDENT_FIELDS}; i++) {
    if (float(i) >= uSkyEnabled) break;
    vec3 cell = (vSkyWorld + normalize(vSkyNormal) * ${this.blockSize * 0.5} - uSkyMinimum[i]) / uSkyExtent[i];
    if (any(lessThan(cell, vec3(0.0))) || any(greaterThanEqual(cell, vec3(1.0)))) continue;
    // Clamp to this field's texel centres so linear sampling never leaks into the next atlas slice.
    vec3 halfCell = vec3(${this.blockSize * 0.5}) / uSkyExtent[i];
    vec3 atlas = clamp(cell, halfCell, vec3(1.0) - halfCell).xzy * uSkyAtlasScale[i];
    atlas.z += uSkyAtlasOffset[i];
    return texture(uSkyVolume, atlas).r;
  }
  return 1.0;
}`,
        )
        .replace('#include <lights_fragment_end>', 'irradiance *= skyVisibility();\n#include <lights_fragment_end>');
    };
    material.customProgramCacheKey = () => `${key.call(material)}:bounded-voxel-skylight`;
    material.needsUpdate = true;
  }
}
