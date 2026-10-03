import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { distanceWorld, validateExtrudedPolygon, worldSolid } from '../src/core/geometry.ts';
import { IDENTITY } from '../src/core/math.ts';
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
    const handRoles = ['fore-stock', 'stock-wrist', 'grip'];
    const hand = (solids: readonly ExtrudedPolygonSolid[]) =>
      solids.filter((s) => handRoles.includes(s.display?.role ?? ''));
    expect(hand(sawed)).toEqual(hand(full));
    const stubs = sawed.filter((s) => s.display?.role === 'cut-stub');
    const grips = sawed.filter((s) => s.display?.role === 'grip');
    expect(
      Math.min(...grips.map((s) => distanceWorld(worldSolid(IDENTITY, stubs[0]!), worldSolid(IDENTITY, s)))),
    ).toBeCloseTo(0, 9);
    for (const stub of stubs) {
      const original = polygon(full, stub.id.replace('cut-stub', 'stock-joint'));
      expect(stub.clip).toEqual(original.clip);
      expect(stub.z).toEqual(original.z);
      for (const [x, y] of stub.profile) {
        const ys = original.profile.flatMap((a, i) => {
          const b = original.profile[(i + 1) % original.profile.length]!;
          if (Math.abs(a[0] - b[0]) < 1e-9 || x < Math.min(a[0], b[0]) - 1e-9 || x > Math.max(a[0], b[0]) + 1e-9) {
            return [];
          }
          return [a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1])];
        });
        expect(
          Math.min(...ys.map((value) => Math.abs(value - y))),
          'cut inherits the full joint surface without resampling',
        ).toBeLessThan(1e-9);
      }
    }
    const gripRear = Math.min(...grips.flatMap((s) => s.profile.map(([x]) => x)));
    const cutFaceX = Math.min(...stubs.flatMap((s) => s.profile.map(([x]) => x)));
    expect(gripRear - cutFaceX).toBeGreaterThan(0);
    expect(gripRear - cutFaceX).toBeLessThanOrEqual(1);
    const lastStub = stubs.at(-1)!;
    expect(lastStub.profile.filter(([x]) => x === cutFaceX)).toHaveLength(2);
    const mLength = -Math.min(...polygon(stockProfile('M', 'tapered'), 'butt-pad').profile.map(([x]) => x));
    expect(-cutFaceX / mLength).toBeLessThanOrEqual(0.45);
    expect(new Set(sawed.map((s) => s.display?.role))).toEqual(new Set([...handRoles, 'cut-stub']));
  });

  // Measured about 5.2 s on a loaded host (load 4-10), too much of vitest's 5 s default; the explicit timeout, about 5x that, keeps it from flaking under load.
  it('generates sawed stocks only on short-barrel builds, in a 10–20% seed share, with one valid hold', {
    timeout: 30_000,
  }, () => {
    const sawedSeeds: number[] = [];
    for (let seed = 0; seed < 300; seed++) {
      const assembly = generate(pumpShotgun, gunDomain, seed);
      const stockEntry = Object.entries(assembly.parts).find(([, part]) => part.family === 'stock');
      expect(stockEntry, `seed ${seed}: one stock part`).toBeDefined();
      if (!stockEntry) {
        throw new Error(`seed ${seed}: missing stock part`);
      }
      const [stockId, stockInstance] = stockEntry;
      if (stockInstance.params?.style !== 'tapered-sawed') {
        continue;
      }
      sawedSeeds.push(seed);
      expect(assembly.parts.lower?.params?.layout, `seed ${seed}`).toBe('pump');
      expect(assembly.parts.grip, `seed ${seed}: sawed stock is gripless`).toBeUndefined();
      expect(assembly.parts.barrel?.params?.length, `seed ${seed}`).toBe('S');
      const report = validate(assembly, gunDomain);
      expect(report.ok, `seed ${seed}: ${report.issues.map((issue) => issue.message).join('; ')}`).toBe(true);
      const resolved = resolve(assembly, gunDomain);
      const anchors = selectGunAnchors(resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY);
      expect('code' in anchors, `seed ${seed}`).toBe(false);
      const stock = resolved.defs.get(stockId)!;
      expect(stock.tags).toContain(FIRING_GRIP);
      const params = Object.fromEntries(
        Object.entries(resolved.params.get(stockId)!).map(([key, value]) => [key, value.value]),
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
