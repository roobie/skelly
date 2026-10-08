import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PerspectiveCamera } from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { MapEntityStore } from '../src/core/entities.ts';
import { stepBody } from '../src/core/physics.ts';
import { makeScale } from '../src/core/scale.ts';
import { type PlayerMovement, type PlayerSense, type Zombie, ZombieSystem } from '../src/core/zombies.ts';
import { createPlayerBody, PLAYER, physicsFor, steer } from '../src/game/player.ts';
import { MobActorMeshes } from '../src/render/mobActors.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const RUNNER = registry.zombies.get('runner')!;
const SCALE = makeScale(0.5);
const BLOCK_SIZE = SCALE.blockSize;
const FLOOR = (_x: number, y: number): boolean => y === 0;
let renderer!: MobActorMeshes;

beforeAll(() => {
  renderer = new MobActorMeshes(BLOCK_SIZE, 4);
});

afterAll(() => renderer.dispose());

const resetRenderer = (): void => {
  renderer.sync(new MapEntityStore<Zombie>(), 0, 1, false, 1, 0);
};

interface MovementSample {
  frame: number;
  transition: string;
  simHorizontal: number;
  simPosition: Vec3;
  drawnPosition: Vec3 | undefined;
  previousDrawn: Vec3 | undefined;
}

interface EngagementResult {
  maximumStep: number;
  samples: MovementSample[];
  visitedModes: Set<string>;
  sawAttackWindup: boolean;
  sawSprintSpeed: boolean;
  hits: number;
}

const runEngagement = (seed: number): EngagementResult => {
  resetRenderer();
  const playerBody = createPlayerBody(SCALE, 0, 1, 0);
  playerBody.onGround = true;
  let playerMovement: PlayerMovement = 'still';
  const player = (): PlayerSense => ({
    pos: playerBody.pos,
    body: playerBody,
    facing: [1, 0, 0],
    movement: playerMovement,
    lit: false,
    lightSeenFrom: 40,
    crouching: false,
  });
  let hits = 0;
  const system = new ZombieSystem({
    player,
    isSolid: FLOOR,
    isOpaque: FLOOR,
    hour: () => 12,
    blockSize: BLOCK_SIZE,
    physics: physicsFor(SCALE),
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    hurtPlayer: () => {
      hits += 1;
    },
    seed,
    isLoaded: () => true,
  });
  const runnerId = system.add(RUNNER, [40, 1, 0], [-1, 0, 0]);
  const runner = system.store.get(runnerId)!;
  const renderStates = renderer as unknown as {
    states: Map<number, { lastPlacement: { x: number; y: number; z: number } | undefined }>;
  };
  const camera = new PerspectiveCamera(55, 1, 0.01, 50);
  camera.position.set(0, 1.6, 0);
  camera.lookAt(20, 0.85, 0);
  camera.updateMatrixWorld(true);
  renderer.setCamera(camera);
  const dt = 0.05;
  const maximumStep = RUNNER.speed.chaseMetresPerSimSecond * RUNNER.chaseMotion.speedMultiplier.max * dt + 0.01;
  const visitedModes = new Set<string>();
  const samples: MovementSample[] = [];
  let sawAttackWindup = false;
  let sawSprintSpeed = false;
  let previousDrawn: Vec3 | undefined;

  try {
    for (let frame = 1; frame <= 221; frame++) {
      const time = frame * dt;
      if (frame === 41) {
        camera.lookAt(-20, 0.85, 0);
        camera.updateMatrixWorld(true);
      } else if (frame === 81) {
        camera.lookAt(20, 0.85, 0);
        camera.updateMatrixWorld(true);
      }
      if (frame >= 121) {
        playerMovement = 'sprinting';
        steer(playerBody, SCALE, 0, { forward: 0, right: -1, jump: false, sprint: true, walk: false });
        stepBody(playerBody, dt, FLOOR, {
          ...physicsFor(SCALE),
          obstacles: [...system.store.entries()].map(([, zombie]) => zombie.body),
        });
      }

      const beforePos: Vec3 = [...runner.body.pos];
      const beforeMode = runner.mode;
      const beforeWindup = runner.attackWindup > 0;
      system.tickActive(dt, time);
      renderer.sync(system.store, dt, 1, false, 1, time);

      const after = system.store.get(runnerId)!;
      const simHorizontal = Math.hypot(
        (after.body.pos[0] - beforePos[0]) * BLOCK_SIZE,
        (after.body.pos[2] - beforePos[2]) * BLOCK_SIZE,
      );
      const transition = `${beforeMode}->${after.mode}:${beforeWindup ? 'windup' : 'ready'}->${after.attackWindup > 0 ? 'windup' : 'ready'}`;
      const drawn = renderStates.states.get(runnerId)?.lastPlacement;
      const drawnPosition = drawn ? ([drawn.x, drawn.y, drawn.z] as Vec3) : undefined;
      samples.push({
        frame,
        transition,
        simHorizontal,
        simPosition: [
          after.body.pos[0] * BLOCK_SIZE,
          after.body.pos[1] * BLOCK_SIZE + (after.stepOffset ?? 0),
          after.body.pos[2] * BLOCK_SIZE,
        ],
        drawnPosition,
        previousDrawn,
      });
      previousDrawn = drawnPosition;
      visitedModes.add(after.mode);
      sawAttackWindup ||= after.attackWindup > 0;
      sawSprintSpeed ||= after.horizontalSpeed > RUNNER.speed.wanderMetresPerSimSecond;
    }

    return { maximumStep, samples, visitedModes, sawAttackWindup, sawSprintSpeed, hits };
  } finally {
    resetRenderer();
  }
};

