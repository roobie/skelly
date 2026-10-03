import { describe, expect, it } from 'vitest';
import { localSolidBounds, penetrationWorld, validateExtrudedPolygon, worldSolid } from '../src/core/geometry.ts';
import { applyPoint, compose, IDENTITY, translation, type Vec3 } from '../src/core/math.ts';
import type { TriangleMesh } from '../src/core/mesh.ts';
import { meshForSolid, meshForSolidGroup } from '../src/core/mesh.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Solid, Vec2 } from '../src/core/schema.ts';
import { gunDomain } from '../src/gun/domain.ts';
import {
  BOLT_CARRIER_RUNNING_CLEARANCE_U,
  carrierCavityBounds,
  FAMILIES,
  PUMP_REAR_SLOPE,
  RECEIVER_SECTION,
} from '../src/gun/parts.ts';
import { PUMP_ACTION_TRAVEL_U } from '../src/gun/pumpShell.ts';
import { assertConvexSection, buildReceiverSection } from '../src/gun/receiverSection.ts';
import { expectWatertightMesh, loadFixture } from './helpers.ts';

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

const meshHasSurfaceAt = (mesh: TriangleMesh, point: readonly [number, number, number]): boolean => {
  const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, value, axis) => sum + value * b[axis]!, 0);
  const sub = (a: readonly number[], b: readonly number[]) => a.map((value, axis) => value - b[axis]!);
  const cross = (a: readonly number[], b: readonly number[]) => [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const triangle = [0, 1, 2].map((corner) => {
      const index = mesh.indices[offset + corner]! * 3;
      return [mesh.positions[index]!, mesh.positions[index + 1]!, mesh.positions[index + 2]!];
    });
    const [a, b, c] = triangle as [number[], number[], number[]];
    const ab = sub(b, a);
    const ac = sub(c, a);
    const ap = sub(point, a);
    const normal = cross(ab, ac);
    const normalLength = Math.sqrt(dot(normal, normal));
    if (normalLength === 0 || Math.abs(dot(ap, normal)) / normalLength > 1e-4) {
      continue;
    }
    const d00 = dot(ab, ab);
    const d01 = dot(ab, ac);
    const d11 = dot(ac, ac);
    const d20 = dot(ap, ab);
    const d21 = dot(ap, ac);
    const denominator = d00 * d11 - d01 * d01;
    const v = (d11 * d20 - d01 * d21) / denominator;
    const w = (d00 * d21 - d01 * d20) / denominator;
    const u = 1 - v - w;
    if (u >= -1e-4 && v >= -1e-4 && w >= -1e-4) {
      return true;
    }
  }
  return false;
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

  it('matches the core profile validator for concave, clockwise, collinear, self-intersecting, and valid profiles', () => {
    const tinySquare: readonly Vec2[] = [
      [-1e-5, -1e-5],
      [1e-5, -1e-5],
      [1e-5, 1e-5],
      [-1e-5, 1e-5],
    ];
    const profiles: readonly [string, readonly Vec2[]][] = [
      [
        'concave',
        [
          [-2, -2],
          [2, -2],
          [0, 0],
          [2, 2],
          [-2, 2],
        ],
      ],
      ['clockwise', [...square].reverse()],
      [
        'collinear',
        [
          [-2, -2],
          [0, -2],
          [2, -2],
          [2, 2],
          [-2, 2],
        ],
      ],
      [
        'self-intersecting',
        [
          [0, 0],
          [2, 2],
          [0, 2],
          [2, 0],
        ],
      ],
      ['valid', square],
      ['small valid square', tinySquare],
    ];

    for (const [name, outline] of profiles) {
      const acceptedByCore = validateExtrudedPolygon(outline, [0, 1], 'x') === undefined;
      let acceptedByReceiver = true;
      try {
        assertConvexSection(outline, name);
      } catch {
        acceptedByReceiver = false;
      }
      expect(acceptedByReceiver, name).toBe(acceptedByCore);
    }
  });

  it('derives section cavities from carrier envelopes and preserves approved bounds', () => {
    const cavities = {
      ar: carrierCavityBounds('ar', 0),
      ak: carrierCavityBounds('ak', 0),
      pump: carrierCavityBounds('pump', 1),
    };
    expect(cavities.ar).toEqual({ y: [-0.6, 1.1], z: [-1.35, 1.35] });
    expect(cavities.ak).toEqual({ y: [-1.35, 1.35], z: [-1.35, 1.35] });
    expect(cavities.pump).toEqual({ y: [0.15, 1.85], z: [-0.85, 0.85] });
    expect(carrierCavityBounds('pump', 0).y).toEqual([-0.85, 0.85]);
    const wall = cavityWallThickness(RECEIVER_SECTION.ak.outline, cavities.ak);
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

  it('rounds the pump rear transition while preserving its total 4u run and 1.5u rise', () => {
    const bottomY = 1;
    const topY = 2.5;
    const rearXAt = (y: number) =>
      Math.max(...PUMP_REAR_SLOPE.clip.map(({ normal, offset }) => (offset - normal[1] * y) / normal[0]));
    const run = Math.abs(rearXAt(topY) - rearXAt(bottomY));
    const rise = topY - bottomY;
    expect(run).toBeCloseTo(PUMP_REAR_SLOPE.run, 12);
    expect(rise).toBe(PUMP_REAR_SLOPE.rise);
    expect(PUMP_REAR_SLOPE.angleDegrees).toBeCloseTo((Math.atan(rise / run) * 180) / Math.PI, 12);
    expect(rearXAt(bottomY)).toBe(-16);
    expect(rearXAt(topY)).toBe(-12);
  });

  it('opens the AR carrier bore while preserving AK/pump adapters and watertight shells', () => {
    const receivers = [
      {
        id: 'receiver-ar',
        cavity: carrierCavityBounds('ar', 0),
        def: FAMILIES.receiver!.build({ action: 'auto', feed: 'box', bore: 'M', section: 'ar', rail: 'full' }),
      },
      {
        id: 'receiver-ak',
        cavity: carrierCavityBounds('ak', 0),
        def: FAMILIES['ak-receiver']!.build({ action: 'bolt', feed: 'box', bore: 'M' }),
      },
    ];
    for (const { id, cavity, def } of receivers) {
      const sectionSolids = def.solids.filter((solid) => solid.display?.mergeGroup === id);
      const ids = sectionSolids.map(({ id: solidId }) => solidId);
      const receiverMesh = meshForSolidGroup(sectionSolids);
      const cavityCenterY = (cavity.y[0] + cavity.y[1]) / 2;
      const cavityCenterZ = (cavity.z[0] + cavity.z[1]) / 2;
      const frontFaceX = 0;
      if (id === 'receiver-ar') {
        expect(faceContainsPoint(receiverMesh, -16, cavityCenterY, cavityCenterZ), `${id} buffer-tube bore`).toBe(
          false,
        );
        expect(faceContainsPoint(receiverMesh, 0, cavityCenterY, cavityCenterZ), `${id} breech bore`).toBe(false);
        expect(ids.some((solidId) => solidId.startsWith(`${id}-rear-adapter`))).toBe(false);
        expect(ids.some((solidId) => solidId.startsWith(`${id}-front-adapter`))).toBe(false);
      } else {
        expect(faceContainsPoint(receiverMesh, -16, cavityCenterY, cavityCenterZ), `${id} rear face`).toBe(true);
        expect(faceContainsPoint(receiverMesh, 0, cavityCenterY, cavityCenterZ), `${id} front face`).toBe(true);
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
      }
      expectWatertightMesh(receiverMesh, id);
      // AR now includes an internal barrel seat; retain the same absolute
      // 450-triangle ceiling as the other detailed receiver shells.
      const triangleBudget = 450;
      expect(receiverMesh.triangleCount, `${id} triangle budget`).toBeLessThanOrEqual(triangleBudget);
      expect(def.ports.find(({ id: portId }) => portId === 'stock')?.pos[0]).toBe(-16);
      expect(def.ports.find(({ id: portId }) => portId === 'handguard')?.pos[0]).toBe(frontFaceX);
    }
  });

  it('contains the pump action in the full-height shell at rest and full stroke with one continuous unpatched slope', () => {
    const resolved = resolve(loadFixture('archetype-pump-shotgun'), gunDomain);
    const def = resolved.defs.get('receiver')!;
    const carrier = resolved.defs.get('bolt-carrier')!;
    const solids = def.solids.filter((solid) => solid.display?.mergeGroup === 'receiver-pump');
    const mesh = meshForSolidGroup(solids);
    const stock = def.ports.find(({ id }) => id === 'stock')!;
    const { faces, outline } = RECEIVER_SECTION.pump;
    const drop = faces.bottom - def.ports.find(({ id }) => id === 'lower')!.pos[1];
    const slopeXAt = (y: number) =>
      Math.max(...PUMP_REAR_SLOPE.clip.map(({ normal, offset }) => (offset - drop - y) / normal[0]));
    const slopeStartX = slopeXAt(faces.top.y - drop);
    const points = (solid: Solid): Vec3[] => {
      const { positions } = meshForSolid(solid, 0);
      return Array.from({ length: positions.length / 3 }, (_, index) => [
        positions[index * 3]!,
        positions[index * 3 + 1]!,
        positions[index * 3 + 2]!,
      ]);
    };
    const expectInsideShell = ([x, y, z]: Vec3, label: string) => {
      expect(x, `${label}: rear`).toBeGreaterThanOrEqual(faces.rear - 1e-6);
      for (const { normal, offset } of PUMP_REAR_SLOPE.clip) {
        expect(normal[0] * x + y, `${label}: roof facet`).toBeLessThanOrEqual(offset - drop + 1e-6);
      }
      for (let index = 0; index < outline.length; index++) {
        const a = outline[index]!;
        const b = outline[(index + 1) % outline.length]!;
        const inside = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (y + drop - a[0]);
        expect(inside, `${label}: section edge ${index}`).toBeGreaterThanOrEqual(-1e-6);
      }
    };
    const expectActionFits = (travel: number) => {
      const transform = compose(resolved.placed.get('bolt-carrier')!, translation([travel, 0, 0]));
      for (const solid of carrier.solids) {
        const moved = worldSolid(transform, solid);
        for (const obstacle of def.solids) {
          expect(
            penetrationWorld(moved, worldSolid(IDENTITY, obstacle)),
            `${solid.id} vs ${obstacle.id} at ${travel}u`,
          ).toBeLessThanOrEqual(1e-6);
        }
        // The action bar continues forward into the approved forend, outside the receiver.
        const internalPoints = points(solid)
          .map((local) => applyPoint(transform, local))
          .filter(([x]) => x <= faces.front);
        for (const point of internalPoints) {
          expectInsideShell(point, `${solid.id} at ${travel}u`);
          expect(point[0], `${solid.id}: full-height section at ${travel}u`).toBeGreaterThanOrEqual(
            slopeStartX + BOLT_CARRIER_RUNNING_CLEARANCE_U,
          );
        }
      }
    };
    for (const travel of [0, PUMP_ACTION_TRAVEL_U]) {
      expectActionFits(travel);
    }
    for (const solid of def.solids.filter(({ id }) => id !== 'tube-seat')) {
      for (const point of points(solid)) {
        expectInsideShell(point, solid.id);
      }
    }
    expect(
      solids
        .filter((solid) => localSolidBounds(solid)[0][0] < slopeStartX)
        .every((solid) => solid.kind === 'extruded-polygon' && solid.axis === 'x'),
      'rear transition has no added wedge',
    ).toBe(true);
    // Cover the entire slope, including its centre where the old cavity broke the surface.
    for (const y of [0.1, 0.5, 0.9, 1.4]) {
      for (const z of [-0.8, 0, 0.8]) {
        expect(meshHasSurfaceAt(mesh, [slopeXAt(y), y, z]), `slope at y=${y}, z=${z}`).toBe(true);
      }
    }
    expect(faceContainsPoint(mesh, faces.rear, -1, 0), 'stock remains on rear face').toBe(true);
    expect(stock.pos).toEqual([-16, -1, 0]);
    expect(def.ports.find(({ id }) => id === 'lower')?.pos).toEqual([0, -3.5, 0]);
    expect(def.ports.find(({ id }) => id === 'handguard')?.pos[0]).toBe(3.5);
    expect(def.ports.find(({ id }) => id === 'tube')?.pos[0]).toBe(3.5);
    expectWatertightMesh(mesh, 'receiver-pump');
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
        point: [-4.25, 0.25, 1.8] as const,
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
