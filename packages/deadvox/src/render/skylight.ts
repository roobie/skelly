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
import type { BlockEntities } from '../core/blockEntities.ts';
import type { Registry } from '../core/content.ts';
import { CHUNK, type Vec3 } from '../core/coords.ts';
import type { Sky } from '../core/sky.ts';
import type { SkyBounds } from '../core/skylight.ts';
import { skyIndex } from '../core/skylight.ts';
import {
  type CapturedSky,
  captureSky,
  containsSky,
  furnitureBounds,
  growSky,
  overlapsSky,
  SKY_SHELL,
  type SkySnapshot,
  skyDependencyBounds,
} from '../core/skySnapshot.ts';
import { type SkyResult, sampleSky } from '../core/skyTransport.ts';
import type { World } from '../core/world.ts';
import { FADE_SHARPNESS, HALF_BRIGHTNESS } from './flashlight.ts';
import { SKY_ANCHOR_ATTRIBUTE } from './skyAnchor.ts';

const SPOT_LIGHT_INFO_CALL = /getSpotLightInfo\([^;]+\);/;
const DIRECTIONAL_LIGHT_INFO_CALL = /getDirectionalLightInfo\([^;]+\);/;
const RESIDENT_FIELDS = 4;
const PREPARE_MS = 0.5;
const PREFETCH_M = 16;
const UNKNOWN_SKY_CAP = 0.5;
interface Field {
  index: number;
  bounds: SkyBounds;
  dependency: SkyBounds;
  revision: number;
  attempted: boolean;
  result: SkyResult | undefined;
  resultRevision: number | undefined;
  entityKey: string;
  heightOffset: number;
}
interface SkyRuntime {
  world: World;
  entities: BlockEntities;
  registry: Registry;
  bottom: number;
  submit: (input: SkySnapshot, receive: (result: SkyResult, ms: number) => void) => boolean;
  clock?: () => number;
}
interface Preparation {
  field: Field;
  revision: number;
  iterator: Generator<void, CapturedSky>;
  captured?: CapturedSky;
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
function regionIndex(fields: readonly Field[]) {
  const x0 = fields.length > 0 ? Math.floor(Math.min(...fields.map((field) => field.bounds.min[0])) / CHUNK) : 0;
  const z0 = fields.length > 0 ? Math.floor(Math.min(...fields.map((field) => field.bounds.min[2])) / CHUNK) : 0;
  const width = fields.length > 0 ? Math.ceil(Math.max(...fields.map((field) => field.bounds.max[0])) / CHUNK) - x0 : 1;
  const height =
    fields.length > 0 ? Math.ceil(Math.max(...fields.map((field) => field.bounds.max[2])) / CHUNK) - z0 : 1;
  const cells: number[][] = Array.from({ length: width * height }, () => []);
  for (const field of fields) {
    for (let z = Math.floor(field.bounds.min[2] / CHUNK); z < Math.ceil(field.bounds.max[2] / CHUNK); z++) {
      for (let x = Math.floor(field.bounds.min[0] / CHUNK); x < Math.ceil(field.bounds.max[0] / CHUNK); x++) {
        cells[x - x0 + width * (z - z0)]!.push(field.index);
      }
    }
  }
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
export class Skylight {
  private readonly texture = { value: volumeTexture(new Uint8Array([255]), [1, 1, 1]) };
  private readonly patched = new WeakSet<Material>();
  private readonly fields: Field[];
  private active: Field[] = [];
  private readonly enabled = { value: 0 };
  private readonly daylight = { value: 0 };
  private readonly minimum = { value: vectors() };
  private readonly extent = { value: vectors() };
  private readonly atlasScale = { value: vectors() };
  private readonly atlasOffset = { value: new Float32Array(RESIDENT_FIELDS) };
  private readonly regions: { value: DataTexture };
  private readonly heights: { value: DataTexture };
  private readonly heightSize: { value: Vector2 };
  private readonly context: SkyRuntime;
  private readonly index: ReturnType<typeof regionIndex>;
  private readonly clock: () => number;
  private preparation: Preparation | undefined;
  private recordedTerrain = false;

  setRecordedTerrain(): void {
    this.recordedTerrain = true;
  }

  private hasDependency(field: Field): boolean {
    const { min, max } = field.dependency;
    for (let z = Math.floor(min[2] / CHUNK); z < Math.ceil(max[2] / CHUNK); z++) {
      for (let x = Math.floor(min[0] / CHUNK); x < Math.ceil(max[0] / CHUNK); x++) {
        for (let y = Math.floor(Math.max(this.context.bottom, min[1]) / CHUNK); y < Math.ceil(max[1] / CHUNK); y++) {
          if (!this.context.world.getChunk(x, y, z)) {
            return false;
          }
        }
      }
    }
    return true;
  }
  private inFlight = false;
  private completed: { preparation: Preparation; result: SkyResult } | undefined;
  private entityVersion = -1;
  private metadataDirty = true;
  private atlasDirty = false;
  readonly stats = { requested: 0, completed: 0, accepted: 0, discarded: 0, volumes: 0, roofFree: 0 };
  onShader: ((uniforms: Parameters<Material['onBeforeCompile']>[0]['uniforms'], realMs: number) => void) | undefined;
  onService: ((ms: number) => void) | undefined;
  onJob: ((workerMs: number, latencyMs: number) => void) | undefined;

  private readonly blockSize: number;
  private readonly top: number;
  private readonly viewRadiusM: number;
  constructor(
    boxes: readonly SkyBounds[],
    { blockSize, top, viewRadiusM }: { blockSize: number; top: number; viewRadiusM: number },
    context: SkyRuntime,
  ) {
    this.blockSize = blockSize;
    this.top = top;
    this.viewRadiusM = viewRadiusM;
    this.context = context;
    this.clock = context.clock ?? (() => performance.now());
    let heightOffset = 0;
    this.fields = boxes.map((box, index) => {
      const bounds = growSky(box, SKY_SHELL);
      const field: Field = {
        index,
        bounds,
        dependency: skyDependencyBounds(bounds, top),
        revision: 0,
        attempted: false,
        result: undefined,
        resultRevision: undefined,
        entityKey: '',
        heightOffset,
      };
      heightOffset += field.dependency.max[2] - field.dependency.min[2];
      return field;
    });
    this.index = regionIndex(this.fields);
    const width = Math.max(1, ...this.fields.map((field) => field.dependency.max[0] - field.dependency.min[0]));
    const height = Math.max(1, heightOffset);
    this.regions = {
      value: floatTexture(new Float32Array(Math.max(1, boxes.length) * 12), 3, Math.max(1, boxes.length), true),
    };
    this.heights = { value: floatTexture(new Float32Array(width * height).fill(top + 1), width, height) };
    this.heightSize = { value: new Vector2(width, height) };
    this.refreshMetadata();
  }

  private invalidate(field: Field): void {
    field.revision += 1;
    field.attempted = false;
    this.metadataDirty = true;
  }
  chunkChanged(origin: Vec3): void {
    const chunk = { min: origin, max: origin.map((value) => value + CHUNK) as Vec3 };
    for (const field of this.fields) {
      if (overlapsSky(field.dependency, chunk)) {
        this.invalidate(field);
      }
    }
  }
  private refreshEntities(): void {
    const { entities } = this.context;
    if (this.entityVersion === entities.standing) {
      return;
    }
    this.entityVersion = entities.standing;
    const furniture = furnitureBounds(entities);
    for (const field of this.fields) {
      const key = JSON.stringify(furniture.filter((box) => overlapsSky(field.dependency, box)));
      if (key !== field.entityKey) {
        field.entityKey = key;
        this.invalidate(field);
      }
    }
  }
  private nearby(position: Vec3): Field[] {
    return this.fields
      .map((field) => ({
        field,
        distance: position.reduce(
          (sum, value, axis) =>
            sum + Math.max(field.bounds.min[axis]! - value, 0, value - field.bounds.max[axis]!) ** 2,
          0,
        ),
      }))
      .filter((entry) => entry.distance <= (this.viewRadiusM / this.blockSize) ** 2)
      .sort((a, b) => a.distance - b.distance || a.field.index - b.field.index)
      .map((entry) => entry.field);
  }
  private publish(): void {
    const ready = this.completed;
    if (!ready) {
      return;
    }
    this.completed = undefined;
    const { preparation, result } = ready;
    if (preparation.revision !== preparation.field.revision || !preparation.captured!.current()) {
      this.stats.discarded += 1;
      preparation.field.attempted = false;
      return;
    }
    if (!result.complete) {
      return;
    }
    preparation.field.result = result;
    preparation.field.resultRevision = preparation.revision;
    this.stats.accepted += 1;
    if (result.volume) {
      this.stats.volumes += 1;
    } else {
      this.stats.roofFree += 1;
    }
    const { width } = this.heights.value.image;
    const data = this.heights.value.image.data!;
    const { dependency, heightOffset } = preparation.field;
    const rowWidth = dependency.max[0] - dependency.min[0];
    for (let z = 0; z < dependency.max[2] - dependency.min[2]; z++) {
      data.set(result.heights.subarray(z * rowWidth, (z + 1) * rowWidth), (heightOffset + z) * width);
    }
    this.heights.value.needsUpdate = true;
    this.metadataDirty = true;
    this.atlasDirty = true;
  }
  private demanded(position: Vec3): Field[] {
    const range = PREFETCH_M / this.blockSize;
    return this.nearby(position).filter(
      (field) =>
        position.every(
          (value, axis) => value >= field.bounds.min[axis]! - range && value < field.bounds.max[axis]! + range,
        ) &&
        (!this.recordedTerrain || this.hasDependency(field)),
    );
  }

  private residentCandidates(nearby: Field[]): Field[] {
    return nearby.filter((field) => field.result?.volume).slice(0, RESIDENT_FIELDS);
  }

  loadingReadiness(position: Vec3) {
    this.refreshEntities();
    const fields = this.demanded(position);
    const selected = this.residentCandidates(this.nearby(position));
    return {
      ready:
        fields.every((field) => field.result?.complete && field.resultRevision === field.revision) &&
        selected.every((field) => this.active.includes(field)) &&
        !this.atlasDirty &&
        !this.metadataDirty,
      workUnits: fields.reduce(
        (sum, field) =>
          sum +
          field.dependency.min.reduce(
            (cells, min, axis) => cells * Math.ceil((field.dependency.max[axis]! - min) / CHUNK),
            1,
          ),
        0,
      ),
    };
  }

  private prepare(nearby: Field[], position: Vec3, deadline: number): void {
    if (this.preparation?.revision !== this.preparation?.field.revision) {
      this.preparation = undefined;
    }
    if (!this.preparation) {
      const demanded = new Set(this.demanded(position));
      const field = nearby.find((candidate) => !candidate.attempted && demanded.has(candidate));
      if (!field) {
        return;
      }
      this.preparation = {
        field,
        revision: field.revision,
        iterator: captureSky(this.context, field.bounds, { bottom: this.context.bottom, top: this.top }),
      };
    }
    const { preparation } = this;
    while (!preparation.captured && this.clock() < deadline) {
      const next = preparation.iterator.next();
      if (next.done) {
        preparation.captured = next.value;
      }
    }
    if (!preparation.captured) {
      return;
    }
    if (!preparation.captured.current()) {
      this.preparation = undefined;
      this.stats.discarded += 1;
      return;
    }
    if (this.inFlight) {
      return;
    }
    const start = this.clock();
    if (
      this.context.submit(preparation.captured.input, (result, ms) => {
        this.inFlight = false;
        this.stats.completed += 1;
        this.completed = { preparation, result };
        this.onJob?.(ms, this.clock() - start);
      })
    ) {
      preparation.field.attempted = true;
      this.inFlight = true;
      this.stats.requested += 1;
      this.preparation = undefined;
      this.prepare(nearby, position, deadline);
    }
  }
  update(scene: Scene, position: Vec3): void {
    const start = this.clock();
    this.refreshEntities();
    this.publish();
    const nearby = this.nearby(position);
    const resident = this.residentCandidates(nearby).sort((a, b) => a.index - b.index);
    if (resident.length !== this.active.length || resident.some((field, index) => field !== this.active[index])) {
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
    this.prepare(nearby, position, start + PREPARE_MS);
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
    for (const field of this.fields) {
      const start = field.index * 12;
      data.set(
        field.bounds.min.map((value) => value * this.blockSize),
        start,
      );
      data[start + 3] = Number(Boolean(field.result));
      data.set(
        field.bounds.max.map((value) => value * this.blockSize),
        start + 4,
      );
      data[start + 7] = this.active.indexOf(field);
      data[start + 8] = field.heightOffset;
      data[start + 9] = field.dependency.min[0];
      data[start + 10] = field.dependency.min[2];
    }
    this.regions.value.needsUpdate = true;
    this.metadataDirty = false;
  }
  private upload(): void {
    const size: Vec3 = [
      Math.max(1, ...this.active.map((field) => field.result!.volume!.size[0])),
      Math.max(
        1,
        this.active.reduce((sum, field) => sum + field.result!.volume!.size[1], 0),
      ),
      Math.max(1, ...this.active.map((field) => field.result!.volume!.size[2])),
    ];
    const light = new Uint8Array(size[0] * size[1] * size[2]).fill(255);
    let offset = 0;
    this.active.forEach((field, slot) => {
      const volume = field.result!.volume!;
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
  at(position: Vec3): number {
    this.refreshEntities();
    const point = position.map((value) => value / this.blockSize) as Vec3;
    const eligible = this.fields.filter((field) => containsSky(field.bounds, point));
    if (eligible.length === 0) {
      return 1;
    }
    for (const field of this.active) {
      if (eligible.includes(field) && field.result?.volume && containsSky(field.result.volume, point)) {
        return sampleSky(field.result.volume, point);
      }
    }
    const known = eligible.filter((field) => field.result !== undefined);
    if (known.length === 0) {
      return UNKNOWN_SKY_CAP;
    }
    return Number(
      known.some(
        (field) =>
          field.result &&
          Math.floor(point[1]) >
            field.result.heights[
              Math.floor(point[0]) -
                field.dependency.min[0] +
                (field.dependency.max[0] - field.dependency.min[0]) * (Math.floor(point[2]) - field.dependency.min[2])
            ]!,
      ),
    );
  }
  inspect() {
    return this.fields.map((field) => {
      const volume = field.result?.volume;
      return {
        bounds: { min: [...field.bounds.min] as Vec3, max: [...field.bounds.max] as Vec3 },
        complete: field.result !== undefined,
        current: field.result !== undefined && field.resultRevision === field.revision,
        resident: this.active.includes(field),
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
float skyVisibility(out bool unknown) {
  unknown = false;
  vec3 point = vSkyWorld + normalize(vSkyNormal) * float(${this.blockSize * 0.5});
  vec2 gridCell = floor(point.xz / float(${this.blockSize * CHUNK})) - uSkyGridOrigin;
  if (any(lessThan(gridCell, vec2(0.0))) || any(greaterThanEqual(gridCell, uSkyGridSize))) return 1.0;
  vec2 candidates = texture2D(uSkyGrid, (gridCell + 0.5) / uSkyGridSize).xy;
  bool eligible = false;
  bool known = false;
  float fallback = 0.0;
  for (int local = 0; local < ${this.index.maximum}; local++) {
    if (float(local) >= candidates.y) break;
    float region = texture2D(uSkyIndices, vec2((candidates.x + float(local) + 0.5) / ${this.index.length}.0, 0.5)).r;
    float row = (region + 0.5) / ${Math.max(1, this.fields.length)}.0;
    vec4 lower = texture2D(uSkyRegions, vec2(0.5 / 3.0, row));
    vec4 upper = texture2D(uSkyRegions, vec2(1.5 / 3.0, row));
    if (any(lessThan(point, lower.xyz)) || any(greaterThanEqual(point, upper.xyz))) continue;
    eligible = true;
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
  unknown = eligible && !known;
  return eligible ? (known ? fallback : float(${UNKNOWN_SKY_CAP})) : 1.0;
}`,
        )
        .replace(
          '#include <lights_fragment_begin>',
          `bool receiverSkyUnknown;
float receiverSkyVisibility = skyVisibility(receiverSkyUnknown);
${ShaderChunk.lights_fragment_begin
  .replace(
    DIRECTIONAL_LIGHT_INFO_CALL,
    `$&
#if defined(USE_SHADOWMAP) && (UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS)
  vec3 nearCoord = vDirectionalShadowCoord[ i ].xyz / vDirectionalShadowCoord[ i ].w;
  bool coveredNear = all(greaterThanEqual(nearCoord.xy, vec2(0.0)))
    && all(lessThanEqual(nearCoord.xy, vec2(1.0))) && nearCoord.z <= 1.0;
  if (!coveredNear && (receiverSkyVisibility <= 0.0 || receiverSkyUnknown)) directLight.color *= 0.0;
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