interface TierResult {
  maximumStep: number;
  transitions: Set<string>;
  localSlotStable: boolean;
  hasPlacement: boolean;
  maximumDrawnStep: number;
}

const runBackgroundSlice = ({
  system,
  frame,
  time,
  runnerId,
  tier,
}: {
  system: ZombieSystem;
  frame: number;
  time: number;
  runnerId: number;
  tier: string | undefined;
}): void => {
  if (frame % 10 === 0 && tier === 'background') {
    system.tickBackground(0.5, time, runnerId % 30, 30);
  }
};

const runTierHandoff = (): TierResult => {
  resetRenderer();
  const playerBody = createPlayerBody(SCALE, 0, 1, 0);
  playerBody.onGround = true;
  let playerDirection = -1;
  const player = (): PlayerSense => ({
    pos: playerBody.pos,
    body: playerBody,
    facing: [1, 0, 0],
    movement: 'sprinting',
    lit: false,
    lightSeenFrom: 40,
    crouching: false,
  });
  const system = new ZombieSystem({
    player,
    isSolid: FLOOR,
    isOpaque: FLOOR,
    hour: () => 12,
    blockSize: BLOCK_SIZE,
    physics: physicsFor(SCALE),
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    hurtPlayer: () => undefined,
    seed: 73,
    isLoaded: () => true,
  });
  const runnerId = system.add(RUNNER, [78, 1, 0], [-1, 0, 0]);
  const runner = system.store.get(runnerId)!;
  const camera = new PerspectiveCamera(55, 1, 0.01, 50);
  camera.position.set(0, 1.6, 0);
  camera.lookAt(39, 0.85, 0);
  camera.updateMatrixWorld(true);
  renderer.setCamera(camera);
  const renderStates = renderer as unknown as {
    states: Map<number, { localSlot: number; lastPlacement: { x: number; y: number; z: number } | undefined }>;
  };
  const dt = 0.05;
  const transitions = new Set<string>();
  renderer.sync(system.store, 0, 1, false, 1, 0);
  const initialState = renderStates.states.get(runnerId)!;
  const { localSlot } = initialState;
  let localSlotStable = true;
  let hasPlacement = initialState.lastPlacement !== undefined;
  let maximumDrawnStep = 0;
  let previousX = initialState.lastPlacement?.x ?? 0;
  let previousZ = initialState.lastPlacement?.z ?? 0;

  try {
    for (let frame = 1; frame <= 180; frame++) {
      const time = frame * dt;
      playerDirection = frame < 61 ? -1 : 1;
      steer(playerBody, SCALE, 0, {
        forward: 0,
        right: playerDirection,
        jump: false,
        sprint: true,
        walk: false,
      });
      stepBody(playerBody, dt, FLOOR, {
        ...physicsFor(SCALE),
        obstacles: [...system.store.entries()].map(([, z]) => z.body),
      });
      const beforeTier = runner.tier;
      system.tickActive(dt, time);
      runBackgroundSlice({ system, frame, time, runnerId, tier: runner.tier });
      renderer.sync(system.store, dt, 1, false, 1, time);
      transitions.add(`${beforeTier}->${runner.tier}`);

      const state = renderStates.states.get(runnerId)!;
      localSlotStable &&= state.localSlot === localSlot;
      hasPlacement &&= state.lastPlacement !== undefined;
      const drawn = state.lastPlacement!;
      const distance = Math.hypot(drawn.x - previousX, drawn.z - previousZ);
      maximumDrawnStep = Math.max(maximumDrawnStep, distance);
      previousX = drawn.x;
      previousZ = drawn.z;
    }

    return {
      maximumStep: RUNNER.speed.chaseMetresPerSimSecond * RUNNER.chaseMotion.speedMultiplier.max * dt + 0.01,
      transitions,
      localSlotStable,
      hasPlacement,
      maximumDrawnStep,
    };
  } finally {
    resetRenderer();
  }
};

