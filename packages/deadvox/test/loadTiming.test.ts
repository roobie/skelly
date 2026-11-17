import { afterEach, expect, it } from 'vitest';
import { LoadTiming } from '../src/loadTiming.ts';

afterEach(() => {
  performance.clearMarks();
  performance.clearMeasures();
});

const measured = (): string[] => performance.getEntriesByType('measure').map(({ name }) => name);

it('skips a phase whose start was never marked instead of throwing into the frame loop', () => {
  const timing = new LoadTiming(false);
  timing.mark('entry module ready');

  // A start flow that marks no world load start, as the replay path once did.
  expect(() => timing.firstPlayableFrame()).not.toThrow();

  expect(measured()).toContain('deadvox load: total to first playable frame');
  expect(measured()).not.toContain('deadvox load: world generation, spawn and mesh build');
});
