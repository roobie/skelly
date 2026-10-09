import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { stepBodyHorizontal } from '../src/core/physics.ts';
import { BLOCK_SIZE } from '../src/core/scale.ts';
import type { SiteLayoutDef } from '../src/core/schema.ts';
import { zombieBodyDimensions } from '../src/core/spawnClearance.ts';
import {
  type CompiledTemplate,
  cellsOf,
  compileTemplate,
  footprint,
  placedBlockAt,
  placedPieces,
  type Placement as WorldPlacement,
} from '../src/core/templates.ts';
import { PLAYER } from '../src/game/player.ts';

const sources = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json') && !file.startsWith('layouts'))
  .sort()
  .map((source) => ({ source, data: JSON.parse(readFileSync(join('src/content/base', source), 'utf8')) as unknown }));
const { registry } = buildRegistry(sources);

const compileById = (id: string): CompiledTemplate => compileTemplate(registry, registry.templates.get(id)!);

type Point3 = [number, number, number];
interface Bounds {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
const PERIMETER_IDS = new Set([
  'camp_wall_run',
  'camp_wall_run_crouch_hole',
  'camp_gate',
  'camp_gate_damaged',
  'camp_gate_return',
]);
const NEARBY_APPROACH_BLOCKS = 60;
// The outer ring sits just inside the nearest south over-wall threshold; the inner ring reaches the gate leaves.
const NEAR_GROUND_RING_DISTANCES = [5, 42] as const;

const perimeterPlacements = (camp: SiteLayoutDef): WorldPlacement[] =>
  camp.buildings
    .filter(({ template }) => PERIMETER_IDS.has(template))
    .map((building) => ({
      template: compileById(building.template),
      origin: building.position.map((metres) => metres / BLOCK_SIZE) as Point3,
      turn: (building.rotation / 90) as WorldPlacement['turn'],
    }));

const perimeterBounds = (walls: readonly WorldPlacement[]): Bounds =>
  walls.reduce(
    (area, wall) => {
      const [width, depth] = footprint(wall);
      return {
        x0: Math.min(area.x0, wall.origin[0]),
        z0: Math.min(area.z0, wall.origin[2]),
        x1: Math.max(area.x1, wall.origin[0] + width),
        z1: Math.max(area.z1, wall.origin[2] + depth),
      };
    },
    {
      x0: Number.POSITIVE_INFINITY,
      z0: Number.POSITIVE_INFINITY,
      x1: Number.NEGATIVE_INFINITY,
      z1: Number.NEGATIVE_INFINITY,
    },
  );

const outsideApproachPoints = (camp: SiteLayoutDef, bounds: Bounds): [number, number][] =>
  camp.tracks
    .flatMap(({ points }) => points)
    .map(([x, z]) => [x / BLOCK_SIZE, z / BLOCK_SIZE] as [number, number])
    .filter(([x, z]) => {
      const outside = x < bounds.x0 || x >= bounds.x1 || z < bounds.z0 || z >= bounds.z1;
      const dx = Math.max(bounds.x0 - x, 0, x - bounds.x1);
      const dz = Math.max(bounds.z0 - z, 0, z - bounds.z1);
      return outside && Math.hypot(dx, dz) <= NEARBY_APPROACH_BLOCKS;
    });

const solidFurnitureCells = (wall: WorldPlacement): Point3[] =>
  placedPieces(wall).flatMap((piece) => {
    const furniture = registry.furniture.get(piece.furniture);
    if (!furniture || (!furniture.door && furniture.solid !== true)) {
      return [];
    }
    return [...cellsOf(piece.size)].map(([dx, dy, dz]) => [piece.pos[0] + dx, piece.pos[1] + dy, piece.pos[2] + dz]);
  });

const crouchHoleOpening = (wall: WorldPlacement, groundBlock: number) => {
  const [width, depth] = footprint(wall);
  const feetY = groundBlock + 1;
  const cellIsSolid = (x: number, y: number, z: number): boolean => {
    const block = placedBlockAt(wall, [x, y, z]);
    return block !== undefined && registry.blocks[block]?.solid === true;
  };
  const openZ = Array.from({ length: depth }, (_value, offset) => wall.origin[2] + offset).filter((z) =>
    Array.from({ length: width }, (_value, offset) => wall.origin[0] + offset).every((x) => !cellIsSolid(x, feetY, z)),
  );
  let height = 0;
  for (let y = feetY; y < wall.origin[1] + wall.template.size[1]; y += 1) {
    if (
      !openZ.every((z) =>
        Array.from({ length: width }, (_value, offset) => wall.origin[0] + offset).every((x) => !cellIsSolid(x, y, z)),
      )
    ) {
      break;
    }
    height += 1;
  }
  return { openZ, height, width, feetY, cellIsSolid };
};

const perimeterSolidCells = (walls: readonly WorldPlacement[]): Point3[] => {
  const cells = new Map<string, Point3>();
  const addCell = (cell: Point3) => cells.set(cell.join(','), cell);
  for (const wall of walls) {
    const [originX, originY, originZ] = wall.origin;
    const [, templateHeight] = wall.template.size;
    const [width, depth] = footprint(wall);
    for (const [dx, dy, dz] of cellsOf([width, templateHeight, depth])) {
      const cell: Point3 = [originX + dx, originY + dy, originZ + dz];
      const block = placedBlockAt(wall, cell);
      if (block !== undefined && registry.blocks[block]?.solid) {
        addCell(cell);
      }
    }
    for (const cell of solidFurnitureCells(wall)) {
      addCell(cell);
    }
  }
  return [...cells.values()];
};

const nearGroundRingPoints = (
  markers: readonly SiteLayoutDef['shamblers'][number][],
  bounds: Bounds,
): [number, number][] => {
  const cellCenters = (start: number, end: number): number[] => {
    const centers: number[] = [];
    for (let cell = Math.ceil(start); cell < end; cell += 2) {
      centers.push(cell + 0.5);
    }
    return centers;
  };
  const xSamples = [...cellCenters(bounds.x0, bounds.x1), ...markers.map(({ position }) => position[0] / BLOCK_SIZE)];
  const zSamples = [...cellCenters(bounds.z0, bounds.z1), ...markers.map(({ position }) => position[2] / BLOCK_SIZE)];
  return NEAR_GROUND_RING_DISTANCES.flatMap((distance) => [
    ...xSamples.map((x) => [x, bounds.z0 - distance - 0.5] as [number, number]),
    ...xSamples.map((x) => [x, bounds.z1 + distance + 0.5] as [number, number]),
    ...zSamples.map((z) => [bounds.x0 - distance - 0.5, z] as [number, number]),
    ...zSamples.map((z) => [bounds.x1 + distance + 0.5, z] as [number, number]),
  ]);
};

interface BreachBand {
  side: 'north' | 'east' | 'south' | 'west';
  start: number;
  end: number;
}

const perimeterGaps = (walls: readonly WorldPlacement[], bounds: Bounds): BreachBand[] => {
  const edges: { side: BreachBand['side']; start: number; end: number; covered: [number, number][] }[] = [
    {
      side: 'north',
      start: bounds.x0,
      end: bounds.x1,
      covered: walls
        .filter(({ origin }) => origin[2] === bounds.z0)
        .map((wall) => [wall.origin[0], wall.origin[0] + footprint(wall)[0]] as [number, number]),
    },
    {
      side: 'east',
      start: bounds.z0,
      end: bounds.z1,
      covered: walls
        .filter((wall) => wall.origin[0] + footprint(wall)[0] === bounds.x1)
        .map((wall) => [wall.origin[2], wall.origin[2] + footprint(wall)[1]] as [number, number]),
    },
    {
      side: 'south',
      start: bounds.x0,
      end: bounds.x1,
      covered: walls
        .filter((wall) => wall.origin[2] + footprint(wall)[1] === bounds.z1)
        .map((wall) => [wall.origin[0], wall.origin[0] + footprint(wall)[0]] as [number, number]),
    },
    {
      side: 'west',
      start: bounds.z0,
      end: bounds.z1,
      covered: walls
        .filter(({ origin }) => origin[0] === bounds.x0)
        .map((wall) => [wall.origin[2], wall.origin[2] + footprint(wall)[1]] as [number, number]),
    },
  ];
  return edges.flatMap(({ side, start, end, covered }) => {
    let cursor = start;
    const gaps: BreachBand[] = [];
    for (const [coveredStart, coveredEnd] of covered.sort((a, b) => a[0] - b[0])) {
      if (coveredStart > cursor) {
        gaps.push({ side, start: cursor, end: coveredStart });
      }
      cursor = Math.max(cursor, coveredEnd);
    }
    if (cursor < end) {
      gaps.push({ side, start: cursor, end });
    }
    return gaps;
  });
};

const sightlineCrossesBreach = (from: Point3, to: Point3, breach: BreachBand, bounds: Bounds): boolean => {
  if (breach.side !== 'south') {
    return false;
  }
  const fraction = (bounds.z1 - from[2]) / (to[2] - from[2]);
  if (fraction < 0 || fraction > 1) {
    return false;
  }
  const xAtBreach = from[0] + (to[0] - from[0]) * fraction;
  return xAtBreach >= breach.start && xAtBreach <= breach.end;
};

const axisInterval = (from: Point3, to: Point3, cell: Point3, axis: 0 | 1 | 2): [number, number] | undefined => {
  const delta = to[axis] - from[axis];
  if (delta === 0) {
    // Face-coincident sightlines still touch cells on either side of the shared boundary.
    return from[axis] >= cell[axis] && from[axis] <= cell[axis] + 1
      ? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]
      : undefined;
  }
  const first = (cell[axis] - from[axis]) / delta;
  const last = (cell[axis] + 1 - from[axis]) / delta;
  return first < last ? [first, last] : [last, first];
};

