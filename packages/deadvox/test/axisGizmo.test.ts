import { describe, expect, it } from 'vitest';
import {
  cameraQuaternion,
  compassDirection,
  formatFacing,
  formatPosition,
  projectPositiveAxes,
} from '../src/debug/axisGizmo.ts';

describe('debug axis orientation aids', () => {
  it('labels world position components in metres', () => {
    expect(formatPosition([1.234, -2, 0])).toBe('X=1.2 m · Y=-2.0 m · Z=0.0 m');
  });

  it('maps yaw to compass directions using north=-Z and east=+X', () => {
    expect(compassDirection(0)).toBe('N');
    expect(compassDirection(Math.PI / 2)).toBe('W');
    expect(compassDirection(-Math.PI / 2)).toBe('E');
    expect(compassDirection(Math.PI)).toBe('S');
    expect(formatFacing(0, Math.PI / 6)).toBe('yaw 0.0° · N · pitch 30.0°');
  });

  it('projects positive world axes for a north-facing level camera', () => {
    const axes = projectPositiveAxes(cameraQuaternion(0, 0));
    expect(axes.map(({ label, x, y, depth }) => [label, x, y, depth])).toEqual([
      ['X', 1, 0, 0],
      ['Y', 0, -1, 0],
      ['Z', 0, 0, 1],
    ]);
  });

  it('rotates projected directions for yaw and pitch', () => {
    const west = projectPositiveAxes(cameraQuaternion(Math.PI / 2, 0));
    expect(west[0]!.depth).toBeCloseTo(1); // +X points into the view while facing west.
    expect(west[2]!.x).toBeCloseTo(-1); // +Z (south) is left of the view.

    const lookingUp = projectPositiveAxes(cameraQuaternion(0, Math.PI / 2));
    expect(lookingUp[1]!.depth).toBeCloseTo(-1); // +Y is above the view.
    expect(lookingUp[2]!.y).toBeCloseTo(-1); // +Z projects up.
  });
});
