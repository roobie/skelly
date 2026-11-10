import { expect, it, vi } from 'vitest';
import { CONTACT_SKIN } from '../src/core/physics.ts';
import { simSeconds } from '../src/core/time.ts';
import { requireDayCycle } from '../src/engine/content.ts';
import { actorBodyDimensions, dayPhaseAt } from '../src/engine/sim.ts';
import { makeScale, type SolidAt } from '../src/engine/world.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

it('draws first-contact reactions before the stuck stroller draws its next idle duration', () => {
  const registry = baseRegistry();
  const driven = [...registry.actors.values()].find((row) => row.agent && row.model === 'humanoid')!;
  const type = {
    ...driven,
    canJumpObstacles: false,
    agent: {
      ...driven.agent!,
      wander: {
        ...driven.agent!.wander,
        idleSimSeconds: { min: simSeconds(0), max: simSeconds(0) },
        strollSimSeconds: { min: simSeconds(10), max: simSeconds(10) },
        obstacleWanderChance: 0,
      },
    },
  };
  const scale = makeScale(0.5);
  const wall: SolidAt = (x, y) => y === 0 || (x === 1 && y >= 1);
  const system = new ActorSystem({
    player: () => ({
      pos: [-1000, 1, 0],
      facing: [-1, 0, 0],
      movement: 'still',
      lit: false,
      lightSeenFrom: 40,
      eyeHeightMetres: 1.3,
    }),
    isSolid: wall,
    isOpaque: wall,
    dayPhase: () => dayPhaseAt(requireDayCycle(registry), 12 * 3600),
    blockSize: scale.blockSize,
    physics: physicsFor(scale),
    tuning: TEST_SENSE_TUNING,
    actorFigureFiles: stackActorFigureFiles(registry),
    activeActorRadiusMetres: 1000,
    hurtPlayer: () => undefined,
  });
  const dimensions = actorBodyDimensions(type, scale.blockSize);
  const id = system.add(type, [1 - dimensions.halfWidth - CONTACT_SKIN, 1, 0], [1, 0, 0]);
  const actor = system.store.get(id)!;
  const rng = actor.agent!.behaviorRng;
  const draws: string[] = [];
  const range = rng.range.bind(rng);
  const int = rng.int.bind(rng);
  const chance = rng.chance.bind(rng);
  const spies = [
    vi.spyOn(rng, 'range').mockImplementation((min, max) => {
      draws.push('range');
      const value = range(min, max);
      return min === -Math.PI && max === Math.PI ? Math.PI / 2 : value;
    }),
    vi.spyOn(rng, 'int').mockImplementation((min, max) => {
      draws.push('int');
      return int(min, max);
    }),
    vi.spyOn(rng, 'chance').mockImplementation((probability) => {
      draws.push('chance');
      return chance(probability);
    }),
  ];
  try {
    system.tick(1 / 60);
    expect(actor.agent!.mode).toBe('stroll');
    expect(actor.obstacleContact).toBe(false);
    draws.length = 0;
    system.tick(1 / 60);
    expect(actor.obstacleContact).toBe(true);
    expect(actor.agent!.mode).toBe('idle');
    expect(draws).toEqual(['int', 'chance', 'range']);
  } finally {
    for (const spy of spies) {
      spy.mockRestore();
    }
  }
});
