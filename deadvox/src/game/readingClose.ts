import type { Simulation } from '../core/sim.ts';

export const stopReadingOnClose = (sim: Simulation): void => {
  const job = sim.actions.job;
  if (job?.jobType === 'reading' && !job.stopped) {
    sim.actions.stop();
  }
  const remaining = sim.actions.job;
  if (sim.compression.c > 1 && (!remaining || remaining.stopped)) {
    // Closing the page must return movement input immediately, not after compression ramps down.
    sim.compression.snap();
  }
};
