import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { polylineDistance } from '../src/core/authoredTerrain.mjs';
import { buildRegistry } from '../src/core/content.ts';
import { BLOCK_SIZE } from '../src/core/scale.ts';
import type { SiteLayoutDef } from '../src/core/schema.ts';
import { STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from '../src/core/stairFlight.ts';
import { templateReachableStandingPositions, templateSpatialIssues } from '../src/core/templateSpatial.ts';
import { type CompiledTemplate, compileTemplate, type Facing } from '../src/core/templates.ts';
import { USE_REACH } from '../src/game/play.ts';

const sources = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json') && !file.startsWith('layouts'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown }));
const layout = (
  JSON.parse(readFileSync('src/content/base/layouts-playtest.json', 'utf8')) as { layouts: SiteLayoutDef[] }
).layouts[0]!;
const result = buildRegistry([...sources, { source: 'medical-layout-test.json', data: { layouts: [layout] } }]);
const required = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Missing ${label}`);
  }
  return value;
};
const medicalBuilding = required(
  layout.buildings.find(({ template }) => template === 'medical_hall'),
  'medical hall',
);
const medicalDefinition = required(result.registry.templates.get(medicalBuilding.template), 'medical template');
const medical = compileTemplate(result.registry, medicalDefinition);
const nearPiece = (
  reachable: readonly (readonly [number, number, number])[],
  piece: { pos: readonly [number, number, number]; size: readonly [number, number, number] },
): boolean => {
  const [x, feet, z] = piece.pos;
  const [width, , depth] = piece.size;
  return reachable.some(([px, py, pz]) => {
    if (py !== feet) {
      return false;
    }
    const dx = Math.max(x - px, 0, px - (x + width));
    const dz = Math.max(z - pz, 0, pz - (z + depth));
    return Math.hypot(dx, dz) <= STAIR_BODY_HALF_WIDTH + 0.5;
  });
};

const fixedContainer = (item: string) => {
  const override = required(
    medicalBuilding.fixedLoot?.find(({ items }) => items.some((entry) => entry.item === item)),
    `fixed ${item}`,
  );
  const piece = required(
    medical.pieces.find(({ pos }) => pos.every((coordinate, axis) => coordinate === override.at[axis])),
    `${item} container`,
  );
  return { override, piece };
};

const wallOffDoor = (template: CompiledTemplate, door: CompiledTemplate['pieces'][number]): CompiledTemplate => {
  const blocks = new Uint16Array(template.blocks);
  const brick = required(result.registry.blockIds.get('brick'), 'brick block');
  const [width, , depth] = template.size;
  const [doorX, doorY, doorZ] = door.pos;
  const [doorWidth, doorHeight, doorDepth] = door.size;
  for (let y = doorY; y < doorY + doorHeight; y++) {
    for (let z = doorZ; z < doorZ + doorDepth; z++) {
      for (let x = doorX; x < doorX + doorWidth; x++) {
        blocks[x + width * (z + depth * y)] = brick;
      }
    }
  }
  return { ...template, blocks, pieces: template.pieces.filter((piece) => piece !== door) };
};

const pointDistanceFromEntrance = (piece: CompiledTemplate['pieces'][number]): number => {
  const entrance = required(medical.access?.entrance, 'medical entrance');
  return Math.hypot(piece.pos[0] + piece.size[0] / 2 - entrance[0], piece.pos[2] + piece.size[2] / 2 - entrance[2]);
};

type Point = [number, number];

const FACING_VECTOR: Record<Facing, Point> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};

const nearestTrackPoint = (point: Point, points: readonly Point[]): Point => {
  let nearest = points[0]!;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index]!;
    const to = points[index + 1]!;
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const lengthSquared = dx * dx + dz * dz;
    const projection =
      lengthSquared === 0 ? 0 : ((point[0] - from[0]) * dx + (point[1] - from[1]) * dz) / lengthSquared;
    const t = Math.max(0, Math.min(1, projection));
    const candidate: Point = [from[0] + t * dx, from[1] + t * dz];
    const candidateDistance = Math.hypot(point[0] - candidate[0], point[1] - candidate[1]);
    if (candidateDistance < distance) {
      nearest = candidate;
      distance = candidateDistance;
    }
  }
  return nearest;
};

describe('authored medical site', () => {
  it('makes every placed triage tent enterable with reachable standing room', () => {
    const tentBuildings = layout.buildings.filter(({ template }) => template === 'triage_tent');
    expect(tentBuildings.length).toBeGreaterThan(0);
    const definition = required(result.registry.templates.get('triage_tent'), 'triage tent template');
    const tent = compileTemplate(result.registry, definition);
    expect(templateSpatialIssues(result.registry, tent)).toEqual([]);
    const reachable = templateReachableStandingPositions(result.registry, tent);
    const [width, , depth] = tent.size;
    expect(
      reachable.some(
        ([x, feet, z]) => feet === tent.access?.storeys[0]?.floor && x > 1 && x < width - 1 && z > 1 && z < depth - 1,
      ),
    ).toBe(true);
  });

  it('hangs the readable research notice on the wall without blocking room access', () => {
    expect(templateSpatialIssues(result.registry, medical)).toEqual([]);
    const reachable = templateReachableStandingPositions(result.registry, medical);
    const notice = required(
      medical.pieces.find((piece) => piece.furniture === 'medical_research_notice'),
      'research notice',
    );
    const definition = required(result.registry.furniture.get(notice.furniture), 'notice definition');
    expect(definition.solid).toBe(false);
    expect(notice.facing).toBe('e');

    const [x, y, z] = notice.pos;
    const [pieceWidth, pieceHeight, pieceDepth] = notice.size;
    const [templateWidth, , templateDepth] = medical.size;
    const wallBehind = Array.from({ length: pieceHeight }, (_, dy) => dy + y).every((wy) =>
      Array.from({ length: pieceDepth }, (_, dz) => dz + z).every((wz) => {
        const cell = x - 1 + templateWidth * (wz + templateDepth * wy);
        return medical.blocks[cell] !== result.registry.blockIds.get('air');
      }),
    );
    expect(wallBehind).toBe(true);

    const overlapsNotice = ([px, feet, pz]: readonly [number, number, number]): boolean =>
      px + STAIR_BODY_HALF_WIDTH > x &&
      px - STAIR_BODY_HALF_WIDTH < x + pieceWidth &&
      pz + STAIR_BODY_HALF_WIDTH > z &&
      pz - STAIR_BODY_HALF_WIDTH < z + pieceDepth &&
      feet < y + pieceHeight &&
      feet + STAIR_BODY_HEIGHT > y;
    expect(reachable.some(overlapsNotice)).toBe(true);

    const frontReachable = reachable.filter(([px]) => px > x + pieceWidth);
    const withinUseReach = frontReachable.some(([px, , pz]) => {
      const dx = Math.max(x - px, 0, px - (x + pieceWidth));
      const dz = Math.max(z - pz, 0, pz - (z + pieceDepth));
      return Math.hypot(dx, dz) * BLOCK_SIZE <= USE_REACH;
    });
    expect(withinUseReach).toBe(true);
  });

  it('encloses staff and pharmacy rooms, with a keyable, pryable pharmacy door', () => {
    expect(result.issues.filter((issue) => issue.source === 'medical-layout-test.json')).toEqual([]);
    expect(templateSpatialIssues(result.registry, medical)).toEqual([]);
    const reachable = templateReachableStandingPositions(result.registry, medical);
    expect(reachable.length).toBeGreaterThan(0);

    const front = fixedContainer('antiseptic');
    const pharmacy = fixedContainer('antibiotics');
    const labLog = fixedContainer('medical_research_log');
    const pharmacyKey = fixedContainer('pharmacy_key');
    expect(pharmacyKey.piece).toBe(front.piece);
    for (const { piece } of [front, pharmacy, labLog]) {
      expect(result.registry.furniture.get(piece.furniture)?.container).toBeDefined();
      expect(nearPiece(reachable, piece), piece.furniture).toBe(true);
    }
    expect(result.registry.items.get('medical_research_log')?.readable).toBeDefined();
    expect(medical.pieces.some((piece) => piece.furniture === 'medical_research_notice')).toBe(true);

    const sofa = required(
      medical.pieces.find((piece) => piece.furniture === 'sofa'),
      'staff-room sofa',
    );
    const officer = required(
      medical.pieces.find((piece) => piece.furniture === 'dead_officer_body'),
      'dead officer body',
    );
    expect(result.registry.furniture.get(officer.furniture)?.container).toBeDefined();
    expect(nearPiece(reachable, sofa)).toBe(true);
    expect(nearPiece(reachable, officer)).toBe(true);

    const wardBeds = medical.pieces.filter((piece) => piece.furniture === 'bed');
    expect(wardBeds.length).toBeGreaterThan(0);
    const frontDistance = pointDistanceFromEntrance(front.piece);
    const pharmacyDistance = pointDistanceFromEntrance(pharmacy.piece);
    expect(
      wardBeds.some((bed) => {
        const distance = pointDistanceFromEntrance(bed);
        return frontDistance < distance && distance < pharmacyDistance;
      }),
    ).toBe(true);

    const unlockedDoors = medical.pieces.filter(
      (piece) => result.registry.furniture.get(piece.furniture)?.door && piece.lock === undefined,
    );
    const staffDoor = required(
      unlockedDoors.find(
        (door) => !nearPiece(templateReachableStandingPositions(result.registry, wallOffDoor(medical, door)), sofa),
      ),
      'staff-room door enclosing the sofa',
    );
    const pharmacyDoor = required(
      medical.pieces.find((piece) => piece.lock?.locked),
      'locked pharmacy door',
    );
    expect(result.registry.furniture.get(pharmacyDoor.furniture)?.door?.prying).toBeDefined();
    expect(result.registry.items.get('pharmacy_key')?.key?.lock).toBe(pharmacyDoor.lock?.id);
    expect(staffDoor).not.toBe(pharmacyDoor);
    const staffDoorClosed = templateReachableStandingPositions(result.registry, wallOffDoor(medical, staffDoor));
    const pharmacyDoorClosed = templateReachableStandingPositions(result.registry, wallOffDoor(medical, pharmacyDoor));
    expect(staffDoor.lock).toBeUndefined();
    expect(pharmacyDoor.lock?.locked).toBe(true);
    expect(nearPiece(reachable, sofa)).toBe(true);
    expect(nearPiece(reachable, pharmacy.piece)).toBe(true);
    expect(nearPiece(staffDoorClosed, sofa)).toBe(false);
    expect(nearPiece(staffDoorClosed, officer)).toBe(false);
    expect(nearPiece(staffDoorClosed, pharmacy.piece)).toBe(true);
    expect(nearPiece(pharmacyDoorClosed, pharmacy.piece)).toBe(false);
    expect(nearPiece(pharmacyDoorClosed, front.piece)).toBe(true);
    expect(nearPiece(pharmacyDoorClosed, sofa)).toBe(true);
  });

  it('keeps the clinic sign on the clear route to the hall entrance', () => {
    expect(result.issues.filter((issue) => issue.source === 'medical-layout-test.json')).toEqual([]);
    const track = required(layout.tracks[0], 'authored track');
    const signBuilding = required(
      layout.buildings.find(({ template }) => template === 'playtest_store'),
      'hamlet clinic-sign building',
    );
    const signTemplate = compileTemplate(result.registry, result.registry.templates.get(signBuilding.template)!);
    const sign = required(
      signTemplate.pieces.find((piece) => piece.furniture === 'clinic_sign'),
      'clinic sign',
    );
    const signPosition: Point = [
      signBuilding.position[0] + (sign.pos[0] + sign.size[0] / 2) * 0.5,
      signBuilding.position[2] + (sign.pos[2] + sign.size[2] / 2) * 0.5,
    ];
    expect(polylineDistance(signPosition, track.points)).toBeLessThan(6);
    const roadPoint = nearestTrackPoint(signPosition, track.points);
    const towardRoad: Point = [roadPoint[0] - signPosition[0], roadPoint[1] - signPosition[1]];
    const [facingX, facingZ] = FACING_VECTOR[sign.facing];
    expect(facingX * towardRoad[0] + facingZ * towardRoad[1]).toBeGreaterThan(0);

    const { entrance } = medical.access!;
    const entrancePosition: Point = [
      medicalBuilding.position[0] + entrance[0] * 0.5,
      medicalBuilding.position[2] + entrance[2] * 0.5,
    ];
    // The whole-track clearance check in authoredFixedLoot.test.ts plus this entrance check implies passage through the gate.
    expect(polylineDistance(entrancePosition, track.points)).toBeLessThanOrEqual(track.width);
  });
});
