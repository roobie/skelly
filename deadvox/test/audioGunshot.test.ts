import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { GameAudio } from '../src/game/audio.ts';
import { firearmShotSound } from '../src/game/audioPresentation.ts';

const makeNode = () => ({ connect: vi.fn(), disconnect: vi.fn() });
const makeParam = () => ({ value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
const makeSource = () => ({
  ...makeNode(),
  buffer: null,
  playbackRate: { value: 1 },
  onended: null as (() => void) | null,
  start: vi.fn(),
  stop: vi.fn(),
});

class FakeAudioContext {
  static lastCreated: FakeAudioContext;
  currentTime = 10;
  state = 'running';
  destination = makeNode();
  listener = { setPosition: vi.fn(), setOrientation: vi.fn() };
  sources: ReturnType<typeof makeSource>[] = [];
  panners: ReturnType<typeof makeNode>[] = [];
  peakConnectedSources = 0;
  decodeAudioData = vi.fn(() => Promise.resolve({ duration: 2 } as AudioBuffer));

  constructor() {
    FakeAudioContext.lastCreated = this;
  }

  createGain() {
    return { ...makeNode(), gain: makeParam() };
  }

  createBiquadFilter() {
    return { ...makeNode(), type: 'lowpass', frequency: { value: 0 } };
  }

  createPanner() {
    const node = { ...makeNode(), setPosition: vi.fn() };
    this.panners.push(node);
    return node;
  }

  createBufferSource() {
    const source = makeSource();
    source.start.mockImplementation(() => {
      this.sources.push(source);
      this.peakConnectedSources = Math.max(
        this.peakConnectedSources,
        this.sources.filter(({ disconnect }) => disconnect.mock.calls.length === 0).length,
      );
    });
    return source;
  }

  resume() {
    return Promise.resolve();
  }
}

const setup = () => {
  vi.stubGlobal('AudioContext', FakeAudioContext);
  const fetchBuffer = vi.fn(() =>
    Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as Response),
  );
  vi.stubGlobal('fetch', fetchBuffer);
  const soundData = JSON.parse(readFileSync('src/content/base/sounds.json', 'utf8')) as unknown;
  const { registry, issues } = buildRegistry([{ source: '../content/base/sounds.json', data: soundData }]);
  if (issues.length > 0) {
    throw new Error(`Invalid sound fixture: ${JSON.stringify(issues)}`);
  }
  const isSolid = vi.fn(() => false);
  const audio = new GameAudio({ registry, seed: 17, blockSize: 1, isSolid, report: vi.fn() });
  audio.unlock();
  return { audio, context: FakeAudioContext.lastCreated, fetchBuffer, isSolid };
};

// Yield one event-loop turn to settle fetch/decode microtasks, without a timed sleep.
const flush = () => setImmediate();

afterEach(() => vi.unstubAllGlobals());

describe('firearm sound playback', () => {
  it('starts every rapid shot, steals the oldest with a 10ms fade, and bounds even unended tails', async () => {
    const { audio, context, fetchBuffer } = setup();
    for (let index = 0; index < 40; index++) {
      expect(audio.play('gunshot', [1, 2, 3], index * 0.02)).toBe(true);
      // biome-ignore lint/performance/noAwaitInLoops: exercise ordered warm shots, not another cold burst
      await flush();
      expect(context.sources).toHaveLength(index + 1);
    }
    // Thirty-two full voices and at most one fading tail, even if onended has not been delivered.
    expect(context.peakConnectedSources).toBeLessThanOrEqual(33);
    const oldest = context.sources[0]!;
    const gain = oldest.connect.mock.calls[0]![0] as GainNode;
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(expect.any(Number), 10);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10.01);
    expect(oldest.stop).toHaveBeenCalledWith(10.01);
    expect(context.sources.every(({ start }) => start.mock.calls.length === 1)).toBe(true);
    expect(new Set(audio.heardSounds.map(({ file }) => file))).toEqual(
      new Set(['assets/audio/gunshot-akm-01.ogg', 'assets/audio/gunshot-akm-02.ogg']),
    );
    expect(fetchBuffer).toHaveBeenCalledTimes(2);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2);

    // A late ended callback from a stolen voice must not disconnect it twice or release its replacement.
    oldest.onended?.();
    expect(oldest.disconnect).toHaveBeenCalledTimes(1);
    for (const source of context.sources) {
      source.onended?.();
    }
    expect(audio.play('gunshot', [1, 2, 3], 1)).toBe(true);
    await flush();
    expect(context.sources).toHaveLength(41);
    expect(context.sources[40]!.stop).not.toHaveBeenCalled();
  });

  it('does not let pending decodes reject trigger pulls and still deduplicates cold loads', async () => {
    const { audio, context, fetchBuffer } = setup();
    const complete: Array<(response: Response) => void> = [];
    fetchBuffer.mockImplementation(() => new Promise<Response>((resolve) => complete.push(resolve)));
    for (let index = 0; index < 36; index++) {
      expect(audio.play('gunshot', [0, 0, 0], index * 0.02)).toBe(true);
    }
    expect(fetchBuffer).toHaveBeenCalledTimes(2);
    expect(context.sources).toHaveLength(0);
    for (const resolve of complete.reverse()) {
      resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as Response);
    }
    await flush();
    expect(context.sources).toHaveLength(36);
    expect(context.peakConnectedSources).toBeLessThanOrEqual(33);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2);
  });

  it('head-locks the player shot through listener translation and rotation while retaining world-shot routing', async () => {
    const { audio, context, isSolid } = setup();
    const cue = firearmShotSound('debug_rifle_assault');
    audio.updateListener([10, 0, 0], [0, 0, -1]);
    expect(audio.play(cue.event, [0, 0, 0], 0, cue)).toBe(true);
    audio.updateListener([20, 0, 0], [1, 0, 0]);
    await flush();
    expect(context.panners).toHaveLength(0);
    expect(isSolid).not.toHaveBeenCalled();
    expect(audio.heardSounds[0]).toMatchObject({ distanceMetres: 0, wallRuns: 0, lowpassHz: null });
    audio.updateListener([30, 0, 0], [0, 0, 1]);
    expect(context.panners).toHaveLength(0);

    // Other actors retain the default positional API and world-volume category.
    expect(audio.play('gunshot', [0, 0, 0], 1, { sourceLabel: 'other actor' })).toBe(true);
    await flush();
    expect(context.panners).toHaveLength(1);
    expect(audio.heardSounds[1]).toMatchObject({ sourceLabel: 'other actor', distanceMetres: 30 });
  });
});
