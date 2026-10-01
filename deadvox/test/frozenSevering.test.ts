import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { posedShamblerRegionBoxes } from '../src/core/zombieRegions.ts';
import { FISTS_MELEE, type Zombie, ZombieSystem } from '../src/core/zombies.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';
import { MobActorMeshes } from '../src/render/mobActors.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const SHAMBLER = registry.zombies.get('shambler')!;
const SCALE = makeScale(0.5);
const BLOCK_SIZE = SCALE.blockSize;
const FLOOR = (_x: number, y: number) => y === 0;
const posed = (zombie: Zombie) =>
  posedShamblerRegionBoxes({
    seed: zombie.figureSeed,
    position: zombie.body.pos,
    facing: zombie.facing,
    headYaw: zombie.headYaw,
    gaitPhase: zombie.gaitPhase,
    speed: zombie.horizontalSpeed,
    chasing: zombie.mode === 'chase',
    attackWindup: zombie.attackWindup,
    attackWindupSeconds: zombie.type.attack.windup,
    severed: zombie.severed,
    blockSize: BLOCK_SIZE,
  });
const regionRay = (zombie: Zombie) => {
  const box = posed(zombie).rightArm.find((candidate) => candidate.bone === 'forearm.R')!;
  const front: Vec3 = [-zombie.facing[0], 0, -zombie.facing[2]];
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
      regions: { ...SHAMBLER.regions, rightArm: FISTS_MELEE.damage },
      dismember: { chance: 0, headOnKillChance: 0 },
    };
    const renderer = new MobActorMeshes(BLOCK_SIZE, 4, { poolSize: 2 });
    try {
      renderer.setWorld(FLOOR, BLOCK_SIZE);
      const severedParts: string[] = [];
      const system = new ZombieSystem({
        player: () => ({
          pos: [100, 1, 100],
          facing: [0, 0, -1],
          movement: 'still',
          lit: false,
          lightSeenFrom: 40,
        }),
        isSolid: FLOOR,
        hour: () => 12,
        blockSize: BLOCK_SIZE,
        physics: physicsFor(SCALE),
        jumpSpeed: PLAYER.jump,
        hurtPlayer: () => undefined,
        onSever: (sourceId, sourceZombie, part, hit) => {
          severedParts.push(part);
          renderer.zombieSevered(sourceId, part, hit, sourceZombie);
        },
      });
      const id = system.add(armKill, [0, 1, 0], [0, 0, -1]);
      const zombie = system.store.get(id)!;
      zombie.figureSeed = 1;
      renderer.sync(system.store, 1 / 60, 1);
      system.setFrozen(true);
      const ray = regionRay(zombie);
      expect(system.swing(ray.origin, ray.direction, FISTS_MELEE)).toBe(id);
      expect(zombie.severed).toContain('upperArm.R');
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
