import { expect, it } from 'vitest';
import {
  pendingSkyEpisodes,
  type SkyRouteField,
  type SkyRouteFrame,
  skyRouteSummary,
} from '../src/debug/skyRouteMetrics.ts';

const field = (index: number, complete = false): SkyRouteField => ({
  index,
  complete,
  current: complete,
  resident: complete,
});
const frame = (realMs: number, phase: 'cold' | 'warm', eligible: SkyRouteField[]): SkyRouteFrame => ({
  phase,
  realMs,
  intervalRealMs: null,
  frameRealMs: 0,
  serviceRealMs: 0,
  textureRealMs: 0,
  uniformRealMs: 0,
  programRealMs: 0,
  lightingRealMs: 0,
  position: [0, 0, 0],
  estimate: 1,
  eligible,
  stats: { requested: 0, completed: 0, accepted: 0, discarded: 0, volumes: 0, roofFree: 0 },
});
it('fallback episodes keep region-exit and route-end censoring separate from readiness and from a warm revisit', () => {
  const frames = [
    frame(0, 'cold', [field(0), field(1)]),
    frame(4, 'cold', [field(0, true)]),
    frame(7, 'warm', [field(1)]),
    frame(9, 'warm', [field(1)]),
  ];
  const result = pendingSkyEpisodes(frames, (row) => !row.complete);
  expect(result.denominator).toBe(3);
  expect(result.resolvedDenominator).toBe(1);
  expect(result.censoredDenominator).toBe(2);
  expect(result.episodes.map((row) => [row.phase, row.end, row.elapsedRealMs])).toEqual([
    ['cold', 'ready', 4],
    ['cold', 'left-region', 4],
    ['warm', 'route-ended', 2],
  ]);
});
it('an empty route reports unavailable timing rather than a zero-work success', () => {
  const result = skyRouteSummary([], []);
  expect(result.cold.lightingP99RealMs).toBeNull();
  expect(result.warm.sceneFps).toBeNull();
  expect(result.arrivalP99RealMs).toBeNull();
  expect(result.completedJobDenominator).toBe(0);
});
it('job summaries retain outstanding request denominators without treating them as completed arrivals', () => {
  const result = skyRouteSummary(
    [],
    [
      {
        phase: 'cold',
        bounds: { min: [0, 0, 0], max: [1, 1, 1] },
        requestedRealMs: 0,
        dispatchRealMs: null,
        workerRealMs: null,
        latencyRealMs: null,
        resultComplete: null,
      },
    ],
  );
  expect(result.jobDenominator).toBe(1);
  expect(result.censoredJobDenominator).toBe(1);
  expect(result.workerP99RealMs).toBeNull();
});
