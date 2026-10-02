import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { GameAudio } from '../src/game/audio.ts';

const makeNode = () => ({ connect: vi.fn(), disconnect: vi.fn() });

class FakeAudioContext {
  static lastCreated: FakeAudioContext | undefined;
  state = 'running';
  destination = makeNode();
  listener = { setPosition: vi.fn(), setOrientation: vi.fn() };
  sources: Array<{ onended: (() => void) | null; start: ReturnType<typeof vi.fn> }> = [];
  decodeAudioData = vi.fn(() => Promise.resolve({ duration: 2 } as AudioBuffer));

  constructor() {
    FakeAudioContext.lastCreated = this;
  }

  createGain() {
    return { ...makeNode(), gain: { value: 1 } };
  }

  createBiquadFilter() {
    return { ...makeNode(), type: 'lowpass', frequency: { value: 0 } };
  }

  createPanner() {
    return { ...makeNode(), setPosition: vi.fn() };
  }

  createBufferSource() {
    const source = {
      ...makeNode(),
      buffer: null,
      playbackRate: { value: 1 },
      onended: null as (() => void) | null,
      start: vi.fn(),
    };
    source.start.mockImplementation(() => this.sources.push(source));
    return source;
  }

  resume() {
    return Promise.resolve();
  }
}

describe('firearm sound playback', () => {
  it('caps overlapping gunshots without cutting active shots or decoding a buffer per shot', async () => {
    FakeAudioContext.lastCreated = undefined;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const fetched: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        fetched.push(String(input));
        return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as Response);
      }),
    );
    const soundData = JSON.parse(readFileSync('src/content/base/sounds.json', 'utf8')) as unknown;
    const { registry, issues } = buildRegistry([{ source: '../content/base/sounds.json', data: soundData }]);
    expect(issues).toEqual([]);
    const audio = new GameAudio({ registry, seed: 17, blockSize: 1, isSolid: () => false, report: vi.fn() });
    audio.unlock();
    const audioContext = FakeAudioContext.lastCreated!;

    for (let index = 0; index < 4; index++) {
      expect(audio.play('gunshot', [1, 2, 3], index * 0.001, { sourceLabel: 'debug_rifle_assault' })).toBe(true);
    }
    expect(audio.play('gunshot', [1, 2, 3], 0.01)).toBe(false);
    await vi.waitFor(() => expect(audioContext.sources).toHaveLength(4));

    expect(audioContext.sources.every(({ start }) => start.mock.calls.length === 1)).toBe(true);
    expect(audioContext.sources.every(({ onended }) => onended !== null)).toBe(true);
    expect(new Set(audio.heardSounds.map(({ file }) => file))).toEqual(
      new Set(['assets/audio/gunshot-akm-01.ogg', 'assets/audio/gunshot-akm-02.ogg']),
    );
    expect(fetched).toHaveLength(2);
    expect(audioContext.decodeAudioData).toHaveBeenCalledTimes(2);

    audioContext.sources[0]!.onended?.();
    expect(audio.play('gunshot', [1, 2, 3], 0.02)).toBe(true);
    await vi.waitFor(() => expect(audioContext.sources).toHaveLength(5));
    expect(audioContext.sources.slice(1).every(({ start }) => start.mock.calls.length === 1)).toBe(true);
  });
});
