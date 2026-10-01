import { describe, expect, it } from 'vitest';
import type { Box } from '../src/core/schema.ts';
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

const intervalsOverlap = (a: readonly [number, number], b: readonly [number, number]): boolean =>
  Math.min(a[1], b[1]) > Math.max(a[0], b[0]);

const receiver = (action: 'auto' | 'bolt' | 'pump', chargingHandle = 'side') =>
  FAMILIES.receiver!.build({ action, feed: action === 'pump' ? 'tube' : 'box', bore: 'M', chargingHandle });

const handleAndTravel = (def: ReturnType<typeof receiver>, handleId: string) => {
  const handle = def.solids.find((solid) => solid.id === handleId);
  const travel = def.keepOuts.find((keepOut) => keepOut.id === handleId);
  if (handle?.kind !== 'box' || !travel) {
    throw new Error(`Expected box handle and ${handleId} travel volume.`);
  }
  return { handle: limits(handle.box), travel: limits(travel.box) };
};

describe('visible action details', () => {
  it('keeps the ejection aperture and moves the carrier out of the receiver', () => {
    const apertures = [
      { def: receiver('auto', 'rear-top'), halfLength: 2.25, halfHeight: 1 },
      { def: receiver('pump'), halfLength: 3.375, halfHeight: 1 },
      {
        def: FAMILIES['ak-receiver']!.build({ action: 'bolt', feed: 'box', bore: 'M' }),
        halfLength: 3.25,
        halfHeight: 1.5,
      },
    ];
    for (const { def, halfLength, halfHeight } of apertures) {
      const ejection = def.keepOuts.find(({ id }) => id === 'ejection');
      expect(ejection).toBeDefined();
      expect(def.solids.some(({ id }) => id === 'bolt-carrier-face')).toBe(false);
      expect(ejection?.box.half[0]).toBe(halfLength);
      expect(ejection?.box.half[1]).toBe(halfHeight);
    }
  });

  it('uses a separate procedural bolt-carrier part in AR, AK and pump designs', () => {
    for (const { label, assembly } of loadCorpus()) {
      if (
        ![
          'design archetype-ar.json',
          'design archetype-ar-free-float.json',
          'design archetype-ak.json',
          'design archetype-pump-shotgun.json',
        ].includes(label)
      ) {
        continue;
      }
      expect(assembly.parts['bolt-carrier'], label).toBeDefined();
      const report = validate(assembly, gunDomain);
      expect(report.resolved.defs.get('bolt-carrier')?.motion, label).toMatchObject({
        kind: 'linear',
        axis: [1, 0, 0],
      });
    }
  });

  it('models the SMG sliding handle as its own receiver-connected linear part with a matching sweep', () => {
    const entry = loadCorpus().find(({ label }) => label === 'design archetype-smg.json');
    expect(entry).toBeDefined();
    const { resolved } = validate(entry!.assembly, gunDomain);
    const receiverDef = resolved.defs.get('receiver')!;
    const handguardDef = resolved.defs.get('handguard')!;
    const movingDef = resolved.defs.get('smg-handle')!;
    const tube = handguardDef.solids.find(({ id }) => id === 'smg-cocking-tube');
    expect(tube?.slot).toBe('metal');
    expect(
      receiverDef.solids.some(
        ({ id }) => id === 'smg-cocking-tube' || id === 'smg-sliding-handle' || id === 'smg-handle-grip',
      ),
    ).toBe(false);
    expect(handguardDef.keepOuts.some(({ id }) => id === 'smg-support-hand')).toBe(true);
    expect(movingDef.solids.map(({ id }) => id)).toEqual(['smg-sliding-handle', 'smg-handle-grip']);
    expect(movingDef.motion).toMatchObject({ kind: 'linear', axis: [1, 0, 0], rest: [0, 0, 0], rearmost: [2.5, 0, 0] });
    const hand = movingDef.keepOuts.find(({ id }) => id === 'smg-handle-hand')!.box;
    const sweep = movingDef.keepOuts.find(({ id }) => id === 'smg-handle-sweep')!.box;
    expect(sweep.center[0] + sweep.half[0] - (hand.center[0] + hand.half[0])).toBe(movingDef.motion!.rearmost[0]);
  });

  it('keeps receiver-shell walls at least 0.5u thick around the carrier cavity', () => {
    const generic = receiver('auto');
    const top = generic.solids.find(({ id }) => id === 'receiver-shell-top');
    const nearSide = generic.solids.find(({ id }) => id === 'receiver-shell-side-near-rear');
    expect(top?.kind).toBe('box');
    expect(nearSide?.kind).toBe('box');
    if (top?.kind === 'box' && nearSide?.kind === 'box') {
      expect(limits(top.box)[1]![1] - limits(top.box)[1]![0]).toBeCloseTo(1.4, 8);
      expect(limits(nearSide.box)[2]![1] - limits(nearSide.box)[2]![0]).toBeCloseTo(0.65, 8);
    }
    const akSide = FAMILIES['ak-receiver']!.build({ action: 'bolt', feed: 'box', bore: 'M' }).solids.find(({ id }) =>
      id.startsWith('receiver-ak-near-side-span-0-region-'),
    );
    expect(akSide?.kind).toBe('extruded-polygon');
    if (akSide?.kind === 'extruded-polygon') {
      expect(akSide.axis).toBe('x');
    }
  });

  it('does not add an ejection port to revolver receivers', () => {
    const revolver = FAMILIES.receiver!.build({ action: 'revolver', feed: 'cylinder', bore: 'S' });
    expect(revolver.keepOuts.some(({ id }) => id === 'ejection')).toBe(false);
    expect(revolver.solids.some(({ id }) => id.startsWith('receiver-shell-side-near'))).toBe(false);
  });

  it('places the AR T-handle at the rear rest face and keeps its pull zone clear', () => {
    const rearTop = handleAndTravel(receiver('auto', 'rear-top'), 'charging-handle');
    expect(rearTop.handle[2]![0]).toBe(rearTop.travel[2]![1]);
    expect(intervalsOverlap(rearTop.handle[0]!, rearTop.travel[0]!)).toBe(true);
    expect(intervalsOverlap(rearTop.handle[1]!, rearTop.travel[1]!)).toBe(true);
    const receiverDef = receiver('auto', 'rear-top');
    expect(receiverDef.solids.filter(({ id }) => id.startsWith('ar-handle-'))).toHaveLength(2);
    const crossbar = receiverDef.solids.find(({ id }) => id === 'ar-handle-crossbar');
    expect(crossbar?.kind).toBe('box');
    if (crossbar?.kind === 'box') {
      const [, receiverTop] = receiverDef.ports.find(({ id }) => id === 'rail')!.pos;
      expect(Math.abs(limits(crossbar.box)[1]![1] - receiverTop)).toBeLessThanOrEqual(0.1);
    }
    expect(receiverDef.keepOuts.some(({ id }) => id === 'rear-t-hand-clearance')).toBe(true);

    const bolt = FAMILIES['bolt-carrier']!.build({ pattern: 'bolt', action: 'bolt', bore: 'M', feed: 'top' });
    const boltHandle = bolt.solids.find(({ id }) => id === 'bolt-handle');
    const boltTravel = bolt.keepOuts.find(({ id }) => id === 'bolt-handle');
    expect(boltHandle?.kind).toBe('box');
    expect(boltTravel).toBeDefined();
    if (boltHandle?.kind === 'box' && boltTravel) {
      expect(limits(boltHandle.box)[0]![1]).toBe(limits(boltTravel.box)[0]![0]);
    }
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
