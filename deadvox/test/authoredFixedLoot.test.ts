// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared property assertions are called only by tests.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { buildingBounds, polylineDistance } from '../src/core/authoredTerrain.mjs';
import { type BlockEntity, doorPanel } from '../src/core/blockEntities.ts';
import { SPAWN_TIMES } from '../src/core/clock.ts';
import { buildRegistry } from '../src/core/content.ts';
import { toChunk } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { rollLoot } from '../src/core/loot.ts';
import { magazineSpec, magazineWellCalibre } from '../src/core/magazine.ts';
import { Rng } from '../src/core/random.ts';
import { BLOCK_SIZE, makeScale } from '../src/core/scale.ts';
import type { SiteLayoutDef, TemplateDef } from '../src/core/schema.ts';
import { planFlight, STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from '../src/core/stairFlight.ts';
import { templateReachableStandingPositions, templateSpatialIssues } from '../src/core/templateSpatial.ts';
import {
  type CompiledTemplate,
  compileTemplate,
  footprint,
  placedBlockAt,
  placedPieces,
  placedPoint,
  placedSpawns,
} from '../src/core/templates.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';
import { WORKSHOP_DISPLAY_CAR, workshopCar, workshopLift } from '../src/render/workshopVehicle.ts';
import { CATALOGUE } from '../src/vehicles/catalogue.ts';
import { PartLibrary, VOXEL } from '../src/vehicles/model.ts';
import { wheel } from '../src/vehicles/rangeRover.ts';
import { GLASS, keyVoxel } from '../src/vehicles/voxels.ts';

const sources = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json') && !file.startsWith('layouts'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown }));
const layout = (
  JSON.parse(readFileSync('src/content/base/layouts-playtest.json', 'utf8')) as { layouts: SiteLayoutDef[] }
).layouts[0]!;
const result = buildRegistry([...sources, { source: 'playtest-layout-test.json', data: { layouts: [layout] } }]);
const scale = makeScale(0.5);
const partLibrary = new PartLibrary(CATALOGUE);
type FixedOverride = NonNullable<SiteLayoutDef['buildings'][number]['fixedLoot']>[number];
interface OverridePlacement {
  building: SiteLayoutDef['buildings'][number];
  buildingIndex: number;
  override: FixedOverride;
}
type Point = [number, number];
type Bounds = ReturnType<typeof buildingBounds>;

const compactFixture = (): SiteLayoutDef => ({
  ...layout,
  bounds: layout.bounds,
  woodlands: [],
});

const placedOverrides = (fixture: SiteLayoutDef): OverridePlacement[] =>
  fixture.buildings.flatMap((building, buildingIndex) =>
    (building.fixedLoot ?? []).map((override) => ({ building, buildingIndex, override })),
  );

const fixedCount = (placements: OverridePlacement[], template: string, item: string): number =>
  placements
    .filter(({ building }) => building.template === template)
    .flatMap(({ override }) => override.items)
    .filter((fixed) => fixed.item === item)
    .reduce((sum, fixed) => sum + (fixed.count ?? 1), 0);

const overrideFor = (placements: OverridePlacement[], template: string, item: string) =>
  placements.find(
    ({ building, override }) => building.template === template && override.items.some((fixed) => fixed.item === item),
  );

const furnitureAt = ({ building, override }: OverridePlacement): string | undefined => {
  const template = result.registry.templates.get(building.template);
  return (
    template &&
    compileTemplate(result.registry, template).pieces.find((piece) => piece.pos.join(',') === override.at.join(','))
      ?.furniture
  );
};

const hasInteriorPlankCourse = (rows: readonly string[], width: number): boolean =>
  rows.slice(1, -1).some((row) => [...row.slice(1, width - 1)].includes('p'));

const expectHqFloorCourseEdges = (template: Pick<TemplateDef, 'layers' | 'size'>): void => {
  let courseCount = 0;
  for (const [y, rows] of template.layers.entries()) {
    if (!hasInteriorPlankCourse(rows, template.size[0]!)) {
      continue;
    }
    courseCount += 1;
    expect(rows[0], `HQ course ${y} front edge`).toBe('#'.repeat(template.size[0]));
    expect(rows.at(-1), `HQ course ${y} back edge`).toBe('#'.repeat(template.size[0]));
    for (const row of rows.slice(1, -1)) {
      expect(row[0], `HQ course ${y} side edge`).toBe('#');
      expect(row.at(-1), `HQ course ${y} side edge`).toBe('#');
    }
  }
  expect(courseCount).toBeGreaterThan(0);
};

const expectHqMaterialsAndFloorEdges = (compiledHq: CompiledTemplate): void => {
  const hqBlockAt = (x: number, y: number, z: number): string | undefined => {
    const block = compiledHq.blocks[x + compiledHq.size[0] * (z + compiledHq.size[2] * y)]!;
    return result.registry.blocks[block]?.id;
  };
  expect(hqBlockAt(0, 1, 1)).toBe('camo_woodland');
  expectHqFloorCourseEdges(result.registry.templates.get('camp_hq')!);
};

const expectCampHqProperties = (compiledArmoury: CompiledTemplate): void => {
  const hqBuilding = layout.buildings.find(({ template }) => template === 'camp_hq')!;
  const armouryBuilding = layout.buildings.find(({ template }) => template === 'camp_armoury')!;
  const hqDefinition = result.registry.templates.get(hqBuilding.template)!;
  const hqBounds = buildingBounds(hqBuilding, hqDefinition.size);
  const armouryBounds = buildingBounds(armouryBuilding, compiledArmoury.size);
  expect(hqBounds.z1).toBe(armouryBounds.z0);
  expect(Math.min(hqBounds.x1, armouryBounds.x1)).toBeGreaterThan(Math.max(hqBounds.x0, armouryBounds.x0));
  const fenceRects = layout.buildings
    .filter(({ template }) => template === 'camp_wall_run')
    .map((building) => buildingBounds(building, result.registry.templates.get(building.template)!.size));
  expect(fenceRects.length).toBeGreaterThan(0);
  const fenceBounds = {
    x0: Math.min(...fenceRects.map(({ x0 }) => x0)),
    z0: Math.min(...fenceRects.map(({ z0 }) => z0)),
    x1: Math.max(...fenceRects.map(({ x1 }) => x1)),
    z1: Math.max(...fenceRects.map(({ z1 }) => z1)),
  };
  const { entrance } = hqDefinition.access!;
  const entranceWorld: [number, number] = [
    hqBuilding.position[0] + entrance[0] * 0.5,
    hqBuilding.position[2] + entrance[2] * 0.5,
  ];
  expect(entranceWorld[0]).toBeGreaterThan(fenceBounds.x0);
  expect(entranceWorld[0]).toBeLessThan(fenceBounds.x1);
  expect(entranceWorld[1]).toBeGreaterThan(fenceBounds.z0);
  expect(entranceWorld[1]).toBeLessThan(fenceBounds.z1);

  const compiledHq = compileTemplate(result.registry, hqDefinition);
  expectHqMaterialsAndFloorEdges(compiledHq);
  expect(hqDefinition.military).toBe(true);
  expect(compiledHq.pieces.some((piece) => piece.loot === 'military_armoury')).toBe(false);
  expect(hqDefinition.access?.storeys.length).toBeGreaterThanOrEqual(3);
  expect(templateSpatialIssues(result.registry, compiledHq)).toEqual([]);
  const hqReachable = templateReachableStandingPositions(result.registry, compiledHq);
  for (const floor of hqDefinition.access!.storeys) {
    expect(
      hqReachable.some(([, feet]) => feet === floor.floor),
      `${floor.id} floor is reachable on foot`,
    ).toBe(true);
  }
  const hqGround = hqDefinition.access!.storeys.find(({ id }) => id === hqDefinition.access!.ground)!;
  expect(
    hqReachable.some(
      ([x, feet, z]) =>
        feet === hqGround.floor && (x <= 1 || x >= compiledHq.size[0] - 1 || z <= 1 || z >= compiledHq.size[2] - 1),
    ),
  ).toBe(true);

  const hqDoors = compiledHq.pieces.filter((piece) => result.registry.furniture.get(piece.furniture)?.door);
  expect(hqDoors.every((piece) => piece.pos[2] + piece.size[2] < compiledHq.size[2])).toBe(true);
  const sharedWallSolid = (template: CompiledTemplate, x: number, y: number, z: number): boolean => {
    const index = x + template.size[0] * (z + template.size[2] * y);
    return result.registry.blocks[template.blocks[index]!]?.solid === true;
  };
  const hqXOffset = Math.round((hqBuilding.position[0] - armouryBuilding.position[0]) / scale.blockSize);
  const sharedXStart = Math.max(0, -hqXOffset);
  const sharedXEnd = Math.min(compiledHq.size[0], compiledArmoury.size[0] - hqXOffset);
  expect(sharedXEnd).toBeGreaterThan(sharedXStart);
  for (let hqX = sharedXStart; hqX < sharedXEnd; hqX++) {
    const armouryX = hqX + hqXOffset;
    for (let y = 1; y < Math.min(compiledHq.size[1], compiledArmoury.size[1]); y++) {
      expect(sharedWallSolid(compiledHq, hqX, y, compiledHq.size[2] - 1)).toBe(true);
      expect(sharedWallSolid(compiledArmoury, armouryX, y, 0)).toBe(true);
    }
  }
};

const withTestEntrance = (template: CompiledTemplate, target: readonly [number, number, number]): CompiledTemplate => {
  if (template.access) {
    return template;
  }
  const [sx, , sz] = template.size;
  const doors = template.pieces.filter((piece) => result.registry.furniture.get(piece.furniture)?.door);
  const edgeDistance = (piece: (typeof doors)[number]): number =>
    Math.min(piece.pos[0], piece.pos[2], sx - piece.pos[0] - piece.size[0], sz - piece.pos[2] - piece.size[2]);
  const targetDistance = (piece: (typeof doors)[number]): number =>
    Math.abs(piece.pos[0] + piece.size[0] / 2 - target[0]) + Math.abs(piece.pos[2] + piece.size[2] / 2 - target[2]);
  const [door] = [...doors].sort((a, b) => edgeDistance(a) - edgeDistance(b) || targetDistance(a) - targetDistance(b));
  if (!door) {
    throw new Error(`${template.id} has fixed loot but no door from outside`);
  }
  const centerX = door.pos[0] + door.size[0] / 2;
  const centerZ = door.pos[2] + door.size[2] / 2;
  const facesZ = door.size[0] > door.size[2];
  const direction = Math.sign(target[facesZ ? 2 : 0] - (facesZ ? centerZ : centerX)) || 1;
  const entrance: [number, number, number] = facesZ
    ? [centerX, target[1], centerZ + direction * (door.size[2] / 2 + 0.5)]
    : [centerX + direction * (door.size[0] / 2 + 0.5), target[1], centerZ];
  return {
    ...template,
    access: { ground: 'ground', entrance, storeys: [{ id: 'ground', floor: target[1] }], stairs: [] },
  };
};

const partitionRowBefore = (template: CompiledTemplate, targetZ: number): number => {
  const [sx, , sz] = template.size;
  const blockedAt = (x: number, z: number): boolean => {
    const block = template.blocks[x + sx * (z + sz)];
    if (result.registry.blocks[block!]?.solid) {
      return true;
    }
    return template.pieces.some((piece) => {
      const def = result.registry.furniture.get(piece.furniture)!;
      return (
        !def.door &&
        def.solid !== false &&
        x >= piece.pos[0] &&
        x < piece.pos[0] + piece.size[0] &&
        piece.pos[1] <= 1 &&
        piece.pos[1] + piece.size[1] > 1 &&
        z >= piece.pos[2] &&
        z < piece.pos[2] + piece.size[2]
      );
    });
  };
  const rows = Array.from({ length: Math.min(targetZ, sz) - 1 }, (_, index) => index + 1);
  const partitions = rows.filter((z) => {
    const cells = Array.from({ length: sx }, (_, x) => blockedAt(x, z));
    let opening = 0;
    let widestOpening = 0;
    for (const blocked of cells) {
      opening = blocked ? 0 : opening + 1;
      widestOpening = Math.max(widestOpening, opening);
    }
    return cells.filter(Boolean).length > sx / 2 && widestOpening >= 2;
  });
  const partition = Math.max(...partitions);
  if (!Number.isFinite(partition)) {
    throw new Error(`${template.id} fixed loot has no room partition before z=${targetZ}`);
  }
  return partition;
};

const insideTemplate = (template: CompiledTemplate, x: number, y: number, z: number): boolean => {
  const [sx, sy, sz] = template.size;
  return x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz;
};

const solidPieceAt = (template: CompiledTemplate, x: number, y: number, z: number): boolean =>
  template.pieces.some((piece) => {
    const def = result.registry.furniture.get(piece.furniture)!;
    return (
      def.solid !== false &&
      x >= piece.pos[0] &&
      x < piece.pos[0] + piece.size[0] &&
      y >= piece.pos[1] &&
      y < piece.pos[1] + piece.size[1] &&
      z >= piece.pos[2] &&
      z < piece.pos[2] + piece.size[2]
    );
  });

const solidCellAt = (template: CompiledTemplate, x: number, y: number, z: number): boolean => {
  const [sx, , sz] = template.size;
  const block = template.blocks[x + sx * (z + sz * y)]!;
  return result.registry.blocks[block]?.solid === true || solidPieceAt(template, x, y, z);
};

const bodyClearOfSolids = (template: CompiledTemplate, [x, feet, z]: readonly [number, number, number]): boolean => {
  for (let y = Math.floor(feet); y < Math.ceil(feet + STAIR_BODY_HEIGHT); y += 1) {
    for (let bz = Math.floor(z - STAIR_BODY_HALF_WIDTH); bz < Math.ceil(z + STAIR_BODY_HALF_WIDTH); bz += 1) {
      for (let bx = Math.floor(x - STAIR_BODY_HALF_WIDTH); bx < Math.ceil(x + STAIR_BODY_HALF_WIDTH); bx += 1) {
        if (!insideTemplate(template, bx, y, bz) || solidCellAt(template, bx, y, bz)) {
          return false;
        }
      }
    }
  }
  return true;
};

const stairOpeningCells = (placement: AuthoredSite['placements'][number]): Set<string> => {
  const groundLayer = placement.template.groundLayer ?? 0;
  const cells = new Set<string>();
  for (const stair of placement.template.access?.stairs ?? []) {
    const flight = planFlight(stair, placement.template.size);
    if (!flight) {
      throw new Error(`${placement.template.id} has invalid stair geometry`);
    }
    if (groundLayer !== stair.upper[1] - 1) {
      continue;
    }
    for (let step = 0; step < flight.rise; step++) {
      for (const [x, , z] of flight.row(step)) {
        const [worldX, , worldZ] = placedPoint(placement, [x + 0.5, groundLayer, z + 0.5]);
        cells.add(`${Math.floor(worldX)},${Math.floor(worldZ)}`);
      }
    }
  }
  return cells;
};

const expectGroundedPlacement = (site: AuthoredSite, placement: AuthoredSite['placements'][number]): void => {
  const [x0, y0, z0] = placement.origin;
  const [width, depth] = footprint(placement);
  const groundY = y0 + (placement.template.groundLayer ?? 0);
  const openings = stairOpeningCells(placement);
  let foundationCells = 0;
  for (let x = x0; x < x0 + width; x++) {
    for (let z = z0; z < z0 + depth; z++) {
      const block = placedBlockAt(placement, [x, groundY, z]);
      if (block === undefined || !result.registry.blocks[block]?.solid) {
        expect(openings.has(`${x},${z}`), `${placement.template.id} at ${x},${z} is an access stair opening`).toBe(
          true,
        );
        continue;
      }
      foundationCells += 1;
      expect(site.surface.height(x, z, layout.ground / scale.blockSize), `${placement.template.id} at ${x},${z}`).toBe(
        groundY,
      );
    }
  }
  expect(foundationCells, `${placement.template.id} has ground-layer support`).toBeGreaterThan(0);
};

const solidTopAboveWalk = (
  placement: AuthoredSite['placements'][number],
  x: number,
  z: number,
  walkY: number,
): number | undefined => {
  const [, originY] = placement.origin;
  const [, height] = placement.template.size;
  const blocksTop = Array.from({ length: height }, (_, localY) => originY + localY)
    .filter((y) => y > walkY)
    .reduce((highest, y) => {
      const block = placedBlockAt(placement, [x, y, z]);
      return block !== undefined && result.registry.blocks[block]?.solid ? Math.max(highest, y + 1) : highest;
    }, Number.NEGATIVE_INFINITY);
  const piecesTop = placedPieces(placement)
    .filter((piece) => {
      const furniture = result.registry.furniture.get(piece.furniture)!;
      return (
        !furniture.door &&
        furniture.solid !== false &&
        x >= piece.pos[0] &&
        x < piece.pos[0] + piece.size[0] &&
        z >= piece.pos[2] &&
        z < piece.pos[2] + piece.size[2] &&
        piece.pos[1] + piece.size[1] > walkY
      );
    })
    .reduce((highest, piece) => Math.max(highest, piece.pos[1] + piece.size[1]), Number.NEGATIVE_INFINITY);
  const top = Math.max(blocksTop, piecesTop);
  return Number.isFinite(top) ? top : undefined;
};

const expectWallClearance = (
  site: AuthoredSite,
  placement: AuthoredSite['placements'][number],
  jumpReachMeters: number,
): void => {
  const [x0, , z0] = placement.origin;
  const [width, depth] = footprint(placement);
  let checkedColumns = 0;
  for (let x = x0; x < x0 + width; x++) {
    for (let z = z0; z < z0 + depth; z++) {
      const walkY = site.surface.height(x, z, layout.ground / scale.blockSize);
      const topY = solidTopAboveWalk(placement, x, z, walkY);
      if (topY === undefined) {
        continue;
      }
      checkedColumns += 1;
      const clearance = (topY - (walkY + 1)) * scale.blockSize;
      expect(clearance, `${placement.template.id} at ${x},${z}`).toBeGreaterThan(jumpReachMeters);
    }
  }
  expect(checkedColumns, `${placement.template.id} has solid barrier columns`).toBeGreaterThan(0);
};

const columnsFor = (site: AuthoredSite, fixture: SiteLayoutDef): [number, number][] => {
  const columns = new Map<string, [number, number]>();
  for (const placement of site.placements) {
    const [width, depth] = footprint(placement);
    for (let cx = toChunk(placement.origin[0]); cx <= toChunk(placement.origin[0] + width - 1); cx += 1) {
      for (let cz = toChunk(placement.origin[2]); cz <= toChunk(placement.origin[2] + depth - 1); cz += 1) {
        columns.set(`${cx},${cz}`, [cx, cz]);
      }
    }
  }
  for (const spawn of fixture.shamblers) {
    const cx = toChunk(Math.floor(spawn.position[0] / scale.blockSize));
    const cz = toChunk(Math.floor(spawn.position[2] / scale.blockSize));
    columns.set(`${cx},${cz}`, [cx, cz]);
  }
  return [...columns.values()];
};

type DoorCell = [number, number, number];
type DoorPiece = ReturnType<typeof placedPieces>[number];

const doorSideCells = (door: DoorPiece): DoorCell[][] => {
  const [x, y, z] = door.pos;
  const [width, height, depth] = door.size;
  const yOffsets = Array.from({ length: height }, (_, yOffset) => yOffset);
  if (door.facing === 'n' || door.facing === 's') {
    return [-1, 1].map((direction) =>
      yOffsets.flatMap((yOffset) =>
        Array.from(
          { length: width },
          (_, xOffset) => [x + xOffset, y + yOffset, z + (direction < 0 ? -1 : depth)] as DoorCell,
        ),
      ),
    );
  }
  return [-1, 1].map((direction) =>
    yOffsets.flatMap((yOffset) =>
      Array.from(
        { length: depth },
        (_, zOffset) => [x + (direction < 0 ? -1 : width), y + yOffset, z + zOffset] as DoorCell,
      ),
    ),
  );
};

const solidInPlacements = (placements: AuthoredSite['placements'], cell: DoorCell): boolean =>
  placements.some((placement) => {
    const block = placedBlockAt(placement, cell);
    if (block !== undefined && result.registry.blocks[block]?.solid) {
      return true;
    }
    return placedPieces(placement).some((piece) => {
      const def = result.registry.furniture.get(piece.furniture)!;
      return (
        !def.door &&
        def.solid !== false &&
        cell[0] >= piece.pos[0] &&
        cell[0] < piece.pos[0] + piece.size[0] &&
        cell[1] >= piece.pos[1] &&
        cell[1] < piece.pos[1] + piece.size[1] &&
        cell[2] >= piece.pos[2] &&
        cell[2] < piece.pos[2] + piece.size[2]
      );
    });
  });

const blockedDoorCells = (door: DoorPiece, placements: AuthoredSite['placements']): DoorCell[] =>
  doorSideCells(door)
    .flat()
    .filter((cell) => solidInPlacements(placements, cell));

interface DoorSweepPose {
  center: readonly [number, number];
  lengthAxis: readonly [number, number];
  thicknessAxis: readonly [number, number];
  halfLength: number;
  halfThickness: number;
}

const rotateDoorVector = ([x, z]: readonly [number, number], angle: number): [number, number] => [
  Math.cos(angle) * x + Math.sin(angle) * z,
  -Math.sin(angle) * x + Math.cos(angle) * z,
];

interface DoorSweepShape {
  hinge: readonly [number, number];
  length: number;
  thickness: number;
  alongX: boolean;
  angle: number;
}

const doorSweepPose = ({ hinge, length, thickness, alongX, angle }: DoorSweepShape): DoorSweepPose => {
  const lengthAxis = rotateDoorVector(alongX ? [1, 0] : [0, 1], angle);
  const thicknessAxis = rotateDoorVector(alongX ? [0, 1] : [1, 0], angle);
  const offset = rotateDoorVector(alongX ? [length / 2, 0] : [0, length / 2], angle);
  return {
    center: [hinge[0] + offset[0], hinge[1] + offset[1]],
    lengthAxis,
    thicknessAxis,
    halfLength: length / 2,
    halfThickness: thickness / 2,
  };
};

const doorPanelFor = (door: DoorPiece) =>
  doorPanel(
    {
      uid: 1,
      type: door.furniture,
      pos: door.pos,
      size: door.size,
      facing: door.facing,
      searched: false,
      open: true,
    } satisfies BlockEntity,
    BLOCK_SIZE,
  );

const doorPanelOverlapsCell = (pose: DoorSweepPose, cellX: number, cellZ: number): boolean => {
  const dx = cellX + 0.5 - pose.center[0];
  const dz = cellZ + 0.5 - pose.center[1];
  const [axisX, axisZ] = pose.lengthAxis;
  const [sideX, sideZ] = pose.thicknessAxis;
  const epsilon = 1e-9;
  return (
    Math.abs(dx) < 0.5 + pose.halfLength * Math.abs(axisX) + pose.halfThickness * Math.abs(sideX) - epsilon &&
    Math.abs(dz) < 0.5 + pose.halfLength * Math.abs(axisZ) + pose.halfThickness * Math.abs(sideZ) - epsilon &&
    Math.abs(dx * axisX + dz * axisZ) < pose.halfLength + 0.5 * (Math.abs(axisX) + Math.abs(axisZ)) - epsilon &&
    Math.abs(dx * sideX + dz * sideZ) < pose.halfThickness + 0.5 * (Math.abs(sideX) + Math.abs(sideZ)) - epsilon
  );
};

const doorSweepBounds = (pose: DoorSweepPose) => {
  const [axisX, axisZ] = pose.lengthAxis;
  const [sideX, sideZ] = pose.thicknessAxis;
  const extentX = pose.halfLength * Math.abs(axisX) + pose.halfThickness * Math.abs(sideX);
  const extentZ = pose.halfLength * Math.abs(axisZ) + pose.halfThickness * Math.abs(sideZ);
  return {
    minX: Math.floor(pose.center[0] - extentX - 0.5),
    maxX: Math.ceil(pose.center[0] + extentX + 0.5),
    minZ: Math.floor(pose.center[1] - extentZ - 0.5),
    maxZ: Math.ceil(pose.center[1] + extentZ + 0.5),
  };
};

interface DoorSweepGrid {
  pose: DoorSweepPose;
  y: number;
  height: number;
  cells: Set<string>;
}

const addDoorSweepCells = ({ pose, y, height, cells }: DoorSweepGrid): void => {
  const bounds = doorSweepBounds(pose);
  for (let cellX = bounds.minX; cellX < bounds.maxX; cellX += 1) {
    for (let cellZ = bounds.minZ; cellZ < bounds.maxZ; cellZ += 1) {
      if (!doorPanelOverlapsCell(pose, cellX, cellZ)) {
        continue;
      }
      for (let cellY = y; cellY < y + height; cellY += 1) {
        cells.add(`${cellX},${cellY},${cellZ}`);
      }
    }
  }
};

const doorSwingCells = (door: DoorPiece): DoorCell[] => {
  const [x, y, z] = door.pos;
  const [width, height, depth] = door.size;
  const alongX = door.facing === 'n' || door.facing === 's';
  const panel = doorPanelFor(door);
  const length = alongX ? width : depth;
  const thickness = panel.size[alongX ? 2 : 0] / BLOCK_SIZE;
  const hinge: readonly [number, number] = alongX ? [x, z + depth / 2] : [x + width / 2, z];
  const steps = Math.ceil(Math.abs(panel.rotationY) / (Math.PI / 720));
  const cells = new Set<string>();

  for (let step = 0; step <= steps; step += 1) {
    addDoorSweepCells({
      pose: doorSweepPose({ hinge, length, thickness, alongX, angle: (panel.rotationY * step) / steps }),
      y,
      height,
      cells,
    });
  }

  return [...cells].map((cell) => cell.split(',').map(Number) as DoorCell);
};

const furnitureInPlacements = (placements: AuthoredSite['placements'], cell: DoorCell): boolean =>
  placements.some((placement) =>
    placedPieces(placement).some((piece) => {
      const def = result.registry.furniture.get(piece.furniture)!;
      return (
        !def.door &&
        cell[0] >= piece.pos[0] &&
        cell[0] < piece.pos[0] + piece.size[0] &&
        cell[1] >= piece.pos[1] &&
        cell[1] < piece.pos[1] + piece.size[1] &&
        cell[2] >= piece.pos[2] &&
        cell[2] < piece.pos[2] + piece.size[2]
      );
    }),
  );

const blockedDoorSwingCells = (door: DoorPiece, placements: AuthoredSite['placements']): DoorCell[] => {
  const [x, , z] = door.pos;
  const [width, , depth] = door.size;
  const alongX = door.facing === 'n' || door.facing === 's';
  return doorSwingCells(door).filter((cell) => {
    const inDoorWall = alongX ? cell[2] >= z && cell[2] < z + depth : cell[0] >= x && cell[0] < x + width;
    return !inDoorWall && (solidInPlacements(placements, cell) || furnitureInPlacements(placements, cell));
  });
};

const furnishInOrder = (site: AuthoredSite, columns: [number, number][]): Inventory => {
  const inventory = new Inventory(result.registry);
  for (const [cx, cz] of columns) {
    for (const { spec, loot } of site.furnitureIn(cx, cz)) {
      inventory.furnish(spec, loot);
    }
  }
  return inventory;
};

const contents = (inventory: Inventory) =>
  [...inventory.entities.all]
    .map((entity) => [
      entity.pos.join(','),
      (entity.pockets ?? []).map((pocket) =>
        pocket
          .map(({ item, x, y }) => [item.type, item.count, item.condition, x, y] as const)
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      ),
    ])
    .sort(([a], [b]) => String(a).localeCompare(String(b)));

const fixedItemCounts = (
  site: AuthoredSite,
  inventory: Inventory,
  { buildingIndex, override }: OverridePlacement,
): { expected: number; found: number; item: string }[] => {
  const placement = site.placements[buildingIndex]!;
  const localIndex = placement.template.pieces.findIndex((piece) => piece.pos.join(',') === override.at.join(','));
  const placed = placedPieces(placement)[localIndex];
  const entity = placed && inventory.entities.at(...placed.pos);
  const found = (entity?.pockets ?? []).flatMap((pocket) => pocket.map(({ item }) => item));
  return override.items.map((fixed) => ({
    item: fixed.item,
    expected: fixed.count ?? 1,
    found: found
      .filter((item) => item.type === fixed.item && item.condition === (fixed.condition ?? 1))
      .reduce((sum, item) => sum + item.count, 0),
  }));
};

const seededFillerCounts = (
  site: AuthoredSite,
  override: OverridePlacement,
): { expected: number; found: number }[] | undefined => {
  const placement = site.placements[override.buildingIndex]!;
  const localIndex = placement.template.pieces.findIndex(
    (piece) => piece.pos.join(',') === override.override.at.join(','),
  );
  const localPiece = placement.template.pieces[localIndex]!;
  if (localPiece.loot === undefined) {
    return undefined;
  }
  const placed = placedPieces(placement)[localIndex]!;
  const seeded = rollLoot(result.registry, localPiece.loot, Rng.stream(73, `loot:${placed.pos.join(',')}`));
  if (seeded.length === 0) {
    return undefined;
  }
  const actual = site
    .furnitureIn(toChunk(placed.pos[0]), toChunk(placed.pos[2]))
    .find((spawn) => spawn.spec.pos.join(',') === placed.pos.join(','))!.loot;
  return seeded.map((item) => ({
    expected: item.count,
    found: actual
      .filter((candidate) => candidate.type === item.type && candidate.condition === item.condition)
      .reduce((sum, candidate) => sum + candidate.count, 0),
  }));
};

const gapToBounds = (x: number, z: number, rect: Bounds): number =>
  Math.hypot(Math.max(rect.x0 - x, 0, x - rect.x1), Math.max(rect.z0 - z, 0, z - rect.z1));

const samplePolyline = (points: readonly Point[], spacing: number): Point[] =>
  points.slice(0, -1).flatMap((from, segment) => {
    const to = points[segment + 1]!;
    const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / spacing);
    const firstStep = segment === 0 ? 0 : 1;
    return Array.from({ length: steps - firstStep + 1 }, (_, index) => {
      const t = (firstStep + index) / steps;
      return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    });
  });

