import { type FabricDef, MaterialSchema } from '@skelly/thing-core/materials';
import type { Material } from 'three';
import { parse } from 'valibot';
import { materialPatch } from './materialPatches.ts';

// A port of skelly-assets' showcase grain, stacked on the game's other material patches rather than replacing the
// compile hook; why each renderer draws the grain itself is in
// `packages/skelly-assets/docs/decisions/0013-fabric-finishes.md`, "What a game does".

type FabricKind = FabricDef['kind'];

const VARYINGS = /* glsl */ `
varying vec3 vFabricPosition;
varying vec3 vFabricNormal;
varying vec3 vFabricU;
varying vec3 vFabricV;
`;

// The plane a face's pattern lies in, by its normal's main axis: [u, v] along the model's axes, v up on a wall.
const PLANE = /* glsl */ `
void fabricPlane(vec3 n, out vec3 u, out vec3 v) {
  vec3 a = abs(n);
  if (a.x >= a.y && a.x >= a.z) { u = vec3(0.0, 0.0, 1.0); v = vec3(0.0, 1.0, 0.0); }
  else if (a.y >= a.z) { u = vec3(1.0, 0.0, 0.0); v = vec3(0.0, 0.0, 1.0); }
  else { u = vec3(1.0, 0.0, 0.0); v = vec3(0.0, 1.0, 0.0); }
}
`;

// The plane's axes go to view space the way the mesh's own directions do, so a skinned, instanced or batched copy
// tilts its normal along the threads it shows.
const VERTEX = /* glsl */ `
vFabricPosition = position;
vFabricNormal = normal;
vec3 fabricU, fabricV;
fabricPlane(normal, fabricU, fabricV);
#ifdef USE_SKINNING
  fabricU = (skinMatrix * vec4(fabricU, 0.0)).xyz;
  fabricV = (skinMatrix * vec4(fabricV, 0.0)).xyz;
#endif
#ifdef USE_BATCHING
  fabricU = mat3(batchingMatrix) * fabricU;
  fabricV = mat3(batchingMatrix) * fabricV;
#endif
#ifdef USE_INSTANCING
  fabricU = mat3(instanceMatrix) * fabricU;
  fabricV = mat3(instanceMatrix) * fabricV;
#endif
vFabricU = normalize((modelViewMatrix * vec4(fabricU, 0.0)).xyz);
vFabricV = normalize((modelViewMatrix * vec4(fabricV, 0.0)).xyz);
`;

const PATTERNS = /* glsl */ `
const float FABRIC_PI = 3.14159265;
float fabricHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fabricHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float fabricNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fabricHash(i), fabricHash(i + vec2(1.0, 0.0)), f.x), mix(fabricHash(i + vec2(0.0, 1.0)), fabricHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fabricNoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(fabricHash3(i), fabricHash3(i + vec3(1, 0, 0)), f.x), mix(fabricHash3(i + vec3(0, 1, 0)), fabricHash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(fabricHash3(i + vec3(0, 0, 1)), fabricHash3(i + vec3(1, 0, 1)), f.x), mix(fabricHash3(i + vec3(0, 1, 1)), fabricHash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

// The thread on top of one crossing, warp (running along v) or weft, rounded across and bulging over the crossing.
vec2 fabricCrossing(vec2 cell, vec2 f, bool warpUp, float weftLighter) {
  float across = sin(FABRIC_PI * (warpUp ? f.x : f.y));
  float along = sin(FABRIC_PI * (warpUp ? f.y : f.x));
  float thread = warpUp ? cell.x : 4096.0 + cell.y;
  return vec2(across * (0.65 + 0.35 * along), fabricHash(vec2(thread, 7.0)) * 2.0 - 1.0 + (warpUp ? 0.0 : weftLighter));
}

vec2 fabricPattern(vec2 p) {
#if defined(FABRIC_WOVEN)
  vec2 cell = floor(p);
  return fabricCrossing(cell, fract(p), mod(cell.x + cell.y, 2.0) < 1.0, 0.0);
#elif defined(FABRIC_TWILL)
  // A warp-faced two-over-one twill: the warp rides over two weft threads and steps one along per thread, so ribs run
  // diagonally and the paler weft shows between them, as on denim.
  vec2 cell = floor(p);
  return fabricCrossing(cell, fract(p), mod(cell.x - cell.y, 3.0) < 2.0, 1.5);
#elif defined(FABRIC_KNIT)
  // Stockinette: columns of loops, each a pair of legs leaning in to a V.
  vec2 q = vec2(p.x, p.y * 1.4);
  vec2 cell = floor(q), f = fract(q);
  float side = f.x < 0.5 ? 0.0 : 1.0;
  float leg = fract(f.y + abs(f.x - 0.5) * 1.2);
  float across = sin(FABRIC_PI * fract(f.x * 2.0));
  return vec2(across * (0.55 + 0.45 * sin(FABRIC_PI * leg)), fabricHash(vec2(cell.x * 2.0 + side, cell.y)) * 2.0 - 1.0);
#elif defined(FABRIC_FELT)
  // Matted fibres: no structure, only noise over two scales.
  float h = 0.65 * fabricNoise(p) + 0.35 * fabricNoise(p * 2.7 + 13.0);
  return vec2(h, fabricNoise(p * 4.1 + 5.0) * 2.0 - 1.0);
#elif defined(FABRIC_LEATHER)
  // Pebbled grain: raised cells parted by creased valleys, the valleys darker.
  vec2 cell = floor(p), f = fract(p);
  float nearest = 8.0, second = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j));
    vec2 seed = o + vec2(fabricHash(cell + o), fabricHash(cell + o + 31.0)) - f;
    float d = dot(seed, seed);
    if (d < nearest) { second = nearest; nearest = d; } else if (d < second) second = d;
  }
  float valley = smoothstep(0.0, 0.5, sqrt(second) - sqrt(nearest));
  return vec2(valley, valley - 1.0 + 0.4 * fabricNoise(p * 3.0));
#else
  // Rubber: a fine stipple.
  float h = fabricNoise(p * 1.7);
  return vec2(h, (h - 0.5) * 0.6);
#endif
}
`;

