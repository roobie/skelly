import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { figureSeedPool } from '../src/core/zombieFigure.ts';
import {
  advanceStanceWeight,
  HIT_FLINCH_DURATION,
  posedShambler,
  targetStanceWeight,
  zombiePoseInputFor,
} from '../src/core/zombiePose.ts';
import { posedShamblerRegionBoxes, shamblerRegionBoxes, type ZombieRegion } from '../src/core/zombieRegions.ts';
import type { Zombie } from '../src/core/zombies.ts';
import { mobFigurePoolSizeThrough } from '../src/render/mobActors.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { MobActorMeshes } from './mobActorsFixture.ts';
import { PLAYER, physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ZombieSystem } from './zombieSystemFixture.ts';

const registry = baseRegistry();
const SHAMBLER = registry.zombies.get('shambler')!;
const SCALE = makeScale(0.5);
const BLOCK_SIZE = SCALE.blockSize;
const FLOOR = (_x: number, y: number) => y === 0;

const livePoseZombie = (type = SHAMBLER) => {
  let target: Vec3 = [100, 1, 100];
  let damage = 0;
  const system = new ZombieSystem({
    tuning: TEST_SENSE_TUNING,
    isOpaque: FLOOR,
    player: () => ({
      pos: target,
      facing: [0, 0, 1],
      movement: 'still',
      lit: false,
      lightSeenFrom: 40,
      eyeHeightMetres: 1.3,
    }),
    isSolid: FLOOR,
    dayPhase: () => dayStateAtHour(12),
    blockSize: BLOCK_SIZE,
    physics: physicsFor(SCALE),
    jumpSpeed: PLAYER.jump,
    hurtPlayer: (amount) => {
      damage += amount;
    },
  });
  const id = system.add(type, [2, 1, 3], [0, 0, -1]);
  const zombie = system.store.get(id)!;
  return {
    system,
    id,
    zombie,
    damage: () => damage,
    approach: (distance = 1.2) => {
      target = [zombie.body.pos[0] + zombie.facing[0] * distance, 2, zombie.body.pos[2] + zombie.facing[2] * distance];
    },
  };
};

const startTurnedAttack = () => {
  const live = livePoseZombie();
  live.system.tick(1 / 20);
  live.approach();
  live.system.tick(1 / 6000);
  return live;
};

const rendererFor = (zombie: Zombie) => {
  const figureSeeds = figureSeedPool(registry.zombies);
  return new MobActorMeshes(BLOCK_SIZE, 4, {
    figureSeeds,
    poolSize: mobFigurePoolSizeThrough(figureSeeds, zombie.figureSeed),
  });
};

