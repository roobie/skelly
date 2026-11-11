import type { Registry, WeatheringDef } from '@skelly/engine/content';
import type { ColumnReveal, MeshData } from '@skelly/engine/mesh';
import { toChunk, type Vec3 } from '@skelly/engine/world';
import {
  type Box3,
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Color,
  type DataTexture,
  Frustum,
  Matrix4,
  MeshLambertMaterial,
  type Side,
  Sphere,
  Vector3,
} from 'three';
import { ChunkBatch, type ChunkPass } from './chunkBatch.ts';
import { patchHeightFog } from './heightFog.ts';
import { createSurfaceNoise } from './surfaceNoise.ts';
import { camoShaderConfig, SURFACE_PATTERN_GLSL } from './surfacePatterns.ts';

// Per-block brightness variation stands in for textures. It's computed in the
// fragment shader from the block each fragment belongs to, so the mesher can merge
// faces of the same block type into large quads.
// Varyings that feed per-fragment shading are `centroid`: under MSAA a pixel centre outside the
// triangle is otherwise extrapolated. (three's GLSL3 prefix maps `varying` to out/in.)
const CELL_VARYING = 'centroid varying vec3 vCell;';
const CELL_HASH = `
float cellHash(vec3 c) {
  c = mod(c, 4096.0);
  return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}`;

// Per-quad surface pattern: its id (constant per quad, so interpolation only needs rounding),
// the fragment's world position in metres and the face normal (object space is axis-aligned, the
// batch only scales and its chunk matrices only translate, so it is the world normal too).
// The id is `flat` (provoking vertex; never interpolated, so it can't extrapolate).
const PATTERN_VARYING = 'flat varying float vPattern;\ncentroid varying vec3 vWorld;\ncentroid varying vec3 vFaceN;';
const WEATHERING_BASE_GRIME_FLOOR = 0.22;

// Wide-radius ambient occlusion (core/occlusion.ts), a per-vertex factor in 0..1 from the mesher. It
// scales only the indirect irradiance (hemisphere and ambient light), never the sun or flashlight.
// `centroid` for the same MSAA reason as above; the fragment shader clamps it as a guard.
const OCCLUSION_VARYING = 'centroid varying float vOcclusion;';
const WEATHER_VARYING = 'centroid varying vec2 vWeather;';
const WEATHERABLE_VARYING = 'centroid varying float vWeatherable;';

// three declares vColor in these chunks as a plain `varying vec4`; same guard as theirs, centroid added.
const COLOR_PARS_GUARD_VERTEX =
  '#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )';
const COLOR_PARS_GUARD_FRAGMENT = '#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )';
const centroidColorPars = (guard: string): string => `${guard}\ncentroid varying vec4 vColor;\n#endif`;

/**
 * Lambert with vertex colours, plus the per-block variation or, on patterned blocks, the surface
 * pattern. `linearColors`, `patterns` and `occlusion` (0 off, 1 on) are shared with the compiled shader,
 * so changing them doesn't recompile.
 */
