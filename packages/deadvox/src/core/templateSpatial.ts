// Static spatial acceptance, not recipe closure and not runtime navigation. Doors may be opened.
import { BlockEntities, isBodyDoor } from './blockEntities.ts';
import { type ClimbLink, climbCertificate } from './climbCertificate.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { HAMLET_BLOCK_SIZE } from './hamlet.ts';
import { Inventory } from './inventory.ts';
import { groundLootSupplyIssues } from './placementLoot.ts';
import { pileInReach, reachTuning } from './reach.ts';
import type { StairDef } from './schema.ts';
import { spawnOverlappingSolidBlock, zombieBodyDimensions } from './spawnClearance.ts';
import { type FlightPlan, planFlight, STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from './stairFlight.ts';
import { type CompiledTemplate, cellsOf, type Placement, placedPieces, placedPoint } from './templates.ts';

const BODY_HEIGHT = STAIR_BODY_HEIGHT;
const BODY_HALF_WIDTH = STAIR_BODY_HALF_WIDTH;

function* bodyCells([x, feet, z]: Vec3): Generator<Vec3> {
  for (let y = Math.floor(feet); y < Math.ceil(feet + BODY_HEIGHT); y++) {
    for (let bz = Math.floor(z - BODY_HALF_WIDTH); bz < Math.ceil(z + BODY_HALF_WIDTH); bz++) {
      for (let bx = Math.floor(x - BODY_HALF_WIDTH); bx < Math.ceil(x + BODY_HALF_WIDTH); bx++) {
        yield [bx, y, bz];
      }
    }
  }
}
export type SpatialIssue = [string, string];

export const templateBodySpace = (registry: Registry, template: CompiledTemplate) => {
  const space = new TemplateSpace(registry, template);
  return { standing: (position: Vec3) => space.standing(position), clear: (position: Vec3) => space.clear(position) };
};
const key = (pos: Vec3): string => pos.join(',');
const FLOOD_STEPS: readonly (readonly [number, number])[] = [
  [0.5, 0],
  [-0.5, 0],
  [0, 0.5],
  [0, -0.5],
];

class TemplateSpace {
  readonly registry: Registry;
  readonly template: CompiledTemplate;
  readonly solids: Set<number>;
  readonly furniture: Uint8Array;
  constructor(registry: Registry, template: CompiledTemplate) {
    this.registry = registry;
    this.template = template;
    this.solids = new Set(registry.blocks.flatMap((block, index) => (block.solid ? [index] : [])));
    const [sx, sy, sz] = template.size;
    this.furniture = new Uint8Array(sx * sy * sz);
    for (const piece of template.pieces) {
      const flags =
        Number(this.furnitureStops(piece.furniture, false)) | (Number(this.furnitureStops(piece.furniture, true)) << 1);
      if (flags === 0) {
        continue;
      }
      const [px, py, pz] = piece.pos;
      for (const [dx, dy, dz] of cellsOf(piece.size)) {
        const x = px + dx;
        const y = py + dy;
        const z = pz + dz;
        if (x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz) {
          this.furniture[x + sx * (z + sz * y)]! |= flags;
        }
      }
    }
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
      this.template.ownership?.[x + sx * (z + sz * y)] === 0 ||
      this.solids.has(this.template.blocks[x + sx * (z + sz * y)]!)
    );
  }
  furnitureStops(id: string, doorsOpen: boolean): boolean {
    const def = this.registry.furniture.get(id)!;
    return def.door ? !doorsOpen : def.solid !== false;
  }
  occupied(x: number, y: number, z: number, doorsOpen: boolean): boolean {
    const [sx, , sz] = this.template.size;
    return this.terrain(x, y, z) || (this.furniture[x + sx * (z + sz * y)]! & (doorsOpen ? 2 : 1)) !== 0;
  }
  clear([x, feet, z]: Vec3): boolean {
    // Hot at content build: the flood calls this per candidate step, so no generator or tuples.
    const yEnd = Math.ceil(feet + BODY_HEIGHT);
    const zEnd = Math.ceil(z + BODY_HALF_WIDTH);
    const xEnd = Math.ceil(x + BODY_HALF_WIDTH);
    for (let y = Math.floor(feet); y < yEnd; y++) {
      for (let bz = Math.floor(z - BODY_HALF_WIDTH); bz < zEnd; bz++) {
        for (let bx = Math.floor(x - BODY_HALF_WIDTH); bx < xEnd; bx++) {
          if (this.occupied(bx, y, bz, true)) {
            return false;
          }
        }
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
        const [sx, sy, sz] = this.template.size;
        const support = feet - 1;
        if (
          bx >= 0 &&
          bx < sx &&
          bz >= 0 &&
          bz < sz &&
          support >= 0 &&
          support < sy &&
          this.template.ownership?.[bx + sx * (bz + sz * support)] !== 0 &&
          this.occupied(bx, support, bz, true)
        ) {
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
  reached(entrance: Vec3, within: (position: Vec3) => boolean = () => true): Set<string> {
    const reached = new Set([key(entrance)]);
    const queue: Vec3[] = [entrance];
    for (const from of queue) {
      for (const [dx, dz] of FLOOD_STEPS) {
        for (const dy of [0, 1, -1]) {
          const next: Vec3 = [from[0] + dx, from[1] + dy, from[2] + dz];
          const id = key(next);
          if (!reached.has(id) && within(next) && this.canMove(from, next)) {
            reached.add(id);
            queue.push(next);
          }
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
    // A hatch opens into the space above and below it, not across a wall.
    if (!def?.door || isBodyDoor(def) || def.door.hatch) {
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

const reservedBody = (template: CompiledTemplate, position: Vec3): boolean =>
  !template.reserved ||
  [...bodyCells(position)].every(
    ([x, y, z]) =>
      x >= 0 &&
      x < template.size[0] &&
      y >= 0 &&
      y < template.size[1] &&
      z >= 0 &&
      z < template.size[2] &&
      template.reserved![x + template.size[0] * (z + template.size[2] * y)] === 1,
  );

export const templateClimbCertificate = (
  registry: Registry,
  placement: Placement,
  link: ClimbLink,
): string | undefined => {
  const { template } = placement;
  const space = new TemplateSpace(registry, template);
  const entities = new BlockEntities(registry);
  const ladderCells = new Set<string>();
  for (const piece of template.pieces) {
    if (registry.furniture.get(piece.furniture)?.climbable) {
      for (const offset of cellsOf(piece.size)) {
        ladderCells.add(offset.map((value, axis) => value + piece.pos[axis]!).join(','));
      }
    }
  }
  for (const piece of placedPieces(placement)) {
    entities.add({
      type: piece.furniture,
      pos: piece.pos,
      size: piece.size,
      facing: piece.facing,
      ...(piece.lock ? { lock: piece.lock } : {}),
    });
  }
  const origin = placedPoint(placement, [0, 0, 0]);
  const xAxis = placedPoint(placement, [1, 0, 0]).map((value, axis) => value - origin[axis]!);
  const zAxis = placedPoint(placement, [0, 0, 1]).map((value, axis) => value - origin[axis]!);
  const local = (point: Readonly<Vec3>): Vec3 => {
    const offset = point.map((value, axis) => value - origin[axis]!);
    return [
      offset.reduce((sum, value, axis) => sum + value * xAxis[axis]!, 0),
      offset[1]!,
      offset.reduce((sum, value, axis) => sum + value * zAxis[axis]!, 0),
    ];
  };
  // Ladder cells are owned connector furniture, not owned-air reservations.
  const admittedBody = (point: Vec3): boolean =>
    !template.reserved ||
    [...bodyCells(point)].every(
      ([x, y, z]) =>
        x >= 0 &&
        x < template.size[0] &&
        y >= 0 &&
        y < template.size[1] &&
        z >= 0 &&
        z < template.size[2] &&
        (template.reserved?.[x + template.size[0] * (z + template.size[2] * y)] === 1 ||
          ladderCells.has([x, y, z].join(','))),
    );
  const clear = (point: Readonly<Vec3>): boolean => admittedBody(local(point)) && space.clear(local(point));
  const standing = (point: Readonly<Vec3>): boolean => admittedBody(local(point)) && space.standing(local(point));
  return climbCertificate(
    {
      entities,
      entityAt: (point) => entities.at(...point),
      clear,
      solid: (cell) => {
        const [x, y, z] = local([cell[0] + 0.5, cell[1], cell[2] + 0.5]).map(Math.floor) as Vec3;
        return space.occupied(x, y, z, true);
      },
      standing,
      connected: (from, to) => from[1] === to[1] && templateStandingRoute(registry, template, local(from), local(to)),
      sweep: (from, to, supported = true) => {
        const steps = Math.max(1, Math.ceil(Math.hypot(...to.map((value, axis) => value - from[axis]!)) * 4));
        for (let step = 0; step <= steps; step++) {
          const point = from.map((value, axis) => value + ((to[axis]! - value) * step) / steps) as Vec3;
          if (!(supported ? standing(point) : clear(point))) {
            return false;
          }
        }
        return true;
      },
    },
    link,
  );
};

export const templateStandingRoute = (
  registry: Registry,
  template: CompiledTemplate,
  from: Vec3,
  to: Vec3,
): boolean => {
  const space = new TemplateSpace(registry, template);
  const reserved = (position: Vec3): boolean => reservedBody(template, position);
  return (
    space.standing(from) &&
    space.standing(to) &&
    reserved(from) &&
    reserved(to) &&
    space.reached(from, reserved).has(key(to))
  );
};

export const templateWalkingRoutes = (
  registry: Registry,
  template: CompiledTemplate,
  from: Vec3,
  targets: readonly Vec3[],
): boolean[] => {
  const space = new TemplateSpace(registry, template);
  const standing = targets.map((point) => space.standing(point));
  if (!(space.standing(from) && standing.some(Boolean))) {
    return targets.map(() => false);
  }
  const reached = space.reached(from);
  return targets.map((point, index) => standing[index]! && reached.has(key(point)));
};

export const templateWalkingRoute = (registry: Registry, template: CompiledTemplate, from: Vec3, to: Vec3): boolean =>
  templateWalkingRoutes(registry, template, from, [to])[0]!;

export const templateReachableStandingPositions = (
  registry: Registry,
  template: CompiledTemplate,
  options?: { entrance?: Vec3; within?: (position: Vec3) => boolean },
): Vec3[] => {
  if (!template.access) {
    return [];
  }
  return [
    ...new TemplateSpace(registry, template).reached(options?.entrance ?? template.access.entrance, options?.within),
  ].map((position) => position.split(',').map(Number) as Vec3);
};

export const templateGroundLootReservations = (template: CompiledTemplate, poses: readonly Vec3[]): SpatialIssue[] => {
  const reserved = new Set(poses.flatMap((pose) => [...bodyCells(pose)].map(key)));
  return (template.groundLoot ?? []).flatMap((point, index): SpatialIssue[] =>
    reserved.has(key(point.pos)) ? [[`.groundLoot[${index}]`, 'ground loot overlaps a reserved route pose']] : [],
  );
};

export const templateGroundLootIssues = (registry: Registry, template: CompiledTemplate): SpatialIssue[] => {
  if (!template.groundLoot?.length) {
    return [];
  }
  const space = new TemplateSpace(registry, template);
  const inventory = new Inventory(registry);
  const issues = groundLootSupplyIssues(registry, template);
  if (!reachTuning(registry)) {
    return [...issues, ['.groundLoot', 'ground loot needs player inventory reach tuning']];
  }
  const poses = Object.values(template.anchors ?? {})
    .filter((anchor) => anchor.kind === 'standing')
    .map((anchor) => anchor.at);
  poses.push(...(template.ports ?? []).map((port) => port.standing));
  if (template.access) {
    poses.push(template.access.entrance, ...template.access.stairs.flatMap((stair) => [stair.lower, stair.upper]));
  }
  issues.push(...templateGroundLootReservations(template, poses));
  const [sx, sy, sz] = template.size;
  template.groundLoot.forEach((point, index) => {
    const path = `.groundLoot[${index}]`;
    const [x, y, z] = point.pos;
    const feet: Vec3 = [x + 0.5, y, z + 0.5];
    const support = x + sx * (z + sz * (y - 1));
    if (
      !point.pos.every(Number.isInteger) ||
      x < 0 ||
      x >= sx ||
      y < 1 ||
      y >= sy ||
      z < 0 ||
      z >= sz ||
      !registry.blocks[template.blocks[support]!]?.solid ||
      !space.standing(feet) ||
      !pileInReach(
        {
          inventory,
          position: feet,
          blockSize: HAMLET_BLOCK_SIZE,
          obstacles: {
            isSolid: (bx, by, bz) => space.occupied(bx, by, bz, true),
            version: 0,
          },
        },
        point.pos,
      )
    ) {
      issues.push([path, 'ground loot needs a solid floor, standing body clearance and visible reach']);
    }
    const cell = x + sx * (z + sz * y);
    const inPort = template.ports?.some(({ clearance: { min, size } }) =>
      point.pos.every((value, axis) => value >= min[axis]! && value < min[axis]! + size[axis]!),
    );
    const inDoor = template.pieces.some(
      (piece) =>
        registry.furniture.get(piece.furniture)?.door &&
        x + 1 > piece.pos[0] - BODY_HALF_WIDTH &&
        x < piece.pos[0] + piece.size[0] + BODY_HALF_WIDTH &&
        y + 1 > piece.pos[1] &&
        y < piece.pos[1] + piece.size[1] &&
        z + 1 > piece.pos[2] - BODY_HALF_WIDTH &&
        z < piece.pos[2] + piece.size[2] + BODY_HALF_WIDTH,
    );
    if (template.reserved?.[cell] || inPort || inDoor) {
      issues.push([path, 'ground loot must keep out of reserved circulation, gateways and door approaches']);
    }
  });
  return issues;
};

export const templateStoreyIssues = (template: CompiledTemplate): SpatialIssue[] => {
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
  return [];
};

export const templateSpatialIssues = (registry: Registry, template: CompiledTemplate): SpatialIssue[] => {
  const { access } = template;
  if (!access) {
    return [];
  }
  const metadata = templateStoreyIssues(template);
  if (metadata.length > 0) {
    return metadata;
  }
  const floors = new Map(access.storeys.map((floor) => [floor.id, floor.floor]));
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
