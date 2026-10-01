// A port of the tone-map functions three.js runs in OutputPass (node_modules/three/src/renderers/shaders/
// ShaderChunk/tonemapping_pars_fragment.glsl.js, 0.186) for a grey input, to check the bloom clips in
// core/mood.ts against and to re-derive them. Exposure is already applied: `x` is the post-exposure value.

type V3 = [number, number, number];
type M3 = readonly [V3, V3, V3];

const saturate = (a: number): number => Math.min(1, Math.max(0, a));
const map3 = (v: V3, f: (a: number) => number): V3 => [f(v[0]), f(v[1]), f(v[2])];
const apply = (m: M3, v: V3): V3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
// GLSL's mat3(a, b, c) takes columns; these are the rows.
const fromColumns = (a: V3, b: V3, c: V3): M3 => [
  [a[0], b[0], c[0]],
  [a[1], b[1], c[1]],
  [a[2], b[2], c[2]],
];

const ACES_INPUT = fromColumns(
  [0.597_19, 0.076, 0.0284],
  [0.354_58, 0.908_34, 0.133_83],
  [0.048_23, 0.015_66, 0.837_77],
);
const ACES_OUTPUT = fromColumns(
  [1.604_75, -0.102_08, -0.003_27],
  [-0.531_08, 1.108_13, -0.072_76],
  [-0.073_67, -0.006_05, 1.076_02],
);

const aces = (x: number): V3 => {
  let color = apply(ACES_INPUT, [x / 0.6, x / 0.6, x / 0.6]);
  color = map3(color, (v) => (v * (v + 0.024_578_6) - 0.000_090_537) / (v * (0.983_729 * v + 0.432_951) + 0.238_081));
  return map3(apply(ACES_OUTPUT, color), saturate);
};

const SRGB_TO_REC2020 = fromColumns([0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.088], [0.0433, 0.0113, 0.8956]);
const REC2020_TO_SRGB = fromColumns([1.6605, -0.1246, -0.0182], [-0.5876, 1.1329, -0.1006], [-0.0728, -0.0083, 1.1187]);
const AGX_INSET = fromColumns(
  [0.856_627_153_315_983, 0.137_318_972_929_847, 0.111_898_212_999_95],
  [0.095_121_240_538_158_8, 0.761_241_990_602_591, 0.076_799_418_603_190_3],
  [0.048_251_606_145_858_3, 0.101_439_036_467_562, 0.811_302_368_396_859],
);
const AGX_OUTSET = fromColumns(
  [1.127_100_581_814_436_8, -0.141_329_763_498_438_3, -0.141_329_763_498_438_26],
  [-0.110_606_643_096_603_23, 1.157_823_702_216_272, -0.110_606_643_096_602_94],
  [-0.016_493_938_717_834_573, -0.016_493_938_717_834_257, 1.251_936_406_595_040_5],
);
const AGX_MIN_EV = -12.473_93;
const AGX_MAX_EV = 4.026_069;

const agxContrast = (x: number): number => {
  const x2 = x * x;
  const x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.002_32;
};

const agx = (x: number): V3 => {
  let color = apply(AGX_INSET, apply(SRGB_TO_REC2020, [x, x, x]));
  color = map3(color, (v) => saturate((Math.log2(Math.max(v, 1e-10)) - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV)));
  color = apply(AGX_OUTSET, map3(color, agxContrast));
  color = apply(
    REC2020_TO_SRGB,
    map3(color, (v) => Math.max(0, v) ** 2.2),
  );
  return map3(color, saturate);
};

// A grey stays grey through the compression, so the desaturation step (a mix towards the new peak,
// which every channel already is) changes nothing and is left out.
const neutral = (x: number): V3 => {
  const startCompression = 0.8 - 0.04;
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  const peak = x - offset;
  if (peak < startCompression) {
    return [peak, peak, peak];
  }
  const d = 1 - startCompression;
  const newPeak = 1 - (d * d) / (peak + d - startCompression);
  return [newPeak, newPeak, newPeak];
};

/** Tone-mapped linear grey for a post-exposure grey `x`, by `TONE_MODES` key; `none` is three's no curve, which clips at 1. */
export const TONE_CURVES: Readonly<Record<string, (x: number) => number>> = {
  none: (x) => saturate(x),
  aces: (x) => aces(x)[1],
  agx: (x) => agx(x)[1],
  neutral: (x) => neutral(x)[1],
};

const srgbEncode = (linear: number): number =>
  linear <= 0.003_130_8 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;

/** What the screen shows (sRGB-encoded) for a post-exposure grey `x`. */
export const displayed = (tone: string, x: number): number => srgbEncode(TONE_CURVES[tone]!(x));

/** The post-exposure grey at which the screen shows `target`, by bisection (the curves rise monotonically). */
export const inputForDisplay = (tone: string, target: number): number => {
  let low = 0;
  let high = 1e4;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    if (displayed(tone, mid) < target) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
};
