import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SECONDS_PER_DAY } from '../src/core/clock.ts';
import type { ItemDef } from '../src/engine/content.ts';
import { dayPhaseAt } from '../src/engine/sim.ts';
import { skyAt } from '../src/engine/sky.ts';
import { flashlightDaylightScale } from '../src/render/flashlight.ts';
import { BASE_DAY_CYCLE, phaseMidpoint } from './dayPhaseFixture.ts';
import { BASE_SENSE_TUNING } from './senseFixture.ts';

const NEAR_FIELD_M = BASE_SENSE_TUNING.light.illumination.nearFieldMetres;

const scaleAt = (hour: number): number => flashlightDaylightScale(skyAt(hour, BASE_DAY_CYCLE));

describe('flashlight daylight scale', () => {
  it('keeps the daylight-scaled flashlight weaker than direct sun lighting', () => {
    const hour = phaseMidpoint('day') / 3600;
    const { items } = JSON.parse(readFileSync('../mods/skelly.electric-power/electric-power-items.json', 'utf8')) as {
      items: ItemDef[];
    };
    const beams = items.flatMap(({ light }) => (light?.beam && light.power ? [light] : []));
    expect(beams.length).toBeGreaterThan(0);
    for (const light of beams) {
      const pool = (light.intensity / (3 + NEAR_FIELD_M) ** light.beam!.decay) * scaleAt(hour);
      expect(pool).toBeLessThan(skyAt(hour, BASE_DAY_CYCLE).lightIntensity);
    }
  });

  it('blends flashlight strength through dawn and dusk', () => {
    const night = scaleAt(phaseMidpoint('night') / 3600);
    const day = scaleAt(phaseMidpoint('day') / 3600);
    for (const phase of ['dawn', 'dusk'] as const) {
      const twilight = scaleAt(phaseMidpoint(phase) / 3600);
      expect(twilight).toBeGreaterThan(day);
      expect(twilight).toBeLessThan(night);
    }
  });

  it('fades over the twilight, not within a few minutes', () => {
    const phases = dayPhaseAt(BASE_DAY_CYCLE, 0);
    const wrap = (time: number): number => ((time % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
    for (const [start, end] of [
      [phases.sunset, phases.nightfall],
      [phases.dawn, phases.sunrise],
    ] as const) {
      const minutes = Math.round(wrap(end - start) / 60);
      const scales = Array.from({ length: 3 * minutes + 1 }, (_, index) =>
        scaleAt(wrap(start + (index - minutes) * 60) / 3600),
      );
      const steepest = Math.max(...scales.slice(1).map((value, index) => Math.abs(value - scales[index]!)));
      expect(steepest).toBeLessThan((3 * (Math.max(...scales) - Math.min(...scales))) / minutes);
    }
  });

  it('dims with the sky it is given, whatever the hour', () => {
    const dim = { lightIntensity: 0.05, ambientIntensity: 0.1 };
    const bright = { lightIntensity: 1.6, ambientIntensity: 1.3 };
    expect(flashlightDaylightScale(dim)).toBeGreaterThan(flashlightDaylightScale(bright));
    expect(flashlightDaylightScale({ lightIntensity: 0, ambientIntensity: 0 })).toBe(1);
  });
});