const chunkMaterial = ({
  blockSize,
  linearColors,
  patterns,
  occlusion,
  weathering,
  weatheringSplit,
  weatheringSplitEnabled,
  weatheringVariation,
  variationScaleMetres,
  mossThreshold,
  mossBias,
  tintColor,
  tintDarkness,
  streakColor,
  streakStrength,
  streakLengthMetres,
  mossColor,
  mossStrength,
  mixCeiling,
  weatheringBlend,
  registry,
  surfaceNoise,
}: {
  blockSize: number;
  linearColors: { value: number };
  patterns: { value: number };
  occlusion: { value: number };
  weathering: { value: number };
  weatheringSplit: { value: number };
  weatheringSplitEnabled: { value: number };
  weatheringVariation: { value: number };
  variationScaleMetres: { value: number };
  mossThreshold: { value: number };
  mossBias: { value: number };
  tintColor: { value: Color };
  tintDarkness: { value: number };
  streakColor: { value: Color };
  streakStrength: { value: number };
  streakLengthMetres: { value: number };
  mossColor: { value: Color };
  mossStrength: { value: number };
  mixCeiling: { value: number };
  weatheringBlend: { value: number };
  registry: Registry;
  surfaceNoise: { value: DataTexture | null };
}): MeshLambertMaterial => {
  const material = new MeshLambertMaterial({ vertexColors: true });
  const camo = camoShaderConfig(registry.blocks);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBlockSize = { value: blockSize };
    shader.uniforms.uSurfaceNoise = surfaceNoise;
    shader.uniforms.uLinearColors = linearColors;
    shader.uniforms.uPatterns = patterns;
    shader.uniforms.uOcclusion = occlusion;
    shader.uniforms.uWeathering = weathering;
    shader.uniforms.uWeatheringSplit = weatheringSplit;
    shader.uniforms.uWeatheringSplitEnabled = weatheringSplitEnabled;
    shader.uniforms.uWeatheringVariation = weatheringVariation;
    shader.uniforms.uWeatheringVariationScale = variationScaleMetres;
    shader.uniforms.uMossThreshold = mossThreshold;
    shader.uniforms.uMossBias = mossBias;
    shader.uniforms.uWeatheringTintColor = tintColor;
    shader.uniforms.uWeatheringTintDarkness = tintDarkness;
    shader.uniforms.uWeatheringStreakColor = streakColor;
    shader.uniforms.uWeatheringStreakStrength = streakStrength;
    shader.uniforms.uWeatheringStreakLength = streakLengthMetres;
    shader.uniforms.uWeatheringMossColor = mossColor;
    shader.uniforms.uWeatheringMossStrength = mossStrength;
    shader.uniforms.uWeatheringMixCeiling = mixCeiling;
    shader.uniforms.uWeatheringBlend = weatheringBlend;
    shader.uniforms.uCamoPalette = { value: camo.palette.map(([r, g, b]) => new Vector3(r, g, b)) };
    shader.uniforms.uCamoWashout = { value: camo.washout };
    shader.uniforms.uCamoBaseColor = { value: new Vector3(...camo.baseColor) };
    patchHeightFog(shader, 'chunk');
    shader.vertexShader = shader.vertexShader
      .replace('#include <color_pars_vertex>', centroidColorPars(COLOR_PARS_GUARD_VERTEX))
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uBlockSize;\nattribute float pattern;\nattribute float weatherable;\nattribute float occlusion;\n${CELL_VARYING}\n${PATTERN_VARYING}\n${OCCLUSION_VARYING}\nattribute vec2 weather;\n${WEATHER_VARYING}\n${WEATHERABLE_VARYING}`,
      )
      .replace(
        '#include <begin_vertex>',
        // Half a block inside the face, in world block coordinates.
        `#include <begin_vertex>
mat4 chunkToWorld = modelMatrix;
#ifdef USE_BATCHING
chunkToWorld = modelMatrix * batchingMatrix;
#endif
vOcclusion = occlusion;
vWeather = weather;
vWeatherable = weatherable;
vCell = (chunkToWorld * vec4(position - normalize(normal) * 0.5, 1.0)).xyz / uBlockSize;
vPattern = pattern;
vWorld = (chunkToWorld * vec4(position, 1.0)).xyz;
vFaceN = normalize(normal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_pars_fragment>', centroidColorPars(COLOR_PARS_GUARD_FRAGMENT))
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uLinearColors;\nuniform float uPatterns;\nuniform float uOcclusion;\nuniform float uWeathering;\nuniform float uWeatheringSplit;\nuniform float uWeatheringSplitEnabled;\nuniform float uWeatheringVariation;\nuniform float uWeatheringVariationScale;\nuniform float uMossThreshold;\nuniform float uMossBias;\nuniform vec3 uWeatheringTintColor;\nuniform float uWeatheringTintDarkness;\nuniform vec3 uWeatheringStreakColor;\nuniform float uWeatheringStreakStrength;\nuniform float uWeatheringStreakLength;\nuniform vec3 uWeatheringMossColor;\nuniform float uWeatheringMossStrength;\nuniform float uWeatheringMixCeiling;\nuniform float uWeatheringBlend;\n${CELL_VARYING}\n${PATTERN_VARYING}\n${OCCLUSION_VARYING}\n${WEATHER_VARYING}\n${WEATHERABLE_VARYING}\n${CELL_HASH}\n${SURFACE_PATTERN_GLSL}`,
      )
      .replace(
        '#include <lights_fragment_end>',
        // `irradiance` holds ambient + hemisphere + light probes + light maps by now and feeds only
        // RE_IndirectDiffuse; direct lights (sun, flashlight) were accumulated separately.
        `irradiance *= mix(1.0, clamp(vOcclusion, 0.0, 1.0), uOcclusion);
#include <lights_fragment_end>`,
      )
      .replace(
        '#include <color_fragment>',
        // Camo replaces block colour, while its source vertex colour carries the mesher's corner AO.
        // Other patterns modulate the decoded colour. A patterned block's own shading replaces the
        // per-block hash (its cell jitter would otherwise cut across joints);
        // with patterns off every block gets the hash, as before. The derivatives are taken here, in
        // uniform control flow, whatever the block.
        // The clamp comes right after the vertex colour. MSAA shades edge pixels at the pixel centre even
        // outside the triangle, extrapolating the (AO-scaled) colour out of 0..1 (negative or over-bright
        // light after the sRGB decode and lighting). Centroid varyings fix the cause; the clamp is a cheap
        // guard for drivers without proper centroid.
        `#include <color_fragment>
diffuseColor.rgb = clamp(diffuseColor.rgb, 0.0, 1.0);
vec3 diffuseLinear = srgbToLinear(diffuseColor.rgb);
if (uLinearColors > 0.5) diffuseColor.rgb = diffuseLinear;
vec3 camoBase = uLinearColors > 0.5 ? srgbToLinear(uCamoBaseColor) : uCamoBaseColor;
vec2 patUV = surfaceUV(vWorld, vFaceN);
vec2 patFw = fwidth(patUV);
float patId = floor(vPattern + 0.5);
float patSeed = dot(abs(vFaceN), vec3(7.13, 13.7, 3.31));
if (uPatterns > 0.5 && patId == PAT_CAMO) {
  float camoAO = min(diffuseColor.r / max(camoBase.r, 1e-4), min(diffuseColor.g / max(camoBase.g, 1e-4), diffuseColor.b / max(camoBase.b, 1e-4)));
  diffuseColor.rgb = camoColor(vWorld, max(patFw.x, patFw.y)) * clamp(camoAO, 0.0, 1.0);
} else {
  diffuseColor.rgb *= (uPatterns > 0.5 && patId > 0.5)
    ? patternShade(patId, patUV, max(patFw.x, patFw.y), patFw, patSeed)
    : 0.94 + 0.12 * cellHash(floor(vCell + 1e-3));
}
// Keep the zero-strength comparison on the pre-weathering colour path exactly. A quad that cannot
// weather (vWeatherable is 0 over all of it) skips the block: its mix would come out exactly 0.
if (uWeathering > 0.0 && vWeatherable > 0.5 && (uWeatheringSplitEnabled < 0.5 || vWorld.x >= uWeatheringSplit)) {
  float verticalFace = 1.0 - abs(vFaceN.y);
  float weatherable = vWeatherable;
  float grain = vnoise(patUV * 1.7 + vec2(patSeed));
  float weatherPatch = smoothstep(0.28, 0.76, grain);
  float sheltered = clamp(vOcclusion, 0.0, 1.0);
  float broadNoise = vnoise(patUV / uWeatheringVariationScale);
  float broadStrength = mix(1.0, 0.24 + 1.52 * broadNoise, uWeatheringVariation);
  float cornerGrime = (1.0 - sheltered) * (${WEATHERING_BASE_GRIME_FLOOR} + 0.34 * weatherPatch) + vWeather.y * 0.3;
  float grime = cornerGrime * broadStrength;
  float streakNoise = vnoise(vec2(patUV.x * 3.1 + patSeed, patUV.y * 0.381 / uWeatheringStreakLength));
  float streak = verticalFace * vWeather.x * smoothstep(0.48, 0.78, streakNoise) * (1.0 - smoothstep(0.0, 0.75, fract(patUV.y / uWeatheringStreakLength))) * broadStrength;
  float northShade = 0.65 + 0.35 * step(vFaceN.z, -0.5);
  float baseMoss = (1.0 - sheltered) * (0.4 + 0.6 * weatherPatch) * (0.25 + 0.75 * verticalFace) * northShade;
#ifdef SKELLY_COARSE_WEATHER
  float mossNoise = broadNoise;
#else
  vec2 warp = (vec2(
    vnoise(patUV / uWeatheringVariationScale + vec2(17.2, 31.7)),
    vnoise(patUV / uWeatheringVariationScale + vec2(47.1, 11.8))
  ) - 0.5) * 1.4;
  float mossNoise = vnoise(patUV / (uWeatheringVariationScale * 0.28) + warp);
#endif
  float environment = clamp(vWeather.y * 0.65 + (1.0 - vWeather.x) * 0.35, 0.0, 1.0);
  float mossCutoff = uMossThreshold - uMossBias * environment;
  float mossPatches = smoothstep(mossCutoff, mossCutoff + 0.18, mossNoise) * environment * uWeatheringVariation;
  float moss = baseMoss * broadStrength + mossPatches;
  vec3 tint = uWeatheringTintColor;
  tint = mix(tint, uWeatheringMossColor, moss);
  tint = mix(tint, uWeatheringStreakColor, streak);
  float weatheringMix = clamp(
    weatherable * uWeathering * (uWeatheringTintDarkness * grime + uWeatheringStreakStrength * streak + uWeatheringMossStrength * moss),
    0.0, uWeatheringMixCeiling
  );
  vec3 multiplicativeWeathering = diffuseColor.rgb * mix(vec3(1.0), tint, weatheringMix);
  vec3 blendedWeathering = mix(diffuseColor.rgb, tint, weatheringMix);
  diffuseColor.rgb = mix(multiplicativeWeathering, blendedWeathering, uWeatheringBlend);
}`,
      );
  };
  material.customProgramCacheKey = () => 'skelly-chunk-weathering-variation';
  return material;
};

