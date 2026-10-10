import { describe, expect, it } from 'vitest';
import { ThirdPersonOrbit } from '../src/game/thirdPersonOrbit.ts';

describe('third-person orbit', () => {
  it('orbits without changing facing and keeps the angle after release', () => {
    const orbit = new ThirdPersonOrbit();
    const facingYaw = 0.4;
    orbit.press(0, true, facingYaw);
    expect(orbit.rotate(80, -20, true, facingYaw)).toBe(true);
    expect(facingYaw).toBe(0.4);
    const rotated = orbit.angle(true);
    expect(rotated?.yaw).not.toBe(facingYaw);
    orbit.release();
    expect(orbit.angle(true)).toEqual(rotated);
    expect(orbit.rotate(10, 0, true, facingYaw)).toBe(false);
  });

  it('allows movement while held but resets on movement after release', () => {
    const orbit = new ThirdPersonOrbit();
    orbit.press(0, true, 0);
    orbit.rotate(80, 0, true, 0);
    const rotated = orbit.angle(true);
    orbit.movementInput();
    expect(orbit.angle(true)).toEqual(rotated);
    orbit.release();
    orbit.movementInput();
    expect(orbit.angle(true)).toBeUndefined();
  });

  it('resets on a double tap', () => {
    const orbit = new ThirdPersonOrbit();
    orbit.press(0, true, 0);
    orbit.rotate(80, 0, true, 0);
    orbit.release();
    orbit.press(100, true, 0);
    expect(orbit.angle(true)).toBeUndefined();
    expect(orbit.rotate(20, 0, true, 0)).toBe(false);
    orbit.release();
    orbit.press(500, true, 0);
    expect(orbit.rotate(20, 0, true, 0)).toBe(true);
  });
});
