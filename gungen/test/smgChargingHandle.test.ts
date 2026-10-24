import { motionTransform } from '@skelly/engine/assembly/motion.ts';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import { length } from '@skelly/engine/foundation/math.ts';
import { penetrationWorld, worldSolid } from '@skelly/engine/shapes/geometry.ts';
import { describe, expect, it } from 'vitest';
import { resolveGunAction } from '../src/gun/actionDescription.ts';
import { sweepTurningAction } from '../src/gun/boltSweep.ts';
import { sweepMovingPart } from '../src/gun/cycle.ts';
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

  it.each(smgCases)('holds the handle back once turned into the notch: $label', ({ assembly }) => {
    const { resolved, handle } = smgAction(assembly);
    const motion = handle.def.motion!;
    expect(motion.turn).toBeDefined();
    const guard = [...resolved.defs].find(([, def]) => def.solids.some(({ id }) => id.startsWith('smg-cocking-tube-')));
    if (!guard) {
      throw new Error('SMG fixture needs a cocking tube');
    }
    const walls = guard[1].solids.map((solid) => worldSolid(resolved.placed.get(guard[0])!, solid));
    const blocked = (draw: number, turn: number) =>
      handle.def.solids.some((solid) => {
        const moved = worldSolid(motionTransform(handle.placed, motion, draw, turn), solid);
        return walls.some((wall) => penetrationWorld(moved, wall) > 1e-6);
      });
    expect(blocked(1, 1)).toBe(false);
    expect(blocked(0.5, 0)).toBe(false);
    expect(blocked(0.5, 1)).toBe(true);
  });
});