interface Chunk {
  /** In blocks. */
  readonly origin: Readonly<Vec3>;
  /** Tight bounds in metres: a chunk with only ground in its bottom blocks gets a flat box, not one around the whole chunk. */
  readonly box: Box3;
  readonly instance: number;
  /** Whether its column is revealed; kept with the reveal set so per-frame culls don't rebuild column keys. */
  revealed: boolean;
}

/**
 * Owns the chunks' terrain, keyed by chunk key, in one batch (chunkBatch.ts), and culls it: `cull`
 * leaves out of the main pass the chunks whose tight box is outside the camera's frustum or past the
 * fog's end.
 */
export class ChunkMeshes implements ColumnReveal {
  readonly batch: ChunkBatch;
  private readonly chunks = new Map<string, Chunk>();
  readonly material: MeshLambertMaterial;
  private readonly blockSize: number;
  private readonly surfaceNoise: { value: DataTexture | null } = { value: null };
  private readonly linearColors = { value: 0 };
  private readonly patterns = { value: 1 };
  private readonly occlusion = { value: 1 };
  private readonly weathering = { value: 0 };
  private readonly weatheringSplit = { value: 0 };
  private readonly weatheringSplitEnabled = { value: 0 };
  private readonly weatheringVariation = { value: 0 };
  private readonly variationScaleMetres = { value: 0 };
  private readonly mossThreshold = { value: 0 };
  private readonly mossBias = { value: 0 };
  private readonly tintColor = { value: new Color() };
  private readonly tintDarkness = { value: 0 };
  private readonly streakColor = { value: new Color() };
  private readonly streakStrength = { value: 0 };
  private readonly streakLengthMetres = { value: 1 };
  private readonly mossColor = { value: new Color() };
  private readonly mossStrength = { value: 0 };
  private readonly mixCeiling = { value: 0 };
  private readonly weatheringBlend = { value: 0 };
  private readonly frustum = new Frustum();
  private readonly viewProjection = new Matrix4();
  private readonly eye = new Vector3();
  private changes = 0;
  private revealed: ReadonlySet<string> | undefined;
  private revealChanges = 0;

