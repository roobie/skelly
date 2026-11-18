import type { Vec3 } from '@skelly/engine/internal/core/coords.ts';
import { partMoves, placeFitting } from '@skelly/engine/internal/core/vehicleBlueprint.ts';
import {
  applyPose,
  carriedIssues,
  fittingPoses,
  IDENTITY_POSE,
  motionPose,
} from '@skelly/engine/internal/core/vehiclePose.ts';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const moving = [...registry.items.values()].filter(({ id, vehicle }) => vehicle && partMoves(registry, id));
type Point = Readonly<Vec3>;
const reflect = ([x, y, z]: Point): Vec3 => [-x, y, z];
const gap = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const corners = ({ min, max }: { readonly min: Point; readonly max: Point }): Vec3[] =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((corner) => [0, 1, 2].map((axis) => ((corner >> axis) & 1 ? max : min)[axis]!) as Vec3);

describe('vehicle part poses', () => {
  it('has moving parts to pose', () => {
    expect(moving.length).toBeGreaterThan(0);
  });

  it('poses a far twin as the reflection of its near twin, for every moving part', () => {
    for (const part of moving) {
      // A test-owned placement off the centreline, so the twins stand apart as authored twins do.
      const near = placeFitting(registry, { id: 'near', part: part.id, at: [0.7, 0.3, 0.2], supportedBy: [] });
      const far = placeFitting(registry, {
        id: 'far',
        part: part.id,
        at: reflect([0.7, 0.3, 0.2]),
        mirror: true,
        supportedBy: [],
      });
      const [nearPose, farPose] = [motionPose(near.motion!, 1), motionPose(far.motion!, 1)];
      const points = near.collision.flatMap(corners);
      expect(points.some((point) => applyPose(nearPose, point).some((value, axis) => value !== point[axis]))).toBe(
        true,
      );
      for (const point of points) {
        expect(gap(applyPose(farPose, reflect(point)), reflect(applyPose(nearPose, point)))).toBeLessThan(1e-9);
      }
    }
  });

  it('leaves a part at rest where it is built, and carries a fitting resting on a moving part with it', () => {
    const part = moving[0]!;
    const door = placeFitting(registry, { id: 'door', part: part.id, at: [0.7, 0.3, 0.2], supportedBy: [] });
    const rigged = (clock: number) =>
      fittingPoses([
        { id: 'door', supportedBy: [], motion: door.motion, clock },
        { id: 'rider', supportedBy: ['door'], clock },
        { id: 'still', supportedBy: [], clock },
      ]);
    for (const pose of rigged(0).values()) {
      expect(pose).toEqual(IDENTITY_POSE);
    }
    const open = rigged(1);
    expect(open.get('rider')).toEqual(open.get('door'));
    expect(open.get('door')).not.toEqual(IDENTITY_POSE);
    expect(open.get('still')).toEqual(IDENTITY_POSE);
  });

  it('refuses a fitting resting on a moving part and on another, however far down it is carried', () => {
    const issues = carriedIssues([
      { id: 'body', supportedBy: [], moves: false },
      { id: 'door', supportedBy: ['body'], moves: true },
      { id: 'band', supportedBy: ['door'], moves: false },
      { id: 'torn', supportedBy: ['band', 'body'], moves: false },
      { id: 'mirror', supportedBy: ['body'], moves: false },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('torn');
  });
});
