import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import type { FirearmTrajectory } from '../src/game/firearmHandling.ts';
import { IMPACT_MARK_CAP, ImpactEffects, PING_SECONDS } from '../src/render/impactEffects.ts';
import { traceShot } from '../src/render/shotTrace.ts';

const plane = (x: number, y: number, z: number): boolean => x === 3 && y >= 0 && z === 0;
const normalize = (direction: Vec3): Vec3 => {
  const length = Math.hypot(...direction);
  return direction.map((value) => value / length) as Vec3;
};

const trajectory = (y: number, direction: Vec3 = [1, 0, 0]): FirearmTrajectory => ({
  eye: [0.5, y, 0.5],
  muzzle: [0.5, y, 0.5],
  origin: [0.5, y, 0.5],
  directions: [normalize(direction)],
});

describe('shot traces and diegetic impacts', () => {
  it('stops at the first of two surfaces and follows the supplied spread direction', () => {
    const visited: { solid: boolean }[] = [];
    const layered = (x: number, y: number, z: number): boolean => {
      const solid = (x === 3 || x === 6) && y >= 0 && z === 0;
      visited.push({ solid });
      return solid;
    };
    const straight = traceShot([0.5, 0.5, 0.5], [[1, 0, 0]], 12, layered)[0]!;
    const spread = traceShot([0.5, 0.5, 0.5], [normalize([1, 0.6, 0])], 12, plane)[0]!;
    expect(straight.hit).toBeDefined();
    expect(spread.hit).toBeDefined();
    expect(visited.at(-1)?.solid).toBe(true);
    expect(visited.slice(0, -1).every(({ solid }) => !solid)).toBe(true);
    expect(spread.endpoint[1]).not.toBe(straight.endpoint[1]);
  });

  it('reuses the oldest impact slot without growing the presentation pool', () => {
    const effects = new ImpactEffects(0.5, plane);
    const initialChildren = effects.group.children.length;
    effects.fire(trajectory(0.5), false);
    const firstMatrix = new Matrix4();
    effects.holes.getMatrixAt(0, firstMatrix);
    const firstPosition = new Vector3().setFromMatrixPosition(firstMatrix);
    for (let i = 1; i <= IMPACT_MARK_CAP; i++) {
      effects.fire(trajectory(i + 0.5), false);
    }
    const boundedCount = effects.activeMarks;
    expect(boundedCount).toBeGreaterThan(1);
    expect(boundedCount).toBeLessThanOrEqual(IMPACT_MARK_CAP);
    effects.fire(trajectory(IMPACT_MARK_CAP + 1.5), false);
    expect(effects.activeMarks).toBe(boundedCount);
    expect(effects.group.children.length).toBe(initialChildren);
    effects.holes.getMatrixAt(0, firstMatrix);
    expect(new Vector3().setFromMatrixPosition(firstMatrix).y).not.toBe(firstPosition.y);
    effects.dispose();
  });

  it('pings content-designated target hits and fades the ping', () => {
    const effects = new ImpactEffects(0.5, plane, (block) => block[0] === 3);
    effects.fire(trajectory(0.5), false);
    const pingMatrix = new Matrix4();
    effects.pings.getMatrixAt(0, pingMatrix);
    expect(pingMatrix.determinant()).not.toBe(0);
    effects.update(PING_SECONDS, false);
    effects.pings.getMatrixAt(0, pingMatrix);
    expect(pingMatrix.determinant()).toBe(0);
    effects.dispose();

    const nonTargetEffects = new ImpactEffects(0.5, plane, () => false);
    nonTargetEffects.fire(trajectory(0.5), false);
    nonTargetEffects.pings.getMatrixAt(0, pingMatrix);
    expect(pingMatrix.determinant()).toBe(0);
    nonTargetEffects.dispose();
  });

  it('draws the laser to the same traced impact used by the mark', () => {
    const effects = new ImpactEffects(0.5, plane);
    effects.fire(trajectory(0.5, [1, 0.4, 0]), true);
    const holeMatrix = new Matrix4();
    effects.holes.getMatrixAt(0, holeMatrix);
    const hole = new Vector3().setFromMatrixPosition(holeMatrix);
    const laserEnd = (effects.laser.geometry.getAttribute('position').array as Float32Array).slice(3, 6);
    expect(effects.laser.visible).toBe(true);
    expect(Math.hypot(laserEnd[0]! - hole.x, laserEnd[1]! - hole.y, laserEnd[2]! - hole.z)).toBeLessThan(0.01);
    effects.dispose();
  });

  it('keeps updated laser segments from being rejected by stale geometry bounds', () => {
    const effects = new ImpactEffects(0.5, () => false);
    effects.fire({ eye: [100, 30, 20], muzzle: [100, 30, 20], origin: [100, 30, 20], directions: [[1, 0, 0]] }, true);
    effects.laser.geometry.computeBoundingSphere();
    effects.fire({ eye: [-100, -20, 100], muzzle: [-100, -20, 100], origin: [-100, -20, 100], directions: [[0, 0, 1]] }, true);
    const { boundingSphere } = effects.laser.geometry;
    const positions = effects.laser.geometry.getAttribute('position');
    let allEndpointsInsideBounds = boundingSphere !== null;
    for (let i = 0; i < effects.laser.geometry.drawRange.count; i++) {
      allEndpointsInsideBounds &&= boundingSphere!.containsPoint(new Vector3().fromBufferAttribute(positions, i));
    }
    expect(effects.laser.frustumCulled === false || allEndpointsInsideBounds).toBe(true);
    effects.dispose();
  });

  it('traces from the eye when the firearm mechanics selects it for a blocked muzzle', () => {
    const blockSize = 0.5;
    const wallX = 1;
    const eye: Vec3 = [0.5, 0.5, 0.5];
    const effects = new ImpactEffects(blockSize, (x) => x === wallX);
    effects.fire(
      {
        eye,
        muzzle: [2.5, 0.5, 0.5],
        origin: eye,
        directions: [[1, 0, 0]],
      },
      false,
    );
    expect(effects.activeMarks).toBe(1);
    const holeMatrix = new Matrix4();
    effects.holes.getMatrixAt(0, holeMatrix);
    const mark = new Vector3().setFromMatrixPosition(holeMatrix);
    expect(mark.x).toBeLessThan(wallX * blockSize);
    expect(mark.x).toBeGreaterThan(eye[0] * blockSize);
    effects.dispose();
  });
});
