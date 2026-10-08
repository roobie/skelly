import type { Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { localSolidBounds, penetrationWorld, worldSolid } from '../src/core/geometry.ts';
import { applyPoint, IDENTITY } from '../src/core/math.ts';
import { meshForSolidGroup } from '../src/core/mesh.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly, ExtrudedPolygonSolid, Solid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { RECEIVER_SECTION } from '../src/gun/parts.ts';
import { buildLayers, disposeGroup } from '../src/viewer/scene.ts';
import { expectWatertightMesh, loadFixture } from './helpers.ts';

const materialAt = (solids: readonly Solid[], position: readonly [number, number, number]) => {
  const probe = worldSolid(IDENTITY, { id: 'probe', kind: 'box', box: { center: position, half: [0.01, 0.01, 0.01] } });
  return solids.some((solid) => penetrationWorld(worldSolid(IDENTITY, solid), probe) > 0);
};
const assemblyFor = (style = 'tapered', length = 'M'): Assembly => {
  const assembly = loadFixture('archetype-pump-shotgun');
  return { ...assembly, parts: { ...assembly.parts, stock: { family: 'stock', params: { style, length } } } };
};

const sectionYs = (solids: readonly ExtrudedPolygonSolid[], x: number) =>
  solids.flatMap((s) =>
    s.profile.flatMap((a, i) => {
      const b = s.profile[(i + 1) % s.profile.length]!;
      if (x < Math.min(a[0], b[0]) - 1e-8 || x > Math.max(a[0], b[0]) + 1e-8) {
        return [];
      }
      if (Math.abs(a[0] - b[0]) < 1e-8) {
        return [a[1], b[1]];
      }
      return [a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1])];
    }),
  );

