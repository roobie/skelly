import { describe, expect, it } from 'vitest';
import { penetrationWorld, worldSolid } from '../src/core/geometry.ts';
import { applyPoint, compose, translation, type Vec3 } from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly, Box, Solid } from '../src/core/schema.ts';
import { gunDomain } from '../src/gun/domain.ts';
import {
  BOLT_CARRIER_ENVELOPES,
  BOLT_CARRIER_RUNNING_CLEARANCE_U,
  EJECTION_PORT_RULES,
  FAMILIES,
  RECEIVER_SECTION,
} from '../src/gun/parts.ts';
import { loadCorpus } from './helpers.ts';

const corners = (solid: Solid): Vec3[] => {
  if (solid.kind === 'box') {
    const { center, half } = solid.box as Box;
    return [-1, 1].flatMap((x) =>
      [-1, 1].flatMap((y) =>
        [-1, 1].map((z) => [center[0] + x * half[0], center[1] + y * half[1], center[2] + z * half[2]] as const),
      ),
    );
  }
  return solid.profile.flatMap((point) =>
    [solid.z[0], solid.z[1]].map((along) =>
      solid.axis === 'x' ? ([along, point[0], point[1]] as const) : ([point[0], point[1], along] as const),
    ),
  );
};

const limits = (points: readonly Vec3[]) =>
  [0, 1, 2].map((axis) => [
    Math.min(...points.map((point) => point[axis]!)),
    Math.max(...points.map((point) => point[axis]!)),
  ]);

const travelCases = [
  {
    pattern: 'ar',
    action: 'auto',
    feed: 'box',
    bore: 'M',
    section: 'ar',
    travel: 6.5,
    mm: 74.75,
    cavityY: [-0.6, 1.1],
    cavityZ: [-1.35, 1.35],
    portWidthU: 4,
    portHeightU: 2.5,
  },
  {
    pattern: 'ak',
    action: 'bolt',
    feed: 'box',
    bore: 'M',
    section: 'ak',
    travel: 6.5,
    mm: 74.75,
    cavityY: [-1.35, 1.35],
    cavityZ: [-1.35, 1.35],
    portWidthU: 8.25,
    portHeightU: 4,
  },
  {
    pattern: 'pump',
    action: 'pump',
    feed: 'tube',
    bore: 'L',
    section: 'pump',
    travel: 5.5,
    mm: 63.25,
    cavityY: [-0.85, 0.85],
    cavityZ: [-0.85, 0.85],
    portWidthU: 7,
    portHeightU: 2,
  },
  {
    pattern: 'smg',
    action: 'auto',
    feed: 'box',
    bore: 'S',
    section: 'standard',
    travel: 3,
    mm: 34.5,
    cavityY: [0.65, 1.85],
    cavityZ: [-0.85, 0.85],
    portWidthU: 4,
    portHeightU: 2,
  },
  {
    pattern: 'barrett',
    action: 'bolt',
    feed: 'box',
    bore: 'L',
    section: 'standard',
    travel: 8,
    mm: 92,
    cavityY: [0.15, 1.85],
    cavityZ: [-1.35, 1.35],
    portWidthU: 7,
    portHeightU: 2.5,
  },
  {
    pattern: 'bolt',
    action: 'bolt',
    feed: 'top',
    bore: 'M',
    section: 'standard',
    travel: 7,
    mm: 80.5,
    cavityY: [0.65, 1.6],
    cavityZ: [-0.85, 0.85],
    portWidthU: 6,
    portHeightU: 1.75,
  },
] as const;

const assemblyFor = (entry: (typeof travelCases)[number]): Assembly => ({
  name: `bolt-carrier-${entry.pattern}`,
  root: 'receiver',
  parts: {
    receiver: {
      family: entry.pattern === 'ak' ? 'ak-receiver' : 'receiver',
      params:
        entry.pattern === 'ak'
          ? { bore: entry.bore }
          : { action: entry.action, feed: entry.feed, bore: entry.bore, section: entry.section },
    },
    'bolt-carrier': { family: 'bolt-carrier', params: { pattern: entry.pattern } },
  },
  connections: [{ from: 'receiver.bolt-carrier', to: 'bolt-carrier.mount' }],
});

type TravelCase = (typeof travelCases)[number];

