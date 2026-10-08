import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SoundEventId } from '../src/core/soundEvents.ts';
import { type SoundEmission, SoundPicker } from '../src/core/soundPicker.ts';
import { World } from '../src/core/world.ts';
import { GameAudio } from '../src/game/audio.ts';
import { createSession, IDLE, type SessionAudio } from '../src/game/session.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: `../content/base/${file}`,
      data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown,
    })),
);
const seed = 73;
const makeSession = (play: SessionAudio['play'], content: Registry = registry) =>
  createSession({
    registry: content,
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
  it('searching the scrap pile emits its authored hearing noise', () => {
    const session = makeSession(() => undefined);
    const pile = session.inventory.furnish(
      { type: 'workshop_scrap_pile', pos: [6, 8, 10], size: [4, 1, 3], facing: 'n' },
      [],
    )!;
    const emissions = session.sim.events.reader();

    session.search(pile);

    const noises = emissions.read().filter((emission) => emission.kind === 'noise');
    expect(noises).toHaveLength(1);
    expect(noises[0]).toMatchObject({ event: 'player_strain' });

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
    const selected: Readonly<SoundEmission>[] = [];
    const session = makeSession((emission) => selected.push(emission));
    const type = registry.zombies.get('amalgam')!;
    session.zombies.add(type, [6, 8, 9], [0, 0, 1]);
    session.zombies.tick(1 / 60);

    const sound = selected.find(({ event }) => event.startsWith('amalgam_'));
    expect(sound).toBeDefined();
    const unscaled = new SoundPicker(seed, registry.sounds).pick(sound!.event, sound!.time)!;
    expect(sound!.pick.pitch).toBeCloseTo(unscaled.pitch * type.soundPitchMultiplier!, 10);
    expect(sound!.pick.pitch).toBeLessThan(1);
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