  get revealVersion(): number {
    return this.revealChanges;
  }

  isRevealed(x: number, z: number): boolean {
    return this.revealed?.has(`${toChunk(Math.floor(x))},${toChunk(Math.floor(z))}`) ?? true;
  }

  setRevealedColumns(columns: ReadonlySet<string>): void {
    if (this.revealed?.size === columns.size && [...columns].every((key) => this.revealed!.has(key))) {
      return;
    }
    this.revealed = columns;
    this.revealChanges += 1;
    this.changes += 1;
    for (const chunk of this.chunks.values()) {
      chunk.revealed = this.isRevealed(chunk.origin[0], chunk.origin[2]);
      if (!chunk.revealed) {
        this.batch.setPassVisible(chunk.instance, 'main', false);
        this.batch.setPassVisible(chunk.instance, 'shadow', false);
      }
    }
  }

  /** Mesh replacement/removal notification, including meshes with zero triangles. Data arrivals belong to Streamer. */
  onChange?: (origin: Vec3) => void;

  constructor(blockSize: number, registry: Registry) {
    this.material = chunkMaterial({
      blockSize,
      linearColors: this.linearColors,
      patterns: this.patterns,
      occlusion: this.occlusion,
      weathering: this.weathering,
      weatheringSplit: this.weatheringSplit,
      weatheringSplitEnabled: this.weatheringSplitEnabled,
      weatheringVariation: this.weatheringVariation,
      variationScaleMetres: this.variationScaleMetres,
      mossThreshold: this.mossThreshold,
      mossBias: this.mossBias,
      tintColor: this.tintColor,
      tintDarkness: this.tintDarkness,
      streakColor: this.streakColor,
      streakStrength: this.streakStrength,
      streakLengthMetres: this.streakLengthMetres,
      mossColor: this.mossColor,
      mossStrength: this.mossStrength,
      mixCeiling: this.mixCeiling,
      weatheringBlend: this.weatheringBlend,
      registry,
      surfaceNoise: this.surfaceNoise,
    });
    this.blockSize = blockSize;
    // In the scene before any chunk exists, so `renderer.compile` builds the game's heaviest shader early.
    this.batch = new ChunkBatch(this.material, blockSize);
  }

