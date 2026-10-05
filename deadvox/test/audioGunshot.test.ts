import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import type { SoundEventId } from '../src/core/soundEvents.ts';
import { type SoundEmission, type SoundEmissionMeta, SoundPicker } from '../src/core/soundPicker.ts';
import { GameAudio } from '../src/game/audio.ts';
import {
  firearmShotSound,
  HEARTBEAT_FILES,
  heartbeatForStamina,
} from '../src/game/audioPresentation.ts';

const audios: GameAudio[] = [];

const makeNode = () => ({ connect: vi.fn(), disconnect: vi.fn() });
const makeParam = () => ({ value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
const makeSource = () => ({
  ...makeNode(),
  buffer: null as AudioBuffer | null,
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
  decodeAudioData = vi.fn((data: ArrayBuffer) =>
    Promise.resolve({
      duration: 2,
      heartbeatFile: (data as ArrayBuffer & { heartbeatFile?: string }).heartbeatFile,
    } as unknown as AudioBuffer),
  );

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
  const fetchBuffer = vi.fn((url: string) => {
    const data = new ArrayBuffer(8) as ArrayBuffer & { heartbeatFile?: string };
    const heartbeatFile = Object.values(HEARTBEAT_FILES).find((file) => url.includes(file));
    if (heartbeatFile) {
      data.heartbeatFile = heartbeatFile;
    }
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(data) } as Response);
  });
  vi.stubGlobal('fetch', fetchBuffer);
  const soundData = JSON.parse(readFileSync('src/content/base/sounds.json', 'utf8')) as unknown;
  const { registry, issues } = buildRegistry([{ source: '../content/base/sounds.json', data: soundData }]);
  if (issues.length > 0) {
    throw new Error(`Invalid sound fixture: ${JSON.stringify(issues)}`);
  }
  const isSolid = vi.fn(() => false);
  const audio = new GameAudio({ registry, blockSize: 1, isSolid, report: vi.fn() });
  audios.push(audio);
  const picker = new SoundPicker(53, registry.sounds);
  const selected: SoundEmission[] = [];
  // Playback tests supply selected emissions; GameAudio has no gameplay admission/picker API.
  const play = (event: SoundEventId, position: Vec3, time: number, meta: SoundEmissionMeta = {}) => {
    const pick = picker.pick(event, time)!;
    const emission = {
      event,
      position,
      time,
      pick,
      emittedAsNoise: false,
      sourceLabel: meta.sourceLabel ?? null,
      listenerRelative: meta.listenerRelative ?? false,
    };
    selected.push(emission);
    audio.play(emission, position);
  };
  audio.unlock();
  return { audio, play, selected, context: FakeAudioContext.lastCreated, fetchBuffer, isSolid };
};

// Yield one event-loop turn to settle fetch/decode microtasks, without a timed sleep.
const flush = () => setImmediate();

afterEach(() => {
  for (const audio of audios.splice(0)) {
    audio.dispose();
  }
  vi.unstubAllGlobals();
});

describe('game audio playback', () => {
  it('schedules player-only heartbeat beats at simulated tempo without admitting sound events', async () => {
    const { audio, context, fetchBuffer } = setup();
    const sourceGain = (source: ReturnType<typeof makeSource>) =>
      (source.connect.mock.calls[0]![0] as ReturnType<FakeAudioContext['createGain']>).gain.value;

    audio.updateHeartbeat(86);
    await flush();
    expect(context.sources).toHaveLength(0);
    expect(fetchBuffer).not.toHaveBeenCalled();

    audio.updateHeartbeat(85);
    await flush();
    expect(context.sources).toHaveLength(1);
    expect(sourceGain(context.sources[0]!)).toBeCloseTo(heartbeatForStamina(85).gain);
    expect(context.sources[0]!.playbackRate.value).toBe(1);
    expect(fetchBuffer).toHaveBeenCalled();
    expect(audio.heardSounds).toHaveLength(0);
    expect(context.panners).toHaveLength(0);

    const firstBeatAt = context.sources[0]!.start.mock.calls[0]![0] as number;
    context.currentTime = firstBeatAt + 60 / heartbeatForStamina(85).bpm - 0.01;
    audio.updateHeartbeat(0);
    await flush();
    expect(context.sources).toHaveLength(1);
    context.currentTime += 0.02;
    audio.updateHeartbeat(0);
    await flush();
    expect(context.sources).toHaveLength(2);
    expect(sourceGain(context.sources[1]!)).toBeCloseTo(heartbeatForStamina(0).gain);

    const secondBeatAt = context.sources[1]!.start.mock.calls[0]![0] as number;
    context.currentTime = secondBeatAt + 60 / heartbeatForStamina(0).bpm - 0.01;
    audio.updateHeartbeat(0);
    await flush();
    expect(context.sources).toHaveLength(2);
    context.currentTime += 0.02;
    audio.updateHeartbeat(0);
    await flush();
    expect(context.sources).toHaveLength(3);

    context.currentTime += 1;
    audio.updateHeartbeat(50);
    await flush();
    expect(context.sources).toHaveLength(4);
    expect(sourceGain(context.sources[3]!)).toBeCloseTo(heartbeatForStamina(50).gain);
    expect(context.sources.every(({ playbackRate }) => playbackRate.value === 1)).toBe(true);
    expect(audio.heardSounds).toHaveLength(0);
  });

  it('starts every rapid shot, steals the oldest with a 10ms fade, and bounds even unended tails', async () => {
    const { audio, play, selected, context, fetchBuffer } = setup();
    for (let index = 0; index < 40; index++) {
      play('gunshot', [1, 2, 3], index * 0.02);
      // biome-ignore lint/performance/noAwaitInLoops: exercise ordered warm shots, not another cold burst
      await flush();
      expect(context.sources).toHaveLength(index + 1);
    }
    // Thirty-two full voices and at most thirty-two fading tails, including late onended.
    expect(context.peakConnectedSources).toBeLessThanOrEqual(64);
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
    expect(audio.heardSounds.map(({ file }) => file)).toEqual(
      selected.slice(-audio.heardSounds.length).map(({ pick }) => pick.file),
    );
    expect(context.sources.map(({ playbackRate }) => playbackRate.value)).toEqual(
      selected.map(({ pick }) => pick.pitch),
    );

    // A late ended callback from a stolen voice must not disconnect it twice or release its replacement.
    oldest.onended?.();
    expect(oldest.disconnect).toHaveBeenCalledTimes(1);
    for (const source of context.sources) {
      source.onended?.();
    }
    play('gunshot', [1, 2, 3], 1);
    await flush();
    expect(context.sources).toHaveLength(41);
    expect(context.sources[40]!.stop).not.toHaveBeenCalled();
  });

  it('does not let pending decodes reject trigger pulls and still deduplicates cold loads', async () => {
    const { play, context, fetchBuffer } = setup();
    const complete: Array<(response: Response) => void> = [];
    fetchBuffer.mockImplementation(() => new Promise<Response>((resolve) => complete.push(resolve)));
    for (let index = 0; index < 40; index++) {
      play('gunshot', [0, 0, 0], index * 0.02);
    }
    expect(fetchBuffer).toHaveBeenCalledTimes(2);
    expect(context.sources).toHaveLength(0);
    for (const resolve of complete.reverse()) {
      resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as Response);
    }
    await flush();
    expect(context.sources).toHaveLength(40);
    expect(context.peakConnectedSources).toBeLessThanOrEqual(64);
    // The review's 40-shot cold burst now gives every retiree its fade, in one audio quantum.
    expect(context.sources.flatMap(({ stop }) => stop.mock.calls).every(([when]) => when === 10.01)).toBe(true);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2);
    for (let index = 40; index < 80; index++) {
      play('gunshot', [0, 0, 0], index * 0.02);
    }
    await flush();
    expect(context.sources).toHaveLength(80);
    expect(context.peakConnectedSources).toBe(64);
  });

  it('head-locks the player shot through listener translation and rotation while retaining world-shot routing', async () => {
    const { audio, play, context, isSolid } = setup();
    const cue = firearmShotSound('debug_rifle_assault');
    audio.updateListener([10, 0, 0], [0, 0, -1]);
    play(cue.event, [0, 0, 0], 0, cue);
    audio.updateListener([20, 0, 0], [1, 0, 0]);
    await flush();
    expect(context.panners).toHaveLength(0);
    expect(isSolid).not.toHaveBeenCalled();
    expect(audio.heardSounds[0]).toMatchObject({ distanceMetres: 0, wallRuns: 0, lowpassHz: null });
    audio.updateListener([30, 0, 0], [0, 0, 1]);
    expect(context.panners).toHaveLength(0);

    // Other actors retain the default positional API and world-volume category.
    play('gunshot', [0, 0, 0], 1, { sourceLabel: 'other actor' });
    await flush();
    expect(context.panners).toHaveLength(1);
    expect(audio.heardSounds[1]).toMatchObject({ sourceLabel: 'other actor', distanceMetres: 30 });
  });
});
