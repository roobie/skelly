import { describe, expect, it } from 'vitest';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { CheckpointSchedule } from '../src/ui/checkpointSchedule.ts';

const interval = BUNDLED_CONTENT.registry.saves.get('autosave')!.checkpointSimSeconds;
// A power-of-two frame keeps the accumulated simulated time exact, so the boundary frame is known.
const FRAME_SIM_SECONDS = 1 / 64;
const framesPerInterval = Math.ceil(interval / FRAME_SIM_SECONDS);

/** Runs `frames` frames, advancing simulated time unless paused, and counts checkpoints that come due. */
const playFrames = (schedule: CheckpointSchedule, clock: { time: number }, frames: number, paused = false) => {
  let checkpoints = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    if (!paused) {
      clock.time += FRAME_SIM_SECONDS;
    }
    if (schedule.due(clock.time)) {
      checkpoints += 1;
    }
  }
  return checkpoints;
};

describe('periodic save checkpoints', () => {
  it('come due once per interval of simulated play and not before', () => {
    const clock = { time: 0 };
    const schedule = new CheckpointSchedule(interval, clock.time);
    expect(playFrames(schedule, clock, framesPerInterval - 1)).toBe(0);
    expect(playFrames(schedule, clock, 1)).toBe(1);
    expect(playFrames(schedule, clock, framesPerInterval)).toBe(1);
  });

  it('never come due while the game is paused', () => {
    const clock = { time: 0 };
    const schedule = new CheckpointSchedule(interval, clock.time);
    expect(playFrames(schedule, clock, 10 * framesPerInterval, true)).toBe(0);
    expect(playFrames(schedule, clock, framesPerInterval)).toBe(1);
  });
});
