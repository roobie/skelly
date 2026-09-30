import { describe, expect, it } from 'vitest';
import { meshForSolidGroup } from '../src/core/mesh.ts';
import type { Vec2 } from '../src/core/schema.ts';
import { FAMILIES, PUMP_REAR_SLOPE, RECEIVER_SECTION } from '../src/gun/parts.ts';
import { assertConvexSection, buildReceiverSection } from '../src/gun/receiverSection.ts';

const CONVEX_ERROR = /convex polygon/;
const COUNTER_CLOCKWISE_ERROR = /counter-clockwise convex polygon/;
const DEGENERATE_ERROR = /non-degenerate/;
const WALL_THICKNESS_ERROR = /at least 0.75u wall thickness/;

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

const vertexKey = (mesh: ReturnType<typeof meshForSolidGroup>, index: number): string => {
  const point = [mesh.positions[index * 3]!, mesh.positions[index * 3 + 1]!, mesh.positions[index * 3 + 2]!];
  return point.map((value) => value.toFixed(6)).join(',');
};

const topology = (mesh: ReturnType<typeof meshForSolidGroup>) => {
  const edges = new Map<string, number>();
  const faces = new Map<string, number>();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const vertices = [mesh.indices[i]!, mesh.indices[i + 1]!, mesh.indices[i + 2]!].map((index) =>
      vertexKey(mesh, index),
    );
    const face = [...vertices].sort().join('|');
    faces.set(face, (faces.get(face) ?? 0) + 1);
    for (let edge = 0; edge < 3; edge++) {
      const ends = [vertices[edge]!, vertices[(edge + 1) % 3]!].sort();
      const key = ends.join('|');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  return {
    openEdges: [...edges.entries()].filter(([, count]) => count !== 2),
    duplicateFaces: [...faces.values()].filter((count) => count > 1).length,
  };
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
    expect(wall).toBeCloseTo(0.666_972_968_8, 8);
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
    expect(ids).toContain('test-receiver-near-side-window-low');
    expect(ids).toContain('test-receiver-near-side-window-high');
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
    expect(solids.length).toBeGreaterThan(10);
    const mesh = meshForSolidGroup(solids);
    const counts = topology(mesh);
    expect(counts.openEdges).toHaveLength(0);
    expect(counts.duplicateFaces).toBe(0);
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
    const familyTopology = receivers.map(({ id, def }) => {
      const receiverMesh = meshForSolidGroup(def.solids.filter((solid) => solid.display?.mergeGroup === id));
      const counts = topology(receiverMesh);
      return {
        id,
        openEdges: counts.openEdges.length,
        duplicateFaces: counts.duplicateFaces,
      };
    });
    expect(familyTopology).toEqual([
      { id: 'receiver-ar', openEdges: 0, duplicateFaces: 0 },
      { id: 'receiver-ak', openEdges: 0, duplicateFaces: 0 },
      { id: 'receiver-pump', openEdges: 0, duplicateFaces: 0 },
    ]);
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
