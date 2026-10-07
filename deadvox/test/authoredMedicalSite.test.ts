import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildingBounds, polylineDistance } from '../src/core/authoredTerrain.mjs';
import { buildRegistry } from '../src/core/content.ts';
import type { SiteLayoutDef } from '../src/core/schema.ts';
import { STAIR_BODY_HALF_WIDTH } from '../src/core/stairFlight.ts';
import { templateReachableStandingPositions, templateSpatialIssues } from '../src/core/templateSpatial.ts';
import { compileTemplate } from '../src/core/templates.ts';

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

describe('authored medical site', () => {
  it('keeps treatment, pharmacy, and staff-room containers reachable through ordinary doors', () => {
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
    expect(front.override.at[2]).toBeGreaterThan(pharmacy.override.at[2]);
    expect(result.registry.items.get('medical_research_log')?.readable).toBeDefined();
    expect(medical.pieces.some((piece) => piece.furniture === 'medical_research_notice')).toBe(true);

    const doors = medical.pieces.filter((piece) => result.registry.furniture.get(piece.furniture)?.door);
    const staffDoor = required(
      doors.find(({ pos }) => pos[0] < 8 && pos[2] < 8),
      'staff-room door',
    );
    const pharmacyDoor = required(
      doors.find(({ pos }) => pos[0] > 20 && pos[2] < 8),
      'pharmacy door',
    );
    expect(staffDoor.furniture).toBe('wood_door');
    expect(pharmacyDoor.furniture).toBe('wood_door');
    expect(nearPiece(reachable, staffDoor)).toBe(true);
    expect(staffDoor.lock).toBeUndefined();
    expect(pharmacyDoor.lock).toBeUndefined();

    const wardBed = required(
      medical.pieces.find((piece) => piece.furniture === 'bed' && piece.pos[2] > 8 && piece.pos[2] < 19),
      'ward bed',
    );
    expect(nearPiece(reachable, wardBed)).toBe(true);

    const officer = required(
      medical.pieces.find((piece) => piece.furniture === 'dead_officer_body'),
      'dead officer body',
    );
    expect(result.registry.furniture.get(officer.furniture)?.container).toBeDefined();
    expect(nearPiece(reachable, officer)).toBe(true);
    expect(medical.pieces.some((piece) => piece.furniture === 'sofa' && piece.pos[0] < 15 && piece.pos[2] < 8)).toBe(
      true,
    );
    expect(medical.spawns.every(({ zombie }) => zombie === 'shambler')).toBe(true);
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
    const signPosition: [number, number] = [
      signBuilding.position[0] + (sign.pos[0] + sign.size[0] / 2) * 0.5,
      signBuilding.position[2] + (sign.pos[2] + sign.size[2] / 2) * 0.5,
    ];
    expect(polylineDistance(signPosition, track.points)).toBeLessThan(6);

    const hallBounds = buildingBounds(medicalBuilding, medicalDefinition.size);
    const fenceBounds = layout.buildings
      .filter(({ template }) => template === 'rickety_fence')
      .map((building) => buildingBounds(building, result.registry.templates.get(building.template)!.size))
      .filter(
        (rect) =>
          rect.x0 >= hallBounds.x0 - 20 &&
          rect.x1 <= hallBounds.x1 + 20 &&
          rect.z0 >= hallBounds.z0 - 20 &&
          rect.z1 <= hallBounds.z1 + 20,
      );
    const southZ = Math.max(...fenceBounds.map(({ z1 }) => z1));
    const southSegments = fenceBounds.filter(
      (rect) => Math.abs(rect.z1 - southZ) < 0.001 && rect.x1 - rect.x0 > rect.z1 - rect.z0,
    );
    const intervals = southSegments.map(({ x0, x1 }) => [x0, x1] as const).sort((left, right) => left[0] - right[0]);
    const gate = required(
      intervals
        .slice(1)
        .map(([x0], index) => ({ x0: intervals[index]![1], x1: x0 }))
        .filter(({ x0, x1 }) => x1 > x0)
        .sort((left, right) => right.x1 - right.x0 - (left.x1 - left.x0))[0],
      'open compound gate',
    );
    const gateCenter: [number, number] = [(gate.x0 + gate.x1) / 2, (southSegments[0]!.z0 + southSegments[0]!.z1) / 2];
    expect(polylineDistance(gateCenter, track.points)).toBeLessThanOrEqual(track.width / 2);

    const { entrance } = medical.access!;
    const entrancePosition: [number, number] = [
      medicalBuilding.position[0] + entrance[0] * 0.5,
      medicalBuilding.position[2] + entrance[2] * 0.5,
    ];
    expect(polylineDistance(entrancePosition, track.points)).toBeLessThanOrEqual(track.width);

    const tents = layout.buildings.filter(({ template }) => template === 'triage_tent');
    const firstTent = required(tents[0], 'triage tent');
    expect(
      tents.find(
        (tent) =>
          tent !== firstTent && tent.position.some((coordinate, axis) => coordinate !== firstTent.position[axis]),
      ),
    ).toBeDefined();
  });
});