const FRAGMENT_HEAD = /* glsl */ `
${VARYINGS}
uniform float fabricGrain;
uniform float fabricRelief;
uniform float fabricNoiseShare;
uniform float fabricCrease;
uniform float fabricFold;
${PLANE}
${PATTERNS}
`;

const MAX_SLOPE = 0.9;
// A grain finer than a pixel shimmers, so it fades before it gets there.
const FADE = [0.2, 0.45] as const;
// A yarn's slow lightness drift spans many repeats, so it still reads where the grain has faded.
const MOTTLE = 9;
// How much longer a fold runs down than across, as cloth hangs.
const DRAPE = 4;

// After the colour is read: the grain's lightness and the folds' darkening on the diffuse colour.
const COLOUR = /* glsl */ `
vec3 fabricPlaneU, fabricPlaneV;
fabricPlane(vFabricNormal, fabricPlaneU, fabricPlaneV);
vec2 fabricAt = vec2(dot(vFabricPosition, fabricPlaneU), dot(vFabricPosition, fabricPlaneV)) / fabricGrain;
float fabricFootprint = length(fwidth(fabricAt));
float fabricFine = 1.0 - smoothstep(${FADE[0]}, ${FADE[1]}, fabricFootprint);
float fabricMottleFade = 1.0 - smoothstep(${FADE[0] * MOTTLE}, ${FADE[1] * MOTTLE}, fabricFootprint);
vec2 fabricHere = fabricPattern(fabricAt);
float fabricMottle = fabricNoise(fabricAt / ${MOTTLE}.0 + 17.0) * 2.0 - 1.0;
float fabricFolded = smoothstep(0.3, 0.8, 1.0 - fabricNoise3(vFabricPosition * vec3(1.0, ${1 / DRAPE}, 1.0) / fabricFold));
float fabricShade = 1.0 + fabricNoiseShare * (fabricHere.y * fabricFine + fabricMottle * fabricMottleFade) - fabricCrease * fabricFolded;
diffuseColor.rgb *= max(fabricShade, 0.0);
`;

// After the normal is set up: the grain's slope tilts it, read from the pattern a step either way along the plane.
const NORMAL = /* glsl */ `
{
  const float fabricStep = 0.05;
  float hu = fabricPattern(fabricAt + vec2(fabricStep, 0.0)).x - fabricPattern(fabricAt - vec2(fabricStep, 0.0)).x;
  float hv = fabricPattern(fabricAt + vec2(0.0, fabricStep)).x - fabricPattern(fabricAt - vec2(0.0, fabricStep)).x;
  vec2 slope = vec2(hu, hv) / (2.0 * fabricStep) * (${MAX_SLOPE} / FABRIC_PI) * fabricRelief * fabricFine;
  normal = normalize(normal - faceDirection * (slope.x * vFabricU + slope.y * vFabricV));
}
`;

const CHUNKS = {
  vertex: '#include <defaultnormal_vertex>',
  colour: '#include <map_fragment>',
  normal: '#include <normal_fragment_maps>',
} as const;

const injected = (source: string, chunk: string, code: string): string => {
  if (!source.includes(chunk)) {
    throw new Error(`three renamed ${chunk}; the fabric grain has nowhere to go`);
  }
  return source.replace(chunk, `${chunk}\n${code}`);
};

/** The fabric a material draws: its library finish's, or outside the library its export's, as `checkFabric` passed. */
export const fabricOf = (material: Material): FabricDef | undefined =>
  material.userData.fabric as FabricDef | undefined;

// thing-core keeps its fabric schema private, so it is reached through the material schema that holds it.
const FabricSchema = MaterialSchema.entries.finish.pipe[0].entries.fabric;

/**
 * Rejects a fabric the content checks never saw, one an exported material outside the library declares, once at load,
 * so the per-frame patch walk can trust what it reads.
 */
export const checkFabric = (material: Material): void => {
  try {
    parse(FabricSchema, material.userData.fabric);
  } catch (error) {
    throw new Error(`${material.name}: unusable fabric extras`, { cause: error });
  }
};

const defineOf = (kind: FabricKind): string => `FABRIC_${kind.toUpperCase()}`;

/**
 * Draws a fabric finish's grain over the material's flat colour. Every material of one kind shares a program, which
 * `modelMaterialWarmUp` compiles ahead of first draw; each material keeps its own numbers as uniforms.
 */
export const fabricGrain = materialPatch({
  applies: (material) => fabricOf(material) !== undefined,
  key: (material) => `fabric-${fabricOf(material)?.kind ?? 'none'}`,
  compile: (shader, _renderer, material) => {
    const fabric = fabricOf(material);
    if (fabric === undefined) {
      return;
    }
    Object.assign(shader.uniforms, {
      fabricGrain: { value: fabric.grain },
      fabricRelief: { value: fabric.relief },
      fabricNoiseShare: { value: fabric.noise },
      fabricCrease: { value: fabric.crease },
      fabricFold: { value: fabric.fold },
    });
    shader.vertexShader = injected(`${VARYINGS}${PLANE}${shader.vertexShader}`, CHUNKS.vertex, VERTEX);
    shader.fragmentShader = injected(
      injected(`#define ${defineOf(fabric.kind)}\n${FRAGMENT_HEAD}${shader.fragmentShader}`, CHUNKS.colour, COLOUR),
      CHUNKS.normal,
      NORMAL,
    );
  },
});
