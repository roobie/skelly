import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rapierWasmUrl } from '../src/core/rapier.ts';
import { encodeReplay, initializeVehicleReplay, replayPanelQueries } from './fixtures/vehicleRapierReplay.ts';

describe('parked vehicle determinism fixture', () => {
  it('answers non-vacuously and identically on repeated runs through the seam', async () => {
    await initializeVehicleReplay(new Uint8Array(readFileSync(rapierWasmUrl())));
    const replay = replayPanelQueries();
    expect(replay.rayHits, 'ray hits').toBeGreaterThan(0);
    expect(replay.rayMisses, 'ray misses').toBeGreaterThan(0);
    expect(replay.rapierFloats, 'rapier floats').toBeGreaterThan(0);
    expect(replay.contactFrames, 'contact frames').toBeGreaterThan(0);
    expect(replay.points.some((point) => point.isInside)).toBe(true);
    expect(replay.points.some((point) => !point.isInside)).toBe(true);
    expect(replay.overlaps.some(Boolean), 'overlapping boxes').toBe(true);
    expect(replay.flush.some(Boolean), 'flush overlap hits').toBe(true);
    expect(
      replay.flush.some((value) => !value),
      'flush overlap misses',
    ).toBe(true);
    expect(replay.drop.at(-1)!.position.every(Number.isFinite)).toBe(true);
    expect(replay.drop.length).toBe(120);
    expect(encodeReplay(replay)).toEqual(encodeReplay(replayPanelQueries()));
  });
});
