import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { validateExtrudedPolygon } from '../src/core/geometry.ts';
import { applyDir, applyPoint } from '../src/core/math.ts';
import type { Domain, Solid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { ak } from '../src/gun/templates.ts';
import { loadFixture } from './helpers.ts';

const akFixture = loadFixture('archetype-ak');
const extrudedOf = (solid: Solid): Extract<Solid, { kind: 'extruded-polygon' }> => {
  if (solid.kind !== 'extruded-polygon') {
    throw new Error('Expected a convex extruded AK prism.');
  }
  return solid;
};
const polygonOf = (solid: Solid) => extrudedOf(solid).profile;
const axisAngle = (profile: readonly (readonly [number, number])[]) => {
  const dx = profile[0]![0] - profile[3]![0];
  const dy = profile[3]![1] - profile[0]![1];
  return (Math.atan2(dx, dy) * 180) / Math.PI;
};
const inspectAkPrisms = (solids: readonly Solid[]) => {
  const prisms = solids.map(extrudedOf);
  const profiles = prisms.map(({ profile }) => profile);
  return {
    ids: solids.map(({ id }) => id),
    valid: prisms.map(({ profile, z }) => validateExtrudedPolygon(profile, z) === undefined),
    zBounds: prisms.map(({ z }) => z),
    sideLengths: profiles.map((profile) => {
      const edgeLength = (a: readonly [number, number], b: readonly [number, number]) =>
        Math.hypot(b[0] - a[0], b[1] - a[1]);
      return {
        rear: edgeLength(profile[0]!, profile[3]!),
        front: edgeLength(profile[1]!, profile[2]!),
        top: edgeLength(profile[2]!, profile[3]!),
        bottom: edgeLength(profile[0]!, profile[1]!),
      };
    }),
    straightInsertionEdge: profiles[0]![2]![1] === profiles[0]![3]![1],
    slantedInsertBottom: profiles[0]![0]![1] !== profiles[0]![1]![1],
    sharedJoints: profiles
      .slice(1)
      .map((profile, i) =>
        profiles[i]!.slice(0, 2).every(
          (point, j) =>
            point[0] === [...profile.slice(2)].reverse()[j]![0] && point[1] === [...profile.slice(2)].reverse()[j]![1],
        ),
      ),
    axes: profiles.slice(1).map(axisAngle),
  };
};
const forwardTravel = (solids: readonly Solid[]) => {
  const upper = polygonOf(solids[0]!);
  const bottom = polygonOf(solids.at(-1)!);
  return (bottom[0]![0] + bottom[1]![0] - upper[0]![0] - upper[1]![0]) / 2;
};
const magazineStackLength = (solids: readonly Solid[]) =>
  solids.reduce((sum, solid) => {
    const profile = polygonOf(solid);
    const rear = Math.hypot(profile[0]![0] - profile[3]![0], profile[0]![1] - profile[3]![1]);
    const front = Math.hypot(profile[1]![0] - profile[2]![0], profile[1]![1] - profile[2]![1]);
    return sum + (rear + front) / 2;
  }, 0);
const akWithVariant = (variant: string) => ({
  ...akFixture,
  parts: {
    ...akFixture.parts,
    magazine: {
      ...akFixture.parts.magazine!,
      params: { ...akFixture.parts.magazine!.params, variant },
    },
  },
});

describe('AK-pattern archetype', () => {
  it('has a dust-cover receiver without a receiver rail and a rear sight on its sight-block port', () => {
    const receiver = FAMILIES['ak-receiver']!.build({ bore: 'S' });
    expect(receiver.solids.map(({ id }) => id)).toContain('dust-cover');
    expect(receiver.ports.map(({ id }) => id)).not.toContain('rail');
    expect(receiver.ports.map(({ id }) => id)).toContain('rear-sight');
  });

  it('cuts the receiver rear-top corner while preserving stock and sight interfaces', () => {
    const receiver = FAMILIES['ak-receiver']!.build({ bore: 'S' });
    const body = receiver.solids.find(({ id }) => id === 'receiver-body');
    expect(body?.kind).toBe('extruded-polygon');
    if (body?.kind !== 'extruded-polygon') {
      throw new Error('Expected a profiled AK receiver body.');
    }
    expect(validateExtrudedPolygon(body.profile, body.z)).toBeUndefined();
    expect(body.profile).toContainEqual([-16, 1]);
    expect(body.profile).toContainEqual([-14, 2.5]);
    expect(body.profile).not.toContainEqual([-16, 2.5]);
    const [forwardTop, rearTip] = body.profile.slice(-2);
    expect(Math.atan2(forwardTop![1] - rearTip![1], forwardTop![0] - rearTip![0]) * (180 / Math.PI)).toBeCloseTo(
      36.9,
      0,
    );

    const stockPort = receiver.ports.find(({ id }) => id === 'stock')!;
    const rearFaceY = body.profile.filter(([x]) => x === stockPort.pos[0]).map(([, y]) => y);
    expect(stockPort.pos).toEqual([-16, 0, 0]);
    expect(stockPort.pos[1]).toBeGreaterThan(Math.min(...rearFaceY));
    expect(stockPort.pos[1]).toBeLessThan(Math.max(...rearFaceY));
    expect(stockPort.pos[2]).toBeGreaterThanOrEqual(body.z[0]);
    expect(stockPort.pos[2]).toBeLessThanOrEqual(body.z[1]);

    const cover = receiver.solids.find(({ id }) => id === 'dust-cover');
    const rearSightPort = receiver.ports.find(({ id }) => id === 'rear-sight')!;
    expect(cover?.kind).toBe('box');
    if (cover?.kind !== 'box') {
      throw new Error('Expected an AK dust-cover solid.');
    }
    expect(cover.box.center[0] - cover.box.half[0]).toBeGreaterThan(forwardTop![0]);
    expect(cover.box.center[1] - cover.box.half[1]).toBe(2.5);
    expect(rearSightPort.pos).toEqual([-2, 3, 0]);
    expect(rearSightPort.pos[0]).toBeGreaterThan(cover.box.center[0] - cover.box.half[0]);
    expect(rearSightPort.pos[0]).toBeLessThan(cover.box.center[0] + cover.box.half[0]);
    expect(rearSightPort.pos[1]).toBe(cover.box.center[1] + cover.box.half[1]);
    expect(validate(akFixture, gunDomain).ok).toBe(true);
  });

  it('keeps the gas cylinder parallel to and above the bore axis', () => {
    const report = validate(akFixture, gunDomain);
    expect(report.ok).toBe(true);
    const placed = report.resolved.placed.get('gas-cylinder')!;
    const axis = report.resolved.defs.get('gas-cylinder')!.axes[0]!;
    expect(applyPoint(placed, axis.origin)).toEqual([0, 2, 0]);
    const direction = applyDir(placed, axis.dir);
    expect(direction[0]).toBeCloseTo(1);
    expect(direction[1]).toBeCloseTo(0);
    expect(direction[2]).toBeCloseTo(0);
  });

  it('mounts a gas block on the barrel and leaves a visible gas-cylinder span ahead of the AK handguard', () => {
    const report = validate(akFixture, gunDomain);
    expect(report.ok).toBe(true);
    const handguard = report.resolved.defs.get('handguard')!;
    const barrel = report.resolved.defs.get('barrel')!;
    const handguardEnd = applyPoint(
      report.resolved.placed.get('handguard')!,
      handguard.ports.find(({ id }) => id === 'front')!.pos,
    );
    const gasBlockOnBarrel = applyPoint(
      report.resolved.placed.get('barrel')!,
      barrel.ports.find(({ id }) => id === 'gas-port')!.pos,
    );
    expect(gasBlockOnBarrel[0] - handguardEnd[0]).toBe(6);
    expect(gasBlockOnBarrel[0]).toBe(28);
    expect(report.resolved.connections.some(({ conn }) => conn.from === 'barrel.gas-port')).toBe(true);
    expect(report.resolved.connections.some(({ conn }) => conn.to === 'gas-cylinder.front')).toBe(true);
    const cylinder = report.resolved.defs.get('gas-cylinder')!.solids[0]!;
    expect(cylinder.kind).toBe('box');
    if (cylinder.kind === 'box') {
      expect(cylinder.box.center[0] + cylinder.box.half[0]).toBe(28);
    }
  });

  it('rejects a misaligned gas-cylinder axis', () => {
    const gasCylinder = FAMILIES['gas-cylinder']!;
    const domain: Domain = {
      ...gunDomain,
      families: {
        ...gunDomain.families,
        'gas-cylinder': {
          ...gasCylinder,
          build: () => {
            const def = gasCylinder.build({});
            return { ...def, axes: [{ kind: 'gas-cylinder', origin: [0, 0, 0], dir: [0, 1, 0] }] };
          },
        },
      },
    };
    expect(
      validate(akFixture, domain)
        .issues.filter(({ rule }) => rule === 'axis-alignment')
        .map(({ message }) => message),
    ).toEqual(['The gas-cylinder axis of gas-cylinder is 90° off the main axis.']);
  });

  it('fits AK-74 and AKM magazine silhouette ratios to their measured reference images', () => {
    const references = {
      '3': { bend: 33.5, straight: 0.23, lengthDepth: 3.01, offsetDepth: 0.84 },
      '4': { bend: 50, straight: 0.26, lengthDepth: 3.51, offsetDepth: 1.58 },
    } as const;
    for (const count of ['3', '4'] as const) {
      const { solids } = FAMILIES.magazine!.build({
        length: 'L',
        profile: 'ak-curved',
        variant: count === '3' ? 'ak74' : 'akm',
      });
      const reference = references[count];
      const upper = polygonOf(solids[0]!);
      const base = polygonOf(solids.at(-1)!);
      const depth = 5.5;
      const baseAngle = (Math.atan2(base[1]![1] - base[0]![1], base[1]![0] - base[0]![0]) * 180) / Math.PI;
      const measurements = {
        bend: baseAngle,
        straight: Math.hypot(upper[3]![0] - upper[0]![0], upper[3]![1] - upper[0]![1]) / magazineStackLength(solids),
        lengthDepth: magazineStackLength(solids) / depth,
        offsetDepth: forwardTravel(solids) / depth,
      };
      expect(Math.abs(measurements.bend - reference.bend)).toBeLessThanOrEqual(1);
      expect(Math.abs(measurements.straight - reference.straight)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(measurements.lengthDepth - reference.lengthDepth)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(measurements.offsetDepth - reference.offsetDepth)).toBeLessThanOrEqual(0.3);
    }
  });

  it('selects AK-74 or AKM curve data per seed', () => {
    const variants = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const assembly = generate(ak, gunDomain, seed);
      const variant = assembly.parts.magazine!.params!.variant!;
      variants.add(variant);
      expect(['ak74', 'akm']).toContain(variant);
      expect(validate(assembly, gunDomain).ok).toBe(true);
    }
    expect(variants).toEqual(new Set(['ak74', 'akm']));
  }, 30_000);

  it('builds exact-jointed convex ring sectors and a finer display tessellation from each curve profile', () => {
    const edgeLengths = (profile: readonly (readonly [number, number])[]) =>
      profile.map((point, i) => {
        const next = profile[(i + 1) % profile.length]!;
        return Math.hypot(next[0] - point[0], next[1] - point[1]);
      });
    for (const [variant, facets, label] of [
      ['ak74', 6, 'AK-74'],
      ['akm', 8, 'AKM'],
    ] as const) {
      const { solids, displaySolids } = FAMILIES.magazine!.build({ length: 'L', profile: 'ak-curved', variant });
      const facts = inspectAkPrisms(solids);
      expect(facts.ids).toEqual(['upper-body', ...Array.from({ length: facets }, (_, i) => `curve-sector-${i + 1}`)]);
      expect(displaySolids?.length).toBe(25);
      expect(facts.valid.every(Boolean)).toBe(true);
      expect(facts.zBounds.every((bounds) => bounds[0] === -1.25 && bounds[1] === 1.25)).toBe(true);
      expect(facts.straightInsertionEdge && facts.slantedInsertBottom).toBe(true);
      expect(facts.sharedJoints.every(Boolean)).toBe(true);
      for (let i = 1; i <= facets; i++) {
        const profile = polygonOf(solids[i]!);
        expect(facts.sideLengths[i]!.rear).toBeGreaterThan(facts.sideLengths[i]!.front);
        expect(facts.sideLengths[i]!.top).toBeCloseTo(facts.sideLengths[i]!.bottom, 8);
        if (i > 1) {
          const previous = polygonOf(solids[i - 1]!);
          expect(
            edgeLengths(profile)
              .map((value, j) => Math.abs(value - edgeLengths(previous)[j]!))
              .every((d) => d < 1e-8),
          ).toBe(true);
        }
      }
      expect(validate(akWithVariant(variant), gunDomain).ok, label).toBe(true);
    }
    expect(FAMILIES.lower!.build({ layout: 'ak' }).keepOuts.map(({ id }) => id)).toContain('magazine-rock-in-sweep');
    expect(validate(akFixture, gunDomain).ok).toBe(true);
  });

  it('face-seats the AK magazine at a flat lower surface with its rock-in sweep starting at the front hook', () => {
    const lower = FAMILIES.lower!.build({ layout: 'ak' });
    const magazine = FAMILIES.magazine!.build({ length: 'L', profile: 'ak-curved', variant: 'ak74' });
    const lowerPort = lower.ports.find(({ id }) => id === 'magazine')!;
    const topPort = magazine.ports.find(({ id }) => id === 'top')!;
    expect(lower.solids.map(({ id }) => id)).toEqual([
      'frame',
      'trigger-guard-top',
      'trigger-guard-rear',
      'trigger-guard-front',
      'trigger-guard-bottom',
    ]);
    expect(lowerPort.pos[1]).toBe(-1.5);
    expect(topPort.seat).toBe('face');
    expect(topPort.pos[1]).toBe(0);
    const upper = magazine.solids[0]!;
    expect(upper.kind).toBe('extruded-polygon');
    if (upper.kind !== 'extruded-polygon') {
      throw new Error('Expected the AK magazine feed-lip prism.');
    }
    expect(Math.max(...upper.profile.map(([, y]) => y))).toBe(0);
    const sweep = lower.keepOuts.find(({ id }) => id === 'magazine-rock-in-sweep')!;
    const sweepMinX = sweep.box.center[0] - sweep.box.half[0];
    const sweepMaxX = sweep.box.center[0] + sweep.box.half[0];
    const frontHookX = lowerPort.pos[0] + 5.5 / 2;
    expect(sweepMinX).toBe(frontHookX);
    expect(sweepMaxX).toBe(frontHookX + 4);
    expect(lower.keepOuts.some(({ id }) => id === 'magazine-path')).toBe(false);
  });

  it('adds an intermediate dropped stock distinct from straight and sporting styles', () => {
    const dropped = FAMILIES.stock!.build({ length: 'M', style: 'dropped' });
    const straight = FAMILIES.stock!.build({ length: 'M', style: 'straight' });
    expect(dropped.solids.map(({ id }) => id)).toEqual(['comb', 'wrist', 'butt']);
    expect(dropped.solids[0]?.kind).toBe('box');
    if (dropped.solids[0]?.kind === 'box') {
      expect(dropped.solids[0].box.center[1] + dropped.solids[0].box.half[1]).toBe(-1.5);
    }
    expect(straight.solids.find(({ id }) => id === 'comb')?.kind).toBe('box');
  });

  it('passes the complete fixture and reports missing gas-cylinder interfaces clearly', () => {
    expect(validate(akFixture, gunDomain).issues).toEqual([]);
    const { issues } = validate(loadFixture('broken-ak-gas-cylinder'), gunDomain);
    expect(issues.filter(({ rule }) => rule === 'required-ports').map(({ message }) => message)).toContain(
      'receiver.gas-cylinder (gas-cylinder mount on receiver) is required but empty.',
    );
    const missingBlock = validate(loadFixture('broken-ak-gas-block'), gunDomain).issues;
    expect(missingBlock.filter(({ rule }) => rule === 'required-ports').map(({ message }) => message)).toContain(
      'gas-cylinder.front (gas-block mount on gas-cylinder) is required but empty.',
    );
  });
});
