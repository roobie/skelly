import type { LampReach, LampReachCache, LampReachTuning, PoweredLight } from '@skelly/engine/world';
import { Data3DTexture, NearestFilter, RedFormat, ShaderChunk, UnsignedByteType, Vector3, Vector4 } from 'three';
import { ITEM_POINT_LIGHTS } from './lightPool.ts';
import { type MaterialPatches, materialPatch } from './materialPatches.ts';
import { POINT_LIGHT_RAY_GLSL } from './pointLightRay.ts';
import { SKY_RECEIVER_STEP } from './skyAnchor.ts';

/** A play view's reach, patched into the materials; none where the session has no reach cache. */
export function installFixtureReach(
  patches: MaterialPatches,
  cache: LampReachCache | undefined,
  { slots, blockSize, tuning }: { slots: number; blockSize: number; tuning: LampReachTuning },
): FixtureReach | undefined {
  if (!cache) {
    return undefined;
  }
  const reach = new FixtureReach(cache, slots, blockSize, tuning);
  patches.add(reach.patch);
  return reach;
}

const LIGHTS_FRAGMENT_BEGIN = '#include <lights_fragment_begin>';
const POINT_LIGHT_INFO_CALL = /getPointLightInfo\([^;]+\);/;

/**
 * Drops each point light where the rules' wall check says a wall stops it
 * (`packages/engine/src/core/lampReach.ts`, `LampReachCache`), sampled at grid centres rather than exact receivers
 * (`packages/deadvox/DESIGN.md`, "Light"). It uploads one reach grid per occupied point-light slot, and its patch
 * multiplies a slot's direct light by the grid's cell at the receiver; outside a lamp's grid the light is untouched.
 */
export class FixtureReach {
  readonly patch = materialPatch({
    compile: (shader) => this.compile(shader),
    key: () => `fixture-reach:${ITEM_POINT_LIGHTS}:${this.slots}:${this.edge}:${this.blockSize}:${this.cellMetres}`,
  });
  private readonly rayMode = { value: false };
  private readonly sources: { value: Vector3[] };
  private readonly bodyMins: { value: Vector3[] };
  private readonly bodyMaxs: { value: Vector3[] };
  private readonly blockers = { value: new Data3DTexture(new Uint8Array(1), 1, 1, 1) };
  private readonly blockerOrigin = { value: new Vector3() };
  private readonly blockerSize = { value: new Vector3(1, 1, 1) };
  private blockerCells: Uint8Array | undefined;
  private readonly texture: Data3DTexture;
  private readonly data: Uint8Array;
  /** Per point-light slot: the grid's lowest corner in metres, and its layer in the texture. */
  private readonly boxes: { value: Vector4[] };
  /** Per point-light slot: cells along each axis of the grid, 0 where it has none. */
  private readonly sizes: { value: Float32Array };
  private readonly grid: { value: Data3DTexture };
  /** Texture layer groups: each lamp keeps its layer while it holds a slot, so a lamp's upload is not redone. */
  private readonly layers: { lamp: string | object; reach: LampReach | undefined }[];
  /** Cells along every axis of the texture: the largest grid content allows. */
  private readonly edge: number;
  private readonly cellMetres: number;

  private readonly cache: LampReachCache;
  private readonly slots: number;
  private readonly blockSize: number;

