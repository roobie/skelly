import { describe, expect, it } from 'vitest';
import { amalgamTentaclePose } from '../src/render/amalgamTentaclePose.ts';

describe('amalgam attack tentacle pose', () => {
  it('extends toward the player through windup and strike, then retracts within attack reach', () => {
    const start: [number, number, number] = [0, 0, 0];
    const target: [number, number, number] = [3, 0, 4];
    const reachMetres = Math.hypot(target[0] - start[0], target[1] - start[1], target[2] - start[2]);
    const windupSeconds = 0.4;
    const cooldownSeconds = 1.8;
    const pose = (attackWindup: number, attackWait: number) =>
      amalgamTentaclePose({
        start,
        target,
        facing: [0, 0, -1],
        reachMetres,
        anchorOffsetMetres: 1,
        attackWindupSimSeconds: attackWindup,
        attackWindupDurationSimSeconds: windupSeconds,
        attackWaitSimSeconds: attackWait,
        attackCooldownDurationSimSeconds: cooldownSeconds,
      });

    const idle = pose(0, 0);
    const windupStart = pose(windupSeconds, cooldownSeconds);
    const windupMidpoint = pose(windupSeconds / 2, cooldownSeconds - windupSeconds / 2);
    const strike = pose(0, cooldownSeconds - windupSeconds);
    const retracting = pose(0, cooldownSeconds - windupSeconds * 1.5);

    expect(idle.extension).toBe(0);
    expect(windupStart.extension).toBe(0);
    expect(windupMidpoint.extension).toBeGreaterThan(windupStart.extension);
    expect(strike.extension).toBeGreaterThan(windupMidpoint.extension);
    expect(retracting.extension).toBeLessThan(strike.extension);
    expect(strike.start).not.toEqual(start);
    const dx = strike.end[0] - start[0];
    const dy = strike.end[1] - start[1];
    const dz = strike.end[2] - start[2];
    expect(Math.hypot(dx, dy, dz)).toBeLessThanOrEqual(reachMetres + 1e-9);
    expect(dx * (target[0] - start[0]) + dy * (target[1] - start[1]) + dz * (target[2] - start[2])).toBeGreaterThan(0);
  });

  it('stays retracted when the amalgam has no remaining attack reach', () => {
    const pose = amalgamTentaclePose({
      start: [0, 0, 0],
      target: [1, 0, 0],
      facing: [1, 0, 0],
      reachMetres: 0,
      anchorOffsetMetres: 1,
      attackWindupSimSeconds: 0.1,
      attackWindupDurationSimSeconds: 0.4,
      attackWaitSimSeconds: 0.3,
      attackCooldownDurationSimSeconds: 1.8,
    });

    expect(pose.extension).toBe(0);
    expect(pose.end).toEqual(pose.start);
  });
});
