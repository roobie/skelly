import {
  Data3DTexture,
  DataTexture,
  FloatType,
  LinearFilter,
  type Material,
  type Mesh,
  NearestFilter,
  RedFormat,
  RGBAFormat,
  type Scene,
  ShaderChunk,
  UnsignedByteType,
  Vector2,
  Vector3,
} from 'three';
import { CHUNK, type Vec3 } from '../core/coords.ts';
import type { Sky } from '../core/sky.ts';
import { type SkyField, type SkyFields, type SkySubmit, skyRoofAt } from '../core/skyField.ts';
import { skyIndex } from '../core/skylight.ts';
import { containsSky } from '../core/skySnapshot.ts';
import { type SkyResult, sampleSky } from '../core/skyTransport.ts';
import { FADE_SHARPNESS, HALF_BRIGHTNESS } from './flashlight.ts';
import { SKY_ANCHOR_ATTRIBUTE } from './skyAnchor.ts';

const SPOT_LIGHT_INFO_CALL = /getSpotLightInfo\([^;]+\);/;
const DIRECTIONAL_LIGHT_INFO_CALL = /getDirectionalLightInfo\([^;]+\);/;
const RESIDENT_FIELDS = 4;
const PREFETCH_M = 16;
interface SkyRuntime {
  submit: SkySubmit;
  clock?: () => number;
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
const floatTexture = (data: Float32Array, width: number, height: number, rgba = false): DataTexture => {
  const texture = new DataTexture(data, width, height, rgba ? RGBAFormat : RedFormat, FloatType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
};
function regionIndex(fields: readonly SkyField[]) {
  const x0 = fields.length > 0 ? Math.floor(Math.min(...fields.map((field) => field.bounds.min[0])) / CHUNK) : 0;
  const z0 = fields.length > 0 ? Math.floor(Math.min(...fields.map((field) => field.bounds.min[2])) / CHUNK) : 0;
  const width = fields.length > 0 ? Math.ceil(Math.max(...fields.map((field) => field.bounds.max[0])) / CHUNK) - x0 : 1;
  const height =
    fields.length > 0 ? Math.ceil(Math.max(...fields.map((field) => field.bounds.max[2])) / CHUNK) - z0 : 1;
  const cells: number[][] = Array.from({ length: width * height }, () => []);
  fields.forEach((field, index) => {
    for (let z = Math.floor(field.bounds.min[2] / CHUNK); z < Math.ceil(field.bounds.max[2] / CHUNK); z++) {
      for (let x = Math.floor(field.bounds.min[0] / CHUNK); x < Math.ceil(field.bounds.max[0] / CHUNK); x++) {
        cells[x - x0 + width * (z - z0)]!.push(index);
      }
    }
  });
  const grid = new Float32Array(cells.length * 4);
  const indices: number[] = [];
  cells.forEach((cell, index) => {
    grid[index * 4] = indices.length;
    grid[index * 4 + 1] = cell.length;
    indices.push(...cell);
  });
  return {
    grid: { value: floatTexture(grid, width, height, true) },
    indices: {
      value: floatTexture(Float32Array.from(indices.length > 0 ? indices : [0]), Math.max(1, indices.length), 1),
    },
    origin: { value: new Vector2(x0, z0) },
    size: { value: new Vector2(width, height) },
    maximum: Math.max(1, ...cells.map((cell) => cell.length)),
    length: Math.max(1, indices.length),
  };
}
/**
 * An upload view over the shared sky field cache: it asks the cache to build fields near the camera off
 * the main thread and draws the results the cache holds. A field the cache has not built draws open sky,
 * as the cache answers there; one being rebuilt keeps its last complete result until the new one lands.
 */
export class Skylight {
  private readonly texture = { value: volumeTexture(new Uint8Array([255]), [1, 1, 1]) };
  private readonly patched = new WeakSet<Material>();
  private readonly sky: SkyFields;
  private readonly fields: readonly SkyField[];
  /** The result each field's uploads were made from. */
  private readonly shown: (SkyResult | undefined)[];
  private readonly heightOffsets: number[];
  private active: number[] = [];
  private readonly enabled = { value: 0 };
  private readonly daylight = { value: 0 };
  private readonly minimum = { value: vectors() };
  private readonly extent = { value: vectors() };
  private readonly atlasScale = { value: vectors() };
  private readonly atlasOffset = { value: new Float32Array(RESIDENT_FIELDS) };
  private readonly regions: { value: DataTexture };
  private readonly heights: { value: DataTexture };
  private readonly heightSize: { value: Vector2 };
  private readonly jobs: SkyRuntime;
  private readonly index: ReturnType<typeof regionIndex>;
  private readonly clock: () => number;
  private recordedTerrain = false;

  /** Replays request only fields whose recorded terrain is all present. */
  setRecordedTerrain(): void {
    this.recordedTerrain = true;
  }

  private inFlight = false;
  private metadataDirty = true;
  private atlasDirty = false;
  readonly stats = { requested: 0, completed: 0, accepted: 0, discarded: 0, volumes: 0, roofFree: 0 };
  onShader: ((uniforms: Parameters<Material['onBeforeCompile']>[0]['uniforms'], realMs: number) => void) | undefined;
  onService: ((ms: number) => void) | undefined;
  onJob: ((workerMs: number, latencyMs: number) => void) | undefined;

  private readonly blockSize: number;
  private readonly viewRadiusM: number;
  constructor(
    sky: SkyFields,
    { blockSize, viewRadiusM }: { blockSize: number; viewRadiusM: number },
    runtime: SkyRuntime,
  ) {
    this.sky = sky;
    this.fields = sky.fields;
    this.shown = this.fields.map(() => undefined);
    this.blockSize = blockSize;
    this.viewRadiusM = viewRadiusM;
    this.jobs = runtime;
    this.clock = runtime.clock ?? (() => performance.now());
    let heightOffset = 0;
    this.heightOffsets = this.fields.map(({ dependency }) => {
      const offset = heightOffset;
      heightOffset += dependency.max[2] - dependency.min[2];
      return offset;
    });
    this.index = regionIndex(this.fields);
    const width = Math.max(1, ...this.fields.map((field) => field.dependency.max[0] - field.dependency.min[0]));
    const height = Math.max(1, heightOffset);
    const rows = Math.max(1, this.fields.length);
    this.regions = { value: floatTexture(new Float32Array(rows * 12), 3, rows, true) };
    this.heights = { value: floatTexture(new Float32Array(width * height).fill(sky.range.top + 1), width, height) };
    this.heightSize = { value: new Vector2(width, height) };
    this.refreshMetadata();
  }

  private nearby(position: Vec3): number[] {
    return this.fields
      .map((field, index) => ({
        index,
        distance: position.reduce(
          (sum, value, axis) =>
            sum + Math.max(field.bounds.min[axis]! - value, 0, value - field.bounds.max[axis]!) ** 2,
          0,
        ),
      }))
      .filter((entry) => entry.distance <= (this.viewRadiusM / this.blockSize) ** 2)
      .sort((a, b) => a.distance - b.distance || a.index - b.index)
      .map((entry) => entry.index);
  }
  /** Takes up every field whose latest complete result changed since its last upload. */
  private publish(): void {
    this.fields.forEach(({ dependency }, index) => {
      const result = this.sky.latest(index);
      if (result === this.shown[index]) {
        return;
      }
      this.shown[index] = result;
      if (!result) {
        return;
      }
      const { width } = this.heights.value.image;
      const data = this.heights.value.image.data!;
      const rowWidth = dependency.max[0] - dependency.min[0];
      for (let z = 0; z < dependency.max[2] - dependency.min[2]; z++) {
        data.set(result.heights.subarray(z * rowWidth, (z + 1) * rowWidth), (this.heightOffsets[index]! + z) * width);
      }
      this.heights.value.needsUpdate = true;
      this.metadataDirty = true;
      this.atlasDirty ||= this.active.includes(index);
    });
  }
  private demanded(position: Vec3): number[] {
    const range = PREFETCH_M / this.blockSize;
    return this.nearby(position).filter(
      (index) =>
        position.every(
          (value, axis) =>
            value >= this.fields[index]!.bounds.min[axis]! - range &&
            value < this.fields[index]!.bounds.max[axis]! + range,
        ) &&
        (!this.recordedTerrain || this.sky.loaded(index)),
    );
  }

  private residentCandidates(nearby: number[]): number[] {
    return nearby.filter((index) => this.shown[index]?.volume).slice(0, RESIDENT_FIELDS);
  }

  /** Whether the field's current result is complete and is what the view draws. */
  private drawnCurrent(index: number): boolean {
    const result = this.sky.current(index);
    return Boolean(result?.complete) && result === this.shown[index];
  }

  loadingReadiness(position: Vec3) {
    const fields = this.demanded(position);
    const selected = this.residentCandidates(this.nearby(position));
    return {
      ready:
        fields.every((index) => this.drawnCurrent(index)) &&
        selected.every((index) => this.active.includes(index)) &&
        !this.atlasDirty &&
        !this.metadataDirty,
      workUnits: fields.reduce(
        (sum, index) =>
          sum +
          this.fields[index]!.dependency.min.reduce(
            (cells, min, axis) => cells * Math.ceil((this.fields[index]!.dependency.max[axis]! - min) / CHUNK),
            1,
          ),
        0,
      ),
    };
  }

  /** Asks the cache for the nearest demanded field it lacks, one off-thread build at a time. */
  private prepare(position: Vec3): void {
    const index = this.demanded(position).find((field) => !(this.sky.current(field) || this.sky.submitted(field)));
    if (index === undefined) {
      return;
    }
    const start = this.clock();
    const sent = this.sky.request(
      index,
      (input, receive) => !this.inFlight && this.jobs.submit(input, receive),
      ({ accepted, result, workerRealMs }) => {
        this.inFlight = false;
        this.stats.completed += 1;
        if (!accepted) {
          this.stats.discarded += 1;
        } else if (result.complete) {
          this.stats.accepted += 1;
          this.stats[result.volume ? 'volumes' : 'roofFree'] += 1;
        }
        this.onJob?.(workerRealMs, this.clock() - start);
      },
    );
    if (sent) {
      this.inFlight = true;
      this.stats.requested += 1;
    }
  }
  update(scene: Scene, position: Vec3): void {
    const start = this.clock();
    this.publish();
    const nearby = this.nearby(position);
    const resident = this.residentCandidates(nearby).sort((a, b) => a - b);
    if (resident.length !== this.active.length || resident.some((index, slot) => index !== this.active[slot])) {
      this.active = resident;
      this.atlasDirty = true;
      this.metadataDirty = true;
    }
    if (this.atlasDirty) {
      this.upload();
      this.atlasDirty = false;
    }
    if (this.metadataDirty) {
      this.refreshMetadata();
    }
    this.prepare(position);
    scene.traverse((object) => {
      const { material } = object as Mesh;
      if (material) {
        for (const entry of Array.isArray(material) ? material : [material]) {
          this.patch(entry);
        }
      }
    });
    this.onService?.(this.clock() - start);
  }
  private refreshMetadata(): void {
    const data = this.regions.value.image.data!;
    this.fields.forEach((field, index) => {
      const start = index * 12;
      data.set(
        field.bounds.min.map((value) => value * this.blockSize),
        start,
      );
      data[start + 3] = Number(Boolean(this.shown[index]));
      data.set(
        field.bounds.max.map((value) => value * this.blockSize),
        start + 4,
      );
      data[start + 7] = this.active.indexOf(index);
      data[start + 8] = this.heightOffsets[index]!;
      data[start + 9] = field.dependency.min[0];
      data[start + 10] = field.dependency.min[2];
    });
    this.regions.value.needsUpdate = true;
    this.metadataDirty = false;
  }
  private upload(): void {
    const volumes = this.active.map((index) => this.shown[index]!.volume!);
    const size: Vec3 = [
      Math.max(1, ...volumes.map((volume) => volume.size[0])),
      Math.max(
        1,
        volumes.reduce((sum, volume) => sum + volume.size[1], 0),
      ),
      Math.max(1, ...volumes.map((volume) => volume.size[2])),
    ];
    const light = new Uint8Array(size[0] * size[1] * size[2]).fill(255);
    let offset = 0;
    volumes.forEach((volume, slot) => {
      for (let y = 0; y < volume.size[1]; y++) {
        for (let z = 0; z < volume.size[2]; z++) {
          const start = skyIndex(volume.size, 0, y, z);
          light.set(volume.light.subarray(start, start + volume.size[0]), skyIndex(size, 0, offset + y, z));
        }
      }
      this.minimum.value[slot]!.set(...volume.min).multiplyScalar(this.blockSize);
      this.extent.value[slot]!.set(...volume.size).multiplyScalar(this.blockSize);
      this.atlasScale.value[slot]!.set(volume.size[0] / size[0], volume.size[2] / size[2], volume.size[1] / size[1]);
      this.atlasOffset.value[slot] = offset / size[1];
      offset += volume.size[1];
    });
    this.enabled.value = this.active.length;
    this.texture.value.dispose();
    this.texture.value = volumeTexture(light, size);
  }
  setDaylight(sky: Pick<Sky, 'lightIntensity' | 'ambientIntensity'>): void {
    this.daylight.value = sky.lightIntensity + sky.ambientIntensity;
  }
  /** Sky visibility the view draws at a point in metres: no build, so it never stalls a frame. */
  at(position: Vec3): number {
    const point = position.map((value) => value / this.blockSize) as Vec3;
    const known = this.fields
      .map((field, index) => ({ field, index, result: this.shown[index] }))
      .filter(({ field, result }) => result && containsSky(field.bounds, point));
    for (const { index, result } of known) {
      if (this.active.includes(index) && result!.volume && containsSky(result!.volume, point)) {
        return sampleSky(result!.volume, point);
      }
    }
    if (known.length === 0) {
      return 1;
    }
    return Number(known.some(({ field, result }) => Math.floor(point[1]) > skyRoofAt(field, result!, point)));
  }
  inspect() {
    return this.fields.map((field, index) => {
      const volume = this.shown[index]?.volume;
      return {
        bounds: { min: [...field.bounds.min] as Vec3, max: [...field.bounds.max] as Vec3 },
        complete: this.shown[index] !== undefined,
        current: this.drawnCurrent(index),
        resident: this.active.includes(index),
        volume: volume
          ? {
              sample: (point: Vec3) => sampleSky(volume, point),
            }
          : undefined,
      };
    });
  }
  dispose(): void {
    this.texture.value.dispose();
    this.heights.value.dispose();
    this.regions.value.dispose();
    this.index.grid.value.dispose();
    this.index.indices.value.dispose();
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
      const shaderStartedRealMs = this.onShader ? this.clock() : undefined;
      shader.uniforms.uSkyDaylight = this.daylight;
      shader.uniforms.uSkyVolume = this.texture;
      shader.uniforms.uSkyMinimum = this.minimum;
      shader.uniforms.uSkyExtent = this.extent;
      shader.uniforms.uSkyEnabled = this.enabled;
      shader.uniforms.uSkyAtlasScale = this.atlasScale;
      shader.uniforms.uSkyAtlasOffset = this.atlasOffset;
      shader.uniforms.uSkyRegions = this.regions;
      shader.uniforms.uSkyHeights = this.heights;
      shader.uniforms.uSkyHeightSize = this.heightSize;
      shader.uniforms.uSkyGrid = this.index.grid;
      shader.uniforms.uSkyIndices = this.index.indices;
      shader.uniforms.uSkyGridOrigin = this.index.origin;
      shader.uniforms.uSkyGridSize = this.index.size;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vSkyWorld;
varying vec3 vSkyNormal;
#ifdef SKY_ANCHOR
attribute vec3 ${SKY_ANCHOR_ATTRIBUTE};
#endif`,
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
vec4 skyPosition = vec4(transformed, 1.0);
#ifdef SKY_ANCHOR
skyPosition = vec4(${SKY_ANCHOR_ATTRIBUTE}, 1.0);
#endif
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
uniform float uSkyDaylight;
uniform highp sampler3D uSkyVolume;
uniform sampler2D uSkyRegions;
uniform sampler2D uSkyHeights;
uniform vec2 uSkyHeightSize;
uniform sampler2D uSkyGrid;
uniform sampler2D uSkyIndices;
uniform vec2 uSkyGridOrigin;
uniform vec2 uSkyGridSize;
uniform vec3 uSkyMinimum[${RESIDENT_FIELDS}];
uniform vec3 uSkyExtent[${RESIDENT_FIELDS}];
uniform vec3 uSkyAtlasScale[${RESIDENT_FIELDS}];
uniform float uSkyAtlasOffset[${RESIDENT_FIELDS}];
uniform float uSkyEnabled;
varying vec3 vSkyWorld;
varying vec3 vSkyNormal;
float skyVisibility() {
  vec3 point = vSkyWorld + normalize(vSkyNormal) * float(${this.blockSize * 0.5});
  vec2 gridCell = floor(point.xz / float(${this.blockSize * CHUNK})) - uSkyGridOrigin;
  if (any(lessThan(gridCell, vec2(0.0))) || any(greaterThanEqual(gridCell, uSkyGridSize))) return 1.0;
  vec2 candidates = texture2D(uSkyGrid, (gridCell + 0.5) / uSkyGridSize).xy;
  bool known = false;
  float fallback = 0.0;
  for (int local = 0; local < ${this.index.maximum}; local++) {
    if (float(local) >= candidates.y) break;
    float region = texture2D(uSkyIndices, vec2((candidates.x + float(local) + 0.5) / ${this.index.length}.0, 0.5)).r;
    float row = (region + 0.5) / ${Math.max(1, this.fields.length)}.0;
    vec4 lower = texture2D(uSkyRegions, vec2(0.5 / 3.0, row));
    vec4 upper = texture2D(uSkyRegions, vec2(1.5 / 3.0, row));
    if (any(lessThan(point, lower.xyz)) || any(greaterThanEqual(point, upper.xyz))) continue;
    if (lower.w < 0.5) continue;
    known = true;
    vec4 heightTile = texture2D(uSkyRegions, vec2(2.5 / 3.0, row));
    vec2 column = floor(point.xz / float(${this.blockSize})) - heightTile.yz;
    float roof = texture2D(uSkyHeights, (column + vec2(0.5, heightTile.x + 0.5)) / uSkyHeightSize).r;
    if (floor(point.y / float(${this.blockSize})) > roof) fallback = 1.0;
    for (int i = 0; i < ${RESIDENT_FIELDS}; i++) {
      if (float(i) >= uSkyEnabled) break;
      if (abs(upper.w - float(i)) > 0.1) continue;
      vec3 sampleCell = (point - uSkyMinimum[i]) / uSkyExtent[i];
      if (any(lessThan(sampleCell, vec3(0.0))) || any(greaterThanEqual(sampleCell, vec3(1.0)))) continue;
      vec3 halfCell = vec3(${this.blockSize * 0.5}) / uSkyExtent[i];
      vec3 atlas = clamp(sampleCell, halfCell, vec3(1.0) - halfCell).xzy * uSkyAtlasScale[i];
      atlas.z += uSkyAtlasOffset[i];
      return texture(uSkyVolume, atlas).r;
    }
  }
  return known ? fallback : 1.0;
}`,
        )
        .replace(
          '#include <lights_fragment_begin>',
          `float receiverSkyVisibility = skyVisibility();
${ShaderChunk.lights_fragment_begin
  .replace(
    DIRECTIONAL_LIGHT_INFO_CALL,
    `$&
#if defined(USE_SHADOWMAP) && (UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS)
  vec3 nearCoord = vDirectionalShadowCoord[ i ].xyz / vDirectionalShadowCoord[ i ].w;
  bool coveredNear = all(greaterThanEqual(nearCoord.xy, vec2(0.0)))
    && all(lessThanEqual(nearCoord.xy, vec2(1.0))) && nearCoord.z <= 1.0;
  if (!coveredNear && receiverSkyVisibility <= 0.0) directLight.color *= 0.0;
#endif`,
  )
  .replace(
    SPOT_LIGHT_INFO_CALL,
    `$&
        directLight.color *= 1.0 / (1.0 + pow(uSkyDaylight * receiverSkyVisibility / float(${HALF_BRIGHTNESS}), float(${FADE_SHARPNESS})));`,
  )}`,
        )
        .replace(
          '#include <lights_fragment_end>',
          'irradiance *= receiverSkyVisibility;\n#include <lights_fragment_end>',
        );
      if (shaderStartedRealMs !== undefined) {
        this.onShader?.(shader.uniforms, this.clock() - shaderStartedRealMs);
      }
    };
    material.customProgramCacheKey = () =>
      `${key.call(material)}:receiver-daylight-far-sun-skylight:${this.blockSize}:${this.fields.length}:${this.index.maximum}:${this.index.length}`;
    material.needsUpdate = true;
  }
}