const segmentHitsCell = (from: Point3, to: Point3, cell: Point3): boolean => {
  let entry = 0;
  let exit = 1;
  for (const axis of [0, 1, 2] as const) {
    const interval = axisInterval(from, to, cell, axis);
    if (!interval) {
      return false;
    }
    entry = Math.max(entry, interval[0]);
    exit = Math.min(exit, interval[1]);
    if (entry >= exit) {
      return false;
    }
  }
  return true;
};

const wallBlocksSightline = (cells: readonly Point3[], from: Point3, to: Point3): boolean =>
  cells.some((cell) => segmentHitsCell(from, to, cell));

const doorPieces = (compiled: CompiledTemplate) =>
  compiled.pieces.filter((piece) => registry.furniture.get(piece.furniture)?.door);

const doorFootprintAtStandingHeight = (compiled: CompiledTemplate): Set<string> =>
  new Set(
    doorPieces(compiled).flatMap((piece) => {
      const y = 1;
      if (y < piece.pos[1] || y >= piece.pos[1] + piece.size[1]) {
        return [];
      }
      return Array.from({ length: piece.size[2] }, (_depthIndex, depthOffset) =>
        Array.from(
          { length: piece.size[0] },
          (_widthIndex, widthOffset) => `${piece.pos[0] + widthOffset},${piece.pos[2] + depthOffset}`,
        ),
      ).flat();
    }),
  );

