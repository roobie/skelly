import { describe, expect, it } from 'vitest';
import { penetrationWorld, worldSolid } from '../src/core/geometry.ts';
import { IDENTITY } from '../src/core/math.ts';
import { meshForSolid, meshForSolidGroup } from '../src/core/mesh.ts';
import type { Solid, Vec2 } from '../src/core/schema.ts';
import { FAMILIES, PUMP_REAR_SLOPE, RECEIVER_SECTION } from '../src/gun/parts.ts';
import { assertConvexSection, buildReceiverSection } from '../src/gun/receiverSection.ts';
import { expectWatertightMesh } from './helpers.ts';

const CONVEX_ERROR = /convex polygon/;
const COUNTER_CLOCKWISE_ERROR = /counter-clockwise convex polygon/;
const DEGENERATE_ERROR = /non-degenerate/;
const WALL_THICKNESS_ERROR = /at least 0.75u wall thickness/;
const SELF_INTERSECT_ERROR = /self-intersect/;

const square: readonly Vec2[] = [
  [-3, -2],
  [3, -2],
  [3, 2],
  [-3, 2],
];
const section = (outline = square) =>
  buildReceiverSection({
    id: 'test-receiver',
    outline,
    x: [-8, 0],
    wall: 0.5,
    cavity: { y: [-2, 2], z: [-1.5, 1.5] },
    port: { x: [-3, -2], sectionAxis: 0, section: [0, 1] },
  });

const probeIsCovered = (solids: readonly Solid[], center: readonly [number, number, number]): boolean => {
  const probe: Solid = { id: 'port-probe', kind: 'box', box: { center, half: [0.01, 0.01, 0.01] } };
  const probeWorld = worldSolid(IDENTITY, probe);
  return solids.some((solid) => penetrationWorld(worldSolid(IDENTITY, solid), probeWorld) > 0);
};

const cavityWallThickness = (
  outline: readonly Vec2[],
  cavity: { readonly y: readonly [number, number]; readonly z: readonly [number, number] },
): number => {
  const corners: readonly Vec2[] = [
    [cavity.y[0], cavity.z[0]],
    [cavity.y[0], cavity.z[1]],
    [cavity.y[1], cavity.z[0]],
    [cavity.y[1], cavity.z[1]],
  ];
  return Math.min(
    ...corners.flatMap((point) =>
      outline.map((a, index) => {
        const b = outline[(index + 1) % outline.length]!;
        const edgeLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return ((b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0])) / edgeLength;
      }),
    ),
  );
};

const faceContainsPoint = (mesh: ReturnType<typeof meshForSolidGroup>, x: number, y: number, z: number): boolean => {
  const side = (a: readonly number[], b: readonly number[]) =>
    (b[0]! - a[0]!) * (z - a[1]!) - (b[1]! - a[1]!) * (y - a[0]!);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const triangle = [0, 1, 2].map((corner) => {
      const index = mesh.indices[i + corner]! * 3;
      return [mesh.positions[index]!, mesh.positions[index + 1]!, mesh.positions[index + 2]!] as const;
    });
    if (!triangle.every(([px]) => Math.abs(px - x) < 1e-6)) {
      continue;
    }
    const vertices = triangle.map(([, py, pz]) => [py, pz] as const);
    const signs = vertices.map((vertex, index) => side(vertex, vertices[(index + 1) % 3]!));
    if (signs.every((value) => value >= -1e-6) || signs.every((value) => value <= 1e-6)) {
      return true;
    }
  }
  return false;
};

