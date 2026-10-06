import { describe, expect, it } from 'vitest';
import {
  boundsOfPoints,
  localSolidBounds,
  obbPolyhedron,
  penetrationWorld,
  type WorldSolid,
  worldBox,
  worldSolid,
} from '../src/core/geometry.ts';
import { applyPoint, IDENTITY, type Vec3 } from '../src/core/math.ts';
import type { Resolved } from '../src/core/resolve.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadCorpus } from './helpers.ts';

const akCorpus = loadCorpus().filter(({ assembly }) =>
  Object.values(assembly.parts).some(({ family }) => family === 'ak-receiver'),
);

const resolvedOf = (label: string, assembly: (typeof akCorpus)[number]['assembly']) => {
  const report = validate(assembly, gunDomain);
  // biome-ignore lint/suspicious/noMisplacedAssertion: helper is called only by tests
  expect(report.issues, label).toEqual([]);
  return report.resolved;
};

const partIdOf = (resolved: Resolved, family: string) =>
  Object.entries(resolved.assembly.parts).find(([, part]) => part.family === family)?.[0];

const worldVertices = (shape: WorldSolid): readonly Vec3[] =>
  'vertices' in shape ? shape.vertices : obbPolyhedron(shape).vertices;

const worldSolidsOf = (resolved: Resolved, partId: string) => {
  const placed = resolved.placed.get(partId)!;
  return resolved.defs.get(partId)!.solids.map((solid) => {
    const shape = worldSolid(placed, solid);
    return { id: `${partId}.${solid.id}`, shape, bounds: boundsOfPoints(worldVertices(shape)) };
  });
};

const sightOrigin = (resolved: Resolved, partId: string): Vec3 => {
  const axis = resolved.defs.get(partId)!.axes.find(({ kind }) => kind === 'sight')!;
  return applyPoint(resolved.placed.get(partId)!, axis.origin);
};

describe('AK archetype geometry', () => {
  it('runs the sight line from the rear notch to the front post with nothing above it', () => {
    expect(akCorpus.length).toBeGreaterThan(0);
    // Probe cubes ride just above the line: a part that touches the line from below is the post or notch
    // doing its job; one that rises into the probes blocks the shooter's view.
    const lift = 0.1;
    const half = 0.05;
    for (const { label, assembly } of akCorpus) {
      const resolved = resolvedOf(label, assembly);
      const rear = sightOrigin(resolved, partIdOf(resolved, 'ak-rear-sight')!);
      const front = sightOrigin(resolved, partIdOf(resolved, 'front-sight')!);
      expect(front[0], label).toBeGreaterThan(rear[0]);
      const solids = [...resolved.defs.keys()].flatMap((partId) => worldSolidsOf(resolved, partId));
      const steps = Math.ceil((front[0] - rear[0]) / half);
      const blockers = new Set<string>();
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const center: Vec3 = [
          rear[0] + (front[0] - rear[0]) * t,
          rear[1] + (front[1] - rear[1]) * t + lift,
          rear[2] + (front[2] - rear[2]) * t,
        ];
        const probe = worldBox(IDENTITY, { center, half: [half, half, half] });
        for (const { id, shape, bounds } of solids) {
          const near = [0, 1, 2].every(
            (axis) => bounds[0][axis]! <= center[axis]! + half && bounds[1][axis]! >= center[axis]! - half,
          );
          if (near && penetrationWorld(probe, shape) > 1e-9) {
            blockers.add(id);
          }
        }
      }
      expect([...blockers], label).toEqual([]);
    }
  });

  it('puts the gas piston on the gas cylinder’s axis', () => {
    let checked = 0;
    for (const { label, assembly } of akCorpus) {
      const resolved = resolvedOf(label, assembly);
      const carrierId = partIdOf(resolved, 'bolt-carrier');
      const piston = carrierId
        ? worldSolidsOf(resolved, carrierId).find(({ id }) => id.endsWith('.piston'))
        : undefined;
      if (!piston) {
        continue;
      }
      checked += 1;
      const cylinderId = partIdOf(resolved, 'gas-cylinder')!;
      const axis = resolved.defs.get(cylinderId)!.axes.find(({ kind }) => kind === 'gas-cylinder')!;
      const origin = applyPoint(resolved.placed.get(cylinderId)!, axis.origin);
      const [min, max] = piston.bounds;
      expect((min[1] + max[1]) / 2, `${label}: piston height`).toBeCloseTo(origin[1], 9);
      expect((min[2] + max[2]) / 2, `${label}: piston side`).toBeCloseTo(origin[2], 9);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('keeps the AK handguard’s lowest point no lower than the receiver’s bottom at its front face', () => {
    let checked = 0;
    for (const { label, assembly } of akCorpus) {
      const resolved = resolvedOf(label, assembly);
      const handguardId = partIdOf(resolved, 'handguard')!;
      if (resolved.assembly.parts[handguardId]!.params?.layout !== 'ak') {
        continue;
      }
      checked += 1;
      const receiverId = partIdOf(resolved, 'ak-receiver')!;
      const frontPort = resolved.defs.get(receiverId)!.ports.find(({ id }) => id === 'handguard')!;
      const [frontX] = applyPoint(resolved.placed.get(receiverId)!, frontPort.pos);
      const body = [receiverId, partIdOf(resolved, 'lower')!]
        .flatMap((partId) => worldSolidsOf(resolved, partId))
        .filter(({ bounds }) => bounds[0][0] < frontX - 1e-9 && bounds[1][0] >= frontX - 1e-9);
      const receiverBottom = Math.min(...body.map(({ bounds }) => bounds[0][1]));
      const handguardBottom = Math.min(...worldSolidsOf(resolved, handguardId).map(({ bounds }) => bounds[0][1]));
      expect(handguardBottom, label).toBeGreaterThanOrEqual(receiverBottom);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('gives every wall of the AK handguard the same thickness', () => {
    let checked = 0;
    for (const { label, assembly } of akCorpus) {
      const resolved = resolvedOf(label, assembly);
      const handguardId = partIdOf(resolved, 'handguard')!;
      if (resolved.assembly.parts[handguardId]!.params?.layout !== 'ak') {
        continue;
      }
      checked += 1;
      // The clamp is the collar that grips the barrel, not a wall of the handguard.
      const walls = resolved.defs.get(handguardId)!.solids.filter(({ id }) => !id.startsWith('clamp-'));
      const thicknesses = walls.map((solid) => {
        const [min, max] = localSolidBounds(solid);
        return { id: solid.id, thickness: Math.min(max[1] - min[1], max[2] - min[2]) };
      });
      expect(thicknesses.length, label).toBeGreaterThan(3);
      for (const { id, thickness } of thicknesses) {
        expect(thickness, `${label}: ${id}`).toBeCloseTo(thicknesses[0]!.thickness, 9);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
