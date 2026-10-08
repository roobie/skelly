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
import type { Vec3 } from '../core/coords.ts';
import type { MeshData } from '../core/mesher.ts';
import type { WeatheringDef } from '../core/schema.ts';
import { patchHeightFog } from './heightFog.ts';
import { SURFACE_PATTERN_GLSL } from './surfacePatterns.ts';

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
// The id is `flat` (provoking vertex; never interpolated, so it can't extrapolate).
const PATTERN_VARYING = 'flat varying float vPattern;\ncentroid varying vec3 vWorld;\ncentroid varying vec3 vFaceN;';
export const WEATHERING_BASE_GRIME_FLOOR = 0.22;
export const WEATHERING_MIN_RED_TINT = 0.72;

// Wide-radius ambient occlusion (core/occlusion.ts), a per-vertex factor in 0..1 from the mesher. It
// scales only the indirect irradiance (hemisphere and ambient light), never the sun or flashlight.
// `centroid` for the same MSAA reason as above; the fragment shader clamps it as a guard.
const OCCLUSION_VARYING = 'centroid varying float vOcclusion;';
const WEATHER_VARYING = 'centroid varying vec2 vWeather;';

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
  weatheringVariation,
  variationScaleMetres,
  mossThreshold,
  mossBias,
}: {
  blockSize: number;
  linearColors: { value: number };
  patterns: { value: number };
  occlusion: { value: number };
  weathering: { value: number };
  weatheringVariation: { value: number };
  variationScaleMetres: { value: number };
  mossThreshold: { value: number };
  mossBias: { value: number };
}): MeshLambertMaterial => {
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBlockSize = { value: blockSize };
    shader.uniforms.uLinearColors = linearColors;
    shader.uniforms.uPatterns = patterns;
    shader.uniforms.uOcclusion = occlusion;
    shader.uniforms.uWeathering = weathering;
    shader.uniforms.uWeatheringVariation = weatheringVariation;
    shader.uniforms.uWeatheringVariationScale = variationScaleMetres;
    shader.uniforms.uMossThreshold = mossThreshold;
    shader.uniforms.uMossBias = mossBias;
    patchHeightFog(shader, 'chunk');
    shader.vertexShader = shader.vertexShader
      .replace('#include <color_pars_vertex>', centroidColorPars(COLOR_PARS_GUARD_VERTEX))
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uBlockSize;\nattribute float pattern;\nattribute float occlusion;\n${CELL_VARYING}\n${PATTERN_VARYING}\n${OCCLUSION_VARYING}\nattribute vec2 weather;\n${WEATHER_VARYING}`,
      )
      .replace(
        '#include <begin_vertex>',
        // Half a block inside the face, in world block coordinates.
        `#include <begin_vertex>
vOcclusion = occlusion;
vWeather = weather;
vCell = (modelMatrix * vec4(position - normalize(normal) * 0.5, 1.0)).xyz / uBlockSize;
vPattern = pattern;
vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
vFaceN = normalize(normal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_pars_fragment>', centroidColorPars(COLOR_PARS_GUARD_FRAGMENT))
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uLinearColors;\nuniform float uPatterns;\nuniform float uOcclusion;\nuniform float uWeathering;\nuniform float uWeatheringVariation;\nuniform float uWeatheringVariationScale;\nuniform float uMossThreshold;\nuniform float uMossBias;\n${CELL_VARYING}\n${PATTERN_VARYING}\n${OCCLUSION_VARYING}\n${WEATHER_VARYING}\n${CELL_HASH}\n${SRGB_TO_LINEAR}\n${SURFACE_PATTERN_GLSL}`,
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
        // The sRGB decode comes first so patterns modulate decoded colour. A patterned block's own
        // shading replaces the per-block hash (its cell jitter would otherwise cut across joints);
        // with patterns off every block gets the hash, as before. The derivatives are taken here, in
        // uniform control flow, whatever the block.
        // The clamp comes right after the vertex colour. MSAA shades edge pixels at the pixel centre even
        // outside the triangle, extrapolating the (AO-scaled) colour out of 0..1 (negative or over-bright
        // light after the sRGB decode and lighting). Centroid varyings fix the cause; the clamp is a cheap
        // guard for drivers without proper centroid.
        `#include <color_fragment>
diffuseColor.rgb = clamp(diffuseColor.rgb, 0.0, 1.0);
if (uLinearColors > 0.5) diffuseColor.rgb = srgbToLinear(diffuseColor.rgb);
vec2 patUV = surfaceUV(vWorld, vFaceN);
vec2 patFw = fwidth(patUV);
float patId = floor(vPattern + 0.5);
float patSeed = dot(abs(vFaceN), vec3(7.13, 13.7, 3.31));
diffuseColor.rgb *= (uPatterns > 0.5 && patId > 0.5)
  ? patternShade(patId, patUV, max(patFw.x, patFw.y), patFw, patSeed)
  : 0.94 + 0.12 * cellHash(floor(vCell + 1e-3));
// Keep the zero-strength comparison on the pre-weathering colour path exactly.
float dbgWeatherable = 0.0;
if (uWeathering > 0.0) {
  float verticalFace = 1.0 - abs(vFaceN.y);
  float weatherable = step(0.5, patId) * (1.0 - step(0.5, abs(patId - PAT_CORRUGATED)));
  dbgWeatherable = weatherable;
  float grain = vnoise(patUV * 1.7 + vec2(patSeed));
  float weatherPatch = smoothstep(0.28, 0.76, grain);
  float sheltered = clamp(vOcclusion, 0.0, 1.0);
  float broadNoise = vnoise(patUV / uWeatheringVariationScale);
  float broadStrength = mix(1.0, 0.24 + 1.52 * broadNoise, uWeatheringVariation);
  float cornerGrime = (1.0 - sheltered) * (${WEATHERING_BASE_GRIME_FLOOR} + 0.34 * weatherPatch) + vWeather.y * 0.3;
  float grime = cornerGrime * broadStrength;
  float streakNoise = vnoise(vec2(patUV.x * 3.1 + patSeed, patUV.y * 0.16));
  float streak = verticalFace * vWeather.x * smoothstep(0.48, 0.78, streakNoise) * (1.0 - smoothstep(0.0, 0.75, fract(patUV.y * 0.42))) * broadStrength;
  float northShade = 0.65 + 0.35 * step(vFaceN.z, -0.5);
  float baseMoss = (1.0 - sheltered) * (0.4 + 0.6 * weatherPatch) * (0.25 + 0.75 * verticalFace) * northShade;
  vec2 warp = (vec2(
    vnoise(patUV / uWeatheringVariationScale + vec2(17.2, 31.7)),
    vnoise(patUV / uWeatheringVariationScale + vec2(47.1, 11.8))
  ) - 0.5) * 1.4;
  float mossNoise = vnoise(patUV / (uWeatheringVariationScale * 0.28) + warp);
  float environment = clamp(vWeather.y * 0.65 + (1.0 - vWeather.x) * 0.35, 0.0, 1.0);
  float mossCutoff = uMossThreshold - uMossBias * environment;
  float mossPatches = smoothstep(mossCutoff, mossCutoff + 0.18, mossNoise) * environment * uWeatheringVariation;
  float moss = baseMoss * broadStrength + mossPatches;
  vec3 tint = vec3(${WEATHERING_MIN_RED_TINT}, ${WEATHERING_MIN_RED_TINT} + 0.08 * moss, 0.68 - 0.06 * streak);
  diffuseColor.rgb *= mix(vec3(1.0), tint, weatherable * uWeathering * clamp(grime + 0.22 * streak + 0.2 * moss, 0.0, 0.78));
}`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      '#include <opaque_fragment>\ngl_FragColor = dbgWeatherable > 0.5 ? vec4(1.0, 0.0, 0.0, 1.0) : gl_FragColor;',
    );
  };
  material.customProgramCacheKey = () => 'deadvox-chunk-weathering-variation';
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
  private readonly occlusion = { value: 1 };
  private readonly weathering = { value: 0 };
  private readonly weatheringVariation = { value: 0 };
  private readonly variationScaleMetres = { value: 0 };
  private readonly mossThreshold = { value: 0 };
  private readonly mossBias = { value: 0 };
  private readonly frustum = new Frustum();
  private readonly viewProjection = new Matrix4();
  private changes = 0;
  /** Mesh replacement/removal notification, including meshes with zero triangles. Data arrivals belong to Streamer. */
  onChange?: (origin: Vec3) => void;

  /** Meshes are in blocks; the group scales them to metres. */
  constructor(blockSize: number) {
    this.material = chunkMaterial({
      blockSize,
      linearColors: this.linearColors,
      patterns: this.patterns,
      occlusion: this.occlusion,
      weathering: this.weathering,
      weatheringVariation: this.weatheringVariation,
      variationScaleMetres: this.variationScaleMetres,
      mossThreshold: this.mossThreshold,
      mossBias: this.mossBias,
    });
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

  /** Whether the wide ambient occlusion darkens ambient light. On by default; the mesh data is the same either way. */
  get occlusionOn(): boolean {
    return this.occlusion.value > 0.5;
  }

  /** Takes effect next frame; the uniform is shared, so no recompile and no remesh. */
  setOcclusion(on: boolean): void {
    this.occlusion.value = on ? 1 : 0;
  }

  /** Takes effect next frame without recompiling or remeshing. */
  setWeathering(settings: WeatheringDef | undefined): void {
    this.weathering.value = settings?.strength ?? 0;
    this.weatheringVariation.value = settings?.variationStrength ?? 0;
    this.variationScaleMetres.value = settings?.variationScaleMetres ?? 0;
    this.mossThreshold.value = settings?.mossThreshold ?? 0;
    this.mossBias.value = settings?.mossBias ?? 0;
  }

  get count(): number {
    return this.meshes.size;
  }

  keys(): IterableIterator<string> {
    return this.meshes.keys();
  }

  set(key: string, origin: [number, number, number], data: MeshData): void {
    this.onChange?.(origin);
    this.remove(key);
    if (data.indices.length === 0) {
      return;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(data.normals, 3, true));
    geometry.setAttribute('color', new BufferAttribute(data.colors, 3, true));
    geometry.setAttribute('pattern', new BufferAttribute(data.patterns, 1));
    geometry.setAttribute('occlusion', new BufferAttribute(data.occlusion, 1, true));
    geometry.setAttribute('weather', new BufferAttribute(data.weathering, 2));
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
    this.onChange?.([mesh.position.x, mesh.position.y, mesh.position.z]);
    this.group.remove(mesh);
    mesh.geometry.dispose();
    this.meshes.delete(key);
    this.boxes.delete(mesh);
    this.changes += 1;
  }
}