const travelMeasurements = (resolved: ReturnType<typeof resolve>) => {
  const path = resolved.defs.get('receiver')!.keepOuts.find(({ id }) => id === 'bolt-travel')!;
  const motion = resolved.defs.get('bolt-carrier')!.motion!;
  const transform = resolved.placed.get('bolt-carrier')!;
  const restOrigin = applyPoint(transform, [0, 0, 0]);
  const rearOrigin = applyPoint(transform, motion.rearmost);
  return {
    pathLength: path.box.half[0] * 2,
    motionLength: motion.rearmost[0],
    restOrigin,
    rearOrigin,
    distance: Math.hypot(...(rearOrigin.map((value, i) => value - restOrigin[i]!) as [number, number, number])),
  };
};

const coreFitsCavity = (entry: TravelCase, resolved: ReturnType<typeof resolve>): boolean => {
  const receiver = resolved.defs.get('receiver')!;
  const carrier = resolved.defs.get('bolt-carrier')!;
  const path = receiver.keepOuts.find(({ id }) => id === 'bolt-travel')!;
  const transform = resolved.placed.get('bolt-carrier')!;
  const motion = carrier.motion!;
  const bounds = limits(receiver.solids.flatMap(corners));
  const cavityX = [bounds[0]![0]! + 0.5, bounds[0]![1]! - 0.5];
  const pathCenter = path.box.center;

  const pathFits =
    pathCenter[1] - path.box.half[1] >= entry.cavityY[0] &&
    pathCenter[1] + path.box.half[1] <= entry.cavityY[1] &&
    pathCenter[2] - path.box.half[2] >= entry.cavityZ[0] &&
    pathCenter[2] + path.box.half[2] <= entry.cavityZ[1];
  const body = carrier.solids.find(({ id }) => id === 'carrier-body')!;
  const bodyFits = corners(body)
    .flatMap((corner) => [
      applyPoint(transform, corner),
      applyPoint(transform, [corner[0] + motion.rearmost[0], corner[1], corner[2]]),
    ])
    .every(
      (point) =>
        point[0] >= cavityX[0]! - 1e-6 &&
        point[0] <= cavityX[1]! + 1e-6 &&
        point[1] >= entry.cavityY[0] - 1e-6 &&
        point[1] <= entry.cavityY[1] + 1e-6 &&
        point[2] >= entry.cavityZ[0] - 1e-6 &&
        point[2] <= entry.cavityZ[1] + 1e-6,
    );
  return pathFits && bodyFits;
};

const worldBounds = (points: readonly Vec3[]) =>
  [0, 1, 2].map((axis) => [
    Math.min(...points.map((point) => point[axis]!)),
    Math.max(...points.map((point) => point[axis]!)),
  ]);

const noCarrierReceiverIntersectionsOverTravel = (resolved: ReturnType<typeof resolve>): boolean => {
  const receiver = resolved.defs.get('receiver')!;
  const carrier = resolved.defs.get('bolt-carrier')!;
  const receiverTransform = resolved.placed.get('receiver')!;
  const carrierTransform = resolved.placed.get('bolt-carrier')!;
  const motion = carrier.motion!;
  const receiverSolids = receiver.solids.map((solid) => worldSolid(receiverTransform, solid));
  const samples = Math.ceil(motion.rearmost[0] / 0.25);
  for (let sample = 0; sample <= samples; sample++) {
    const progress = motion.rearmost[0] * (sample / samples);
    const transform = compose(carrierTransform, translation([progress, 0, 0]));
    for (const solid of carrier.solids) {
      const moved = worldSolid(transform, solid);
      const overlaps = receiver.solids
        .map((obstacle, index) => ({ obstacle, depth: penetrationWorld(moved, receiverSolids[index]!) }))
        .filter(({ depth }) => depth > 1e-6);
      if (overlaps.length > 0) {
        return false;
      }
    }
  }
  return true;
};