describe('receiver section builder', () => {
  it('rejects concave, clockwise, and degenerate outlines with a useful error', () => {
    expect(() =>
      assertConvexSection([
        [-2, -2],
        [2, -2],
        [0, 0],
        [2, 2],
        [-2, 2],
      ]),
    ).toThrow(CONVEX_ERROR);
    expect(() => assertConvexSection([...square].reverse())).toThrow(COUNTER_CLOCKWISE_ERROR);
    const circle = Array.from(
      { length: 5 },
      (_, index) => [Math.cos((2 * Math.PI * index) / 5) * 10, Math.sin((2 * Math.PI * index) / 5) * 10] as Vec2,
    );
    expect(() =>
      assertConvexSection(
        [0, 2, 4, 1, 3].map((index) => circle[index]!),
        'star',
      ),
    ).toThrow(SELF_INTERSECT_ERROR);
    expect(() =>
      assertConvexSection([
        [-1, 0],
        [0, 0],
        [1, 0],
      ]),
    ).toThrow(DEGENERATE_ERROR);
  });

  it('keeps at least 0.5u AK receiver wall around the enlarged carrier cavity', () => {
    const wall = cavityWallThickness(RECEIVER_SECTION.ak.outline, RECEIVER_SECTION.ak.cavity);
    expect(wall).toBeCloseTo(0.545_705_156_3, 8);
    expect(wall).toBeGreaterThanOrEqual(0.5);
  });

  it('gives the AR a distinct flat-top upper profile with stepped shoulders', () => {
    const { outline } = RECEIVER_SECTION.ar;
    expect(() => assertConvexSection(outline, 'AR')).not.toThrow();
    expect(outline).toContainEqual([2.5, -1.75]);
    expect(outline).toContainEqual([2.5, 1.75]);
    expect(outline).toContainEqual([1.5, -2]);
    expect(outline).toContainEqual([1.5, 2]);
    expect(RECEIVER_SECTION.ar.outline).not.toEqual(RECEIVER_SECTION.ak.outline);
    expect(RECEIVER_SECTION.ar.outline).not.toEqual(RECEIVER_SECTION.pump.outline);
  });

  it('splits the outline minus cavity into convex pieces and opens only the named port side', () => {
    const solids = section();
    const ids = solids.map(({ id }) => id);
    expect(ids.some((id) => id.startsWith('test-receiver-rear-adapter'))).toBe(true);
    expect(ids.some((id) => id.startsWith('test-receiver-front-adapter'))).toBe(true);
    expect(ids.some((id) => id.startsWith('test-receiver-near-side-span-'))).toBe(true);
    expect(solids.every((solid) => solid.kind === 'extruded-polygon' && solid.axis === 'x')).toBe(true);
    expect(solids.find(({ id }) => id === 'test-receiver-far-side')?.kind).toBe('extruded-polygon');
  });

  it('merges neighboring collision pieces without their shared faces', () => {
    const solids = buildReceiverSection({
      id: 'closed-section',
      outline: square,
      x: [-8, 0],
      wall: 0.5,
      cavity: { y: [-2, 2], z: [-1.5, 1.5] },
    });
    expect(solids.length).toBeGreaterThanOrEqual(10);
    expectWatertightMesh(meshForSolidGroup(solids), 'closed section');
  });

  it('pins the pump top-rear taper to a 4u run over 1.5u rise', () => {
    const bottomY = 1;
    const topY = 2.5;
    const { normal, offset } = PUMP_REAR_SLOPE.clip;
    const rearXAt = (y: number) => (offset - normal[1] * y) / normal[0];
    const run = Math.abs(rearXAt(topY) - rearXAt(bottomY));
    const rise = topY - bottomY;
    expect(run).toBe(PUMP_REAR_SLOPE.run);
    expect(rise).toBe(PUMP_REAR_SLOPE.rise);
    expect(PUMP_REAR_SLOPE.angleDegrees).toBeCloseTo((Math.atan(rise / run) * 180) / Math.PI, 12);
    expect(rearXAt(bottomY)).toBe(-16);
    expect(rearXAt(topY)).toBe(-12);
  });

  it('closes and adapts the AR, AK, and pump receiver sections at both mating ends', () => {
    const receivers = [
      {
        id: 'receiver-ar',
        outlineSection: RECEIVER_SECTION.ar,
        def: FAMILIES.receiver!.build({ action: 'auto', feed: 'box', bore: 'M', section: 'ar', rail: 'full' }),
      },
      {
        id: 'receiver-ak',
        outlineSection: RECEIVER_SECTION.ak,
        def: FAMILIES['ak-receiver']!.build({ action: 'bolt', feed: 'box', bore: 'M' }),
      },
      {
        id: 'receiver-pump',
        outlineSection: RECEIVER_SECTION.pump,
        def: FAMILIES.receiver!.build({ action: 'pump', feed: 'tube', bore: 'L', section: 'pump', rail: 'none' }),
      },
    ];
    for (const { id, outlineSection, def } of receivers) {
      const sectionSolids = def.solids.filter((solid) => solid.display?.mergeGroup === id);
      const ids = sectionSolids.map(({ id: solidId }) => solidId);
      const receiverMesh = meshForSolidGroup(sectionSolids);
      const receiverDrop = -(def.ports.find(({ id: portId }) => portId === 'stock')?.pos[1] ?? 0);
      const cavityCenterY = (outlineSection.cavity.y[0] + outlineSection.cavity.y[1]) / 2 - receiverDrop;
      const cavityCenterZ = (outlineSection.cavity.z[0] + outlineSection.cavity.z[1]) / 2;
      if (id === 'receiver-pump') {
        expect(faceContainsPoint(receiverMesh, -16, -1, 0), `${id} rear stock interface`).toBe(true);
      } else {
        expect(faceContainsPoint(receiverMesh, -16, cavityCenterY, cavityCenterZ), `${id} rear face`).toBe(true);
      }
      expect(faceContainsPoint(receiverMesh, 0, cavityCenterY, cavityCenterZ), `${id} front face`).toBe(true);
      expectWatertightMesh(receiverMesh, id);
      const triangleBudget = id === 'receiver-ar' ? 300 : 450;
      expect(receiverMesh.triangleCount, `${id} triangle budget`).toBeLessThanOrEqual(triangleBudget);
      expect(ids.some((solidId) => solidId.startsWith(`${id}-rear-adapter`))).toBe(true);
      expect(ids.some((solidId) => solidId.startsWith(`${id}-front-adapter`))).toBe(true);
      const rearAdapter = sectionSolids.find(({ id: solidId }) => solidId.startsWith(`${id}-rear-adapter`));
      const frontAdapter = sectionSolids.find(({ id: solidId }) => solidId.startsWith(`${id}-front-adapter`));
      expect(rearAdapter?.kind).toBe('extruded-polygon');
      expect(frontAdapter?.kind).toBe('extruded-polygon');
      if (rearAdapter?.kind === 'extruded-polygon' && frontAdapter?.kind === 'extruded-polygon') {
        expect(rearAdapter.z).toEqual([-16, -15.5]);
        expect(frontAdapter.z).toEqual([-0.5, 0]);
      }
      expect(def.ports.find(({ id: portId }) => portId === 'stock')?.pos[0]).toBe(-16);
      expect(def.ports.find(({ id: portId }) => portId === 'handguard')?.pos[0]).toBe(0);
    }
  });

  it('cuts near and far port windows through every intersected side and corner band', () => {
    const port = { x: [-3, -2] as const, sectionAxis: 0 as const, section: [-1, 1] as const };
    const solids = buildReceiverSection({
      id: 'two-sided-port',
      outline: [
        [-3, -2],
        [3, -2],
        [3, 2],
        [-3, 2],
      ],
      x: [-8, 0],
      wall: 0.5,
      cavity: { y: [-2, 2], z: [-1.5, 1.5] },
      port,
      farPort: port,
    });
    expect(probeIsCovered(solids, [-2.5, 0, 1.75])).toBe(false);
    expect(probeIsCovered(solids, [-2.5, 0, -1.75])).toBe(false);
    expectWatertightMesh(meshForSolidGroup(solids), 'two-sided port');
  });

  it('leaves each declared family ejection opening empty in collision solids', () => {
    const samples = [
      {
        label: 'AR',
        def: FAMILIES.receiver!.build({ action: 'auto', feed: 'box', bore: 'M', section: 'ar', rail: 'full' }),
        point: [-7, 1.1, 1.8] as const,
      },
      {
        label: 'AK',
        def: FAMILIES['ak-receiver']!.build({ action: 'bolt', feed: 'box', bore: 'M' }),
        point: [-5.75, 1.4, 1.75] as const,
      },
      {
        label: 'SMG',
        def: FAMILIES.receiver!.build({ action: 'auto', feed: 'box', bore: 'S', section: 'standard', rail: 'none' }),
        point: [-7, 1.9, 1.8] as const,
      },
    ];
    for (const { label, def, point } of samples) {
      expect(probeIsCovered(def.solids, point), `${label} aperture`).toBe(false);
      const group = def.solids.filter((solid) => solid.display?.mergeGroup?.startsWith('receiver-'));
      if (group.length > 0) {
        expectWatertightMesh(meshForSolidGroup(group), `${label} exported receiver mesh`);
      } else {
        for (const solid of def.solids) {
          expectWatertightMesh(meshForSolid(solid), `${label} ${solid.id} mesh`);
        }
      }
    }
  });

  it('requires the declared wall thickness around the entire cavity', () => {
    expect(() =>
      buildReceiverSection({
        id: 'thin-wall',
        outline: square,
        x: [-8, 0],
        wall: 0.75,
        cavity: { y: [-2, 2], z: [-1.5, 1.5] },
      }),
    ).toThrow(WALL_THICKNESS_ERROR);
  });
});
