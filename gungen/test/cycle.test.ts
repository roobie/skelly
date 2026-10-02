import { describe, expect, it } from 'vitest';
import { resolve } from '../src/core/resolve.ts';
import {
  ACTION_CYCLE_PROFILES,
  cycleMotion,
  ejectionDirection,
  ejectionPoint,
  type GunAction,
  sweepMovingPart,
} from '../src/gun/cycle.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixture } from './helpers.ts';

const resolvedFixture = (name: string) => resolve(loadFixture(name), gunDomain);
const motionFor = (name: string) => {
  const resolved = resolvedFixture(name);
  const motion = resolved.defs.get('bolt-carrier')?.motion;
  if (!motion) {
    throw new Error(`${name} has no bolt-carrier motion`);
  }
  return {
    resolved,
    motion,
    cycle: cycleMotion(name === 'archetype-ak' ? 'ak' : 'ar', motion, resolved.domain.units.metresPerUnit),
  };
};

describe('firearm cycle timelines', () => {
  it('uses the action-specific cyclic rates and matches the estimated rearward speed', () => {
    for (const [name, action, expectedRpm] of [
      ['archetype-ak', 'ak', 600],
      ['archetype-ar', 'ar', 800],
    ] as const) {
      const { cycle } = motionFor(name);
      expect(cycle.rpm).toBe(expectedRpm);
      expect(cycle.fire.durationSeconds).toBeCloseTo(60 / expectedRpm, 9);
      expect(cycle.strokeMetres / cycle.fire.rearwardSeconds).toBeCloseTo(
        ACTION_CYCLE_PROFILES[action].rearwardSpeedMetresPerSecond,
        9,
      );
    }
  });

  it('holds the AR carrier open on empty while the AK returns to battery', () => {
    const ak = motionFor('archetype-ak').cycle;
    const ar = motionFor('archetype-ar').cycle;
    const endOfReturn = (cycle: typeof ak) =>
      cycle.fire.rearwardSeconds + cycle.fire.dwellSeconds + cycle.fire.forwardSeconds;
    expect(ak.fire.at(endOfReturn(ak), true)).toBe(0);
    expect(ar.fire.at(ar.fire.durationSeconds, true)).toBe(1);
    expect(ar.holdOpenOnEmpty).toBe(true);
    expect(ak.holdOpenOnEmpty).toBe(false);
  });

  it('keeps both action ejection directions unit length and differentiates AK and AR throws', () => {
    const { ak, ar } = ACTION_CYCLE_PROFILES;
    for (const direction of [ak.ejectDirection, ar.ejectDirection]) {
      expect(Math.hypot(...direction)).toBeCloseTo(1, 12);
      expect(direction[2]).toBeGreaterThan(0);
    }
    expect(ak.ejectDirection[0]).toBeGreaterThan(0);
    expect(ar.ejectDirection[0]).toBeLessThan(0);
    expect(ak.ejectAt).toBeGreaterThan(0);
    expect(ak.ejectAt).toBeLessThan(1);
    expect(ar.ejectAt).toBeGreaterThan(0);
    expect(ar.ejectAt).toBeLessThan(1);
  });

  it('builds hand-cocking timelines with a smooth pull and faster spring return', () => {
    for (const name of ['archetype-ak', 'archetype-ar']) {
      const { cycle } = motionFor(name);
      const { hand } = cycle;
      expect(hand.at(0)).toBe(0);
      expect(hand.at(hand.rearwardSeconds)).toBeCloseTo(1, 9);
      expect(hand.at(hand.rearwardSeconds + hand.dwellSeconds / 2)).toBe(1);
      expect(hand.at(hand.rearwardSeconds + hand.dwellSeconds + hand.forwardSeconds)).toBe(0);
      expect(hand.at(hand.durationSeconds)).toBe(0);
      expect(hand.at(hand.durationSeconds + hand.rearwardSeconds / 2)).toBeGreaterThan(0);
      expect(hand.durationSeconds).toBeGreaterThan(hand.rearwardSeconds + hand.dwellSeconds + hand.forwardSeconds);
      expect(hand.forwardSeconds * 10).toBeLessThan(hand.rearwardSeconds);
    }
  });
});

describe('motion-derived cycle geometry', () => {
  it('sweeps the AK and M4 carriers clear through their full stroke using placed solids', () => {
    for (const name of ['archetype-ak', 'archetype-ar']) {
      const { resolved, motion, cycle } = motionFor(name);
      const sweep = sweepMovingPart(resolved, 'bolt-carrier', cycle.strokeUnits + 2.5);
      expect(sweep.declared).toBeCloseTo(cycle.strokeUnits, 9);
      expect(sweep.clear).toBeGreaterThanOrEqual(sweep.declared);
      expect(sweep.clashes[0]?.at).toBeGreaterThanOrEqual(sweep.declared);
      expect(motion.end[0]).toBeGreaterThan(motion.start[0]);
    }
  });

  it('locates each case at the receiver ejection opening and transforms its throw direction', () => {
    for (const [name, action] of [
      ['archetype-ak', 'ak'],
      ['archetype-ar', 'ar'],
    ] as const satisfies readonly (readonly [string, GunAction])[]) {
      const { resolved } = motionFor(name);
      const point = ejectionPoint(resolved);
      const direction = ejectionDirection(action);
      expect(point).toBeDefined();
      expect(point?.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...direction)).toBeCloseTo(1, 12);
    }
  });
});
