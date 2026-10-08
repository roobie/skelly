import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SoundDef } from '../src/core/content.ts';
import type { Item } from '../src/core/items.ts';
import {
  createRefusalPresenter,
  firearmShotSound,
  HEARTBEAT_TUNING,
  heartbeatForStamina,
} from '../src/game/audioPresentation.ts';

describe('heartbeat audio presentation', () => {
  it('uses the tuning anchors at the start stamina and exhaustion', () => {
    const { startStamina, normalGain, veryHighGain } = HEARTBEAT_TUNING;
    expect(heartbeatForStamina(startStamina).gain).toBe(normalGain);
    expect(heartbeatForStamina(0).gain).toBe(veryHighGain);
  });

  it('is silent above the ruled start and meets the ruled rate endpoints', () => {
    expect(heartbeatForStamina(100).gain).toBe(0);
    expect(heartbeatForStamina(86).gain).toBe(0);
    expect(heartbeatForStamina(85).bpm).toBe(60);
    expect(heartbeatForStamina(0).bpm).toBe(180);
    expect(heartbeatForStamina(85).gain).toBeGreaterThan(0);
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

describe('firearm audio presentation', () => {
  it('selects the M4 sound only for the AR and keeps AK and actor selection consistent', () => {
    const ar = firearm('rifle_assault');
    const ak = firearm('rifle_ak');
    expect(firearmShotSound(ar)).toMatchObject({ event: 'gunshot_m4', sourceLabel: ar.type, listenerRelative: true });
    expect(firearmShotSound(ak)).toMatchObject({ event: 'gunshot', sourceLabel: ak.type, listenerRelative: true });

    const suppressedAr = firearm('rifle_assault', { muzzle: firearm('real_suppressor') });
    expect(firearmShotSound(suppressedAr)).toMatchObject({
      event: 'gunshot_m4_suppressed',
      sourceLabel: suppressedAr.type,
      listenerRelative: true,
      noiseRadiusScale: 1,
    });
    expect(firearmShotSound(suppressedAr, 'actor')).toMatchObject({
      event: 'gunshot_m4_suppressed',
      listenerRelative: false,
    });
  });

  it('uses event content to halve zombie hearing distance for a suppressed AR shot', () => {
    const definitions = JSON.parse(readFileSync('src/content/base/sounds.json', 'utf8')).sounds as SoundDef[];
    const byId = new Map(definitions.map((definition) => [definition.id, definition]));
    const unsuppressed = firearmShotSound(firearm('rifle_assault'));
    const suppressed = firearmShotSound(firearm('rifle_assault', { muzzle: firearm('real_suppressor') }));
    const unsuppressedNoise = byId.get(unsuppressed.event)?.noise;
    const suppressedNoise = byId.get(suppressed.event)?.noise;

    expect(unsuppressedNoise?.enabled).toBe(true);
    expect(suppressedNoise?.enabled).toBe(true);
    expect(suppressedNoise!.radiusMetres / unsuppressedNoise!.radiusMetres).toBe(0.5);
    expect(suppressed.noiseRadiusScale).toBe(1);
  });
});
