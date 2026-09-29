import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyPoint, type Transform, type Vec3 } from '../src/core/math.ts';
import type { Assembly, Solid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, FIRING_GRIP } from '../src/gun/parts.ts';
import { boltRifle } from '../src/gun/templates.ts';
import { loadFixture, variant } from './helpers.ts';

const design = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'designs', 'archetype-awm.json'), 'utf8')) as {
  assembly: Parameters<typeof validate>[0];
};

const vertices = (solid: Solid): Vec3[] => {
  if (solid.kind === 'box') {
    const { center, half } = solid.box;
    return [-1, 1].flatMap((x) =>
      [-1, 1].flatMap((y) =>
        [-1, 1].map((z) => [center[0] + x * half[0], center[1] + y * half[1], center[2] + z * half[2]] as const),
      ),
    );
  }
  return solid.profile.flatMap(([x, y]) => solid.z.map((z) => [x, y, z] as const));
};

const bounds = (solid: Solid): readonly (readonly [number, number])[] =>
  [0, 1, 2].map((axis) => {
    const coordinates = vertices(solid).map((point) => point[axis]!);
    return [Math.min(...coordinates), Math.max(...coordinates)];
  });

const boundsX = (solid: Solid): readonly [number, number] => bounds(solid)[0]!;

const worldBoundsX = (solids: readonly Solid[], transform: Transform): readonly [number, number] => {
  const xs = solids.flatMap((solid) => vertices(solid).map((point) => applyPoint(transform, point)[0]));
  return [Math.min(...xs), Math.max(...xs)];
};

const solidsTouch = (a: Solid, b: Solid): boolean =>
  bounds(a).every(([a0, a1], axis) => {
    const [b0, b1] = bounds(b)[axis]!;
    return a0 <= b1 + 1e-8 && b0 <= a1 + 1e-8;
  });

const oneConnectedSolidSet = (solids: readonly Solid[]): boolean => {
  const connected = new Set([0]);
  let frontier = [0];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const current of frontier) {
      for (const [candidate, solid] of solids.entries()) {
        if (!connected.has(candidate) && solidsTouch(solids[current]!, solid)) {
          connected.add(candidate);
          next.push(candidate);
        }
      }
    }
    frontier = next;
  }
  return connected.size === solids.length;
};

const gripGuardGap = (assembly: Assembly, gripFamily: 'grip' | 'stock'): number => {
  const report = validate(assembly, gunDomain);
  const lowerId = Object.keys(assembly.parts).find((id) => assembly.parts[id]!.family === 'lower')!;
  const gripId = Object.keys(assembly.parts).find((id) => assembly.parts[id]!.family === gripFamily)!;
  const lowerDef = report.resolved.defs.get(lowerId)!;
  const gripDef = report.resolved.defs.get(gripId)!;
  const guard = lowerDef.solids.find((solid) => solid.id === 'trigger-guard-rear')!;
  const grip = gripFamily === 'stock' ? gripDef.solids.filter((solid) => solid.id === 'grip') : gripDef.solids;
  const [guardRear] = worldBoundsX([guard], report.resolved.placed.get(lowerId)!);
  const [, gripFront] = worldBoundsX(grip, report.resolved.placed.get(gripId)!);
  return guardRear - gripFront;
};

const inside = (solid: Solid, x: number, y: number, z: number): boolean => {
  if (solid.kind === 'box') {
    return [x, y, z].every((value, axis) => Math.abs(value - solid.box.center[axis]!) <= solid.box.half[axis]!);
  }
  if (z < solid.z[0] || z > solid.z[1]) {
    return false;
  }
  let result = false;
  for (let i = 0; i < solid.profile.length; i += 1) {
    const j = (i + solid.profile.length - 1) % solid.profile.length;
    const [xi, yi] = solid.profile[i]!;
    const [xj, yj] = solid.profile[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      result = !result;
    }
  }
  return result;
};

describe('thumbhole stock and AWM design', () => {
  it('builds a real opening while retaining a connected stock and an interior firing-hand anchor', () => {
    const stock = FAMILIES.stock!.build({ length: 'L', style: 'thumbhole' });
    expect(stock.tags).toContain(FIRING_GRIP);
    const aperture = [-1.25, -5.99, 0] as const;
    expect(stock.solids.some((solid) => inside(solid, ...aperture))).toBe(false);
    expect(oneConnectedSolidSet(stock.solids)).toBe(true);
    const rearPost = stock.solids.find((solid) => solid.id === 'thumbhole-rear-post')!;
    expect(rearPost.kind).toBe('extruded-polygon');
    if (rearPost.kind !== 'extruded-polygon') {
      throw new Error('Expected a thumbhole rear post profile.');
    }
    const gripX = boundsX(stock.solids.find((solid) => solid.id === 'grip')!);
    const rearX = Math.max(...rearPost.profile.map(([x]) => x));
    expect(gripX[0] - rearX).toBe(4);
    const butt = stock.solids.find((solid) => solid.id === 'butt')!;
    expect(Math.min(...vertices(butt).map(([x]) => x))).toBe(-22);
    const grip = stock.solids.find((solid) => solid.id === 'grip')!;
    const hold = GUN_ANCHORS.stock!.anchors({ length: 'L', style: 'thumbhole' }, stock).hold!;
    expect(inside(grip, ...hold.position)).toBe(true);
    expect(stock.ports.find((port) => port.id === 'front')?.pos).toEqual([0, 0, 0]);
  });

  it('keeps the measured AR grip-to-guard clearance when the thumbhole moves forward', () => {
    const arGap = gripGuardGap(loadFixture('archetype-ar'), 'grip');
    expect(arGap).toBeCloseTo(0, 6);
    const boltOverride = variant('archetype-bolt-rifle', (draft) => {
      draft.parts.stock!.params!.style = 'thumbhole';
    });
    for (const assembly of [design.assembly, boltOverride]) {
      expect(validate(assembly, gunDomain).issues).toEqual([]);
      const gap = gripGuardGap(assembly, 'stock');
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(0.25);
    }
  });

  it('allows a thumbhole on the existing bolt-rifle template without a separate grip', () => {
    const stockChoice = boltRifle.slots.find((slot) => slot.id === 'stock')?.params?.style;
    expect(stockChoice).toContain('thumbhole');
    const existing = variant('archetype-bolt-rifle', (draft) => {
      draft.parts.stock!.params!.style = 'thumbhole';
    });
    expect(validate(existing, gunDomain).issues).toEqual([]);
  });

  it('validates the AWM design with its thumbhole stock as the only grip', () => {
    const loaded = loadGunDesign(
      JSON.stringify({
        format: 1,
        template: 'bolt-rifle-thumbhole',
        assembly: design.assembly,
        locks: { params: {}, optionalParts: [] },
        status: 'published',
      }),
    );
    expect(loaded.ok).toBe(true);
    const report = validate(design.assembly, gunDomain);
    expect(report.issues).toEqual([]);
    expect(design.assembly.parts.grip).toBeUndefined();
    expect(design.assembly.parts.lower?.params?.layout).toBe('thumbhole');
    expect(design.assembly.parts.barrel?.params?.profile).toBe('heavy');
  });
});
