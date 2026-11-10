import type { Registry } from '@skelly/engine/content';
import type { SoundEventId } from '@skelly/engine/internal/core/soundEvents.ts';
import { SoundPicker } from '@skelly/engine/internal/core/soundPicker.ts';
import type { SessionAudio } from '@skelly/engine/internal/game/session.ts';
import { createSession, IDLE } from '@skelly/engine/session';
import type { SoundEmission } from '@skelly/engine/sound';
import { makeScale, World } from '@skelly/engine/world';
import { describe, expect, it, vi } from 'vitest';
import { GameAudio } from '../src/presentation/entries/audio.ts';
import { productAssets } from '../src/product/assets.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { startupContent } from './baseRegistry.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';

const { registry } = startupContent();
const seed = 73;
const makeSession = (play: SessionAudio['play'], content: Registry = registry) =>
  createSession({
    registry: content,
    actorFigureFiles: stackActorFigureFiles(content),
    world: new World(),
    isSolid: () => false,
    isOpaque: () => false,
    scale: makeScale(0.5),
    seed,
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
    audio: { play },
    notice: () => undefined,
    onRead: () => {
      throw new Error('Unexpected reading in sound fixture');
    },
  });

describe('simulation sound admission', () => {
  it('searching furniture emits its own authored hearing noise once', () => {
    const base = [...registry.furniture.values()].find((furniture) => furniture.searchNoise)!;
    expect(base).toBeDefined();
    // A noisy event other than the base row's, so the noise heard can only come from the fixture row.
    const [noiseEvent] = [...registry.sounds.entries()].find(
      ([id, sound]) => sound.noise.enabled && id !== base.searchNoise!.sound,
    )!;
    const fixture = { ...base, id: 'fixture_noisy_pile', searchNoise: { sound: noiseEvent } };
    const content: Registry = { ...registry, furniture: new Map(registry.furniture).set(fixture.id, fixture) };
    const session = makeSession(() => undefined, content);
    const pile = session.inventory.furnish({ type: fixture.id, pos: [6, 8, 10], size: fixture.size, facing: 'n' }, [])!;
    expect(pile).toBeDefined();
    const emissions = session.sim.events.reader();

    session.search(pile);

    const noises = emissions.read().filter((emission) => emission.kind === 'noise');
    expect(noises).toHaveLength(1);
    expect(noises[0]).toMatchObject({ event: noiseEvent });

    session.search(pile);
    expect(emissions.read().filter((emission) => emission.kind === 'noise')).toHaveLength(0);
  });

  it('applies the player noise radius scale to hearing and the emitted noise event', () => {
    const session = makeSession(() => undefined);
    const emissions = session.sim.events.reader();
    const event = 'player_strain';
    const radiusScale = 0.25;
    const expectedRadius = registry.sounds.get(event)!.noise.radiusMetres * radiusScale;

    expect(session.playPlayerSound(event, 0, { noiseRadiusScale: radiusScale })).toBe(true);
    expect(session.playerAudio.vocalNoise?.radiusMetres).toBe(expectedRadius);
    expect(emissions.read().find((emission) => emission.kind === 'noise')?.radiusMetres).toBe(expectedRadius);
  });

  it('commits hearing and the seeded choice once even when the output rejects it', () => {
    const selected: Readonly<SoundEmission>[] = [];
    const audible = makeSession((sound) => {
      selected.push(sound);
      expect(audible.playerAudio.vocalNoiseId).toBe(selected.length);
      expect(audible.audioState().events.find(({ event }) => event === sound.event)?.lastPlayedAt).toBe(sound.time);
    });
    // A rejected-output control catches the old boolean-veto boundary; void deliberately ignores the return.
    const silent = makeSession(() => false);
    const reference = new SoundPicker(seed, registry.sounds);
    const emissions = silent.sim.events.reader();
    const sequence: [SoundEventId, number][] = [
      ['player_hurt_light', 0],
      ['player_hurt_light', 0.01],
      ['player_strain', 0.02],
      ['player_hurt_light', 2],
      ['player_hurt_light', 4],
    ];
    const expected: { event: SoundEventId; file: string; time: number }[] = [];
    for (const [event, time] of sequence) {
      const pick = reference.pick(event, time);
      expect(silent.playPlayerSound(event, time)).toBe(Boolean(pick));
      expect(audible.playPlayerSound(event, time)).toBe(Boolean(pick));
      if (pick) {
        expected.push({ event, file: pick.file, time });
      }
    }
    expect(silent.playerAudio).toEqual(audible.playerAudio);
    expect(silent.playerAudio.vocalNoiseId).toBe(expected.length);
    expect(silent.audioState()).toEqual(reference.snapshotState());
    expect(audible.audioState()).toEqual(reference.snapshotState());
    expect(selected.map(({ event, pick, time }) => ({ event, file: pick.file, time }))).toEqual(expected);
    const events = emissions.read();
    expect(events.map(({ kind }) => kind)).toEqual(expected.flatMap(() => ['sound', 'noise']));
    expect(
      events
        .filter((event) => event.kind === 'sound')
        .map(({ event, pick, time }) => ({
          event,
          file: pick.file,
          time,
        })),
    ).toEqual(expected);
    expect(events.filter((event) => event.kind === 'noise').map(({ id }) => id)).toEqual(expected.map((_, i) => i + 1));
    expect(
      selected.every(
        (sound) => Object.isFrozen(sound) && Object.isFrozen(sound.pick) && Object.isFrozen(sound.position),
      ),
    ).toBe(true);
  });

  it('applies a zombie type’s authored pitch multiplier to its mob sound', () => {
    const fixturePitch = 1.37;
    // A type that sounds on its first tick; the fixture row replaces its multiplier with one of the test's own and
    // keeps its id, which its built figure is keyed by.
    const base = [...registry.actors.values()].find((candidate) => candidate.soundPitchMultiplier !== undefined)!;
    expect(base).toBeDefined();
    expect(base.soundPitchMultiplier).not.toBe(fixturePitch);
    const type = { ...base, soundPitchMultiplier: fixturePitch };
    const content: Registry = { ...registry, actors: new Map(registry.actors).set(type.id, type) };
    const selected: Readonly<SoundEmission>[] = [];
    const session = makeSession((emission) => selected.push(emission), content);
    session.actors.add(type, [6, 8, 9], [0, 0, 1]);
    session.actors.tick(1 / 60);

    const [sound] = selected;
    expect(sound).toBeDefined();
    const unscaled = new SoundPicker(seed, registry.sounds).pick(sound!.event, sound!.time)!;
    expect(sound!.pick.pitch).toBeCloseTo(unscaled.pitch * fixturePitch, 10);
  });

  it('admits a noisy player event with an unbundled asset without hiding the playback error', () => {
    const sounds = new Map(registry.sounds);
    const definition = sounds.get('player_strain')!;
    sounds.set('player_strain', { ...definition, variants: ['assets/audio/not-bundled.ogg'] });
    const content = { ...registry, sounds };
    const report = vi.fn();
    const output = new GameAudio({
      registry: content,
      blockSize: 0.5,
      isSolid: () => false,
      tuning: TEST_SENSE_TUNING,
      report,
      files: productAssets.audio,
    });
    const session = makeSession(
      (sound) => output.play(sound, sound.position.map((v) => v * 0.5) as [number, number, number]),
      content,
    );
    expect(session.playPlayerSound('player_strain')).toBe(true);
    expect(session.playerAudio.vocalNoiseId).toBe(1);
    expect(session.playerAudio.vocalNoise?.radiusMetres).toBe(definition.noise.radiusMetres);
    expect(session.audioState().events).toHaveLength(1);
    expect(report).toHaveBeenCalledExactlyOnceWith(
      'sound file "assets/audio/not-bundled.ogg" is not bundled for "player_strain"',
    );
    expect(output.heardSounds).toEqual([]);
  });
});
