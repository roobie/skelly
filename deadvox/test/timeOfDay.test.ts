import { describe, expect, it } from 'vitest';
import { TimeOfDayControls } from '../src/debug/timeOfDay.ts';

const make = (start = 19.5) => {
  const sim = { hour: start };
  return { sim, time: new TimeOfDayControls(() => sim.hour) };
};

describe('debug time of day', () => {
  it('follows the simulation until moved', () => {
    const { sim, time } = make();
    expect(time.hour()).toBe(19.5);
    sim.hour = 20.25;
    expect(time.hour()).toBe(20.25);
    expect(time.label).toBe('20:15');
  });

  it('steps by game hours and wraps at midnight, still following the simulation', () => {
    const { sim, time } = make(22.5);
    time.step(3);
    expect(time.label).toBe('01:30');
    sim.hour = 23;
    expect(time.label).toBe('02:00');
    time.step(-4);
    expect(time.label).toBe('22:00');
  });

  it('holds the hour while frozen and keeps stepping from it', () => {
    const { sim, time } = make(10);
    time.step(1);
    time.toggleFrozen();
    expect(time.frozen).toBe(true);
    sim.hour = 15;
    expect(time.hour()).toBe(11);
    time.step(-1);
    expect(time.label).toBe('10:00');
  });

  it('resumes from the frozen hour without a jump when thawed', () => {
    const { sim, time } = make(10);
    time.toggleFrozen();
    time.step(8);
    sim.hour = 13;
    time.toggleFrozen();
    expect(time.frozen).toBe(false);
    expect(time.hour()).toBe(18);
    sim.hour = 14;
    expect(time.hour()).toBe(19);
  });

  it('shows 20:30 for a stepped half hour despite float drift', () => {
    const { time } = make(19.5 - 1e-12);
    time.step(1);
    expect(time.label).toBe('20:30');
  });
});