const allCarrierSolidsStayWithinReceiverLength = (resolved: ReturnType<typeof resolve>): boolean => {
  const receiver = resolved.defs.get('receiver')!;
  const carrier = resolved.defs.get('bolt-carrier')!;
  const transform = resolved.placed.get('bolt-carrier')!;
  const motion = carrier.motion!;
  const bounds = limits(receiver.solids.flatMap(corners));
  const cavityX = [bounds[0]![0]! + 0.5, bounds[0]![1]! - 0.5];

  return carrier.solids
    .flatMap((solid) =>
      corners(solid).flatMap((corner) => [
        applyPoint(transform, corner),
        applyPoint(transform, [corner[0] + motion.rearmost[0], corner[1], corner[2]]),
      ]),
    )
    .every((point) => point[0] >= cavityX[0]! - 1e-6 && point[0] <= cavityX[1]! + 1e-6);
};

const crossSectionGaps = (entry: TravelCase, resolved: ReturnType<typeof resolve>) => {
  const carrier = resolved.defs.get('bolt-carrier')!;
  const transform = resolved.placed.get('bolt-carrier')!;
  const body = carrier.solids.find(({ id }) => id === 'carrier-body')!;
  const bodyBounds = worldBounds(corners(body).map((point) => applyPoint(transform, point)));
  return [entry.cavityY, entry.cavityZ].map((cavity, axis) => {
    const worldAxis = axis + 1;
    return {
      lower: bodyBounds[worldAxis]![0]! - cavity[0],
      upper: cavity[1] - bodyBounds[worldAxis]![1]!,
      axis: worldAxis,
    };
  });
};

const portMeasurements = (entry: TravelCase, resolved: ReturnType<typeof resolve>) => {
  const receiver = resolved.defs.get('receiver')!;
  const ejection = receiver.keepOuts.find(({ id }) => id === 'ejection')!;
  const envelope = BOLT_CARRIER_ENVELOPES[entry.pattern];
  const rule = EJECTION_PORT_RULES[entry.pattern];
  const bounds = [0, 1, 2].map((axis) => [
    ejection.box.center[axis]! - ejection.box.half[axis]!,
    ejection.box.center[axis]! + ejection.box.half[axis]!,
  ]);
  const receiverPort = receiver.ports.find(({ id }) => id === 'bolt-carrier')!;
  const portX = bounds[0]!;
  const portY = bounds[1]!;
  const forwardOffsetU = 'forwardOffsetU' in rule ? rule.forwardOffsetU : 0;
  const faceMarginYU = 'faceMarginYU' in rule ? rule.faceMarginYU : rule.faceMarginU;
  let expectedXMin = receiverPort.pos[0] + envelope.x[0] - rule.faceMarginU + forwardOffsetU;
  let expectedXMax = receiverPort.pos[0] + envelope.x[1] + rule.faceMarginU + forwardOffsetU;
  const cartridge = 'cartridge' in rule ? rule.cartridge : undefined;
  const cartridgeMinimum = cartridge ? cartridge.lengthU + 2 * cartridge.endClearanceU : 0;
  if ('lengthRule' in rule) {
    const handle = resolved.defs.get('bolt-carrier')!.solids.find(({ id }) => id === 'charging-handle')!;
    const handleX = limits(corners(handle))[0]!;
    const handleWidthX = handleX[1]! - handleX[0]!;
    const requiredLength = entry.travel + handleWidthX + BOLT_CARRIER_RUNNING_CLEARANCE_U;
    const roundedLength = Math.ceil((requiredLength - 1e-9) / 0.25) * 0.25;
    expectedXMin = expectedXMax - roundedLength;
  }
  if (expectedXMax - expectedXMin < cartridgeMinimum) {
    const center = (expectedXMin + expectedXMax) / 2;
    expectedXMin = Math.floor((center - cartridgeMinimum / 2) / 0.25) * 0.25;
    expectedXMax = Math.ceil((center + cartridgeMinimum / 2) / 0.25) * 0.25;
  }
  const expectedY = [
    receiverPort.pos[1] + envelope.y[0] - faceMarginYU,
    receiverPort.pos[1] + envelope.y[1] + faceMarginYU,
  ];
  const outline = entry.section === 'standard' ? undefined : RECEIVER_SECTION[entry.section].outline;
  const rearDrop = entry.section === 'pump' ? 1 : 0;
  const wallY = outline
    ? [Math.min(...outline.map(([y]) => y)) - rearDrop, Math.max(...outline.map(([y]) => y)) - rearDrop]
    : [-2.5, 2.5];
  return {
    actualX: bounds[0],
    expectedX: [expectedXMin, expectedXMax],
    width: portX[1]! - portX[0]!,
    actualY: bounds[1],
    expectedY,
    height: portY[1]! - portY[0]!,
    lowerRim: portY[0]! - wallY[0]!,
    upperRim: wallY[1]! - portY[1]!,
  };
};

