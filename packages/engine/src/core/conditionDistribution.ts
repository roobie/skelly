import { Rng } from './random.ts';

// Range reduction keeps every operation in the exactly rounded arithmetic subset, including sqrt.
const { LN2 } = Math;
const log = (value: number): number => {
  let x = value;
  let exponent = 0;
  while (x < 1) {
    x *= 2;
    exponent -= 1;
  }
  while (x >= 2) {
    x /= 2;
    exponent += 1;
  }
  const z = (x - 1) / (x + 1);
  const square = z * z;
  let term = z;
  let sum = 0;
  for (let denominator = 1; denominator <= 49; denominator += 2) {
    sum += term / denominator;
    term *= square;
  }
  return exponent * LN2 + 2 * sum;
};
const exp = (value: number): number => {
  if (value < -745) {
    return 0;
  }
  const exponent = Math.floor(value / LN2);
  const remainder = value - exponent * LN2;
  let term = 1;
  let sum = 1;
  for (let k = 1; k <= 18; k++) {
    term *= remainder / k;
    sum += term;
  }
  let result = sum;
  for (let k = 0; k < -exponent; k++) {
    result /= 2;
  }
  for (let k = 0; k < exponent; k++) {
    result *= 2;
  }
  return result;
};
const positive = (rng: Rng): number => (rng.next() * 4_294_967_296 + 0.5) / 4_294_967_296;
const normal = (rng: Rng): number => {
  for (;;) {
    const x = rng.range(-1, 1);
    const y = rng.range(-1, 1);
    const radius = x * x + y * y;
    if (radius > 0 && radius < 1) {
      return x * Math.sqrt((-2 * log(radius)) / radius);
    }
  }
};
// Marsaglia–Tsang gamma sampling in log space avoids 0/0 for narrow endpoint tails.
const logGamma = (shape: number, rng: Rng): number => {
  if (shape < 1) {
    return logGamma(shape + 1, rng) + log(positive(rng)) / shape;
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(rng);
    const base = 1 + c * x;
    if (base <= 0) {
      continue;
    }
    const v = base * base * base;
    const u = positive(rng);
    if (u < 1 - 0.0331 * x * x * x * x || log(u) < (x * x) / 2 + d * (1 - v + log(v))) {
      return log(d) + log(v);
    }
  }
};

/** Mean-preserving beta condition; spread is the fraction of the maximum possible variance.
 * Zero width is constant; maximum width is the endpoint Bernoulli limit of the same family. */
export const drawCondition = (mean: number, spread: number, rng: Rng): number => {
  if (!(Number.isFinite(mean) && mean >= 0 && mean <= 1 && Number.isFinite(spread) && spread >= 0 && spread <= 1)) {
    throw new Error('Invalid condition distribution');
  }
  if (mean === 0 || mean === 1 || spread === 0) {
    return mean;
  }
  if (spread === 1) {
    return rng.chance(mean) ? 1 : 0;
  }
  const concentration = (1 - spread) / spread;
  if (!Number.isFinite(concentration)) {
    return mean;
  }
  const a = logGamma(mean * concentration, rng);
  const b = logGamma((1 - mean) * concentration, rng);
  if (a === Number.NEGATIVE_INFINITY && b === Number.NEGATIVE_INFINITY) {
    return rng.chance(mean) ? 1 : 0;
  }
  return a >= b ? 1 / (1 + exp(b - a)) : exp(a - b) / (1 + exp(a - b));
};

/** Independent draws cannot consume another cell's stream or depend on column arrival order. */
export const templateCondition = (
  seed: number,
  placement: {
    readonly template: {
      readonly id?: string;
      readonly condition?: { readonly mean: number; readonly spread: number };
    };
    readonly origin: readonly number[];
    readonly turn: number;
  },
  cell: readonly number[],
): number => {
  const policy = placement.template.condition;
  if (policy && !placement.template.id) {
    throw new Error('A conditioned template needs an identity');
  }
  return policy
    ? drawCondition(
        policy.mean,
        policy.spread,
        Rng.stream(
          seed,
          `template-condition:${JSON.stringify([placement.template.id, placement.origin, placement.turn, cell])}`,
        ),
      )
    : 1;
};