const northGateRoad = (): SiteLayoutDef['tracks'][number] | undefined => {
  const outer = layout.buildings.find(({ template }) => template === 'camp_gate');
  if (!outer) {
    return undefined;
  }
  const bounds = buildingBounds(outer, result.registry.templates.get(outer.template)!.size);
  const centre: Point = [(bounds.x0 + bounds.x1) / 2, (bounds.z0 + bounds.z1) / 2];
  return layout.tracks.find(
    (track) =>
      track.surface === 'dirt' &&
      track.width >= bounds.x1 - bounds.x0 &&
      polylineDistance(centre, track.points) <= track.width / 2,
  );
};

const farthestEndpoint = (points: readonly Point[], origin: Point): Point =>
  points.reduce((farther, point) =>
    Math.hypot(point[0] - origin[0], point[1] - origin[1]) > Math.hypot(farther[0] - origin[0], farther[1] - origin[1])
      ? point
      : farther,
  );

const sampleRoute = (
  site: AuthoredSite,
  fixture: SiteLayoutDef,
  rects: Bounds[],
): { samples: Point[]; minBuildingClearance: number; maxHeightStep: number; allOnTrackSurface: boolean } => {
  const track = fixture.tracks[0]!;
  const samples: Point[] = [];
  let previousHeight: number | undefined;
  let minBuildingClearance = Number.POSITIVE_INFINITY;
  let maxHeightStep = 0;
  let allOnTrackSurface = true;
  for (let segment = 0; segment < track.points.length - 1; segment += 1) {
    const from = track.points[segment]!;
    const to = track.points[segment + 1]!;
    const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.25);
    for (let step = segment === 0 ? 0 : 1; step <= steps; step += 1) {
      const t = step / steps;
      const x = from[0] + (to[0] - from[0]) * t;
      const z = from[1] + (to[1] - from[1]) * t;
      samples.push([x, z]);
      for (const rect of rects) {
        minBuildingClearance = Math.min(minBuildingClearance, gapToBounds(x, z, rect));
      }
      const cellX = Math.floor(x / scale.blockSize);
      const cellZ = Math.floor(z / scale.blockSize);
      const height = site.surface.height(cellX, cellZ, fixture.ground / scale.blockSize);
      if (previousHeight !== undefined) {
        maxHeightStep = Math.max(maxHeightStep, Math.abs(height - previousHeight));
      }
      previousHeight = height;
      allOnTrackSurface &&= site.surface.top(cellX, cellZ) === result.registry.blockIds.get(track.surface ?? 'dirt');
    }
  }
  return { samples, minBuildingClearance, maxHeightStep, allOnTrackSurface };
};