  constructor(cache: LampReachCache, slots: number, blockSize: number, tuning: LampReachTuning) {
    this.cache = cache;
    this.blockers.value.format = RedFormat;
    this.blockers.value.type = UnsignedByteType;
    this.blockers.value.needsUpdate = true;
    this.sources = { value: Array.from({ length: slots }, () => new Vector3()) };
    this.bodyMins = { value: Array.from({ length: slots }, () => new Vector3()) };
    this.bodyMaxs = { value: Array.from({ length: slots }, () => new Vector3()) };
    this.slots = slots;
    this.blockSize = blockSize;
    this.cellMetres = tuning.cellBlocks * blockSize;
    this.edge = 2 * Math.ceil(tuning.rangeMetres / this.cellMetres) + 1;
    this.data = new Uint8Array(this.edge * this.edge * this.edge * slots).fill(255);
    this.texture = new Data3DTexture(this.data, this.edge, this.edge, this.edge * slots);
    this.texture.format = RedFormat;
    this.texture.type = UnsignedByteType;
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.unpackAlignment = 1;
    this.texture.needsUpdate = true;
    this.grid = { value: this.texture };
    this.boxes = { value: Array.from({ length: slots }, () => new Vector4()) };
    this.sizes = { value: new Float32Array(slots) };
    this.layers = Array.from({ length: slots }, () => ({ lamp: '', reach: undefined }));
  }

  /** Debug-only prototype selector; the grid remains available in the same material program. */
  setGpuRays(enabled: boolean): void {
    this.rayMode.value = enabled;
  }

  installDebug(page: Pick<EventTarget, 'addEventListener'>, enabled: boolean, initial: boolean | undefined): void {
    if (!enabled) {
      return;
    }
    this.setGpuRays(initial ?? false);
    page.addEventListener('keydown', (event) => {
      if (event instanceof KeyboardEvent && event.code === 'F9' && !event.repeat) {
        event.preventDefault();
        this.setGpuRays(!this.rayMode.value);
      }
    });
  }

  private updateBlockers(): void {
    const { cells, origin, size } = this.cache.blockers();
    if (cells === this.blockerCells) {
      return;
    }
    this.blockerCells = cells;
    this.blockers.value.dispose();
    const texture = new Data3DTexture(cells, ...size);
    texture.format = RedFormat;
    texture.type = UnsignedByteType;
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    this.blockers.value = texture;
    this.blockerOrigin.value.set(...origin);
    this.blockerSize.value.set(...size);
  }

  /** Each lamp keeps the layer it had; a new lamp takes one no current lamp holds. */
  private assignLayers(lamps: readonly (PoweredLight | undefined)[]): (number | undefined)[] {
    const keys = lamps.map((lamp) => lamp && (lamp.reachSource ?? lamp.pos.join(',')));
    const layers = keys.map((key) => (key === undefined ? undefined : this.layers.findIndex((l) => l.lamp === key)));
    const free = this.layers.map((_, index) => index).filter((index) => !layers.includes(index));
    return layers.map((layer) => (layer === undefined || layer >= 0 ? layer : free.shift()));
  }

