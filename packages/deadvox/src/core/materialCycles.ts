export interface MaterialOperation {
  balance: ReadonlyMap<string, bigint>;
  section: 'items' | 'recipes';
  id: string;
  path: string;
}

const gcd = (left: bigint, right: bigint): bigint => {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
};

const reduce = (row: bigint[]): void => {
  let divisor = 0n;
  for (const value of row) {
    divisor = gcd(divisor, value);
    if (divisor === 1n) {
      return;
    }
  }
  if (divisor > 1n) {
    for (let column = 0; column < row.length; column++) {
      row[column] = row[column]! / divisor;
    }
  }
};

type MaterialCycleResult = { kind: 'balanced' } | { kind: 'gain'; operations: MaterialOperation[] } | { kind: 'limit' };

const repeatableOperations = (all: readonly MaterialOperation[]): MaterialOperation[] => {
  let operations = all.filter(({ balance }) => balance.size > 0);
  // A depleted stock with no producer cannot participate in a repeatable cycle.
  while (true) {
    const produced = new Set(
      operations.flatMap(({ balance }) => [...balance].filter(([, n]) => n > 0n).map(([id]) => id)),
    );
    const retained = operations.filter(({ balance }) => [...balance].every(([id, n]) => n >= 0n || produced.has(id)));
    if (retained.length === operations.length) {
      return retained;
    }
    operations = retained;
  }
};

interface Tableau {
  rows: bigint[][];
  objective: bigint[];
  basis: number[];
  columns: number;
}

const tableau = (operations: readonly MaterialOperation[]): Tableau | undefined => {
  const items = [...new Set(operations.flatMap(({ balance }) => [...balance.keys()]))];
  const constraints = items.length + 1;
  const columns = operations.length + constraints;
  if (constraints * (columns + 1) > 1_000_000) {
    return undefined;
  }
  // Maximise sum(Nx), with Nx >= 0, x >= 0, sum(x) <= 1. The origin is
  // feasible; rational rates scale to whole operations and finite starting stock.
  // Integer row scaling keeps pivots exact, including zero-net catalyst stocks.
  const rows = items.map((item) => operations.map(({ balance }) => -(balance.get(item) ?? 0n)));
  rows.push(operations.map(() => 1n));
  for (let index = 0; index < constraints; index++) {
    rows[index]!.push(...Array.from({ length: constraints }, (_, slack) => (slack === index ? 1n : 0n)));
    rows[index]!.push(index === constraints - 1 ? 1n : 0n);
  }
  const objective = operations.map(({ balance }) => -[...balance.values()].reduce((sum, value) => sum + value, 0n));
  objective.push(...new Array<bigint>(constraints + 1).fill(0n));
  return {
    rows,
    objective,
    basis: Array.from({ length: constraints }, (_, index) => operations.length + index),
    columns,
  };
};

const leavingRow = ({ rows, basis, columns }: Tableau, entering: number): number => {
  let leaving = -1;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    if (row[entering]! <= 0n) {
      continue;
    }
    const previous = rows[leaving];
    const difference = previous ? row[columns]! * previous[entering]! - previous[columns]! * row[entering]! : -1n;
    if (difference < 0n || (difference === 0n && basis[index]! < basis[leaving]!)) {
      leaving = index;
    }
  }
  return leaving;
};

const pivot = ({ rows, objective, basis, columns }: Tableau, entering: number, leaving: number): void => {
  const pivotRow = rows[leaving]!;
  const divisor = pivotRow[entering]!;
  for (const row of [...rows, objective]) {
    if (row === pivotRow || row[entering] === 0n) {
      continue;
    }
    const multiplier = row[entering]!;
    for (let column = 0; column <= columns; column++) {
      row[column] = row[column]! * divisor - pivotRow[column]! * multiplier;
    }
    reduce(row);
  }
  basis[leaving] = entering;
};

/** Exact stock dominance, not a weighted exchange rate between unlike items. */
export const materialCycle = (all: readonly MaterialOperation[]): MaterialCycleResult => {
  const operations = repeatableOperations(all);
  if (operations.length === 0) {
    return { kind: 'balanced' };
  }
  const state = tableau(operations);
  if (!state) {
    return { kind: 'limit' };
  }
  // Bland's entering/leaving rules avoid degenerate cycling. The explicit work
  // bound fails validation closed rather than silently accepting unchecked stock.
  for (let iteration = 0; iteration < 10_000; iteration++) {
    const entering = state.objective.findIndex((value, index) => index < state.columns && value < 0n);
    if (entering < 0) {
      return state.objective[state.columns]! > 0n
        ? {
            kind: 'gain',
            operations: state.basis.flatMap((variable, index) =>
              variable < operations.length && state.rows[index]![state.columns]! > 0n ? [operations[variable]!] : [],
            ),
          }
        : { kind: 'balanced' };
    }
    const leaving = leavingRow(state, entering);
    if (leaving < 0) {
      return { kind: 'limit' };
    }
    pivot(state, entering, leaving);
  }
  return { kind: 'limit' };
};
