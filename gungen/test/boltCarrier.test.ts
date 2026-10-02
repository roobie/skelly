// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: Geometry contract tests intentionally assert linked dimensions, motion paths, and clearances together.
import { describe, expect, it } from 'vitest';
import { distanceWorld, penetrationWorld, worldSolid } from '../src/core/geometry.ts';
import { applyPoint, compose, extrusionPoint, IDENTITY, translation, type Vec3 } from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly, Box, Solid } from '../src/core/schema.ts';
import { gunDomain } from '../src/gun/domain.ts';
import {
  akChargingHandleSlotWindow,
  BOLT_CARRIER_ENVELOPES,
  BOLT_CARRIER_RUNNING_CLEARANCE_U,
  CARRIER_HANDLE_STYLES,
  carrierCavityBounds,
  EJECTION_PORT_MARGIN_U,
  EJECTION_PORT_RULES,
  FAMILIES,
  RECEIVER_SECTION,
} from '../src/gun/parts.ts';
import { buildReceiverSection } from '../src/gun/receiverSection.ts';
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
  if (solid.kind === 'revolved') {
    throw new Error('gun designs have no revolved solids');
  }
  return solid.profile.flatMap((point) =>
    [solid.z[0], solid.z[1]].map((along) => extrusionPoint(solid.axis, point, along)),
  );
};

const limits = (points: readonly Vec3[]) =>
  [0, 1, 2].map((axis) => [
    Math.min(...points.map((point) => point[axis]!)),
    Math.max(...points.map((point) => point[axis]!)),
  ]);

const polygonCentroid = (profile: readonly (readonly [number, number])[]) => {
  const edges = profile.map((point, index) => [point, profile[(index + 1) % profile.length]!] as const);
  const areaTwice = edges.reduce((sum, [a, b]) => sum + a[0] * b[1] - b[0] * a[1], 0);
  const [centroidX, centroidY] = edges.reduce(
    ([x, y], [a, b]) => {
      const cross = a[0] * b[1] - b[0] * a[1];
      return [x + (a[0] + b[0]) * cross, y + (a[1] + b[1]) * cross];
    },
    [0, 0],
  );
  return [centroidX / (3 * areaTwice), centroidY / (3 * areaTwice)];
};

const containsConvexPoint = (profile: readonly (readonly [number, number])[], point: readonly [number, number]) =>
  profile.every((start, index) => {
    const end = profile[(index + 1) % profile.length]!;
    return (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]) >= -1e-9;
  });

