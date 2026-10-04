import type { Vec3 } from './coords.ts';
import { type Body, bodyOverlapsBlock } from './physics.ts';
import type { SolidAt } from './raycast.ts';

export interface StairRouteLink {
  readonly from: string;
  readonly to: string;
  readonly lower: Vec3;
  readonly upper: Vec3;
  readonly width: number;
}

export const ROUTE_SEARCHES_PER_TICK = 32;
export const ROUTE_MAX_EXPANSIONS = 512;
const ROUTE_RADIUS_CELLS = 32;

interface Cell {
  x: number;
  z: number;
}
interface RouteCell extends Cell {
  level: number;
}
interface HeapEntry extends RouteCell {
  g: number;
  f: number;
}
interface SearchBudget {
  expanded: number;
}
interface FlatSearch {
  body: Body;
  isSolid: SolidAt;
  budget: SearchBudget;
}
interface RouteNode {
  pos: Vec3;
  floor: number;
}
interface RouteEdge {
  to: number;
  cost: number;
  waypoints: Vec3[];
}

const routeCellKey = ({ x, z, level }: RouteCell): string => `${x},${level},${z}`;
const horizontalDistance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);
const floorOf = (pos: Vec3): number => Math.round(pos[1]);
const centerOf = (pos: Vec3, floor = floorOf(pos)): Vec3 => [Math.round(pos[0]), floor, Math.round(pos[2])];
const cellOf = (pos: Vec3): Cell => ({ x: Math.round(pos[0]), z: Math.round(pos[2]) });
const heuristic = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
const routeHeuristic = (a: RouteCell, b: RouteCell): number => heuristic(a, b) + Math.abs(a.level - b.level);
const compareHeap = (a: HeapEntry, b: HeapEntry): number =>
  a.f - b.f || b.g - a.g || a.z - b.z || a.x - b.x || a.level - b.level;

const heapPush = (heap: HeapEntry[], value: HeapEntry): void => {
  let index = heap.length;
  heap.push(value);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compareHeap(heap[parent]!, value) <= 0) {
      break;
    }
    heap[index] = heap[parent]!;
    index = parent;
  }
  heap[index] = value;
};

const heapPop = (heap: HeapEntry[]): HeapEntry | undefined => {
  const [first] = heap;
  const last = heap.pop();
  if (!(first && last) || heap.length === 0) {
    return first;
  }
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) {
      break;
    }
    const child = right < heap.length && compareHeap(heap[right]!, heap[left]!) < 0 ? right : left;
    if (compareHeap(last, heap[child]!) <= 0) {
      break;
    }
    heap[index] = heap[child]!;
    index = child;
  }
  heap[index] = last;
  return first;
};

const bodyFreeAt = (body: Body, pos: Vec3, isSolid: SolidAt): boolean => {
  const probe: Body = { ...body, pos, vel: [0, 0, 0], onGround: true };
  for (let y = Math.floor(pos[1]); y < Math.ceil(pos[1] + body.height - 1e-6); y++) {
    for (let z = Math.floor(pos[2] - body.halfWidth); z < Math.ceil(pos[2] + body.halfWidth); z++) {
      for (let x = Math.floor(pos[0] - body.halfWidth); x < Math.ceil(pos[0] + body.halfWidth); x++) {
        if (isSolid(x, y, z) && bodyOverlapsBlock(probe, [x, y, z])) {
          return false;
        }
      }
    }
  }
  return true;
};

const bodyClearAt = (body: Body, pos: Vec3, isSolid: SolidAt): boolean =>
  isSolid(Math.floor(pos[0]), Math.ceil(pos[1] - 1e-6) - 1, Math.floor(pos[2])) && bodyFreeAt(body, pos, isSolid);

export const shamblerRouteSegmentClear = (body: Body, from: Vec3, to: Vec3, isSolid: SolidAt): boolean => {
  if (Math.abs(from[1] - to[1]) > 1e-6) {
    return bodyFreeAt(body, to, isSolid);
  }
  const distance = horizontalDistance(from, to);
  const samples = Math.max(1, Math.ceil(distance * 2));
  for (let step = 1; step <= samples; step++) {
    const t = step / samples;
    if (
      !bodyFreeAt(
        body,
        [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t],
        isSolid,
      )
    ) {
      return false;
    }
  }
  return true;
};

