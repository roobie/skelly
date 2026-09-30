import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { zombiePoseInputFor } from '../src/core/zombiePose.ts';
import { posedShamblerRegionBoxes, shamblerRegionBoxes, type ZombieRegion } from '../src/core/zombieRegions.ts';
import { type Zombie, ZombieSystem } from '../src/core/zombies.ts';
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

const offsetForBox = ({
  renderer,
  id,
  zombie,
  region,
  box,
}: {
  renderer: MobActorMeshes;
  id: number;
  zombie: Zombie;
  region: ZombieRegion;
  box: { bone: string; center: Vec3; rotation: readonly number[] };
}) => {
  const matrix = renderer.boneMatrix(id, box.bone)!;
  const local = shamblerRegionBoxes(zombie.figureSeed)[region].find((candidate) => candidate.bone === box.bone)!.center;
  const world = [0, 1, 2].map(
    (axis) =>
      matrix[axis * 4]! * local[0]! +
      matrix[axis * 4 + 1]! * local[1]! +
      matrix[axis * 4 + 2]! * local[2]! +
      matrix[axis * 4 + 3]!,
  );
  const deltaCm = Math.hypot(...world.map((value, axis) => value - box.center[axis]! * BLOCK_SIZE)) * 100;
  const rendererRotation = [
    matrix[0]!,
    matrix[1]!,
    matrix[2]!,
    matrix[4]!,
    matrix[5]!,
    matrix[6]!,
    matrix[8]!,
    matrix[9]!,
    matrix[10]!,
  ];
  const dot = rendererRotation.reduce((sum, value, index) => sum + value * box.rotation[index]!, 0);
  const rotationDeltaDeg = (Math.acos(Math.max(-1, Math.min(1, (dot - 1) / 2))) * 180) / Math.PI;
  return {
    bone: box.bone,
    centreCm: deltaCm,
    renderCentreCm: world.map((value) => value * 100),
    hitCentreCm: box.center.map((value) => value * BLOCK_SIZE * 100),
    rotationDeltaDeg,
  };
};

const maxOffset = (renderer: MobActorMeshes, id: number, zombie: Zombie) => {
  const hit = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, BLOCK_SIZE));
  let worst = {
    bone: '',
    centreCm: 0,
    renderCentreCm: [] as number[],
    hitCentreCm: [] as number[],
    rotationDeltaDeg: 0,
  };
  let worstHead = { ...worst };
  for (const [regionName, boxes] of Object.entries(hit)) {
    const region = regionName as ZombieRegion;
    for (const box of boxes) {
      const current = offsetForBox({ renderer, id, zombie, region, box });
      if (current.centreCm > worst.centreCm) {
        worst = current;
      }
      if (region === 'head' && current.centreCm > worstHead.centreCm) {
        worstHead = current;
      }
    }
  }
  return { worst, worstHead };
};

describe('rendered and hit shambler poses', () => {
  it('matches a frozen lunge pose after windup cancellation', () => {
    const system = new ZombieSystem({
      player: () => ({ pos: [100, 1, 100], facing: [0, 0, -1], movement: 'still', lit: false, lightSeenFrom: 40 }),
      isSolid: FLOOR,
      hour: () => 12,
      blockSize: BLOCK_SIZE,
      physics: physicsFor(SCALE),
      jumpSpeed: PLAYER.jump,
      hurtPlayer: () => undefined,
    });
    const id = system.add(SHAMBLER, [2, 1, 3], [0, 0, -1]);
    const zombie = system.store.get(id)!;
    zombie.figureSeed = 1;
    zombie.mode = 'chase';
    zombie.horizontalSpeed = 0;
    zombie.gaitPhase = 0;
    zombie.attackWindup = 0;
    zombie.attackWait = 0.9;
    const renderer = new MobActorMeshes(BLOCK_SIZE, 4, { poolSize: 2 });
    try {
      renderer.sync(system.store, 0, 1);
      renderer.sync(system.store, 0, 1, true);
      const mismatch = maxOffset(renderer, id, zombie);
      expect(mismatch.worst.centreCm).toBeLessThan(0.001);
      expect(mismatch.worst.rotationDeltaDeg).toBeLessThan(0.1);
      expect(mismatch.worstHead.centreCm).toBeLessThan(0.001);
      expect(mismatch.worstHead.rotationDeltaDeg).toBeLessThan(0.1);
    } finally {
      renderer.dispose();
    }
  });

  it('aimAt hits the rendered head centre during a frozen lunge and turned head-look', () => {
    const system = new ZombieSystem({
      player: () => ({ pos: [100, 1, 100], facing: [0, 0, -1], movement: 'still', lit: false, lightSeenFrom: 40 }),
      isSolid: FLOOR,
      hour: () => 12,
      blockSize: BLOCK_SIZE,
      physics: physicsFor(SCALE),
      jumpSpeed: PLAYER.jump,
      hurtPlayer: () => undefined,
    });
    const id = system.add(SHAMBLER, [2, 1, 3], [0, 0, -1]);
    const zombie = system.store.get(id)!;
    zombie.figureSeed = 1;
    zombie.mode = 'chase';
    zombie.headYaw = 0.45;
    zombie.horizontalSpeed = 0.7;
    zombie.gaitPhase = 0.8;
    zombie.attackWait = 0.9;
    zombie.attackWindup = 0.15;
    system.setFrozen(true);

    const renderer = new MobActorMeshes(BLOCK_SIZE, 4, { poolSize: 2 });
    try {
      renderer.sync(system.store, 0, 1, true);
      const headBox = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, BLOCK_SIZE)).head.find(
        (box) => box.bone === 'head',
      )!;
      const local = shamblerRegionBoxes(zombie.figureSeed).head.find((box) => box.bone === 'head')!.center;
      const matrix = renderer.boneMatrix(id, 'head')!;
      const center = [0, 1, 2].map(
        (axis) =>
          matrix[axis * 4]! * local[0]! +
          matrix[axis * 4 + 1]! * local[1]! +
          matrix[axis * 4 + 2]! * local[2]! +
          matrix[axis * 4 + 3]!,
      );
      expect(center.map((value) => value / BLOCK_SIZE)).toEqual(
        headBox.center.map((value) => expect.closeTo(value, 6)),
      );
      const aim = system.aimAt(
        [center[0]! / BLOCK_SIZE, center[1]! / BLOCK_SIZE, center[2]! / BLOCK_SIZE - 0.6 / BLOCK_SIZE],
        [0, 0, 1],
        {
          damage: 8,
          reach: 0.1,
          cooldown: 0.8,
        },
      );
      expect(aim?.region).toBe('head');
      expect(aim?.inReach).toBe(true);
    } finally {
      renderer.dispose();
    }
  });
});
