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

  // Measured about 2 s on a loaded host (load 4-10), too much of vitest's 5 s default; the explicit timeout, about 5x that, keeps it from flaking under load.
  it('uses a separate procedural bolt-carrier part in AR, AK and pump designs', { timeout: 10_000 }, () => {
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

  it('keeps rebuilt revolver geometry out of the generic receiver family', () => {
    const generic = FAMILIES.receiver!.build({ action: 'revolver', feed: 'box', bore: 'S' });
    expect(generic.solids.some(({ id }) => id === 'top-strap')).toBe(false);
    expect(generic.solids.some(({ id }) => id.startsWith('cylinder-side'))).toBe(false);
    expect(generic.keepOuts.some(({ id }) => id === 'cylinder-swing')).toBe(false);
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

  // Measured about 2.8 s on a loaded host (load 4-10), too much of vitest's 5 s default; the explicit timeout, about 5x that, keeps it from flaking under load.
  it('keeps action details valid throughout all fixtures and published designs', { timeout: 15_000 }, () => {
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
