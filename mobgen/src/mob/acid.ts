import type { Feature } from '../core/body.ts';
import { cross, dot, normalize, scale, sub, type Vec3 } from '../core/math.ts';

export interface AcidFeature extends Feature {
  readonly anatomy?: 'palm' | 'digit' | 'pustule';
}

export const frameOf = (head: Vec3, tail: Vec3) => {
  const y = normalize(sub(tail, head));
  const right: Vec3 = [1, 0, 0];
  const alongRight = dot(right, y);
  const reference: Vec3 = Math.abs(alongRight) > Math.cos(Math.PI / 4) ? [0, Math.sign(alongRight), 0] : right;
  const x = normalize(sub(reference, scale(y, dot(reference, y))));
  return { x, y, z: cross(x, y) };
};
