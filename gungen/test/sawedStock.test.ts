import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { validateExtrudedPolygon } from '../src/core/geometry.ts';
import { resolve } from '../src/core/resolve.ts';
import type { ExtrudedPolygonSolid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { GUN_ANCHOR_POLICY, selectGunAnchors } from '../src/gun/anchors.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, FIRING_GRIP } from '../src/gun/parts.ts';
import { pumpShotgun } from '../src/gun/templates.ts';

const polygon = (solids: readonly ExtrudedPolygonSolid[], id: string) => {
  const solid = solids.find((candidate) => candidate.id === id);
  if (!solid) {
    throw new Error(`missing ${id}`);
  }
  return solid;
};

const stockProfile = (length: 'M' | 'L', style: 'tapered' | 'tapered-sawed') =>
  FAMILIES.stock!.build({ length, style }).solids.filter(
    (solid): solid is ExtrudedPolygonSolid => solid.kind === 'extruded-polygon',
  );

describe('sawed-off tapered stock', () => {
  it.each(['M', 'L'] as const)('%s preserves the tapered front and ends just behind the grip', (length) => {
    const full = stockProfile(length, 'tapered');
    const sawed = stockProfile(length, 'tapered-sawed');
    for (const solid of sawed) {
      expect(validateExtrudedPolygon(solid.profile, solid.z)).toBeUndefined();
    }
    expect(polygon(sawed, 'fore-stock')).toEqual(polygon(full, 'fore-stock'));
    expect(polygon(sawed, 'grip')).toEqual(polygon(full, 'grip'));

    const gripRear = Math.min(...polygon(sawed, 'grip').profile.map(([x]) => x));
    const cutFaceX = Math.min(...polygon(sawed, 'cut-stub').profile.map(([x]) => x));
    const distanceBehindGrip = gripRear - cutFaceX;
    expect(distanceBehindGrip).toBeGreaterThan(0);
    expect(distanceBehindGrip).toBeLessThanOrEqual(1);
    expect(
      polygon(sawed, 'cut-stub')
        .profile.filter(([x]) => x === cutFaceX)
        .map(([, y]) => y),
    ).toHaveLength(2);

    const jointX = 0;
    const stockLength = jointX - cutFaceX;
    const fullM = stockProfile('M', 'tapered');
    const mJointToPad = jointX - Math.min(...polygon(fullM, 'butt-pad').profile.map(([x]) => x));
    expect(stockLength / mJointToPad).toBeLessThanOrEqual(0.45);
    expect(sawed.map((solid) => solid.id)).toEqual(['fore-stock', 'grip', 'cut-stub']);
  });

  it('generates sawed stocks only on short-barrel builds, in a 10–20% seed share, with one valid hold', () => {
    const sawedSeeds: number[] = [];
    for (let seed = 0; seed < 300; seed++) {
      const assembly = generate(pumpShotgun, gunDomain, seed);
      const stockInstance = assembly.parts.stock!;
      if (stockInstance.params?.style !== 'tapered-sawed') {
        continue;
      }
      sawedSeeds.push(seed);
      expect(assembly.parts.barrel?.params?.length, `seed ${seed}`).toBe('S');
      const report = validate(assembly, gunDomain);
      expect(report.ok, `seed ${seed}: ${report.issues.map((issue) => issue.message).join('; ')}`).toBe(true);
      const resolved = resolve(assembly, gunDomain);
      const anchors = selectGunAnchors(resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY);
      expect('code' in anchors, `seed ${seed}`).toBe(false);
      const stock = resolved.defs.get('stock')!;
      expect(stock.tags).toContain(FIRING_GRIP);
      const params = Object.fromEntries(
        Object.entries(resolved.params.get('stock')!).map(([key, value]) => [key, value.value]),
      );
      const stockHold = GUN_ANCHORS.stock!.anchors(params, stock).hold!;
      const grip = polygon(
        stock.solids.filter((solid): solid is ExtrudedPolygonSolid => solid.kind === 'extruded-polygon'),
        'grip',
      );
      const localHold = stockHold.position;
      expect(localHold[2]).toBeGreaterThanOrEqual(grip.z[0]);
      expect(localHold[2]).toBeLessThanOrEqual(grip.z[1]);
      expect(
        grip.profile.every((a, index) => {
          const b = grip.profile[(index + 1) % grip.profile.length]!;
          return (b[0] - a[0]) * (localHold[1] - a[1]) - (b[1] - a[1]) * (localHold[0] - a[0]) >= -1e-8;
        }),
      ).toBe(true);
    }
    expect(sawedSeeds.length).toBeGreaterThanOrEqual(30);
    expect(sawedSeeds.length).toBeLessThanOrEqual(60);
  });
});
