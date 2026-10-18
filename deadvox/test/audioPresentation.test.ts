import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry, type SoundDef } from '../src/core/content.ts';
import type { Item } from '../src/core/items.ts';
import {
  createRefusalPresenter,
  firearmShotSound,
  HEARTBEAT_TUNING,
  heartbeatForStamina,
} from '../src/game/audioPresentation.ts';
import { baseRegistry as loadBaseRegistry } from './baseRegistry.ts';

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

const FIXTURES = 'src/content/base';
const baseRegistry = loadBaseRegistry();

describe('firearm audio presentation', () => {
  it('selects the M4 sound only for the AR and keeps AK and actor selection consistent', () => {
    const ar = firearm('rifle_assault');
    const ak = firearm('rifle_ak');
    expect(firearmShotSound(baseRegistry, ar)).toMatchObject({
      event: 'gunshot_m4',
      sourceLabel: ar.type,
      listenerRelative: true,
    });
    expect(firearmShotSound(baseRegistry, ak)).toMatchObject({
      event: 'gunshot',
      sourceLabel: ak.type,
      listenerRelative: true,
    });

    const suppressedAr = firearm('rifle_assault', { muzzle: firearm('real_suppressor') });
    expect(firearmShotSound(baseRegistry, suppressedAr)).toMatchObject({
      event: 'gunshot_m4_suppressed',
      sourceLabel: suppressedAr.type,
      listenerRelative: true,
    });
    expect(firearmShotSound(baseRegistry, suppressedAr, 'actor')).toMatchObject({
      event: 'gunshot_m4_suppressed',
      listenerRelative: false,
    });
  });

  it('selects a new firearm id from its authored shot sound without a code edit', () => {
    const { registry, issues } = buildRegistry([
      ...readdirSync(FIXTURES)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => ({
          source: file,
          data: JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as unknown,
        })),
      {
        source: 'fixture-firearm.json',
        data: {
          items: [
            {
              id: 'fixture_carbine',
              economy: { usage: [], tiers: [] },
              name: 'Fixture carbine',
              category: 'weapon',
              weight: 1,
              size: [1, 1],
              firearm: { shotSound: 'gunshot_m4', recoilKickRadians: 0.01, dispersionRadians: 0, handling: {} },
            },
          ],
        },
      },
    ]);
    expect(issues).toEqual([]);
    expect(firearmShotSound(registry, firearm('fixture_carbine')).event).toBe('gunshot_m4');
  });

  it('keeps M4 sound selection separate from attachment-based noise scaling', () => {
    const definitions = JSON.parse(readFileSync('src/content/base/sounds.json', 'utf8')).sounds as SoundDef[];
    const byId = new Map(definitions.map((definition) => [definition.id, definition]));
    const unsuppressed = firearmShotSound(baseRegistry, firearm('rifle_assault'));
    const suppressed = firearmShotSound(baseRegistry, firearm('rifle_assault', { muzzle: firearm('real_suppressor') }));
    const unsuppressedNoise = byId.get(unsuppressed.event)?.noise;
    const suppressedNoise = byId.get(suppressed.event)?.noise;

    expect(unsuppressedNoise?.enabled).toBe(true);
    expect(suppressedNoise?.enabled).toBe(true);
    expect(suppressedNoise!.radiusMetres).toBe(unsuppressedNoise!.radiusMetres);
  });
});
