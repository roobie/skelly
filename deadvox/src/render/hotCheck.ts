// Debug hot-pixel check: world materials paint any fragment whose lit colour is NaN, infinite,
// negative or above HOT_CHECK_LIMIT (linear, before tone mapping and fog), or whose alpha leaves
// 0..1, in a colour that names the material category (HOT_CATEGORIES) and brightness/pattern that
// names the kind of failure (HOT_KINDS), so a stray bright pixel can be told apart from background
// showing through (see Mood's crack check) and traced to the material that produced it.
// One shared uniform drives every patched program, so toggling it never recompiles; the category
// colour is a per-material uniform, so materials that share a program still paint their own colour.

import { type IUniform, Vector3, type WebGLProgramParametersWithUniforms } from 'three';

/** Linear value above which a lit fragment counts as hot (a fully lit surface is about 1). */
export const HOT_CHECK_LIMIT = 8;

export const hotCheckUniform: IUniform<number> = { value: 0 };

export const setHotCheck = (on: boolean): void => {
  hotCheckUniform.value = on ? 1 : 0;
};

export const hotCheckOn = (): boolean => hotCheckUniform.value > 0.5;

/** Material categories and the linear RGB each paints. Keep the CSS colour in step for the panel legend. */
export const HOT_CATEGORIES = {
  other: { label: 'other', rgb: [1, 1, 1], css: '#ffffff' },
  chunk: { label: 'chunk', rgb: [0, 1, 1], css: '#00ffff' },
  furniture: { label: 'furniture', rgb: [1, 1, 0], css: '#ffff00' },
  piles: { label: 'piles', rgb: [1, 0.5, 0], css: '#ff8800' },
  zombie: { label: 'zombie boxes', rgb: [1, 0, 0], css: '#ff0000' },
  player: { label: 'player figure', rgb: [0, 1, 0], css: '#00ff00' },
  mob: { label: 'mob actors', rgb: [0, 0, 1], css: '#4466ff' },
} as const satisfies Record<string, { label: string; rgb: readonly [number, number, number]; css: string }>;

export type HotCategory = keyof typeof HOT_CATEGORIES;

/** The failure kinds, in the order the shader tests them; the panel legend prints this. */
export const HOT_KINDS = [
  'full colour = NaN',
  'half = Inf or > 8',
  'striped (4 px checker) = negative',
  'faint = only alpha outside 0..1',
] as const;

const FRAGMENT_PARS = `uniform float uHotCheck;
uniform vec3 uHotColor;`;
// Relies on IEEE comparisons only: every ordered comparison with NaN is false, so a NaN channel fails
// the range test (the `!(a >= 0 && a <= max)` form) yet is neither "< 0" nor "> max"; that residue is
// reported as NaN. Infinity passes ">= 0" but fails "<= max", so it lands in "> max". The explicit
// `x != x` test is added as a second route to NaN, but an optimiser may fold it to false, so the
// classification never depends on it. isnan() is avoided for the same reason.
// Precedence when channels disagree: negative, then > 8/Inf, then NaN. Alpha is only judged
// when the colour is fine. The patch runs after the lit colour is written and before the mist and
// distance fog, so the paint is faded by them like any fragment (stand close to read it).
const FRAGMENT_CHECK = `
if (uHotCheck > 0.5) {
  vec4 hot = gl_FragColor;
  bool hotNeg = any(lessThan(hot.rgb, vec3(0.0)));
  bool hotBig = any(greaterThan(hot.rgb, vec3(${HOT_CHECK_LIMIT}.0)));
  bool rgbBad = !(all(greaterThanEqual(hot.rgb, vec3(0.0))) && all(lessThanEqual(hot.rgb, vec3(${HOT_CHECK_LIMIT}.0))))
    || any(notEqual(hot.rgb, hot.rgb));
  bool alphaBad = !(hot.a >= 0.0 && hot.a <= 1.0);
  if (rgbBad || alphaBad) {
    float hotLevel = 1.0;
    if (hotNeg) {
      hotLevel = mod(floor(gl_FragCoord.x / 4.0) + floor(gl_FragCoord.y / 4.0), 2.0) < 1.0 ? 1.0 : 0.3;
    } else if (hotBig) {
      hotLevel = 0.5;
    } else if (!rgbBad) {
      hotLevel = 0.15;
    }
    gl_FragColor.rgb = uHotColor * hotLevel;
  }
}`;

/**
 * Adds the check to a three.js built-in material's shader, right after the lit colour is written
 * (`opaque_fragment`) and before tone mapping and fog. Call from `onBeforeCompile`.
 */
export const patchHotCheck = (shader: WebGLProgramParametersWithUniforms, category: HotCategory = 'other'): void => {
  shader.uniforms.uHotCheck = hotCheckUniform;
  shader.uniforms.uHotColor = { value: new Vector3(...HOT_CATEGORIES[category].rgb) };
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
    .replace('#include <opaque_fragment>', `#include <opaque_fragment>${FRAGMENT_CHECK}`);
};
