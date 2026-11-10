import { requireDayCycle } from '@skelly/engine/content';
import type { HordeState } from '@skelly/engine/internal/core/agentHorde.ts';
import { perceivePlayer } from '@skelly/engine/internal/core/agentPerception.ts';
import { SECONDS_PER_DAY } from '@skelly/engine/internal/core/clock.ts';
import { SunExposureCache } from '@skelly/engine/internal/core/lights.ts';
import { sunDirection } from '@skelly/engine/internal/core/sky.ts';
import { dayPhaseAt } from '@skelly/engine/sim';
import { skyAt } from '@skelly/engine/sky';
import { makeScale, type Vec3 } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { physicsFor } from './playerFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

const registry = baseRegistry();
const cycle = requireDayCycle(registry);
const shambler = registry.actors.get('shambler')!;
const scale = makeScale(0.5);
const floor = (_x: number, y: number) => y === 0;
const player = {
  pos: [0, 1, 0] as Vec3,
  facing: [-1, 0, 0] as Vec3,
  movement: 'still' as const,
  lit: false,
  lightSeenFrom: 0,
  eyeHeightMetres: 1.3,
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

const hordeModeAt = (time: number): HordeState['mode'] => {
  const state = dayPhaseAt(cycle, time);
  const system = new ActorSystem({
    player: () => player,
    isSolid: floor,
    isOpaque: floor,
    blockSize: scale.blockSize,
    physics: physicsFor(scale),
    tuning: registry.senses.get('player')!,
    actorFigureFiles: stackActorFigureFiles(registry),
    dayPhase: () => state,
    hurtPlayer: () => undefined,
  });
  system.addHorde('fixture', shambler, [0, 1, 0], 1);
  system.tickBackground(1 / 60, time);
  return system.snapshotState().hordes[0]!.mode;
};

describe('sun-owned day phases', () => {
  it('keeps sun exposure, sky, zombie sight, and spawn words on the authored solar phase', () => {
    const actor = { ...shambler, agent: { ...shambler.agent!, hearing: 0 } };
    expect(actor.agent.sight).toBeGreaterThan(actor.agent.nightSight);
    const betweenRanges = (actor.agent.sight + actor.agent.nightSight) / 2;
    const target: Vec3 = [betweenRanges / scale.blockSize, 1, 0];
    const dayLightIntensities: number[] = [];
    const nightLightIntensities: number[] = [];

    for (let minute = 0; minute < 24 * 60; minute++) {
      const time = minute * 60;
      const state = dayPhaseAt(cycle, time);
      const hour = hours(time);
      expect(sunDirection(hour, cycle)[1] > 0, `sun at ${time}`).toBe(state.phase === 'day');
      expect(new SunExposureCache(10, 0, () => false).isExposedAt([0, 1, 0], hour, cycle), `exposure at ${time}`).toBe(
        state.phase === 'day',
      );
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
        def: actor,
        from: [0, 1, 0],
        facing: [1, 0, 0],
        player: { ...player, pos: target },
        dayPhase: state.phase,
        sightBlend: state.sightBlend,
        blockSize: scale.blockSize,
        isSolid: () => false,
        tuning: registry.senses.get('player')!,
      });
      const sightRange = actor.agent.nightSight + (actor.agent.sight - actor.agent.nightSight) * state.sightBlend;
      expect(seesAtRange, `sight at ${time}`).toBe(sightRange >= betweenRanges);
    }

    expect(Math.max(...nightLightIntensities)).toBeLessThan(Math.min(...dayLightIntensities));
  });

  it('lets twilight sight reach the quarter-range target but not the three-quarter target', () => {
    const twilight = Array.from({ length: 24 * 60 }, (_, minute) => {
      const time = minute * 60;
      return { time, state: dayPhaseAt(cycle, time) };
    }).filter(({ state }) => state.phase === 'dawn' || state.phase === 'dusk');
    const lowBlend = twilight.find(({ state }) => state.sightBlend > 0.3 && state.sightBlend < 0.5)!;
    const highBlend = twilight.find(({ state }) => state.sightBlend > 0.5 && state.sightBlend < 0.7)!;
    const actor = { ...shambler, agent: { ...shambler.agent!, hearing: 0 } };
    const rangeAt = (fraction: number) =>
      actor.agent.nightSight + (actor.agent.sight - actor.agent.nightSight) * fraction;
    const seesAt = (distance: number, time: number) => {
      const state = dayPhaseAt(cycle, time);
      return perceivePlayer({
        def: actor,
        from: [0, 1, 0],
        facing: [1, 0, 0],
        player: { ...player, pos: [distance / scale.blockSize, 1, 0] },
        dayPhase: state.phase,
        sightBlend: state.sightBlend,
        blockSize: scale.blockSize,
        isSolid: () => false,
        tuning: registry.senses.get('player')!,
      });
    };

    for (const { time } of [lowBlend, highBlend]) {
      expect(seesAt(rangeAt(0.25), time)).toBe(true);
      expect(seesAt(rangeAt(0.75), time)).toBe(false);
    }
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
