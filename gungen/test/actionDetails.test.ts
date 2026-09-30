import { describe, expect, it } from 'vitest';
import type { Box, Solid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { loadCorpus, loadFixture } from './helpers.ts';

const limits = (
  box: Box,
): readonly [readonly [number, number], readonly [number, number], readonly [number, number]] => [
  [box.center[0] - box.half[0], box.center[0] + box.half[0]],
  [box.center[1] - box.half[1], box.center[1] + box.half[1]],
  [box.center[2] - box.half[2], box.center[2] + box.half[2]],
];

const inside = (solid: Solid, point: readonly [number, number, number]): boolean => {
  if (solid.kind === 'box') {
    return limits(solid.box).every(([min, max], axis) => point[axis]! >= min && point[axis]! <= max);
  }
  if (point[2] < solid.z[0] || point[2] > solid.z[1]) {
    return false;
  }
  let result = false;
  for (let i = 0; i < solid.profile.length; i += 1) {
    const current = solid.profile[i]!;
    const previous = solid.profile[(i + solid.profile.length - 1) % solid.profile.length]!;
    if (current[1] > point[1] !== previous[1] > point[1]) {
      const crossingX =
        ((previous[0] - current[0]) * (point[1] - current[1])) / (previous[1] - current[1]) + current[0];
      if (point[0] < crossingX) {
        result = !result;
      }
    }
  }
  return result;
};

const intervalsOverlap = (a: readonly [number, number], b: readonly [number, number]): boolean =>
  Math.min(a[1], b[1]) > Math.max(a[0], b[0]);

const receiver = (action: 'auto' | 'bolt' | 'pump', chargingHandle = 'side') =>
  FAMILIES.receiver!.build({ action, feed: action === 'pump' ? 'tube' : 'box', bore: 'M', chargingHandle });

const rayHitFromEjectionPort = (def: ReturnType<typeof receiver>): { id: string; z: number } | null => {
  const carrier = def.solids.find((solid) => solid.id === 'bolt-carrier-face');
  if (carrier?.kind !== 'box') {
    return null;
  }
  const [, y] = carrier.box.center;
  for (let z = 2.01; z >= -2; z -= 0.01) {
    const hit = def.solids.find((solid) => inside(solid, [-7, y, z]));
    if (hit) {
      return { id: hit.id, z };
    }
  }
  return null;
};

const handleAndTravel = (def: ReturnType<typeof receiver>, handleId: string) => {
  const handle = def.solids.find((solid) => solid.id === handleId);
  const travel = def.keepOuts.find((keepOut) => keepOut.id === handleId);
  if (handle?.kind !== 'box' || !travel) {
    throw new Error(`Expected box handle and ${handleId} travel volume.`);
  }
  return { handle: limits(handle.box), travel: limits(travel.box) };
};

describe('visible action details', () => {
  it('opens only the ejection-side wall and exposes a carrier before the far wall', () => {
    const receivers = [
      receiver('auto', 'rear-top'),
      receiver('bolt'),
      receiver('pump'),
      FAMILIES['ak-receiver']!.build({ action: 'bolt', feed: 'box', bore: 'M' }),
    ];
    for (const def of receivers) {
      const carrier = def.solids.find((solid) => solid.id === 'bolt-carrier-face');
      expect(carrier?.kind).toBe('box');
      const carrierY = carrier?.kind === 'box' ? carrier.box.center[1] : 0;
      expect(def.keepOuts.some(({ id }) => id === 'ejection')).toBe(true);
      expect(def.solids.some((solid) => inside(solid, [-7, carrierY, 1.75]))).toBe(false);
      expect(def.solids.some((solid) => inside(solid, [-7, carrierY, -1.75]))).toBe(true);
      expect(rayHitFromEjectionPort(def)).toMatchObject({ id: 'bolt-carrier-face', z: expect.closeTo(1.25, 1) });
    }
  });

  it('sizes every ejection opening to the carrier face plus 0.25u clearance', () => {
    const covered = new Set<string>();
    for (const { label, assembly } of loadCorpus()) {
      const def = validate(assembly, gunDomain).resolved.defs.get('receiver');
      const ejection = def?.keepOuts.find(({ id }) => id === 'ejection');
      if (!(def && ejection)) {
        continue;
      }
      const carrier = def.solids.find((solid) => solid.id === 'bolt-carrier-face');
      if (carrier?.kind !== 'box') {
        throw new Error(`${label}: ejection port has no bolt-carrier face box`);
      }
      covered.add(label);
      const [[faceMinX, faceMaxX], [faceMinY, faceMaxY]] = limits(carrier.box);
      const [[portMinX, portMaxX], [portMinY, portMaxY]] = limits(ejection.box);
      expect(portMinX, label).toBeCloseTo(faceMinX - 0.25);
      expect(portMaxX, label).toBeCloseTo(faceMaxX + 0.25);
      expect(portMinY, label).toBeCloseTo(faceMinY - 0.25);
      expect(portMaxY, label).toBeCloseTo(faceMaxY + 0.25);

      const x = (portMinX + portMaxX) / 2;
      const y = (portMinY + portMaxY) / 2;
      const sideZ = 1.75;
      expect(
        def.solids.some((solid) => inside(solid, [x, y, sideZ])),
        label,
      ).toBe(false);
      expect(
        def.solids.some((solid) => inside(solid, [portMinX + 0.01, y, sideZ])),
        label,
      ).toBe(false);
      expect(
        def.solids.some((solid) => inside(solid, [portMaxX - 0.01, y, sideZ])),
        label,
      ).toBe(false);
      expect(
        def.solids.some((solid) => inside(solid, [x, portMinY + 0.01, sideZ])),
        label,
      ).toBe(false);
      expect(
        def.solids.some((solid) => inside(solid, [x, portMaxY - 0.01, sideZ])),
        label,
      ).toBe(false);
      expect(
        def.solids.some((solid) => inside(solid, [portMinX - 0.01, y, sideZ])),

        label,
      ).toBe(true);
      expect(
        def.solids.some((solid) => inside(solid, [portMaxX + 0.01, y, sideZ])),
        label,
      ).toBe(true);
      expect(
        def.solids.some((solid) => inside(solid, [x, portMinY - 0.01, sideZ])),
        label,
      ).toBe(true);
      expect(
        def.solids.some((solid) => inside(solid, [x, portMaxY + 0.01, sideZ])),
        label,
      ).toBe(true);
    }
    for (const design of [
      'archetype-ar.json',
      'archetype-ak.json',
      'archetype-bolt-rifle.json',
      'archetype-pump-shotgun.json',
      'archetype-smg.json',
      'archetype-battle-rifle.json',
      'archetype-bullpup.json',
    ]) {
      expect(covered.has(`design ${design}`), design).toBe(true);
    }
  });

  it('uses 0.5u receiver-shell walls, matching the pistol-slide wall thickness', () => {
    const generic = receiver('auto');
    const top = generic.solids.find(({ id }) => id === 'receiver-shell-top');
    const nearSide = generic.solids.find(({ id }) => id === 'receiver-shell-side-near-rear');
    expect(top?.kind).toBe('box');
    expect(nearSide?.kind).toBe('box');
    if (top?.kind === 'box' && nearSide?.kind === 'box') {
      expect(limits(top.box)[1]![1] - limits(top.box)[1]![0]).toBe(0.5);
      expect(limits(nearSide.box)[2]![1] - limits(nearSide.box)[2]![0]).toBe(0.5);
    }
    const akSide = FAMILIES['ak-receiver']!.build({ action: 'bolt', feed: 'box', bore: 'M' }).solids.find(({ id }) =>
      id.startsWith('receiver-body-port-wall'),
    );
    expect(akSide?.kind).toBe('extruded-polygon');
    if (akSide?.kind === 'extruded-polygon') {
      expect(akSide.z[1] - akSide.z[0]).toBe(0.5);
    }
  });

  it('does not add an ejection port to revolver receivers', () => {
    const revolver = FAMILIES.receiver!.build({ action: 'revolver', feed: 'cylinder', bore: 'S' });
    expect(revolver.keepOuts.some(({ id }) => id === 'ejection')).toBe(false);
    expect(revolver.solids.some(({ id }) => id.startsWith('receiver-shell-side-near'))).toBe(false);
  });

  it('places side, rear-top, and bolt handles at touching, non-overlapping rest faces', () => {
    const side = handleAndTravel(receiver('auto', 'side'), 'charging-handle');
    expect(side.handle[0]![0]).toBe(side.travel[0]![1]);
    expect(intervalsOverlap(side.handle[1]!, side.travel[1]!)).toBe(true);
    expect(intervalsOverlap(side.handle[2]!, side.travel[2]!)).toBe(true);

    const rearTop = handleAndTravel(receiver('auto', 'rear-top'), 'charging-handle');
    expect(rearTop.handle[2]![0]).toBe(rearTop.travel[2]![1]);
    expect(intervalsOverlap(rearTop.handle[0]!, rearTop.travel[0]!)).toBe(true);
    expect(intervalsOverlap(rearTop.handle[1]!, rearTop.travel[1]!)).toBe(true);

    const bolt = handleAndTravel(FAMILIES.receiver!.build({ action: 'bolt', feed: 'box', bore: 'M' }), 'bolt-handle');
    expect(bolt.handle[0]![0]).toBe(bolt.travel[0]![1]);
    expect(intervalsOverlap(bolt.handle[1]!, bolt.travel[1]!)).toBe(true);
    expect(intervalsOverlap(bolt.handle[2]!, bolt.travel[2]!)).toBe(true);
  });

  it('keeps action details valid throughout all fixtures and published designs', () => {
    for (const { label, assembly } of loadCorpus()) {
      const report = validate(assembly, gunDomain);
      expect(
        report.issues.filter(({ rule }) => rule === 'action-handle-rest'),
        label,
      ).toEqual([]);
    }
  });

  it('rejects a built-in charging handle placed inside its own travel volume', () => {
    const report = validate(loadFixture('broken-action-handle'), gunDomain);
    expect(report.issues.filter(({ rule }) => rule === 'action-handle-rest')).toEqual([
      expect.objectContaining({
        parts: ['receiver'],
        keepOut: { part: 'receiver', id: 'charging-handle' },
      }),
    ]);
  });
});
