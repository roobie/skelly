import { describe, expect, it } from 'vitest';
import type { Resolved } from '../src/core/resolve.ts';
import { resolve } from '../src/core/resolve.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { revolverAlignment } from '../src/gun/revolver.ts';
import { loadFixture } from './helpers.ts';

const shiftPart = (resolved: Resolved, part: string, delta: readonly [number, number, number]): Resolved => {
  const placed = new Map(resolved.placed);
  const transform = placed.get(part)!;
  placed.set(part, {
    ...transform,
    t: [transform.t[0] + delta[0], transform.t[1] + delta[1], transform.t[2] + delta[2]],
  });
  return { ...resolved, placed };
};

describe('revolver alignment rules', () => {
  const resolved = () => resolve(loadFixture('archetype-revolver'), gunDomain);

  it('rejects a displaced top chamber bore', () => {
    expect(revolverAlignment.topChamberBore(shiftPart(resolved(), 'cylinder', [0, 0.1, 0]))).toBe(false);
  });

  it('rejects a displaced cylinder axis', () => {
    expect(revolverAlignment.cylinderAxis(shiftPart(resolved(), 'cylinder', [0, 0.1, 0]))).toBe(false);
  });

  it('rejects a changed cylinder gap', () => {
    expect(revolverAlignment.cylinderGap(shiftPart(resolved(), 'barrel', [0.1, 0, 0]))).toBe(false);
  });

  it('rejects a topstrap that exceeds the frame envelope', () => {
    const base = resolved();
    const defs = new Map(base.defs);
    const frame = defs.get('frame')!;
    defs.set('frame', {
      ...frame,
      solids: frame.solids.map((solid) =>
        solid.id === 'topstrap' && solid.kind === 'box'
          ? { ...solid, box: { ...solid.box, center: [solid.box.center[0], solid.box.center[1], 10] } }
          : solid,
      ),
    });
    expect(revolverAlignment.topstrapSpan({ ...base, defs })).toBe(false);
  });

  it('rejects a grip disconnected from the frame interface', () => {
    expect(revolverAlignment.gripJoint(shiftPart(resolved(), 'grip', [0.1, 0, 0]))).toBe(false);
  });
});
