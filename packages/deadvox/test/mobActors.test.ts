// Tests for src/render/mobActors.ts. Pure/three-without-a-GPU pieces only — no rendered pixels (no GPU
// here), so these check the maths and the state machine, not what anything looks like. See the module's
// own report for what to look at in a real browser.

import type { Bone } from '@mobgen/core/body.ts';
import { generateValid, realize } from '@mobgen/core/generate.ts';
import { applyPoint, IDENTITY_M, mulMV, quatToMat3, transpose } from '@mobgen/core/math.ts';
import {
  allocateBoneTransforms,
  boneTransforms,
  boneTransformsInto,
  indexBonesByParent,
  type Pose,
} from '@mobgen/core/pose.ts';
import { templatePartMassProperties } from '@mobgen/core/templateMass.ts';
import { cellIndex, worldPosition } from '@mobgen/core/voxelize.ts';
import { severableParts, severedBoneSet } from '@mobgen/mob/dismember.ts';
import { corners, footRestExtents, INITIAL_CLOCK, walkPose } from '@mobgen/mob/gait.ts';
import type { HumanoidParams } from '@mobgen/mob/humanoid.ts';
import { LOOK_AT_REST } from '@mobgen/mob/lookAt.ts';
import { TEMPLATES } from '@mobgen/mob/templates.ts';
import { Color, type DataTexture, type InstancedBufferAttribute, type InstancedMesh, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { carveAround, missingFlesh } from '../src/core/amalgamCarving.ts';
import { AMALGAM_FIGURE_SEED, amalgamFigureForType } from '../src/core/amalgamFigure.ts';
import { buildRegistry, validateContent } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { CHUNK, type Vec3 } from '../src/core/coords.ts';
import { MapEntityStore } from '../src/core/entities.ts';
import { initialShamblerFootstepClock } from '../src/core/footsteps.ts';
import { Rng } from '../src/core/random.ts';
import { reachTuning } from '../src/core/reach.ts';
import { makeScale } from '../src/core/scale.ts';
import { amalgamTypeOf, zombieFigure } from '../src/core/zombieFigure.ts';
import { flinchSideForId, HIT_FLINCH_DURATION, zombiePoseInputFor } from '../src/core/zombiePose.ts';
import { posedShamblerRegionBoxes, shamblerRegionBoxes } from '../src/core/zombieRegions.ts';
import type { Zombie, ZombieMode, ZombieSystemOptions } from '../src/core/zombies.ts';
import { ZOMBIE_RATE } from '../src/game/simulationRates.ts';
import { AcidEffects } from '../src/render/acidEffects.ts';
import { CARVED_NEIGHBOUR } from '../src/render/amalgamFlesh.ts';
import { ChunkMeshes } from '../src/render/chunks.ts';
import { Gore } from '../src/render/gore.ts';
import {
  fallDirectionAwayFromPlayer,
  perceptionLabelFor,
  MobActorMeshes as RenderMobActorMeshes,
  hearingGazeTarget as renderHearingGazeTarget,
} from '../src/render/mobActors.ts';
import { initializeRagdollPhysics, ragdollContent } from '../src/render/ragdoll.ts';
import RAPIER from '../src/render/ragdollRapier.ts';
import { ZombieMeshes } from '../src/render/zombies.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { LOOK_FIXTURE } from './lookFixture.ts';
import { CORPSE_LIFECYCLE, HEARING_GAZE_JITTER, MobActorMeshes } from './mobActorsFixture.ts';
import { PLAYER, physicsFor, WORLD_GRAVITY } from './playerFixture.ts';
import { GORE_TUNING_FIXTURE } from './presentationFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';

const hearingGazeTarget = (target: Vec3, id: number, time: number): Vec3 =>
  renderHearingGazeTarget(target, id, time, LOOK_FIXTURE.mobActors.hearingGazeJitter);

import { ZombieSystem } from './zombieSystemFixture.ts';

interface TestDebris {
  elapsed: number;
  groundedAt: number | undefined;
  originOffsetY: number;
  initialCenter: Vec3;
  body: {
    asleep: boolean;
    center: Vec3;
    corners: readonly Vec3[];
    orientation: readonly [number, number, number, number];
  };
}
const debrisEntries = (renderer: MobActorMeshes): Map<string, TestDebris> =>
  (renderer as unknown as { debris: Map<string, TestDebris> }).debris;
interface HitParityPose {
  readonly name: string;
  readonly speed: number;
  readonly phase: number;
  readonly chase: boolean;
  readonly windup: number;
  readonly idleTime?: number;
  readonly headYaw?: number;
  readonly hitFlinchTime?: number;
  readonly stanceWeight?: number;
  readonly stepOffset?: number;
  readonly yaw?: number;
  readonly stumbleFactor?: number;
}
interface HitParityEntry {
  readonly seed: number;
  readonly id: number;
  readonly zombie: Zombie;
}
const setOneHitParityPose = (zombie: Zombie, pose: HitParityPose): void => {
  zombie.mode = pose.chase ? 'chase' : 'idle';
  if (!pose.chase && pose.speed > 0) {
    zombie.mode = 'stroll';
  }
  zombie.facing = [-Math.sin(pose.yaw ?? 0), 0, -Math.cos(pose.yaw ?? 0)];
  zombie.horizontalSpeed = pose.speed;
  zombie.stumbleFactor = pose.stumbleFactor ?? 1;
  zombie.stanceWeight = pose.stanceWeight ?? (pose.chase || pose.windup > 0 ? 1 : 0);
  zombie.stepOffset = pose.stepOffset ?? 0;
  zombie.gaitPhase = pose.phase;
  zombie.attackWindup = pose.windup;
  zombie.attackWait =
    pose.windup > 0 ? zombie.type.attack.cooldownSimSeconds - (zombie.type.attack.windupSimSeconds - pose.windup) : 0;
  zombie.wanderClock = pose.idleTime ?? 0;
  zombie.hitFlinchTime = pose.hitFlinchTime;
  zombie.headYaw = pose.headYaw ?? 0;
  zombie.renderPrevious = {
    pos: [...zombie.body.pos],
    facing: [...zombie.facing],
    headYaw: zombie.headYaw,
    gaitPhase: pose.phase,
  };
};

const setHitParityPose = (_renderer: MobActorMeshes, entries: readonly HitParityEntry[], pose: HitParityPose): void => {
  for (const { zombie } of entries) {
    setOneHitParityPose(zombie, pose);
  }
};

const hitParityErrorsForBox = ({
  renderer,
  seed,
  id,
  phase,
  windup,
  regionName,
  box,
}: {
  renderer: MobActorMeshes;
  seed: number;
  id: number;
  phase: number;
  windup: number;
  regionName: string;
  box: { bone: string; center: Vec3; rotation: readonly number[] };
}): string[] => {
  const matrix = renderer.boneMatrix(id, box.bone)!;
  const local = shamblerRegionBoxes(seed)[regionName as keyof ReturnType<typeof shamblerRegionBoxes>].find(
    (rest) => rest.bone === box.bone,
  )!.center;
  const rendered: Vec3 = [
    matrix[0]! * local[0]! + matrix[1]! * local[1]! + matrix[2]! * local[2]! + matrix[3]!,
    matrix[4]! * local[0]! + matrix[5]! * local[1]! + matrix[6]! * local[2]! + matrix[7]!,
    matrix[8]! * local[0]! + matrix[9]! * local[1]! + matrix[10]! * local[2]! + matrix[11]!,
  ];
  const key = `${seed}/${phase}/${windup}/${box.bone}`;
  const errors = rendered.flatMap((value, axis) =>
    Math.abs(value - box.center[axis]! * 0.5) > 0.001 ? [`${key}/axis-${axis}`] : [],
  );
  const renderedRotation = [
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
  if (rotationAngleDeg(renderedRotation, box.rotation) > 0.1) {
    errors.push(`${key}/rotation`);
  }
  return errors;
};

const hitParityErrors = (renderer: MobActorMeshes, entries: readonly HitParityEntry[], pose: HitParityPose): string[] =>
  entries.flatMap(({ seed, id, zombie }) => {
    const boxes = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, 0.5));
    return Object.entries(boxes).flatMap(([regionName, region]) =>
      region.flatMap((box) =>
        hitParityErrorsForBox({ renderer, seed, id, phase: pose.phase, windup: pose.windup, regionName, box }),
      ),
    );
  });
const rotationAngleDeg = (a: readonly number[], b: readonly number[]): number => {
  const indices = [0, 1, 2, 4, 5, 6, 8, 9, 10];
  const dot = indices.reduce((sum, index) => sum + a[index]! * b[index]!, 0);
  return (Math.acos(Math.max(-1, Math.min(1, (dot - 1) / 2))) * 180) / Math.PI;
};
interface ContainmentCheck {
  readonly renderer: MobActorMeshes;
  readonly id: number;
  readonly part: string;
  readonly realized: ReturnType<typeof realize>;
  readonly voxelSize: number;
}
const partContainment = ({
  renderer,
  id,
  part,
  realized,
  voxelSize,
}: ContainmentCheck): { count: number; maxOverflow: number } => {
  const debris = [...debrisEntries(renderer).values()].find((entry) => entry.initialCenter !== undefined)!;
  const variantBones = realized.body.bones;
  const boneIndexById = new Map(variantBones.map((bone, index) => [bone.id, index]));
  const selected = new Set(
    [...severedBoneSet(variantBones, [part])]
      .map((bone) => boneIndexById.get(bone)!)
      .filter((index) => index !== undefined),
  );
  const matrices = new Map(
    [...selected].map((index) => [index, renderer.boneMatrix(id, variantBones[index]!.id)!] as const),
  );
  const rotation = quatToMat3(debris.body.orientation);
  const inverse = transpose(rotation);
  const halfExtents: Vec3 = [0, 1, 2].map((axis) =>
    Math.max(...debris.body.corners.map((corner) => Math.abs(corner[axis]!))),
  ) as Vec3;
  const { voxels } = realized;
  let checked = 0;
  let maxOverflow = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < voxels.dims[2]; k++) {
    for (let j = 0; j < voxels.dims[1]; j++) {
      for (let i = 0; i < voxels.dims[0]; i++) {
        const owner = voxels.owner[cellIndex(voxels.dims, i, j, k)]! - 1;
        if (!selected.has(owner)) {
          continue;
        }
        const matrix = matrices.get(owner)!;
        const local = worldPosition(voxels, i, j, k);
        const point: Vec3 = [
          matrix[0]! * local[0] + matrix[1]! * local[1] + matrix[2]! * local[2] + matrix[3]!,
          matrix[4]! * local[0] + matrix[5]! * local[1] + matrix[6]! * local[2] + matrix[7]!,
          matrix[8]! * local[0] + matrix[9]! * local[1] + matrix[10]! * local[2] + matrix[11]!,
        ];
        const relative: Vec3 = [
          point[0] - debris.initialCenter[0],
          point[1] - debris.initialCenter[1],
          point[2] - debris.initialCenter[2],
        ];
        const localPoint = mulMV(inverse, relative);
        const allowance = voxelSize / 2 + 0.001;
        for (const axis of [0, 1, 2]) {
          maxOverflow = Math.max(maxOverflow, Math.abs(localPoint[axis]!) - halfExtents[axis]! - allowance);
        }
        checked += 1;
      }
    }
  }
  return { count: checked, maxOverflow };
};