  /** Mesh and reveal changes invalidate cached shadow maps. */
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

  get fastCamo(): boolean {
    return this.material.defines?.SKELLY_FAST_CAMO === 1;
  }

  setFastCamo(on: boolean): void {
    this.setDetailDefine('SKELLY_FAST_CAMO', on);
  }

  get coarseWeathering(): boolean {
    return this.material.defines?.SKELLY_COARSE_WEATHER === 1;
  }

  setCoarseWeathering(on: boolean): void {
    this.setDetailDefine('SKELLY_COARSE_WEATHER', on);
  }

  setCachedSurfaceNoise(on: boolean): void {
    if (on) {
      this.surfaceNoise.value ??= createSurfaceNoise();
    }
    this.setDetailDefine('SKELLY_TEXTURE_NOISE', on);
  }

  private setDetailDefine(
    name: 'SKELLY_FAST_CAMO' | 'SKELLY_COARSE_WEATHER' | 'SKELLY_TEXTURE_NOISE',
    on: boolean,
  ): void {
    this.material.defines ??= {};
    const { defines } = this.material;
    if ((defines[name] === 1) === on) {
      return;
    }
    if (on) {
      defines[name] = 1;
    } else {
      delete defines[name];
    }
    this.material.needsUpdate = true;
  }

  /** Whether patterned blocks draw their procedural surface pattern. On by default. */
  get patternsOn(): boolean {
    return this.patterns.value > 0.5;
  }

  /** Takes effect next frame; the uniform is shared, so no recompile. */
  setPatterns(on: boolean): void {
    this.patterns.value = on ? 1 : 0;
  }

  /** Whether the wide ambient occlusion darkens ambient light. On by default; the mesh data is the same either way. */
  get occlusionOn(): boolean {
    return this.occlusion.value > 0.5;
  }

  /** Takes effect next frame; the uniform is shared, so no recompile and no remesh. */
  setOcclusion(on: boolean): void {
    this.occlusion.value = on ? 1 : 0;
  }

  /** Takes effect next frame without recompiling or remeshing. */
  setWeathering(settings: WeatheringDef | undefined, split?: number): void {
    this.weatheringSplit.value = split ?? 0;
    this.weatheringSplitEnabled.value = split === undefined ? 0 : 1;
    this.applyWeatheringSettings(settings);
  }

  private applyWeatheringSettings(settings: WeatheringDef | undefined): void {
    this.weathering.value = settings?.strength ?? 0;
    this.weatheringVariation.value = settings?.variationStrength ?? 0;
    this.variationScaleMetres.value = settings?.variationScaleMetres ?? 0;
    this.mossThreshold.value = settings?.mossThreshold ?? 0;
    this.mossBias.value = settings?.mossBias ?? 0;
    this.tintColor.value.set(settings?.tintColor ?? '#ffffff');
    this.tintDarkness.value = settings?.tintDarkness ?? 0;
    this.streakColor.value.set(settings?.streakColor ?? '#ffffff');
    this.streakStrength.value = settings?.streakStrength ?? 0;
    this.streakLengthMetres.value = settings?.streakLengthMetres ?? 1;
    this.mossColor.value.set(settings?.mossColor ?? '#ffffff');
    this.mossStrength.value = settings?.mossStrength ?? 0;
    this.mixCeiling.value = settings?.mixCeiling ?? 0;
    this.weatheringBlend.value = settings?.weatheringBlend ?? 0;
  }

