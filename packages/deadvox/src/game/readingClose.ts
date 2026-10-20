import type { Simulation } from '../core/sim.ts';

export const stopReadingOnClose = (sim: Simulation): void => {
  const { actions, compression } = sim;
  const { job } = actions;
  if (job?.jobType === 'reading' && !job.stopped) {
    actions.stop();
  }
  const { job: remaining } = actions;
  if (compression.c > 1 && (!remaining || remaining.stopped)) {
    // Closing the page must return movement input immediately, not after compression ramps down.
    compression.snap();
  }
};
