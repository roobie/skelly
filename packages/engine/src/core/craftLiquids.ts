import type { Location } from './inventory.ts';
import type { Item } from './items.ts';
import type { ReachEntry } from './reach.ts';

export interface LiquidDemand {
  group: number;
  liquid: string;
  volumeMicrolitres: number;
  allowed: readonly ReachEntry[];
}
export interface CraftLiquid {
  group: number;
  liquid: string;
  volumeMicrolitres: number;
  sources: { item: Item; volumeMicrolitres: number; from: Location }[];
}
interface Edge {
  to: number;
  reverse: number;
  capacity: number;
  cost: number;
}
interface Step {
  node: number;
  edge: Edge;
}

const tracePath = (previous: (Step | undefined)[]): Step[] | undefined => {
  const path: Step[] = [];
  for (let node = previous.length - 1; node !== 0; ) {
    const step = previous[node];
    if (!step) {
      return undefined;
    }
    path.push(step);
    ({ node } = step);
  }
  return path;
};

const shortestPath = (graph: Edge[][]): Step[] | undefined => {
  const distance = new Array<number>(graph.length).fill(Number.POSITIVE_INFINITY);
  const previous: (Step | undefined)[] = new Array(graph.length).fill(undefined);
  distance[0] = 0;
  for (let pass = 1; pass < graph.length; pass += 1) {
    let changed = false;
    for (let node = 0; node < graph.length; node += 1) {
      for (const edge of graph[node]!) {
        if (edge.capacity > 0 && distance[node]! + edge.cost < distance[edge.to]!) {
          distance[edge.to] = distance[node]! + edge.cost;
          previous[edge.to] = { node, edge };
          changed = true;
        }
      }
    }
    if (!changed) {
      break;
    }
  }
  return tracePath(previous);
};

// Residual edges let a later constrained group displace an earlier default draw.
export const allocateLiquids = (demands: readonly LiquidDemand[]): CraftLiquid[] | undefined => {
  const vessels = [
    ...new Map(demands.flatMap((demand) => demand.allowed.map((entry) => [entry.item.uid, entry] as const))).values(),
  ];
  const sink = 1 + demands.length + vessels.length;
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => []);
  const edge = (from: number, to: number, capacity: number, cost: number): Edge => {
    const forward = { to, reverse: graph[to]!.length, capacity, cost };
    const backward = { to: from, reverse: graph[from]!.length, capacity: 0, cost: -cost };
    graph[from]!.push(forward);
    graph[to]!.push(backward);
    return forward;
  };
  const nodes = new Map(vessels.map((entry, index) => [entry.item.uid, 1 + demands.length + index]));
  for (const entry of vessels) {
    const contents = entry.item.liquidContents!;
    edge(nodes.get(entry.item.uid)!, sink, contents.kind === 'filled' ? contents.volumeMicrolitres : 0, 0);
  }
  const inputs = demands.map((demand, index) => edge(0, 1 + index, demand.volumeMicrolitres, 0));
  const draws = demands.map((demand, index) =>
    demand.allowed.map((entry, rank) => ({
      entry,
      edge: edge(1 + index, nodes.get(entry.item.uid)!, demand.volumeMicrolitres, rank),
    })),
  );
  while (inputs.some((input) => input.capacity > 0)) {
    const path = shortestPath(graph);
    if (!path) {
      return undefined;
    }
    const amount = Math.min(...path.map((step) => step.edge.capacity));
    for (const step of path) {
      step.edge.capacity -= amount;
      graph[step.edge.to]![step.edge.reverse]!.capacity += amount;
    }
  }
  return demands.map((demand, index) => ({
    group: demand.group,
    liquid: demand.liquid,
    volumeMicrolitres: demand.volumeMicrolitres,
    sources: draws[index]!.flatMap(({ entry, edge: draw }) => {
      const volumeMicrolitres = graph[draw.to]![draw.reverse]!.capacity;
      return volumeMicrolitres > 0 ? [{ item: entry.item, from: entry.location, volumeMicrolitres }] : [];
    }),
  }));
};
