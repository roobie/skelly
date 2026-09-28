import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/sim.ts';
import { cameraRotation, DamageFeedback } from '../src/game/damageFeedback.ts';

const FRAME = 1 / 60;

describe('damage feedback', () => {
  it('scales subtle and clear hits and fades the vignette within one second', () => {
    const feedback = new DamageFeedback();
    feedback.hit(5);
    const subtle = feedback.step(0);
    expect(subtle.vignetteOpacity).toBeGreaterThan(0);
    expect(subtle.vignetteOpacity).toBeLessThan(0.2);
    feedback.hit(25);
    const clear = feedback.step(0);
    expect(clear.vignetteOpacity).toBeGreaterThan(subtle.vignetteOpacity);
    for (let i = 0; i < 60; i++) {
      feedback.step(FRAME);
    }
    expect(feedback.step(0).vignetteOpacity).toBe(0);
  });

  it('restarts on another hit and returns roll exactly to zero by 0.35 seconds', () => {
    const feedback = new DamageFeedback();
    feedback.hit(25, 1);
    for (let i = 0; i < 4; i++) {
      feedback.step(FRAME);
    }
    expect(feedback.step(0).roll).toBeCloseTo((6 * Math.PI) / 180, 6);
    const beforeHit = feedback.step(8 * FRAME).roll;
    expect(beforeHit).toBeLessThan((6 * Math.PI) / 180);
    feedback.hit(25, 1);
    expect(feedback.step(0).roll).toBe(0);
    for (let i = 0; i < 21; i++) {
      feedback.step(FRAME);
    }
    expect(feedback.step(0).roll).toBe(0);
  });

  it('roll leaves the center aiming ray unchanged', () => {
    const aim = (roll: number) => new Vector3(0, 0, -1).applyEuler(cameraRotation(0.35, 1.1, roll));
    const flat = aim(0);
    const rolled = aim((6 * Math.PI) / 180);
    expect(rolled.x).toBeCloseTo(flat.x, 12);
    expect(rolled.y).toBeCloseTo(flat.y, 12);
    expect(rolled.z).toBeCloseTo(flat.z, 12);
  });

  it('god mode emits no accepted damage event', () => {
    const sim = new Simulation({ seed: 1 });
    const events = sim.events.reader();
    sim.godMode = true;
    sim.hurt(25, 'test');
    expect(events.read().filter((e) => e.kind === 'damage')).toEqual([]);
  });

  it('alternates roll direction without a known source and restarts both effects on another hit', () => {
    const feedback = new DamageFeedback();
    feedback.hit(25);
    expect(Math.sign(feedback.step(0.04).roll)).toBe(-1);
    const fading = feedback.step(0.1);
    expect(fading.vignetteOpacity).toBeLessThan(0.72);
    feedback.hit(25);
    expect(feedback.step(0).vignetteOpacity).toBe(0.72);
    expect(Math.sign(feedback.step(0.04).roll)).toBe(1);
  });

  it('reports the accepted damage amount', () => {
    const sim = new Simulation({ seed: 1 });
    const events = sim.events.reader();
    sim.hurt(25, 'test');
    expect(events.read().find((e) => e.kind === 'damage')).toMatchObject({ kind: 'damage', amount: 25 });
  });
});
