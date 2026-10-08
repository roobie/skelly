import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Rng } from '../src/core/random.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SoundEventId } from '../src/core/soundEvents.ts';
import { type SoundEmission, type SoundEmissionMeta, SoundPicker } from '../src/core/soundPicker.ts';
import { simRate, simSeconds } from '../src/core/time.ts';
import { World } from '../src/core/world.ts';
import { hearVocalNoise } from '../src/core/zombies.ts';
import { GameAudio } from '../src/game/audio.ts';
import { firearmShotSound, HEARTBEAT_FILES, heartbeatForStamina } from '../src/game/audioPresentation.ts';
import { createSession, IDLE } from '../src/game/session.ts';

const audios: GameAudio[] = [];
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

const makeNode = () => ({ connect: vi.fn(), disconnect: vi.fn() });
const makeParam = () => ({ value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
const makeGain = () => ({ ...makeNode(), gain: makeParam() });
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
  gainNodes: ReturnType<typeof makeGain>[] = [];
  panners: Array<ReturnType<typeof makeNode> & { setPosition: (x: number, y: number, z: number) => unknown }> = [];
  peakConnectedSources = 0;
  decodeAudioData = vi.fn((data: ArrayBuffer) => {
    const { heartbeatFile } = data as ArrayBuffer & { heartbeatFile?: string };
    let duration = 2;
    if (heartbeatFile === HEARTBEAT_FILES.slow) {
      duration = 0.6;
    } else if (heartbeatFile === HEARTBEAT_FILES.fast) {
      duration = 0.3;
    }
    return Promise.resolve({ duration, heartbeatFile } as unknown as AudioBuffer);
  });

  constructor() {
    FakeAudioContext.lastCreated = this;
  }

  createGain() {
    const node = makeGain();
    this.gainNodes.push(node);
    return node;
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

const setup = (solidAt: SolidAt = () => false, registryOverride?: Registry) => {
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
  const { registry, issues } = registryOverride
    ? { registry: registryOverride, issues: [] }
    : buildRegistry([{ source: '../content/base/sounds.json', data: soundData }]);
  if (issues.length > 0) {
    throw new Error(`Invalid sound fixture: ${JSON.stringify(issues)}`);
  }
  const isSolid = vi.fn(solidAt);
  const audio = new GameAudio({ registry, blockSize: 1, isSolid, tuning: senseTuning, report: vi.fn() });
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
    expect((context.sources[0]!.buffer as (AudioBuffer & { heartbeatFile?: string }) | null)?.heartbeatFile).toBe(
      HEARTBEAT_FILES.slow,
    );
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
    expect((context.sources[1]!.buffer as (AudioBuffer & { heartbeatFile?: string }) | null)?.heartbeatFile).toBe(
      HEARTBEAT_FILES.fast,
    );

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

  it('previews a heartbeat recording at the requested gain through the body category', async () => {
    const { audio, context, fetchBuffer } = setup();
    expect(audio.previewHeartbeat(HEARTBEAT_FILES.slow, 0.37)).toBe(true);
    await flush();

    expect(fetchBuffer).toHaveBeenCalledTimes(1);
    expect(fetchBuffer.mock.calls[0]![0]).toContain(HEARTBEAT_FILES.slow);
    expect(context.sources).toHaveLength(1);
    const source = context.sources[0]!;
    const sourceGain = source.connect.mock.calls[0]![0] as ReturnType<typeof makeGain>;
    const bodyCategory = context.gainNodes[2]!;
    expect(sourceGain.gain.value).toBe(0.37);
    expect(sourceGain.connect).toHaveBeenCalledWith(bodyCategory);
    expect(source.playbackRate.value).toBe(1);
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

  it('head-locks default player sounds while world sounds retain their source position', async () => {
    const base = 'src/content/base';
    const { registry, issues } = buildRegistry(
      readdirSync(base)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => ({
          source: `../content/base/${file}`,
          data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown,
        })),
    );
    expect(issues).toEqual([]);
    const { audio, context, isSolid } = setup(() => false, registry);
    const scale = makeScale(0.5);
    const session = createSession({
      registry,
      world: new World(),
      isSolid: () => false,
      isOpaque: () => false,
      scale,
      seed: 73,
      start: 43_200,
      spawn: [6, 8, 10],
      ready: () => false,
      controls: {
        active: () => true,
        intent: () => IDLE,
        yaw: () => 0,
        pitch: () => 0,
        walking: () => false,
        descending: () => false,
      },
      audio: { play: (sound) => audio.play(sound, sound.position.map((v) => v * scale.blockSize) as Vec3) },
      notice: () => undefined,
      onRead: () => {
        throw new Error('Unexpected reading in audio fixture');
      },
    });
    const eventsReader = session.sim.events.reader();
    const playerOrigin = session.chest();
    const listenerAtStart = playerOrigin.map((value) => value * scale.blockSize) as Vec3;
    audio.updateListener(listenerAtStart, [0, 0, -1]);
    session.playPlayerSound('player_strain');
    const ar = { uid: 1, type: 'rifle_assault', count: 1, condition: 1 };
    const shot = firearmShotSound(ar);
    session.playPlayerSound(shot.event, session.sim.time, shot);
    const suppressedShot = firearmShotSound({
      ...ar,
      slots: { muzzle: { uid: 2, type: 'real_suppressor', count: 1, condition: 1 } },
    });
    session.playPlayerSound(suppressedShot.event, session.sim.time, suppressedShot);
    audio.updateListener([listenerAtStart[0] + 3, listenerAtStart[1], listenerAtStart[2]], [1, 0, 0]);
    await flush();

    expect(context.panners).toHaveLength(0);
    expect(isSolid).not.toHaveBeenCalled();
    expect(audio.heardSounds.find(({ event }) => event === 'player_strain')).toMatchObject({
      distanceMetres: 0,
      occluded: false,
      lowpassHz: null,
    });
    expect(audio.heardSounds.find(({ sourceLabel }) => sourceLabel === shot.sourceLabel)).toMatchObject({
      distanceMetres: 0,
      occluded: false,
      lowpassHz: null,
    });

    const worldOrigin: Vec3 = [playerOrigin[0] + 20, playerOrigin[1], playerOrigin[2]];
    session.playWorldSound('gunshot', worldOrigin, session.sim.time);
    const worldOriginMetres = worldOrigin.map((value) => value * scale.blockSize) as Vec3;
    await flush();
    expect(context.panners).toHaveLength(1);
    expect(context.panners[0]?.setPosition).toHaveBeenCalledWith(...worldOriginMetres);
    expect(isSolid).toHaveBeenCalled();
    expect(
      audio.heardSounds.find(({ event, sourceLabel }) => event === 'gunshot' && sourceLabel === null)?.distanceMetres,
    ).toBeGreaterThan(0);

    const events = eventsReader.read();
    const shotNoiseRadius = events.find((event) => event.kind === 'noise' && event.event === shot.event);
    const suppressedNoiseRadius = events.find(
      (event) => event.kind === 'noise' && event.event === suppressedShot.event,
    );
    if (shotNoiseRadius?.kind !== 'noise' || suppressedNoiseRadius?.kind !== 'noise') {
      throw new Error('Expected both AR shot events to emit gameplay noise');
    }
    expect(suppressedNoiseRadius.radiusMetres / shotNoiseRadius.radiusMetres).toBe(0.5);
    expect(events.find((event) => event.kind === 'sound' && event.event === 'player_strain')).toMatchObject({
      position: playerOrigin,
      emittedAsNoise: true,
      listenerRelative: true,
    });
    expect(events.find((event) => event.kind === 'noise' && event.event === 'player_strain')).toMatchObject({
      position: playerOrigin,
    });
    expect(
      events.find((event) => event.kind === 'sound' && event.event === 'gunshot' && !event.emittedAsNoise),
    ).toMatchObject({ position: worldOrigin, listenerRelative: false });
  });

  it('uses the same one-step wall decision for zombie hearing and positional sound', async () => {
    const base = 'src/content/base';
    const { registry: worldRegistry, issues } = buildRegistry(
      readdirSync(base)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown })),
    );
    expect(issues).toEqual([]);
    const shambler = worldRegistry.zombies.get('shambler')!;
    let blocked = false;
    const solidAt: SolidAt = (x, y, z) => blocked && x === 4 && y === 2 && z === 0;
    const { audio, play, context, isSolid } = setup(solidAt);
    const zombie: Vec3 = [0.5, 1.5, 0.5];
    const listener: Vec3 = [zombie[0], zombie[1] + 1.3, zombie[2]];
    const radiusMetres = 12;
    const distanceMetres = (radiusMetres * shambler.hearing * (1 + senseTuning.wall.hearingRangeScale)) / 2;
    const source: Vec3 = [listener[0] + distanceMetres, listener[1], listener[2]];
    const noise = { id: 1, pos: [source[0], zombie[1], source[2]] as Vec3, radiusMetres, expiresAt: 2 };
    const hear = (seed: number) =>
      hearVocalNoise({
        zombie: shambler,
        from: zombie,
        noise,
        time: 1,
        blockSize: 1,
        isSolid: isSolid as SolidAt,
        rng: Rng.stream(seed, 'shared-wall-test'),
        tuning: senseTuning,
      });

    audio.updateListener(listener, [0, 0, -1]);
    const clearHearing = hear(1);
    play('gunshot', source, 1);
    await flush();
    blocked = true;
    const muffledHearing = hear(2);
    play('gunshot', source, 2);
    await flush();

    expect(clearHearing?.tier).toBe('near');
    expect(muffledHearing?.tier).toBe('far');
    expect(audio.heardSounds.map(({ occluded }) => occluded)).toEqual([false, true]);
    expect(audio.heardSounds[1]?.lowpassHz).toBeLessThan(audio.heardSounds[0]!.lowpassHz!);
    expect(isSolid).toHaveBeenCalled();
    expect(context.panners[0]?.setPosition).toHaveBeenCalledWith(...source);
    expect(context.panners[1]?.setPosition).toHaveBeenCalledWith(...source);
  });
});
