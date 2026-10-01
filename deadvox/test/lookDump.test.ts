import { describe, expect, it } from 'vitest';
import { lookDump, lookDumpFilename } from '../src/debug/lookDump.ts';

describe('look settings dump', () => {
  it('gathers the look, world and player into plain data', () => {
    const dump = lookDump({
      toneMapping: 'ACES Filmic',
      exposure: 3,
      srgbBlockColours: true,
      surfacePatterns: false,
      mood: { post: true, bloom: false, film: true, grade: 0.700_000_000_1 },
      fogginess: 0.300_000_000_4,
      shadows: { sun: true, torch: false, distance: 64 },
      performance: { fps: 59.6, frame: { p50: 16.66, p95: 21.04 }, work: { p50: 5.04, p95: 6.25 } },
      gameTime: 'Day 2, 12:00',
      site: 'testHouse',
      seed: 7,
      viewRadiusM: 120,
      blockSizeM: 0.5,
      positionM: [1.234, 2, -3.456],
      yawRad: -1.5708,
      pitchRad: 0.1234,
      rollRad: 0.01,
      buildRevision: 'abc123-dirty',
      url: 'http://localhost:5173/?debug=1&tone=aces',
      now: new Date('2026-10-01T12:34:56.000Z'),
    });
    expect(dump).toEqual({
      timestamp: '2026-10-01T12:34:56.000Z',
      buildRevision: 'abc123-dirty',
      url: 'http://localhost:5173/?debug=1&tone=aces',
      look: {
        toneMapping: 'ACES Filmic',
        exposure: 3,
        srgbBlockColours: true,
        surfacePatterns: false,
        postProcessing: true,
        bloom: false,
        film: true,
        gradeStrength: 0.7,
        fogginess: 0.3,
        shadows: { sun: true, flashlight: false, distanceM: 64 },
        gameTime: 'Day 2, 12:00',
      },
      performance: { fps: 60, frameMs: { p50: 16.7, p95: 21 }, cpuMs: { p50: 5, p95: 6.3 } },
      world: { site: 'testHouse', seed: 7, viewRadiusM: 120, blockSizeM: 0.5 },
      player: { positionM: [1.23, 2, -3.46], yawRad: -1.571, pitchRad: 0.123, cam: '1.23,2.00,-3.46,-90.0,7.1,0.6' },
    });
    expect(JSON.parse(JSON.stringify(dump))).toEqual(dump);
  });

  it('names the file by local date and time', () => {
    expect(lookDumpFilename(new Date(2026, 9, 1, 14, 5, 9))).toBe('deadvox-look-20261001-140509.json');
  });
});