  get count(): number {
    return this.chunks.size;
  }

  keys(): IterableIterator<string> {
    return this.chunks.keys();
  }

  /** Origins, in blocks, of the chunks with terrain, or of only those `pass` draws. */
  origins(pass?: ChunkPass): Readonly<Vec3>[] {
    return [...this.chunks.values()]
      .filter((chunk) => pass === undefined || this.batch.isPassVisible(chunk.instance, pass))
      .map((chunk) => chunk.origin);
  }

  set(key: string, origin: [number, number, number], data: MeshData): void {
    this.onChange?.(origin);
    this.remove(key);
    if (data.indices.length === 0) {
      return;
    }
    const geometry = chunkGeometry(data);
    const instance = this.batch.addChunk(geometry, origin);
    // The batch only scales, so a box in blocks becomes metres by the block size.
    const box = geometry.boundingBox!.clone().translate(new Vector3(...origin));
    box.min.multiplyScalar(this.blockSize);
    box.max.multiplyScalar(this.blockSize);
    const revealed = this.isRevealed(origin[0], origin[2]);
    this.batch.setPassVisible(instance, 'main', revealed);
    this.chunks.set(key, { origin: [...origin], box, instance, revealed });
    this.changes += 1;
  }

  /**
   * Makes the chunks whose tight box passes `casts` the next shadow pass's casters, drawn from their
   * `side` faces (shadows.ts says which light takes which). The main pass's set is apart from it, so a
   * chunk behind the camera can still shade what is in front of it. Returns how many cast.
   */
  selectShadowCasters(casts: (box: Box3) => boolean, side: Side): number {
    this.material.shadowSide = side;
    let count = 0;
    for (const { box, instance, revealed } of this.chunks.values()) {
      const on = revealed && casts(box);
      this.batch.setPassVisible(instance, 'shadow', on);
      count += on ? 1 : 0;
    }
    return count;
  }

  /**
   * Draws in the main pass only the chunks whose box meets the camera's frustum and comes within
   * `fogEndM` of the camera horizontally: fog goes by horizontal distance (render/distanceFog.ts), so
   * the far plane alone keeps fully fogged chunks to the camera's side. The camera's matrices must be current.
   */
  cull(camera: Camera, fogEndM = Number.POSITIVE_INFINITY): void {
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    const { x, z } = this.eye;
    for (const { box, instance, revealed } of this.chunks.values()) {
      const dx = Math.max(box.min.x - x, 0, x - box.max.x);
      const dz = Math.max(box.min.z - z, 0, z - box.max.z);
      const drawn = revealed && dx * dx + dz * dz < fogEndM * fogEndM && this.frustum.intersectsBox(box);
      this.batch.setPassVisible(instance, 'main', drawn);
    }
  }

  remove(key: string): void {
    const chunk = this.chunks.get(key);
    if (!chunk) {
      return;
    }
    this.onChange?.([...chunk.origin]);
    this.batch.removeChunk(chunk.instance);
    this.chunks.delete(key);
    this.changes += 1;
  }
}

/** Mesher output as a geometry the batch copies in, with tight bounds. */
const chunkGeometry = (data: MeshData): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3, true));
  geometry.setAttribute('color', new BufferAttribute(data.colors, 3, true));
  geometry.setAttribute('pattern', new BufferAttribute(data.patterns, 1));
  geometry.setAttribute('weatherable', new BufferAttribute(data.weatherable, 1));
  geometry.setAttribute('occlusion', new BufferAttribute(data.occlusion, 1, true));
  geometry.setAttribute('weather', new BufferAttribute(data.weathering, 2));
  geometry.setIndex(new BufferAttribute(data.indices, 1));
  geometry.computeBoundingBox();
  geometry.boundingSphere = geometry.boundingBox!.getBoundingSphere(new Sphere());
  return geometry;
};