describe('870-derived pump silhouette', () => {
  it('has a narrow upper and a faceted rear roof instead of a single sharp ramp', () => {
    const resolved = resolve(assemblyFor(), gunDomain);
    const shell = resolved.defs.get('receiver')!.solids.filter((s) => s.display?.mergeGroup === 'receiver-pump');
    const mesh = meshForSolidGroup(shell);
    const zs = mesh.positions.filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThanOrEqual(3.25);
    expect(RECEIVER_SECTION.pump.clip.length).toBeGreaterThanOrEqual(3);
    expectWatertightMesh(mesh, 'slim rounded-roof upper');
  });

  it('rounds the port corners while retaining a real open centre', () => {
    const receiver = resolve(assemblyFor(), gunDomain).defs.get('receiver')!;
    const port = receiver.keepOuts.find((v) => v.id === 'ejection')!.box;
    const [x, y, z] = port.center;
    const [hx, hy, hz] = port.half;
    expect(materialAt(receiver.solids, [x - hx + 0.125, y + hy - 0.125, z - hz - 0.125]), 'upper rear corner').toBe(
      true,
    );
    expect(materialAt(receiver.solids, [x, y, z - hz - 0.125]), 'port centre').toBe(false);
  });

  it('uses a thin trigger plate, a compact rounded loop and a trigger inside it', () => {
    const resolved = resolve(assemblyFor(), gunDomain);
    const lower = resolved.defs.get('lower')!;
    const frame = lower.solids.find((s) => s.id === 'frame')!;
    const [min, max] = localSolidBounds(frame);
    expect(max[1] - min[1], 'plate thickness').toBeLessThanOrEqual(0.5);
    const finger = lower.keepOuts.find((v) => v.id === 'trigger-finger')!.box;
    const fingerSolid: Solid = { id: 'trigger-finger-probe', kind: 'box', box: finger };
    const guards = lower.solids.filter((s) => s.id.startsWith('trigger-guard-'));
    const guardBounds = guards.map(localSolidBounds);
    for (const axis of [0, 1, 2] as const) {
      expect(Math.min(...guardBounds.map(([min]) => min[axis]))).toBeLessThanOrEqual(
        finger.center[axis] - finger.half[axis],
      );
      expect(Math.max(...guardBounds.map(([, max]) => max[axis]))).toBeGreaterThanOrEqual(
        finger.center[axis] + finger.half[axis],
      );
    }
    expect(
      guards.every((guard) => penetrationWorld(worldSolid(IDENTITY, guard), worldSolid(IDENTITY, fingerSolid)) <= 0),
      'finger keep-out clears guard material',
    ).toBe(true);
    expect(guards.every((s) => s.kind === 'extruded-polygon')).toBe(true);
    expectWatertightMesh(meshForSolidGroup(guards), 'rounded trigger loop');
    expect(lower.solids.some((s) => s.id === 'trigger')).toBe(true);
    expect(validate(assemblyFor(), gunDomain).ok).toBe(true);
  });

  it('exposes separate grip, joint and comb roles without splitting the finished wood surface', () => {
    const report = validate(assemblyFor(), gunDomain);
    const stock = report.resolved.defs.get('stock')!;
    for (const id of ['stock-wrist', 'grip', 'stock-joint', 'stock-comb']) {
      expect(
        stock.solids.some((s) => s.id === id),
        id,
      ).toBe(true);
    }
    const finish = buildLayers(report, [], 'finish', { variant: 'pump-shotgun' });
    const roles = buildLayers(report, [], 'role', { variant: 'pump-shotgun' });
    try {
      const finishMeshes = finish.solids.children.filter((o) => o.userData.part === 'stock');
      const roleMeshes = roles.solids.children.filter((o) => o.userData.part === 'stock');
      expect(finishMeshes.length).toBeLessThan(roleMeshes.length);
      const colors = ['grip', 'stock-joint', 'stock-comb'].map((id) => {
        const mesh = roleMeshes.find((o) => o.userData.label.includes(`solid ${id}`)) as Mesh | undefined;
        expect(mesh, id).toBeDefined();
        return (mesh!.material as MeshStandardMaterial).color.getHexString();
      });
      expect(new Set(colors).size).toBe(3);
    } finally {
      for (const layers of [finish, roles]) {
        for (const group of Object.values(layers)) {
          disposeGroup(group);
        }
      }
    }
  });

  it('keeps hand geometry absolute and the butt height proportional to the approved receiver', () => {
    let previousGrip: ExtrudedPolygonSolid[] | undefined;
    let previousHeight = 0;
    for (const length of ['S', 'M', 'L']) {
      const stock = resolve(assemblyFor('tapered', length), gunDomain).defs.get('stock')!;
      const profiles = stock.solids.filter((s): s is ExtrudedPolygonSolid => s.kind === 'extruded-polygon');
      const grip = profiles.filter((s) => s.id === 'grip' || s.id.startsWith('grip-'));
      if (previousGrip) {
        expect(grip).toEqual(previousGrip);
      }
      previousGrip = grip;
      const lowest = grip.flatMap((s) => s.profile).reduce((a, b) => (b[1] < a[1] ? b : a));
      const gripDepth = Math.max(...sectionYs(grip, lowest[0])) - lowest[1];
      expect(gripDepth).toBeGreaterThanOrEqual(6);
      const [min, max] = localSolidBounds(profiles.find((s) => s.id === 'butt-pad')!);
      const buttHeight = max[1] - min[1];
      expect(gripDepth).toBeLessThan(buttHeight);
      expect(buttHeight).toBeGreaterThan(previousHeight);
      expect(buttHeight).toBeLessThanOrEqual(({ S: 10.5, M: 11, L: 11.5 } as Record<string, number>)[length]!);
      previousHeight = buttHeight;
      const joint = profiles.filter((s) => s.id.startsWith('stock-joint'));
      const rearX = Math.min(...joint.flatMap((s) => s.profile.map((p) => p[0])));
      expect(Math.min(...sectionYs(joint, rearX)) - lowest[1], 'rise behind the rounded knob').toBeGreaterThanOrEqual(
        0.5,
      );
      expect(
        new Set(grip.flatMap((s) => s.profile.map((p) => p[0]))).size,
        'sampled curve, not two chamfers',
      ).toBeGreaterThanOrEqual(13);
    }
  });

  it('keeps the sampled throat on a circular arc rather than resampled straight chamfers', () => {
    const stock = resolve(assemblyFor(), gunDomain).defs.get('stock')!;
    const lower = new Map<number, number>();
    const vertices = stock.solids.flatMap((solid) => (solid.kind === 'extruded-polygon' ? solid.profile : []));
    for (const [x, y] of vertices) {
      if (x >= -6 && x <= -0.75) {
        lower.set(x, Math.min(lower.get(x) ?? Number.POSITIVE_INFINITY, y));
      }
    }
    const points = [...lower].sort((a, b) => b[0] - a[0]);
    expect(points.length).toBeGreaterThanOrEqual(20);
    const first = points[0]!;
    const last = points.at(-1)!;
    const dx = first[0] - last[0];
    const dy = first[1] - last[1];
    const radius = (dx * dx + dy * dy) / (2 * dy);
    expect(radius).toBeGreaterThan(5);
    expect(radius).toBeLessThan(6);
    const centreY = first[1] - radius;
    for (const [x, y] of points) {
      expect(Math.hypot(x - first[0], y - centreY)).toBeCloseTo(radius, 8);
    }
  });

  it('makes the wrist the narrowest load-bearing section in height and width', () => {
    const stock = resolve(assemblyFor(), gunDomain).defs.get('stock')!;
    const profiles = stock.solids.filter((s): s is ExtrudedPolygonSolid => s.kind === 'extruded-polygon');
    const wrist = profiles.filter((s) => s.id.startsWith('stock-wrist'));
    expect(wrist.length).toBeGreaterThan(0);
    const neckDepth = Math.max(...sectionYs(wrist, -2)) - Math.min(...sectionYs(wrist, -2));
    const width = (solids: readonly Solid[]) => {
      const zs = meshForSolidGroup(solids).positions.filter((_, i) => i % 3 === 2);
      return Math.max(...zs) - Math.min(...zs);
    };
    for (const [prefix, x] of [
      ['fore-stock', -0.25],
      ['grip', -5],
      ['stock-joint', -10],
      ['stock-comb', -20],
    ] as const) {
      const role = profiles.filter((s) => s.id === prefix || s.id.startsWith(`${prefix}-`));
      const depth = Math.max(...sectionYs(role, x)) - Math.min(...sectionYs(role, x));
      expect(neckDepth, `${prefix} height`).toBeLessThan(depth);
      expect(width(wrist), `${prefix} width`).toBeLessThan(width(role));
    }
    const topAt = (x: number) => Math.max(...sectionYs(profiles, x));
    expect(topAt(-11) - topAt(-7.5), 'top saddle').toBeGreaterThanOrEqual(0.4);
  });

  it('scales the reference-length forend to the photo rather than a thin half-receiver sleeve', () => {
    const original = assemblyFor();
    const assembly = {
      ...original,
      parts: {
        ...original.parts,
        barrel: { ...original.parts.barrel!, params: { ...original.parts.barrel!.params, length: 'L' } },
      },
    };
    const forend = resolve(assembly, gunDomain).defs.get('forend')!;
    const bounds = forend.solids.map(localSolidBounds);
    const span = (axis: number) =>
      Math.max(...bounds.map((b) => b[1][axis]!)) - Math.min(...bounds.map((b) => b[0][axis]!));
    expect(span(0), 'forend length').toBeGreaterThanOrEqual(18);
    expect(span(0)).toBeLessThanOrEqual(20);
    expect(span(1), 'forend height').toBeGreaterThanOrEqual(4);
    expect(span(2), 'forend width').toBeGreaterThanOrEqual(4);
    expectWatertightMesh(meshForSolidGroup(forend.solids), 'larger grooved sleeve');
  });

  it('keeps the enlarged sleeve clear of every fixed barrel and tube solid throughout the continuous stroke', () => {
    for (const [barrelLength, lengthPercent, bore] of [
      ['S', '100', 'M'],
      ['M', '75', 'S'],
      ['L', '75', 'L'],
    ] as const) {
      const original = assemblyFor();
      const assembly = {
        ...original,
        parts: {
          ...original.parts,
          barrel: { ...original.parts.barrel!, params: { ...original.parts.barrel!.params, length: barrelLength } },
          tube: { ...original.parts.tube!, params: { ...original.parts.tube!.params, lengthPercent } },
          receiver: { ...original.parts.receiver!, params: { ...original.parts.receiver!.params, bore } },
        },
      };
      const resolved = resolve(assembly, gunDomain);
      const obstacles = ['barrel', 'tube'].flatMap((part) =>
        resolved.defs.get(part)!.solids.map((fixed) => ({
          id: `${part}.${fixed.id}`,
          shape: worldSolid(resolved.placed.get(part)!, fixed),
        })),
      );
      for (const cell of resolved.defs.get('forend')!.solids) {
        if (cell.kind !== 'extruded-polygon' || cell.axis !== 'x') {
          throw new Error('sleeve must use axial cells');
        }
        expect(cell.clip, 'axial swept-volume proof requires an unclipped prism').toBeUndefined();
        // Minkowski sum with the -X travel is exact for each axial convex extrusion, not a few sampled poses.
        const swept = worldSolid(resolved.placed.get('forend')!, { ...cell, z: [cell.z[0] - 5.5, cell.z[1]] });
        for (const fixed of obstacles) {
          expect(
            penetrationWorld(swept, fixed.shape),
            `${barrelLength}/${lengthPercent}/${bore}: ${cell.id} vs ${fixed.id}`,
          ).toBeLessThanOrEqual(1e-7);
        }
      }
    }
  });

  it.each([
    ['tapered', 'S'],
    ['tapered', 'M'],
    ['tapered', 'L'],
    ['tapered-sawed', 'M'],
  ])('%s %s keeps the wrist aligned and within 5–7u of the trigger', (style, length) => {
    const assembly = assemblyFor(style, length);
    const resolved = resolve(assembly, gunDomain);
    const stock = resolved.defs.get('stock')!;
    const transform = resolved.placed.get('stock')!;
    const params = { style, length };
    const hold = applyPoint(transform, GUN_ANCHORS.stock!.anchors(params, stock).hold!.position);
    const lower = resolved.defs.get('lower')!;
    const trigger = applyPoint(
      resolved.placed.get('lower')!,
      lower.keepOuts.find((v) => v.id === 'trigger-finger')!.box.center,
    );
    const reach = Math.hypot(...hold.map((v, i) => v - trigger[i]!));
    expect(reach).toBeGreaterThanOrEqual(5);
    expect(reach).toBeLessThanOrEqual(7);
    expectWatertightMesh(meshForSolidGroup(stock.solids.filter((s) => s.id !== 'butt-pad')), 'merged stock wood');
    if (style === 'tapered') {
      const butt = stock.solids.find((s) => s.id === 'butt-pad')!;
      const receiverLength = RECEIVER_SECTION.pump.faces.front - RECEIVER_SECTION.pump.faces.rear;
      const stockLength = -localSolidBounds(butt)[0][0];
      expect(stockLength / receiverLength).toBeGreaterThanOrEqual(1.5);
      expect(stockLength / receiverLength).toBeLessThanOrEqual(1.9);
      expect(butt.material).toBe('rubber-black');
    }
    expect(validate(assembly, gunDomain).ok).toBe(true);
  });
});
