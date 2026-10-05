import { Euler, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { AimController, aimDirection } from '../src/core/aim.ts';
import { firearmsSkillEffects } from '../src/core/firearmsSkill.ts';

const step = (overrides: Partial<Parameters<AimController['advance']>[0]> = {}) => ({
  dt: 1 / 60,
  velocity: [0, 0, 0] as [number, number, number],
  blockSize: 0.5,
  yaw: 0,
  pitch: 0,
  variance: 1,
  ...overrides,
});

it('uses camera pitch and yaw without presentation roll at neutral sway', () => {
  const pitch = 0.35;
  const yaw = 1.1;
  const aim = aimDirection(yaw, pitch, { yaw: 0, pitch: 0 });
  const expected = new Vector3(0, 0, -1).applyEuler(new Euler(pitch, yaw, 0, 'YXZ'));
  expect(aim[0]).toBeCloseTo(expected.x, 12);
  expect(aim[1]).toBeCloseTo(expected.y, 12);
  expect(aim[2]).toBeCloseTo(expected.z, 12);
});

it('actual movement and quick look turns increase isolated aim deviation', () => {
  const still = new AimController();
  const moving = new AimController();
  const stillFrame = still.advance(step());
  const movingFrame = moving.advance(step({ velocity: [2, 0, 0] }));
  expect(Math.hypot(movingFrame.yaw, movingFrame.pitch)).toBeGreaterThan(Math.hypot(stillFrame.yaw, stillFrame.pitch));

  const turning = new AimController();
  const steady = new AimController();
  turning.advance(step());
  steady.advance(step());
  const turnedFrame = turning.advance(step({ yaw: 0.6 }));
  const steadyFrame = steady.advance(step());
  expect(Math.abs(turnedFrame.yaw)).toBeGreaterThan(Math.abs(steadyFrame.yaw));
});

it('committed recoil recovers in simulation time and equal inputs stay deterministic', () => {
  const first = new AimController();
  const second = new AimController();
  first.recordShot(73);
  second.recordShot(73);
  const initial = first.advance(step());
  expect(second.advance(step())).toEqual(initial);
  let recovered = initial;
  for (let tick = 0; tick < 90; tick++) {
    recovered = first.advance(step());
    second.advance(step());
  }
  expect(second.frame).toEqual(recovered);
  expect(Math.hypot(recovered.yaw, recovered.pitch)).toBeLessThan(Math.hypot(initial.yaw, initial.pitch));
});

it('the shared aim frame resolves the same camera-local shot direction', () => {
  const frame = { yaw: 0.08, pitch: -0.04 };
  const aimed = aimDirection(0.3, 0.2, frame);
  const neutral = aimDirection(0.3, 0.2, { yaw: 0, pitch: 0 });
  expect(aimed).not.toEqual(neutral);
  expect(Math.hypot(...aimed)).toBeCloseTo(1);
});

it('higher firearms skill reduces variance and committed handling durations', () => {
  const novice = firearmsSkillEffects(0);
  const experienced = firearmsSkillEffects(12);
  expect(experienced.variance).toBeLessThan(novice.variance);
  expect(experienced.reloadDuration).toBeLessThan(novice.reloadDuration);
  expect(experienced.rackDuration).toBeLessThan(novice.rackDuration);
  const seasoned = firearmsSkillEffects(30);
  const saturated = firearmsSkillEffects(100);
  for (const key of ['variance', 'reloadDuration', 'rackDuration'] as const) {
    expect(seasoned[key]).toBeLessThanOrEqual(experienced[key]);
    expect(saturated[key]).toBeGreaterThan(0);
    expect(saturated[key]).toBeLessThanOrEqual(seasoned[key]);
    expect(seasoned[key] - saturated[key]).toBeLessThan(novice[key] - seasoned[key]);
  }
});
