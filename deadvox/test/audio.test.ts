import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameAudio } from '../src/game/audio.ts';

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
      seed: 1,
      blockSize: 1,
      isSolid: () => false,
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
