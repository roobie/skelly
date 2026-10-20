import { add, applyDir, applyPoint, compose, type Mat3, scale, sub, type Transform } from '../foundation/math.ts';
import type { PartMotion } from './schema.ts';

/** Part-local turn followed by translation, expressed in the assembly frame. */
export const motionTransform = (placed: Transform, motion: PartMotion, draw: number, turn = 0): Transform => {
  const phase = motion.turn;
  if (!phase) {
    return { r: placed.r, t: add(placed.t, applyDir(placed, scale(sub(motion.end, motion.start), draw))) };
  }
  const [x, y, z] = phase.axis;
  const angle = phase.angleRadians * turn;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const v = 1 - c;
  const r: Mat3 = [
    x * x * v + c,
    x * y * v - z * s,
    x * z * v + y * s,
    y * x * v + z * s,
    y * y * v + c,
    y * z * v - x * s,
    z * x * v - y * s,
    z * y * v + x * s,
    z * z * v + c,
  ];
  const rotation: Transform = { r, t: [0, 0, 0] };
  const local: Transform = {
    r,
    t: add(sub(phase.pivot, applyPoint(rotation, phase.pivot)), scale(sub(motion.end, motion.start), draw)),
  };
  return compose(placed, local);
};