describe('seeded runner horizontal movement bound', () => {
  it.each([73, 211, 907])(
    'holds in simulation and packed render pose through chase, attack, retreat and camera changes (seed %i)',
    (seed) => {
      const result = runEngagement(seed);
      expect(result.visitedModes.has('chase'), `seed ${seed} never noticed the player`).toBe(true);
      expect(result.sawSprintSpeed, `seed ${seed} never reached chase speed`).toBe(true);
      expect(result.sawAttackWindup, `seed ${seed} never entered attack windup`).toBe(true);
      expect(result.hits, `seed ${seed} never resolved an attack`).toBeGreaterThan(0);
      expect(result.samples.some((sample) => sample.drawnPosition === undefined)).toBe(false);
      expect(result.samples.at(-1)?.simPosition[0]).toBeLessThan(0);
      for (const sample of result.samples) {
        expect(
          sample.simHorizontal,
          JSON.stringify({ seed, frame: sample.frame, transition: sample.transition }),
        ).toBeLessThanOrEqual(result.maximumStep);
        expect(sample.drawnPosition?.[0]).toBeCloseTo(sample.simPosition[0], 8);
        expect(sample.drawnPosition?.[1]).toBeCloseTo(sample.simPosition[1], 8);
        expect(sample.drawnPosition?.[2]).toBeCloseTo(sample.simPosition[2], 8);
        if (sample.previousDrawn && sample.drawnPosition) {
          const drawnHorizontal = Math.hypot(
            sample.drawnPosition[0] - sample.previousDrawn[0],
            sample.drawnPosition[2] - sample.previousDrawn[2],
          );
          expect(
            drawnHorizontal,
            JSON.stringify({ seed, frame: sample.frame, transition: sample.transition }),
          ).toBeLessThanOrEqual(result.maximumStep);
        }
      }
    },
  );

  it('keeps one packed root continuous as player distance hands a runner between active and background ticks', () => {
    const result = runTierHandoff();
    expect(result.transitions.has('active->background')).toBe(true);
    expect(result.transitions.has('background->active')).toBe(true);
    expect(result.localSlotStable).toBe(true);
    expect(result.hasPlacement).toBe(true);
    expect(result.maximumDrawnStep).toBeLessThanOrEqual(result.maximumStep);
  });
});
