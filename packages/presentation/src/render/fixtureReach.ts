import type { LampReach, LampReachCache, LampReachTuning, PoweredLight } from '@skelly/engine/world';
import { Data3DTexture, NearestFilter, RedFormat, ShaderChunk, UnsignedByteType, Vector4 } from 'three';
import { ITEM_POINT_LIGHTS } from './lightPool.ts';
import { type MaterialPatches, materialPatch } from './materialPatches.ts';
import { SKY_RECEIVER_STEP } from './skyAnchor.ts';

/** A play view's reach, patched into the materials; none where the session has no reach cache. */
export function installFixtureReach(
  patches: MaterialPatches,
  cache: LampReachCache | undefined,
  {
    slots,
    blockSize,
    tuning,
    debug = false,
    shadowBlend,
  }: {
    slots: number;
    blockSize: number;
    tuning: LampReachTuning;
    debug?: boolean;
    shadowBlend?: 'hard' | 'smooth' | 'penumbra' | 'both' | undefined;
  },
): FixtureReach | undefined {
  if (!cache) {
    return undefined;
  }
  const mode = debug ? (shadowBlend ?? 'hard') : 'hard';
  cache.previewShadowBlend(mode);
  const reach = new FixtureReach(cache, slots, blockSize, { ...tuning, smooth: mode === 'smooth' || mode === 'both' });
  patches.add(reach.patch);
  return reach;
}

const LIGHTS_FRAGMENT_BEGIN = '#include <lights_fragment_begin>';
const POINT_LIGHT_INFO_CALL = /getPointLightInfo\([^;]+\);/;

/**
 * Drops each point light where the rules' wall check says a wall stops it
 * (`packages/engine/src/core/lampReach.ts`, `LampReachCache`), so the picture and the rules share one truth for light
 * (`packages/deadvox/DESIGN.md`, "Light").
 */
export class FixtureReach {
  readonly patch = materialPatch({
    compile: (shader) => this.compile(shader),
    key: () => `fixture-reach:${ITEM_POINT_LIGHTS}:${this.slots}:${this.blockSize}:${this.cellMetres}:${this.smooth}`,
  });
  private texture: Data3DTexture;
  private data: Uint8Array;
  /** Per point-light slot: the grid's lowest corner in metres, and its layer in the texture. */
  private readonly boxes: { value: Vector4[] };
  /** Per point-light slot: cells along each axis of the grid, 0 where it has none. */
  private readonly sizes: { value: Float32Array };
  private readonly grid: { value: Data3DTexture };
  /** Shared grids can outlive a layer's owner; only `uploaded` identifies the texels still stored there. */
  private readonly layers: { lamp: string | object; uploaded?: LampReach }[];
  /** Grows with the grids actually uploaded, not a content-wide maximum reserved for empty slots. */
  private edge: number;
  private readonly cellMetres: number;

  private readonly cache: LampReachCache;
  private readonly slots: number;
  private readonly blockSize: number;
  private readonly smooth: boolean;

  constructor(cache: LampReachCache, slots: number, blockSize: number, tuning: LampReachTuning & { smooth?: boolean }) {
    this.smooth = tuning.smooth ?? false;
    this.cache = cache;
    this.slots = slots;
    this.blockSize = blockSize;
    this.cellMetres = tuning.cellBlocks * blockSize;
    this.edge = 1;
    this.data = new Uint8Array([255]);
    this.texture = new Data3DTexture(this.data, 1, 1, 1);
    this.texture.format = RedFormat;
    this.texture.type = UnsignedByteType;
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.unpackAlignment = 1;
    this.texture.needsUpdate = true;
    this.grid = { value: this.texture };
    this.boxes = { value: Array.from({ length: slots }, () => new Vector4()) };
    this.sizes = { value: new Float32Array(slots) };
    this.layers = Array.from({ length: slots }, () => ({ lamp: '' }));
  }

  /** Each lamp keeps the layer it had; a new lamp takes one no current lamp holds. */
  private assignLayers(lamps: readonly (PoweredLight | undefined)[]): (number | undefined)[] {
    const keys = lamps.map((lamp) => lamp && (lamp.reachSource ?? lamp.pos.join(',')));
    const layers = keys.map((key) => (key === undefined ? undefined : this.layers.findIndex((l) => l.lamp === key)));
    const free = this.layers.map((_, index) => index).filter((index) => !layers.includes(index));
    return layers.map((layer) => (layer === undefined || layer >= 0 ? layer : free.shift()));
  }