const registry = baseRegistry();
const SHAMBLER = registry.zombies.get('shambler')!;
const SHAMBLER_FIGURE_SEEDS = SHAMBLER.figureSeeds!;
const RUNNER = registry.zombies.get('runner')!;
const CRAWLER = registry.zombies.get('crawler')!;

/** A minimal, valid Zombie — same shape ZombieSystem.add() builds (src/core/zombies.ts), constructed
 * directly so these tests don't need a full ZombieSystem (physics/senses/etc, irrelevant here). */
const makeZombie = (
  position: Vec3,
  facing: Vec3 = [0, 0, -1],
  severed: string[] = [],
  options: { readonly figureSeed?: number; readonly type?: typeof SHAMBLER } = {},
): Zombie => {
  const figureSeed = options.figureSeed ?? 1;
  const type = options.type ?? SHAMBLER;
  return {
    type,
    modifiers: [],
    figureSeed,
    incapacitated: false,
    body: { pos: [...position], vel: [0, 0, 0], halfWidth: 0.28 / 0.5, height: 1.7 / 0.5, onGround: true },
    facing: [...facing],
    home: [...position],
    mode: 'idle' as ZombieMode,
    investigationTier: undefined,
    behaviorRng: Rng.stream(0, 'test-zombie'),
    soundRng: Rng.stream(0, 'test-zombie-sound'),
    dismemberRng: Rng.stream(0, 'test-zombie-dismember'),
    idleSoundTimer: 8,
    modeTimer: 0,
    searchAnchor: undefined,
    searchTimer: 0,
    searchStrolling: false,
    searchHeading: [...facing],
    strollHeading: [...facing],
    horizontalSpeed: 0,
    obstacleWanderRemaining: 0,
    obstacleContact: false,
    obstacleSlideSide: 0,
    bodyLookTarget: 0,
    headYaw: 0,
    headYawTarget: 0,
    lookTimer: 0,
    swayValue: 0,
    swayStart: 0,
    swayTarget: 0,
    swayElapsed: 0,
    swayDuration: 0,
    lurchValue: 1,
    lurchStart: 1,
    lurchTarget: 1,
    lurchElapsed: 0,
    lurchDuration: 0,
    stumbleFactor: 1,
    stumbleElapsed: 0,
    stumbleDuration: 0,
    renderPrevious: { pos: [...position], facing: [...facing], headYaw: 0, gaitPhase: 0 },
    regions: { ...type.regions } as Zombie['regions'],
    attackWait: 0,
    attackWindup: 0,
    spitWindup: 0,
    staggerSimSeconds: 0,
    spitWait: 0,
    spitRng: Rng.stream(0, 'test-zombie-spit'),
    gaitPhase: 0,
    footstepClock: initialShamblerFootstepClock(type.stepLength),
    wanderClock: 0,
    severed,
    carved: [],
  };
};

const incapacitate = (
  zombie: Zombie,
  frozen = false,
  presentation: {
    effects?: Pick<ZombieSystemOptions, 'onSever' | 'onDeath' | 'onIncapacitated' | 'onWound'>;
    beforeDamage?: (system: ZombieSystem) => void;
  } = {},
) => {
  const blockSize = 0.5;
  const system = new ZombieSystem({
    isSolid: () => false,
    isOpaque: () => false,
    blockSize,
    physics: physicsFor(makeScale(blockSize)),
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    player: () => ({
      pos: [1000, 0, 1000],
      facing: [0, 0, -1],
      movement: 'still',
      lit: false,
      lightSeenFrom: 0,
      eyeHeightMetres: 1.3,
    }),
    dayPhase: () => dayStateAtHour(12),
    hurtPlayer: () => undefined,
    ...presentation.effects,
  });
  const id = system.store.add(zombie);
  presentation.beforeDamage?.(system);
  system.setFrozen(frozen);
  const boxes = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, blockSize));
  const { center } = boxes.torso.find((box) => box.bone === 'chest')!;
  const origin: Vec3 = [center[0] - zombie.facing[0] * 2, center[1], center[2] - zombie.facing[2] * 2];
  const direction: Vec3 = [center[0] - origin[0], center[1] - origin[1], center[2] - origin[2]];
  const hit = system.swing(origin, direction, {
    ...FISTS_MELEE,
    damage: Number.MAX_SAFE_INTEGER,
    reach: 3,
    cooldown: 0,
    stamina: 0,
    type: 'blunt',
  });
  if (hit !== id || !zombie.incapacitated) {
    throw new Error('Damage fixture did not incapacitate its shambler');
  }
  return { system, id };
};

const directionAngle = (a: Vec3, b: Vec3): number => {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const scale = Math.hypot(...a) * Math.hypot(...b);
  return Math.acos(Math.max(-1, Math.min(1, dot / scale)));
};

const renderedHead = (renderer: MobActorMeshes, id: number): { readonly forward: Vec3; readonly center: Vec3 } => {
  const internal = renderer as unknown as {
    states: Map<number, { variantIndex: number; lastPose: Pose | undefined }>;
    variants: readonly { realized: { body: { bones: readonly Bone[] } } }[];
  };
  const state = internal.states.get(id)!;
  const head = boneTransforms(internal.variants[state.variantIndex]!.realized.body.bones, state.lastPose!).get('head')!;
  return {
    forward: [...mulMV(head.r, [0, 0, -1])] as Vec3,
    center: [...applyPoint(head, [0, 0, 0])] as Vec3,
  };
};