  private upload(layer: number, reach: LampReach): void {
    const { edge } = this;
    const { size, cells } = reach;
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        const source = size * (z + size * y);
        const target = edge * (z + edge * (layer * edge + y));
        for (let x = 0; x < size; x++) {
          this.data[target + x] = cells[source + x]! * 255;
        }
      }
    }
    this.texture.needsUpdate = true;
  }

  /**
   * Takes up the sources in shader-slot order (`LightPool.reachSlots`). A lamp whose grid a block edit
   * touched is rebuilt here, one per call so a burst of edits spreads over frames; until then its last grid draws.
   */
  update(fixtures: readonly (PoweredLight | undefined)[]): void {
    if (this.rayMode.value) {
      this.updateBlockers();
      fixtures.forEach((lamp, slot) => {
        this.sources.value[slot]!.set(...(lamp?.pos ?? [0, 0, 0]));
        this.bodyMins.value[slot]!.set(...(lamp?.body?.min ?? [0, 0, 0]));
        this.bodyMaxs.value[slot]!.set(...(lamp?.body?.max ?? [0, 0, 0]));
      });
      return;
    }
    const layers = this.assignLayers(fixtures);
    let rebuilt = false;
    fixtures.forEach((lamp, slot) => {
      const layer = layers[slot];
      if (!lamp || layer === undefined) {
        this.sizes.value[slot] = 0;
        return;
      }
      const state = this.layers[layer]!;
      if (state.lamp !== (lamp.reachSource ?? lamp.pos.join(','))) {
        state.reach = undefined;
      }
      const stale = !this.cache.isCurrent(lamp);
      const reach = this.cache.reachOf(lamp, !rebuilt);
      rebuilt ||= stale;
      state.lamp = lamp.reachSource ?? lamp.pos.join(',');
      if (reach && reach !== state.reach) {
        this.upload(layer, reach);
      }
      state.reach = reach;
      this.sizes.value[slot] = reach?.size ?? 0;
      if (reach) {
        this.boxes.value[slot]!.set(
          ...(reach.origin.map((cell) => cell * this.cellMetres) as [number, number, number]),
          layer,
        );
      }
    });
  }

  dispose(): void {
    this.texture.dispose();
    this.blockers.value.dispose();
  }

  private compile(shader: { uniforms: Record<string, unknown>; fragmentShader: string }): void {
    if (!(shader.fragmentShader.includes(LIGHTS_FRAGMENT_BEGIN) || POINT_LIGHT_INFO_CALL.test(shader.fragmentShader))) {
      return;
    }
    shader.uniforms.uReachRays = this.rayMode;
    shader.uniforms.uLightBlockers = this.blockers;
    shader.uniforms.uLightBlockerOrigin = this.blockerOrigin;
    shader.uniforms.uLightBlockerSize = this.blockerSize;
    shader.uniforms.uReachSource = this.sources;
    shader.uniforms.uReachBodyMin = this.bodyMins;
    shader.uniforms.uReachBodyMax = this.bodyMaxs;
    shader.uniforms.uReachGrid = this.grid;
    shader.uniforms.uReachBox = this.boxes;
    shader.uniforms.uReachSize = this.sizes;
    const offset = `float(${this.blockSize * SKY_RECEIVER_STEP})`;
    const dropped = (chunk: string) =>
      chunk.replace(
        POINT_LIGHT_INFO_CALL,
        `$&
        if (directLight.visible) directLight.color *= uReachRays
          ? pointLightRay(uReachSource[UNROLLED_LOOP_INDEX], (transpose(mat3(viewMatrix)) * geometryPosition + cameraPosition) / float(${this.blockSize}), uReachBodyMin[UNROLLED_LOOP_INDEX], uReachBodyMax[UNROLLED_LOOP_INDEX])
          : fixtureReach(UNROLLED_LOOP_INDEX, transpose(mat3(viewMatrix)) * (geometryPosition + geometryNormal * ${offset}) + cameraPosition);`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
${POINT_LIGHT_RAY_GLSL}
uniform bool uReachRays;
uniform vec3 uReachSource[${this.slots}];
uniform vec3 uReachBodyMin[${this.slots}];
uniform vec3 uReachBodyMax[${this.slots}];
uniform highp sampler3D uReachGrid;
uniform vec4 uReachBox[${this.slots}];
uniform float uReachSize[${this.slots}];
float fixtureReach(int slot, vec3 point) {
  float size = uReachSize[slot];
  if (size < 0.5) return 1.0;
  vec4 box = uReachBox[slot];
  vec3 cell = floor((point - box.xyz) / float(${this.cellMetres}));
  if (any(lessThan(cell, vec3(0.0))) || any(greaterThanEqual(cell, vec3(size)))) return 1.0;
  return texelFetch(uReachGrid, ivec3(int(cell.x), int(cell.z), int(box.w) * ${this.edge} + int(cell.y)), 0).r;
}`,
    );
    shader.fragmentShader = shader.fragmentShader.includes(LIGHTS_FRAGMENT_BEGIN)
      ? shader.fragmentShader.replace(LIGHTS_FRAGMENT_BEGIN, dropped(ShaderChunk.lights_fragment_begin))
      : dropped(shader.fragmentShader);
  }
}
