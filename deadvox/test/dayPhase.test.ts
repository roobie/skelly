import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSpawnTime, SECONDS_PER_DAY } from '../src/core/clock.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { DEFAULT_DAY_CYCLE, dayPhaseAt } from '../src/core/dayPhase.ts';
import { sunExposedAt } from '../src/core/lights.ts';
import { makeScale } from '../src/core/scale.ts';
import { skyAt, sunDirection } from '../src/core/sky.ts';
import { perceivePlayer, ZombieSystem } from '../src/core/zombies.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const cycle = registry.dayCycle ?? DEFAULT_DAY_CYCLE;
const shambler = registry.zombies.get('shambler')!;
const scale = makeScale(0.5);
const floor = (_x: number, y: number) => y === 0;
const player = {
  pos: [0, 1, 0] as Vec3,
  facing: [-1, 0, 0] as Vec3,
  movement: 'still' as const,
  lit: false,
  lightSeenFrom: 0,
};
const hours = (seconds: number): number => seconds / 3600;
const phaseSamples = () => {
  const boundaries = dayPhaseAt(cycle, 0);
  const events = [boundaries.dawn, boundaries.sunrise, boundaries.sunset, boundaries.nightfall];
  const midpoints = [
    (boundaries.dawn + boundaries.sunrise) / 2,
    (boundaries.sunrise + boundaries.sunset) / 2,
    (boundaries.sunset + boundaries.nightfall) / 2,
    (boundaries.nightfall + SECONDS_PER_DAY + boundaries.dawn) / 2,
  ].map((time) => time % SECONDS_PER_DAY);
  return [...events.flatMap((time) => [time - 1, time, time + 1]), ...midpoints];
};

const hordeModeAt = (time: number): 'home' | 'noise' | 'roam' => {
  const state = dayPhaseAt(cycle, time);
  const system = new ZombieSystem({
    player: () => player,
    isSolid: floor,
    isOpaque: floor,
    blockSize: scale.blockSize,
    physics: physicsFor(scale),
    jumpSpeed: PLAYER.jump,
    tuning: registry.senses.get('player')!,
    dayPhase: () => state,
    hurtPlayer: () => undefined,
  });
  system.addHorde('fixture', shambler, [0, 1, 0], 1);
  system.tickBackground(1 / 60, time);
  return system.snapshotState().hordes[0]!.mode;
};

describe('sun-owned day phases', () => {
  it('keeps sun exposure, sky, zombie sight, and spawn words on the authored solar phase', () => {
    const zombie = { ...shambler, hearing: 0 };
    expect(zombie.sight).toBeGreaterThan(zombie.nightSight);
    const betweenRanges = (zombie.sight + zombie.nightSight) / 2;
    const target: Vec3 = [betweenRanges / scale.blockSize, 1, 0];
    const dayLightIntensities: number[] = [];
    const nightLightIntensities: number[] = [];

    for (let minute = 0; minute < 24 * 60; minute++) {
      const time = minute * 60;
      const state = dayPhaseAt(cycle, time);
      const hour = hours(time);
      expect(sunDirection(hour, cycle)[1] > 0, `sun at ${time}`).toBe(state.phase === 'day');
      expect(
        sunExposedAt({ position: [0, 1, 0], hour, skyTop: 10, isOpaque: () => false, cycle }),
        `exposure at ${time}`,
      ).toBe(state.phase === 'day');
      const sky = skyAt(hour, cycle);
      expect(sky.dayPhase, `sky at ${time}`).toBe(state.phase);
      const horizontalDot = sky.light[0] * state.sunDirection[0] + sky.light[2] * state.sunDirection[2];
      expect(horizontalDot, `light direction at ${time}`).toBeGreaterThan(0);
      if (state.phase === 'day') {
        dayLightIntensities.push(sky.lightIntensity);
      }
      if (state.phase === 'night') {
        nightLightIntensities.push(sky.lightIntensity);
      }

      const seesAtRange = perceivePlayer({
        zombie,
        from: [0, 1, 0],
        facing: [1, 0, 0],
        player: { ...player, pos: target },
        dayPhase: state.phase,
        sightBlend: state.sightBlend,
        blockSize: scale.blockSize,
        isSolid: () => false,
        tuning: registry.senses.get('player')!,
      });
      const sightRange = zombie.nightSight + (zombie.sight - zombie.nightSight) * state.sightBlend;
      expect(seesAtRange, `sight at ${time}`).toBe(sightRange >= betweenRanges);
    }

    expect(Math.max(...nightLightIntensities)).toBeLessThan(Math.min(...dayLightIntensities));
    expect(parseSpawnTime('dawn', cycle)).toBe(dayPhaseAt(cycle, 0).dawn);
    expect(parseSpawnTime('dusk', cycle)).toBe(dayPhaseAt(cycle, 0).sunset);
  });

  it('blends zombie sight monotonically through the authored dusk and dawn', () => {
    const state = dayPhaseAt(cycle, 0);
    const samplesBetween = (start: number, end: number): number[] => {
      const times = [start];
      for (let time = start + 60; time < end; time += 60) {
        times.push(time);
      }
      times.push(end);
      return times.map((time) => dayPhaseAt(cycle, time).sightBlend);
    };
    const dusk = samplesBetween(state.sunset, state.nightfall);
    const dawn = samplesBetween(state.dawn, state.sunrise);
    expect(dusk[0]).toBeCloseTo(1);
    expect(dusk.at(-1)).toBe(0);
    expect(dawn[0]).toBeCloseTo(0);
    expect(dawn.at(-1)).toBe(1);
    for (let index = 1; index < dusk.length; index++) {
      expect(dusk[index]).toBeLessThanOrEqual(dusk[index - 1]!);
    }
    for (let index = 1; index < dawn.length; index++) {
      expect(dawn[index]).toBeGreaterThanOrEqual(dawn[index - 1]!);
    }
  });

  it('roams hordes exactly from sunset through dawn to sunrise', () => {
    for (const time of phaseSamples()) {
      const state = dayPhaseAt(cycle, time);
      expect(hordeModeAt(time), `horde at ${time}`).toBe(state.phase === 'day' ? 'home' : 'roam');
    }
  });
});