describe('facing convention', () => {
  it('renders a +X-facing zombie with its local forward along +X in world', () => {
    const renderer = new MobActorMeshes(0.5, 1, { zombies: registry.zombies, poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const id = store.add(makeZombie([0, 0, 0], [1, 0, 0]));
      renderer.sync(store, 0, 1);
      const pelvis = renderer.boneMatrix(id, 'pelvis')!;
      const forward: Vec3 = [-pelvis[2]!, -pelvis[6]!, -pelvis[10]!];
      expect(forward[0]).toBeCloseTo(1, 9);
      expect(forward[1]).toBeCloseTo(0, 9);
      expect(forward[2]).toBeCloseTo(0, 9);
    } finally {
      renderer.dispose();
    }
  });
});

describe('feet at body.pos.y (mobgen pose convention)', () => {
  it('a standing pose puts the lowest foot corner at local y = 0, so placing the rig at body.pos.y needs no extra offset', () => {
    const shamblerTemplate = TEMPLATES.find((t) => t.name === 'shambler')!;
    const found = generateValid(shamblerTemplate, 1)!;
    const { body, voxels } = realize(found.genome);
    const extents = footRestExtents(body.bones, voxels);
    const walkActor = {
      bones: body.bones,
      extents,
      params: found.genome.params as HumanoidParams,
      seed: found.genome.seed,
    };
    const pose = walkPose(walkActor, INITIAL_CLOCK, 0); // speed 0: the standing pose

    const parentIndex = indexBonesByParent(body.bones);
    const scratch = allocateBoneTransforms(body.bones.length);
    boneTransformsInto(body.bones, pose, parentIndex, scratch);

    let minY = Number.POSITIVE_INFINITY;
    for (const [boneId, extent] of extents) {
      const boneIndex = body.bones.findIndex((b) => b.id === boneId);
      const t = scratch[boneIndex]!;
      for (const c of corners(extent)) {
        const y = t.r[3] * c[0] + t.r[4] * c[1] + t.r[5] * c[2] + t.t[1];
        minY = Math.min(minY, y);
      }
    }
    // Not toBeCloseTo(0, ...): groundOffset deliberately smooth-mins across tied corners (mobgen's
    // GROUND_SMOOTHING = 0.006 m) rather than a hard min, so a flat sole's several tied-lowest corners
    // undershoot true-zero by up to ~0.006 * ln(#tied corners) — a few mm to ~1.25 cm here, by design
    // (see mob/gait.ts's own smoothMinAll comment), not a bug to chase to the millimetre.
    expect(Math.abs(minY)).toBeLessThan(0.02);
  });
});

describe('MobActorMeshes', () => {
  it('queues exact pose texture contents through admission, offscreen movement, severing, death and row reuse', () => {
    const canvas = new EventTarget() as HTMLCanvasElement;
    const renderer = new MobActorMeshes(0.5, 3, {
      zombies: registry.zombies,
      poolSize: 1,
      canvas,
    });
    const { texture, states, corpses, debris } = renderer as unknown as {
      texture: DataTexture;
      states: Map<number, { globalRow: number }>;
      corpses: Map<number, { globalRow: number }>;
      debris: Map<string, { globalRow: number }>;
    };
    const data = texture.image.data as Float32Array;
    const bits = new Uint32Array(data.buffer, data.byteOffset, data.length);
    const uploaded = new Uint32Array(bits.length);
    let version = -1;
    let partialUploads = 0;
    const upload = (): void => {
      if (version !== texture.version || texture.updateRanges.length > 0) {
        if (texture.updateRanges.length === 0) {
          uploaded.set(bits);
        } else {
          partialUploads += 1;
          for (const { start, count } of texture.updateRanges) {
            expect(start % 4).toBe(0);
            expect(count % 4).toBe(0);
            expect(Math.floor(start / (texture.image.width * 4))).toBe(
              Math.floor((start + count - 1) / (texture.image.width * 4)),
            );
            uploaded.set(bits.subarray(start, start + count), start);
          }
          texture.clearUpdateRanges();
        }
        ({ version } = texture);
        texture.onUpdate?.(texture);
      }
      expect(uploaded).toEqual(bits);
    };
    const store = new MapEntityStore<Zombie>();
    const zombie = makeZombie([0, 0, -5]);
    const id = store.add(zombie);
    try {
      renderer.sync(store);
      expect(texture.updateRanges).toHaveLength(0);
      upload();
      const before = uploaded.slice();
      const camera = new PerspectiveCamera(55, 1, 0.01, 50);
      camera.lookAt(0, 0, 1);
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      zombie.body.pos[0] += 2;
      renderer.sync(store, 1 / 60);
      // No bind between syncs: the next pass must receive both sets of changes.
      store.add(makeZombie([4, 0, -5]));
      renderer.sync(store, 1 / 60);
      upload();
      expect(uploaded).not.toEqual(before);
      renderer.zombieSevered(id, 'hand.L', undefined, zombie);
      expect(debris.size).toBeGreaterThan(0);
      renderer.zombieDied(id, zombie);
      expect(corpses.has(id)).toBe(true);
      const releasedRows = new Set([...corpses.values(), ...debris.values()].map(({ globalRow }) => globalRow));
      store.remove(id);
      renderer.sync(store, 1 / 60);
      upload();
      renderer.sync(
        store,
        CORPSE_LIFECYCLE.lieSimSeconds +
          CORPSE_LIFECYCLE.sinkSimSeconds +
          ragdollContent.stepBudget * ragdollContent.timestep,
      );
      upload();
      const replacement = store.add(makeZombie([8, 0, -5]));
      renderer.sync(store, 1 / 60);
      expect(releasedRows.has(states.get(replacement)!.globalRow)).toBe(true);
      upload();
      expect(partialUploads).toBeGreaterThan(0);
      canvas.dispatchEvent(new Event('webglcontextlost'));
      uploaded.fill(0);
      renderer.sync(store);
      expect(texture.updateRanges).toHaveLength(0);
      upload();
    } finally {
      renderer.dispose();
    }
  });

  it('uses terrain reveal membership for detailed and box actors without removing their presentation state', () => {
    const terrain = new ChunkMeshes(0.5, registry);
    const renderer = new MobActorMeshes(0.5, 1, {
      zombies: registry.zombies,
      poolSize: 1,
      reveal: terrain,
    });
    const boxes = new ZombieMeshes(0.5, 1, terrain);
    const store = new MapEntityStore<Zombie>();
    const zombie = makeZombie([2 * CHUNK + 1, 0, 1]);
    const id = store.add(zombie);
    const snapshot = structuredClone(zombie);
    const internal = renderer as unknown as {
      hiddenRow: number;
      states: Map<number, { variantIndex: number; instanceIndex: number; globalRow: number }>;
      variants: readonly { crowdSlotAttr: InstancedBufferAttribute }[];
    };
    try {
      for (const allowed of [false, true, false]) {
        terrain.setRevealedColumns(allowed ? new Set(['0,0', '1,0', '2,0']) : new Set(['0,0']));
        renderer.sync(store);
        boxes.sync(store);
        const state = internal.states.get(id)!;
        expect(state).toBeDefined();
        // Both the colour and custom-depth shaders consume this same per-instance row.
        const row = internal.variants[state.variantIndex]!.crowdSlotAttr.getX(state.instanceIndex);
        expect(row).toBe(allowed ? state.globalRow : internal.hiddenRow);
        const boxInstances = boxes.group.children as InstancedMesh[];
        expect(boxInstances.some((mesh) => mesh.count > 0)).toBe(allowed);
        expect(boxInstances.some((mesh) => mesh.castShadow && mesh.count > 0)).toBe(allowed);
        expect(store.get(id)).toBe(zombie);
        expect(zombie).toEqual(snapshot);
      }
    } finally {
      renderer.dispose();
    }
  });

  it('reposes a runner that reuses an offscreen variant slot before it can draw', () => {
    const renderer = new MobActorMeshes(0.5, 1, { zombies: registry.zombies, poolSize: 1 });
    try {
      const camera = new PerspectiveCamera(55, 1, 0.01, 50);
      camera.position.set(0, 1.6, 0);
      camera.lookAt(0, 0.85, -2.5);
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      const store = new MapEntityStore<Zombie>();
      const firstId = store.add(makeZombie([0, 0, -5], [0, 0, -1], [], { type: RUNNER, figureSeed: 1 }));
      renderer.sync(store, 1 / 60, 1);
      const internal = renderer as unknown as {
        states: Map<number, { localSlot: number; lastPlacement: { x: number; y: number; z: number } | undefined }>;
      };
      const firstState = internal.states.get(firstId)!;
      expect(firstState.lastPlacement).toBeDefined();
      const firstMatrix = renderer.boneMatrix(firstId, 'head')!;

      store.remove(firstId);
      renderer.sync(store, 1 / 60, 1);
      const secondZombie = makeZombie([20, 0, -5], [0, 0, -1], [], { type: RUNNER, figureSeed: 1 });
      const secondId = store.add(secondZombie);
      renderer.sync(store, 1 / 60, 1);

      const secondState = internal.states.get(secondId)!;
      expect(secondState.localSlot).toBe(firstState.localSlot);
      expect(secondState.lastPlacement).toBeDefined();
      expect([secondState.lastPlacement?.x, secondState.lastPlacement?.y, secondState.lastPlacement?.z]).toEqual(
        secondZombie.body.pos.map((coordinate) => coordinate * 0.5),
      );
      expect(renderer.boneMatrix(secondId, 'head')).not.toEqual(firstMatrix);
    } finally {
      renderer.dispose();
    }
  });

  it('tracks the player with every live model without mutating zombie simulation state', () => {
    const renderer = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 1 });
    try {
      const camera = new PerspectiveCamera(55, 1, 0.01, 50);
      camera.position.set(0.6, 1.6, 0);
      camera.lookAt(0, 1, -2);
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      const store = new MapEntityStore<Zombie>();
      const entries = [SHAMBLER, RUNNER, CRAWLER].map((type) => {
        const zombie = makeZombie([0, 0, -4], [0, 0, 1], [], { type });
        zombie.mode = 'chase';
        return { zombie, id: store.add(zombie) };
      });
      const before = entries.map(({ zombie }) => ({
        position: [...zombie.body.pos],
        facing: [...zombie.facing],
        headYaw: zombie.headYaw,
        gaitPhase: zombie.gaitPhase,
        behavior: zombie.behaviorRng.state(),
        sound: zombie.soundRng.state(),
        dismember: zombie.dismemberRng.state(),
      }));

      renderer.sync(store, 1 / 30, 1);
      const first = entries.map(({ id }) => renderer.boneMatrix(id, 'head'));
      renderer.sync(store, 1 / 30, 1);
      const second = entries.map(({ id }) => renderer.boneMatrix(id, 'head'));

      expect(first.every((matrix) => matrix !== undefined)).toBe(true);
      expect(second.every((matrix, index) => matrix?.some((value, axis) => value !== first[index]![axis]))).toBe(true);
      expect(
        entries.map(({ zombie }) => ({
          position: [...zombie.body.pos],
          facing: [...zombie.facing],
          headYaw: zombie.headYaw,
          gaitPhase: zombie.gaitPhase,
          behavior: zombie.behaviorRng.state(),
          sound: zombie.soundRng.state(),
          dismember: zombie.dismemberRng.state(),
        })),
      ).toEqual(before);
    } finally {
      renderer.dispose();
    }
  });

  it('drips from the acid mouth and bursts the sac at death without changing the zombie', () => {
    const acid = registry.zombies.get('acid_zombie')!;
    const effects = new AcidEffects(0.5, WORLD_GRAVITY, 1);
    const bursts: Vec3[] = [];
    const renderer = new MobActorMeshes(0.5, 2, {
      zombies: registry.zombies,
      poolSize: 1,
      onBurst: (position, zombie) => {
        bursts.push(position);
        effects.deathSplash(position, zombie);
      },
    });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, -4], [0, 0, 1], [], { type: acid });
      const id = store.add(zombie);
      const before = structuredClone(zombie);
      let dripped = 0;
      for (let frame = 0; frame < 60; frame++) {
        renderer.sync(store, 1 / 30, 1);
        effects.syncDroplets(renderer.anchors(), 1 / 30);
        dripped = Math.max(dripped, effects.dropletCount());
      }
      expect(dripped).toBeGreaterThan(0);

      store.remove(id);
      renderer.zombieDied(id, zombie);
      expect(bursts).toHaveLength(1);
      const [x, y, z] = bursts[0]!;
      expect(Math.hypot(x - zombie.body.pos[0] * 0.5, z - zombie.body.pos[2] * 0.5)).toBeLessThan(1);
      expect(y).toBeGreaterThan(zombie.body.pos[1] * 0.5);
      expect(effects.dropletCount()).toBeGreaterThanOrEqual(acid.acidBody!.deathSplash.droplets);
      renderer.sync(store, 1 / 30, 1);
      effects.syncDroplets(renderer.anchors(), 1 / 30);
      expect(zombie).toEqual(before);
    } finally {
      renderer.dispose();
      effects.dispose();
    }
  });

  it('eases gaze back to the simulation pose when the zombie loses sight', () => {
    const renderer = new MobActorMeshes(0.5, 2, { zombies: registry.zombies, poolSize: 1 });
    try {
      const camera = new PerspectiveCamera(55, 1, 0.01, 50);
      camera.position.set(0.6, 1.6, 0);
      camera.lookAt(0, 1, -2);
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      const zombie = makeZombie([0, 0, -4], [0, 0, 1]);
      zombie.mode = 'investigate';
      const store = new MapEntityStore<Zombie>();
      const id = store.add(zombie);
      renderer.sync(store, 1 / 30, 1);
      const state = (renderer as unknown as { states: Map<number, { lookAtState: readonly number[] }> }).states.get(
        id,
      )!;
      expect(state.lookAtState).toEqual(LOOK_AT_REST);

      zombie.mode = 'chase';
      for (let frame = 0; frame < 10; frame++) {
        renderer.sync(store, 1 / 30, 1);
      }
      const before = state.lookAtState;
      expect(Math.abs(before[3]!)).toBeLessThan(1);

      zombie.mode = 'investigate';
      renderer.sync(store, 1 / 30, 1);

      expect(state.lookAtState).not.toEqual(LOOK_AT_REST);
      expect(Math.abs(state.lookAtState[3]!)).toBeGreaterThan(Math.abs(before[3]!));
    } finally {
      renderer.dispose();
    }
  });

  it('aims at a recent near stimulus with deterministic jitter, then eases when two perception updates pass', () => {
    const renderer = new MobActorMeshes(0.5, 2, { zombies: registry.zombies, poolSize: 1 });
    try {
      const camera = new PerspectiveCamera(55, 1, 0.01, 50);
      camera.position.set(-2.5, 1.6, -2);
      camera.lookAt(0, 1, -2);
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      const zombie = makeZombie([0, 0, 0]);
      zombie.mode = 'investigate';
      zombie.investigationTier = 'near';
      zombie.lastPerceived = [4, 0, -4];
      const store = new MapEntityStore<Zombie>();
      const id = store.add(zombie);
      const heardPoint: Vec3 = [2, 0, -2];
      let gazeKeepsVarying = false;
      let previousGaze: readonly number[] | undefined;

      for (let frame = 0; frame < 72; frame++) {
        const time = 1 + frame / 20;
        zombie.stimulusAt = time;
        zombie.renderPrevious.time = time;
        renderer.sync(store, 1 / 20, 1, false, 1, time);
        const gaze = (renderer as unknown as { states: Map<number, { lookAtState: readonly number[] }> }).states.get(
          id,
        )!.lookAtState;
        if (frame > 30 && previousGaze?.some((value, axis) => Math.abs(value - gaze[axis]!) > 1e-5)) {
          gazeKeepsVarying = true;
        }
        previousGaze = [...gaze];
      }

      const finalHead = renderedHead(renderer, id);
      const cameraDirection: Vec3 = [
        camera.position.x - finalHead.center[0],
        camera.position.y - finalHead.center[1],
        camera.position.z - finalHead.center[2],
      ];
      const heardDirection: Vec3 = [
        heardPoint[0] - finalHead.center[0],
        heardPoint[1] - finalHead.center[1],
        heardPoint[2] - finalHead.center[2],
      ];
      expect(directionAngle(finalHead.forward, heardDirection)).toBeLessThan(
        directionAngle(finalHead.forward, cameraDirection),
      );
      expect(gazeKeepsVarying).toBe(true);

      const state = (renderer as unknown as { states: Map<number, { lookAtState: readonly number[] }> }).states.get(
        id,
      )!;
      const beforeStale = state.lookAtState;
      zombie.renderPrevious.time = 1 + 72 / 20;
      renderer.sync(store, 1 / 20, 1, false, 1, zombie.renderPrevious.time);
      expect(state.lookAtState).not.toEqual(LOOK_AT_REST);
      const afterOneUpdate = state.lookAtState;
      zombie.renderPrevious.time = 1 + 73 / 20;
      renderer.sync(store, 1 / 20, 1, false, 1, zombie.renderPrevious.time);
      expect(state.lookAtState).not.toEqual(LOOK_AT_REST);
      expect(Math.abs(state.lookAtState[3]!)).toBeGreaterThan(Math.abs(afterOneUpdate[3]!));
      expect(Math.abs(state.lookAtState[3]!)).toBeGreaterThan(Math.abs(beforeStale[3]!));
    } finally {
      renderer.dispose();
    }
  });

  it('keeps far investigations and horde targets from driving gaze', () => {
    const renderer = new MobActorMeshes(0.5, 2, { zombies: registry.zombies, poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const entries = [undefined, 'horde-test'].map((hordeId, index) => {
        const zombie = makeZombie([index * 4, 0, 0]);
        zombie.mode = 'investigate';
        zombie.investigationTier = 'far';
        zombie.lastPerceived = [8, 0, -8];
        zombie.stimulusAt = 1;
        zombie.renderPrevious.time = 1;
        if (hordeId !== undefined) {
          zombie.hordeId = hordeId;
        }
        return { id: store.add(zombie), zombie };
      });
      renderer.sync(store, 1 / 30, 1, false, 1, 1);
      const { states } = renderer as unknown as { states: Map<number, { lookAtState: readonly number[] }> };
      expect(entries.map(({ id }) => states.get(id)!.lookAtState)).toEqual([LOOK_AT_REST, LOOK_AT_REST]);
    } finally {
      renderer.dispose();
    }
  });

  it('keeps hearing jitter deterministic and within its yaw and pitch bounds', () => {
    const target: Vec3 = [3, 1, -4];
    const id = 37;
    const time = 2.75;
    const jittered = hearingGazeTarget(target, id, time);
    expect(hearingGazeTarget(target, id, time)).toEqual(jittered);
    expect(Math.hypot(...jittered)).toBeCloseTo(Math.hypot(...target), 10);
    const yaw = (point: Vec3): number => Math.atan2(-point[0], -point[2]);
    const pitch = (point: Vec3): number => Math.atan2(point[1], Math.hypot(point[0], point[2]));
    const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
    expect(Math.abs(wrap(yaw(jittered) - yaw(target)))).toBeLessThanOrEqual(
      (HEARING_GAZE_JITTER.yawDeg * Math.PI) / 180 + 1e-8,
    );
    expect(Math.abs(pitch(jittered) - pitch(target))).toBeLessThanOrEqual(
      (HEARING_GAZE_JITTER.pitchDeg * Math.PI) / 180 + 1e-8,
    );
    const varied = Array.from({ length: 32 }, (_, frame) => hearingGazeTarget(target, id, time + frame / 20));
    expect(varied.some((point) => directionAngle(point, target) > 1e-4)).toBe(true);
  });

  it('aims chase gaze at the simulated body eyes instead of a spectator camera', () => {
    const renderer = new MobActorMeshes(0.5, 2, { zombies: registry.zombies, poolSize: 1 });
    try {
      const camera = new PerspectiveCamera(55, 1, 0.01, 50);
      camera.position.set(-2.5, 1.6, -2);
      camera.lookAt(0, 1, -2);
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      renderer.setPlayerEyePosition([2, 0, -2], PLAYER.sprint);
      const zombie = makeZombie([0, 0, -4]);
      zombie.mode = 'chase';
      const store = new MapEntityStore<Zombie>();
      const id = store.add(zombie);
      for (let frame = 0; frame < 20; frame++) {
        renderer.sync(store, 1 / 20, 1);
      }
      const head = renderedHead(renderer, id);
      const bodyEyeDirection: Vec3 = [2 - head.center[0], -head.center[1], -head.center[2]];
      const cameraDirection: Vec3 = [-2.5 - head.center[0], 1.6 - head.center[1], -head.center[2]];
      expect(directionAngle(head.forward, bodyEyeDirection)).toBeLessThan(
        directionAngle(head.forward, cameraDirection),
      );
    } finally {
      renderer.dispose();
    }
  });

  it('labels a player-source near noise, a lure light, stale attention, and no attention from stored state', () => {
    const zombie = makeZombie([0, 0, 0]);
    const blockSize = 0.5;
    const playerEye: Vec3 = [1.5, 1.6, -2];
    zombie.mode = 'chase';
    const chase = perceptionLabelFor(zombie, false, playerEye, { blockSize, maxSpeed: PLAYER.sprint });
    zombie.mode = 'investigate';
    zombie.investigationTier = 'near';
    zombie.lastPerceived = [playerEye[0] / blockSize, 0, playerEye[2] / blockSize];
    const playerNoise = perceptionLabelFor(zombie, true, playerEye, { blockSize, maxSpeed: PLAYER.sprint });
    const oneSprintStepLater: Vec3 = [
      playerEye[0] + (PLAYER.sprint / ZOMBIE_RATE) * (1 - 1e-6),
      playerEye[1],
      playerEye[2],
    ];
    expect(perceptionLabelFor(zombie, true, oneSprintStepLater, { blockSize, maxSpeed: PLAYER.sprint })).toBe(
      playerNoise,
    );
    const lureLightPosition: Vec3 = [playerEye[0] + blockSize, playerEye[1], playerEye[2]];
    zombie.lastPerceived = [lureLightPosition[0] / blockSize, 0, lureLightPosition[2] / blockSize];
    const lure = perceptionLabelFor(zombie, true, playerEye, { blockSize, maxSpeed: PLAYER.sprint });
    const stale = perceptionLabelFor(zombie, false, playerEye, { blockSize, maxSpeed: PLAYER.sprint });
    zombie.mode = 'idle';
    zombie.investigationTier = undefined;
    zombie.lastPerceived = undefined;
    const unaware = perceptionLabelFor(zombie, false, playerEye, { blockSize, maxSpeed: PLAYER.sprint });
    expect(new Set([chase, playerNoise, lure, stale, unaware])).toHaveLength(5);
  });

  it('does not track after the zombie dies', () => {
    const renderer = new MobActorMeshes(0.5, 2, { zombies: registry.zombies, poolSize: 1 });
    try {
      const camera = new PerspectiveCamera(55, 1, 0.01, 50);
      camera.position.set(0.6, 1.6, 0);
      camera.lookAt(0, 1, -2);
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      const zombie = makeZombie([0, 0, -4], [0, 0, 1]);
      const store = new MapEntityStore<Zombie>();
      const id = store.add(zombie);
      renderer.sync(store, 1 / 30, 1);
      const damage = incapacitate(zombie);
      expect(damage.system.finishDowned(damage.id, true)).toBeUndefined();
      expect(zombie.regions.head).toBe(0);
      renderer.zombieDied(id, zombie, [0, 0, 0]);
      const corpse = (renderer as unknown as { corpses: Map<number, { basePose: unknown }> }).corpses.get(id)!;
      const frozenPose = structuredClone(corpse.basePose);
      camera.position.set(-2, 1.8, 1);
      camera.lookAt(0, 1, -2);
      camera.updateMatrixWorld(true);
      store.remove(id);
      renderer.sync(store, 1 / 30, 1);
      expect(corpse.basePose).toEqual(frozenPose);
    } finally {
      renderer.dispose();
    }
  });

  it('matches the simulation hit boxes to every renderer bone matrix within 1 mm across covering poses', () => {
    const renderer = new MobActorMeshes(0.5, 8, { zombies: new Map([[SHAMBLER.id, SHAMBLER]]) });
    try {
      const store = new MapEntityStore<Zombie>();
      const entries = SHAMBLER_FIGURE_SEEDS.map((seed, index) => {
        const zombie = makeZombie([index * 4, 0, 0], [0, 0, -1], [], { figureSeed: seed });
        return { seed, zombie, id: store.add(zombie) };
      });
      renderer.sync(store, 0, 1);
      const poses: readonly HitParityPose[] = [
        { name: 'standing idle', speed: 0, phase: 0, chase: false, windup: 0 },
        { name: 'wander walk', speed: 0.8, phase: 0.8, chase: false, windup: 0, idleTime: 1.2 },
        {
          name: 'mid-step smoothing',
          speed: 0.7,
          phase: 1.1,
          chase: true,
          windup: 0,
          stanceWeight: 0.5,
          stepOffset: -0.25,
        },
        { name: 'stumble', speed: 0.25, phase: 4.1, chase: true, windup: 0, yaw: -0.2, stumbleFactor: 0.15 },
        { name: 'attack windup', speed: 0.7, phase: Math.PI / 2, chase: true, windup: 0.2 },
        {
          name: 'head look and hit flinch',
          speed: 0,
          phase: 0,
          chase: false,
          windup: 0,
          idleTime: 2.5,
          headYaw: 0.35,
          hitFlinchTime: 0.08,
          yaw: 0.2,
        },
      ];
      for (const pose of poses) {
        setHitParityPose(renderer, entries, pose);
        renderer.sync(store, 0, 1);
        expect(hitParityErrors(renderer, entries, pose), pose.name).toEqual([]);
      }
    } finally {
      renderer.dispose();
    }
  });

  it('draws the exact persisted figure seed, not an EntityId-derived variant', () => {
    const seeds = SHAMBLER_FIGURE_SEEDS;
    const type = { ...SHAMBLER, figureSeeds: seeds };
    const renderer = new MobActorMeshes(0.5, 8, { zombies: new Map([[type.id, type]]) });
    try {
      const store = new MapEntityStore<Zombie>();
      const ids = seeds.map((seed, index) =>
        store.add(makeZombie([index * 2, 0, 0], [0, 0, -1], [], { figureSeed: seed })),
      );
      renderer.sync(store, 0, 1);
      const internals = renderer as unknown as {
        states: Map<number, { variantIndex: number }>;
        variants: readonly { walkActorTemplate: { seed: number } }[];
      };
      for (let i = 0; i < ids.length; i++) {
        const state = internals.states.get(ids[i]!)!;
        expect(internals.variants[state.variantIndex]!.walkActorTemplate.seed).toBe(seeds[i]);
      }
    } finally {
      renderer.dispose();
    }
  });

  it('draws every registry zombie type, visibly, with the figure its content model realizes', () => {
    const renderer = new MobActorMeshes(0.5, registry.zombies.size, { zombies: registry.zombies, poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const entries = [...registry.zombies.values()].map((type, index) => {
        const figureSeed = type.figureSeeds?.[0] ?? AMALGAM_FIGURE_SEED;
        return { type, figureSeed, id: store.add(makeZombie([index * 3, 0, 0], [0, 0, -1], [], { type, figureSeed })) };
      });
      expect(entries.length).toBeGreaterThan(0);
      renderer.sync(store, 0, 1);
      const internals = renderer as unknown as {
        group: { visible: boolean };
        states: Map<number, { variantIndex: number }>;
        variants: readonly { mesh: InstancedMesh; realized: { body: { bones: readonly { id: string }[] } } }[];
      };

      expect(internals.group.visible).toBe(true);
      for (const { id, type, figureSeed } of entries) {
        const state = internals.states.get(id);
        expect(state, type.id).toBeDefined();
        if (!state) {
          continue;
        }
        const { mesh, realized } = internals.variants[state.variantIndex]!;
        expect(realized, type.id).toBe(zombieFigure(type, figureSeed).realized);
        expect(mesh.visible).toBe(true);
        expect(mesh.count).toBeGreaterThan(0);
        expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        expect(materials.length).toBeGreaterThan(0);
        expect(materials.every((material) => material.visible)).toBe(true);
        const isAmalgam = type === amalgamTypeOf(registry.zombies);
        const matrix = renderer.boneMatrix(id, realized.body.bones[0]!.id);
        expect(matrix, type.id).toHaveLength(12);
        if (isAmalgam) {
          expect(Math.hypot(matrix![0]!, matrix![4]!, matrix![8]!)).toBeCloseTo(type.bodyScale!);
        }
      }
    } finally {
      renderer.dispose();
    }
  });

  it('poses every registry zombie type through its attack wind-up while chasing and flinching', () => {
    const renderer = new MobActorMeshes(0.5, registry.zombies.size, { zombies: registry.zombies, poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const entries = [...registry.zombies.values()].map((type, index) => {
        const figureSeed = type.figureSeeds?.[0] ?? AMALGAM_FIGURE_SEED;
        const zombie = makeZombie([index * 3, 0, 0], [0, 0, -1], [], { type, figureSeed });
        setOneHitParityPose(zombie, {
          name: 'attacking',
          chase: true,
          speed: 1,
          phase: 1,
          windup: type.attack.windupSimSeconds / 2,
          hitFlinchTime: HIT_FLINCH_DURATION / 4,
        });
        return { type, realized: zombieFigure(type, figureSeed).realized, id: store.add(zombie) };
      });
      expect(entries.some(({ type }) => type.model === 'crawler')).toBe(true);
      renderer.sync(store, 1 / 60, 1);
      for (const { type, realized, id } of entries) {
        expect(realized.body.bones.length, type.id).toBeGreaterThan(0);
        for (const bone of realized.body.bones) {
          const matrix = renderer.boneMatrix(id, bone.id);
          expect(matrix, `${type.id} ${bone.id}`).toHaveLength(12);
          expect(matrix!.every(Number.isFinite), `${type.id} ${bone.id}`).toBe(true);
        }
      }
    } finally {
      renderer.dispose();
    }
  });

  it('draws a carved amalgam once, from a wound mesh with flesh walls, and drops it with the amalgam', () => {
    const amalgam = registry.zombies.get('amalgam')!;
    const renderer = new MobActorMeshes(0.5, 2, { zombies: registry.zombies, poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0], [0, 0, -1], [], { type: amalgam });
      const id = store.add(zombie);
      renderer.sync(store, 0, 1);
      // What a light hit along +x takes: the first flesh cell of a grid row, whose neighbour further in is
      // flesh too, so the hole has a wall.
      const figure = amalgamFigureForType(amalgam, zombie.figureSeed);
      const { dims, owner } = figure.realized.voxels;
      const firstFlesh = (row: number): number => {
        const start = row * dims[0];
        const offset = owner.subarray(start, start + dims[0]).findIndex((value) => value > 0);
        return offset < 0 || offset + 1 >= dims[0] ? -1 : start + offset;
      };
      const struck = Array.from({ length: dims[1] * dims[2] }, (_, row) => firstFlesh(row)).find(
        (cell) => cell >= 0 && owner[cell + 1]! > 0,
      )!;
      expect(struck).toBeGreaterThanOrEqual(0);
      const cells = carveAround({
        figure,
        carving: amalgam.carving!,
        missing: missingFlesh(figure, zombie),
        struck,
        damage: 1,
      });
      zombie.carved = cells;
      renderer.zombieCarved(id, zombie, cells, { point: [0, 2, 0], direction: [1, 0, 0], impulse: 0 });

      const internals = renderer as unknown as {
        wounds: Map<number, { mesh: InstancedMesh }>;
        states: Map<number, { variantIndex: number; instanceIndex: number }>;
        variants: readonly { crowdSlotAttr: InstancedBufferAttribute }[];
        hiddenRow: number;
        fleshChunks: { count: number };
      };
      const wound = internals.wounds.get(id)!;
      const state = internals.states.get(id)!;
      expect(renderer.group.children).toContain(wound.mesh);
      expect(internals.variants[state.variantIndex]!.crowdSlotAttr.getX(state.instanceIndex)).toBe(internals.hiddenRow);
      expect(internals.fleshChunks.count).toBe(1);
      const neighbours = wound.mesh.geometry.getAttribute('neighbourBone');
      const colors = wound.mesh.geometry.getAttribute('color');
      const interior = new Color(amalgam.carving!.interiorColor);
      const walls = Array.from({ length: neighbours.count }, (_, v) => v).filter(
        (v) => neighbours.getX(v) === CARVED_NEIGHBOUR,
      );
      expect(walls.length).toBeGreaterThan(0);
      expect(
        walls.every((v) =>
          [colors.getX(v), colors.getY(v), colors.getZ(v)].every(
            (c, axis) => Math.abs(c - interior.toArray()[axis]!) < 1e-6,
          ),
        ),
      ).toBe(true);

      store.remove(id);
      renderer.sync(store, 0, 1);
      expect(internals.wounds.has(id)).toBe(false);
      expect(renderer.group.children).not.toContain(wound.mesh);
    } finally {
      renderer.dispose();
    }
  });

  it('generates its variant pool and syncs without throwing', () => {
    const renderer = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 2 });
    try {
      const store = new MapEntityStore<Zombie>();
      store.add(makeZombie([0, 0, 0]));
      store.add(makeZombie([2, 0, 2]));
      expect(() => renderer.sync(store, 1 / 60, 1)).not.toThrow();
      expect(() => renderer.sync(store, 1 / 60, 1)).not.toThrow();
    } finally {
      renderer.dispose();
    }
  });

  it('recycles a slot once its zombie is removed from the store', () => {
    const renderer = new MobActorMeshes(0.5, 1, { zombies: registry.zombies, poolSize: 1 }); // exactly one slot, total
    try {
      const store = new MapEntityStore<Zombie>();
      const firstId = store.add(makeZombie([0, 0, 0]));
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isTracked(firstId)).toBe(true);

      store.remove(firstId);
      renderer.sync(store, 1 / 60, 1); // this frame's own prune pass frees the slot
      expect(renderer.isTracked(firstId)).toBe(false);

      const secondId = store.add(makeZombie([1, 0, 1]));
      renderer.sync(store, 1 / 60, 1); // the freed slot is available immediately
      expect(renderer.isTracked(secondId)).toBe(true);
    } finally {
      renderer.dispose();
    }
  });

  it("doesn't render a zombie beyond its variant's capacity (documented overflow behaviour)", () => {
    const renderer = new MobActorMeshes(0.5, 1, { zombies: registry.zombies, poolSize: 1 }); // capacity 1, so a 2nd zombie always overflows
    try {
      const store = new MapEntityStore<Zombie>();
      const first = store.add(makeZombie([0, 0, 0]));
      const second = store.add(makeZombie([1, 0, 1]));
      renderer.sync(store, 1 / 60, 1);
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isTracked(first)).toBe(true);
      expect(renderer.isTracked(second)).toBe(false);
    } finally {
      renderer.dispose();
    }
  });
});