const offsetForBox = ({
  renderer,
  id,
  region,
  box,
  figure,
}: {
  renderer: MobActorMeshes;
  id: number;
  region: ZombieRegion;
  box: { bone: string; center: Vec3; rotation: readonly number[] };
  figure: ReturnType<typeof posedShambler>['figure'];
}) => {
  const matrix = renderer.boneMatrix(id, box.bone)!;
  const local = figure.boxes[region].find((candidate) => candidate.bone === box.bone)!.center;
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: independently aggregates position and orientation maxima.
const maxOffset = (renderer: MobActorMeshes, id: number, zombie: Zombie) => {
  const input = zombiePoseInputFor(zombie, id, BLOCK_SIZE);
  const { figure } = posedShambler(input);
  const hit = posedShamblerRegionBoxes(input);
  let worst = {
    bone: '',
    centreCm: 0,
    renderCentreCm: [] as number[],
    hitCentreCm: [] as number[],
    rotationDeltaDeg: 0,
  };
  let worstHead = { ...worst };
  let worstRotation = { ...worst };
  let worstHeadRotation = { ...worst };
  for (const [regionName, boxes] of Object.entries(hit)) {
    const region = regionName as ZombieRegion;
    for (const box of boxes) {
      const current = offsetForBox({ renderer, id, region, box, figure });
      if (current.centreCm > worst.centreCm) {
        worst = current;
      }
      if (region === 'head' && current.centreCm > worstHead.centreCm) {
        worstHead = current;
      }
      if (current.rotationDeltaDeg > worstRotation.rotationDeltaDeg) {
        worstRotation = current;
      }
      if (region === 'head' && current.rotationDeltaDeg > worstHeadRotation.rotationDeltaDeg) {
        worstHeadRotation = current;
      }
    }
  }
  return { worst, worstHead, worstRotation, worstHeadRotation };
};

describe('rendered and hit shambler poses', () => {
  it('matches a frozen lunge pose after windup cancellation', () => {
    const { system, id, zombie, damage } = startTurnedAttack();
    expect(zombie.attackWindup).toBeGreaterThan(0);
    expect(zombie.attackWait).toBeGreaterThan(0);
    const renderer = rendererFor(zombie);
    try {
      renderer.sync(system.store, 0, 1);
      const wait = zombie.attackWait;
      system.setFrozen(true);
      expect(zombie.attackWindup).toBe(0);
      expect(zombie.attackWait).toBe(wait);
      const frozen = system.snapshotState();
      system.tick(SHAMBLER.attack.windupSimSeconds + SHAMBLER.attack.cooldownSimSeconds);
      expect(system.snapshotState()).toEqual(frozen);
      expect(damage()).toBe(0);
      renderer.sync(system.store, 0, 1, true);
      const mismatch = maxOffset(renderer, id, zombie);
      expect(mismatch.worst.centreCm).toBeLessThan(0.001);
      expect(mismatch.worstRotation.rotationDeltaDeg).toBeLessThan(0.1);
      expect(mismatch.worstHead.centreCm).toBeLessThan(0.001);
      expect(mismatch.worstHeadRotation.rotationDeltaDeg).toBeLessThan(0.1);
    } finally {
      renderer.dispose();
    }
  });

  it.each(['runner', 'crawler'] as const)('keeps rendered %s gait and flinch aligned with hit regions', (model) => {
    const { system, id, zombie, approach } = livePoseZombie(registry.zombies.get(model)!);
    approach(10);
    for (let tick = 0; tick < 60 && zombie.gaitPhase === 0; tick++) {
      system.tick(1 / 60);
    }
    expect(zombie.mode).toBe('chase');
    const head = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, BLOCK_SIZE)).head.find(
      (box) => box.bone === 'head',
    )!.center;
    expect(system.swing([head[0], head[1] + 1, head[2] - 1.5], [0, -1, 1.5], { ...FISTS_MELEE, damage: 1 })).toBe(id);
    expect(zombie.hitFlinchTime).toBe(0);
    system.tick(HIT_FLINCH_DURATION / 4);
    expect(zombie.gaitPhase).toBeGreaterThan(0);
    expect(zombie.hitFlinchTime).toBeGreaterThan(0);
    system.setFrozen(true);
    const input = zombiePoseInputFor(zombie, id, BLOCK_SIZE);
    const { hitFlinchTime: _flinch, ...baseInput } = input;
    const flinched = posedShambler(input);
    const basePose = posedShambler(baseInput);
    const recovered = posedShambler({ ...input, hitFlinchTime: HIT_FLINCH_DURATION });
    expect(flinched.pose.rotations.head).not.toEqual(basePose.pose.rotations.head);
    expect(recovered.transforms).toEqual(basePose.transforms);

    const renderer = rendererFor(zombie);
    try {
      renderer.sync(system.store, 0, 1, true);
      const mismatch = maxOffset(renderer, id, zombie);
      expect(mismatch.worst.centreCm).toBeLessThan(0.001);
      expect(mismatch.worstRotation.rotationDeltaDeg).toBeLessThan(0.1);
      expect(mismatch.worstHead.centreCm).toBeLessThan(0.001);
      expect(mismatch.worstHeadRotation.rotationDeltaDeg).toBeLessThan(0.1);
    } finally {
      renderer.dispose();
    }
  });

  it('targets aggravated stance while chasing, winding up, and during the attack clip', () => {
    const system = new ZombieSystem({
      tuning: TEST_SENSE_TUNING,
      isOpaque: FLOOR,
      player: () => ({
        pos: [100, 1, 100],
        facing: [0, 0, -1],
        movement: 'still',
        lit: false,
        lightSeenFrom: 40,
        eyeHeightMetres: 1.3,
      }),
      isSolid: FLOOR,
      dayPhase: () => dayStateAtHour(12),
      blockSize: BLOCK_SIZE,
      physics: physicsFor(SCALE),
      jumpSpeed: PLAYER.jump,
      hurtPlayer: () => undefined,
    });
    const id = system.add(SHAMBLER, [2, 1, 3], [0, 0, -1]);
    const input = zombiePoseInputFor(system.store.get(id)!, id, BLOCK_SIZE);
    expect(targetStanceWeight({ ...input, chasing: true })).toBe(1);
    expect(targetStanceWeight({ ...input, chasing: false, attackWindup: 0.2 })).toBe(1);
    expect(targetStanceWeight({ ...input, chasing: false, attackWait: 0.8 })).toBe(1);
    expect(targetStanceWeight({ ...input, chasing: false, attackWindup: 0, attackWait: 0 })).toBe(0);
  });

  it('cross-fades stance monotonically without overshoot', () => {
    const current = 0.9;
    const advanced = advanceStanceWeight(current, 1, 1 / 60);
    expect(advanced).toBeGreaterThan(current);
    expect(advanced).toBeLessThanOrEqual(1);
    expect(advanceStanceWeight(1, 1, 1 / 60)).toBe(1);
    expect(advanceStanceWeight(0, 0, 1 / 60)).toBe(0);
    expect(advanceStanceWeight(0, 1, 0)).toBe(0);
  });

  it('blends slack and aggravated idle poses and initializes a newly tracked chase as aggravated', () => {
    const system = new ZombieSystem({
      tuning: TEST_SENSE_TUNING,
      isOpaque: FLOOR,
      player: () => ({
        pos: [100, 1, 100],
        facing: [0, 0, -1],
        movement: 'still',
        lit: false,
        lightSeenFrom: 40,
        eyeHeightMetres: 1.3,
      }),
      isSolid: FLOOR,
      dayPhase: () => dayStateAtHour(12),
      blockSize: BLOCK_SIZE,
      physics: physicsFor(SCALE),
      jumpSpeed: PLAYER.jump,
      hurtPlayer: () => undefined,
    });
    const id = system.add(SHAMBLER, [2, 1, 3], [0, 0, -1]);
    const zombie = system.store.get(id)!;
    const input = zombiePoseInputFor(zombie, id, BLOCK_SIZE);
    const { stanceWeight: _savedStanceWeight, ...legacyInput } = input;
    const untrackedChase = posedShambler({ ...legacyInput, chasing: true });
    const trackedChase = posedShambler({ ...input, chasing: true, stanceWeight: 1 });
    expect(untrackedChase.pose).toEqual(trackedChase.pose);
    const slack = posedShambler({ ...input, stanceWeight: 0 }).pose;
    const midpoint = posedShambler({ ...input, stanceWeight: 0.5 }).pose;
    const aggravated = posedShambler({ ...input, stanceWeight: 1 }).pose;
    expect(midpoint.rotations.chest).not.toEqual(slack.rotations.chest);
    expect(midpoint.rotations.chest).not.toEqual(aggravated.rotations.chest);

    const freshSystem = new ZombieSystem({
      tuning: TEST_SENSE_TUNING,
      isOpaque: FLOOR,
      player: () => ({
        pos: [2, 1, 1],
        facing: [0, 0, 1],
        movement: 'still',
        lit: false,
        lightSeenFrom: 40,
        eyeHeightMetres: 1.3,
      }),
      isSolid: FLOOR,
      dayPhase: () => dayStateAtHour(12),
      blockSize: BLOCK_SIZE,
      physics: physicsFor(SCALE),
      jumpSpeed: PLAYER.jump,
      hurtPlayer: () => undefined,
    });
    const freshId = freshSystem.add(SHAMBLER, [2, 1, 3], [0, 0, -1]);
    const freshZombie = freshSystem.store.get(freshId)!;
    expect(freshZombie.stanceWeight).toBeUndefined();
    freshSystem.tick(1 / 20);
    expect(freshZombie.mode).toBe('chase');
    expect(freshZombie.stanceWeight).toBe(1);
  });

  it('aimAt hits the rendered head centre during a frozen lunge and turned head-look', () => {
    const { system, id, zombie } = startTurnedAttack();
    expect(zombie.attackWindup).toBeGreaterThan(0);
    expect(zombie.attackWait).toBeGreaterThan(0);
    expect(Math.abs(zombie.headYaw)).toBeGreaterThan(0);
    system.setFrozen(true);

    const renderer = rendererFor(zombie);
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
