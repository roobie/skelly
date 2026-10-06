import { PointLight } from 'three';
import { describe, expect, it } from 'vitest';
import { chargedThrowDistance, traceGlowstickLanding } from '../src/core/glowstickThrow.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { GlowstickThrows } from '../src/render/glowstickThrows.ts';

describe('charged glowstick throws', () => {
  it('presents flight without adding a point light to the shader pool', () => {
    const throws = new GlowstickThrows();
    throws.spawn([0, 1, 0], [2, 1, 0], '#62ff81');

    expect(throws.group.children.some((child) => child instanceof PointLight)).toBe(false);
    throws.dispose();
  });

  it('throws farther with a longer charge and caps at the content maximum', () => {
    const maximum = 8;
    const chargeSeconds = 2;
    const short = chargedThrowDistance(maximum, chargeSeconds, chargeSeconds / 4);
    const long = chargedThrowDistance(maximum, chargeSeconds, chargeSeconds / 2);

    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
    expect(chargedThrowDistance(maximum, chargeSeconds, chargeSeconds)).toBe(maximum);
    expect(chargedThrowDistance(maximum, chargeSeconds, chargeSeconds * 2)).toBe(maximum);
  });

  it('settles a charged arc on the thrower side of a near wall', () => {
    const isSolid: SolidAt = (x, y) => y === 0 || (x === 4 && y > 0 && y < 4);
    const landing = traceGlowstickLanding([1.5, 1.5, 1.5], [1, 0, 0], 8, 1, -8, isSolid);

    expect(landing).toBeDefined();
    expect(landing![0]).toBeLessThan(4);
    expect(landing![1]).toBe(1);
  });

  it('stops the charged arc at a low ceiling and settles below it', () => {
    const isSolid: SolidAt = (x, y) => y === 0 || (y === 2 && x < 6);
    const landing = traceGlowstickLanding([1.5, 1.5, 1.5], [1, 0, 0], 8, 1, -8, isSolid);

    expect(landing).toBeDefined();
    expect(landing![0]).toBeLessThan(6);
    expect(landing![1]).toBe(1);
  });
});