const HANDLE_ID_REGEX = /handle/i;
const HANDLE_OR_COCKING_TUBE_ID_REGEX = /handle|cocking-tube/;

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
    portWidthU: 4.5,
    portHeightU: 2,
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
    portWidthU: 6.5,
    portHeightU: 3,
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
    portWidthU: 6.75,
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
    portWidthU: 3.5,
    portHeightU: 1.5,
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
    portWidthU: 6.5,
    portHeightU: 2,
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
    portWidthU: 5.5,
    portHeightU: 1.25,
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
  const rearOrigin = applyPoint(transform, motion.end);
  return {
    pathLength: path.box.half[0] * 2,
    motionLength: motion.end[0],
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
      applyPoint(transform, [corner[0] + motion.end[0], corner[1], corner[2]]),
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

const receiverSectionHasMaterialAt = (solids: readonly Solid[], x: number, y: number, z: number): boolean => {
  const probe = worldSolid(IDENTITY, {
    id: 'section-probe',
    kind: 'box',
    box: { center: [x, y, z], half: [0.01, 0.01, 0.01] },
  });
  return solids.some((solid) => penetrationWorld(worldSolid(IDENTITY, solid), probe) > 0);
};

const akSlotWitness = (entry: TravelCase, resolved: ReturnType<typeof resolve>) => {
  const receiver = resolved.defs.get('receiver')!;
  const ejection = receiver.keepOuts.find(({ id }) => id === 'ejection')!.box;
  const [centerX, centerY] = ejection.center;
  const [halfX, halfY] = ejection.half;
  const port = {
    x: [centerX - halfX, centerX + halfX] as const,
    y: [centerY - halfY, centerY + halfY] as const,
  };
  const [, carrierY] = receiver.ports.find(({ id }) => id === 'bolt-carrier')!.pos;
  const slot = akChargingHandleSlotWindow(carrierY, port, entry.travel);
  return [(slot.x[0] + Math.min(slot.x[1], port.x[0])) / 2, (slot.section[0] + slot.section[1]) / 2, 1.6] as const;
};

const noCarrierReceiverIntersectionsOverTravel = (resolved: ReturnType<typeof resolve>): boolean => {
  const receiver = resolved.defs.get('receiver')!;
  const carrier = resolved.defs.get('bolt-carrier')!;
  const receiverTransform = resolved.placed.get('receiver')!;
  const carrierTransform = resolved.placed.get('bolt-carrier')!;
  const motion = carrier.motion!;
  const receiverSolids = receiver.solids.map((solid) => worldSolid(receiverTransform, solid));
  const samples = Math.ceil(motion.end[0] / 0.25);
  for (let sample = 0; sample <= samples; sample++) {
    const progress = motion.end[0] * (sample / samples);
    const transform = compose(carrierTransform, translation([progress, 0, 0]));
    for (const solid of carrier.solids.filter(({ id }) => !id.startsWith('action-bar-') && id !== 'bolt-handle-seat')) {
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
    .filter(({ id }) => !id.startsWith('action-bar-') && !HANDLE_ID_REGEX.test(id))
    .flatMap((solid) =>
      corners(solid).flatMap((corner) => [
        applyPoint(transform, corner),
        applyPoint(transform, [corner[0] + motion.end[0], corner[1], corner[2]]),
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
  const transform = resolved.placed.get('bolt-carrier')!;
  const carrierBounds = worldBounds(
    envelope.x.flatMap((x) => envelope.y.flatMap((y) => envelope.z.map((z) => applyPoint(transform, [x, y, z])))),
  );
  const bounds = [0, 1, 2].map((axis) => [
    ejection.box.center[axis]! - ejection.box.half[axis]!,
    ejection.box.center[axis]! + ejection.box.half[axis]!,
  ]);
  const receiverPort = receiver.ports.find(({ id }) => id === 'bolt-carrier')!;
  const portX = bounds[0]!;
  const portY = bounds[1]!;
  const margin = EJECTION_PORT_MARGIN_U;
  let expectedXMin = receiverPort.pos[0] - envelope.x[1] - margin;
  let expectedXMax = receiverPort.pos[0] - envelope.x[0] + margin;
  const pumpMinimum =
    entry.pattern === 'pump'
      ? EJECTION_PORT_RULES.pumpShellMinimum.lengthU + 2 * EJECTION_PORT_RULES.pumpShellMinimum.endClearanceU
      : 0;
  if (expectedXMax - expectedXMin < pumpMinimum) {
    const center = (expectedXMin + expectedXMax) / 2;
    expectedXMin = center - pumpMinimum / 2;
    expectedXMax = center + pumpMinimum / 2;
  }
  const expectedY = [receiverPort.pos[1] + envelope.y[0] - margin, receiverPort.pos[1] + envelope.y[1] + margin];
  const outline = entry.section === 'standard' ? undefined : RECEIVER_SECTION[entry.section].outline;
  const rearDrop = entry.section === 'pump' ? 1 : 0;
  const wallY = outline
    ? [Math.min(...outline.map(([y]) => y)) - rearDrop, Math.max(...outline.map(([y]) => y)) - rearDrop]
    : [-2.5, 2.5];
  return {
    actualX: bounds[0],
    expectedX: [expectedXMin, expectedXMax],
    carrierX: carrierBounds[0],
    carrierY: carrierBounds[1],
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
        start: [0, 0, 0],
        end: [expectedPart.travel, 0, 0],
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
      if (entry.pattern === 'pump') {
        expect(port.width).toBeGreaterThanOrEqual(
          EJECTION_PORT_RULES.pumpShellMinimum.lengthU + 2 * EJECTION_PORT_RULES.pumpShellMinimum.endClearanceU,
        );
      } else {
        expect(port.actualX, `${entry.pattern} carrier face + margin`).toEqual([
          port.carrierX![0]! - EJECTION_PORT_MARGIN_U,
          port.carrierX![1]! + EJECTION_PORT_MARGIN_U,
        ]);
      }
      expect(port.actualX).toEqual(port.expectedX);
      expect(port.width).toBe(entry.portWidthU);
      expect(port.actualY, `${entry.pattern} carrier height + margin`).toEqual([
        port.carrierY![0]! - EJECTION_PORT_MARGIN_U,
        port.carrierY![1]! + EJECTION_PORT_MARGIN_U,
      ]);
      expect(port.actualY).toEqual(port.expectedY);
      expect(port.height).toBe(entry.portHeightU);
      expect(port.lowerRim).toBeGreaterThanOrEqual(0.25);
      expect(port.upperRim).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('moves the AK charging handle front-low and merges its slot with the ejection opening', () => {
    const entry = travelCases.find(({ pattern }) => pattern === 'ak')!;
    const resolved = resolve(assemblyFor(entry), gunDomain);
    const receiver = resolved.defs.get('receiver')!;
    const carrier = resolved.defs.get('bolt-carrier')!;
    const port = portMeasurements(entry, resolved);
    const transform = resolved.placed.get('bolt-carrier')!;
    const handle = carrier.solids.find(({ id }) => id === 'charging-handle')!;
    const akHandles = carrier.solids.filter(({ id }) => id === 'charging-handle' || id === 'ak-handle-stick');
    const body = carrier.solids.find(({ id }) => id === 'carrier-body')!;
    const piston = carrier.solids.find(({ id }) => id === 'piston')!;
    const bodyBounds = worldBounds(corners(body).map((point) => applyPoint(transform, point)));
    const handleBounds = worldBounds(corners(handle).map((point) => applyPoint(transform, point)));
    const stick = akHandles.find(({ id }) => id === 'ak-handle-stick')!;
    const stickBounds = worldBounds(corners(stick).map((point) => applyPoint(transform, point)));
    const localBodyBounds = limits(corners(body));
    const localStickBounds = limits(corners(stick));
    const paddleBounds = worldBounds(corners(handle).map((point) => applyPoint(transform, point)));
    const pistonBounds = worldBounds(corners(piston).map((point) => applyPoint(transform, point)));
    const motion = carrier.motion!;
    const rearTransform = compose(transform, translation(motion.end));
    const rearHandleBounds = worldBounds(corners(handle).map((point) => applyPoint(rearTransform, point)));
    const portMin = port.actualX![0]!;
    const portMax = port.actualX![1]!;
    const [, receiverSideFace] = RECEIVER_SECTION.ak.faces.handleSides;

    expect(bodyBounds[0]).toEqual([-7.25, -1.25]);
    expect(bodyBounds[0]![0]).toBeCloseTo(-7.25, 2);
    expect(bodyBounds[0]![1]! - bodyBounds[0]![0]!).toBeGreaterThanOrEqual(5.75);
    expect(bodyBounds[0]![1]! - bodyBounds[0]![0]!).toBeLessThanOrEqual(6.25);
    const [barrelMountX] = receiver.ports.find(({ id }) => id === 'barrel')!.pos;
    expect(barrelMountX - bodyBounds[0]![1]!).toBeCloseTo(1.25, 8);
    expect([portMin, portMax]).toEqual([-7.5, -1]);
    expect(portMax).toBeCloseTo(-1, 8);
    expect(handle.kind).toBe('extruded-polygon');
    expect(akHandles).toHaveLength(2);
    expect(akHandles.every(({ kind, slot }) => kind === 'extruded-polygon' && slot === 'metal')).toBe(true);
    expect((paddleBounds[0]![0]! + paddleBounds[0]![1]!) / 2).toBeCloseTo(
      (stickBounds[0]![0]! + stickBounds[0]![1]!) / 2,
      8,
    );
    expect(paddleBounds[0]![1]! - paddleBounds[0]![0]!).toBeCloseTo(1, 8);
    expect(paddleBounds[1]).toEqual([-1.25, -0.25]);
    expect(paddleBounds[2]![0]).toBeCloseTo(3.75, 8);
    expect(paddleBounds[2]![1]).toBeCloseTo(4.25, 8);
    expect(paddleBounds[2]![1]! - receiverSideFace!).toBeGreaterThanOrEqual(2.25);
    expect(localStickBounds[0]![0]).toBe(localBodyBounds[0]![0]);
    expect(localStickBounds[1]![0]).toBe(localBodyBounds[1]![0]);
    const rootY = localStickBounds[1]![0]!;
    expect(localStickBounds[0]![0]).toBeCloseTo(BOLT_CARRIER_ENVELOPES.ak.x[0], 8);
    expect(rootY).toBeCloseTo(BOLT_CARRIER_ENVELOPES.ak.y[0], 8);
    const lowerThirdTop = localBodyBounds[1]![0]! + (localBodyBounds[1]![1]! - localBodyBounds[1]![0]!) / 3;
    expect(rootY).toBe(localBodyBounds[1]![0]);
    expect(rootY).toBeLessThanOrEqual(lowerThirdTop);
    expect(pistonBounds[0]).toEqual([-5.5, -1]);
    expect(handleBounds[0]![0]!).toBeGreaterThanOrEqual(portMin - 1e-6);
    expect(handleBounds[0]![1]!).toBeLessThanOrEqual(portMax + 1e-6);
    const chargingSlot = akChargingHandleSlotWindow(0, { x: [portMin, portMax], y: [-1.5, 1.5] }, entry.travel);
    expect(chargingSlot.section).toEqual([-1.35, -0.15]);
    expect(chargingSlot.section[1] - chargingSlot.section[0]).toBeCloseTo(1 + 2 * BOLT_CARRIER_RUNNING_CLEARANCE_U, 8);
    expect(chargingSlot.x).toEqual([portMin - entry.travel, portMin + 0.25]);
    expect([Math.max(portMin, chargingSlot.x[0]), Math.min(portMax, chargingSlot.x[1])]).toEqual([-7.5, -7.25]);
    expect([Math.min(portMin, chargingSlot.x[0]), Math.max(portMax, chargingSlot.x[1])]).toEqual([-14, -1]);
    expect([
      Math.max(port.actualY![0]!, chargingSlot.section[0]),
      Math.min(port.actualY![1]!, chargingSlot.section[1]),
    ]).toEqual([-1.35, -0.15]);
    const outlineBottom = Math.min(...RECEIVER_SECTION.ak.outline.map(([y]) => y));
    for (let x = portMin - 1 + 0.125; x < portMax; x += 0.25) {
      expect(receiverSectionHasMaterialAt(receiver.solids, x, -0.75, 1.6), `merged opening at x=${x}`).toBe(false);
    }
    expect(receiverSectionHasMaterialAt(receiver.solids, portMax + 0.125, -0.75, 1.6)).toBe(true);
    for (let sample = 0; sample <= 26; sample++) {
      const progress = (entry.travel * sample) / 26;
      const movingTransform = compose(transform, translation([progress, 0, 0]));
      const movedHandle = worldBounds(corners(handle).map((point) => applyPoint(movingTransform, point)));
      expect(movedHandle[0]![0]!).toBeGreaterThanOrEqual(chargingSlot.x[0] - 1e-6);
      expect(movedHandle[0]![1]!).toBeLessThanOrEqual(portMax + 1e-6);
      expect(Math.min(port.actualY![0]!, chargingSlot.section[0]) - outlineBottom).toBeGreaterThanOrEqual(0.5);
    }
    expect(port.width).toBe(6.5);
    expect(port.width * 11.5).toBeCloseTo(74.75, 8);
    expect(port.height).toBe(3);
    expect(port.height * 11.5).toBeCloseTo(34.5, 8);
    expect(rearHandleBounds[0]![0]!).toBeGreaterThanOrEqual(portMin - entry.travel - 1e-6);
    expect(rearHandleBounds[0]![1]!).toBeLessThan(portMax);
    expect(receiver.keepOuts.find(({ id }) => id === 'ejection')?.box.half[0]).toBe(3.25);
  });

  it('centres the AK paddle on the stick axis and joins it flush as the outermost handle solid', () => {
    const carrier = FAMILIES['bolt-carrier']!.build({ pattern: 'ak', handleStyle: 'ak', action: 'bolt', bore: 'M' });
    const stick = carrier.solids.find(({ id }) => id === 'ak-handle-stick');
    const paddle = carrier.solids.find(({ id }) => id === 'charging-handle');
    expect(stick?.kind).toBe('extruded-polygon');
    expect(paddle?.kind).toBe('extruded-polygon');
    if (stick?.kind !== 'extruded-polygon' || paddle?.kind !== 'extruded-polygon') {
      throw new Error('AK stick and paddle must be extruded profiles.');
    }
    const stickAxis = polygonCentroid(stick.profile);
    const paddleAxis = polygonCentroid(paddle.profile);
    expect(Math.hypot(paddleAxis[0]! - stickAxis[0]!, paddleAxis[1]! - stickAxis[1]!)).toBeLessThanOrEqual(1e-6);
    expect(stick.profile.every((point) => containsConvexPoint(paddle.profile, point))).toBe(true);
    expect(paddle.clip?.length).toBeGreaterThan(0);
    expect(stick.z[0]).toBe(paddle.z[1]);
    expect(penetrationWorld(worldSolid(IDENTITY, stick), worldSolid(IDENTITY, paddle))).toBeCloseTo(0, 6);
    expect(paddle.z[0]).toBeLessThan(stick.z[0]);
    expect(carrier.solids.filter(({ id }) => HANDLE_ID_REGEX.test(id)).map(({ id }) => id)).toEqual([
      'ak-handle-stick',
      'charging-handle',
    ]);
  });

  it('places the deployed FAL handle on its moving carrier and clears a narrow side slot', () => {
    const { assembly } = loadCorpus().find(({ label }) => label === 'design archetype-battle-rifle.json')!;
    const resolved = resolve(assembly, gunDomain);
    const receiver = resolved.defs.get('receiver')!;
    const carrier = resolved.defs.get('bolt-carrier')!;
    const handguard = resolved.defs.get('handguard')!;
    const carrierTransform = resolved.placed.get('bolt-carrier')!;
    const receiverTransform = resolved.placed.get('receiver')!;
    const stem = carrier.solids.find(({ id }) => id === 'fal-handle-stem')!;
    const pivot = carrier.solids.find(({ id }) => id === 'fal-handle-pivot')!;
    const knob = carrier.solids.find(({ id }) => id === 'fal-handle-knob')!;
    const pivotBounds = worldBounds(corners(pivot).map((point) => applyPoint(carrierTransform, point)));
    const knobBounds = worldBounds(corners(knob).map((point) => applyPoint(carrierTransform, point)));
    const sweep = carrier.keepOuts.find(({ id }) => id === 'battle-handle-sweep')!;
    const receiverShell = receiver.solids.filter(({ id }) => id.startsWith('receiver-shell'));
    const handguardTransform = resolved.placed.get('handguard')!;
    const stemWorld = worldSolid(carrierTransform, stem);

    expect(Math.abs((pivotBounds[0]![0]! + pivotBounds[0]![1]!) / 2 - -4)).toBeLessThanOrEqual(0.5);
    expect(knobBounds[2]![1]!).toBeLessThan(0);
    expect(sweep).toBeDefined();
    expect(
      penetrationWorld(
        stemWorld,
        worldSolid(carrierTransform, carrier.solids.find(({ id }) => id === 'heavy-carrier')!),
      ),
    ).toBeGreaterThan(0);
    expect(penetrationWorld(stemWorld, worldSolid(carrierTransform, pivot))).toBeGreaterThan(0);
    for (const shell of receiverShell) {
      expect(penetrationWorld(stemWorld, worldSolid(receiverTransform, shell)), shell.id).toBeLessThanOrEqual(1e-6);
    }
    for (const solid of handguard.solids) {
      expect(
        penetrationWorld(worldSolid(carrierTransform, pivot), worldSolid(handguardTransform, solid)),
        solid.id,
      ).toBeLessThanOrEqual(0);
    }
  });

  // biome-ignore format: Keep the comprehensive per-design geometry contract in its current layout.
  it.each([
    { label: 'design archetype-bolt-rifle.json', profile: 'standard', radial: 6.08, diameter: 1.75, outstand: 4 },
    { label: 'design archetype-bolt-rifle-box.json', profile: 'standard', radial: 6.08, diameter: 1.75, outstand: 4 },
    { label: 'design archetype-awm.json', profile: 'awm', radial: 6.62, diameter: 2, outstand: 4.5 },
  ])('$profile octagonal bolt handle is correctly sized and travels with the carrier: $label', ({ label, radial, diameter, outstand }) => {
    const { assembly } = loadCorpus().find((entry) => entry.label === label)!;
    const resolved = resolve(assembly, gunDomain);
    const receiver = resolved.defs.get('receiver')!;
    const carrier = resolved.defs.get('bolt-carrier')!;
    const arm = resolved.defs.get('bolt-handle-arm')!;
    const knob = resolved.defs.get('bolt-handle-knob')!;
    const stock = resolved.defs.get('stock')!;
    const sight = resolved.defs.get('sight')!;
    const receiverTransform = resolved.placed.get('receiver')!;
    const carrierTransform = resolved.placed.get('bolt-carrier')!;
    const armTransform = resolved.placed.get('bolt-handle-arm')!;
    const knobTransform = resolved.placed.get('bolt-handle-knob')!;
    const stockTransform = resolved.placed.get('stock')!;
    const sightTransform = resolved.placed.get('sight')!;
    const armSolid = arm.solids[0]!;
    const knobSolid = knob.solids[0]!;
    expect(armSolid.kind).toBe('extruded-polygon');
    expect(knobSolid.kind).toBe('extruded-polygon');
    if (armSolid.kind !== 'extruded-polygon' || knobSolid.kind !== 'extruded-polygon') {
      throw new Error('Bolt handle arm and knob must be extruded octagonal prisms.');
    }
    expect(armSolid.profile).toHaveLength(8);
    expect(knobSolid.profile).toHaveLength(8);
    const knobCenter = applyPoint(knobTransform, [0, 0, 0]);
    const knobBounds = worldBounds(corners(knobSolid).map((point) => applyPoint(knobTransform, point)));
    const actualDiameter = Math.max(knobBounds[1]![1]! - knobBounds[1]![0]!, knobBounds[2]![1]! - knobBounds[2]![0]!);
    const actualRadial = Math.hypot(knobCenter[1], knobCenter[2]);
    const armPortTip = applyPoint(armTransform, arm.ports.find(({ id }) => id === 'tip')!.pos);
    const knobPortRoot = applyPoint(knobTransform, knob.ports.find(({ id }) => id === 'base')!.pos);
    const receiverSideFace = Math.max(
      ...receiver.solids.filter(({ id }) => id.startsWith('receiver-shell-side-near')).flatMap(corners).map((point) => point[2]),
    );
    const receiverShell = receiver.solids.filter(({ id }) => id.startsWith('receiver-shell'));
    const loadingPort = receiver.keepOuts.find(({ id }) => id === 'loading-port');
    const motion = arm.motion!;
    const knobMotion = knob.motion!;

    expect(resolved.issues).toEqual([]);
    expect(armPortTip[0]).toBeCloseTo(knobPortRoot[0], 8);
    expect(armPortTip[1]).toBeCloseTo(knobPortRoot[1], 8);
    expect(armPortTip[2]).toBeCloseTo(knobPortRoot[2], 8);
    expect(knobCenter[1]).toBeLessThan(0);
    expect(actualRadial).toBeCloseTo(radial, 2);
    expect(actualDiameter).toBeCloseTo(diameter, 6);
    expect(knobCenter[2] - receiverSideFace).toBeCloseTo(outstand, 6);
    expect(motion.end).toHaveLength(3);
    expect(knobMotion.end).toHaveLength(3);
    expect(Math.hypot(...motion.end)).toBeCloseTo(Math.hypot(...carrier.motion!.end), 6);
    expect(Math.hypot(...knobMotion.end)).toBeCloseTo(Math.hypot(...carrier.motion!.end), 6);
    const carrierDisplacement = applyPoint(carrierTransform, carrier.motion!.end).map(
      (value, axis) => value - applyPoint(carrierTransform, [0, 0, 0])[axis]!,
    );
    const armDisplacement = applyPoint(armTransform, motion.end).map(
      (value, axis) => value - applyPoint(armTransform, [0, 0, 0])[axis]!,
    );
    const knobDisplacement = applyPoint(knobTransform, knobMotion.end).map(
      (value, axis) => value - applyPoint(knobTransform, [0, 0, 0])[axis]!,
    );
    for (const axis of [0, 1, 2]) {
      expect(armDisplacement[axis]).toBeCloseTo(carrierDisplacement[axis]!, 6);
      expect(knobDisplacement[axis]).toBeCloseTo(carrierDisplacement[axis]!, 6);
    }
    expect(arm.keepOuts.find(({ id }) => id === 'bolt-handle-sweep')).toBeDefined();
    expect(knob.keepOuts.find(({ id }) => id === 'bolt-handle-sweep')).toBeDefined();

    for (const progress of [0, 0.5, 1]) {
      const accessoryTransform = (transform: typeof armTransform, partMotion: typeof motion) =>
        compose(transform, translation(partMotion.end.map((distance) => distance * progress) as unknown as Vec3));
      const moving = [
        { def: arm, transform: accessoryTransform(armTransform, motion) },
        { def: knob, transform: accessoryTransform(knobTransform, knobMotion) },
      ];
      for (const { def, transform } of moving) {
        for (const handle of def.solids) {
          const worldHandle = worldSolid(transform, handle);
          // The mainline receiver has no bolt-handle notch; g33 owns that receiver redesign.
          if (!(label.includes('bolt-rifle') || label.includes('awm'))) {
            for (const shell of receiverShell) {
              expect(penetrationWorld(worldHandle, worldSolid(receiverTransform, shell)), `${label} ${shell.id} at ${progress}`).toBeLessThanOrEqual(0);
            }
          }
          for (const solid of stock.solids) {
            expect(penetrationWorld(worldHandle, worldSolid(stockTransform, solid)), `${label} stock ${solid.id} at ${progress}`).toBeLessThanOrEqual(0);
          }
          for (const solid of sight.solids) {
            expect(penetrationWorld(worldHandle, worldSolid(sightTransform, solid)), `${label} sight ${solid.id} at ${progress}`).toBeLessThanOrEqual(0);
          }
          if (loadingPort) {
            expect(penetrationWorld(worldHandle, worldSolid(receiverTransform, { id: loadingPort.id, kind: 'box', box: loadingPort.box })), `${label} loading port at ${progress}`).toBeLessThanOrEqual(0);
          }
        }
      }
    }
  });

  it("mounts the SMG cocking tube and sliding handle on the shooter's left, inside the handguard's front face", () => {
    const { assembly } = loadCorpus().find(({ label }) => label === 'design archetype-smg.json')!;
    const resolved = resolve(assembly, gunDomain);
    const receiver = resolved.defs.get('receiver')!;
    const handguard = resolved.defs.get('handguard')!;
    const handle = resolved.defs.get('smg-handle')!;
    const handguardTransform = resolved.placed.get('handguard')!;
    const handleTransform = resolved.placed.get('smg-handle')!;
    const tube = handguard.solids.find(({ id }) => id === 'smg-cocking-tube')!;
    const guardTop = handguard.solids.find(({ id }) => id === 'top')!;
    const tubeWorld = worldSolid(handguardTransform, tube);
    const tubeBounds = worldBounds(corners(tube).map((point) => applyPoint(handguardTransform, point)));
    const receiverTransform = resolved.placed.get('receiver')!;
    const [receiverFrontX] = applyPoint(receiverTransform, receiver.ports.find(({ id }) => id === 'barrel')!.pos);
    const [handguardFrontX] = applyPoint(handguardTransform, handguard.ports.find(({ id }) => id === 'front')!.pos);
    const handleOrigin = applyPoint(handleTransform, [0, 0, 0]);
    const guardBounds = worldBounds(
      handguard.solids
        .filter(({ id }) => id !== 'smg-cocking-tube')
        .flatMap(corners)
        .map((point) => applyPoint(handguardTransform, point)),
    );
    const grip = handle.solids.find(({ id }) => id === 'smg-handle-grip')!;
    const gripBounds = worldBounds(corners(grip).map((point) => applyPoint(handleTransform, point)));
    const handleBoundsAt = (progress: number) => {
      const motion = handle.motion!;
      const transform = compose(
        handleTransform,
        translation(motion.end.map((distance) => distance * progress) as unknown as Vec3),
      );
      return worldBounds(handle.solids.flatMap(corners).map((point) => applyPoint(transform, point)));
    };
    const handKeepOut = handle.keepOuts.find(({ id }) => id === 'smg-handle-hand')!;
    const sweep = handle.keepOuts.find(({ id }) => id === 'smg-handle-sweep')!;
    const supportHand = handguard.keepOuts.find(({ id }) => id === 'smg-support-hand')!;
    const sweepSolid = worldSolid(handleTransform, { id: sweep.id, kind: 'box', box: sweep.box });
    const supportHandSolid = worldSolid(handguardTransform, { id: supportHand.id, kind: 'box', box: supportHand.box });

    expect(tube.kind).toBe('box');
    expect(tubeBounds[0]![0]).toBeCloseTo(receiverFrontX, 8);
    expect(handguardFrontX - tubeBounds[0]![1]!).toBeCloseTo(0.5, 8);
    expect(Math.abs(penetrationWorld(tubeWorld, worldSolid(handguardTransform, guardTop)))).toBeLessThanOrEqual(1e-6);
    const slidingBlock = handle.solids.find(({ id }) => id === 'smg-sliding-handle')!;
    expect(penetrationWorld(tubeWorld, worldSolid(handleTransform, slidingBlock))).toBeGreaterThan(0);
    expect(tubeBounds[2]![1]!).toBeLessThan(0);
    expect(gripBounds[2]![1]!).toBeLessThanOrEqual(guardBounds[2]![0]! + 1e-6);
    expect(guardBounds[2]![0]! - gripBounds[2]![0]!).toBeGreaterThanOrEqual(1.5);
    expect(handKeepOut).toBeDefined();
    expect(handle.motion).toMatchObject({ kind: 'linear', axis: [1, 0, 0], end: [2.5, 0, 0] });
    expect(handleBoundsAt(0)[0]![1]!).toBeLessThanOrEqual(handguardFrontX + 1e-6);
    for (const progress of [0, 0.5, 1]) {
      expect(handleBoundsAt(progress)[0]![1]!, `progress ${progress}`).toBeLessThanOrEqual(handguardFrontX + 1e-6);
    }
    expect(penetrationWorld(sweepSolid, supportHandSolid)).toBeLessThanOrEqual(0);
    for (const solid of handguard.solids.filter(({ id }) => id !== 'smg-cocking-tube')) {
      expect(penetrationWorld(sweepSolid, worldSolid(handguardTransform, solid)), solid.id).toBeLessThanOrEqual(0);
    }
    expect(handleOrigin[0]).toBeLessThanOrEqual(handguardFrontX);
  });

  it('restores the mainline bolt/AWM receiver shell while preserving their carrier-mounted levers', () => {
    for (const design of ['design archetype-bolt-rifle.json', 'design archetype-awm.json']) {
      const { assembly } = loadCorpus().find(({ label }) => label === design)!;
      const resolved = resolve(assembly, gunDomain);
      const receiver = resolved.defs.get('receiver')!;
      const carrier = resolved.defs.get('bolt-carrier')!;
      expect(
        receiver.solids.some(({ id }) => id === 'receiver-shell-rear'),
        design,
      ).toBe(true);
      expect(
        receiver.solids.some(({ id }) => id.startsWith('receiver-shell-rear-window')),
        design,
      ).toBe(false);
      expect(
        receiver.solids.some(({ id }) => id.startsWith('receiver-shell-rear-lower')),
        design,
      ).toBe(false);
      expect(
        carrier.solids.some(({ id }) => id === 'bolt-handle-seat'),
        design,
      ).toBe(true);
      expect(resolved.defs.get('bolt-handle-arm'), design).toBeDefined();
      expect(resolved.defs.get('bolt-handle-knob'), design).toBeDefined();
    }
  });

  it('joins the battle-rifle handle stem to its moving carrier through a narrow receiver slot', () => {
    const { assembly } = loadCorpus().find(({ label }) => label === 'design archetype-battle-rifle.json')!;
    const resolved = resolve(assembly, gunDomain);
    const carrier = resolved.defs.get('bolt-carrier')!;
    const receiver = resolved.defs.get('receiver')!;
    const carrierTransform = resolved.placed.get('bolt-carrier')!;
    const receiverTransform = resolved.placed.get('receiver')!;
    const stem = carrier.solids.find(({ id }) => id === 'fal-handle-stem')!;
    const body = carrier.solids.find(({ id }) => id === 'heavy-carrier')!;
    const pivot = carrier.solids.find(({ id }) => id === 'fal-handle-pivot')!;
    const worldStem = worldSolid(carrierTransform, stem);
    expect(penetrationWorld(worldStem, worldSolid(carrierTransform, body))).toBeGreaterThan(0);
    expect(penetrationWorld(worldStem, worldSolid(carrierTransform, pivot))).toBeGreaterThan(0);
    for (const shell of receiver.solids.filter(({ id }) => id.startsWith('receiver-shell-side-far'))) {
      expect(penetrationWorld(worldStem, worldSolid(receiverTransform, shell)), shell.id).toBeLessThanOrEqual(1e-6);
    }
    expect(carrier.motion).toMatchObject({ kind: 'linear', axis: [1, 0, 0] });
  });

  it('keeps the AK and carrier/ejection-port anchors unchanged', () => {
    const unchanged = [
      { pattern: 'ak', restX: -5.75, carrierX: [-4.5, 1.5], portX: [-7.5, -1], portY: [-1.5, 1.5] },
      { pattern: 'smg', restX: -7, carrierX: [-1.5, 1.5], portX: [-8.75, -5.25], portY: [0.5, 2] },
      { pattern: 'pump', restX: -7, carrierX: [-3.25, 3], portX: [-10.25, -3.5], portY: [-1, 1] },
      { pattern: 'barrett', restX: -4.5, carrierX: [-3, 3], portX: [-7.75, -1.25], portY: [0, 2] },
      { pattern: 'bolt', restX: -6, carrierX: [-2.5, 2.5], portX: [-8.75, -3.25], portY: [0.5, 1.75] },
    ] as const;

    for (const expected of unchanged) {
      const entry = travelCases.find(({ pattern }) => pattern === expected.pattern)!;
      const resolved = resolve(assemblyFor(entry), gunDomain);
      const port = portMeasurements(entry, resolved);
      expect(BOLT_CARRIER_ENVELOPES[expected.pattern].x, expected.pattern).toEqual(expected.carrierX);
      expect(
        resolved.defs.get('receiver')!.ports.find(({ id }) => id === 'bolt-carrier')!.pos[0],
        expected.pattern,
      ).toBe(expected.restX);
      expect(port.actualX, expected.pattern).toEqual(expected.portX);
      expect(port.actualY, expected.pattern).toEqual(expected.portY);
    }
  });

  it('keeps material where an AK charging slot would cut every non-AK receiver', () => {
    for (const entry of travelCases.filter(({ pattern }) => pattern !== 'ak' && pattern !== 'bolt')) {
      const resolved = resolve(assemblyFor(entry), gunDomain);
      const receiver = resolved.defs.get('receiver')!;
      const witness = akSlotWitness(entry, resolved);
      expect(receiverSectionHasMaterialAt(receiver.solids, ...witness), entry.pattern).toBe(true);
    }
  });

  it('fails the non-AK material guard when an AK-style slot is injected into the AR shell', () => {
    const entry = travelCases.find(({ pattern }) => pattern === 'ar')!;
    const resolved = resolve(assemblyFor(entry), gunDomain);
    const receiver = resolved.defs.get('receiver')!;
    const ejection = receiver.keepOuts.find(({ id }) => id === 'ejection')!.box;
    const [centerX, centerY] = ejection.center;
    const [halfX, halfY] = ejection.half;
    const port = {
      x: [centerX - halfX, centerX + halfX] as const,
      y: [centerY - halfY, centerY + halfY] as const,
    };
    const [, carrierY] = receiver.ports.find(({ id }) => id === 'bolt-carrier')!.pos;
    const witness = akSlotWitness(entry, resolved);
    const faultySection = buildReceiverSection({
      id: 'receiver-ar',
      outline: RECEIVER_SECTION.ar.outline,
      x: [-16, 0],
      wall: 0.5,
      cavity: carrierCavityBounds('ar', carrierY),
      port: { x: port.x, sectionAxis: 0, section: port.y },
      portSlots: [akChargingHandleSlotWindow(carrierY, port, entry.travel)],
    });
    const mutatedSolids = [
      ...receiver.solids.filter(({ display }) => display?.mergeGroup !== 'receiver-ar'),
      ...faultySection,
    ];
    const materialGuard = (solids: readonly Solid[]) => {
      expect(receiverSectionHasMaterialAt(solids, ...witness)).toBe(true);
    };

    materialGuard(receiver.solids);
    expect(() => materialGuard(mutatedSolids)).toThrow();
    expect(mutatedSolids.every(({ display }) => display?.mergeGroup !== 'receiver-ak')).toBe(true);
  });

  it('extends the AR carrier 4/3 forward and derives its port from the unchanged rear face', () => {
    const entry = travelCases.find(({ pattern }) => pattern === 'ar')!;
    const resolved = resolve(assemblyFor(entry), gunDomain);
    const receiver = resolved.defs.get('receiver')!;
    const carrier = resolved.defs.get('bolt-carrier')!;
    const transform = resolved.placed.get('bolt-carrier')!;
    const body = carrier.solids.find(({ id }) => id === 'carrier-body')!;
    const bodyBounds = worldBounds(corners(body).map((point) => applyPoint(transform, point)));
    const port = portMeasurements(entry, resolved);
    const [travel] = carrier.motion!.end;
    const [barrelMountX] = receiver.ports.find(({ id }) => id === 'barrel')!.pos;

    expect(BOLT_CARRIER_ENVELOPES.ar.x).toEqual([-2.5, 1.5]);
    expect(bodyBounds[0]).toEqual([-8.5, -4.5]);
    expect(bodyBounds[0]![1]! - bodyBounds[0]![0]!).toBe(4);
    expect(4 / 3).toBeGreaterThanOrEqual(1.25);
    expect(4 / 3).toBeLessThanOrEqual(1.35);
    expect(bodyBounds[0]![0]).toBe(-8.5);
    expect([port.actualX![0], port.actualX![1]]).toEqual([-8.75, -4.25]);
    expect(port.width).toBe(4.5);
    expect(port.actualY).toEqual([-0.75, 1.25]);
    expect(barrelMountX - bodyBounds[0]![1]!).toBeCloseTo(4.5, 8);
    expect(travel).toBe(6.5);
    expect(noCarrierReceiverIntersectionsOverTravel(resolved)).toBe(true);
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
    expect(BOLT_CARRIER_ENVELOPES.ak.x).toEqual([-4.5, 1.5]);
    expect(body.box.half).toEqual([3, 1.25, 1.25]);
  });

  it('uses one carrier-face margin, a pump shell minimum, and unchanged pistol apertures', () => {
    expect(EJECTION_PORT_MARGIN_U).toBe(0.25);
    expect(EJECTION_PORT_RULES.pumpShellMinimum).toEqual({ lengthU: 6.25, endClearanceU: 0.25 });

    const slide = FAMILIES.slide!.build({ bore: 'M', length: 'M' });
    const portPoints = slide.solids.filter(({ id }) => id.startsWith('ejection-port-')).flatMap(corners);
    const portBounds = limits(portPoints);
    expect(portBounds[0]).toEqual([-8, 0]);
    expect(portBounds[1]).toEqual([0.5, 2.5]);
  });

  it('keeps the top action bar inside the forend slit and clear of the tube and barrel through full travel', () => {
    const { assembly } = loadCorpus().find(({ label }) => label === 'design archetype-pump-shotgun.json')!;
    const resolved = resolve(assembly, gunDomain);
    const carrier = resolved.defs.get('bolt-carrier')!;
    const forend = resolved.defs.get('forend')!;
    const tube = resolved.defs.get('tube')!;
    const barrel = resolved.defs.get('barrel')!;
    const receiver = resolved.defs.get('receiver')!;
    const carrierTransform = resolved.placed.get('bolt-carrier')!;
    const forendTransform = resolved.placed.get('forend')!;
    const carrierMotion = carrier.motion!;
    const forendMotion = forend.motion!;
    const bars = carrier.solids.filter(({ id }) => id.startsWith('action-bar-'));
    expect(bars.map(({ id }) => id)).toEqual(['action-bar-top']);
    expect(forendMotion.end).toEqual([-carrierMotion.end[0], 0, 0]);
    const receiverBounds = limits(receiver.solids.flatMap(corners));
    const receiverSolids = receiver.solids.map((solid) => worldSolid(resolved.placed.get('receiver')!, solid));
    const tubeSolids = tube.solids.map((solid) => worldSolid(resolved.placed.get('tube')!, solid));
    const barrelSolids = barrel.solids.map((solid) => worldSolid(resolved.placed.get('barrel')!, solid));
    const travelSamples = Array.from({ length: Math.round(carrierMotion.end[0] * 4) + 1 }, (_, index) => index / 4);

    for (const progress of travelSamples) {
      const carrierAt = compose(carrierTransform, translation([progress, 0, 0]));
      const forendProgress = progress / carrierMotion.end[0];
      const forendAt = compose(
        forendTransform,
        translation(forendMotion.end.map((distance) => distance * forendProgress) as unknown as Vec3),
      );
      const barWorld = worldSolid(carrierAt, bars[0]!);
      const barBounds = limits(corners(bars[0]!).map((point) => applyPoint(carrierAt, point)));
      expect(barBounds[1]![0]!).toBeGreaterThanOrEqual(receiverBounds[1]![0]! - 1e-6);
      expect(barBounds[1]![1]!).toBeLessThanOrEqual(receiverBounds[1]![1]! + 1e-6);
      expect(barBounds[2]![0]!).toBeGreaterThanOrEqual(receiverBounds[2]![0]! - 1e-6);
      expect(barBounds[2]![1]!).toBeLessThanOrEqual(receiverBounds[2]![1]! + 1e-6);
      expect((barBounds[2]![0]! + barBounds[2]![1]!) / 2).toBeCloseTo(0, 6);

      const forendSolids = forend.solids.map((solid) => worldSolid(forendAt, solid));
      expect(
        Math.min(...forendSolids.map((solid) => distanceWorld(barWorld, solid))),
        `bar/slit clearance at ${progress}`,
      ).toBeGreaterThanOrEqual(0.049);
      const receiverPenetration = Math.max(...receiverSolids.map((obstacle) => penetrationWorld(barWorld, obstacle)));
      const tubePenetration = Math.max(...tubeSolids.map((solid) => penetrationWorld(barWorld, solid)));
      const barrelPenetration = Math.max(...barrelSolids.map((solid) => penetrationWorld(barWorld, solid)));
      expect(receiverPenetration, `receiver clearance at ${progress}`).toBeLessThanOrEqual(1e-3);
      expect(tubePenetration, `tube clearance at ${progress}`).toBeLessThanOrEqual(1e-6);
      expect(barrelPenetration, `barrel clearance at ${progress}`).toBeLessThanOrEqual(1e-6);
    }
  });

  it('keeps the pump action-bar channel internal and preserves the main receiver side face', () => {
    const entry = travelCases.find(({ pattern }) => pattern === 'pump')!;
    const resolved = resolve(assemblyFor(entry), gunDomain);
    const receiver = resolved.defs.get('receiver')!;
    const tubeY = -2.75;

    for (const x of [-5.5, -4, -1, -0.25]) {
      expect(receiverSectionHasMaterialAt(receiver.solids, x, tubeY, 1.95), `outer skin x=${x}`).toBe(true);
    }
    for (const x of [-8, -5, -4]) {
      expect(receiverSectionHasMaterialAt(receiver.solids, x, 0, 1.95), `unchanged ejection opening x=${x}`).toBe(
        false,
      );
    }
    expect(receiverSectionHasMaterialAt(receiver.solids, -1, 0, 1.95), 'receiver side ahead of the port').toBe(true);
    for (const x of [-5, -2, -0.25]) {
      expect(receiverSectionHasMaterialAt(receiver.solids, x, tubeY + 1.1, 0), `internal slot x=${x}`).toBe(false);
    }
  });

  it('makes each family style produce the expected procedural features', () => {
    const build = (pattern: string) => FAMILIES['bolt-carrier']!.build({ pattern, bore: 'L', action: 'auto' });
    expect(build('ar').solids.map(({ id }) => id)).toEqual(['carrier-body', 'bolt-head', 'gas-key']);
    expect(build('ak').solids.map(({ id }) => id)).toContain('piston');
    const pump = build('pump');
    expect(pump.solids.map(({ id }) => id)).toContain('action-bar-top');
    const actionBars = pump.solids.filter(({ id }) => id.startsWith('action-bar-'));
    expect(actionBars.map(({ id }) => id)).toEqual(['action-bar-top']);
    expect(actionBars.some(({ id }) => id.includes('left'))).toBe(false);
    const pumpBody = pump.solids.find(({ id }) => id === 'carrier-body');
    expect(pumpBody?.kind).toBe('box');
    if (pumpBody?.kind === 'box') {
      expect(pumpBody.box.half).toEqual([3.125, 0.75, 0.75]);
      expect(pumpBody.box.center[2]).toBe(0);
    }
    expect(pump.keepOuts.find(({ id }) => id === 'action-bar-sweep')).toBeDefined();
    expect(build('smg').solids.map(({ id }) => id)).toContain('carrier-body');
    expect(build('barrett').solids.map(({ id }) => id)).toContain('heavy-carrier');
    expect(build('bolt').solids.map(({ id }) => id)).toContain('bolt-handle-seat');
  });

  it('derives each moving handle sweep from the same receiver source as PartMotion', () => {
    const cases = [
      { pattern: 'ak', section: 'ak', action: 'bolt', feed: 'box', bore: 'L', handleStyle: 'ak', travel: 6.5 },
      { pattern: 'ak', section: 'ar', action: 'auto', feed: 'box', bore: 'S', handleStyle: 'ak', travel: 6.5 },
      {
        pattern: 'barrett',
        section: 'standard',
        action: 'bolt',
        feed: 'box',
        bore: 'L',
        handleStyle: 'barrett',
        travel: 8,
      },
    ] as const;
    for (const entry of cases) {
      const assembly: Assembly = {
        name: `handle-sweep-${entry.pattern}-${entry.section}-${entry.bore}`,
        root: 'receiver',
        parts: {
          receiver: {
            family: 'receiver',
            params: {
              action: entry.action,
              feed: entry.feed,
              bore: entry.bore,
              section: entry.section,
              carrierPattern: entry.pattern,
            },
          },
          carrier: { family: 'bolt-carrier', params: { pattern: entry.pattern, handleStyle: entry.handleStyle } },
        },
        connections: [{ from: 'receiver.bolt-carrier', to: 'carrier.mount' }],
      };
      const resolved = resolve(assembly, gunDomain);
      expect(resolved.issues, entry.pattern).toEqual([]);
      const carrier = resolved.defs.get('carrier')!;
      const style = CARRIER_HANDLE_STYLES[entry.handleStyle];
      const hand = carrier.keepOuts.find(({ id }) => id === `${entry.handleStyle}-handle-hand`)!.box;
      const sweep = carrier.keepOuts.find(({ id }) => id === `${entry.handleStyle}-handle-sweep`)!.box;
      const [actualMotion] = carrier.motion!.end;
      expect(actualMotion, entry.pattern).toBe(entry.travel);
      expect(sweep.center[0] + sweep.half[0] - (hand.center[0] + hand.half[0]), entry.pattern).toBe(actualMotion);
      expect(style.motion).toBe('linear');
    }
  });

  it('uses profile attachment for the AK, bolt, and Barrett handles when their envelopes move', () => {
    for (const pattern of ['ak', 'bolt', 'barrett'] as const) {
      const envelope = BOLT_CARRIER_ENVELOPES[pattern] as unknown as {
        x: readonly [number, number];
        y: readonly [number, number];
        z: readonly [number, number];
      };
      const originalY = envelope.y;
      const handleBounds = () => {
        const solids = FAMILIES['bolt-carrier']!.build({
          pattern,
          handleStyle: pattern,
          action: 'bolt',
          feed: 'box',
          bore: 'M',
        }).solids.filter(({ id }) => HANDLE_ID_REGEX.test(id));
        return limits(solids.flatMap(corners));
      };
      const before = handleBounds();
      try {
        envelope.y = [originalY[0] + 0.25, originalY[1] + 0.25];
        const after = handleBounds();
        expect(after[1]![0]! - before[1]![0]!, pattern).toBeCloseTo(0.25, 8);
      } finally {
        envelope.y = originalY;
      }
    }
  });

  it('anchors the separate bolt handle arm and knob to the carrier envelope front', () => {
    const { assembly } = loadCorpus().find(({ label }) => label === 'design archetype-bolt-rifle.json')!;
    const envelope = BOLT_CARRIER_ENVELOPES.bolt as unknown as {
      y: readonly [number, number];
    };
    const originalY = envelope.y;
    const handleOrigins = () => {
      const resolved = resolve(assembly, gunDomain);
      return ['bolt-handle-arm', 'bolt-handle-knob'].map((id) => applyPoint(resolved.placed.get(id)!, [0, 0, 0]));
    };
    const before = handleOrigins();
    try {
      envelope.y = [originalY[0] + 0.25, originalY[1] + 0.25];
      const after = handleOrigins();
      for (const index of [0, 1]) {
        expect(after[index]![0]).toBeCloseTo(before[index]![0]!, 8);
        expect(after[index]![1] - before[index]![1]!).toBeCloseTo(0.25, 8);
        expect(after[index]![2]).toBeCloseTo(before[index]![2]!, 8);
      }
    } finally {
      envelope.y = originalY;
    }
  });

  it('covers the catalog styles with compatible owners and slotted handle geometry', () => {
    const receiverStyles = [
      { style: 'ar', bore: 'M', expected: ['charging-handle', 'ar-handle-crossbar', 'ar-handle-latch'] },
    ] as const;
    for (const entry of receiverStyles) {
      const def = FAMILIES.receiver!.build({
        action: 'auto',
        feed: 'box',
        bore: entry.bore,
        handleStyle: entry.style,
      });
      expect(
        def.solids.filter(({ id }) => HANDLE_OR_COCKING_TUBE_ID_REGEX.test(id)).map(({ id }) => id),
        entry.style,
      ).toEqual(entry.expected);
      expect(
        def.solids.filter(({ id }) => HANDLE_OR_COCKING_TUBE_ID_REGEX.test(id)).every(({ slot }) => slot === 'metal'),
      ).toBe(true);
    }
    const carrierStyles = [
      { style: 'ak', pattern: 'ak', expected: ['ak-handle-stick', 'charging-handle'] },
      { style: 'autoShotgun', pattern: 'ak', expected: ['ak-handle-stick', 'charging-handle'] },
      { style: 'bolt', pattern: 'bolt', expected: ['bolt-handle-seat'] },
      {
        style: 'battle',
        pattern: 'barrett',
        expected: ['fal-handle-pivot', 'fal-handle-arm', 'fal-handle-knob', 'fal-handle-stem'],
      },
      {
        style: 'barrett',
        pattern: 'barrett',
        expected: ['charging-handle', 'barrett-handle-crank', 'barrett-handle-knob'],
      },
    ] as const;
    for (const entry of carrierStyles) {
      const def = FAMILIES['bolt-carrier']!.build({
        pattern: entry.pattern,
        handleStyle: entry.style,
        action: 'bolt',
        feed: 'top',
        bore: 'M',
      });
      expect(
        def.solids.filter(({ id }) => HANDLE_ID_REGEX.test(id)).map(({ id }) => id),
        entry.style,
      ).toEqual(entry.expected);
      expect(def.solids.filter(({ id }) => HANDLE_ID_REGEX.test(id)).every(({ slot }) => slot === 'metal')).toBe(true);
    }
    for (const style of ['pump', 'pistol', 'bullpup', 'none']) {
      const def = FAMILIES['bolt-carrier']!.build({ pattern: 'ar', handleStyle: style, action: 'auto', bore: 'M' });
      expect(
        def.solids.filter(({ id }) => HANDLE_ID_REGEX.test(id)),
        style,
      ).toEqual([]);
    }
  });

  it('covers every catalog handle style with its compatible owner and pattern', () => {
    const pairings = [
      {
        style: 'ar',
        pattern: 'ar',
        owner: 'receiver',
        receiver: ['charging-handle', 'ar-handle-crossbar', 'ar-handle-latch'],
        handguard: [],
        carrier: [],
      },
      {
        style: 'ak',
        pattern: 'ak',
        owner: 'carrier',
        receiver: [],
        handguard: [],
        carrier: ['ak-handle-stick', 'charging-handle'],
      },
      {
        style: 'autoShotgun',
        pattern: 'ak',
        owner: 'carrier',
        receiver: [],
        handguard: [],
        carrier: ['ak-handle-stick', 'charging-handle'],
      },
      {
        style: 'bolt',
        pattern: 'bolt',
        owner: 'carrier',
        receiver: [],
        handguard: [],
        carrier: ['bolt-handle-seat'],
      },
      { style: 'smg', pattern: 'smg', owner: 'handguard', receiver: [], handguard: ['smg-cocking-tube'], carrier: [] },
      {
        style: 'battle',
        pattern: 'barrett',
        owner: 'carrier',
        receiver: [],
        handguard: [],
        carrier: ['fal-handle-pivot', 'fal-handle-arm', 'fal-handle-knob', 'fal-handle-stem'],
      },
      {
        style: 'barrett',
        pattern: 'barrett',
        owner: 'carrier',
        receiver: [],
        handguard: [],
        carrier: ['charging-handle', 'barrett-handle-crank', 'barrett-handle-knob'],
      },
      { style: 'pump', pattern: 'pump', owner: 'none', receiver: [], handguard: [], carrier: [] },
      { style: 'pistol', pattern: 'ar', owner: 'none', receiver: [], handguard: [], carrier: [] },
      { style: 'bullpup', pattern: 'ar', owner: 'none', receiver: [], handguard: [], carrier: [] },
      { style: 'none', pattern: 'ar', owner: 'none', receiver: [], handguard: [], carrier: [] },
    ] as const;
    expect(Object.keys(CARRIER_HANDLE_STYLES).sort()).toEqual(pairings.map(({ style }) => style).sort());

    for (const pairing of pairings) {
      expect(CARRIER_HANDLE_STYLES[pairing.style].owner, `${pairing.style} catalog owner`).toBe(pairing.owner);
      const receiver = FAMILIES.receiver!.build({
        action: 'auto',
        feed: 'box',
        bore: 'M',
        carrierPattern: pairing.pattern,
        handleStyle: pairing.style,
      });
      const handguard = FAMILIES.handguard!.build({
        length: 'S',
        barrelBore: 'S',
        bore: 'S',
        handleStyle: pairing.style === 'smg' ? 'smg' : 'none',
      });
      const carrier = FAMILIES['bolt-carrier']!.build({
        action: 'bolt',
        feed: 'box',
        bore: 'M',
        pattern: pairing.pattern,
        handleStyle: pairing.style,
      });
      const receiverIds = receiver.solids
        .filter(({ id }) => HANDLE_OR_COCKING_TUBE_ID_REGEX.test(id))
        .map(({ id }) => id);
      const handguardIds = handguard.solids
        .filter(({ id }) => HANDLE_OR_COCKING_TUBE_ID_REGEX.test(id))
        .map(({ id }) => id);
      const carrierIds = carrier.solids.filter(({ id }) => HANDLE_ID_REGEX.test(id)).map(({ id }) => id);
      expect(receiverIds, `${pairing.style} receiver owner`).toEqual(pairing.receiver);
      expect(handguardIds, `${pairing.style} handguard owner`).toEqual(pairing.handguard);
      expect(carrierIds, `${pairing.style} carrier owner`).toEqual(pairing.carrier);
      expect(
        receiver.solids
          .filter(({ id }) => HANDLE_OR_COCKING_TUBE_ID_REGEX.test(id))
          .every(({ slot }) => slot === 'metal'),
      ).toBe(true);
      expect(
        handguard.solids
          .filter(({ id }) => HANDLE_OR_COCKING_TUBE_ID_REGEX.test(id))
          .every(({ slot }) => slot === 'metal'),
      ).toBe(true);
      expect(carrier.solids.filter(({ id }) => HANDLE_ID_REGEX.test(id)).every(({ slot }) => slot === 'metal')).toBe(
        true,
      );
    }
  });

  it('makes the style catalog authoritative for shape and owner policy', () => {
    const style = CARRIER_HANDLE_STYLES.bolt as unknown as { shape: string; owner: string; motion: string };
    const saved = { shape: style.shape, owner: style.owner, motion: style.motion };
    try {
      style.shape = 'none';
      style.owner = 'none';
      style.motion = 'none';
      const carrier = FAMILIES['bolt-carrier']!.build({
        pattern: 'bolt',
        handleStyle: 'bolt',
        action: 'bolt',
        feed: 'top',
        bore: 'M',
      });
      expect(carrier.solids.filter(({ id }) => HANDLE_ID_REGEX.test(id))).toEqual([]);
      expect(carrier.keepOuts.some(({ id }) => id.includes('handle'))).toBe(false);
    } finally {
      Object.assign(style, saved);
    }
  });
});
