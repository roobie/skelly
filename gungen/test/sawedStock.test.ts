import { generate } from '@skelly/engine/assembly/generate.ts';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { IDENTITY } from '@skelly/engine/foundation/math.ts';
import { distanceWorld, validateExtrudedPolygon, worldSolid } from '@skelly/engine/shapes/geometry.ts';
import type { ExtrudedPolygonSolid } from '@skelly/engine/shapes/solid.ts';
import { describe, expect, it } from 'vitest';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { GUN_ANCHOR_POLICY, selectGunAnchors } from '../src/gun/anchors.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, FIRING_GRIP } from '../src/gun/parts.ts';
import { pumpShotgun } from '../src/gun/templates.ts';
import { sweepGroup } from './sweeps.ts';

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

// A pump build with chosen barrel and stock params, so no test depends on which seed happens to roll them.
const pumpWith = (params: { barrel: Record<string, string>; stock: Record<string, string> }) => {
  const base = generate(pumpShotgun, gunDomain, 0);
  const overrides: Record<string, Record<string, string>> = { barrel: params.barrel, stock: params.stock };
  const parts = Object.fromEntries(
    Object.entries(base.parts).map(([id, part]) => {
      const override = overrides[part.family];
      return [id, override ? { ...part, params: { ...part.params, ...override } } : part];
    }),
  );
  return { ...base, parts };
};

// Asserts the properties a sawed-off stock build must keep: short-barrel gripless pump lower,
// a valid assembly, an unambiguous firing-grip anchor inside the grip section, and a matching hold.
const check = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
const expectSawedStockBuild = (assembly: ReturnType<typeof generate>, seed: number) => {
  const stockEntry = Object.entries(assembly.parts).find(([, part]) => part.family === 'stock');
  check(stockEntry !== undefined, `seed ${seed}: one stock part`);
  if (!stockEntry) {
    throw new Error(`seed ${seed}: missing stock part`);
  }
  const [stockId, stockInstance] = stockEntry;
  check(stockInstance.params?.style === 'tapered-sawed', `seed ${seed}: sawed style`);
  check(assembly.parts.lower?.params?.layout === 'pump', `seed ${seed}: pump layout`);
  check(assembly.parts.grip === undefined, `seed ${seed}: sawed stock is gripless`);
  check(assembly.parts.barrel?.params?.length === 'S', `seed ${seed}: short barrel`);
  const report = validate(assembly, gunDomain);
  check(report.ok, `seed ${seed}: ${report.issues.map((issue) => issue.message).join('; ')}`);
  const resolved = resolve(assembly, gunDomain);
  const anchors = selectGunAnchors(resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY);
  check(!('code' in anchors), `seed ${seed}: one unambiguous hold`);
  const stock = resolved.defs.get(stockId)!;
  check(stock.tags?.includes(FIRING_GRIP), `seed ${seed}: stock is the firing grip`);
  const params = Object.fromEntries(
    Object.entries(resolved.params.get(stockId)!).map(([key, value]) => [key, value.value]),
  );
  const stockHold = GUN_ANCHORS.stock!.anchors(params, stock).hold!;
  const grip = polygon(
    stock.solids.filter((solid): solid is ExtrudedPolygonSolid => solid.kind === 'extruded-polygon'),
    'grip',
  );
  const localHold = stockHold.position;
  check(localHold[2] >= grip.z[0] && localHold[2] <= grip.z[1], `seed ${seed}: hold sits inside the grip section`);
  check(
    grip.profile.every((a, index) => {
      const b = grip.profile[(index + 1) % grip.profile.length]!;
      return (b[0] - a[0]) * (localHold[1] - a[1]) - (b[1] - a[1]) * (localHold[0] - a[0]) >= -1e-8;
    }),
    `seed ${seed}: hold sits inside the grip polygon`,
  );
};

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

  it('builds a valid sawed stock on a short-barrel pump', () => {
    expectSawedStockBuild(pumpWith({ barrel: { length: 'S' }, stock: { style: 'tapered-sawed' } }), 0);
  });

  it('builds a valid plain stock on a long-barrel pump', () => {
    const assembly = pumpWith({ barrel: { length: 'L' }, stock: { style: 'tapered' } });
    expect(validate(assembly, gunDomain).issues).toEqual([]);
  });
});

sweepGroup('sawed-off tapered stock', () => {
  it('generates sawed stocks only on short-barrel builds across 300 seeds', () => {
    for (let seed = 0; seed < 300; seed++) {
      const assembly = generate(pumpShotgun, gunDomain, seed);
      const stockEntry = Object.entries(assembly.parts).find(([, part]) => part.family === 'stock');
      expect(stockEntry, `seed ${seed}: one stock part`).toBeDefined();
      if (stockEntry?.[1].params?.style !== 'tapered-sawed') {
        continue;
      }
      expectSawedStockBuild(assembly, seed);
    }
  });
});