interface Placement {
  compiled: CompiledTemplate;
  x: number;
  z: number;
}

const blocksAt = (compiled: CompiledTemplate, x: number, y: number, z: number): boolean => {
  const [width, , depth] = compiled.size;
  const block = compiled.blocks[x + width * (z + depth * y)]!;
  if (registry.blocks[block]?.solid) {
    return true;
  }
  return compiled.pieces.some((piece) => {
    if (
      x < piece.pos[0] ||
      x >= piece.pos[0] + piece.size[0] ||
      y < piece.pos[1] ||
      y >= piece.pos[1] + piece.size[1] ||
      z < piece.pos[2] ||
      z >= piece.pos[2] + piece.size[2]
    ) {
      return false;
    }
    const furniture = registry.furniture.get(piece.furniture)!;
    return furniture.door !== undefined || furniture.solid !== false;
  });
};

interface PathOptions {
  placements: readonly Placement[];
  gateX: number;
  outerDepth: number;
  innerZ: number;
  gateWidth: number;
  returnWidth: number;
  innerDoorBlocked?: ReadonlySet<string>;
}

const findPath = ({
  placements,
  gateX,
  outerDepth,
  innerZ,
  gateWidth,
  returnWidth,
  innerDoorBlocked = new Set(),
}: PathOptions): [number, number][] | undefined => {
  const gridWidth = gateWidth + returnWidth * 2;
  const gridDepth = innerZ + outerDepth * 2 + 2;
  const start: [number, number] = [gateX + Math.floor(gateWidth / 2), outerDepth + 1];
  const target: [number, number] = [gateX + Math.floor(gateWidth / 2), innerZ + outerDepth + 1];
  const key = (x: number, z: number) => `${x},${z}`;
  const previous = new Map<string, string | null>([[key(...start), null]]);
  const queue: [number, number][] = [start];
  const outerGateEnd = gateX + gateWidth;

  const blocked = (x: number, z: number): boolean => {
    if (x <= 0 || x >= gridWidth - 1 || z < 0 || z >= gridDepth) {
      return true;
    }
    if (z < outerDepth && (x < gateX || x >= outerGateEnd)) {
      return true;
    }
    if (innerDoorBlocked.has(key(x - gateX, z - innerZ))) {
      return true;
    }
    return placements.some(({ compiled, x: originX, z: originZ }) => {
      const localX = x - originX;
      const localZ = z - originZ;
      return (
        localX >= 0 &&
        localX < compiled.size[0] &&
        localZ >= 0 &&
        localZ < compiled.size[2] &&
        blocksAt(compiled, localX, 1, localZ)
      );
    });
  };

  for (const [x, z] of queue) {
    if (x === target[0] && z === target[1]) {
      const path: [number, number][] = [];
      let current: string | null = key(x, z);
      while (current !== null) {
        const [pathX, pathZ] = current.split(',').map(Number) as [number, number];
        path.push([pathX, pathZ]);
        current = previous.get(current) ?? null;
      }
      return path.reverse();
    }
    for (const [nextX, nextZ] of [
      [x - 1, z],
      [x + 1, z],
      [x, z - 1],
      [x, z + 1],
    ]) {
      const nextKey = key(nextX!, nextZ!);
      if (!(previous.has(nextKey) || blocked(nextX!, nextZ!))) {
        previous.set(nextKey, key(x, z));
        queue.push([nextX!, nextZ!]);
      }
    }
  }
  return undefined;
};