describe('flinchSideForId', () => {
  it('is deterministic and always in [-1, 1)', () => {
    for (const id of [1, 2, 3, 17, 1000, 999_999]) {
      const a = flinchSideForId(id);
      const b = flinchSideForId(id);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(-1);
      expect(a).toBeLessThan(1);
    }
  });
});

describe('fallDirectionAwayFromPlayer', () => {
  it('falls backward when the player is ahead (in the facing direction) — away from them', () => {
    expect(fallDirectionAwayFromPlayer([0, 0, -1], [0, 0, 0], [0, 0, -3])).toBe(-1);
  });

  it('falls forward when the player is behind — away from them', () => {
    expect(fallDirectionAwayFromPlayer([0, 0, -1], [0, 0, 0], [0, 0, 3])).toBe(1);
  });

  it('defaults to backward when no player position is available', () => {
    expect(fallDirectionAwayFromPlayer([0, 0, -1], [0, 0, 0], undefined)).toBe(-1);
  });
});

describe('MobActorMeshes reactions', () => {
  it('honours validated zero drip and dead-thing budgets while retaining live downed bodies', () => {
    const graphics = {
      ...registry.graphics.get(CORE_CONTENT_IDS.coreGraphics)!,
      mobActors: { maxCorpses: 0 },
      gore: { dropletCap: 3, splatCap: 3, dropletSpawnsPerFrame: 3, dripSourceCap: 0 },
    };
    const source = { source: 'zero-budget-fixture', data: { graphics: [graphics] } };
    expect(validateContent(source)).toEqual([]);
    const row = buildRegistry([source]).registry.graphics.get(graphics.id)!;
    const renderer = new RenderMobActorMeshes(0.5, 3, {
      zombies: registry.zombies,
      poolSize: 1,
      look: LOOK_FIXTURE.mobActors,
      maxCorpses: row.mobActors.maxCorpses,
      handlingReachMetres: reachTuning(registry).reachMetres,
      gravityMetresPerSimSecondSquared: WORLD_GRAVITY,
    });
    const gore = new Gore(0.5, WORLD_GRAVITY, row.gore);
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      const id = store.add(zombie);
      renderer.sync(store, 0, 1);
      gore.update(1, () => false, { zombies: store, listener: [0, 0, 0] });
      expect(gore.activeDroplets).toBe(0);
      renderer.zombieSevered(id, 'hand.L');
      expect(debrisEntries(renderer).size).toBe(0);
      renderer.zombieDied(id, zombie);
      store.remove(id);
      expect(renderer.isTracked(id)).toBe(false);
      const downed = makeZombie([0, 0, 0]);
      const downedId = store.add(downed);
      renderer.sync(store, 0, 1);
      const damage = incapacitate(downed);
      renderer.sync(store, 0, 1);
      expect(renderer.isTracked(downedId)).toBe(true);
      damage.system.finishDowned(damage.id, false);
      renderer.zombieDied(downedId, downed);
      store.remove(downedId);
      expect(renderer.isTracked(downedId)).toBe(false);
    } finally {
      gore.dispose();
      renderer.dispose();
    }
  });
  it('keeps a corpse (its slot) until it has lain and sunk, then frees it — unlike a plain vanish', async () => {
    const renderer = new MobActorMeshes(0.5, 2, { zombies: registry.zombies, poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      const id = store.add(zombie);
      renderer.sync(store, 1 / 60, 1);
      store.remove(id);
      renderer.zombieDied(id, zombie);
      await renderer.whenCorpsesReady();
      expect(renderer.isTracked(id)).toBe(true); // still drawn, as a corpse

      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isTracked(id)).toBe(true);
      const step = 0.1;
      const lifetime =
        ragdollContent.stepBudget * ragdollContent.timestep +
        CORPSE_LIFECYCLE.lieSimSeconds +
        CORPSE_LIFECYCLE.sinkSimSeconds;
      for (let frame = 0; frame <= Math.ceil(lifetime / step) && renderer.isTracked(id); frame++) {
        renderer.sync(store, step, 1);
      }
      expect(renderer.isTracked(id)).toBe(false);
    } finally {
      renderer.dispose();
    }
  });

  it.each([false, true])('builds a ragdoll for torso incapacitation with frozen=%s', async (frozen) => {
    const renderer = new MobActorMeshes(0.5, 2, { zombies: registry.zombies, poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      const id = store.add(zombie);
      renderer.sync(store, 0, 1);
      incapacitate(zombie, frozen);
      renderer.sync(store, 0, 1, frozen);
      await renderer.whenCorpsesReady();
      const corpse = (
        renderer as unknown as {
          readonly corpses: ReadonlyMap<number, { readonly ragdoll?: { readonly parts: readonly unknown[] } }>;
        }
      ).corpses.get(id);
      expect(zombie.incapacitated).toBe(true);
      expect(zombie.severed).toEqual([]);
      expect(corpse?.ragdoll?.parts.length).toBeGreaterThan(0);
      const before = renderer.boneMatrix(id, 'pelvis');
      renderer.sync(store, ragdollContent.timestep, 1, frozen);
      expect(renderer.boneMatrix(id, 'pelvis')).not.toEqual(before);
    } finally {
      renderer.dispose();
    }
  });

  it('finishing a downed ragdoll cuts physical subtrees into shared-world debris without leaking them', async () => {
    const renderer = new MobActorMeshes(0.5, 8, { zombies: registry.zombies, poolSize: 1 });
    try {
      const { system, id } = incapacitate(makeZombie([0, 0, 0]), false, {
        beforeDamage: (owner) => renderer.sync(owner.store, 0, 1),
        effects: {
          onIncapacitated: (entity, zombie) => renderer.zombieIncapacitated(entity, zombie),
          onSever: (entity, zombie, part, hit) => {
            renderer.zombieSevered(entity, part, hit, zombie);
          },
          onDeath: (entity, zombie) => renderer.zombieDied(entity, zombie),
        },
      });
      await renderer.whenCorpsesReady();
      for (let step = 0; step < ragdollContent.stepBudget; step++) {
        renderer.sync(system.store, ragdollContent.timestep, 1);
      }
      const before = renderer.boneMatrix(id, 'head');
      expect(before).toBeDefined();
      expect(system.finishDowned(id, true)).toBeUndefined();
      await renderer.whenCorpsesReady();
      renderer.sync(system.store, 0, 1);
      expect(renderer.isBoneHidden(id, 'head')).toBe(true);
      expect(renderer.debrisCountFor(id)).toBeGreaterThan(0);
      const head = zombieFigure({ model: 'shambler' }, 1).realized.body.bones.findIndex((bone) => bone.id === 'head');
      const finished = (
        renderer as unknown as { corpses: ReadonlyMap<number, { ragdoll: import('../src/render/ragdoll.ts').Ragdoll }> }
      ).corpses.get(id)!;
      expect(finished.ragdoll.parts.length).toBeGreaterThan(0);
      expect(finished.ragdoll.parts.some((part) => part.sources.has(head))).toBe(false);
      const physics = (renderer as unknown as { ragdolls: import('../src/render/ragdoll.ts').RagdollWorld }).ragdolls;
      expect(physics.counts().bodies).toBeGreaterThan(0);
      const horizon =
        ragdollContent.stepBudget * ragdollContent.timestep +
        CORPSE_LIFECYCLE.lieSimSeconds +
        CORPSE_LIFECYCLE.sinkSimSeconds;
      for (let step = 0; step <= Math.ceil(horizon / ragdollContent.timestep); step++) {
        renderer.sync(system.store, ragdollContent.timestep, 1);
      }
      expect(renderer.isTracked(id)).toBe(false);
      expect(renderer.debrisCountFor(id)).toBe(0);
      expect(physics.counts()).toEqual({ bodies: 0, colliders: 0, joints: 0 });
    } finally {
      renderer.dispose();
    }
  });

  it.each([
    { model: 'shambler', cuts: ['thigh.L'] },
    { model: 'runner', cuts: ['thigh.L', 'thigh.R'] },
    { model: 'brute', cuts: ['thigh.R'] },
  ])(
    'hands $model leg loss back to crawling and releases its physics without mutating simulation',
    async ({ model, cuts }) => {
      const type = [...registry.zombies.values()].find((candidate) => candidate.model === model)!;
      const renderer = new MobActorMeshes(0.5, 2, { zombies: new Map([[type.id, type]]), poolSize: 1 });
      const reference = new MobActorMeshes(0.5, 2, { zombies: new Map([[type.id, type]]), poolSize: 1 });
      const store = new MapEntityStore<Zombie>();
      const seed = type.figureSeeds![0]!;
      const id = store.add(makeZombie([0, 0, 0], [0, 0, -1], [], { type, figureSeed: seed }));
      try {
        renderer.sync(store);
        const upright = renderer.boneMatrix(id, 'chest');
        const crawling = makeZombie([0, 0, 0], [0, 0, -1], cuts, { type, figureSeed: seed });
        store.replace(id, crawling);
        const before = structuredClone(crawling);
        renderer.zombieWounded(id, { point: [0, 0, 0], direction: [1, 0, 0], impulse: 1 });
        renderer.sync(store);
        expect(renderer.boneMatrix(id, 'chest')).toEqual(upright);
        await renderer.whenCorpsesReady();
        const physics = (renderer as unknown as { ragdolls: import('../src/render/ragdoll.ts').RagdollWorld }).ragdolls;
        expect(physics.counts().bodies).toBeGreaterThan(0);
        renderer.sync(store, ragdollContent.timestep);
        renderer.sync(store, ragdollContent.timestep);
        expect(renderer.boneMatrix(id, 'chest')).not.toEqual(upright);
        const moved = makeZombie([2, 0, 1], [1, 0, 0], cuts, { type, figureSeed: seed });
        store.replace(id, moved);
        const movedBefore = structuredClone(moved);
        const horizon = ragdollContent.crawlFall.fallSeconds + ragdollContent.crawlFall.blendSeconds;
        for (let time = 0; time <= horizon; time += ragdollContent.timestep) {
          renderer.sync(store, ragdollContent.timestep);
        }
        expect(moved).toEqual(movedBefore);
        reference.sync(store);
        expect(renderer.boneMatrix(id, 'chest')).toEqual(reference.boneMatrix(id, 'chest'));
        expect(physics.counts()).toEqual({ bodies: 0, colliders: 0, joints: 0 });
        expect(crawling).toEqual(before);
      } finally {
        renderer.dispose();
        reference.dispose();
      }
    },
  );

  it('places a second cut on the drawn falling body', async () => {
    const renderer = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 1 });
    const store = new MapEntityStore<Zombie>();
    const zombie = makeZombie([0, 0, 0]);
    const id = store.add(zombie);
    try {
      renderer.sync(store);
      const crawling = makeZombie([0, 0, 0], [0, 0, -1], ['thigh.L']);
      store.replace(id, crawling);
      renderer.sync(store);
      await renderer.whenCorpsesReady();
      renderer.sync(store, ragdollContent.timestep);
      renderer.sync(store, ragdollContent.timestep);
      const figure = zombieFigure(crawling.type, crawling.figureSeed).realized;
      const before = renderer.boneMatrix(id, 'hand.L')!;
      renderer.zombieSevered(id, 'hand.L', undefined, crawling);
      const debris = [
        ...(
          renderer as unknown as {
            debris: Map<string, { sourceTransforms: Map<number, { t: Vec3; r: readonly number[] }> }>;
          }
        ).debris.values(),
      ][0]!;
      const hand = figure.body.bones.findIndex((bone) => bone.id === 'hand.L');
      const source = debris.sourceTransforms.get(hand)!;
      source.t.forEach((value, axis) => {
        expect(value).toBeCloseTo(before[axis * 4 + 3]!, 5);
      });
      source.r.forEach((value, axis) => {
        expect(value).toBeCloseTo(before[Math.floor(axis / 3) * 4 + (axis % 3)]!, 5);
      });
    } finally {
      renderer.dispose();
    }
  });

  it('retains the frozen downed body after physics initialization fails', async () => {
    await initializeRagdollPhysics();
    const failure = new Error('Physics world unavailable');
    const world = vi.spyOn(RAPIER.World.prototype, 'timestep', 'set').mockImplementationOnce(() => {
      throw failure;
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const renderer = new MobActorMeshes(0.5, 2, { zombies: registry.zombies, poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      const id = store.add(zombie);
      renderer.sync(store, 0, 1);
      incapacitate(zombie);
      renderer.sync(store, 0, 1);
      await renderer.whenCorpsesReady();
      expect(warning).toHaveBeenCalledWith(expect.any(String), failure);
      renderer.sync(store, 0, 1);
      renderer.sync(store, 0, 1);
      const upright = renderer.boneMatrix(id, 'pelvis');
      expect(upright).toBeDefined();
      renderer.sync(store, ragdollContent.stepBudget * ragdollContent.timestep, 1);
      expect(renderer.isTracked(id)).toBe(true);
      expect(renderer.boneMatrix(id, 'pelvis')).toEqual(upright);
    } finally {
      renderer.dispose();
      world.mockRestore();
      warning.mockRestore();
    }
  });

  it('keeps an incapacitated row lying beyond corpse lifetime and out of MAX_CORPSES eviction', async () => {
    const renderer = new MobActorMeshes(0.5, CORPSE_LIFECYCLE.maxCorpses + 2, {
      zombies: registry.zombies,
      poolSize: 1,
    });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombies = Array.from({ length: CORPSE_LIFECYCLE.maxCorpses + 2 }, (_, i) => makeZombie([i * 2, 0, 0]));
      const ids = zombies.map((zombie) => store.add(zombie));
      renderer.sync(store, 0, 1);
      const uprightHead = renderer.boneMatrix(ids[0]!, 'head');
      const incapacitated = zombies[0]!;
      incapacitate(incapacitated);
      renderer.sync(store, 0, 1);
      for (let i = 1; i < zombies.length; i++) {
        renderer.zombieDied(ids[i]!, zombies[i]!);
        store.remove(ids[i]!);
      }
      expect(renderer.isTracked(ids[0]!)).toBe(true);
      expect(renderer.isTracked(ids[1]!)).toBe(false); // oldest ordinary corpse evicted; incapacitated row is protected
      await renderer.whenCorpsesReady();
      for (let step = 0; step < ragdollContent.stepBudget; step++) {
        renderer.sync(store, ragdollContent.timestep, 1);
      }
      const lying = renderer.boneMatrix(ids[0]!, 'pelvis');
      expect(lying).toBeDefined();
      renderer.sync(
        store,
        ragdollContent.stepBudget * ragdollContent.timestep +
          CORPSE_LIFECYCLE.lieSimSeconds +
          CORPSE_LIFECYCLE.sinkSimSeconds +
          1,
        1,
      );
      expect(renderer.boneMatrix(ids[0]!, 'head')).not.toEqual(uprightHead); // prove this is the fall pose, not a standing live row
      expect(renderer.isTracked(ids[0]!)).toBe(true);
      renderer.sync(store, CORPSE_LIFECYCLE.sinkSimSeconds + 1, 1);
      expect(renderer.boneMatrix(ids[0]!, 'pelvis')).toEqual(lying); // lies still; never sinks
    } finally {
      renderer.dispose();
    }
  });

  it('lets an incapacitated row lie and sink once its zombie dies, as any corpse does', async () => {
    const renderer = new MobActorMeshes(0.5, 2, { zombies: registry.zombies, poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      const id = store.add(zombie);
      renderer.sync(store, 1 / 60, 1);
      const damage = incapacitate(zombie);
      renderer.sync(store, 0, 1);
      await renderer.whenCorpsesReady();
      for (let step = 0; step < ragdollContent.stepBudget; step++) {
        renderer.sync(store, ragdollContent.timestep, 1);
      }
      renderer.sync(store, CORPSE_LIFECYCLE.lieSimSeconds + CORPSE_LIFECYCLE.sinkSimSeconds + 1, 1);
      expect(damage.system.finishDowned(damage.id, false)).toBeUndefined();
      store.remove(id);
      renderer.zombieDied(id, zombie);
      renderer.sync(store, 1, 1);
      expect(renderer.isTracked(id)).toBe(true); // still lies there, now as an ordinary corpse

      renderer.sync(
        store,
        ragdollContent.stepBudget * ragdollContent.timestep +
          CORPSE_LIFECYCLE.lieSimSeconds +
          CORPSE_LIFECYCLE.sinkSimSeconds +
          1,
        1,
      );
      expect(renderer.isTracked(id)).toBe(false);
    } finally {
      renderer.dispose();
    }
  });

  it('evicts the oldest corpse when its shared dead-thing budget is exceeded', () => {
    const renderer = new MobActorMeshes(0.5, 64, { zombies: registry.zombies, poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const ids: number[] = [];
      for (let i = 0; i < 64 && (ids.length === 0 || renderer.isTracked(ids[0]!)); i++) {
        const zombie = makeZombie([i, 0, 0]);
        const id = store.add(zombie);
        renderer.sync(store, 1 / 60, 1);
        store.remove(id);
        renderer.zombieDied(id, zombie);
        ids.push(id);
      }
      expect(ids.length).toBeGreaterThan(1);
      expect(renderer.isTracked(ids[0]!)).toBe(false);
      for (const id of ids.slice(1)) {
        expect(renderer.isTracked(id)).toBe(true);
      }
    } finally {
      renderer.dispose();
    }
  });
});

describe('MobActorMeshes dismemberment', () => {
  it("hides a severed bone's whole subtree (zero matrices), leaving the other arm alone", () => {
    const renderer = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 2 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      zombie.severed.push('upperArm.L');
      const id = store.add(zombie);
      renderer.sync(store, 1 / 60, 1);

      expect(renderer.isBoneHidden(id, 'upperArm.L')).toBe(true);
      expect(renderer.isBoneHidden(id, 'forearm.L')).toBe(true);
      expect(renderer.isBoneHidden(id, 'hand.L')).toBe(true);
      expect(renderer.isBoneHidden(id, 'upperArm.R')).toBe(false);
      expect(renderer.isBoneHidden(id, 'forearm.R')).toBe(false);
      expect(renderer.isBoneHidden(id, 'pelvis')).toBe(false);
    } finally {
      renderer.dispose();
    }
  });

  it('re-derives hidden bones from zombie.severed every sync (source of truth, e.g. after a save/load)', () => {
    const renderer = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 2 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      const id = store.add(zombie);
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isBoneHidden(id, 'hand.L')).toBe(false);

      zombie.severed.push('hand.L'); // simulates a fresh severing (or a restored save) between syncs
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isBoneHidden(id, 'hand.L')).toBe(true);
    } finally {
      renderer.dispose();
    }
  });

  it('continues corpse sinking while live zombie animation is frozen', async () => {
    const renderer = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 2 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0], [0, 0, -1], [], { figureSeed: 1 });
      const id = store.add(zombie);
      renderer.sync(store, 0, 1);
      renderer.zombieDied(id, zombie);
      store.remove(id);

      const step = 0.1;
      await renderer.whenCorpsesReady();
      let previous = renderer.boneMatrix(id, 'pelvis')![7]!;
      let lying: number | undefined;
      // One extra sample after the step budget distinguishes lying still from falling.
      for (
        let frame = 0;
        frame <= Math.ceil((ragdollContent.stepBudget * ragdollContent.timestep) / step) + 1 && lying === undefined;
        frame++
      ) {
        renderer.sync(store, step, 1, true);
        const current = renderer.boneMatrix(id, 'pelvis')![7]!;
        if (current === previous) {
          lying = current;
        }
        previous = current;
      }
      expect(lying).toBeDefined();
      let sank = false;
      const lifetime =
        ragdollContent.stepBudget * ragdollContent.timestep +
        CORPSE_LIFECYCLE.lieSimSeconds +
        CORPSE_LIFECYCLE.sinkSimSeconds;
      for (let frame = 0; frame <= Math.ceil(lifetime / step) && renderer.isTracked(id); frame++) {
        renderer.sync(store, step, 1, true);
        const pelvis = renderer.boneMatrix(id, 'pelvis');
        sank ||= pelvis !== undefined && pelvis[7]! < lying!;
      }
      expect(sank).toBe(true);
    } finally {
      renderer.dispose();
    }
  });

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the lifecycle probe observes each debris state.
  it('allocates a debris slot on zombieSevered and frees it after its lifetime', async () => {
    const renderer = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 2 });
    try {
      renderer.setWorld((_x, y, _z) => y === -1, 0.5);
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      const id = store.add(zombie);
      renderer.sync(store, 1 / 60, 1); // establishes render state (lastPos) to spawn debris from

      renderer.zombieSevered(id, 'hand.L');
      expect(renderer.debrisCountFor(id)).toBe(1);
      await renderer.whenCorpsesReady();

      const step = ragdollContent.timestep;
      const settlementBudget = ragdollContent.stepBudget * step + step;
      const horizon = settlementBudget + CORPSE_LIFECYCLE.lieSimSeconds + CORPSE_LIFECYCLE.sinkSimSeconds;
      let observedSleep = false;
      for (let frame = 0; frame <= Math.ceil(horizon / step) && renderer.debrisCountFor(id) > 0; frame++) {
        renderer.sync(store, step, 1);
        const entries = debrisEntries(renderer);
        for (const debris of entries.values()) {
          if (!debris.body.asleep || debris.groundedAt === undefined) {
            continue;
          }
          observedSleep = true;
          expect(debris.groundedAt).toBeLessThanOrEqual(settlementBudget);
          if (debris.elapsed < debris.groundedAt + CORPSE_LIFECYCLE.lieSimSeconds) {
            const bodyRotation = quatToMat3(debris.body.orientation);
            const lowest =
              debris.body.center[1] + Math.min(...debris.body.corners.map((corner) => mulMV(bodyRotation, corner)[1]));
            expect(lowest).toBeGreaterThanOrEqual(-0.01);
          }
        }
      }
      expect(observedSleep).toBe(true);
      expect(renderer.debrisCountFor(id)).toBe(0);
    } finally {
      renderer.dispose();
    }
  });

  it('rests debris on the feet-height fallback plane when no world is supplied', async () => {
    const renderer = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      const id = store.add(zombie);
      renderer.sync(store, 1 / 60, 1);
      renderer.zombieSevered(id, 'hand.L', undefined, zombie);
      await renderer.whenCorpsesReady();
      for (
        let frame = 0;
        frame < ragdollContent.stepBudget && ![...debrisEntries(renderer).values()][0]!.body.asleep;
        frame++
      ) {
        renderer.sync(store, ragdollContent.timestep, 1);
      }
      const entries = debrisEntries(renderer);
      expect(entries.size).toBe(1);
      const debris = [...entries.values()][0]!;
      expect(debris.body.asleep).toBe(true);
      const bodyRotation = quatToMat3(debris.body.orientation);
      const lowest =
        debris.body.center[1] +
        debris.originOffsetY +
        Math.min(...debris.body.corners.map((corner) => mulMV(bodyRotation, corner)[1]));
      expect(lowest).toBeGreaterThanOrEqual(-0.01);
    } finally {
      renderer.dispose();
    }
  });
  it('preserves every carried bone world transform at the instant debris is created', () => {
    const renderer = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([2, 0, -3], [1, 0, 0]);
      const id = store.add(zombie);
      renderer.sync(store, 1 / 60, 1);
      const template = TEMPLATES.find((candidate) => candidate.name === 'shambler')!;
      const realized = realize(generateValid(template, 1)!.genome);
      const boneIds = [...severedBoneSet(realized.body.bones, ['forearm.L'])];
      const before = new Map(boneIds.map((bone) => [bone, renderer.boneMatrix(id, bone)!]));
      renderer.zombieSevered(id, 'forearm.L', undefined, zombie);
      renderer.sync(store, 0, 1); // packs without advancing the rigid body
      for (const [bone, matrix] of before) {
        const debrisMatrix = renderer.debrisBoneMatrix(id, 'forearm.L', bone);
        expect(debrisMatrix).toBeDefined();
        if (!debrisMatrix) {
          continue;
        }
        for (const index of [3, 7, 11]) {
          expect(Math.abs(debrisMatrix[index]! - matrix[index]!)).toBeLessThan(0.001);
        }
        const rotationIndices = [0, 1, 2, 4, 5, 6, 8, 9, 10];
        const rotationDot = rotationIndices.reduce((sum, index) => sum + matrix[index]! * debrisMatrix[index]!, 0);
        const angle = Math.acos(Math.max(-1, Math.min(1, (rotationDot - 1) / 2))) * (180 / Math.PI);
        expect(angle).toBeLessThanOrEqual(0.5);
      }
    } finally {
      renderer.dispose();
    }
  });
  it('launches a manifest-owned amalgam part with blood from its shared severing presentation', () => {
    const type = registry.zombies.get('amalgam')!;
    const renderer = new MobActorMeshes(0.5, 4, { zombies: new Map([[type.id, type]]), poolSize: 1 });
    const gore = new Gore(0.5, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0], [0, 0, -1], [], { type });
      const id = store.add(zombie);
      const figure = amalgamFigureForType(type, zombie.figureSeed);
      const part = figure.manifest.parts.find((candidate) => candidate.severable)!;
      expect(part).toBeDefined();
      renderer.sync(store, 0, 1);
      const before = renderer.boneMatrix(id, part.rootBone)!;
      const hit = { point: [0, 1, 0] as Vec3, direction: [1, 0, 0] as Vec3, impulse: 10 };
      const velocity = renderer.zombieSevered(id, part.id, hit, zombie);
      gore.severed(hit, velocity, type.severedSpurt);
      expect.soft(velocity).toBeDefined();
      expect.soft(Math.hypot(...(velocity ?? [0, 0, 0]))).toBeGreaterThan(0);
      expect.soft(renderer.debrisCountFor(id)).toBeGreaterThan(0);
      expect.soft(gore.activeDroplets).toBeGreaterThan(0);
      renderer.sync(store, 0, 1);
      const debrisMatrix = renderer.debrisBoneMatrix(id, part.id, part.rootBone)!;
      expect(debrisMatrix).toBeDefined();
      for (let index = 0; index < before.length; index++) {
        expect(debrisMatrix[index]).toBeCloseTo(before[index]!, 4);
      }
    } finally {
      renderer.dispose();
      gore.dispose();
    }
  });

  it('caches template-assigned mass for every severable variant part', () => {
    const renderer = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 1 });
    try {
      const { variants } = renderer as unknown as {
        variants: readonly { rigidParts: ReadonlyMap<string, { mass: number }> }[];
      };
      const masses = [...variants[0]!.rigidParts.entries()].map(([part, properties]) => [part, properties.mass]);
      const template = TEMPLATES.find((candidate) => candidate.name === 'shambler')!;
      const { realized } = generateValid(template, 1)!;
      const { bones } = realized.body;
      const indices = new Map(bones.map((bone, index) => [bone.id, index]));
      const expected = severableParts(bones).map((part) => [
        part,
        templatePartMassProperties({
          voxels: realized.voxels,
          partBoneIndices: [...severedBoneSet(bones, [part])].map((bone) => indices.get(bone)!),
          bodyBoneIndices: bones.map((_, index) => index),
          voxelSize: realized.voxels.size,
          template,
          part,
        }).mass,
      ]);
      expect(masses).toEqual(expected);
    } finally {
      renderer.dispose();
    }
  });
  it('debris OBB contains the posed limb at spawn', () => {
    const template = TEMPLATES.find((candidate) => candidate.name === 'shambler')!;
    const { realized } = generateValid(template, 1)!;
    const handRenderer = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 1 });
    try {
      const handStore = new MapEntityStore<Zombie>();
      const handZombie = makeZombie([0, 0, 0]);
      const handId = handStore.add(handZombie);
      handRenderer.sync(handStore, 0, 1);
      const handRest = handRenderer.boneMatrix(handId, 'hand.L')!;
      handZombie.mode = 'chase';
      handZombie.attackWait = handZombie.type.attack.cooldownSimSeconds - 0.35;
      handZombie.attackWindup = 0;
      handRenderer.sync(handStore, 0, 1);
      const handAttack = handRenderer.boneMatrix(handId, 'hand.L')!;
      expect(rotationAngleDeg(handRest, handAttack)).toBeGreaterThanOrEqual(30);
      handRenderer.zombieSevered(handId, 'hand.L', undefined, handZombie);
      handRenderer.sync(handStore, 0, 1);
      const handContainment = partContainment({
        renderer: handRenderer,
        id: handId,
        part: 'hand.L',
        realized,
        voxelSize: template.voxelSize,
      });
      expect(handContainment.count).toBeGreaterThan(0);
      expect(handContainment.maxOverflow).toBeLessThanOrEqual(0);
    } finally {
      handRenderer.dispose();
    }

    const headRenderer = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 1 });
    try {
      const headStore = new MapEntityStore<Zombie>();
      const headZombie = makeZombie([0, 0, 0]);
      const headId = headStore.add(headZombie);
      headRenderer.sync(headStore, 0, 1);
      const headRest = headRenderer.boneMatrix(headId, 'head')!;
      headZombie.headYaw = 0.6;
      headZombie.renderPrevious.headYaw = 0.6;
      headRenderer.sync(headStore, 0, 1);
      const headPose = headRenderer.boneMatrix(headId, 'head')!;
      expect(rotationAngleDeg(headRest, headPose)).toBeGreaterThanOrEqual(30);
      headRenderer.zombieSevered(headId, 'head', undefined, headZombie);
      headRenderer.sync(headStore, 0, 1);
      const headContainment = partContainment({
        renderer: headRenderer,
        id: headId,
        part: 'head',
        realized,
        voxelSize: template.voxelSize,
      });
      expect(headContainment.count).toBeGreaterThan(0);
      expect(headContainment.maxOverflow).toBeLessThanOrEqual(0);
    } finally {
      headRenderer.dispose();
    }
  });

  it('severing a distant zombie uses its current simulation pose', () => {
    const skipped = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 1 });
    const reference = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 1 });
    try {
      const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
      camera.position.set(0, 0, 100);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      skipped.setCamera(camera);
      const skippedStore = new MapEntityStore<Zombie>();
      const referenceStore = new MapEntityStore<Zombie>();
      const skippedZombie = makeZombie([0, 0, 0]);
      const referenceZombie = makeZombie([0, 0, 0]);
      const skippedId = skippedStore.add(skippedZombie);
      const referenceId = referenceStore.add(referenceZombie);
      skipped.sync(skippedStore, 0, 1);
      skipped.sync(skippedStore, 0, 1);
      reference.sync(referenceStore, 0, 1);
      reference.sync(referenceStore, 0, 1);
      skippedZombie.body.pos = [4, 0, 0];
      skippedZombie.renderPrevious.pos = [4, 0, 0];
      referenceZombie.body.pos = [4, 0, 0];
      referenceZombie.renderPrevious.pos = [4, 0, 0];
      skipped.sync(skippedStore, 0, 1);
      reference.sync(referenceStore, 0, 1);
      skipped.zombieSevered(skippedId, 'hand.L', undefined, skippedZombie);
      reference.zombieSevered(referenceId, 'hand.L', undefined, referenceZombie);
      const skippedCenter = [...debrisEntries(skipped).values()][0]!.initialCenter;
      const freshCenter = [...debrisEntries(reference).values()][0]!.initialCenter;
      for (const axis of [0, 1, 2]) {
        expect(Math.abs(skippedCenter[axis]! - freshCenter[axis]!)).toBeLessThan(0.01);
      }
    } finally {
      skipped.dispose();
      reference.dispose();
    }
  });
  it('does nothing for zombieSevered on an untracked id (over capacity)', () => {
    const renderer = new MobActorMeshes(0.5, 1, { zombies: registry.zombies, poolSize: 1 }); // capacity 1: a 2nd zombie always overflows
    try {
      const store = new MapEntityStore<Zombie>();
      store.add(makeZombie([0, 0, 0]));
      const second = store.add(makeZombie([1, 0, 1]));
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isTracked(second)).toBe(false);

      expect(() => renderer.zombieSevered(second, 'hand.L')).not.toThrow();
      expect(renderer.debrisCountFor(second)).toBe(0);
    } finally {
      renderer.dispose();
    }
  });

  it('debris counts toward the corpse cap, evicting the oldest dead thing first', () => {
    const population = CORPSE_LIFECYCLE.maxCorpses + 1;
    // Leave a live source row alongside every debris row so variant overflow cannot cause the eviction.
    const renderer = new MobActorMeshes(0.5, population + 1, {
      zombies: registry.zombies,
      poolSize: 1,
    });
    try {
      const store = new MapEntityStore<Zombie>();
      const ids: number[] = [];
      for (let i = 0; i < population; i++) {
        const zombie = makeZombie([i, 0, 0]);
        const id = store.add(zombie);
        renderer.sync(store, 1 / 60, 1);
        renderer.zombieSevered(id, 'hand.L'); // debris, not a corpse — still counts toward MAX_CORPSES
        store.remove(id);
        renderer.sync(store, 1 / 60, 1); // prunes the (now-vanished) live entry; the debris itself survives
        ids.push(id);
      }
      expect(renderer.debrisCountFor(ids[0]!)).toBe(0);
      for (const id of ids.slice(1)) {
        expect(renderer.debrisCountFor(id)).toBe(1);
      }
    } finally {
      renderer.dispose();
    }
  });
});

