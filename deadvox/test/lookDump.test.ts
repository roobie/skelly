import { describe, expect, it } from 'vitest';
import { lookDump, lookDumpFilename } from '../src/debug/lookDump.ts';

describe('look settings dump', () => {
  it('gathers the look, world and player into plain data', () => {
    const dump = lookDump({
      toneMapping: 'ACES Filmic',
      exposure: 3,
      srgbBlockColours: true,
      gameTime: 'Day 2, 12:00',
      site: 'testHouse',
      seed: 7,
      viewRadiusM: 120,
      blockSizeM: 0.5,
      positionM: [1.234, 2, -3.456],
      yawRad: -1.5708,
      pitchRad: 0.1234,
      buildRevision: 'abc123-dirty',
      url: 'http://localhost:5173/?debug=1&tone=aces',
      now: new Date('2026-10-01T12:34:56.000Z'),
    });
    expect(dump).toEqual({
      timestamp: '2026-10-01T12:34:56.000Z',
      buildRevision: 'abc123-dirty',
      url: 'http://localhost:5173/?debug=1&tone=aces',
      look: { toneMapping: 'ACES Filmic', exposure: 3, srgbBlockColours: true, gameTime: 'Day 2, 12:00' },
      world: { site: 'testHouse', seed: 7, viewRadiusM: 120, blockSizeM: 0.5 },
      player: { positionM: [1.23, 2, -3.46], yawRad: -1.571, pitchRad: 0.123 },
    });
    expect(JSON.parse(JSON.stringify(dump))).toEqual(dump);
  });

  it('names the file by local date and time', () => {
    expect(lookDumpFilename(new Date(2026, 9, 1, 14, 5, 9))).toBe('deadvox-look-20261001-140509.json');
  });
});
