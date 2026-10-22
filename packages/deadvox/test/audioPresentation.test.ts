import { describe, expect, it } from 'vitest';
import type { Registry, SoundDef } from '../src/core/content.ts';
import type { Item } from '../src/core/items.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SoundEmission } from '../src/core/soundPicker.ts';
import { simSeconds } from '../src/core/time.ts';
import { World } from '../src/core/world.ts';
import {
  createRefusalPresenter,
  firearmShotSound,
  HEARTBEAT_TUNING,
  heartbeatForStamina,
} from '../src/game/audioPresentation.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { baseRegistry as loadBaseRegistry } from './baseRegistry.ts';
import { withDefaultAttachment } from './firearmAttachmentFixture.ts';
import { chargedRifle } from './rifleFixture.ts';

describe('heartbeat audio presentation', () => {
  it('uses the tuning anchors at the start stamina and exhaustion', () => {
    const { startStamina, normalGain, veryHighGain } = HEARTBEAT_TUNING;
    expect(heartbeatForStamina(startStamina).gain).toBe(normalGain);
    expect(heartbeatForStamina(0).gain).toBe(veryHighGain);
  });

  it('is silent above the start stamina and meets the tuned rate endpoints', () => {
    const { startStamina, startHz, exhaustedHz } = HEARTBEAT_TUNING;
    expect(heartbeatForStamina(100).gain).toBe(0);
    expect(heartbeatForStamina(startStamina + 1).gain).toBe(0);
    expect(heartbeatForStamina(startStamina).bpm).toBeCloseTo(startHz * 60);
    expect(heartbeatForStamina(0).bpm).toBeCloseTo(exhaustedHz * 60);
    expect(heartbeatForStamina(startStamina).gain).toBeGreaterThan(0);
  });

  it('raises rate and loudness monotonically from the start to exhaustion', () => {
    const samples = [85, 60, 30, 0].map(heartbeatForStamina);
    for (let index = 1; index < samples.length; index++) {
      expect(samples[index]!.bpm).toBeGreaterThanOrEqual(samples[index - 1]!.bpm);
      expect(samples[index]!.gain).toBeGreaterThanOrEqual(samples[index - 1]!.gain);
    }
    expect(samples.at(-1)!.gain).toBeGreaterThan(samples[0]!.gain);
  });

  it('interpolates rate and loudness linearly halfway to exhaustion', () => {
    const { startStamina, startHz, exhaustedHz, normalGain, veryHighGain } = HEARTBEAT_TUNING;
    const halfway = heartbeatForStamina(startStamina / 2);
    expect(halfway.bpm).toBeCloseTo(((startHz + exhaustedHz) / 2) * 60);
    expect(halfway.gain).toBeCloseTo((normalGain + veryHighGain) / 2);
  });
});

describe('refusal audio presentation', () => {
  it('debounces refusal sounds on simulation time', () => {
    let sounds = 0;
    const refuse = createRefusalPresenter(
      () => undefined,
      () => {
        sounds += 1;
        return true;
      },
      1,
    );

    refuse('fixture refusal', 10);
    expect(sounds).toBe(1);

    refuse('fixture refusal', 11);
    expect(sounds).toBe(2);

    refuse('repeated fixture refusal', 11.5);
    expect(sounds).toBe(2);
  });
});

const firearm = (type: string, slots: Item['slots'] = {}): Item => ({
  uid: 1,
  type,
  count: 1,
  condition: 1,
  slots,
});

const fixture = (suppressed = false): Registry => {
  const registry = loadBaseRegistry();
  const template = registry.items.get('rifle_assault')!;
  registry.items.set('fixture_carbine', {
    ...template,
    id: 'fixture_carbine',
    firearm: { ...template.firearm!, shotSound: 'fixture_report', suppressedShotSound: 'fixture_quiet_report' },
  });
  registry.items.set('fixture_suppressor', { ...registry.items.get('real_suppressor')!, id: 'fixture_suppressor' });
  for (const id of ['fixture_report', 'fixture_quiet_report']) {
    const sound: SoundDef = {
      id,
      description: 'fixture report',
      variants: ['assets/audio/fixture-report.ogg'],
      gain: 1,
      pitchJitter: [1, 1],
      gainJitter: [1, 1],
      minIntervalSimSeconds: simSeconds(0),
      category: 'world',
      noise: { enabled: true, radiusMetres: 80 },
    };
    registry.sounds.set(id, sound);
  }
  return suppressed ? withDefaultAttachment(registry, 'fixture_carbine', 'fixture_suppressor').registry : registry;
};

describe('firearm audio presentation', () => {
  it('selects fixture reports through nested suppressors and actor perspective', () => {
    const registry = fixture();
    expect(firearmShotSound(registry, firearm('fixture_carbine'))).toEqual({
      event: 'fixture_report',
      sourceLabel: 'fixture_carbine',
      listenerRelative: true,
    });
    const suppressed = firearm('fixture_carbine', {
      adapter: firearm('fixture_carbine', { muzzle: firearm('fixture_suppressor') }),
    });
    expect(firearmShotSound(registry, suppressed)).toEqual({
      event: 'fixture_quiet_report',
      sourceLabel: 'fixture_carbine',
      listenerRelative: true,
    });
    expect(firearmShotSound(registry, suppressed, 'actor').listenerRelative).toBe(false);
  });

  it.each([false, true])('routes a committed session shot to its fixture profile (suppressed=%s)', (suppressed) => {
    const registry = fixture(suppressed);
    const played: SoundEmission[] = [];
    const session = createSession({
      registry,
      world: new World(),
      isSolid: () => false,
      isOpaque: () => false,
      scale: makeScale(0.5),
      seed: 73,
      start: 43_200,
      spawn: [0, 4, 0],
      ready: () => false,
      controls: {
        active: () => true,
        intent: () => IDLE,
        yaw: () => 0,
        pitch: () => 0,
        walking: () => false,
        descending: () => false,
      },
      audio: { play: (sound) => played.push(sound) },
      notice: () => undefined,
      onRead: () => undefined,
    });
    const { rifle } = chargedRifle(session.inventory, session.queue, session.firearms, {
      type: 'fixture_carbine',
      magazines: session.magazines,
    });
    const reader = session.sim.events.reader();
    played.length = 0;
    const noiseScale = session.firearms.noiseFactorFor(rifle);
    expect(
      session.firearms.fire({
        item: rifle,
        feet: session.feet(),
        eye: [0, 7, 0],
        yaw: 0,
        pitch: 0,
        aimFrame: { yaw: 0, pitch: 0 },
        ready: true,
        sprinting: false,
        seed: 71,
        simTime: session.sim.time,
        blockSize: 0.5,
      }),
    ).toBe(true);
    const event = suppressed ? 'fixture_quiet_report' : 'fixture_report';
    const report = played.filter((sound) => sound.event === event);
    expect(report).toHaveLength(1);
    expect(report[0]).toMatchObject({ listenerRelative: true, position: session.chest(), emittedAsNoise: true });
    const noise = reader.read().filter((entry) => entry.kind === 'noise' && entry.event === event);
    expect(noise).toHaveLength(1);
    expect(noise[0]).toMatchObject({
      position: session.chest(),
      radiusMetres: registry.sounds.get(event)!.noise.radiusMetres * noiseScale,
    });
  });
});