describe('MobActorMeshes stance', () => {
  it('never produces the bind pose (identity rotations) for a standing (speed 0) zombie — the whole point of this task', () => {
    const renderer = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]); // idle, never moves — speed stays exactly 0
      const id = store.add(zombie);
      for (let i = 0; i < 5; i++) {
        renderer.sync(store, 1 / 60, 1);
      }
      for (const boneId of ['spine', 'chest', 'head', 'jaw', 'upperArm.L', 'upperArm.R']) {
        const r = renderer.boneRotation(id, boneId)!;
        const isIdentity = r.every((v, i) => Math.abs(v - IDENTITY_M[i]!) < 1e-9);
        expect(isIdentity, `${boneId} should not be at its raw rest orientation`).toBe(false);
      }
    } finally {
      renderer.dispose();
    }
  });

  it('never produces the bind pose for a chasing (aggravated) zombie either, before or after its stance fully settles', () => {
    const renderer = new MobActorMeshes(0.5, 4, { zombies: registry.zombies, poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      zombie.mode = 'chase';
      const id = store.add(zombie);
      renderer.sync(store, 1 / 60, 1); // partway through the cross-fade
      for (const boneId of ['spine', 'chest', 'head']) {
        const r = renderer.boneRotation(id, boneId)!;
        const isIdentity = r.every((v, i) => Math.abs(v - IDENTITY_M[i]!) < 1e-9);
        expect(isIdentity, `${boneId} should not be at its raw rest orientation`).toBe(false);
      }
    } finally {
      renderer.dispose();
    }
  });
});
