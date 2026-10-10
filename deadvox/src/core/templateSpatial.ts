// Static spatial acceptance, not recipe closure and not runtime navigation. Doors may be opened.
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { HAMLET_BLOCK_SIZE } from './hamlet.ts';
import type { StairDef } from './schema.ts';
import { spawnOverlappingSolidBlock, zombieBodyDimensions } from './spawnClearance.ts';
import { type FlightPlan, planFlight, STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from './stairFlight.ts';
import type { CompiledTemplate } from './templates.ts';

const BODY_HEIGHT = STAIR_BODY_HEIGHT;
const BODY_HALF_WIDTH = STAIR_BODY_HALF_WIDTH;

function* bodyCells([x, feet, z]: Vec3): Generator<Vec3> {
  for (let y = feet; y < Math.ceil(feet + BODY_HEIGHT); y++) {
    for (let bz = Math.floor(z - BODY_HALF_WIDTH); bz < Math.ceil(z + BODY_HALF_WIDTH); bz++) {
      for (let bx = Math.floor(x - BODY_HALF_WIDTH); bx < Math.ceil(x + BODY_HALF_WIDTH); bx++) {
        yield [bx, y, bz];
      }
    }
  }
}
export type SpatialIssue = [string, string];
const key = (pos: Vec3): string => pos.join(',');

class TemplateSpace {
  readonly registry: Registry;
  readonly template: CompiledTemplate;
  readonly solids: Set<number>;
  constructor(registry: Registry, template: CompiledTemplate) {
    this.registry = registry;
    this.template = template;
    this.solids = new Set(registry.blocks.flatMap((block, index) => (block.solid ? [index] : [])));
  }
  terrain(x: number, y: number, z: number): boolean {
    const [sx, sy, sz] = this.template.size;
    return (
      x < 0 ||
      y < 0 ||
      z < 0 ||
      x >= sx ||
      y >= sy ||
      z >= sz ||
      this.solids.has(this.template.blocks[x + sx * (z + sz * y)]!)
    );
  }
  furnitureStops(id: string, doorsOpen: boolean): boolean {
    const def = this.registry.furniture.get(id)!;
    return def.door ? !doorsOpen : def.solid !== false;
  }
  occupied(x: number, y: number, z: number, doorsOpen: boolean): boolean {
    return (
      this.terrain(x, y, z) ||
      this.template.pieces.some(
        (piece) =>
          this.furnitureStops(piece.furniture, doorsOpen) &&
          x >= piece.pos[0] &&
          x < piece.pos[0] + piece.size[0] &&
          y >= piece.pos[1] &&
          y < piece.pos[1] + piece.size[1] &&
          z >= piece.pos[2] &&
          z < piece.pos[2] + piece.size[2],
      )
    );
  }
  clear([x, feet, z]: Vec3): boolean {
    for (const [bx, y, bz] of bodyCells([x, feet, z])) {
      if (this.occupied(bx, y, bz, true)) {
        return false;
      }
    }
    return true;
  }
  standing(pos: Vec3): boolean {
    const [x, feet, z] = pos;
    if (!this.clear(pos)) {
      return false;
    }
    for (let bz = Math.floor(z - BODY_HALF_WIDTH); bz < Math.ceil(z + BODY_HALF_WIDTH); bz++) {
      for (let bx = Math.floor(x - BODY_HALF_WIDTH); bx < Math.ceil(x + BODY_HALF_WIDTH); bx++) {
        if (this.occupied(bx, feet - 1, bz, true)) {
          return true;
        }
      }
    }
    return false;
  }
  flightIssues(stair: StairDef, index: number): SpatialIssue[] {
    const floors = new Map(this.template.access!.storeys.map((floor) => [floor.id, floor.floor]));
    const path = `.access.stairs[${index}]`;
    const plan = planFlight(stair, this.template.size);
    if (
      !plan ||
      floors.get(stair.from) !== stair.lower[1] ||
      floors.get(stair.to) !== stair.upper[1] ||
      !this.solids.has(this.registry.blockIds.get(stair.block) ?? -1)
    ) {
      return [
        [
          path,
          'flight needs a solid block, joined floor ids/heights, and one-block rises along a straight, aligned run',
        ],
      ];
    }
    const issues: SpatialIssue[] = [];
    if ([-1, 0, plan.rise, plan.rise + 1].flatMap(plan.row).some(([x, feet, z]) => !this.terrain(x, feet - 1, z))) {
      issues.push([path, 'flight needs supported landings at both ends']);
    }
    const blocked = this.flightHeadroom(stair, plan);
    if (blocked) {
      issues.push([path, `flight needs standing and step-up headroom; blocked cell [${blocked.join(',')}]`]);
    }
    return issues;
  }
  private *flightSamples(stair: StairDef, plan: FlightPlan): Generator<Vec3> {
    // Sample the same half-grid route and raise-then-move envelope as the floor flood.
    // A wide body can overlap two future treads, so clearance follows their support heights.
    const rows = Array.from({ length: plan.rise + 3 }, (_, i) => i - 1).flatMap(plan.row);
    const along = plan.direction[0] === 0 ? 2 : 0;
    const across = along === 0 ? 2 : 0;
    const crossMin = stair.lower[across] - stair.width / 2;
    for (
      let cross = Math.ceil((crossMin + BODY_HALF_WIDTH) * 2) / 2;
      cross <= crossMin + stair.width - BODY_HALF_WIDTH;
      cross += 0.5
    ) {
      let previous: Vec3 = [...stair.lower];
      for (let distance = 0; distance <= plan.rise + 1; distance += 0.5) {
        const pos: Vec3 = [...stair.lower];
        pos[along] += plan.direction[along] * distance;
        pos[across] = cross;
        const columns = [...bodyCells([pos[0], 0, pos[2]])].filter((cell) => cell[1] === 0);
        pos[1] = Math.max(
          ...rows.filter(([x, , z]) => columns.some(([bx, , bz]) => bx === x && bz === z)).map((row) => row[1]),
        );
        const sweep = pos[1] > previous[1] ? [[previous[0], pos[1], previous[2]] as Vec3, pos] : [pos];
        yield* sweep;
        previous = pos;
      }
    }
  }
  private flightHeadroom(stair: StairDef, plan: FlightPlan): Vec3 | undefined {
    for (const sample of this.flightSamples(stair, plan)) {
      const blocked = [...bodyCells(sample)].find(([x, y, z]) => this.occupied(x, y, z, false));
      if (blocked) {
        return blocked;
      }
    }
    return undefined;
  }
  private addFlightHeadroom(stair: StairDef, layer: number, cells: Set<string>): void {
    const plan = planFlight(stair, this.template.size);
    if (!plan) {
      return;
    }
    for (let step = 1; step < plan.rise; step++) {
      for (const [x, , z] of plan.row(step)) {
        cells.add(`${x},${z}`);
      }
    }
    for (const sample of this.flightSamples(stair, plan)) {
      for (const [x, y, z] of bodyCells(sample)) {
        if (y === layer) {
          cells.add(`${x},${z}`);
        }
      }
    }
  }
  private hasFloorOpeningOutsideHeadroom(floor: number, headroom: Set<string>, reached: Set<string>): boolean {
    const [sx, , sz] = this.template.size;
    const layer = floor - 1;
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const block = this.template.blocks[x + sx * (z + sz * layer)]!;
        const standingHere = reached.has(key([x + 0.5, floor, z + 0.5]));
        if (standingHere && !(this.solids.has(block) || headroom.has(`${x},${z}`))) {
          return true;
        }
      }
    }
    return false;
  }
  upperFloorOpeningIssues(reached: Set<string>): SpatialIssue[] {
    const access = this.template.access!;
    const floors = new Map(access.storeys.map((floor) => [floor.id, floor.floor]));
    for (const floor of access.storeys) {
      const incoming = access.stairs.filter(
        (stair) => stair.to === floor.id && (floors.get(stair.from) ?? floor.floor) < floor.floor,
      );
      if (incoming.length === 0) {
        continue;
      }
      const headroom = new Set<string>();
      for (const stair of incoming) {
        this.addFlightHeadroom(stair, floor.floor - 1, headroom);
      }
      if (this.hasFloorOpeningOutsideHeadroom(floor.floor, headroom, reached)) {
        return [['.access.stairs', 'upper-storey floor opening extends beyond flight footprint and headroom']];
      }
    }
    return [];
  }
  canMove(from: Vec3, next: Vec3): boolean {
    if (!this.standing(next)) {
      return false;
    }
    // The physics step-up sweep raises the body one block before moving sideways.
    return next[1] <= from[1] || (this.clear([from[0], next[1], from[2]]) && this.clear(next));
  }
  reached(entrance: Vec3): Set<string> {
    const reached = new Set([key(entrance)]);
    const queue: Vec3[] = [entrance];
    for (const from of queue) {
      const neighbours = [
        [0.5, 0],
        [-0.5, 0],
        [0, 0.5],
        [0, -0.5],
      ].flatMap(([dx, dz]) => [0, 1, -1].map((dy): Vec3 => [from[0] + dx!, from[1] + dy, from[2] + dz!]));
      for (const next of neighbours) {
        if (!reached.has(key(next)) && this.canMove(from, next)) {
          reached.add(key(next));
          queue.push(next);
        }
      }
    }
    return reached;
  }
  floorIssues(reached: Set<string>): SpatialIssue[] {
    const issues: SpatialIssue[] = [];
    const [sx, , sz] = this.template.size;
    for (const floor of this.template.access!.storeys) {
      let cells = 0;
      let disconnected = false;
      for (let z = 0.5; z < sz; z += 0.5) {
        for (let x = 0.5; x < sx; x += 0.5) {
          const pos: Vec3 = [x, floor.floor, z];
          if (this.standing(pos)) {
            cells += 1;
            disconnected ||= !reached.has(key(pos));
          }
        }
      }
      if (cells === 0 || disconnected) {
        issues.push([
          '.access.storeys',
          `storey "${floor.id}" has floor space unreachable from the entrance through openings, openable doors and flights`,
        ]);
      }
    }
    return issues;
  }
}

