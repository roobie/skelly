import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildingBounds, polylineDistance } from '../src/core/authoredTerrain.mjs';
import { buildRegistry } from '../src/core/content.ts';
import type { SiteLayoutDef } from '../src/core/schema.ts';
import { STAIR_BODY_HALF_WIDTH } from '../src/core/stairFlight.ts';
import { templateReachableStandingPositions, templateSpatialIssues } from '../src/core/templateSpatial.ts';
import { type CompiledTemplate, compileTemplate } from '../src/core/templates.ts';

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

const nearbyFenceBounds = (): ReturnType<typeof buildingBounds>[] => {
  const hallBounds = buildingBounds(medicalBuilding, medicalDefinition.size);
  return layout.buildings
    .filter(({ template }) => template === 'rickety_fence')
    .map((building) =>
      buildingBounds(building, required(result.registry.templates.get(building.template), 'fence template').size),
    )
    .filter(
      (rect) =>
        rect.x0 >= hallBounds.x0 - 20 &&
        rect.x1 <= hallBounds.x1 + 20 &&
        rect.z0 >= hallBounds.z0 - 20 &&
        rect.z1 <= hallBounds.z1 + 20,
    );
};

const horizontalFenceGap = (
  a: ReturnType<typeof buildingBounds>,
  b: ReturnType<typeof buildingBounds>,
): [number, number] | undefined => {
  if (a.x1 - a.x0 <= a.z1 - a.z0 || b.x1 - b.x0 <= b.z1 - b.z0) {
    return undefined;
  }
  if (Math.abs(a.z0 - b.z0) > 0.001 || Math.abs(a.z1 - b.z1) > 0.001) {
    return undefined;
  }
  const [left, right] = a.x0 <= b.x0 ? [a, b] : [b, a];
  return right.x0 > left.x1 ? [(left.x1 + right.x0) / 2, (a.z0 + a.z1) / 2] : undefined;
};

const verticalFenceGap = (
  a: ReturnType<typeof buildingBounds>,
  b: ReturnType<typeof buildingBounds>,
): [number, number] | undefined => {
  if (a.z1 - a.z0 <= a.x1 - a.x0 || b.z1 - b.z0 <= b.x1 - b.x0) {
    return undefined;
  }
  if (Math.abs(a.x0 - b.x0) > 0.001 || Math.abs(a.x1 - b.x1) > 0.001) {
    return undefined;
  }
  const [north, south] = a.z0 <= b.z0 ? [a, b] : [b, a];
  return south.z0 > north.z1 ? [(a.x0 + a.x1) / 2, (north.z1 + south.z0) / 2] : undefined;
};

const fenceGapCenters = (bounds: ReturnType<typeof buildingBounds>[]): [number, number][] => {
  const gaps: [number, number][] = [];
  for (let first = 0; first < bounds.length; first++) {
    for (let second = first + 1; second < bounds.length; second++) {
      const a = bounds[first]!;
      const b = bounds[second]!;
      const gap = horizontalFenceGap(a, b) ?? verticalFenceGap(a, b);
      if (gap) {
        gaps.push(gap);
      }
    }
  }
  return gaps;
};

describe('authored medical site', () => {
  it('encloses the staff room and pharmacy behind reachable, unlocked doors', () => {
    expect(result.issues.filter((issue) => issue.source === 'medical-layout-test.json')).toEqual([]);
    expect(templateSpatialIssues(result.registry, medical)).toEqual([]);
    const reachable = templateReachableStandingPositions(result.registry, medical);
    expect(reachable.length).toBeGreaterThan(0);

    const front = fixedContainer('antiseptic');
    const pharmacy = fixedContainer('antibiotics');
    const labLog = fixedContainer('medical_research_log');
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
      unlockedDoors.find(
        (door) =>
          !nearPiece(templateReachableStandingPositions(result.registry, wallOffDoor(medical, door)), pharmacy.piece),
      ),
      'pharmacy door enclosing the antibiotics container',
    );
    expect(staffDoor).not.toBe(pharmacyDoor);
    const staffDoorClosed = templateReachableStandingPositions(result.registry, wallOffDoor(medical, staffDoor));
    const pharmacyDoorClosed = templateReachableStandingPositions(result.registry, wallOffDoor(medical, pharmacyDoor));
    expect(staffDoor.lock).toBeUndefined();
    expect(pharmacyDoor.lock).toBeUndefined();
    expect(nearPiece(reachable, sofa)).toBe(true);
    expect(nearPiece(reachable, pharmacy.piece)).toBe(true);
    expect(nearPiece(staffDoorClosed, sofa)).toBe(false);
    expect(nearPiece(staffDoorClosed, pharmacy.piece)).toBe(true);
    expect(nearPiece(pharmacyDoorClosed, pharmacy.piece)).toBe(false);
    expect(nearPiece(pharmacyDoorClosed, sofa)).toBe(true);
  });

  it('takes the route past the clinic sign, through the compound gate, and to the hall entrance', () => {
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
    expect(sign.facing).toBe('s');
    const signPosition: [number, number] = [
      signBuilding.position[0] + (sign.pos[0] + sign.size[0] / 2) * 0.5,
      signBuilding.position[2] + (sign.pos[2] + sign.size[2] / 2) * 0.5,
    ];
    expect(polylineDistance(signPosition, track.points)).toBeLessThan(6);

    const gate = required(
      fenceGapCenters(nearbyFenceBounds()).find((center) => polylineDistance(center, track.points) <= track.width / 2),
      'fence gap crossed by the route',
    );
    expect(polylineDistance(gate, track.points)).toBeLessThanOrEqual(track.width / 2);

    const { entrance } = medical.access!;
    const entrancePosition: [number, number] = [
      medicalBuilding.position[0] + entrance[0] * 0.5,
      medicalBuilding.position[2] + entrance[2] * 0.5,
    ];
    expect(polylineDistance(entrancePosition, track.points)).toBeLessThanOrEqual(track.width);
  });
});
