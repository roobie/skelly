import { afterEach, describe, expect, it, vi } from 'vitest';
import { simRate, simSeconds } from '../src/core/time.ts';
import { GameAudio } from '../src/game/audio.ts';

const senseTuning = {
  id: 'fixture_player',
  crouch: { speedMetresPerSimSecond: simRate(0.8), hearingRangeScale: 0.5, sightRangeScale: 0.5, eyeDropMetres: 0.6 },
  wall: { hearingRangeScale: 0.5, gain: 0.5, cutoffHz: 1200, clearGain: 1, clearCutoffHz: 18_000 },
  light: {
    playerDaySightScale: 0,
    lureRangeScale: 0,
    throwMaxDistanceMetres: 8,
    throwChargeSimSeconds: simSeconds(1.25),
    throwMinimumHoldSimSeconds: simSeconds(0.8),
    throwStanceDropHoldRealSeconds: 1,
    throwArmSpeedMetresPerRealSecond: 6,
    throwArmEnergyJoules: 20,
  },
} as const;

afterEach(() => vi.unstubAllGlobals());

describe('GameAudio Web Audio compatibility', () => {
  it('updates Firefox-style listeners through their legacy transform methods', () => {
    const transforms: number[][] = [];
    class LegacyAudioContext {
      state = 'suspended';
      destination = {};
      listener = {
        setPosition: (...values: number[]) => transforms.push(values),
        setOrientation: (...values: number[]) => transforms.push(values),
      };
      createGain() {
        return { gain: { value: 0 }, connect: () => undefined };
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
    }
    vi.stubGlobal('AudioContext', LegacyAudioContext);
    const audio = new GameAudio({
      registry: { sounds: new Map(), soundOrigins: new Map() } as never,
      blockSize: 1,
      isSolid: () => false,
      tuning: senseTuning,
      report: () => undefined,
    });

    expect(() => audio.unlock()).not.toThrow();
    expect(transforms).toEqual([
      [0, 0, 0],
      [0, 0, -1, 0, 1, 0],
    ]);
    audio.updateListener([3, 4, 5], [1, 0, 0]);
    expect(transforms.slice(2)).toEqual([
      [3, 4, 5],
      [1, 0, 0, 0, 1, 0],
    ]);
  });
});