function* doorFaceCells(
  template: CompiledTemplate,
  piece: CompiledTemplate['pieces'][number],
  across: number,
): Generator<Vec3> {
  const [sx, , sz] = template.size;
  const [x0, y0, z0] = piece.pos;
  const [width, height, depth] = piece.size;
  const acrossX = piece.facing === 'e' || piece.facing === 'w';
  if (across < 0 || across >= (acrossX ? sx : sz)) {
    return;
  }
  const alongStart = acrossX ? z0 : x0;
  const alongLength = acrossX ? depth : width;
  for (let y = y0; y < y0 + height; y += 1) {
    for (let along = alongStart; along < alongStart + alongLength; along += 1) {
      yield acrossX ? [across, y, along] : [along, y, across];
    }
  }
}

const solidDoorFace = (
  template: CompiledTemplate,
  solids: Set<number>,
  piece: CompiledTemplate['pieces'][number],
  across: number,
): boolean => {
  let cells = 0;
  for (const [x, y, z] of doorFaceCells(template, piece, across)) {
    cells += 1;
    if (!solids.has(template.blocks[x + template.size[0] * (z + template.size[2] * y)]!)) {
      return false;
    }
  }
  return cells > 0;
};

export const templateDoorIssues = (registry: Registry, template: CompiledTemplate): SpatialIssue[] => {
  const solids = new Set(registry.blocks.flatMap((block, index) => (block.solid ? [index] : [])));
  return template.pieces.flatMap((piece, index) => {
    const def = registry.furniture.get(piece.furniture);
    if (!def?.door || def.shape) {
      return [];
    }
    const acrossX = piece.facing === 'e' || piece.facing === 'w';
    const [x, , z] = piece.pos;
    const [width, , depth] = piece.size;
    const face = acrossX ? x : z;
    const thickness = acrossX ? width : depth;
    const blocked = [-1, thickness].some((offset) => solidDoorFace(template, solids, piece, face + offset));
    return blocked ? [[`.pieces[${index}]`, 'opens onto solid cells on one side'] as SpatialIssue] : [];
  });
};

