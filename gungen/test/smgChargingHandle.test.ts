import { motionTransform } from '@skelly/engine/assembly/motion.ts';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import { length } from '@skelly/engine/foundation/math.ts';
import { penetrationWorld, worldSolid } from '@skelly/engine/shapes/geometry.ts';
import { describe, expect, it } from 'vitest';
import { resolveGunAction } from '../src/gun/actionDescription.ts';
import { sweepTurningAction } from '../src/gun/boltSweep.ts';
import { advanceCycleClock, cycleMotion, sweepMovingPart } from '../src/gun/cycle.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadCorpus } from './helpers.ts';

const smgCases = loadCorpus().filter(({ label }) => label.includes('smg'));

const smgAction = (assembly: (typeof smgCases)[number]['assembly']) => {
  const resolved = resolve(assembly, gunDomain);
  const action = resolveGunAction(resolved);
  if (!action?.parts.handle) {
    throw new Error('SMG fixture needs a resolved action with a paired handle');
  }
  return { resolved, action, handle: action.parts.handle };
};

describe('SMG charging handle', () => {
  it('finds SMG designs to check', () => {
    expect(smgCases.length).toBeGreaterThan(0);
  });

  it.each(smgCases)('resolves a hand-only handle that opens the bolt fully: $label', ({ assembly }) => {
    const { action, handle } = smgAction(assembly);
    expect(action.kind).toBe('smg');
    expect(action.carrier.modes).toContain('fire');
    expect(handle.modes).toEqual(['hand']);
    expect(length(handle.travel)).toBeGreaterThanOrEqual(length(action.carrier.travel) - 1e-9);
  });

  it.each(smgCases)('clears every mover over its travel and the handle into the notch: $label', ({ assembly }) => {
    const { resolved, action } = smgAction(assembly);
    expect(sweepTurningAction(resolved)).toEqual([]);
    for (const part of Object.values(action.parts)) {
      const sweep = sweepMovingPart(resolved, part.id, length(part.travel));
      expect(sweep.clashes, part.id).toEqual([]);
      expect(sweep.clear, part.id).toBeGreaterThanOrEqual(sweep.declared - 1e-9);
    }
  });

  it('rejects a notch turn that is not finite, not positive or does not fit inside the dwell', () => {
    const [first] = smgCases;
    const { resolved, action } = smgAction(first!.assembly);
    const { motion } = action.carrier.def;
    const { metresPerUnit } = resolved.domain.units;
    const build = (notchTurnSeconds: number) => cycleMotion('smg', motion!, metresPerUnit, { notchTurnSeconds });
    const { dwellSeconds, rearwardSeconds } = action.cycle.hand;
    const fits = dwellSeconds / 4;
    expect(build(fits).hand.holdSeconds).toBeCloseTo(rearwardSeconds + fits, 9);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -fits, dwellSeconds / 2]) {
      expect(() => build(bad), String(bad)).toThrow(RangeError);
    }
  });

  it.each(smgCases)('holds the handle in the notch until released, then returns it: $label', ({ assembly }) => {
    const { resolved, action, handle } = smgAction(assembly);
    const { hand } = action.cycle;
    const motion = handle.def.motion!;
    const guard = [...resolved.defs].find(([, def]) => def.solids.some(({ id }) => id.startsWith('smg-cocking-tube-')));
    if (!(guard && hand.turnAt && hand.holdSeconds !== undefined)) {
      throw new Error('SMG fixture needs a cocking tube and a hand hold');
    }
    const walls = guard[1].solids.map((solid) => worldSolid(resolved.placed.get(guard[0])!, solid));
    const blocked = (draw: number, turn: number) =>
      handle.def.solids.some((solid) => {
        const moved = worldSolid(motionTransform(handle.placed, motion, draw, turn), solid);
        return walls.some((wall) => penetrationWorld(moved, wall) > 1e-6);
      });
    const step = hand.durationSeconds / 40;
    const run = (from: number, steps: number, hold: boolean) => {
      const poses: { readonly time: number; readonly draw: number; readonly turn: number }[] = [];
      let time = from;
      for (let index = 0; index < steps; index++) {
        time = advanceCycleClock(hand, time, step, hold);
        poses.push({ time, draw: hand.at(time), turn: hand.turnAt!(time) });
      }
      return poses;
    };
    // Held for three cycles: the clock reaches the hold point and stays, rear and turned.
    const held = run(0, 120, true);
    const last = held.at(-1)!;
    expect(last.time).toBe(hand.holdSeconds);
    expect(held.filter(({ time }) => time === last.time).length).toBeGreaterThan(1);
    expect(last.draw).toBeCloseTo(1, 9);
    expect(last.turn).toBeCloseTo(1, 9);
    expect(action.carrier.modes).toContain('hand');
    // The notch is what holds it: the turned handle cannot go forward.
    expect(blocked(0.5, last.turn)).toBe(true);
    // Released: it turns out of the notch before it moves forward, and reaches home.
    const released = run(last.time, 40, false);
    for (const pose of [...held, ...released]) {
      if (pose.turn > 1e-9) {
        expect(pose.draw, `turned at ${pose.time}`).toBeCloseTo(1, 9);
      }
      expect(blocked(pose.draw, pose.turn), `pose at ${pose.time}`).toBe(false);
    }
    expect(released.some(({ draw, turn }) => draw < 1e-9 && turn < 1e-9)).toBe(true);
  });
});
