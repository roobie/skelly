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
export const ROUTE_MAX_EXPANSIONS = 128;
export const ROUTE_MAX_WORK = 16_384;
export const ROUTE_WORK_PER_TICK = 4096;
export type TerrainFloorAt = (x: number, z: number) => number;
export const terrainStance = (x: number, z: number, halfWidth: number, terrainFloor: TerrainFloorAt): number => {
  let level = Number.NEGATIVE_INFINITY;
  for (let bz = Math.floor(z - halfWidth); bz < Math.ceil(z + halfWidth); bz++) {
    for (let bx = Math.floor(x - halfWidth); bx < Math.ceil(x + halfWidth); bx++) {
      level = Math.max(level, Math.round(terrainFloor(bx, bz)));
    }
  }
  return level;
};
export const onTerrainFloor = (pos: Vec3, terrainFloor: TerrainFloorAt, halfWidth: number): boolean =>
  Math.round(pos[1]) === terrainStance(pos[0], pos[2], halfWidth, terrainFloor);
const terrainLeg = (pos: Vec3, terrainFloor: TerrainFloorAt, halfWidth: number): boolean =>
  Math.abs(Math.round(pos[1]) - terrainStance(pos[0], pos[2], halfWidth, terrainFloor)) <= 1;
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
  consume: (units?: number) => void;
}
interface FlatSearch {
  body: Body;
  isSolid: SolidAt;
  budget: SearchBudget;
  terrainFloor?: TerrainFloorAt | undefined;
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

const bodyClearAt = (body: Body, pos: Vec3, isSolid: SolidAt): boolean => {
  const y = Math.ceil(pos[1] - 1e-6) - 1;
  for (let z = Math.floor(pos[2] - body.halfWidth); z < Math.ceil(pos[2] + body.halfWidth); z++) {
    for (let x = Math.floor(pos[0] - body.halfWidth); x < Math.ceil(pos[0] + body.halfWidth); x++) {
      if (isSolid(x, y, z)) {
        return bodyFreeAt(body, pos, isSolid);
      }
    }
  }
  return false;
};

const axisSweep = (origin: number, delta: number, lower: number, upper: number): [number, number] | undefined => {
  if (delta === 0) {
    return origin > lower && origin < upper ? [0, 1] : undefined;
  }
  const a = (lower - origin) / delta;
  const b = (upper - origin) / delta;
  const enter = Math.max(0, Math.min(a, b));
  const leave = Math.min(1, Math.max(a, b));
  return enter < leave ? [enter, leave] : undefined;
};

const solidColumnClear = (body: Body, base: Vec3, isSolid: SolidAt): boolean => {
  for (let y = Math.floor(base[1]); y < Math.ceil(base[1] + body.height - 1e-6); y++) {
    if (isSolid(base[0], y, base[2])) {
      return false;
    }
  }
  return true;
};

const horizontalSweepClear = (body: Body, from: Vec3, to: Vec3, isSolid: SolidAt): boolean => {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const w = body.halfWidth;
  // Intersect swept rows before reading solidity: diagonal corner grazes have arbitrarily short overlap intervals.
  for (let z = Math.floor(Math.min(from[2], to[2]) - w); z < Math.ceil(Math.max(from[2], to[2]) + w); z++) {
    const row = axisSweep(from[2], dz, z - w, z + 1 + w);
    if (!row) {
      continue;
    }
    const a = from[0] + dx * row[0];
    const b = from[0] + dx * row[1];
    for (let x = Math.floor(Math.min(a, b) - w); x < Math.ceil(Math.max(a, b) + w); x++) {
      const column = axisSweep(from[0], dx, x - w, x + 1 + w);
      if (!column || Math.max(row[0], column[0]) >= Math.min(row[1], column[1])) {
        continue;
      }
      if (!solidColumnClear(body, [x, from[1], z], isSolid)) {
        return false;
      }
    }
  }
  return true;
};

export const shamblerRouteSegmentClear = (body: Body, from: Vec3, to: Vec3, isSolid: SolidAt): boolean => {
  const sameSpan =
    Math.floor(from[1]) === Math.floor(to[1]) &&
    Math.ceil(from[1] + body.height - 1e-6) === Math.ceil(to[1] + body.height - 1e-6);
  if (sameSpan) {
    return horizontalSweepClear(body, from, to, isSolid);
  }
  const lower = from[1] < to[1] ? from : to;
  const rise = Math.abs(to[1] - from[1]);
  if (!bodyFreeAt({ ...body, height: body.height + rise }, lower, isSolid)) {
    return false;
  }
  const level = Math.max(from[1], to[1]);
  return horizontalSweepClear(body, [from[0], level, from[2]], [to[0], level, to[2]], isSolid);
};

const supportedPoint = (
  { body, isSolid, terrainFloor }: FlatSearch,
  x: number,
  z: number,
  floor: number,
): Vec3 | undefined => {
  const level = terrainFloor ? terrainStance(x, z, body.halfWidth, terrainFloor) : floor;
  const point: Vec3 = [x, level, z];
  if (bodyClearAt(body, point, isSolid)) {
    return point;
  }
  if (!terrainFloor) {
    return undefined;
  }
  const alternative = [level + 1, level - 1].find((height) => bodyClearAt(body, [x, height, z], isSolid));
  return alternative === undefined ? undefined : [x, alternative, z];
};

interface TerrainPath {
  points: Vec3[];
  previous: Vec3;
  anchor: Vec3;
}

const extendTerrainPath = ({ body, isSolid }: FlatSearch, path: TerrainPath, point: Vec3, final: boolean): boolean => {
  if (point[1] - path.previous[1] > 1) {
    return false;
  }
  if (path.previous[1] !== point[1]) {
    if (!shamblerRouteSegmentClear(body, path.anchor, path.previous, isSolid)) {
      return false;
    }
    path.points.push(path.previous, point);
    path.anchor = point;
  }
  if (final) {
    if (!shamblerRouteSegmentClear(body, path.anchor, point, isSolid)) {
      return false;
    }
    if (path.points.at(-1) !== point) {
      path.points.push(point);
    }
  }
  path.previous = point;
  return true;
};

const directPath = (context: FlatSearch, start: Vec3, end: Vec3): Vec3[] | undefined => {
  const { body, isSolid, budget, terrainFloor } = context;
  const distance = horizontalDistance(start, end);
  if (distance > ROUTE_RADIUS_CELLS) {
    return undefined;
  }
  const samples = Math.max(1, Math.ceil(distance * 2));
  const floor = floorOf(start);
  const path: TerrainPath = { points: [], previous: start, anchor: start };
  for (let step = 0; step <= samples; step++) {
    budget.expanded += 1;
    if (budget.expanded > ROUTE_MAX_EXPANSIONS) {
      return undefined;
    }
    const t = step / samples;
    const x = start[0] + (end[0] - start[0]) * t;
    const z = start[2] + (end[2] - start[2]) * t;
    const point = supportedPoint(context, x, z, floor);
    if (!point || (terrainFloor && !extendTerrainPath(context, path, point, step === samples))) {
      return undefined;
    }
  }
  if (terrainFloor) {
    return path.points;
  }
  return shamblerRouteSegmentClear(body, start, end, isSolid) ? [end] : undefined;
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
  const reference = search.context.terrainFloor
    ? terrainStance(nextCell.x, nextCell.z, body.halfWidth, search.context.terrainFloor)
    : search.from.level;
  if (Math.abs(level - reference) > 1) {
    return;
  }
  const next: RouteCell = { ...nextCell, level };
  const nextKey = routeCellKey(next);
  const nextScore = current.g + 1;
  if (nextScore >= (search.scores.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
    return;
  }
  const destination: Vec3 = [next.x, level, next.z];
  if (!bodyClearAt(body, destination, isSolid)) {
    return;
  }
  if (
    level !== current.level &&
    !shamblerRouteSegmentClear(body, [current.x, current.level, current.z], destination, isSolid)
  ) {
    return;
  }
  search.scores.set(nextKey, nextScore);
  search.previous.set(nextKey, current);
  search.cells.set(nextKey, next);
  heapPush(search.open, { ...next, g: nextScore, f: nextScore + routeHeuristic(next, search.to) });
};

const expandTerrainCell = (search: GridSearch, current: HeapEntry, next: Cell): void => {
  const reference = terrainStance(next.x, next.z, search.context.body.halfWidth, search.context.terrainFloor!);
  for (const level of [reference, reference + 1, reference - 1]) {
    if (level - current.level <= 1) {
      expandRouteLevel(search, current, next, level);
    }
  }
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
    if (search.context.terrainFloor) {
      expandTerrainCell(search, current, nextCell);
    } else if (bodyClearAt(body, [nextCell.x, current.level, nextCell.z], isSolid)) {
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

const terrainForLeg = ({ body, terrainFloor }: FlatSearch, start: Vec3, end: Vec3): TerrainFloorAt | undefined =>
  terrainFloor && terrainLeg(start, terrainFloor, body.halfWidth) && terrainLeg(end, terrainFloor, body.halfWidth)
    ? terrainFloor
    : undefined;

const flatRoute = (context: FlatSearch, start: Vec3, end: Vec3): Vec3[] | undefined => {
  const { body, isSolid, budget } = context;
  const startLevel = floorOf(start);
  const goalLevel = floorOf(end);
  const terrainFloor = terrainForLeg(context, start, end);
  const surface = terrainFloor !== undefined;
  const legContext: FlatSearch = { ...context, terrainFloor };
  if (!surface && Math.abs(startLevel - goalLevel) > 1) {
    return undefined;
  }
  const from: RouteCell = { ...cellOf(start), level: startLevel };
  const to: RouteCell = { ...cellOf(end), level: goalLevel };
  if (Math.max(Math.abs(from.x - to.x), Math.abs(from.z - to.z)) > ROUTE_RADIUS_CELLS) {
    return undefined;
  }
  if (surface || startLevel === goalLevel) {
    const direct = directPath(legContext, [start[0], startLevel, start[2]], [end[0], goalLevel, end[2]]);
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

  const centeredStart = centerOf(start, startLevel);
  if (!shamblerRouteSegmentClear(body, [start[0], startLevel, start[2]], centeredStart, isSolid)) {
    return undefined;
  }
  const levelOnly =
    !surface && startLevel === goalLevel
      ? searchFlatGrid(legContext, from, to, {
          allowSteps: false,
          expansionLimit: Math.floor((ROUTE_MAX_EXPANSIONS * 3) / 4),
        })
      : undefined;
  const points =
    levelOnly ?? searchFlatGrid(legContext, from, to, { allowSteps: true, expansionLimit: ROUTE_MAX_EXPANSIONS });
  return points ? [centeredStart, ...points, [end[0], goalLevel, end[2]]] : undefined;
};

const stairWaypoints = (from: Vec3, to: Vec3, budget: SearchBudget): Vec3[] => {
  const rise = Math.abs(Math.round(to[1] - from[1]));
  const dx = Math.round(to[0] - from[0]);
  const dz = Math.round(to[2] - from[2]);
  const steps = Math.abs(dx) + Math.abs(dz);
  budget.consume(steps);
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
    while (
      last > first &&
      (points[last]![1] !== anchor[1] || !shamblerRouteSegmentClear(body, anchor, points[last]!, isSolid))
    ) {
      last -= 1;
    }
    const point = points[last]!;
    compressed.push(point);
    anchor = point;
    first = last + 1;
  }
  return compressed;
};

const addEdge = (graph: RouteEdge[][], from: number, edge: RouteEdge, budget: SearchBudget): void => {
  budget.consume(graph[from]!.length + edge.waypoints.length + 1);
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

const addFlatEdge = ({ graph, nodes, search }: RouteGraph, from: number, to: number): void => {
  search.budget.consume(graph[from]!.length + 1);
  if (graph[from]!.some((edge) => edge.to === to)) {
    return;
  }
  const points = flatRoute(search, nodes[from]!.pos, nodes[to]!.pos);
  if (!points) {
    return;
  }
  const compressed = compressFlatPath(search.body, nodes[from]!.pos, points, search.isSolid);
  const cost = compressed.reduce(
    (sum, point, index) => sum + horizontalDistance(index === 0 ? nodes[from]!.pos : compressed[index - 1]!, point),
    0,
  );
  addEdge(graph, from, { to, cost, waypoints: compressed }, search.budget);
  addEdge(
    graph,
    to,
    { to: from, cost, waypoints: [...compressed.slice(0, -1).reverse(), nodes[from]!.pos] },
    search.budget,
  );
};

const flightRemainder = (
  flight: StairRouteLink,
  pos: Vec3,
  descending: boolean,
  budget: SearchBudget,
): Vec3[] | undefined => {
  const dx = Math.sign(flight.upper[0] - flight.lower[0]);
  const dz = Math.sign(flight.upper[2] - flight.lower[2]);
  const along = (pos[0] - flight.lower[0]) * dx + (pos[2] - flight.lower[2]) * dz;
  const across = dx === 0 ? pos[0] - flight.lower[0] : pos[2] - flight.lower[2];
  const rise = flight.upper[1] - flight.lower[1];
  const run = horizontalDistance(flight.lower, flight.upper);
  if (
    along < 0 ||
    along > run ||
    Math.abs(across) >= flight.width / 2 ||
    Math.abs(pos[1] - flight.lower[1] - Math.min(rise, along)) > 1
  ) {
    return undefined;
  }
  return stairWaypoints(
    descending ? flight.upper : flight.lower,
    descending ? flight.lower : flight.upper,
    budget,
  ).filter((point) => {
    const step = (point[0] - flight.lower[0]) * dx + (point[2] - flight.lower[2]) * dz;
    return descending ? step < along : step > along;
  });
};

const addFlightEdges = (
  { graph, search: { body, isSolid, budget } }: RouteGraph,
  flights: readonly FlightNode[],
): void => {
  for (const { lower, upper, link } of flights) {
    budget.consume();
    if (!stairClear(body, link, isSolid)) {
      continue;
    }
    const cost =
      Math.hypot(link.upper[0] - link.lower[0], link.upper[2] - link.lower[2]) +
      Math.abs(link.upper[1] - link.lower[1]);
    addEdge(graph, lower, { to: upper, cost, waypoints: stairWaypoints(link.lower, link.upper, budget) }, budget);
    addEdge(graph, upper, { to: lower, cost, waypoints: stairWaypoints(link.upper, link.lower, budget) }, budget);
    // A changed perception on a tread must not sever the flight that the body is already traversing.
    for (const [to, descending] of [
      [lower, true],
      [upper, false],
    ] as const) {
      const waypoints = flightRemainder(link, body.pos, descending, budget);
      if (waypoints?.length && shamblerRouteSegmentClear(body, body.pos, waypoints[0]!, isSolid)) {
        const first = waypoints[0]!;
        const last = waypoints.at(-1)!;
        const joinCost =
          horizontalDistance(body.pos, first) + horizontalDistance(first, last) + Math.abs(body.pos[1] - last[1]);
        addEdge(graph, 0, { to, cost: joinCost, waypoints }, budget);
      }
    }
  }
};

interface GraphSearch {
  budget: SearchBudget;
  graph: RouteEdge[][];
  distance: number[];
  previous: number[];
  previousEdge: number[];
  visited: boolean[];
}

const closestUnvisited = (search: GraphSearch): number => {
  let current = -1;
  for (let index = 0; index < search.graph.length; index++) {
    search.budget.consume();
    if (!search.visited[index] && (current < 0 || search.distance[index]! < search.distance[current]!)) {
      current = index;
    }
  }
  return current;
};

const relaxGraphEdges = (search: GraphSearch, current: number): void => {
  for (let edgeIndex = 0; edgeIndex < search.graph[current]!.length; edgeIndex++) {
    search.budget.consume();
    const edge = search.graph[current]![edgeIndex]!;
    const candidate = search.distance[current]! + edge.cost;
    if (candidate < search.distance[edge.to]! - 1e-9) {
      search.distance[edge.to] = candidate;
      search.previous[edge.to] = current;
      search.previousEdge[edge.to] = edgeIndex;
    }
  }
};

const searchRouteLegs = (routeGraph: RouteGraph, transitToTerrain: boolean): RouteEdge[] | undefined => {
  const { graph } = routeGraph;
  const search: GraphSearch = {
    budget: routeGraph.search.budget,
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
    // Try the goal before optional landings; an unreachable unrelated edge cannot erase a complete leg.
    addFlatEdge(routeGraph, current, 1);
    if (graph[current]!.some((edge) => edge.to === 1)) {
      relaxGraphEdges(search, current);
      break;
    }
    if (
      transitToTerrain &&
      current >= 2 &&
      onTerrainFloor(routeGraph.nodes[current]!.pos, routeGraph.search.terrainFloor!, routeGraph.search.body.halfWidth)
    ) {
      return reconstructLegs(search, current);
    }
    for (let to = 2; to < graph.length; to++) {
      if (!search.visited[to] && to !== current) {
        addFlatEdge(routeGraph, current, to);
      }
    }
    relaxGraphEdges(search, current);
  }
  return reconstructLegs(search);
};

const reconstructLegs = (search: GraphSearch, endpoint = 1): RouteEdge[] | undefined => {
  const { graph } = search;
  if (!Number.isFinite(search.distance[endpoint])) {
    return undefined;
  }
  const legs: RouteEdge[] = [];
  for (let node = endpoint; node !== 0; node = search.previous[node]!) {
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

const planRoute = (search: FlatSearch, target: Vec3, flights: readonly StairRouteLink[]): Vec3[] | undefined => {
  const { body, budget, terrainFloor } = search;
  const start: Vec3 = [body.pos[0], floorOf(body.pos), body.pos[2]];
  const goal: Vec3 = [target[0], floorOf(target), target[2]];
  const distance = horizontalDistance(start, goal);
  const surface =
    terrainFloor && terrainLeg(start, terrainFloor, body.halfWidth) && terrainLeg(goal, terrainFloor, body.halfWidth);
  if (distance > ROUTE_RADIUS_CELLS) {
    const fraction = (ROUTE_RADIUS_CELLS - 1) / distance;
    goal[0] = Math.round(start[0] + (goal[0] - start[0]) * fraction);
    goal[2] = Math.round(start[2] + (goal[2] - start[2]) * fraction);
    if (terrainFloor && (surface || !bodyClearAt(body, goal, search.isSolid))) {
      goal[1] = terrainStance(goal[0], goal[2], body.halfWidth, terrainFloor);
    }
  }
  const nodes: RouteNode[] = [
    { pos: start, floor: start[1] },
    { pos: goal, floor: goal[1] },
  ];
  if (surface || start[1] === goal[1]) {
    const direct = directPath({ ...search, terrainFloor: surface ? terrainFloor : undefined }, start, goal);
    if (direct) {
      return direct;
    }
  }
  const flightNodes: FlightNode[] = [];
  for (const link of flights) {
    budget.consume();
    const lower = nodes.length;
    nodes.push({ pos: centerOf(link.lower), floor: floorOf(link.lower) });
    const upper = nodes.length;
    nodes.push({ pos: centerOf(link.upper), floor: floorOf(link.upper) });
    flightNodes.push({ lower, upper, link });
  }
  const graph: RouteEdge[][] = nodes.map(() => []);
  const routeGraph: RouteGraph = { graph, nodes, search };
  addFlightEdges(routeGraph, flightNodes);
  const transitToTerrain =
    distance > ROUTE_RADIUS_CELLS && terrainFloor !== undefined && !onTerrainFloor(start, terrainFloor, body.halfWidth);
  const legs = searchRouteLegs(routeGraph, transitToTerrain);
  return legs ? joinLegs(legs) : undefined;
};

class RouteBudgetExhausted extends Error {}

export interface ShamblerRouteRequest {
  body: Body;
  target: Vec3;
  flights: readonly StairRouteLink[];
  isSolid: SolidAt;
  terrainFloor?: TerrainFloorAt | undefined;
  onWork?: ((units: number) => void) | undefined;
}

export const planShamblerRoute = ({
  body,
  target,
  flights,
  isSolid,
  terrainFloor,
  onWork,
}: ShamblerRouteRequest): Vec3[] | undefined => {
  let work = 0;
  const charge = (units = 1) => {
    if (work + units > ROUTE_MAX_WORK) {
      throw new RouteBudgetExhausted();
    }
    work += units;
    onWork?.(units);
  };
  const budget: SearchBudget = { expanded: 0, consume: charge };
  const boundedSolid: SolidAt = (x, y, z) => {
    charge();
    return isSolid(x, y, z);
  };
  const boundedTerrain = terrainFloor
    ? (x: number, z: number) => {
        charge();
        return terrainFloor(x, z);
      }
    : undefined;
  try {
    return planRoute({ body, isSolid: boundedSolid, budget, terrainFloor: boundedTerrain }, target, flights);
  } catch (error) {
    if (!(error instanceof RouteBudgetExhausted)) {
      throw error;
    }
    return undefined;
  }
};