describe('procedural bolt carrier', () => {
  it('uses separate pattern-specific parts for AR, AK, and pump while inheriting action and bore', () => {
    const expected = new Map([
      ['design archetype-ar.json', { pattern: 'ar', travel: 6.5 }],
      ['design archetype-ar-free-float.json', { pattern: 'ar', travel: 6.5 }],
      ['design archetype-ak.json', { pattern: 'ak', travel: 6.5 }],
      ['design archetype-pump-shotgun.json', { pattern: 'pump', travel: 5.5 }],
    ]);
    for (const { label, assembly } of loadCorpus()) {
      const expectedPart = expected.get(label);
      if (!expectedPart) {
        continue;
      }
      const resolved = resolve(assembly, gunDomain);
      const params = resolved.params.get('bolt-carrier')!;
      expect(params.pattern?.value, label).toBe(expectedPart.pattern);
      expect(params.action?.source, label).toBe('inherited');
      expect(params.bore?.source, label).toBe('inherited');
      expect(
        resolved.defs.get('receiver')?.solids.some(({ id }) => id === 'bolt-carrier-face'),
        label,
      ).toBe(false);
      expect(resolved.defs.get('bolt-carrier')?.motion, label).toMatchObject({
        kind: 'linear',
        axis: [1, 0, 0],
        rest: [0, 0, 0],
        rearmost: [expectedPart.travel, 0, 0],
      });
    }
  });

  it('derives per-pattern travel from the receiver keep-out, moves rearward in world space, and clears the cavity', () => {
    for (const entry of travelCases) {
      const resolved = resolve(assemblyFor(entry), gunDomain);
      const measurement = travelMeasurements(resolved);
      expect(measurement.pathLength, entry.pattern).toBe(entry.travel);
      expect(measurement.motionLength, entry.pattern).toBe(measurement.pathLength);
      expect(measurement.rearOrigin[0], entry.pattern).toBeLessThan(measurement.restOrigin[0]);
      expect(measurement.rearOrigin[1], entry.pattern).toBeCloseTo(measurement.restOrigin[1], 6);
      expect(measurement.rearOrigin[2], entry.pattern).toBeCloseTo(measurement.restOrigin[2], 6);
      expect(measurement.distance, entry.pattern).toBeCloseTo(entry.travel, 6);
      expect(entry.travel * 11.5, `${entry.pattern} mm`).toBeCloseTo(entry.mm, 8);
      expect(coreFitsCavity(entry, resolved), `${entry.pattern} carrier body clearance`).toBe(true);
      expect(allCarrierSolidsStayWithinReceiverLength(resolved), `${entry.pattern} full axial travel`).toBe(true);
      expect(noCarrierReceiverIntersectionsOverTravel(resolved), `${entry.pattern} collision-free travel`).toBe(true);
      for (const gap of crossSectionGaps(entry, resolved)) {
        expect(gap.lower, `${entry.pattern} lower gap ${gap.axis}`).toBeCloseTo(BOLT_CARRIER_RUNNING_CLEARANCE_U, 6);
        expect(gap.upper, `${entry.pattern} upper gap ${gap.axis}`).toBeCloseTo(BOLT_CARRIER_RUNNING_CLEARANCE_U, 6);
      }
      const port = portMeasurements(entry, resolved);
      expect(port.actualX).toEqual(port.expectedX);
      expect(port.width).toBe(entry.portWidthU);
      expect(port.actualY).toEqual(port.expectedY);
      expect(port.height).toBe(entry.portHeightU);
      expect(port.lowerRim).toBeGreaterThanOrEqual(0.25);
      expect(port.upperRim).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('derives the AK port length from full travel, handle width, and clearance', () => {
    const entry = travelCases.find(({ pattern }) => pattern === 'ak')!;
    const resolved = resolve(assemblyFor(entry), gunDomain);
    const receiver = resolved.defs.get('receiver')!;
    const carrier = resolved.defs.get('bolt-carrier')!;
    const port = portMeasurements(entry, resolved);
    const transform = resolved.placed.get('bolt-carrier')!;
    const handle = carrier.solids.find(({ id }) => id === 'charging-handle')!;
    const handleBounds = worldBounds(corners(handle).map((point) => applyPoint(transform, point)));
    const motion = carrier.motion!;
    const rearTransform = compose(transform, translation(motion.rearmost));
    const rearHandleBounds = worldBounds(corners(handle).map((point) => applyPoint(rearTransform, point)));
    const portMin = port.actualX![0]!;
    const portMax = port.actualX![1]!;

    expect([portMin, portMax]).toEqual([-12.25, -4]);
    expect(portMax).toBeCloseTo(-4, 8);
    expect(handleBounds[0]![1]).toBeCloseTo(portMax, 6);
    expect(handleBounds[0]![0]!).toBeGreaterThan(portMin);
    expect(rearHandleBounds[0]![0]! - portMin).toBeCloseTo(0.25, 8);
    expect(rearHandleBounds[0]![1]!).toBeLessThan(portMax);
    expect(port.width).toBe(8.25);
    expect(port.width * 11.5).toBeCloseTo(94.875, 8);
    expect(port.height * 11.5).toBe(46);
    expect(receiver.keepOuts.find(({ id }) => id === 'ejection')?.box.half[0]).toBe(4.125);
  });

  it('grows the AK carrier to a 2.5u × 2.5u cross-section with 0.1u clearance', () => {
    const { ak } = BOLT_CARRIER_ENVELOPES;
    const height = ak.y[1] - ak.y[0];
    const width = ak.z[1] - ak.z[0];
    expect([height, width]).toEqual([2.5, 2.5]);
    expect([height * 11.5, width * 11.5]).toEqual([28.75, 28.75]);
    expect(BOLT_CARRIER_RUNNING_CLEARANCE_U * 11.5).toBeCloseTo(1.15, 8);
    const carrier = FAMILIES['bolt-carrier']!.build({ pattern: 'ak', bore: 'M', action: 'bolt' });
    const body = carrier.solids.find(({ id }) => id === 'carrier-body')!;
    if (body.kind !== 'box') {
      throw new Error('AK carrier body must remain a box solid.');
    }
    expect(body.box.half).toEqual([1.5, 1.25, 1.25]);
  });

  it('uses named family port rules, cartridge minimums, and unchanged pistol apertures', () => {
    expect(
      Object.fromEntries(Object.entries(EJECTION_PORT_RULES).map(([family, { faceMarginU }]) => [family, faceMarginU])),
    ).toEqual({ ar: 0.5, ak: 1, pump: 0.25, smg: 0.5, barrett: 0.5, bolt: 0.5 });
    expect(EJECTION_PORT_RULES.pump.cartridge).toEqual({ lengthU: 6.25, endClearanceU: 0.25 });
    expect(Object.values(EJECTION_PORT_RULES).every(({ reason }) => reason.length > 20)).toBe(true);

    const slide = FAMILIES.slide!.build({ bore: 'M', length: 'M' });
    const portPoints = slide.solids.filter(({ id }) => id.startsWith('ejection-port-')).flatMap(corners);
    const portBounds = limits(portPoints);
    expect(portBounds[0]).toEqual([-8, 0]);
    expect(portBounds[1]).toEqual([0.5, 2.5]);
  });

  it('makes each family style produce the expected procedural features', () => {
    const build = (pattern: string) => FAMILIES['bolt-carrier']!.build({ pattern, bore: 'L', action: 'auto' });
    expect(build('ar').solids.map(({ id }) => id)).toEqual(['carrier-body', 'bolt-head', 'gas-key']);
    expect(build('ak').solids.map(({ id }) => id)).toContain('piston');
    const pump = build('pump');
    expect(pump.solids.map(({ id }) => id)).toContain('action-bar-left');
    const pumpBody = pump.solids.find(({ id }) => id === 'carrier-body');
    expect(pumpBody?.kind).toBe('box');
    if (pumpBody?.kind === 'box') {
      expect(pumpBody.box.half).toEqual([2.75, 0.75, 0.75]);
    }
    expect(build('smg').solids.map(({ id }) => id)).toContain('carrier-body');
    expect(build('barrett').solids.map(({ id }) => id)).toContain('heavy-carrier');
    expect(build('bolt').solids.map(({ id }) => id)).toContain('bolt-handle');
  });
});
