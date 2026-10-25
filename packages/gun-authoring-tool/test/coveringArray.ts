type Params = Record<string, string>;
/** The slice of `PartFamily["params"]` the generators read. */
type ParamSpecs = Readonly<Record<string, { readonly values: readonly string[] }>>;

/** Every combination of a family's parameter values. */
export const fullProduct = (specs: ParamSpecs): Params[] =>
  Object.entries(specs).reduce<Params[]>(
    (acc, [name, spec]) => acc.flatMap((p) => spec.values.map((v) => ({ ...p, [name]: v }))),
    [{}],
  );

/** Fixed so the generated arrays, and therefore the default test run, are reproducible. */
const SEED = 12_345;
/** Candidate rows tried per output row; the one covering the most new tuples wins. */
const ATTEMPTS = 12;

/** mulberry32: a tiny deterministic PRNG returning floats in [0, 1). */
const prng = (seed: number): (() => number) => {
  let s = seed;
  return () => {
    s = (s + 0x6d_2b_79_f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const combinations = (n: number, t: number): number[][] => {
  const out: number[][] = [];
  const collect = (start: number, cur: number[]): void => {
    if (cur.length === t) {
      out.push(cur);
      return;
    }
    for (let i = start; i < n; i++) {
      collect(i + 1, [...cur, i]);
    }
  };
  collect(0, []);
  return out;
};

/**
 * Which t-tuples of parameter values (rows hold one value index per parameter) are still
 * uncovered. A tuple is identified by its subset of parameters and a mixed-radix number.
 */
class Coverage {
  readonly subsets: number[][];
  private readonly uncovered: Uint8Array[];
  private readonly subsetsByParam: { sub: number[]; index: number }[][];
  left: number;

  private readonly radix: readonly number[];

  constructor(radix: readonly number[], t: number) {
    this.radix = radix;
    this.subsets = combinations(radix.length, t);
    this.uncovered = this.subsets.map((sub) => new Uint8Array(sub.reduce((acc, p) => acc * radix[p]!, 1)).fill(1));
    this.subsetsByParam = radix.map((_, p) =>
      this.subsets.flatMap((sub, index) => (sub.includes(p) ? [{ sub, index }] : [])),
    );
    this.left = this.uncovered.reduce((acc, u) => acc + u.length, 0);
  }

  private tupleId(sub: readonly number[], row: readonly number[]): number {
    return sub.reduce((acc, p) => acc * this.radix[p]! + row[p]!, 0);
  }

  /** Index of the first subset at or after `from` that still has an uncovered tuple. */
  nextOpenSubset(from: number): number {
    let s = from;
    while (!this.uncovered[s]!.includes(1)) {
      s = (s + 1) % this.subsets.length;
    }
    return s;
  }

  openTuples(subsetIndex: number): number[] {
    return this.uncovered[subsetIndex]!.reduce<number[]>((acc, open, tuple) => {
      if (open) {
        acc.push(tuple);
      }
      return acc;
    }, []);
  }

  /** The uncovered tuples that setting parameter `p` in `row` completes (other parameters already set). */
  gainOfParam(p: number, row: readonly number[]): number {
    let gain = 0;
    for (const { sub, index } of this.subsetsByParam[p]!) {
      if (sub.every((q) => row[q]! >= 0)) {
        gain += this.uncovered[index]![this.tupleId(sub, row)]!;
      }
    }
    return gain;
  }

  gainOfRow(row: readonly number[]): number {
    return this.subsets.reduce((acc, sub, index) => acc + this.uncovered[index]![this.tupleId(sub, row)]!, 0);
  }

  cover(row: readonly number[]): void {
    this.subsets.forEach((sub, index) => {
      const tuple = this.tupleId(sub, row);
      if (this.uncovered[index]![tuple]) {
        this.uncovered[index]![tuple] = 0;
        this.left -= 1;
      }
    });
  }

  /** Writes the value indices of `tuple` of subset `subsetIndex` into `row`. */
  seedRow(subsetIndex: number, tuple: number, row: number[]): void {
    let rest = tuple;
    const sub = this.subsets[subsetIndex]!;
    for (let j = sub.length - 1; j >= 0; j--) {
      const p = sub[j]!;
      row[p] = rest % this.radix[p]!;
      rest = Math.floor(rest / this.radix[p]!);
    }
  }
}

/** One candidate row: starts from a random uncovered tuple, then picks each other parameter greedily. */
const candidateRow = (coverage: Coverage, radix: readonly number[], rnd: () => number, cursor: number): number[] => {
  const subsetIndex = coverage.nextOpenSubset(cursor);
  const open = coverage.openTuples(subsetIndex);
  const row = new Array<number>(radix.length).fill(-1);
  coverage.seedRow(subsetIndex, open[Math.floor(rnd() * open.length)]!, row);
  const order = radix.map((_, p) => p).filter((p) => row[p]! < 0);
  order.sort(() => rnd() - 0.5);
  for (const p of order) {
    let bestValue = 0;
    let bestGain = -1;
    for (let v = 0; v < radix[p]!; v++) {
      row[p] = v;
      // The random term only breaks ties between values that cover equally many new tuples.
      const gain = coverage.gainOfParam(p, row) + rnd() * 0.5;
      if (gain > bestGain) {
        bestGain = gain;
        bestValue = v;
      }
    }
    row[p] = bestValue;
  }
  return row;
};

/**
 * A greedy t-wise covering array: a small set of cases in which every combination of values of
 * any t parameters appears at least once. Returns the full product when t is at least the number
 * of parameters, since then no smaller set covers all t-tuples.
 *
 * The result is a greedy upper bound on the minimum size, not a minimum.
 */
export const tWiseCases = (specs: ParamSpecs, t: number): Params[] => {
  const names = Object.keys(specs);
  if (t >= names.length) {
    return fullProduct(specs);
  }
  const values = names.map((name) => specs[name]!.values);
  const radix = values.map((v) => v.length);
  const rnd = prng(SEED);
  const coverage = new Coverage(radix, t);

  const rows: number[][] = [];
  let cursor = 0;
  while (coverage.left > 0) {
    let best: number[] = [];
    let bestGain = -1;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const row = candidateRow(coverage, radix, rnd, cursor);
      const gain = coverage.gainOfRow(row);
      if (gain > bestGain) {
        bestGain = gain;
        best = row;
      }
    }
    coverage.cover(best);
    rows.push(best);
    cursor = (cursor + 1) % coverage.subsets.length;
  }
  return rows.map((row) => Object.fromEntries(names.map((name, i) => [name, values[i]![row[i]!]!])));
};