describe('camp gate templates', () => {
  it('uses two operable gate leaves wider than a person door and removes one leaf for gate 2', () => {
    const gate = compileById('camp_gate');
    const damaged = compileById('camp_gate_damaged');
    const leaves = doorPieces(gate);
    const remaining = doorPieces(damaged);
    const personDoor = registry.furniture.get('wood_door')!;
    const rollerDoor = registry.furniture.get('workshop_roller_door')!;

    expect(leaves.length).toBeGreaterThan(1);
    expect(leaves.every((leaf) => registry.furniture.get(leaf.furniture)?.door)).toBe(true);
    expect(leaves.every((leaf) => leaf.size[0] > personDoor.size[0])).toBe(true);
    expect(leaves.every((leaf) => leaf.size[1] >= rollerDoor.size[1])).toBe(true);
    expect(remaining.length).toBeLessThan(leaves.length);
    expect(remaining.length).toBeGreaterThan(0);
  });

  it('keeps the placed north entrance passable through gate 2 and blocks bypasses around its closed leaf', () => {
    const { layouts } = JSON.parse(readFileSync('src/content/base/layouts-playtest.json', 'utf8')) as {
      layouts: SiteLayoutDef[];
    };
    const camp = layouts.find(({ buildings }) => buildings.some(({ template }) => template === 'camp_gate'))!;
    const gateBuildings = camp.buildings.filter(({ template }) =>
      ['camp_gate', 'camp_gate_damaged'].includes(template),
    );
    expect(gateBuildings).toHaveLength(2);
    const outerBuilding = gateBuildings.find(({ template }) => template === 'camp_gate')!;
    const innerBuilding = gateBuildings.find(({ template }) => template === 'camp_gate_damaged')!;
    const returnBuildings = camp.buildings.filter(({ template }) => template === 'camp_gate_return');
    expect(returnBuildings).toHaveLength(2);

    const outer = compileById(outerBuilding.template);
    const inner = compileById(innerBuilding.template);
    const returnWall = compileById('camp_gate_return');
    const [returnWidth, , returnDepth] = returnWall.size;
    const [gateWidth, , outerDepth] = outer.size;
    const gateX = returnWidth;
    const toBlocks = (metres: number) => Math.round(metres * 2);
    const outerX = toBlocks(outerBuilding.position[0]);
    const outerZ = toBlocks(outerBuilding.position[2]);
    const innerZ = toBlocks(innerBuilding.position[2] - outerBuilding.position[2]);
    const returnXs = returnBuildings.map(({ position }) => toBlocks(position[0]) - outerX).sort((a, b) => a - b);
    expect(returnXs).toEqual([0, gateWidth - returnWidth]);
    expect(returnBuildings.every(({ position }) => toBlocks(position[2]) - outerZ === outerDepth)).toBe(true);
    expect(innerZ).toBe(outerDepth + returnDepth);

    const innerDoorOpening = new Set(
      [...doorFootprintAtStandingHeight(outer)].filter((cell) => !doorFootprintAtStandingHeight(inner).has(cell)),
    );
    const placements: Placement[] = [
      { compiled: outer, x: gateX, z: 0 },
      { compiled: inner, x: gateX, z: innerZ },
      ...returnBuildings.map(({ position }) => ({
        compiled: returnWall,
        x: gateX + toBlocks(position[0]) - outerX,
        z: toBlocks(position[2]) - outerZ,
      })),
    ];

    const path = findPath({ placements, gateX, outerDepth, innerZ, gateWidth, returnWidth });
    expect(path).toBeDefined();
    expect(path!.some(([x, z]) => innerDoorOpening.has(`${x - gateX},${z - innerZ}`))).toBe(true);
    expect(
      findPath({
        placements,
        gateX,
        outerDepth,
        innerZ,
        gateWidth,
        returnWidth,
        innerDoorBlocked: doorFootprintAtStandingHeight(outer),
      }),
    ).toBe(undefined);
  });

  it('blocks each zombie body unless its existing collision size fits the east opening', () => {
    const { layouts } = JSON.parse(readFileSync('src/content/base/layouts-playtest.json', 'utf8')) as {
      layouts: SiteLayoutDef[];
    };
    const camp = layouts.find(({ buildings }) => buildings.some(({ template }) => template === 'camp_gate'))!;
    const walls = perimeterPlacements(camp);
    const wall = walls.find(({ template }) => template.id === 'camp_wall_run_crouch_hole')!;
    const groundBlock = Math.round(camp.ground / BLOCK_SIZE);
    const opening = crouchHoleOpening(wall, groundBlock);
    expect(opening.openZ.length).toBeGreaterThan(0);
    const laneWidth = opening.openZ.length;
    const laneCenterZ = (opening.openZ[0]! + opening.openZ.at(-1)! + 1) / 2;
    const isSolid = (x: number, y: number, z: number): boolean => {
      if (
        x >= wall.origin[0] &&
        x < wall.origin[0] + opening.width &&
        z >= wall.origin[2] &&
        z < wall.origin[2] + footprint(wall)[1]
      ) {
        return opening.cellIsSolid(x, y, z);
      }
      return y <= groundBlock;
    };
    const zombies = [...registry.zombies.values()];
    expect(zombies.length).toBeGreaterThan(0);

    for (const type of zombies) {
      const dimensions = zombieBodyDimensions(type, BLOCK_SIZE);
      const halfDepth = dimensions.halfDepth ?? dimensions.halfWidth;
      const fits = dimensions.height <= opening.height && halfDepth * 2 <= laneWidth;
      const body = {
        pos: [wall.origin[0] + opening.width + dimensions.halfWidth + 1, opening.feetY, laneCenterZ] as Point3,
        vel: [0, 0, 0] as Point3,
        halfWidth: dimensions.halfWidth,
        halfDepth,
        height: dimensions.height,
        onGround: true,
      };
      stepBodyHorizontal(body, {
        dx: -(opening.width + dimensions.halfWidth * 2 + 2),
        dz: 0,
        isSolid,
        params: { gravity: 0, stepHeight: 0 },
      });
      expect(body.pos[0]! + body.halfWidth < wall.origin[0], type.id).toBe(fits);
    }
  });

  it('hides the finale from approach tracks and near ground except through the southern breach', () => {
    const { layouts } = JSON.parse(readFileSync('src/content/base/layouts-playtest.json', 'utf8')) as {
      layouts: SiteLayoutDef[];
    };
    const camp = layouts.find(({ buildings }) => buildings.some(({ template }) => template === 'camp_gate'))!;
    const walls = perimeterPlacements(camp);
    const bounds = perimeterBounds(walls);
    const approaches = outsideApproachPoints(camp, bounds);
    const markers = camp.shamblers.filter(({ type }) => type === 'amalgam');
    const nearGround = nearGroundRingPoints(markers, bounds);
    const breaches = perimeterGaps(walls, bounds);
    const solidCells = perimeterSolidCells(walls);
    expect(markers.length).toBeGreaterThan(0);
    expect(approaches.length).toBeGreaterThan(0);
    expect(nearGround.length).toBeGreaterThan(0);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.side).toBe('south');
    const crouchHole = walls.find(({ template }) => template.id === 'camp_wall_run_crouch_hole')!;
    const holeOpening = crouchHoleOpening(crouchHole, Math.round(camp.ground / BLOCK_SIZE));
    expect(holeOpening.openZ.length).toBeGreaterThan(0);
    const eyeHeight = (camp.ground + BLOCK_SIZE + PLAYER.eye) / BLOCK_SIZE;
    expect(holeOpening.feetY + holeOpening.height).toBeLessThan(eyeHeight);
    for (const marker of markers) {
      const body = zombieBodyDimensions(registry.zombies.get(marker.type)!, BLOCK_SIZE);
      const top: Point3 = [
        marker.position[0] / BLOCK_SIZE,
        marker.position[1] / BLOCK_SIZE + body.height + 0.01,
        marker.position[2] / BLOCK_SIZE,
      ];
      expect(approaches.every(([x, z]) => wallBlocksSightline(solidCells, [x, eyeHeight, z], top))).toBe(true);
      const from = (point: [number, number]): Point3 => [point[0], eyeHeight, point[1]];
      const openBreachSightlines = nearGround.filter((point) =>
        sightlineCrossesBreach(from(point), top, breaches[0]!, bounds),
      );
      const visibleNearGround = nearGround.filter(
        (point) =>
          !(
            sightlineCrossesBreach(from(point), top, breaches[0]!, bounds) ||
            wallBlocksSightline(solidCells, from(point), top)
          ),
      );
      expect(openBreachSightlines.length).toBeGreaterThan(0);
      expect(
        visibleNearGround,
        JSON.stringify({ visibleNearGround, breaches, bounds, eyeHeight, top, solidCount: solidCells.length }),
      ).toEqual([]);
    }
  });
});