const directPath = ({ body, isSolid, budget }: FlatSearch, start: Vec3, end: Vec3): Vec3[] | undefined => {
  const distance = horizontalDistance(start, end);
  if (distance > ROUTE_RADIUS_CELLS) {
    return undefined;
  }
  const samples = Math.max(1, Math.ceil(distance * 2));
  const floor = floorOf(start);
  for (let step = 0; step <= samples; step++) {
    budget.expanded += 1;
    if (budget.expanded > ROUTE_MAX_EXPANSIONS) {
      return undefined;
    }
    const t = step / samples;
    const point: Vec3 = [start[0] + (end[0] - start[0]) * t, floor, start[2] + (end[2] - start[2]) * t];
    if (!bodyClearAt(body, point, isSolid)) {
      return undefined;
    }
  }
  return [end];
};

interface GridSearch {
  context: FlatSearch;
  from: RouteCell;
  to: RouteCell;
  open: HeapEntry[];
  scores: Map<string, number>;
  previous: Map<string, RouteCell>;
  cells: Map<string, RouteCell>;
}

const expandRouteLevel = (search: GridSearch, current: HeapEntry, nextCell: Cell, level: number): void => {
  const { body, isSolid } = search.context;
  if (Math.abs(level - search.from.level) > 1) {
    return;
  }
  const next: RouteCell = { ...nextCell, level };
  const nextKey = routeCellKey(next);
  const nextScore = current.g + 1;
  if (nextScore >= (search.scores.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
    return;
  }
  if (!bodyClearAt(body, [next.x, level, next.z], isSolid)) {
    return;
  }
  search.scores.set(nextKey, nextScore);
  search.previous.set(nextKey, current);
  search.cells.set(nextKey, next);
  heapPush(search.open, { ...next, g: nextScore, f: nextScore + routeHeuristic(next, search.to) });
};

const expandRouteCell = (search: GridSearch, current: HeapEntry, allowSteps: boolean): void => {
  const { body, isSolid } = search.context;
  const neighbors = [
    { x: 0, z: -1 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
  ];
  for (const offset of neighbors) {
    const nextCell = { x: current.x + offset.x, z: current.z + offset.z };
    if (
      Math.abs(nextCell.x - search.from.x) > ROUTE_RADIUS_CELLS ||
      Math.abs(nextCell.z - search.from.z) > ROUTE_RADIUS_CELLS
    ) {
      continue;
    }
    if (bodyClearAt(body, [nextCell.x, current.level, nextCell.z], isSolid)) {
      expandRouteLevel(search, current, nextCell, current.level);
    } else if (allowSteps) {
      for (const level of [current.level + 1, current.level - 1]) {
        expandRouteLevel(search, current, nextCell, level);
      }
    }
  }
};

const reconstructRoute = (search: GridSearch): Vec3[] | undefined => {
  const fromKey = routeCellKey(search.from);
  const toKey = routeCellKey(search.to);
  const reverse: RouteCell[] = [];
  let cursor = toKey;
  while (cursor !== fromKey) {
    reverse.push(search.cells.get(cursor)!);
    const parent = search.previous.get(cursor);
    if (!parent) {
      return undefined;
    }
    cursor = routeCellKey(parent);
  }
  reverse.reverse();
  return reverse.map(({ x, z, level }) => [x, level, z]);
};

const searchFlatGrid = (
  context: FlatSearch,
  from: RouteCell,
  to: RouteCell,
  options: { allowSteps: boolean; expansionLimit: number },
): Vec3[] | undefined => {
  const fromKey = routeCellKey(from);
  const toKey = routeCellKey(to);
  const search: GridSearch = {
    context,
    from,
    to,
    open: [],
    scores: new Map([[fromKey, 0]]),
    previous: new Map(),
    cells: new Map([
      [fromKey, from],
      [toKey, to],
    ]),
  };
  heapPush(search.open, { ...from, g: 0, f: routeHeuristic(from, to) });
  while (search.open.length > 0 && context.budget.expanded < options.expansionLimit) {
    const current = heapPop(search.open)!;
    const currentKey = routeCellKey(current);
    if (current.g !== search.scores.get(currentKey)) {
      continue;
    }
    context.budget.expanded += 1;
    if (currentKey === toKey) {
      return reconstructRoute(search);
    }
    expandRouteCell(search, current, options.allowSteps);
  }
  return undefined;
};

const flatRoute = (context: FlatSearch, start: Vec3, end: Vec3): Vec3[] | undefined => {
  const { body, isSolid, budget } = context;
  const startLevel = floorOf(start);
  const goalLevel = floorOf(end);
  if (Math.abs(startLevel - goalLevel) > 1) {
    return undefined;
  }
  const from: RouteCell = { ...cellOf(start), level: startLevel };
  const to: RouteCell = { ...cellOf(end), level: goalLevel };
  if (heuristic(from, to) > ROUTE_RADIUS_CELLS) {
    return undefined;
  }
  if (startLevel === goalLevel) {
    const direct = directPath({ body, isSolid, budget }, centerOf(start, startLevel), centerOf(end, startLevel));
    if (direct) {
      return direct;
    }
  }
  if (budget.expanded >= ROUTE_MAX_EXPANSIONS) {
    return undefined;
  }
  if (
    !(bodyClearAt(body, centerOf(start, startLevel), isSolid) && bodyClearAt(body, centerOf(end, goalLevel), isSolid))
  ) {
    return undefined;
  }

  const levelOnly = searchFlatGrid(context, from, to, {
    allowSteps: false,
    expansionLimit: Math.floor((ROUTE_MAX_EXPANSIONS * 3) / 4),
  });
  return levelOnly ?? searchFlatGrid(context, from, to, { allowSteps: true, expansionLimit: ROUTE_MAX_EXPANSIONS });
};

const stairWaypoints = (from: Vec3, to: Vec3): Vec3[] => {
  const rise = Math.abs(Math.round(to[1] - from[1]));
  const dx = Math.round(to[0] - from[0]);
  const dz = Math.round(to[2] - from[2]);
  const steps = Math.abs(dx) + Math.abs(dz);
  return Array.from({ length: steps }, (_, index) => {
    const step = index + 1;
    return [
      from[0] + Math.sign(dx) * step,
      from[1] + Math.sign(to[1] - from[1]) * Math.min(step - (to[1] < from[1] ? 1 : 0), rise),
      from[2] + Math.sign(dz) * step,
    ];
  });
};

const stairClear = (body: Body, link: StairRouteLink, isSolid: SolidAt): boolean => {
  const { lower, upper } = link;
  if (!Number.isFinite(link.width) || link.width <= 0 || body.halfWidth * 2 > link.width) {
    return false;
  }
  const rise = Math.round(upper[1]) - Math.round(lower[1]);
  const dx = Math.round(upper[0] - lower[0]);
  const dz = Math.round(upper[2] - lower[2]);
  if (rise < 1 || (dx === 0) === (dz === 0) || Math.abs(dx) + Math.abs(dz) !== rise + 1) {
    return false;
  }
  const steps = Math.abs(dx) + Math.abs(dz);
  for (let step = 0; step <= steps; step++) {
    const pos: Vec3 = [
      lower[0] + Math.sign(dx) * step,
      Math.round(lower[1]) + Math.min(step, rise),
      lower[2] + Math.sign(dz) * step,
    ];
    if (!bodyClearAt(body, pos, isSolid)) {
      return false;
    }
  }
  return true;
};

const compressFlatPath = (body: Body, start: Vec3, points: readonly Vec3[], isSolid: SolidAt): Vec3[] => {
  const compressed: Vec3[] = [];
  let anchor = start;
  let first = 0;
  while (first < points.length) {
    let last = points.length - 1;
    while (last > first && !shamblerRouteSegmentClear(body, anchor, points[last]!, isSolid)) {
      last -= 1;
    }
    const point = points[last]!;
    compressed.push(point);
    anchor = point;
    first = last + 1;
  }
  return compressed;
};

const addEdge = (graph: RouteEdge[][], from: number, edge: RouteEdge): void => {
  graph[from]!.push(edge);
  graph[from]!.sort((a, b) => a.to - b.to || a.cost - b.cost);
};

interface FlightNode {
  lower: number;
  upper: number;
  link: StairRouteLink;
}

interface RouteGraph {
  graph: RouteEdge[][];
  nodes: RouteNode[];
  search: FlatSearch;
}

const addFlatEdge = ({ graph, nodes, search }: RouteGraph, from: number, to: number): boolean => {
  if (Math.abs(nodes[from]!.floor - nodes[to]!.floor) > 1) {
    return true;
  }
  const points = flatRoute(search, nodes[from]!.pos, nodes[to]!.pos);
  if (!points) {
    return search.budget.expanded < ROUTE_MAX_EXPANSIONS;
  }
  const compressed = compressFlatPath(search.body, nodes[from]!.pos, points, search.isSolid);
  const cost = compressed.reduce(
    (sum, point, index) => sum + horizontalDistance(index === 0 ? nodes[from]!.pos : compressed[index - 1]!, point),
    0,
  );
  addEdge(graph, from, { to, cost, waypoints: compressed });
  addEdge(graph, to, { to: from, cost, waypoints: [...compressed.slice(0, -1).reverse(), nodes[from]!.pos] });
  return true;
};

const addFlightEdges = (graph: RouteEdge[][], flights: readonly FlightNode[], body: Body, isSolid: SolidAt): void => {
  for (const { lower, upper, link } of flights) {
    if (!stairClear(body, link, isSolid)) {
      continue;
    }
    const cost =
      Math.hypot(link.upper[0] - link.lower[0], link.upper[2] - link.lower[2]) +
      Math.abs(link.upper[1] - link.lower[1]);
    addEdge(graph, lower, { to: upper, cost, waypoints: stairWaypoints(link.lower, link.upper) });
    addEdge(graph, upper, { to: lower, cost, waypoints: stairWaypoints(link.upper, link.lower) });
  }
};

interface GraphSearch {
  graph: RouteEdge[][];
  distance: number[];
  previous: number[];
  previousEdge: number[];
  visited: boolean[];
}

const closestUnvisited = (search: GraphSearch): number => {
  let current = -1;
  for (let index = 0; index < search.graph.length; index++) {
    if (!search.visited[index] && (current < 0 || search.distance[index]! < search.distance[current]!)) {
      current = index;
    }
  }
  return current;
};

const relaxGraphEdges = (search: GraphSearch, current: number): void => {
  for (let edgeIndex = 0; edgeIndex < search.graph[current]!.length; edgeIndex++) {
    const edge = search.graph[current]![edgeIndex]!;
    const candidate = search.distance[current]! + edge.cost;
    if (candidate < search.distance[edge.to]! - 1e-9) {
      search.distance[edge.to] = candidate;
      search.previous[edge.to] = current;
      search.previousEdge[edge.to] = edgeIndex;
    }
  }
};

const shortestRouteLegs = (graph: RouteEdge[][]): RouteEdge[] | undefined => {
  const search: GraphSearch = {
    graph,
    distance: graph.map(() => Number.POSITIVE_INFINITY),
    previous: graph.map(() => -1),
    previousEdge: graph.map(() => -1),
    visited: graph.map(() => false),
  };
  search.distance[0] = 0;
  while (true) {
    const current = closestUnvisited(search);
    if (current < 0 || !Number.isFinite(search.distance[current]) || current === 1) {
      break;
    }
    search.visited[current] = true;
    relaxGraphEdges(search, current);
  }
  if (!Number.isFinite(search.distance[1])) {
    return undefined;
  }
  const legs: RouteEdge[] = [];
  for (let node = 1; node !== 0; node = search.previous[node]!) {
    const parent = search.previous[node]!;
    if (parent < 0) {
      return undefined;
    }
    legs.push(graph[parent]![search.previousEdge[node]!]!);
  }
  return legs.reverse();
};

const joinLegs = (legs: readonly RouteEdge[]): Vec3[] => {
  const route = legs.flatMap((leg) => leg.waypoints);
  return route.filter((point, index) => {
    if (index === 0) {
      return true;
    }
    const previousPoint = route[index - 1]!;
    return horizontalDistance(point, previousPoint) > 1e-6 || Math.abs(point[1] - previousPoint[1]) > 1e-6;
  });
};

export const planShamblerRoute = (
  body: Body,
  target: Vec3,
  flights: readonly StairRouteLink[],
  isSolid: SolidAt,
): Vec3[] | undefined => {
  const budget: SearchBudget = { expanded: 0 };
  const search: FlatSearch = { body, isSolid, budget };
  const nodes: RouteNode[] = [
    { pos: centerOf(body.pos), floor: floorOf(body.pos) },
    { pos: centerOf(target), floor: floorOf(target) },
  ];
  const flightNodes: FlightNode[] = [];
  for (const link of flights) {
    const lower = nodes.length;
    nodes.push({ pos: centerOf(link.lower), floor: floorOf(link.lower) });
    const upper = nodes.length;
    nodes.push({ pos: centerOf(link.upper), floor: floorOf(link.upper) });
    flightNodes.push({ lower, upper, link });
  }
  const graph: RouteEdge[][] = nodes.map(() => []);
  const routeGraph: RouteGraph = { graph, nodes, search };
  for (let from = 0; from < nodes.length; from++) {
    for (let to = from + 1; to < nodes.length; to++) {
      if (!addFlatEdge(routeGraph, from, to)) {
        return undefined;
      }
    }
  }
  addFlightEdges(graph, flightNodes, body, isSolid);
  const legs = shortestRouteLegs(graph);
  return legs ? joinLegs(legs) : undefined;
};