export const templateSpawnClearanceIssues = (registry: Registry, template: CompiledTemplate): SpatialIssue[] => {
  const space = new TemplateSpace(registry, template);
  const [sx, sy, sz] = template.size;
  return template.spawns.flatMap((spawn, index) => {
    const type = registry.zombies.get(spawn.zombie);
    if (!type) {
      return [];
    }
    const blocked = spawnOverlappingSolidBlock(
      spawn.pos,
      zombieBodyDimensions(type, HAMLET_BLOCK_SIZE),
      (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz && space.occupied(x, y, z, false),
    );
    return blocked
      ? [[`.spawns[${index}]`, `spawn body overlaps solid cell [${blocked.join(',')}]`] as SpatialIssue]
      : [];
  });
};

export const templateReachableStandingPositions = (registry: Registry, template: CompiledTemplate): Vec3[] => {
  if (!template.access) {
    return [];
  }
  return [...new TemplateSpace(registry, template).reached(template.access.entrance)].map(
    (position) => position.split(',').map(Number) as Vec3,
  );
};

export const templateSpatialIssues = (registry: Registry, template: CompiledTemplate): SpatialIssue[] => {
  const { access } = template;
  if (!access) {
    return [];
  }
  const floors = new Map(access.storeys.map((floor) => [floor.id, floor.floor]));
  if (
    floors.size !== access.storeys.length ||
    new Set(floors.values()).size !== floors.size ||
    !floors.has(access.ground) ||
    access.storeys.some((floor) => floor.floor < 1 || floor.floor + BODY_HEIGHT > template.size[1])
  ) {
    return [['.access.storeys', 'storeys need unique ids/heights, a ground storey, and room for a standing body']];
  }
  const space = new TemplateSpace(registry, template);
  const issues = access.stairs.flatMap((stair, index) => space.flightIssues(stair, index));
  if (issues.length > 0) {
    return issues;
  }
  if (!space.standing(access.entrance)) {
    return [['.access.entrance', 'entrance needs support and standing headroom']];
  }
  const reached = space.reached(access.entrance);
  const openingIssues = space.upperFloorOpeningIssues(reached);
  if (openingIssues.length > 0) {
    return openingIssues;
  }
  const [sx, , sz] = template.size;
  const ground = floors.get(access.ground)!;
  const outside = [...reached].some((point) => {
    const [x, y, z] = point.split(',').map(Number);
    return y === ground && (x! <= 1 || x! >= sx - 1 || z! <= 1 || z! >= sz - 1);
  });
  if (!outside) {
    return [['.access.entrance', 'entrance must reach a standing opening at the footprint edge on the ground storey']];
  }
  return space.floorIssues(reached);
};
