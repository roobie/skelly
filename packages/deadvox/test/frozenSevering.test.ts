import { describe, expect, it } from 'vitest';
import { posedHumanoidRegionBoxes } from '../src/core/actorRegions.ts';
import type { Actor } from '../src/core/actorSystem.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { MobActorMeshes } from './mobActorsFixture.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

const registry = baseRegistry();
const SHAMBLER = registry.actors.get('shambler')!;
const SCALE = makeScale(0.5);
const BLOCK_SIZE = SCALE.blockSize;
const FLOOR = (_x: number, y: number) => y === 0;
const posed = (actor: Actor) =>
  posedHumanoidRegionBoxes({
    seed: actor.figureSeed,
    position: actor.body.pos,
    facing: actor.facing,
    headYaw: actor.headYaw,
    gaitPhase: actor.gaitPhase,
    speed: actor.horizontalSpeed,
    chasing: actor.mode === 'chase',
    attackWindup: actor.attackWindup,
    attackWindupSeconds: actor.type.attack.windupSimSeconds,
    severed: actor.severed,
    blockSize: BLOCK_SIZE,
  });
const regionRay = (actor: Actor) => {
  const box = posed(actor).rightArm.find((candidate) => candidate.bone === 'forearm.R')!;
  const front: Vec3 = [-actor.facing[0], 0, -actor.facing[2]];
  return {
    origin: [
      box.center[0] + (front[0] * 0.45) / BLOCK_SIZE,
      box.center[1],
      box.center[2] + (front[2] * 0.45) / BLOCK_SIZE,
    ] as Vec3,
    direction: [-front[0], 0, -front[2]] as Vec3,
  };
};

describe('melee while debug-frozen', () => {
  it('severs an arm and advances its debris while the living actor pose remains frozen', () => {
    const armKill = {
      ...SHAMBLER,
      figureSeeds: [1],
      regions: { ...SHAMBLER.regions, rightArm: FISTS_MELEE.damage },
      dismember: { chance: 0, headOnKillChance: 0 },
    };
    const renderer = new MobActorMeshes(BLOCK_SIZE, 4, { zombies: registry.actors, poolSize: 2 });
    try {
      renderer.setWorld(FLOOR, BLOCK_SIZE);
      const severedParts: string[] = [];
      const system = new ActorSystem({
        player: () => ({
          pos: [100, 1, 100],
          facing: [0, 0, -1],
          movement: 'still',
          lit: false,
          lightSeenFrom: 40,
          eyeHeightMetres: 1.3,
        }),
        isSolid: FLOOR,
        isOpaque: FLOOR,
        dayPhase: () => dayStateAtHour(12),
        blockSize: BLOCK_SIZE,
        physics: physicsFor(SCALE),
        tuning: TEST_SENSE_TUNING,
        hurtPlayer: () => undefined,
        onSever: (sourceId, sourceActor, part, hit) => {
          severedParts.push(part);
          renderer.zombieSevered(sourceId, part, hit, sourceActor);
        },
      });
      const id = system.add(armKill, [0, 1, 0], [0, 0, -1]);
      const actor = system.store.get(id)!;
      renderer.sync(system.store, 1 / 60, 1);
      system.setFrozen(true);
      const ray = regionRay(actor);
      expect(system.swing(ray.origin, ray.direction, FISTS_MELEE)).toBe(id);
      expect(actor.severed).toContain('upperArm.R');
      expect(severedParts).toEqual(['upperArm.R']);
      expect(renderer.boneMatrix(id, 'head')).toBeDefined();
      expect(renderer.debrisCountFor(id)).toBe(1);

      const actorPoseBefore = renderer.boneMatrix(id, 'head')!;
      const debrisBefore = renderer.debrisBoneMatrix(id, 'upperArm.R', 'upperArm.R')!;
      for (let frame = 0; frame < 6; frame++) {
        system.tick(1 / 60);
        renderer.sync(system.store, 1 / 60, 1, system.isFrozen);
      }
      expect(renderer.boneMatrix(id, 'head')).toEqual(actorPoseBefore);
      expect(renderer.debrisBoneMatrix(id, 'upperArm.R', 'upperArm.R')).not.toEqual(debrisBefore);
    } finally {
      renderer.dispose();
    }
  });
});