  private upload(layer: number, reach: LampReach): void {
    this.reserve(layer, reach.size);
    const { edge } = this;
    const { size, cells } = reach;
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        const source = size * (z + size * y);
        const target = edge * (z + edge * (layer * edge + y));
        for (let x = 0; x < size; x++) {
          this.data[target + x] = cells[source + x]!;
        }
      }
    }
    this.texture.needsUpdate = true;
  }

  private reserve(layer: number, size: number): void {
    const previousEdge = this.edge;
    const previousLayers = this.texture.image.depth / previousEdge;
    if (size <= previousEdge && layer < previousLayers) {
      return;
    }
    const edge = Math.max(previousEdge, size);
    const capacity = Math.max(previousLayers, 2 ** Math.ceil(Math.log2(layer + 1)));
    const data = new Uint8Array(edge ** 3 * capacity).fill(255);
    for (let l = 0; l < previousLayers; l++) {
      for (let y = 0; y < previousEdge; y++) {
        for (let z = 0; z < previousEdge; z++) {
          const source = previousEdge * (z + previousEdge * (l * previousEdge + y));
          const target = edge * (z + edge * (l * edge + y));
          data.set(this.data.subarray(source, source + previousEdge), target);
        }
      }
    }
    this.texture.dispose();
    this.edge = edge;
    this.data = data;
    this.texture = new Data3DTexture(data, edge, edge, edge * capacity);
    this.texture.format = RedFormat;
    this.texture.type = UnsignedByteType;
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.unpackAlignment = 1;
    this.texture.needsUpdate = true;
    this.grid.value = this.texture;
  }

  /**
   * Takes up the sources in shader-slot order (`LightPool.reachSlots`). A lamp whose grid a block edit
   * touched is rebuilt here, one per call so a burst of edits spreads over frames; until then its last grid draws.
   */
  update(fixtures: readonly (PoweredLight | undefined)[]): void {
    const layers = this.assignLayers(fixtures);
    let rebuilt = false;
    const reaches = fixtures.map((lamp, slot) => {
      const layer = layers[slot];
      if (!lamp || layer === undefined) {
        return null;
      }
      const state = this.layers[layer]!;
      const stale = !this.cache.isCurrent(lamp);
      const reach = this.cache.reachOf(lamp, !rebuilt);
      rebuilt ||= stale;
      state.lamp = lamp.reachSource ?? lamp.pos.join(',');
      return reach ?? null;
    });
    // A later source must not overwrite shared texels an earlier slot still needs.
    const needed = new Set(reaches.filter((reach) => reach !== null));
    reaches.forEach((reach, slot) => {
      this.sizes.value[slot] = reach?.size ?? (fixtures[slot] ? -1 : 0);
      if (!reach) {
        return;
      }
      let uploadedLayer = this.layers.findIndex((candidate) => candidate.uploaded === reach);
      if (uploadedLayer < 0) {
        uploadedLayer = this.layers.findIndex(
          (candidate) => candidate.uploaded === undefined || !needed.has(candidate.uploaded),
        );
        this.upload(uploadedLayer, reach);
        this.layers[uploadedLayer]!.uploaded = reach;
      }
      this.boxes.value[slot]!.set(
        ...(reach.origin.map((cell) => cell * this.cellMetres) as [number, number, number]),
        uploadedLayer,
      );
    });
  }

  dispose(): void {
    this.texture.dispose();
  }

  private compile(shader: { uniforms: Record<string, unknown>; fragmentShader: string }): void {
    if (!(shader.fragmentShader.includes(LIGHTS_FRAGMENT_BEGIN) || POINT_LIGHT_INFO_CALL.test(shader.fragmentShader))) {
      return;
    }
    shader.uniforms.uReachGrid = this.grid;
    shader.uniforms.uReachBox = this.boxes;
    shader.uniforms.uReachSize = this.sizes;
    // The envelope step can land exactly on a receiver-cell boundary. Step just past it so view-space
    // reconstruction round-off cannot alternate grid layers across a flat floor.
    const offset = `float(${this.blockSize * SKY_RECEIVER_STEP + this.cellMetres * 1e-4})`;
    const dropped = (chunk: string) =>
      chunk.replace(
        POINT_LIGHT_INFO_CALL,
        `$&
        {
        vec3 reachReceiver = transpose(mat3(viewMatrix)) * (geometryPosition + geometryNormal * ${offset}) + cameraPosition;
        #ifdef SKY_ANCHOR
          reachReceiver = vSkyWorld + normalize(vSkyNormal) * ${offset};
        #endif
        directLight.color *= fixtureReach(UNROLLED_LOOP_INDEX, reachReceiver);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform highp sampler3D uReachGrid;
uniform vec4 uReachBox[${this.slots}];
uniform float uReachSize[${this.slots}];
float reachCell(vec3 cell, float size, float layer) {
  ivec3 bounded = ivec3(clamp(cell, vec3(0.0), vec3(size - 1.0)));
  return texelFetch(uReachGrid, ivec3(bounded.x, bounded.z, int(layer) * textureSize(uReachGrid, 0).x + bounded.y), 0).r;
}
float fixtureReach(int slot, vec3 point) {
  float size = uReachSize[slot];
  if (size < -0.5) return 0.0;
  if (size < 0.5) return 1.0;
  vec4 box = uReachBox[slot];
  vec3 cell = floor((point - box.xyz) / float(${this.cellMetres}));
  if (any(lessThan(cell, vec3(0.0))) || any(greaterThanEqual(cell, vec3(size)))) return 1.0;
  float stored = reachCell(cell, size, box.w);
  ${
    this.smooth
      ? `
  vec3 centred = (point - box.xyz) / float(${this.cellMetres}) - 0.5;
  vec3 base = floor(centred);
  vec3 weight = fract(centred);
  float filtered = 0.0;
  for (int y = 0; y < 2; y++) {
    for (int z = 0; z < 2; z++) {
      for (int x = 0; x < 2; x++) {
        vec3 corner = vec3(float(x), float(y), float(z));
        vec3 blend = mix(vec3(1.0) - weight, weight, corner);
        filtered += reachCell(base + corner, size, box.w) * blend.x * blend.y * blend.z;
      }
    }
  }
  // Filtering may darken a receiver, never admit light its stored wall answer rejects.
  return min(stored, filtered);`
      : 'return stored;'
  }
}`,
    );
    shader.fragmentShader = shader.fragmentShader.includes(LIGHTS_FRAGMENT_BEGIN)
      ? shader.fragmentShader.replace(LIGHTS_FRAGMENT_BEGIN, dropped(ShaderChunk.lights_fragment_begin))
      : dropped(shader.fragmentShader);
  }
}