const nearestAreaDistance = (
  fixture: SiteLayoutDef,
  rects: Bounds[],
  samples: Point[],
  templates: readonly string[],
): { count: number; distance: number } => {
  const areaRects = fixture.buildings
    .map((building, index) => ({ building, rect: rects[index]! }))
    .filter(({ building }) => templates.includes(building.template))
    .map(({ rect }) => rect);
  return {
    count: areaRects.length,
    distance: Math.min(...areaRects.flatMap((rect) => samples.map(([x, z]) => gapToBounds(x, z, rect)))),
  };
};

describe('authored fixed loot', () => {
  it('grounds every authored building on solid terrain', () => {
    const site = new AuthoredSite(73, result.registry, scale, layout);
    expect(site.placements.length).toBeGreaterThan(0);
    for (const placement of site.placements) {
      expectGroundedPlacement(site, placement);
    }
  });

  it('keeps FOB wall and gate solid columns above jump reach', () => {
    const site = new AuthoredSite(73, result.registry, scale, layout);
    const jumpReachMeters = PLAYER.jump ** 2 / (2 * physicsFor(scale).gravity * scale.blockSize);
    const wallPlacements = site.placements.filter(({ template }) =>
      ['camp_wall_run', 'camp_gate', 'camp_gate_damaged', 'camp_gate_return'].includes(template.id),
    );
    expect(wallPlacements.length).toBeGreaterThan(0);
    for (const placement of wallPlacements) {
      expectWallClearance(site, placement, jumpReachMeters);
    }
  });

  it('routes through the north double gate while keeping the south wall breach open', () => {
    const campSite = new AuthoredSite(73, result.registry, scale, layout);
    const wallRects = layout.buildings
      .filter(({ template }) => template === 'camp_wall_run')
      .map((building) => buildingBounds(building, result.registry.templates.get(building.template)!.size));
    expect(wallRects.length).toBeGreaterThan(0);
    const northEdge = Math.min(...wallRects.map(({ z0 }) => z0));
    const southEdge = Math.max(...wallRects.map(({ z1 }) => z1));
    const southRuns = wallRects.filter(({ z1 }) => z1 === southEdge).sort((a, b) => a.x0 - b.x0);
    const southGaps = southRuns.slice(1).flatMap((run, index) => {
      const prior = southRuns[index]!;
      return run.x0 > prior.x1 ? [[prior.x1, run.x0] as const] : [];
    });
    expect(southGaps.length).toBeGreaterThan(0);
    const [breachStart, breachEnd] = southGaps.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0]!;
    const southWallStart = Math.min(...wallRects.filter(({ z1 }) => z1 === southEdge).map(({ z0 }) => z0));
    const gateObjects = layout.buildings.filter(({ template }) =>
      ['camp_gate', 'camp_gate_damaged'].includes(template),
    );
    const outer = gateObjects.find(({ template }) => template === 'camp_gate');
    const inner = gateObjects.find(({ template }) => template === 'camp_gate_damaged');
    if (!(outer && inner)) {
      throw new Error('the camp needs north outer gate 1 and damaged inner gate 2');
    }
    const outerBounds = buildingBounds(outer, result.registry.templates.get(outer.template)!.size);
    const innerBounds = buildingBounds(inner, result.registry.templates.get(inner.template)!.size);
    expect(outerBounds.z0).toBe(northEdge);
    expect([innerBounds.x0, innerBounds.x1]).toEqual([outerBounds.x0, outerBounds.x1]);
    expect(innerBounds.z0).toBeGreaterThan(outerBounds.z1);
    expect(
      gateObjects.every(
        (building) => buildingBounds(building, result.registry.templates.get(building.template)!.size).z1 < southEdge,
      ),
    ).toBe(true);
    const gateWidth = outerBounds.x1 - outerBounds.x0;
    const road = layout.tracks.find(
      (track) =>
        track.surface === 'dirt' &&
        track.width >= gateWidth &&
        [outerBounds, innerBounds].every(
          (bounds) =>
            polylineDistance([(bounds.x0 + bounds.x1) / 2, (bounds.z0 + bounds.z1) / 2], track.points) <=
            track.width / 2,
        ),
    );
    expect(road).toBeDefined();
    const routeX = (breachStart + breachEnd) / 2;
    const southWallZ = southEdge - (wallRects[0]!.z1 - wallRects[0]!.z0) / 2;
    expect(layout.tracks.some((track) => polylineDistance([routeX, southWallZ], track.points) <= track.width / 2)).toBe(
      true,
    );
    expect(
      gateObjects.every((building) => {
        const bounds = buildingBounds(building, result.registry.templates.get(building.template)!.size);
        return bounds.z1 <= southWallStart || bounds.z0 >= southEdge;
      }),
    ).toBe(true);

    const routeXNorth = (outerBounds.x0 + outerBounds.x1) / 2;
    const routeSamples = Math.ceil((innerBounds.z1 - outerBounds.z0 + 2) / 0.5);
    const routeHeights = Array.from({ length: routeSamples + 1 }, (_, index) =>
      campSite.surface.height(routeXNorth, outerBounds.z0 - 1 + index * 0.5, layout.ground / scale.blockSize),
    );
    expect(routeHeights.every((height, index) => index === 0 || Math.abs(height - routeHeights[index - 1]!) <= 1)).toBe(
      true,
    );

    for (const building of gateObjects) {
      const gate = compileTemplate(result.registry, result.registry.templates.get(building.template)!);
      const door = gate.pieces.find((piece) => result.registry.furniture.get(piece.furniture)?.door);
      expect(door).toBeDefined();
      expect(door && result.registry.furniture.get(door.furniture)?.door).toBeDefined();
      const [doorX, doorY] = door!.pos;
      const [doorWidth, doorHeight] = door!.size;
      for (let y = doorY; y < doorY + doorHeight; y++) {
        for (let x = doorX; x < doorX + doorWidth; x++) {
          const block = gate.blocks[x + gate.size[0] * (1 + gate.size[2] * y)]!;
          expect(result.registry.blocks[block]?.solid).toBe(false);
        }
      }
    }
  });

  it('keeps the full-width camp road clear of structures', () => {
    const road = northGateRoad();
    if (road === undefined) {
      throw new Error('the north gate needs a full-width dirt road');
    }
    const buildings = layout.buildings
      .filter(({ template }) => !['camp_gate', 'camp_gate_damaged', 'camp_gate_return'].includes(template))
      .map((building) => buildingBounds(building, result.registry.templates.get(building.template)!.size));
    const minimumClearance = Math.min(
      ...samplePolyline(road.points, 0.25).flatMap(([x, z]) => buildings.map((bounds) => gapToBounds(x, z, bounds))),
    );
    expect(minimumClearance).toBeGreaterThanOrEqual(road.width / 2);
  });

  it('joins the full-width camp road to the narrower medical trail', () => {
    const road = northGateRoad();
    const outer = layout.buildings.find(({ template }) => template === 'camp_gate');
    if (road === undefined || outer === undefined) {
      throw new Error('the north gate needs its full-width road');
    }
    const gateBounds = buildingBounds(outer, result.registry.templates.get(outer.template)!.size);
    const gateCentre: Point = [(gateBounds.x0 + gateBounds.x1) / 2, (gateBounds.z0 + gateBounds.z1) / 2];
    const medicalEnd = farthestEndpoint([road.points[0]!, road.points.at(-1)!], gateCentre);
    const trail = layout.tracks.find(
      (track) =>
        track.width < road.width &&
        track.surface === road.surface &&
        polylineDistance(medicalEnd, track.points) <= (road.width + track.width) / 2,
    );
    expect(trail).toBeDefined();

    const nearestBuildingGap = Math.min(
      ...layout.buildings.map((building) =>
        gapToBounds(
          medicalEnd[0],
          medicalEnd[1],
          buildingBounds(building, result.registry.templates.get(building.template)!.size),
        ),
      ),
    );
    expect(nearestBuildingGap - road.width / 2).toBeLessThanOrEqual(road.width);
    const medicalHall = layout.buildings.find(({ template }) => template === 'medical_hall');
    if (medicalHall === undefined) {
      throw new Error('the medical compound needs its hall placement');
    }
    const medicalBounds = buildingBounds(medicalHall, result.registry.templates.get(medicalHall.template)!.size);
    expect(gapToBounds(medicalEnd[0], medicalEnd[1], medicalBounds)).toBeLessThan(
      gapToBounds(medicalEnd[0], medicalEnd[1], gateBounds),
    );
  });

  it('delivers fixed loot without replacing seed filler and is chunk-order independent', () => {
    expect(result.issues).toEqual([]);
    const fixture = compactFixture();
    const site = new AuthoredSite(73, result.registry, scale, fixture);
    const columns = columnsFor(site, fixture);
    const forward = furnishInOrder(site, columns);
    const reverse = furnishInOrder(site, [...columns].reverse());
    const overrides = placedOverrides(fixture);
    expect(overrides.length).toBeGreaterThan(0);
    const crowbar = overrides.flatMap(({ override }) => override.items).find(({ item }) => item === 'crowbar');
    expect(crowbar?.condition).toBeGreaterThan(0);
    expect(crowbar?.condition).toBeLessThan(1);
    expect(result.registry.items.get('shotshell_box')?.unpack).toMatchObject({
      item: 'shell_12_gauge_00_buck',
      count: 20,
    });
    const fixedCounts = overrides.flatMap((override) => fixedItemCounts(site, forward, override));
    expect(fixedCounts.length).toBeGreaterThan(0);
    for (const fixed of fixedCounts) {
      expect(fixed.found, fixed.item).toBeGreaterThanOrEqual(fixed.expected);
    }
    const seededCounts = overrides.flatMap((override) => seededFillerCounts(site, override) ?? []);
    expect(seededCounts.length).toBeGreaterThan(0);
    for (const seeded of seededCounts) {
      expect(seeded.found).toBeGreaterThanOrEqual(seeded.expected);
    }
    const placedItems = [...forward.entities.all].flatMap((entity) =>
      (entity.pockets ?? []).flatMap((pocket) => pocket.map(({ item }) => item)),
    );
    const rifles = placedItems.filter(({ type }) => ['rifle_assault', 'rifle_ak'].includes(type));
    expect(rifles.length).toBeGreaterThan(0);
    expect(rifles.every((rifle) => rifle.firearm?.chamber === 'empty' && rifle.slots?.magazine === undefined)).toBe(
      true,
    );
    const magazines = placedItems.filter(({ type }) => magazineSpec(result.registry, type) !== undefined);
    expect(magazines.length).toBeGreaterThan(0);
    expect(magazines.every((magazine) => (magazine.cartridges ?? []).length === 0)).toBe(true);
    expect(contents(forward)).toEqual(contents(reverse));
  });

  it('places each beat’s key loot in its agreed buildings and containers', () => {
    const overrides = placedOverrides(layout);
    const templates = new Set(layout.buildings.map(({ template }) => template));
    for (const template of ['small_house', 'bungalow', 'playtest_store', 'playtest_gas_station', 'shed']) {
      expect(templates.has(template), template).toBe(true);
    }
    expect(templates.has('hardware_store')).toBe(false);
    const house = overrides.filter(({ building }) => building.template === 'playtest_house');
    const beans = overrideFor(house, 'playtest_house', 'canned_beans');
    const opener = overrideFor(house, 'playtest_house', 'can_opener');
    const flashlight = overrideFor(house, 'playtest_house', 'flashlight');
    const battery = overrideFor(house, 'playtest_house', 'aa_battery');
    const matches = overrideFor(house, 'playtest_house', 'matches');
    expect(beans).toBeDefined();
    expect(opener).toBeDefined();
    expect(opener).not.toBe(beans);
    expect(flashlight).toBeDefined();
    expect(battery).toBeDefined();
    expect(battery).not.toBe(flashlight);
    expect(matches).toBeDefined();
    expect(matches).not.toBe(flashlight);

    const houseCounts = new Map<string, number>();
    for (const { override } of house) {
      for (const fixed of override.items) {
        houseCounts.set(fixed.item, (houseCounts.get(fixed.item) ?? 0) + (fixed.count ?? 1));
      }
    }
    const torch = result.registry.recipes.get('torch');
    expect(torch).toBeDefined();
    for (const alternatives of torch!.components) {
      expect(alternatives.some((ingredient) => (houseCounts.get(ingredient.item) ?? 0) >= ingredient.count)).toBe(true);
    }

    expect(fixedCount(overrides, 'shed', 'crowbar')).toBeGreaterThan(0);
    expect(
      overrides
        .filter(({ building }) => ['playtest_tool_shack', 'shed'].includes(building.template))
        .flatMap(({ override }) => override.items)
        .some(({ item }) => item === 'hammer' || item === 'duct_tape'),
    ).toBe(false);
    const toolShack = result.registry.templates.get('playtest_tool_shack')!;
    const toolShackCrate = compileTemplate(result.registry, toolShack).pieces.find(
      (piece) => piece.furniture === 'crate',
    );
    expect(toolShackCrate?.loot).toBe('d41_empty');
    expect(fixedCount(overrides, 'bungalow', 'home_repair_book')).toBeGreaterThan(0);
    expect(fixedCount(overrides, 'bungalow', 'rag')).toBeGreaterThanOrEqual(2);
    expect(fixedCount(overrides, 'bungalow', 'wax')).toBeGreaterThan(0);
    expect(fixedCount(overrides, 'bungalow', 'jacket')).toBeGreaterThan(0);
    expect(fixedCount(overrides, 'playtest_gas_station', 'scrap_metal')).toBeGreaterThan(0);
    const scrap = overrideFor(overrides, 'playtest_gas_station', 'scrap_metal');
    expect(scrap).toBeDefined();
    expect(furnitureAt(scrap!)).toBe('crate');
    expect(fixedCount(overrides, 'playtest_store', 'duct_tape')).toBeGreaterThan(0);
    for (const item of ['canned_soup', 'crackers', 'soda_can', 'painkillers', 'bandage']) {
      expect(fixedCount(overrides, 'playtest_store', item), item).toBeGreaterThan(0);
    }
    const medicine = overrideFor(overrides, 'playtest_store', 'painkillers');
    expect(medicine).toBeDefined();
    expect(furnitureAt(medicine!)).toBe('kitchen_cupboard');
    const kiosk = overrideFor(overrides, 'playtest_gas_station', 'portable_radio');
    const radio = kiosk?.override.items.find(({ item }) => item === 'portable_radio');
    expect(radio?.condition).toBeLessThan(1);
    expect(kiosk?.override.items.some(({ item }) => item === 'compass')).toBe(true);
    expect(furnitureAt(kiosk!)).toBe('counter');
    expect(fixedCount(overrides, 'playtest_gas_station', 'compass')).toBeGreaterThan(0);

    const cellar = overrideFor(overrides, 'playtest_dads_cabin', 'shotshell_box');
    const cabin = result.registry.templates.get('playtest_dads_cabin');
    expect(cellar).toBeDefined();
    expect(cellar!.override.at[1]).toBe(cabin?.access?.storeys.find(({ id }) => id === 'cellar')?.floor);
    expect(fixedCount(overrides, 'playtest_dads_cabin', 'pump_shotgun')).toBeGreaterThan(0);

    for (const template of ['workshop_hall', 'workshop_office', 'workshop_parts_store', 'workshop_yard']) {
      expect(
        layout.buildings.some((building) => building.template === template),
        template,
      ).toBe(true);
    }
    expect(fixedCount(overrides, 'workshop_hall', 'shotshell_box')).toBeGreaterThan(0);
    expect(fixedCount(overrides, 'workshop_hall', 'portable_radio')).toBeGreaterThan(0);
    expect(fixedCount(overrides, 'workshop_hall', 'jerry_can')).toBeGreaterThan(0);
    expect(fixedCount(overrides, 'workshop_office', 'workshop_notes')).toBeGreaterThan(0);
    const filler = result.registry.loot.get('workshop_filler')!;
    expect(filler.entries.some(({ item }) => item === 'improvised_suppressor')).toBe(false);
    expect(filler.entries.some(({ item }) => item === 'taped_flashlight_mount')).toBe(false);
  });

  it('locks the armoury, keeps fixed guns empty, and separates its loose rounds', () => {
    const overrides = placedOverrides(layout);
    const officerKey = overrideFor(overrides, 'medical_hall', 'camp_armoury_key');
    expect(officerKey).toBeDefined();
    expect(furnitureAt(officerKey!)).toBe('dead_officer_body');
    for (const rifle of ['rifle_assault', 'rifle_ak']) {
      expect(fixedCount(overrides, 'camp_armoury', rifle)).toBeGreaterThan(0);
    }
    for (const magazine of ['magazine_stanag_30', 'magazine_akm_30']) {
      expect(fixedCount(overrides, 'camp_armoury', magazine)).toBeGreaterThan(0);
    }
    const armouryLoot = overrides.filter(({ building }) => building.template === 'camp_armoury');
    const rifleLoot = armouryLoot.find(({ override }) =>
      override.items.some(({ item }) => magazineWellCalibre(result.registry, item) !== undefined),
    );
    const ammunition = armouryLoot.find(({ override }) =>
      override.items.some(({ item }) => result.registry.items.get(item)?.ammo !== undefined),
    );
    const magazines = armouryLoot.find(({ override }) =>
      override.items.some(({ item }) => magazineSpec(result.registry, item) !== undefined),
    );
    expect(rifleLoot).toBeDefined();
    expect(ammunition).toBeDefined();
    expect(magazines).toBeDefined();
    expect(ammunition).not.toBe(rifleLoot);
    expect(ammunition).not.toBe(magazines);
    expect(furnitureAt(ammunition!)).toBe('ammo_crate');
    const sparse = result.registry.loot.get('military_armoury')!;
    const nothingWeight = sparse.entries.find(({ nothing }) => nothing)?.weight ?? 0;
    const itemWeight = sparse.entries
      .filter(({ item }) => item !== undefined)
      .reduce((sum, entry) => sum + entry.weight, 0);
    expect(nothingWeight).toBeGreaterThanOrEqual(itemWeight);

    const inventory = new Inventory(result.registry);
    for (const rifle of ['rifle_assault', 'rifle_ak']) {
      expect(inventory.create(rifle)).toMatchObject({ firearm: { chamber: 'empty' }, slots: {} });
    }
    for (const magazine of ['magazine_stanag_30', 'magazine_akm_30']) {
      expect(inventory.create(magazine).cartridges ?? []).toEqual([]);
    }
    const armoury = result.registry.templates.get('camp_armoury')!;
    const compiledArmoury = compileTemplate(result.registry, armoury);
    const door = compiledArmoury.pieces.find((piece) => piece.furniture === 'container_door');
    expect(door?.lock).toEqual({ id: 'camp_armoury', locked: true });
    expect(result.registry.furniture.get('container_door')?.door?.prying).toBeDefined();
    expect(compiledArmoury.pieces.some((piece) => piece.furniture === 'camp_closing_note')).toBe(true);
    expect(compiledArmoury.spawns).toEqual([]);

    expectCampHqProperties(compiledArmoury);
  });

  it('lets a player walk from inside the camp sandbag post template to its exit', () => {
    const definition = result.registry.templates.get('camp_sandbag_post')!;
    const post = compileTemplate(result.registry, definition);
    expect(templateSpatialIssues(result.registry, post)).toEqual([]);
    const [width, , depth] = post.size;
    const reachable = templateReachableStandingPositions(result.registry, post);
    expect(
      reachable.some(
        ([x, feet, z]) =>
          feet === post.access?.storeys.find(({ id }) => id === post.access?.ground)?.floor &&
          (x <= 1 || x >= width - 1 || z <= 1 || z >= depth - 1),
      ),
    ).toBe(true);
  });

  it('keeps every fixed-loot container reachable from outside at standing height', () => {
    const buildings = layout.buildings.filter((building) => (building.fixedLoot?.length ?? 0) > 0);
    expect(buildings.length).toBeGreaterThan(0);
    for (const building of buildings) {
      const definition = result.registry.templates.get(building.template)!;
      const compiled = compileTemplate(result.registry, definition);
      const walking = withTestEntrance(compiled, building.fixedLoot![0]!.at);
      expect(
        templateSpatialIssues(result.registry, walking),
        `${building.template}: ${walking.access?.entrance}`,
      ).toEqual([]);
      const reachable = templateReachableStandingPositions(result.registry, walking);
      expect(reachable.length, building.template).toBeGreaterThan(0);
      for (const override of building.fixedLoot!) {
        const container = compiled.pieces.find((piece) => piece.pos.join(',') === override.at.join(','));
        expect(container, `${building.template} at ${override.at.join(',')}`).toBeDefined();
        const [x, , z] = container!.pos;
        const [width, , depth] = container!.size;
        const nearContainer = reachable.some(([px, feet, pz]) => {
          if (feet !== override.at[1]) {
            return false;
          }
          const dx = Math.max(x - px, 0, px - (x + width));
          const dz = Math.max(z - pz, 0, pz - (z + depth));
          return Math.hypot(dx, dz) <= STAIR_BODY_HALF_WIDTH + 0.5;
        });
        expect(nearContainer, `${building.template} at ${override.at.join(',')}`).toBe(true);
      }
    }
  });

  it('keeps the approaches and full opening sweeps of workshop doors clear', () => {
    const workshopIds = new Set(['workshop_hall', 'workshop_office', 'workshop_parts_store']);
    const site = new AuthoredSite(73, result.registry, scale, layout);
    const placements = site.placements.filter((placement) => workshopIds.has(placement.template.id));
    let checkedDoors = 0;

    for (const [index, building] of layout.buildings.entries()) {
      if (!workshopIds.has(building.template)) {
        continue;
      }
      const placement = site.placements[index]!;
      const doors = placedPieces(placement).filter((piece) => result.registry.furniture.get(piece.furniture)?.door);
      checkedDoors += doors.length;
      for (const door of doors) {
        const at = `${building.template} door at ${door.pos.join(',')}`;
        expect(blockedDoorCells(door, placements), at).toEqual([]);
        expect(blockedDoorSwingCells(door, placements), `${at} swing`).toEqual([]);
      }
    }
    expect(checkedDoors).toBeGreaterThan(0);
  });

  it('keeps every workshop opening connected to standing space', () => {
    for (const templateId of ['workshop_hall', 'workshop_office', 'workshop_parts_store', 'workshop_yard']) {
      const template = compileTemplate(result.registry, result.registry.templates.get(templateId)!);
      expect(templateSpatialIssues(result.registry, template), templateId).toEqual([]);
      const reachable = templateReachableStandingPositions(result.registry, template);
      expect(reachable.length, templateId).toBeGreaterThan(0);
      const doors = template.pieces.filter((piece) => result.registry.furniture.get(piece.furniture)?.door);
      if (templateId === 'workshop_yard') {
        continue;
      }
      expect(doors.length, templateId).toBeGreaterThan(0);
      for (const door of doors) {
        const [x, floor, z] = door.pos;
        const [width, , depth] = door.size;
        const nearDoor = reachable.some(([px, feet, pz]) => {
          if (feet !== floor) {
            return false;
          }
          const dx = Math.max(x - px, 0, px - (x + width));
          const dz = Math.max(z - pz, 0, pz - (z + depth));
          return Math.hypot(dx, dz) <= STAIR_BODY_HALF_WIDTH + 0.5;
        });
        expect(nearDoor, `${templateId} door at ${door.pos.join(',')}`).toBe(true);
      }
    }
  });

  it('rests the stripped workshop vehicle lowest solid voxel on its lift without fitted wheels', () => {
    const template = compileTemplate(result.registry, result.registry.templates.get('workshop_hall')!);
    const lifts = template.pieces.filter(({ furniture }) => furniture === 'workshop_lift');
    const cars = template.pieces.filter(({ furniture }) => furniture === 'workshop_stripped_car');
    expect(lifts.length).toBeGreaterThan(0);
    expect(cars.length).toBeGreaterThan(0);
    const lowestSolidVoxelY = Math.min(
      ...WORKSHOP_DISPLAY_CAR.fittings.flatMap((fitting) =>
        [...partLibrary.placed(fitting).grid].flatMap(([voxel, material]) =>
          material === GLASS ? [] : [keyVoxel(voxel)[1]],
        ),
      ),
    );
    for (const car of cars) {
      const renderEntity = {
        uid: 1,
        type: car.furniture,
        pos: car.pos,
        size: car.size,
        facing: car.facing,
        searched: false,
        open: false,
      } satisfies BlockEntity;
      const carBottom = workshopCar(renderEntity).position.y + lowestSolidVoxelY * VOXEL;
      const supportingLift = lifts.find((lift) => {
        const overlapsX = car.pos[0] < lift.pos[0] + lift.size[0] && lift.pos[0] < car.pos[0] + car.size[0];
        const overlapsZ = car.pos[2] < lift.pos[2] + lift.size[2] && lift.pos[2] < car.pos[2] + car.size[2];
        return overlapsX && overlapsZ;
      });
      expect(supportingLift).toBeDefined();
      const liftEntity = {
        uid: 2,
        type: supportingLift!.furniture,
        pos: supportingLift!.pos,
        size: supportingLift!.size,
        facing: supportingLift!.facing,
        searched: false,
        open: false,
      } satisfies BlockEntity;
      const liftView = workshopLift(liftEntity);
      const armTops = liftView.children
        .filter(
          (child): child is Mesh =>
            child instanceof Mesh && child.scale.y < child.scale.x && child.scale.y < child.scale.z,
        )
        .map((arm) => liftView.position.y + arm.position.y + arm.scale.y / 2);
      expect(armTops.length).toBeGreaterThan(0);
      expect(carBottom, 'lowest solid voxel meets lift arms without a gap').toBe(Math.max(...armTops));
    }

    expect(WORKSHOP_DISPLAY_CAR.fittings.length).toBeGreaterThan(0);
    expect(WORKSHOP_DISPLAY_CAR.fittings.some(({ type }) => type === wheel.type.id)).toBe(false);
  });

  it('spawns each authored workshop runner marker as a runner', () => {
    const site = new AuthoredSite(73, result.registry, scale, layout);
    const workshopIds = new Set(['workshop_hall', 'workshop_office', 'workshop_parts_store', 'workshop_yard']);
    const markers = site.placements
      .filter((placement) => workshopIds.has(placement.template.id))
      .flatMap((placement) => placedSpawns(placement).filter(({ zombie }) => zombie === 'runner'));
    const spawns = columnsFor(site, layout).flatMap(([cx, cz]) => site.zombiesIn(cx, cz));
    const runners = spawns.filter(({ type }) => type === 'runner');

    expect(markers.length).toBeGreaterThan(0);
    for (const marker of markers) {
      expect(runners.some(({ pos }) => pos.every((coordinate, axis) => coordinate === marker.pos[axis]))).toBe(true);
    }
  });

  it('places the agreed shambler threats by beat and keeps the seeded wanderer', () => {
    const houseTemplate = result.registry.templates.get('playtest_house')!;
    const bedroomFloor = houseTemplate.access?.storeys.find(({ id }) => id === 'bedroom')?.floor;
    const upstairs = compileTemplate(result.registry, houseTemplate).spawns;
    expect(upstairs).toHaveLength(1);
    expect(upstairs[0]?.pos[1]).toBe(bedroomFloor);

    for (const templateId of ['playtest_tool_shack', 'shed']) {
      const template = result.registry.templates.get(templateId)!;
      const { spawns } = compileTemplate(result.registry, template);
      expect(spawns.some(({ zombie, chance }) => zombie === 'shambler' && chance < 1)).toBe(true);
    }

    const inside = (templateId: string, spawn: SiteLayoutDef['shamblers'][number]): boolean => {
      const building = layout.buildings.find(({ template }) => template === templateId)!;
      const rect = buildingBounds(building, result.registry.templates.get(templateId)!.size);
      return (
        spawn.position[0] >= rect.x0 &&
        spawn.position[0] <= rect.x1 &&
        spawn.position[2] >= rect.z0 &&
        spawn.position[2] <= rect.z1
      );
    };
    const storeThreats = layout.shamblers.filter(
      (spawn) => spawn.type === 'shambler' && inside('playtest_store', spawn),
    );
    const garageThreats = layout.shamblers.filter(
      (spawn) => spawn.type === 'shambler' && inside('playtest_gas_station', spawn),
    );
    expect(storeThreats).toHaveLength(1);
    expect(garageThreats).toHaveLength(1);
    for (const [templateId, item, spawn] of [
      ['playtest_store', 'duct_tape', storeThreats[0]!],
      ['playtest_gas_station', 'scrap_metal', garageThreats[0]!],
    ] as const) {
      const building = layout.buildings.find(({ template }) => template === templateId)!;
      const buildingTemplate = compileTemplate(result.registry, result.registry.templates.get(templateId)!);
      const container = overrideFor(placedOverrides(layout), templateId, item)!;
      const partition = partitionRowBefore(buildingTemplate, container.override.at[2]);
      const walking = withTestEntrance(buildingTemplate, container.override.at);
      expect(templateSpatialIssues(result.registry, walking), templateId).toEqual([]);
      const reachable = templateReachableStandingPositions(result.registry, walking);
      const local: [number, number, number] = spawn.position.map(
        (coordinate, axis) => (coordinate - building.position[axis]!) / scale.blockSize,
      ) as [number, number, number];
      expect(reachable, `${templateId} threat at ${local.join(',')} is reachable at standing height`).toContainEqual(
        local,
      );
      expect(bodyClearOfSolids(buildingTemplate, local), `${templateId} threat body is clear of closed solids`).toBe(
        true,
      );
      expect(
        local[2] - STAIR_BODY_HALF_WIDTH,
        `${templateId} threat stands beyond partition ${partition}`,
      ).toBeGreaterThanOrEqual(partition + 1);
      expect(local[2] + STAIR_BODY_HALF_WIDTH).toBeLessThan(buildingTemplate.size[2]);
    }

    const isInsideWoodland = (x: number, z: number, polygon: Point[]): boolean => {
      let contains = false;
      for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
        const [xi, zi] = polygon[index]!;
        const [xj, zj] = polygon[previous]!;
        const crossesZ = zi > z !== zj > z;
        if (crossesZ && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
          contains = !contains;
        }
      }
      return contains;
    };
    const treelineThreats = layout.shamblers.filter(
      ({ type, position }) =>
        type === 'shambler' &&
        layout.woodlands.some(({ polygon }) => isInsideWoodland(position[0], position[2], polygon)),
    );
    expect(treelineThreats.length).toBeGreaterThanOrEqual(1);
    expect(treelineThreats.length).toBeLessThanOrEqual(2);
    const track = layout.tracks[0]!;
    const roadsideThreats = layout.shamblers.filter(
      (spawn) =>
        spawn.type === 'shambler' &&
        !treelineThreats.includes(spawn) &&
        polylineDistance([spawn.position[0], spawn.position[2]], track.points) <= track.width * 2,
    );
    expect(roadsideThreats).toHaveLength(2);
    const runners = layout.shamblers.filter(({ type }) => type === 'runner');
    const fenceRects = layout.buildings
      .filter(({ template }) => template === 'camp_wall_run')
      .map((building) => buildingBounds(building, result.registry.templates.get(building.template)!.size));
    const fenceBounds = {
      x0: Math.min(...fenceRects.map(({ x0 }) => x0)),
      z0: Math.min(...fenceRects.map(({ z0 }) => z0)),
      x1: Math.max(...fenceRects.map(({ x1 }) => x1)),
      z1: Math.max(...fenceRects.map(({ z1 }) => z1)),
    };
    expect(runners.length).toBeGreaterThan(0);
    expect(
      runners.every(
        ({ position: [x, , z] }) =>
          x < fenceBounds.x0 || x > fenceBounds.x1 || z < fenceBounds.z0 || z > fenceBounds.z1,
      ),
    ).toBe(true);
    const campSite = new AuthoredSite(73, result.registry, scale, layout);
    const campSpawnMarkers = layout.buildings.flatMap((building, index) =>
      ['camp_command_tent', 'camp_tent', 'camp_hq'].includes(building.template)
        ? placedSpawns(campSite.placements[index]!)
        : [],
    );
    expect(campSpawnMarkers.length).toBeGreaterThan(0);
    const hqIndex = layout.buildings.findIndex(({ template }) => template === 'camp_hq');
    const hqThreats = placedSpawns(campSite.placements[hqIndex]!);
    expect(hqThreats.length).toBeGreaterThan(0);
    expect(hqThreats.every(({ chance }) => chance < 1)).toBe(true);
    expect(
      campSpawnMarkers.every(({ pos: [x, , z] }) => {
        const worldX = x * scale.blockSize;
        const worldZ = z * scale.blockSize;
        return (
          worldX >= fenceBounds.x0 && worldX <= fenceBounds.x1 && worldZ >= fenceBounds.z0 && worldZ <= fenceBounds.z1
        );
      }),
    ).toBe(true);
    const armouryPlacement =
      campSite.placements[layout.buildings.findIndex(({ template }) => template === 'camp_armoury')]!;
    expect(placedSpawns(armouryPlacement)).toEqual([]);
    const parsedLayout = result.registry.layouts.get(layout.id)!;
    const parsedThreats = parsedLayout.shamblers;
    const parsedRoadsideThreats = parsedThreats.filter(
      (spawn) =>
        spawn.type === 'shambler' &&
        !treelineThreats.some(({ position }) =>
          position.every((coordinate, axis) => coordinate === spawn.position[axis]),
        ) &&
        polylineDistance([spawn.position[0], spawn.position[2]], track.points) <= track.width * 2,
    );
    const parsedTreelineThreats = parsedThreats.filter(({ position }) =>
      treelineThreats.some((spawn) => position.every((coordinate, axis) => coordinate === spawn.position[axis])),
    );
    const hasDuskWindow = (spawn: SiteLayoutDef['shamblers'][number]) =>
      spawn.window?.fromGameTimeOfDay === SPAWN_TIMES.dusk;
    expect(parsedRoadsideThreats.filter(hasDuskWindow)).toHaveLength(1);
    expect(parsedTreelineThreats.filter(hasDuskWindow)).toHaveLength(1);
    expect(parsedLayout.startTimeGameTimeOfDay).toBe(16 * 3600);
  });

  it('keeps the authored route clear except for its openable gate and walkable over terrain', () => {
    expect(result.issues).toEqual([]);
    const fixture = compactFixture();
    const site = new AuthoredSite(73, result.registry, scale, fixture);
    const rects = fixture.buildings.map((building) =>
      buildingBounds(building, result.registry.templates.get(building.template)!.size),
    );
    const track = fixture.tracks[0]!;
    const routeClearanceRects = fixture.buildings
      .filter(({ template }) => !['camp_gate', 'camp_gate_damaged'].includes(template))
      .map((building) => buildingBounds(building, result.registry.templates.get(building.template)!.size));
    const route = sampleRoute(site, fixture, routeClearanceRects);
    expect(route.samples.length).toBeGreaterThan(0);
    expect(route.minBuildingClearance).toBeGreaterThanOrEqual(track.width / 2);
    expect(route.maxHeightStep).toBeLessThanOrEqual(1);
    expect(route.allOnTrackSurface).toBe(true);
    expect(
      polylineDistance([fixture.player.position[0], fixture.player.position[2]], track.points),
    ).toBeLessThanOrEqual(track.width / 2);
    const nearHouse = nearestAreaDistance(fixture, rects, route.samples, ['playtest_house']);
    expect(nearHouse.count).toBeGreaterThan(0);
    expect(nearHouse.distance).toBeLessThanOrEqual(track.width * 2);
    const nearStores = nearestAreaDistance(fixture, rects, route.samples, [
      'bungalow',
      'playtest_store',
      'small_house',
      'playtest_gas_station',
      'shed',
    ]);
    expect(nearStores.count).toBeGreaterThan(0);
    expect(nearStores.distance).toBeLessThanOrEqual(track.width * 2);
    const nearCabins = nearestAreaDistance(fixture, rects, route.samples, [
      'playtest_dads_cabin',
      'playtest_hunter_cabin',
      'woodshed',
    ]);
    expect(nearCabins.count).toBeGreaterThan(0);
    expect(nearCabins.distance).toBeLessThanOrEqual(track.width * 2);
    const nearCamp = nearestAreaDistance(fixture, rects, route.samples, ['camp_sandbag_post']);
    expect(nearCamp.count).toBeGreaterThan(0);
    expect(nearCamp.distance).toBeLessThanOrEqual(track.width * 2);
  });

  it('joins the workshop-yard gate to the existing cabin route', () => {
    const fixture = compactFixture();
    const mainTrack = fixture.tracks[0]!;
    const yard = fixture.buildings.find((building) => building.template === 'workshop_yard')!;
    const template = result.registry.templates.get(yard.template)!;
    const bounds = buildingBounds(yard, template.size);
    const { entrance } = template.access!;
    const entranceX = yard.position[0] + entrance[0] * scale.blockSize;
    const entranceZ = yard.position[2] + entrance[2] * scale.blockSize;
    const gatePoints: Point[] = [
      [bounds.x0, entranceZ],
      [bounds.x1, entranceZ],
      [entranceX, bounds.z0],
      [entranceX, bounds.z1],
    ];
    const spur = fixture.tracks.find((track) => {
      const start = track.points[0]!;
      const end = track.points.at(-1)!;
      return (
        track !== mainTrack &&
        polylineDistance(start, mainTrack.points) <= track.width / 2 &&
        Math.min(...gatePoints.map(([x, z]) => Math.hypot(end[0] - x, end[1] - z))) <= track.width / 2
      );
    })!;
    const start = spur.points[0]!;
    const end = spur.points.at(-1)!;
    expect(polylineDistance(start, mainTrack.points)).toBeLessThanOrEqual(spur.width / 2);
    expect(Math.min(...gatePoints.map(([x, z]) => Math.hypot(end[0] - x, end[1] - z)))).toBeLessThanOrEqual(
      spur.width / 2,
    );
  });
});
