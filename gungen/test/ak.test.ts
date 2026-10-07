import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { localSolidBounds, validateExtrudedPolygon } from '../src/core/geometry.ts';
import { applyDir, applyPoint } from '../src/core/math.ts';
import type { Domain, Solid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { GUN_ANCHOR_POLICY, selectGunAnchors } from '../src/gun/anchors.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { AK_REAR_BEVEL, FAMILIES, RECEIVER_SECTION } from '../src/gun/parts.ts';
import type { GunPortDef } from '../src/gun/portData.ts';
import { ak } from '../src/gun/templates.ts';
import { loadFixture, variant as variantOf } from './helpers.ts';
import { sweepGroup } from './sweeps.ts';

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
/** Seeds a sweep may scan for every offered value; missing one within it means a value is unreachable. */
const SEED_SCAN_BOUND = 64;

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
  it('seats the rear-sight leaf on the receiver’s sight block without a post, above the dust cover', () => {
    const report = validate(akFixture, gunDomain);
    expect(report.issues).toEqual([]);
    const receiver = report.resolved.defs.get('receiver')!;
    expect(receiver.solids.map(({ id }) => id)).not.toContain('dust-cover');
    expect(receiver.ports.map(({ id }) => id)).not.toContain('rail');
    const sightId = Object.entries(report.resolved.assembly.parts).find(
      ([, part]) => part.family === 'ak-rear-sight',
    )?.[0];
    if (!sightId) {
      throw new Error('AK design needs a rear sight');
    }
    const sight = report.resolved.defs.get(sightId)!;
    expect(sight.solids.map(({ id }) => id)).not.toContain('leaf-stem');
    const sightBlockTop = Math.max(
      ...receiver.solids.filter(({ id }) => id.startsWith('rear-sight-base')).map((s) => localSolidBounds(s)[1][1]),
    );
    const receiverPort = receiver.ports.find(({ id }) => id === 'rear-sight')!;
    const sightPlaced = report.resolved.placed.get(sightId)!;
    const leafBase = Math.min(...sight.solids.map((s) => localSolidBounds(s)[0][1]));
    expect(applyPoint(sightPlaced, [0, leafBase, 0])).toEqual(
      applyPoint(report.resolved.placed.get('receiver')!, receiverPort.pos),
    );
    expect(receiverPort.pos[1]).toBe(sightBlockTop);
    const section = receiver.solids.filter(({ display }) => display?.mergeGroup === 'receiver-ak');
    const roofY = Math.max(...section.map((solid) => localSolidBounds(solid)[1][1]));
    const sightAxis = applyPoint(sightPlaced, sight.axes.find(({ kind }) => kind === 'sight')!.origin);
    expect(roofY).toBeLessThan(sightBlockTop);
    expect(sightBlockTop).toBeLessThan(sightAxis[1]);
    const barrel = report.resolved.defs.get('barrel')!;
    const barrelAxis = barrel.axes.find(({ kind }) => kind === 'bore')!;
    expect(applyPoint(report.resolved.placed.get('barrel')!, barrelAxis.origin)[1]).toBeCloseTo(0);
    expect(applyPoint(report.resolved.placed.get('handguard')!, [0, 0, 0])[1]).toBeCloseTo(0);
  });

  it('sizes the forward AK port below the dust-cover roof, under the rear sight', () => {
    const receiver = FAMILIES['ak-receiver']!.build({ bore: 'M' });
    const port = receiver.keepOuts.find(({ id }) => id === 'ejection')!;
    const portXMin = port.box.center[0] - port.box.half[0];
    const portXMax = port.box.center[0] + port.box.half[0];
    const portYMax = port.box.center[1] + port.box.half[1];
    const section = receiver.solids.filter(({ display }) => display?.mergeGroup === 'receiver-ak');
    const roofY = Math.max(...section.map((solid) => localSolidBounds(solid)[1][1]));
    const rearSight = receiver.ports.find(({ id }) => id === 'rear-sight')!;

    expect(portXMin).toBeLessThan(portXMax);
    expect(portYMax).toBeLessThan(roofY);
    expect(rearSight.pos[0]).toBeGreaterThan(portXMin);
    expect(rearSight.pos[0]).toBeLessThan(portXMax);
  });

  it('uses an angled AK section whose dust cover slopes down to the stock’s face', () => {
    const receiver = FAMILIES['ak-receiver']!.build({ bore: 'S' });
    const section = receiver.solids.find(({ id }) => id.startsWith('receiver-ak-top'));
    expect(section?.kind).toBe('extruded-polygon');
    if (section?.kind !== 'extruded-polygon') {
      throw new Error('Expected the shared AK section builder output.');
    }
    expect(section.axis).toBe('x');
    expect(RECEIVER_SECTION.ak.outline[2]![0]).toBeGreaterThan(RECEIVER_SECTION.ak.outline[1]![0]);
    expect(validateExtrudedPolygon(section.profile, section.z, section.axis, section.clip)).toBeUndefined();
    expect(receiver.solids.some(({ id }) => id.startsWith('receiver-ak-near-side-span-'))).toBe(true);

    const stockPort = receiver.ports.find(({ id }) => id === 'stock')!;
    const rearSightPort = receiver.ports.find(({ id }) => id === 'rear-sight')!;
    expect(stockPort.pos[0]).toBeLessThan(rearSightPort.pos[0]);
    const bevelSolid = receiver.solids.find(
      (solid): solid is Extract<Solid, { kind: 'extruded-polygon' }> =>
        solid.kind === 'extruded-polygon' && Boolean(solid.clip?.length),
    )!;
    const bevelPlane = bevelSolid.clip![0]!;
    const topAt = (x: number) => (bevelPlane.offset - bevelPlane.normal[0] * x) / bevelPlane.normal[1];
    expect(topAt(rearSightPort.pos[0])).toBeGreaterThan(topAt(stockPort.pos[0]));
    expect(stockPort.pos[1]).toBeLessThan(topAt(stockPort.pos[0]));
    expect(AK_REAR_BEVEL.angleDegrees).toBeGreaterThan(0);
    expect(AK_REAR_BEVEL.angleDegrees).toBeLessThan(90);
  });

  it('keeps the gas cylinder parallel to and above the bore axis, from the receiver’s gas-cylinder port', () => {
    const report = validate(akFixture, gunDomain);
    expect(report.ok).toBe(true);
    const placed = report.resolved.placed.get('gas-cylinder')!;
    const axis = report.resolved.defs.get('gas-cylinder')!.axes[0]!;
    const receiver = report.resolved.defs.get('receiver')!;
    const port = receiver.ports.find(({ id }) => id === 'gas-cylinder')!;
    const origin = applyPoint(placed, axis.origin);
    expect(origin).toEqual(applyPoint(report.resolved.placed.get('receiver')!, port.pos));
    const [[, cylinderLocalBottom]] = localSolidBounds(report.resolved.defs.get('gas-cylinder')!.solids[0]!);
    const [, [, barrelTop]] = localSolidBounds(
      report.resolved.defs.get('barrel')!.solids.find(({ id }) => id === 'tube')!,
    );
    expect(cylinderLocalBottom + origin[1]).toBeGreaterThan(barrelTop);
    const direction = applyDir(placed, axis.dir);
    expect(direction[0]).toBeCloseTo(1);
    expect(direction[1]).toBeCloseTo(0);
    expect(direction[2]).toBeCloseTo(0);
  });

  it('mounts a gas block on the barrel and leaves a visible gas-cylinder span ahead of the AK handguard', () => {
    const report = validate(akFixture, gunDomain);
    expect(report.ok).toBe(true);
    const handguard = report.resolved.defs.get('handguard')!;
    const handguardEnd = applyPoint(
      report.resolved.placed.get('handguard')!,
      handguard.ports.find(({ id }) => id === 'front')!.pos,
    );
    expect(report.resolved.connections.some(({ conn }) => conn.from === 'barrel.gas-port')).toBe(true);
    expect(report.resolved.connections.some(({ conn }) => conn.to === 'gas-cylinder.front')).toBe(true);
    const cylinder = extrudedOf(report.resolved.defs.get('gas-cylinder')!.solids[0]!);
    expect(cylinder.axis).toBe('x');
    const bounds = localSolidBounds(cylinder);
    const cylinderPlaced = report.resolved.placed.get('gas-cylinder')!;
    expect(applyPoint(cylinderPlaced, [bounds[1][0], 0, 0])[0]).toBeGreaterThan(handguardEnd[0]);

    const barrel = report.resolved.defs.get('barrel')!;
    const gasBlock = report.resolved.defs.get('gas-block')!;
    const barrelTube = extrudedOf(barrel.solids.find(({ id }) => id === 'tube')!);
    const collar = gasBlock.solids.filter(({ id }) => id.startsWith('collar-')).map(extrudedOf);
    expect(collar).toHaveLength(8);
    for (const segment of collar) {
      expect(
        barrelTube.profile.some((point, index) => {
          const next = barrelTube.profile[(index + 1) % barrelTube.profile.length]!;
          return (
            point[0] === segment.profile[0]![0] &&
            point[1] === segment.profile[0]![1] &&
            next[0] === segment.profile[3]![0] &&
            next[1] === segment.profile[3]![1]
          );
        }),
      ).toBe(true);
    }
    const riser = extrudedOf(gasBlock.solids.find(({ id }) => id === 'block')!);
    const rearX = Math.min(...riser.profile.map(([x]) => x));
    const rearFaceY = riser.profile.filter(([x]) => x === rearX).map(([, y]) => y);
    const blockPlaced = report.resolved.placed.get('gas-block')!;
    const blockRear = [Math.min(...rearFaceY), Math.max(...rearFaceY)].flatMap((y) =>
      riser.z.map((z) => applyPoint(blockPlaced, [rearX, y, z])),
    );
    const [, [cylinderFrontX]] = bounds;
    const cylinderFront = cylinder.profile.map(([y, z]) => applyPoint(cylinderPlaced, [cylinderFrontX, y, z]));
    const [planeX] = blockRear[0]!;
    const minY = Math.min(...blockRear.map((point) => point[1]));
    const maxY = Math.max(...blockRear.map((point) => point[1]));
    const minZ = Math.min(...blockRear.map((point) => point[2]));
    const maxZ = Math.max(...blockRear.map((point) => point[2]));
    const eps = 1e-9;
    for (const point of cylinderFront) {
      expect(point[0]).toBeCloseTo(planeX, 10);
      expect(point[1]).toBeGreaterThanOrEqual(minY - eps);
      expect(point[1]).toBeLessThanOrEqual(maxY + eps);
      expect(point[2]).toBeGreaterThanOrEqual(minZ - eps);
      expect(point[2]).toBeLessThanOrEqual(maxZ + eps);
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

  // BR 22:47: both magazine types must work with the v2 AK.
  it('seats every AK magazine variant in the v2 magwell, its top inside the well, with a magwell anchor', () => {
    const variants = FAMILIES.magazine!.params.variant!.values;
    expect(variants.length).toBeGreaterThan(1);
    for (const variant of variants) {
      const report = validate(akWithVariant(variant), gunDomain);
      expect(report.issues, variant).toEqual([]);
      const seat = report.resolved.connections.find(({ conn }) => conn.to === 'magazine.top');
      expect(seat?.conn.from, variant).toBe('lower.magazine');
      const anchors = selectGunAnchors(report.resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY);
      if ('code' in anchors) {
        throw new Error(`${variant}: ${JSON.stringify(anchors)}`);
      }
      expect(anchors.others.magwell, variant).toBeDefined();
      const magazinePlaced = report.resolved.placed.get('magazine')!;
      const [[minX, ,], [maxX, maxY]] = localSolidBounds(report.resolved.defs.get('magazine')!.solids[0]!);
      const topFace = [applyPoint(magazinePlaced, [minX, maxY, 0]), applyPoint(magazinePlaced, [maxX, maxY, 0])];
      const receiverPlaced = report.resolved.placed.get('receiver')!;
      const [wellRear, wellFront] = RECEIVER_SECTION.ak.magazineWellX.map(
        (x) => applyPoint(receiverPlaced, [x, 0, 0])[0],
      );
      for (const [x] of topFace) {
        expect(x, variant).toBeGreaterThanOrEqual(wellRear! - 1e-9);
        expect(x, variant).toBeLessThanOrEqual(wellFront! + 1e-9);
      }
    }
  });

  // The AKM row moved to the golden-photo overlay in g41-4; see docs/deferred-assertions.md.
  it('fits the AK-74 magazine silhouette ratios to its measured reference image', () => {
    const references = {
      '3': { bend: 33.5, straight: 0.23, lengthDepth: 3.01, offsetDepth: 0.84 },
    } as const;
    for (const count of ['3'] as const) {
      const { solids } = FAMILIES.magazine!.build({ length: 'L', profile: 'ak-curved', variant: 'ak74' });
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

  it('keeps every magazine variant available for curated AK designs', () => {
    const offered = ak.slots.find(({ id }) => id === 'magazine')?.params?.variant;
    expect(Array.isArray(offered) ? [...offered].sort() : offered).toEqual(
      [...FAMILIES.magazine!.params.variant!.values].sort(),
    );
  });

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
      expect(displaySolids?.length).toBeGreaterThan(0);
      expect(facts.valid.every(Boolean)).toBe(true);
      const referenceWidth = facts.zBounds[0]![1] - facts.zBounds[0]![0];
      expect(facts.zBounds.every(([min, max]) => max > min && Math.abs(max - min - referenceWidth) < 1e-8)).toBe(true);
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

  it('face-seats every AK magazine variant at a flat lower surface with its rock-in sweep starting at the front hook', () => {
    const lower = FAMILIES.lower!.build({ layout: 'ak' });
    const lowerPort = lower.ports.find(({ id }) => id === 'magazine')!;
    expect(lower.solids.length).toBeGreaterThan(0);
    const sweep = lower.keepOuts.find(({ id }) => id === 'magazine-rock-in-sweep')!;
    const sweepMinX = sweep.box.center[0] - sweep.box.half[0];
    const sweepMaxX = sweep.box.center[0] + sweep.box.half[0];
    expect(sweepMaxX).toBeGreaterThan(sweepMinX);
    const variants = FAMILIES.magazine!.params.variant!.values;
    expect(variants.length).toBeGreaterThan(1);
    for (const variant of variants) {
      const magazine = FAMILIES.magazine!.build({ length: 'L', profile: 'ak-curved', variant });
      const topPort = magazine.ports.find(({ id }) => id === 'top')!;
      expect((topPort as GunPortDef).seat, variant).toBe('face');
      expect(topPort.pos[1], variant).toBe(0);
      const upper = magazine.solids[0]!;
      expect(upper.kind, variant).toBe('extruded-polygon');
      if (upper.kind !== 'extruded-polygon') {
        throw new Error(`Expected the ${variant} magazine feed-lip prism.`);
      }
      expect(Math.max(...upper.profile.map(([, y]) => y)), variant).toBeCloseTo(topPort.pos[1], 8);
      const magazineX = upper.profile.map(([x]) => x);
      const magazineDepth = Math.max(...magazineX) - Math.min(...magazineX);
      expect(sweepMinX, variant).toBeCloseTo(lowerPort.pos[0] + magazineDepth / 2, 8);
    }
  });

  it('adds an intermediate dropped stock distinct from straight and sporting styles', () => {
    const dropped = FAMILIES.stock!.build({ length: 'M', style: 'dropped' });
    const straight = FAMILIES.stock!.build({ length: 'M', style: 'straight' });
    expect(dropped.solids.some(({ kind }) => kind === 'box')).toBe(true);
    expect(dropped.solids).not.toEqual(straight.solids);
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
  it('takes a standard handguard on the AK receiver: the gas-cylinder port sits on the cylinder axis in both layouts', () => {
    const standard = variantOf('archetype-ak', (a) => {
      a.parts.handguard!.params = { layout: 'standard' };
    });
    expect(validate(standard, gunDomain).issues).toEqual([]);
    expect(validate(loadFixture('ak-standard-handguard'), gunDomain).issues).toEqual([]);
    const receiverPort = FAMILIES['ak-receiver']!.build({ bore: 'S' }).ports.find(({ id }) => id === 'gas-cylinder')!;
    for (const layout of ['ak', 'standard']) {
      const port = FAMILIES.handguard!.build({ layout }).ports.find(({ id }) => id === 'gas-cylinder')!;
      expect(port.pos[1]).toBe(receiverPort.pos[1]);
    }
  });

  // Mount is not a slot choice, so it stays clamped; no seed is pinned to a layout.
  sweepGroup('offers both clamped AK handguard layouts without selecting free-float', () => {
    it('passes', () => {
      const offered = ak.slots.find(({ id }) => id === 'handguard')?.params?.layout;
      const wanted = new Set(Array.isArray(offered) ? offered : [offered]);
      expect(wanted).toEqual(new Set(['ak', 'standard']));
      const layouts = new Set<string>();
      for (let seed = 0; seed < SEED_SCAN_BOUND && layouts.size < wanted.size; seed += 1) {
        const params = generate(ak, gunDomain, seed).parts.handguard!.params ?? {};
        layouts.add(String(params.layout));
        expect(params.mount ?? 'clamped', `seed ${seed}`).toBe('clamped');
      }
      expect(layouts).toEqual(wanted);
    });
  });
});
