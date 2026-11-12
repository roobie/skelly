// Tests for src/render/mobActors.ts. Pure/three-without-a-GPU pieces only — no rendered pixels (no GPU
// here), so these check the maths and the state machine, not what anything looks like. See the module's
// own report for what to look at in a real browser.

import {
  type ActorBody,
  ActorBodySchema,
  type ActorClips,
  ActorClipsSchema,
  type ActorFigureFile,
  type ActorFigureFiles,
  actorClipIssues,
  actorFigure,
  actorFigureKey,
  buildRegistry,
} from '@skelly/engine/content';
import { actorHitFlinchDuration, flinchSideForId } from '@skelly/engine/internal/core/actorPose.ts';
import { posedHumanoidRegionBoxes } from '@skelly/engine/internal/core/actorRegions.ts';
import type { AgentMode } from '@skelly/engine/internal/core/actorState.ts';
import type { ActorSystemOptions } from '@skelly/engine/internal/core/actorSystem.ts';
import { validateContent } from '@skelly/engine/internal/core/content.ts';
import { MapEntityStore } from '@skelly/engine/internal/core/entities.ts';
import { initialActorFootstepClock } from '@skelly/engine/internal/core/footsteps.ts';
import { Rng } from '@skelly/engine/math';
import {
  actorPoseInputFor,
  applyPoint,
  type BodyAnchor,
  type Bone,
  boneTransforms,
  FUSED_MASS_FIGURE_SEED,
  figureVariantOf,
  fusedMassTypeOf,
  IDENTITY_M,
  mulMV,
  type Pose,
  posedActor,
  quatToMat3,
  rotY,
  severedBoneSet,
  transpose,
} from '@skelly/engine/pose';
import { ACTIVE_ACTOR_RATE, type Actor, reachTuning } from '@skelly/engine/sim';
import { CHUNK, makeScale, type Vec3 } from '@skelly/engine/world';
import { AcidEffects } from '@skelly/presentation/internal/render/acidEffects.ts';
import { actorFigureGeometry } from '@skelly/presentation/internal/render/actorFigureGeometry.ts';
import {
  type CrowdCellMaskLayout,
  type CrowdPlacement,
  isCellInMask,
} from '@skelly/presentation/internal/render/crowd.ts';
import { Gore } from '@skelly/presentation/internal/render/gore.ts';
import { LOOK_AT_REST } from '@skelly/presentation/internal/render/lookAt.ts';
import {
  fallDirectionAwayFromPlayer,
  perceptionLabelFor,
  hearingGazeTarget as renderHearingGazeTarget,
} from '@skelly/presentation/internal/render/mobActors.ts';
import { initializeRagdollPhysics } from '@skelly/presentation/internal/render/ragdoll.ts';
import RAPIER from '@skelly/presentation/internal/render/ragdollRapier.ts';
import { SHADOW_CROWD_LAYER } from '@skelly/presentation/internal/render/shadowFlags.ts';
import { ActorMeshes, ChunkMeshes, MobActorMeshes as RenderMobActorMeshes } from '@skelly/presentation/render';
import {
  Box3,
  type BufferGeometry,
  type DataTexture,
  type InstancedBufferAttribute,
  type InstancedMesh,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { safeParse } from 'valibot';
import { describe, expect, it, vi } from 'vitest';
import { ragdollConfig } from '../src/product/ragdoll.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { fixtureIds } from './fixtures/capabilityIds.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { LOOK_FIXTURE } from './lookFixture.ts';
import { CORPSE_LIFECYCLE, MobActorMeshes as FixtureMobActorMeshes, HEARING_GAZE_JITTER } from './mobActorsFixture.ts';
import { PLAYER, physicsFor, WORLD_GRAVITY } from './playerFixture.ts';
import { GORE_TUNING_FIXTURE } from './presentationFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';

const hearingGazeTarget = (target: Vec3, id: number, time: number): Vec3 =>
  renderHearingGazeTarget(target, id, time, LOOK_FIXTURE.mobActors.hearingGazeJitter);

import { ActorSystem } from './zombieSystemFixture.ts';

interface TestDebris {
  elapsed: number;
  groundedAt: number | undefined;
  originOffsetY: number;
  initialCenter: Vec3;
  globalRow: number;
  variantIndex: number;
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
  readonly actor: Actor;
}
const setOneHitParityPose = (actor: Actor, pose: HitParityPose): void => {
  actor.agent!.mode = pose.chase ? 'chase' : 'idle';
  actor.chaseStance = actor.agent!.mode === 'chase';
  if (!pose.chase && pose.speed > 0) {
    actor.agent!.mode = 'stroll';
    actor.chaseStance = false;
  }
  actor.facing = [-Math.sin(pose.yaw ?? 0), 0, -Math.cos(pose.yaw ?? 0)];
  actor.horizontalSpeed = pose.speed;
  actor.stumbleFactor = pose.stumbleFactor ?? 1;
  actor.stanceWeight = pose.stanceWeight ?? (pose.chase || pose.windup > 0 ? 1 : 0);
  actor.stepOffset = pose.stepOffset ?? 0;
  actor.gaitPhase = pose.phase;
  actor.attackWindup = pose.windup;
  actor.attackWait =
    pose.windup > 0 ? actor.type.attack!.cooldownSimSeconds - (actor.type.attack!.windupSimSeconds - pose.windup) : 0;
  actor.wanderClock = pose.idleTime ?? 0;
  actor.hitFlinchTime = pose.hitFlinchTime;
  actor.headYaw = pose.headYaw ?? 0;
  actor.renderPrevious = {
    pos: [...actor.body.pos],
    facing: [...actor.facing],
    headYaw: actor.headYaw,
    gaitPhase: pose.phase,
  };
};

const setHitParityPose = (_renderer: MobActorMeshes, entries: readonly HitParityEntry[], pose: HitParityPose): void => {
  for (const { actor } of entries) {
    setOneHitParityPose(actor, pose);
  }
};

const hitParityErrorsForBox = ({
  renderer,
  body,
  id,
  phase,
  windup,
  regionName,
  box,
}: {
  renderer: MobActorMeshes;
  body: ActorBody;
  id: number;
  phase: number;
  windup: number;
  regionName: string;
  box: { bone: string; center: Vec3; rotation: readonly number[] };
}): string[] => {
  const matrix = renderer.boneMatrix(id, box.bone)!;
  const local = body.boxes![regionName]!.find((rest) => rest.bone === box.bone)!.center;
  const rendered: Vec3 = [
    matrix[0]! * local[0]! + matrix[1]! * local[1]! + matrix[2]! * local[2]! + matrix[3]!,
    matrix[4]! * local[0]! + matrix[5]! * local[1]! + matrix[6]! * local[2]! + matrix[7]!,
    matrix[8]! * local[0]! + matrix[9]! * local[1]! + matrix[10]! * local[2]! + matrix[11]!,
  ];
  const key = `${body.seed}/${phase}/${windup}/${box.bone}`;
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
  entries.flatMap(({ id, actor }) => {
    const input = actorPoseInputFor(actor, id, { blockSize: 0.5, actorFigureFiles: FIGURES });
    const boxes = posedHumanoidRegionBoxes(input);
    const { body } = input.figure;
    return Object.entries(boxes).flatMap(([regionName, region]) =>
      region.flatMap((box) =>
        hitParityErrorsForBox({ renderer, body, id, phase: pose.phase, windup: pose.windup, regionName, box }),
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
  readonly body: ActorBody;
}
const partContainment = ({ renderer, id, part, body }: ContainmentCheck): { count: number; maxOverflow: number } => {
  const debris = [...debrisEntries(renderer).values()].find((entry) => entry.initialCenter !== undefined)!;
  const selected = new Set(severedBoneSet(body.bones, [part]));
  const rotation = quatToMat3(debris.body.orientation);
  const inverse = transpose(rotation);
  const halfExtents: Vec3 = [0, 1, 2].map((axis) =>
    Math.max(...debris.body.corners.map((corner) => Math.abs(corner[axis]!))),
  ) as Vec3;
  const allowance = body.voxelSize / 2 + 0.001;
  let checked = 0;
  let maxOverflow = Number.NEGATIVE_INFINITY;
  for (const bone of body.bones.filter(({ id: boneId }) => selected.has(boneId))) {
    const matrix = renderer.boneMatrix(id, bone.id)!;
    for (const local of bone.voxels ?? []) {
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
      for (const axis of [0, 1, 2]) {
        maxOverflow = Math.max(maxOverflow, Math.abs(localPoint[axis]!) - halfExtents[axis]! - allowance);
      }
      checked += 1;
    }
  }
  return { count: checked, maxOverflow };
};

interface PartBox {
  readonly corners: readonly Vec3[];
  readonly boneIndices: readonly number[];
}

/** Whether `inner` is a different part whose bones all ride on `outer`. */
const nestedIn = (inner: PartBox, outer: PartBox): boolean =>
  inner !== outer && inner.boneIndices.every((index) => outer.boneIndices.includes(index));

/**
 * How far the part's voxel cubes reach past its box, whose corners sit about the part's centre of mass: the mean of
 * its equal voxels. Throws when the part owns no voxels, so an empty part cannot pass.
 */
const partBoxOverflow = (body: ActorBody, scale: number, part: PartBox): number => {
  const centres = part.boneIndices.flatMap((index) => body.bones[index]!.voxels ?? []);
  if (centres.length === 0) {
    throw new Error('part owns no voxels');
  }
  const half = (body.voxelSize / 2) * scale;
  let overflow = Number.NEGATIVE_INFINITY;
  for (const axis of [0, 1, 2]) {
    const mean = centres.reduce((sum, centre) => sum + centre[axis]!, 0) / centres.length;
    const low = Math.min(...part.corners.map((corner) => corner[axis]!));
    const high = Math.max(...part.corners.map((corner) => corner[axis]!));
    for (const centre of centres) {
      const offset = (centre[axis]! - mean) * scale;
      overflow = Math.max(overflow, low - (offset - half), offset + half - high);
    }
  }
  return overflow;
};

const registry = baseRegistry();
const FIGURES = stackActorFigureFiles(registry);
const SHAMBLER = registry.actors.get('shambler')!;
const SHAMBLER_FIGURE_SEEDS = SHAMBLER.figureSeeds!;

/** Every renderer here draws the base stack's figures. */
class MobActorMeshes extends FixtureMobActorMeshes {
  constructor(
    blockSize: number,
    capacity: number | undefined,
    options: Omit<ConstructorParameters<typeof FixtureMobActorMeshes>[2], 'actorFigureFiles'>,
  ) {
    super(blockSize, capacity, { ...options, actorFigureFiles: FIGURES });
  }
}
const RUNNER = registry.actors.get('runner')!;
const CRAWLER = registry.actors.get('crawler')!;

/** The renderer's private shape these tests read: variant twins, rows and placements. */
const rendererInternals = (renderer: MobActorMeshes) =>
  renderer as unknown as {
    states: Map<
      number,
      {
        variantIndex: number;
        globalRow: number;
        lastPlacement: CrowdPlacement | undefined;
        drawnFall?: unknown;
        bodyTransforms: readonly {
          readonly r: Parameters<typeof mulMV>[0];
          readonly t: readonly [number, number, number];
        }[];
      }
    >;
    variants: readonly {
      mesh: InstancedMesh;
      geometry: BufferGeometry;
      body: { scale: number; bones: readonly Bone[]; anchors: { readonly [id: string]: BodyAnchor } };
      bones: readonly { readonly id: string }[];
      shadowPasses: readonly { mesh: InstancedMesh; slots: InstancedBufferAttribute }[];
      casterReach: number;
    }[];
  };

/** An axis-aligned box `radius` metres around a placement. */
const boxAround = (at: CrowdPlacement, radius: number): Box3 =>
  new Box3(
    new Vector3(at.x - radius, at.y - radius, at.z - radius),
    new Vector3(at.x + radius, at.y + radius, at.z + radius),
  );

/** A copy of a built actor GLB with every POSITION vertex's X moved by `units` model units — the same
 * layout actorFigureGeometry reads (glTF 2.0 binary, one tightly packed FLOAT VEC3 POSITION accessor),
 * bone indices untouched and the accessor's declared min/max kept in step: bind geometry loader-accepted
 * yet offset from the figure's origin. */
const offsetGlbPositions = (mesh: Uint8Array, units: number, id: string): Uint8Array => {
  const out = new Uint8Array(mesh);
  const view = new DataView(out.buffer);
  if (out.byteLength < 20 || view.getUint32(0, true) !== 0x46_54_6c_67 || view.getUint32(4, true) !== 2) {
    throw new Error(`Actor mesh ${id} is not a glTF 2.0 binary`);
  }
  const jsonLength = view.getUint32(12, true);
  const binAt = 20 + jsonLength;
  const json = JSON.parse(new TextDecoder().decode(out.subarray(20, binAt))) as {
    nodes: { mesh?: number }[];
    meshes: { primitives: { attributes: Record<string, number> }[] }[];
    accessors: {
      bufferView: number;
      byteOffset?: number;
      componentType: number;
      count: number;
      type: string;
      min?: number[];
      max?: number[];
    }[];
    bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
  };
  const node = json.nodes.find((candidate) => candidate.mesh !== undefined);
  const primitive = json.meshes[node?.mesh ?? -1]?.primitives[0];
  const accessorIndex = primitive?.attributes.POSITION ?? -1;
  const accessor = json.accessors[accessorIndex];
  const bufferView = json.bufferViews[accessor?.bufferView ?? -1];
  if (
    !(accessor && bufferView && accessor.type === 'VEC3' && accessor.componentType === 5126) ||
    (bufferView.byteStride !== undefined && bufferView.byteStride !== 12)
  ) {
    throw new Error(`Actor mesh ${id} POSITION must be a tightly packed FLOAT VEC3 accessor`);
  }
  const start = binAt + 8 + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  for (let vertex = 0; vertex < accessor.count; vertex++) {
    view.setFloat32(start + vertex * 12, view.getFloat32(start + vertex * 12, true) + units, true);
  }
  // Keep the accessor's declared bounds in step with the moved vertices, as a real export would: the
  // JSON chunk is re-serialized (space-padded to 4 bytes, glTF-Binary's convention) and the BIN chunk
  // follows at the new offset, its own internal offsets unchanged.
  if (accessor.min) {
    accessor.min[0]! += units;
  }
  if (accessor.max) {
    accessor.max[0]! += units;
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const bin = out.subarray(binAt + 8);
  const rebuilt = new Uint8Array(20 + jsonBytes.length + jsonPad + 8 + bin.length);
  const rebuiltView = new DataView(rebuilt.buffer);
  rebuiltView.setUint32(0, 0x46_54_6c_67, true);
  rebuiltView.setUint32(4, 2, true);
  rebuiltView.setUint32(8, rebuilt.length, true);
  rebuiltView.setUint32(12, jsonBytes.length + jsonPad, true);
  rebuiltView.setUint32(16, 0x4e_4f_53_4a, true);
  rebuilt.set(jsonBytes, 20);
  for (let k = 0; k < jsonPad; k++) {
    rebuilt[20 + jsonBytes.length + k] = 0x20;
  }
  const binHeader = 20 + jsonBytes.length + jsonPad;
  rebuiltView.setUint32(binHeader, bin.length, true);
  rebuiltView.setUint32(binHeader + 4, 0x00_4e_49_42, true);
  rebuilt.set(bin, binHeader + 8);
  return rebuilt;
};
/** The largest root translation one baked clip entry authors, in model units: a pose clip's or death
 * pair's frames' roots, a stance idle's base roots, or an overlay's authored drops. */
const entryRootsOf = (entry: NonNullable<ActorClips['standing']>[string]): number => {
  if ('kind' in entry) {
    if (entry.kind === 'pose') {
      return Math.max(0, ...entry.frames.map((frame) => Math.hypot(...frame.root)));
    }
    return entry.kind === 'overlay' ? Math.max(0, ...entry.frames.map((frame) => Math.abs(frame.dropMetres))) : 0;
  }
  if ('slack' in entry) {
    return Math.max(Math.hypot(...entry.slack.base.root), Math.hypot(...entry.aggravated.base.root));
  }
  return Math.max(
    0,
    ...[entry.forward, entry.backward].flatMap((fall) => fall.frames.map((frame) => Math.hypot(...frame.root))),
  );
};

/** The largest root translation a figure's baked entries author, in model units — the load-time input
 * of the placement bound the packed-row bound replaced: every pose-clip and death-pair frame root, every
 * stance idle base root, every overlay drop, and the fused-mass origin offset. */
const authoredRootsOf = (figure: ActorFigureFile): number => {
  const fused = figure.fusedMass;
  let max = fused ? Math.hypot(...(fused.originOffset.map((c) => c / fused.scale) as Vec3)) : 0;
  for (const set of [figure.clips.standing, figure.clips.crawling]) {
    for (const entry of Object.values(set ?? {})) {
      max = Math.max(max, entryRootsOf(entry));
    }
  }
  return max;
};
/** A minimal, valid Actor — same shape ActorSystem.add() builds (packages/engine/src/core/actorSystem.ts), constructed
 * directly so these tests don't need a full ActorSystem (physics/senses/etc, irrelevant here). */
const makeActor = (
  position: Vec3,
  facing: Vec3 = [0, 0, -1],
  severed: string[] = [],
  options: { readonly figureSeed?: number; readonly type?: typeof SHAMBLER } = {},
): Actor => {
  const figureSeed = options.figureSeed ?? 1;
  const type = options.type ?? SHAMBLER;
  return {
    agent: {
      home: [...position],
      mode: 'idle' as AgentMode,
      investigationTier: undefined,
      behaviorRng: Rng.stream(0, 'test-zombie'),
      soundRng: Rng.stream(0, 'test-zombie-sound'),
      idleSoundTimer: 8,
      modeTimer: 0,
      searchAnchor: undefined,
      searchTimer: 0,
      searchStrolling: false,
      searchHeading: [...facing],
      strollHeading: [...facing],
      obstacleWanderRemaining: 0,
      obstacleSlideSide: 0,
      bodyLookTarget: 0,
      headYawTarget: 0,
      lookTimer: 0,
    },
    type,
    modifiers: [],
    figureSeed,
    incapacitated: false,
    body: { pos: [...position], vel: [0, 0, 0], halfWidth: 0.28 / 0.5, height: 1.7 / 0.5, onGround: true },
    facing: [...facing],
    dismemberRng: Rng.stream(0, 'test-zombie-dismember'),
    horizontalSpeed: 0,
    obstacleContact: false,
    headYaw: 0,
    chaseStance: ('idle' as AgentMode) === 'chase',
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
    regions: { ...type.regions } as Actor['regions'],
    attackWait: 0,
    attackWindup: 0,
    spitWindup: 0,
    staggerSimSeconds: 0,
    spitWait: 0,
    spitRng: Rng.stream(0, 'test-zombie-spit'),
    gaitPhase: 0,
    footstepClock: initialActorFootstepClock(type.stepLength),
    wanderClock: 0,
    severed,
    carved: [],
  };
};

const incapacitate = (
  actor: Actor,
  frozen = false,
  presentation: {
    effects?: Pick<ActorSystemOptions, 'onSever' | 'onDeath' | 'onIncapacitated' | 'onWound'>;
    beforeDamage?: (system: ActorSystem) => void;
  } = {},
) => {
  const blockSize = 0.5;
  const system = new ActorSystem({
    isSolid: () => false,
    isOpaque: () => false,
    blockSize,
    physics: physicsFor(makeScale(blockSize)),
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
    actorFigureFiles: FIGURES,
    ...presentation.effects,
  });
  const id = system.store.add(actor);
  presentation.beforeDamage?.(system);
  system.setFrozen(frozen);
  const boxes = posedHumanoidRegionBoxes(actorPoseInputFor(actor, id, { blockSize, actorFigureFiles: FIGURES }));
  const { center } = boxes.torso.find((box) => box.bone === 'chest')!;
  const origin: Vec3 = [center[0] - actor.facing[0] * 2, center[1], center[2] - actor.facing[2] * 2];
  const direction: Vec3 = [center[0] - origin[0], center[1] - origin[1], center[2] - origin[2]];
  const hit = system.swing(origin, direction, {
    ...FISTS_MELEE,
    damage: Number.MAX_SAFE_INTEGER,
    reach: 3,
    cooldown: 0,
    stamina: 0,
    type: 'blunt',
  });
  if (hit !== id || !actor.incapacitated) {
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
    variants: readonly { bones: readonly Bone[] }[];
  };
  const state = internal.states.get(id)!;
  const head = boneTransforms(internal.variants[state.variantIndex]!.bones, state.lastPose!).get('head')!;
  // The pose is root-local and faces +z; these actors face -z, a half turn from it.
  const turned = ([x, y, z]: readonly number[]): Vec3 => [-x!, y!, -z!];
  return {
    forward: turned(mulMV(head.r, [0, 0, 1])),
    center: turned(applyPoint(head, [0, 0, 0])),
  };
};

describe('facing convention', () => {
  it('renders a +X-facing zombie with its local forward along +X in world', () => {
    const renderer = new MobActorMeshes(0.5, 1, { actors: registry.actors, poolSize: 1 });
    try {
      const store = new MapEntityStore<Actor>();
      const id = store.add(makeActor([0, 0, 0], [1, 0, 0]));
      renderer.sync(store, 0, 1);
      const pelvis = renderer.boneMatrix(id, 'pelvis')!;
      const forward: Vec3 = [pelvis[2]!, pelvis[6]!, pelvis[10]!];
      expect(forward[0]).toBeCloseTo(1, 9);
      expect(forward[1]).toBeCloseTo(0, 9);
      expect(forward[2]).toBeCloseTo(0, 9);
    } finally {
      renderer.dispose();
    }
  });
});

describe('feet at body.pos.y (built pose convention)', () => {
  it('a standing pose puts the lowest foot corner at local y = 0, so placing the rig at body.pos.y needs no extra offset', () => {
    const shambler = registry.actors.get('shambler')!;
    const seed = shambler.figureSeeds![0]!;
    const figure = actorFigure(stackActorFigureFiles(registry), shambler, seed);
    const posed = posedActor({
      figure,
      seed,
      model: figureVariantOf(shambler),
      position: [0, 0, 0],
      facing: [0, 0, -1],
      headYaw: 0,
      gaitPhase: 0,
      speed: 0,
      chasing: false,
      attackWindup: 0,
      attackWindupSeconds: 0,
      severed: [],
      blockSize: 1,
    });
    let minY = Number.POSITIVE_INFINITY;
    for (const [boneId, { min, max }] of Object.entries(figure.body.extents)) {
      const t = posed.transforms.get(boneId)!;
      for (const x of [min[0], max[0]]) {
        for (const y of [min[1], max[1]]) {
          for (const z of [min[2], max[2]]) {
            minY = Math.min(minY, applyPoint(t, [x, y, z])[1]);
          }
        }
      }
    }
    // Not toBeCloseTo(0, ...): the ground fit smooth-mins across tied corners rather than taking a hard min, so a
    // flat sole's several tied-lowest corners undershoot true zero by a few millimetres, by design
    // (`packages/engine/src/core/actorClips.ts`, `stanceFit`).
    expect(Math.abs(minY)).toBeLessThan(0.02);
  });
});

describe('MobActorMeshes', () => {
  it('repacks only the actors whose pose inputs changed since the last sync', () => {
    const renderer = new MobActorMeshes(0.5, 3, { actors: registry.actors });
    const packed: number[] = [];
    const internals = renderer as unknown as {
      packSkeleton: (globalRow: number, ...rest: unknown[]) => void;
    };
    const original = internals.packSkeleton.bind(renderer);
    internals.packSkeleton = (globalRow, ...rest) => {
      packed.push(globalRow);
      original(globalRow, ...rest);
    };
    const store = new MapEntityStore<Actor>();
    const still = makeActor([0, 0, -5]);
    const mover = makeActor([4, 0, -5]);
    const stillId = store.add(still);
    const moverId = store.add(mover);
    const { states } = renderer as unknown as { states: Map<number, { globalRow: number }> };
    try {
      renderer.sync(store, 1 / 60);
      const stillRow = states.get(stillId)!.globalRow;
      const moverRow = states.get(moverId)!.globalRow;
      packed.length = 0;

      renderer.sync(store, 1 / 60);
      expect(packed).toEqual([]);

      mover.body.pos[0] += 0.5;
      mover.renderPrevious = { ...mover.renderPrevious, pos: [...mover.body.pos] };
      renderer.sync(store, 1 / 60);
      expect(packed).toContain(moverRow);
      expect(packed).not.toContain(stillRow);
    } finally {
      renderer.dispose();
    }
  });

  it('redraws a kept row as a fresh renderer draws it once any pose or row input changes', () => {
    let bloodiness = 0;
    const options = { actors: registry.actors, poolSize: 1, bloodiness: () => bloodiness };
    const kept = new MobActorMeshes(0.5, 1, options);
    const store = new MapEntityStore<Actor>();
    const actor = makeActor([0, 0, -5]);
    const id = store.add(actor);
    const drawnRow = (renderer: MobActorMeshes): Float32Array => {
      const { texture, states } = renderer as unknown as {
        texture: DataTexture;
        states: Map<number, { globalRow: number }>;
      };
      const width = texture.image.width * 4;
      const start = states.get(id)!.globalRow * width;
      return (texture.image.data as Float32Array).slice(start, start + width);
    };
    const changes: readonly (readonly [string, () => void])[] = [
      [
        'placement',
        () => {
          actor.body.pos[0] += 0.25;
          actor.renderPrevious = { ...actor.renderPrevious, pos: [...actor.body.pos] };
        },
      ],
      [
        'yaw',
        () => {
          actor.facing = [1, 0, 0];
          actor.renderPrevious = { ...actor.renderPrevious, facing: [...actor.facing] };
        },
      ],
      [
        'clip',
        () => {
          actor.horizontalSpeed = 1;
          actor.gaitPhase += 0.5;
        },
      ],
      ['severed parts', () => actor.severed.push('hand.L')],
      [
        'bloodiness',
        () => {
          bloodiness = 1;
        },
      ],
    ];
    try {
      for (const [input, change] of changes) {
        kept.sync(store, 1 / 60);
        kept.sync(store, 1 / 60);
        const before = drawnRow(kept);
        change();
        kept.sync(store, 1 / 60);
        const fresh = new MobActorMeshes(0.5, 1, options);
        try {
          const freshStore = new MapEntityStore<Actor>();
          // The pose reads the entity id, so both renderers must see the same one.
          expect(freshStore.add(actor)).toBe(id);
          fresh.sync(freshStore, 1 / 60);
          const after = drawnRow(kept);
          expect(after, input).not.toEqual(before);
          expect(after, input).toEqual(drawnRow(fresh));
        } finally {
          fresh.dispose();
        }
      }
    } finally {
      kept.dispose();
    }
  });

  it('queues exact pose texture contents through admission, offscreen movement, severing, death and row reuse', () => {
    const canvas = new EventTarget() as HTMLCanvasElement;
    const renderer = new MobActorMeshes(0.5, 3, {
      actors: registry.actors,
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
    const store = new MapEntityStore<Actor>();
    const actor = makeActor([0, 0, -5]);
    const id = store.add(actor);
    try {
      renderer.sync(store);
      expect(texture.updateRanges).toHaveLength(0);
      upload();
      const before = uploaded.slice();
      const camera = new PerspectiveCamera(55, 1, 0.01, 50);
      camera.lookAt(0, 0, 1);
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      actor.body.pos[0] += 2;
      renderer.sync(store, 1 / 60);
      // No bind between syncs: the next pass must receive both sets of changes.
      store.add(makeActor([4, 0, -5]));
      renderer.sync(store, 1 / 60);
      upload();
      expect(uploaded).not.toEqual(before);
      renderer.actorSevered(id, 'hand.L', undefined, actor);
      expect(debris.size).toBeGreaterThan(0);
      renderer.actorDied(id, actor);
      expect(corpses.has(id)).toBe(true);
      const releasedRows = new Set([...corpses.values(), ...debris.values()].map(({ globalRow }) => globalRow));
      store.remove(id);
      renderer.sync(store, 1 / 60);
      upload();
      renderer.sync(
        store,
        CORPSE_LIFECYCLE.lieSimSeconds +
          CORPSE_LIFECYCLE.sinkSimSeconds +
          ragdollConfig.stepBudget * ragdollConfig.timestepRealSeconds,
      );
      upload();
      const replacement = store.add(makeActor([8, 0, -5]));
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
      actors: registry.actors,
      poolSize: 1,
      reveal: terrain,
    });
    const boxes = new ActorMeshes(0.5, 1, terrain);
    const store = new MapEntityStore<Actor>();
    const actor = makeActor([2 * CHUNK + 1, 0, 1]);
    const id = store.add(actor);
    const snapshot = structuredClone(actor);
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
        expect(store.get(id)).toBe(actor);
        expect(actor).toEqual(snapshot);
      }
    } finally {
      renderer.dispose();
    }
  });

  it('reposes a runner that reuses an offscreen variant slot before it can draw', () => {
    const renderer = new MobActorMeshes(0.5, 1, { actors: registry.actors, poolSize: 1 });
    try {
      const camera = new PerspectiveCamera(55, 1, 0.01, 50);
      camera.position.set(0, 1.6, 0);
      camera.lookAt(0, 0.85, -2.5);
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      const store = new MapEntityStore<Actor>();
      const firstId = store.add(makeActor([0, 0, -5], [0, 0, -1], [], { type: RUNNER, figureSeed: 1 }));
      renderer.sync(store, 1 / 60, 1);
      const internal = renderer as unknown as {
        states: Map<number, { localSlot: number; lastPlacement: { x: number; y: number; z: number } | undefined }>;
      };
      const firstState = internal.states.get(firstId)!;
      expect(firstState.lastPlacement).toBeDefined();
      const firstMatrix = renderer.boneMatrix(firstId, 'head')!;

      store.remove(firstId);
      renderer.sync(store, 1 / 60, 1);
      const secondActor = makeActor([20, 0, -5], [0, 0, -1], [], { type: RUNNER, figureSeed: 1 });
      const secondId = store.add(secondActor);
      renderer.sync(store, 1 / 60, 1);

      const secondState = internal.states.get(secondId)!;
      expect(secondState.localSlot).toBe(firstState.localSlot);
      expect(secondState.lastPlacement).toBeDefined();
      expect([secondState.lastPlacement?.x, secondState.lastPlacement?.y, secondState.lastPlacement?.z]).toEqual(
        secondActor.body.pos.map((coordinate) => coordinate * 0.5),
      );
      expect(renderer.boneMatrix(secondId, 'head')).not.toEqual(firstMatrix);
    } finally {
      renderer.dispose();
    }
  });

  it('tracks the player with every live model without mutating zombie simulation state', () => {
    const renderer = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 1 });
    try {
      const camera = new PerspectiveCamera(55, 1, 0.01, 50);
      camera.position.set(0.6, 1.6, 0);
      camera.lookAt(0, 1, -2);
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      const store = new MapEntityStore<Actor>();
      const entries = [SHAMBLER, RUNNER, CRAWLER].map((type) => {
        const actor = makeActor([0, 0, -4], [0, 0, 1], [], { type });
        actor.agent!.mode = 'chase';
        actor.chaseStance = true;
        return { actor, id: store.add(actor) };
      });
      const before = entries.map(({ actor }) => ({
        position: [...actor.body.pos],
        facing: [...actor.facing],
        headYaw: actor.headYaw,
        gaitPhase: actor.gaitPhase,
        behavior: actor.agent!.behaviorRng.state(),
        sound: actor.agent!.soundRng.state(),
        dismember: actor.dismemberRng.state(),
      }));

      renderer.sync(store, 1 / 30, 1);
      const first = entries.map(({ id }) => renderer.boneMatrix(id, 'head'));
      renderer.sync(store, 1 / 30, 1);
      const second = entries.map(({ id }) => renderer.boneMatrix(id, 'head'));

      expect(first.every((matrix) => matrix !== undefined)).toBe(true);
      expect(second.every((matrix, index) => matrix?.some((value, axis) => value !== first[index]![axis]))).toBe(true);
      expect(
        entries.map(({ actor }) => ({
          position: [...actor.body.pos],
          facing: [...actor.facing],
          headYaw: actor.headYaw,
          gaitPhase: actor.gaitPhase,
          behavior: actor.agent!.behaviorRng.state(),
          sound: actor.agent!.soundRng.state(),
          dismember: actor.dismemberRng.state(),
        })),
      ).toEqual(before);
    } finally {
      renderer.dispose();
    }
  });

  it('drips from the acid mouth and bursts the sac at death without changing the zombie', () => {
    const acid = registry.actors.get('acid_zombie')!;
    const effects = new AcidEffects(0.5, WORLD_GRAVITY, 1);
    const bursts: Vec3[] = [];
    const renderer = new MobActorMeshes(0.5, 2, {
      actors: registry.actors,
      poolSize: 1,
      onBurst: (position, actor) => {
        bursts.push(position);
        effects.deathSplash(position, actor);
      },
    });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, -4], [0, 0, 1], [], { type: acid });
      const id = store.add(actor);
      const before = structuredClone(actor);
      let dripped = 0;
      for (let frame = 0; frame < 60; frame++) {
        renderer.sync(store, 1 / 30, 1);
        effects.syncDroplets(renderer.anchors(), 1 / 30);
        dripped = Math.max(dripped, effects.dropletCount());
      }
      expect(dripped).toBeGreaterThan(0);
      // Drips and the burst leave from the built body's anchors, carried by the bone matrices the renderer drew.
      const { anchors } = actorFigure(FIGURES, acid, actor.figureSeed).body;
      const drawnAt = (anchor: BodyAnchor): Vec3 => {
        const m = renderer.boneMatrix(id, anchor.bone)!;
        const [px, py, pz] = anchor.position;
        return [0, 1, 2].map(
          (row) => m[row * 4]! * px + m[row * 4 + 1]! * py + m[row * 4 + 2]! * pz + m[row * 4 + 3]!,
        ) as Vec3;
      };
      const expectNear = (actual: Vec3 | undefined, expected: Vec3): void => {
        expect(actual).toBeDefined();
        expect(Math.hypot(...actual!.map((value, axis) => value - expected[axis]!))).toBeLessThan(1e-3);
      };
      const drawn = [...renderer.anchors()].find((entry) => entry.actor === actor)!;
      expectNear(drawn.mouth, drawnAt(anchors!.mouth!));
      expectNear(drawn.glow, drawnAt(anchors!.glow!));
      const sac = drawnAt(anchors!.glow!);

      store.remove(id);
      renderer.actorDied(id, actor);
      expect(bursts).toHaveLength(1);
      expectNear(bursts[0], sac);
      expect(effects.dropletCount()).toBeGreaterThanOrEqual(acid.acidBody!.deathSplash.droplets);
      renderer.sync(store, 1 / 30, 1);
      effects.syncDroplets(renderer.anchors(), 1 / 30);
      expect(actor).toEqual(before);
    } finally {
      renderer.dispose();
      effects.dispose();
    }
  });

  it('eases gaze back to the simulation pose when the zombie loses sight', () => {
    const renderer = new MobActorMeshes(0.5, 2, { actors: registry.actors, poolSize: 1 });
    try {
      const camera = new PerspectiveCamera(55, 1, 0.01, 50);
      camera.position.set(0.6, 1.6, 0);
      camera.lookAt(0, 1, -2);
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      const actor = makeActor([0, 0, -4], [0, 0, 1]);
      actor.agent!.mode = 'investigate';
      actor.chaseStance = false;
      const store = new MapEntityStore<Actor>();
      const id = store.add(actor);
      renderer.sync(store, 1 / 30, 1);
      const state = (renderer as unknown as { states: Map<number, { lookAtState: readonly number[] }> }).states.get(
        id,
      )!;
      expect(state.lookAtState).toEqual(LOOK_AT_REST);

      actor.agent!.mode = 'chase';
      actor.chaseStance = true;
      for (let frame = 0; frame < 10; frame++) {
        renderer.sync(store, 1 / 30, 1);
      }
      const before = state.lookAtState;
      expect(Math.abs(before[3]!)).toBeLessThan(1);

      actor.agent!.mode = 'investigate';
      actor.chaseStance = false;
      renderer.sync(store, 1 / 30, 1);

      expect(state.lookAtState).not.toEqual(LOOK_AT_REST);
      expect(Math.abs(state.lookAtState[3]!)).toBeGreaterThan(Math.abs(before[3]!));
    } finally {
      renderer.dispose();
    }
  });

  it('aims at a recent near stimulus with deterministic jitter, then eases when two perception updates pass', () => {
    const renderer = new MobActorMeshes(0.5, 2, { actors: registry.actors, poolSize: 1 });
    try {
      const camera = new PerspectiveCamera(55, 1, 0.01, 50);
      camera.position.set(-2.5, 1.6, -2);
      camera.lookAt(0, 1, -2);
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      const actor = makeActor([0, 0, 0]);
      actor.agent!.mode = 'investigate';
      actor.chaseStance = false;
      actor.agent!.investigationTier = 'near';
      actor.agent!.lastPerceived = [4, 0, -4];
      const store = new MapEntityStore<Actor>();
      const id = store.add(actor);
      const heardPoint: Vec3 = [2, 0, -2];
      let gazeKeepsVarying = false;
      let previousGaze: readonly number[] | undefined;

      for (let frame = 0; frame < 72; frame++) {
        const time = 1 + frame / 20;
        actor.agent!.stimulusAt = time;
        actor.renderPrevious.time = time;
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
      actor.renderPrevious.time = 1 + 72 / 20;
      renderer.sync(store, 1 / 20, 1, false, 1, actor.renderPrevious.time);
      expect(state.lookAtState).not.toEqual(LOOK_AT_REST);
      const afterOneUpdate = state.lookAtState;
      actor.renderPrevious.time = 1 + 73 / 20;
      renderer.sync(store, 1 / 20, 1, false, 1, actor.renderPrevious.time);
      expect(state.lookAtState).not.toEqual(LOOK_AT_REST);
      expect(Math.abs(state.lookAtState[3]!)).toBeGreaterThan(Math.abs(afterOneUpdate[3]!));
      expect(Math.abs(state.lookAtState[3]!)).toBeGreaterThan(Math.abs(beforeStale[3]!));
    } finally {
      renderer.dispose();
    }
  });

  it('keeps far investigations and horde targets from driving gaze', () => {
    const renderer = new MobActorMeshes(0.5, 2, { actors: registry.actors, poolSize: 1 });
    try {
      const store = new MapEntityStore<Actor>();
      const entries = [undefined, 'horde-test'].map((hordeId, index) => {
        const actor = makeActor([index * 4, 0, 0]);
        actor.agent!.mode = 'investigate';
        actor.chaseStance = false;
        actor.agent!.investigationTier = 'far';
        actor.agent!.lastPerceived = [8, 0, -8];
        actor.agent!.stimulusAt = 1;
        actor.renderPrevious.time = 1;
        if (hordeId !== undefined) {
          actor.agent!.hordeId = hordeId;
        }
        return { id: store.add(actor), actor };
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
    const renderer = new MobActorMeshes(0.5, 2, { actors: registry.actors, poolSize: 1 });
    try {
      const camera = new PerspectiveCamera(55, 1, 0.01, 50);
      camera.position.set(-2.5, 1.6, -2);
      camera.lookAt(0, 1, -2);
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      renderer.setPlayerEyePosition([2, 0, -2], PLAYER.sprint);
      const actor = makeActor([0, 0, -4]);
      actor.agent!.mode = 'chase';
      actor.chaseStance = true;
      const store = new MapEntityStore<Actor>();
      const id = store.add(actor);
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
    const actor = makeActor([0, 0, 0]);
    const blockSize = 0.5;
    const playerEye: Vec3 = [1.5, 1.6, -2];
    actor.agent!.mode = 'chase';
    actor.chaseStance = true;
    const chase = perceptionLabelFor(actor, false, playerEye, { blockSize, maxSpeed: PLAYER.sprint });
    actor.agent!.mode = 'investigate';
    actor.chaseStance = false;
    actor.agent!.investigationTier = 'near';
    actor.agent!.lastPerceived = [playerEye[0] / blockSize, 0, playerEye[2] / blockSize];
    const playerNoise = perceptionLabelFor(actor, true, playerEye, { blockSize, maxSpeed: PLAYER.sprint });
    const oneSprintStepLater: Vec3 = [
      playerEye[0] + (PLAYER.sprint / ACTIVE_ACTOR_RATE) * (1 - 1e-6),
      playerEye[1],
      playerEye[2],
    ];
    expect(perceptionLabelFor(actor, true, oneSprintStepLater, { blockSize, maxSpeed: PLAYER.sprint })).toBe(
      playerNoise,
    );
    const lureLightPosition: Vec3 = [playerEye[0] + blockSize, playerEye[1], playerEye[2]];
    actor.agent!.lastPerceived = [lureLightPosition[0] / blockSize, 0, lureLightPosition[2] / blockSize];
    const lure = perceptionLabelFor(actor, true, playerEye, { blockSize, maxSpeed: PLAYER.sprint });
    const stale = perceptionLabelFor(actor, false, playerEye, { blockSize, maxSpeed: PLAYER.sprint });
    actor.agent!.mode = 'idle';
    actor.chaseStance = false;
    actor.agent!.investigationTier = undefined;
    actor.agent!.lastPerceived = undefined;
    const unaware = perceptionLabelFor(actor, false, playerEye, { blockSize, maxSpeed: PLAYER.sprint });
    expect(new Set([chase, playerNoise, lure, stale, unaware])).toHaveLength(5);
  });

  it('does not track after the zombie dies', () => {
    const renderer = new MobActorMeshes(0.5, 2, { actors: registry.actors, poolSize: 1 });
    try {
      const camera = new PerspectiveCamera(55, 1, 0.01, 50);
      camera.position.set(0.6, 1.6, 0);
      camera.lookAt(0, 1, -2);
      camera.updateMatrixWorld(true);
      renderer.setCamera(camera);
      const actor = makeActor([0, 0, -4], [0, 0, 1]);
      const store = new MapEntityStore<Actor>();
      const id = store.add(actor);
      renderer.sync(store, 1 / 30, 1);
      const damage = incapacitate(actor);
      expect(damage.system.finishDowned(damage.id, true)).toBeUndefined();
      expect(actor.regions.head).toBe(0);
      renderer.actorDied(id, actor, [0, 0, 0]);
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
    const renderer = new MobActorMeshes(0.5, 8, { actors: new Map([[SHAMBLER.id, SHAMBLER]]) });
    try {
      const store = new MapEntityStore<Actor>();
      const entries = SHAMBLER_FIGURE_SEEDS.map((seed, index) => {
        const actor = makeActor([index * 4, 0, 0], [0, 0, -1], [], { figureSeed: seed });
        return { seed, actor, id: store.add(actor) };
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
    expect(seeds.length).toBeGreaterThan(1);
    expect(new Set(seeds).size).toBe(seeds.length);
    const type = { ...SHAMBLER, figureSeeds: seeds };
    const renderer = new MobActorMeshes(0.5, 8, { actors: new Map([[type.id, type]]) });
    try {
      const store = new MapEntityStore<Actor>();
      // Each actor takes the next seed in the list, so the seed order never matches the id or insertion order.
      const persisted = seeds.map((_, index) => seeds[(index + 1) % seeds.length]!);
      const ids = persisted.map((seed, index) =>
        store.add(makeActor([index * 2, 0, 0], [0, 0, -1], [], { figureSeed: seed })),
      );
      renderer.sync(store, 0, 1);
      const internals = renderer as unknown as {
        states: Map<number, { variantIndex: number }>;
        variants: readonly { body: { seed: number } }[];
      };
      for (let i = 0; i < ids.length; i++) {
        const state = internals.states.get(ids[i]!)!;
        expect(internals.variants[state.variantIndex]!.body.seed).toBe(persisted[i]);
      }
    } finally {
      renderer.dispose();
    }
  });

  it("casts shadows only through the twin a light's pass selects, never the crowd mesh itself", () => {
    const renderer = new MobActorMeshes(0.5, 8, { actors: registry.actors });
    try {
      const store = new MapEntityStore<Actor>();
      const near = store.add(makeActor([1, 0, 0]));
      store.add(makeActor([400, 0, 0])); // 200 m out: past any 24 m shadow volume
      renderer.sync(store, 0, 1);
      const internals = rendererInternals(renderer);
      const variant = internals.variants[internals.states.get(near)!.variantIndex]!;
      const twin = variant.shadowPasses[0]!;
      // The crowd mesh never casts: its bone-placed instances are un-cullable, so three.js would draw
      // every figure into every shadow map. The twin is the only caster, on the shadow-only layer.
      expect(variant.mesh.castShadow).toBe(false);
      expect(twin.mesh.castShadow).toBe(true);
      expect(twin.mesh.frustumCulled).toBe(false);
      expect(twin.mesh.layers.mask).toBe(1 << SHADOW_CROWD_LAYER);

      const nearRow = internals.states.get(near)!.globalRow;
      let tested = 0;
      const casts = (box: Box3): boolean => {
        tested += 1;
        return Math.hypot((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2) <= 20;
      };
      renderer.selectShadowCasters(0, casts);
      const rows = Array.from(twin.slots.array as Float32Array).slice(0, twin.mesh.count);
      expect(tested).toBeGreaterThanOrEqual(2); // every live holder was tested by its world box
      expect(variant.mesh.count).toBe(2); // the crowd's own instances are untouched
      expect(twin.mesh.count).toBe(1);
      expect(twin.mesh.visible).toBe(true);
      expect(rows).toEqual([nearRow]); // the twin reads the same revealed row the crowd draws

      // A pass that selects nothing (a map drawn only to be allocated) empties its twin.
      renderer.selectShadowCasters(0, () => false);
      expect(twin.mesh.count).toBe(0);
      expect(twin.mesh.visible).toBe(false);
    } finally {
      renderer.dispose();
    }
  });

  it('reserves a separate twin geometry and crowd-slot attribute per light pass', () => {
    const renderer = new MobActorMeshes(0.5, 8, { actors: new Map([[SHAMBLER.id, SHAMBLER]]) });
    try {
      // One sun (slot 0) and one torch (slot 1), as render/shadows.ts reserves them.
      renderer.reserveShadowSlots(2);
      const store = new MapEntityStore<Actor>();
      const byTorch = store.add(makeActor([80, 0, 0])); // 40 m out: only the torch's range reaches it
      const bySun = store.add(makeActor([1, 0, 0]));
      renderer.sync(store, 0, 1);
      const internals = rendererInternals(renderer);
      const variant = internals.variants[internals.states.get(bySun)!.variantIndex]!;
      expect(variant.shadowPasses.length).toBe(2);
      const [sunTwin, torchTwin] = variant.shadowPasses as readonly [
        { mesh: InstancedMesh; slots: InstancedBufferAttribute },
        { mesh: InstancedMesh; slots: InstancedBufferAttribute },
      ];
      // Three uploads a geometry's attributes once per renderer frame (WebGLObjects.update guards on
      // info.render.frame), so each pass's rows must live in their own geometry and attribute: passes
      // sharing one would all draw whichever rows reached the GPU first.
      expect(sunTwin.mesh.geometry).not.toBe(torchTwin.mesh.geometry);
      expect(sunTwin.slots).not.toBe(torchTwin.slots);
      expect(sunTwin.mesh.geometry.getAttribute('crowdSlot')).toBe(sunTwin.slots);
      expect(torchTwin.mesh.geometry.getAttribute('crowdSlot')).toBe(torchTwin.slots);
      // The twins share the crowd's vertex buffers, so the extra slots cost no second copy of the figure.
      for (const name of ['position', 'normal']) {
        expect(sunTwin.mesh.geometry.getAttribute(name)).toBe(variant.mesh.geometry.getAttribute(name));
      }

      const sunRow = internals.states.get(bySun)!.globalRow;
      const torchRow = internals.states.get(byTorch)!.globalRow;
      const within =
        (x: number): ((box: Box3) => boolean) =>
        (box) =>
          box.distanceToPoint(new Vector3(x, 0, 0)) <= 4;
      // The two selections happen in one renderer frame: the sun's pass first, then the torch's.
      renderer.selectShadowCasters(0, within(internals.states.get(bySun)!.lastPlacement!.x));
      renderer.selectShadowCasters(1, within(internals.states.get(byTorch)!.lastPlacement!.x));
      const rowsOf = (twin: { mesh: InstancedMesh; slots: InstancedBufferAttribute }): number[] =>
        Array.from(twin.slots.array as Float32Array).slice(0, twin.mesh.count);
      expect(rowsOf(sunTwin)).toEqual([sunRow]);
      expect(rowsOf(torchTwin)).toEqual([torchRow]);
      // Only the pass about to draw sees its twin, so a pass never draws another pass's rows.
      expect(sunTwin.mesh.visible).toBe(false);
      expect(torchTwin.mesh.visible).toBe(true);
    } finally {
      renderer.dispose();
    }
  });

  it('selects a figure whose placement is outside the volume but whose posed geometry reaches in', () => {
    // A walk clip whose every frame authors a 20 m root translation: the figure draws 20 m from its
    // placement, farther than any multiple of its bind sphere radius — the pose contract a bound must
    // honour (PoseFrameSchema roots are translations, not just rotations).
    const rootMetres = 20;
    const rooted = new Map(FIGURES);
    for (const seed of SHAMBLER_FIGURE_SEEDS) {
      const key = actorFigureKey(SHAMBLER.id, seed);
      const figure = FIGURES.get(key)!;
      rooted.set(key, {
        ...figure,
        clips: {
          ...figure.clips,
          standing: Object.fromEntries(
            Object.entries(figure.clips.standing ?? {}).map(([name, entry]) => [
              name,
              'kind' in entry && entry.kind === 'pose'
                ? { ...entry, frames: entry.frames.map((frame) => ({ ...frame, root: [rootMetres, 0, 0] })) }
                : entry,
            ]),
          ),
        },
      });
    }
    const renderer = new FixtureMobActorMeshes(0.5, 8, {
      actors: new Map([[SHAMBLER.id, SHAMBLER]]),
      actorFigureFiles: rooted,
    });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([4, 0, 0]);
      actor.horizontalSpeed = 4; // a walking figure draws the walk clip's authored root
      actor.gaitPhase = 1;
      const id = store.add(actor);
      renderer.sync(store, 0, 1);
      const internals = rendererInternals(renderer);
      const state = internals.states.get(id)!;
      const variant = internals.variants[state.variantIndex]!;
      const placement = state.lastPlacement!;
      // Where the figure actually draws: every bone's world position, as packCrowdBoneMatrix places it.
      const yawDeg = (placement.yawRad * 180) / Math.PI;
      let reached: Vec3 = [placement.x, placement.y, placement.z];
      let reach = 0;
      for (const { t } of state.bodyTransforms) {
        const world = mulMV(rotY(yawDeg), [...t] as Vec3);
        const at: Vec3 = [placement.x + world[0], placement.y + world[1], placement.z + world[2]];
        const distance = Math.hypot(at[0] - placement.x, at[1] - placement.y, at[2] - placement.z);
        if (distance > reach) {
          reach = distance;
          reached = at;
        }
      }
      const assumed = 2 * (variant.geometry.boundingSphere?.radius ?? 1) * variant.body.scale + 0.3;
      // The fixture reaches far past the placement-radius multiple the old bound assumed, and the light
      // volume (4 m around the reached geometry) stays clear of that assumed box.
      expect(reach).toBeGreaterThan(assumed);
      expect(reach - 4).toBeGreaterThan(assumed);
      const casts = (box: Box3): boolean => box.distanceToPoint(new Vector3(...reached)) <= 4;
      expect(casts(boxAround(placement, assumed))).toBe(false); // the placement alone cannot cast in
      renderer.selectShadowCasters(0, casts);
      const twin = variant.shadowPasses[0]!;
      expect(twin.mesh.count).toBe(1);
      expect(Array.from(twin.slots.array as Float32Array).slice(0, twin.mesh.count)).toEqual([state.globalRow]);
    } finally {
      renderer.dispose();
    }
  });

  it('selects a figure whose bind geometry is offset from its origin, so its drawn vertices reach past the diameter', () => {
    // Bind geometry can sit offset from the figure's origin: translated GLB POSITION vertices keep every
    // bone index and stay loader-accepted, and the shader draws each vertex through one bone matrix, that
    // far from the placement. A placement radius of 2·bind-sphere radius (the diameter) drops such a
    // figure while its transformed vertices — not a bone translation — are inside the light volume.
    const offsetBindFigures = (): ActorFigureFiles => {
      const offset = new Map(FIGURES);
      for (const seed of SHAMBLER_FIGURE_SEEDS) {
        const key = actorFigureKey(SHAMBLER.id, seed);
        const figure = FIGURES.get(key)!;
        const probe = actorFigureGeometry(figure.mesh, figure.body);
        const sphere = probe.boundingSphere!;
        // Far enough that even the nearest translated vertex stays outside the old diameter bound's
        // box (plus the 4 m light volume), sized from the fixture instead of a pinned number.
        const oldAssumed = 2 * sphere.radius * figure.body.scale + 0.3;
        const units = Math.ceil((oldAssumed + 4) / figure.body.scale + sphere.center.length() + sphere.radius + 1);
        offset.set(key, { ...figure, mesh: offsetGlbPositions(figure.mesh, units, key) });
        probe.dispose();
      }
      return offset;
    };
    const renderer = new FixtureMobActorMeshes(0.5, 8, {
      actors: new Map([[SHAMBLER.id, SHAMBLER]]),
      actorFigureFiles: offsetBindFigures(),
    });
    try {
      const store = new MapEntityStore<Actor>();
      const id = store.add(makeActor([4, 0, 0]));
      renderer.sync(store, 0, 1);
      const internals = rendererInternals(renderer);
      const state = internals.states.get(id)!;
      const variant = internals.variants[state.variantIndex]!;
      const placement = state.lastPlacement!;
      // Where the figure actually draws its farthest bind vertex: the crowd shader sends each vertex
      // through its owning bone's packed matrix (render/crowd.ts, CROWD_BEGIN_VERTEX), so this is the
      // drawn position, not just a bone translation.
      const yaw = rotY((placement.yawRad * 180) / Math.PI);
      const positions = variant.geometry.getAttribute('position');
      let drawn: Vec3 = [placement.x, placement.y, placement.z];
      let reach = 0;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const bind: Vec3 = [positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)];
        const bone = state.bodyTransforms[variant.geometry.getAttribute('boneIndex').getX(vertex)]!;
        const local = mulMV(bone.r, bind);
        const world = mulMV(yaw, [local[0] + bone.t[0], local[1] + bone.t[1], local[2] + bone.t[2]]);
        const at: Vec3 = [placement.x + world[0], placement.y + world[1], placement.z + world[2]];
        const distance = Math.hypot(at[0] - placement.x, at[1] - placement.y, at[2] - placement.z);
        if (distance > reach) {
          reach = distance;
          drawn = at;
        }
      }
      const sphere = variant.geometry.boundingSphere!;
      const assumed = 2 * sphere.radius * variant.body.scale + 0.3; // the diameter bound the fix replaces
      expect(reach).toBeGreaterThan(assumed);
      expect(reach - 4).toBeGreaterThan(assumed);
      const casts = (box: Box3): boolean => box.distanceToPoint(new Vector3(...drawn)) <= 4;
      expect(casts(boxAround(placement, assumed))).toBe(false); // the diameter box cannot contain it
      renderer.selectShadowCasters(0, casts);
      const twin = variant.shadowPasses[0]!;
      expect(twin.mesh.count).toBe(1);
      expect(Array.from(twin.slots.array as Float32Array).slice(0, twin.mesh.count)).toEqual([state.globalRow]);
    } finally {
      renderer.dispose();
    }
  });

  it('selects a figure whose offset bone pivot swings its posed geometry past the placement bound', () => {
    // core/pose.ts's boneLocalTransform pivots every bone rotation about the bone head
    // (t = head − R·head + root), so rotating a root bone whose head sits offset from the figure's
    // origin swings the whole figure by twice that offset — a translation that lives in the packed bone
    // matrix, in no authored root and no bind-vertex norm. The placement bound that added only the bind
    // reach and the authored roots dropped such a figure while its drawn vertices sat far outside it.
    const pivotSwingFigures = (): { files: ActorFigureFiles; assumedBySeed: Map<number, number> } => {
      const swung = new Map(FIGURES);
      const assumedBySeed = new Map<number, number>();
      for (const seed of SHAMBLER_FIGURE_SEEDS) {
        const key = actorFigureKey(SHAMBLER.id, seed);
        const figure = FIGURES.get(key)!;
        // Zero-root frames that rotate only the root bone 180° about Z, pivoting about its head.
        const root = figure.body.bones.find((bone) => bone.parent === null)!;
        const clips: ActorClips = {
          ...figure.clips,
          standing: Object.fromEntries(
            Object.entries(figure.clips.standing ?? {}).map(([name, entry]) => [
              name,
              'kind' in entry && entry.kind === 'pose'
                ? {
                    ...entry,
                    frames: entry.frames.map((frame) => ({
                      ...frame,
                      root: [0, 0, 0] as Vec3,
                      rotations: { [root.id]: [0, 0, 1, 0] },
                    })),
                  }
                : entry,
            ]),
          ),
        };
        const probe = actorFigureGeometry(figure.mesh, figure.body);
        const sphere = probe.boundingSphere!;
        const bindReach = sphere.center.length() + sphere.radius;
        probe.dispose();
        // The placement bound the packed-row bound replaces (metres), over this mutated figure's own
        // clips, and a pivot offset whose swing clears it and the 4 m light volume — sized from the
        // fixture's own sphere and roots rather than a pinned number, with headroom for the stance
        // blend diluting the walk clip's swing.
        const assumed = (bindReach + authoredRootsOf({ ...figure, clips })) * figure.body.scale + 0.3;
        const units = Math.ceil((assumed + 4) / figure.body.scale + bindReach) + 4;
        const body: ActorBody = {
          ...figure.body,
          bones: figure.body.bones.map((bone) =>
            bone.parent === null
              ? {
                  ...bone,
                  head: [bone.head[0]! + units, bone.head[1]!, bone.head[2]!],
                  tail: [bone.tail[0]! + units, bone.tail[1]!, bone.tail[2]!],
                }
              : bone,
          ),
        };
        expect(safeParse(ActorBodySchema, body).success).toBe(true);
        expect(safeParse(ActorClipsSchema, clips).success).toBe(true);
        expect(actorClipIssues(body, clips)).toEqual([]);
        swung.set(key, { ...figure, body, clips });
        assumedBySeed.set(seed, assumed);
      }
      return { files: swung, assumedBySeed };
    };
    const { files, assumedBySeed } = pivotSwingFigures();
    const renderer = new FixtureMobActorMeshes(0.5, 8, {
      actors: new Map([[SHAMBLER.id, SHAMBLER]]),
      actorFigureFiles: files,
    });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([4, 0, 0]);
      actor.horizontalSpeed = 4; // a walking figure draws the standing walk clip
      actor.gaitPhase = 1;
      const id = store.add(actor);
      renderer.sync(store, 0, 1);
      const internals = rendererInternals(renderer);
      const state = internals.states.get(id)!;
      const variant = internals.variants[state.variantIndex]!;
      const placement = state.lastPlacement!;
      // Where the figure actually draws each vertex: through the packed bone matrix the crowd shader
      // applies — renderer.boneMatrix reads the very row the crowd mesh and the twin draw.
      const positions = variant.geometry.getAttribute('position');
      const owners = variant.geometry.getAttribute('boneIndex');
      let drawn: Vec3 = [placement.x, placement.y, placement.z];
      let reach = 0;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const matrix = renderer.boneMatrix(id, variant.bones[owners.getX(vertex)]!.id)!;
        const at: Vec3 = [0, 1, 2].map(
          (axis) =>
            matrix[axis * 4]! * positions.getX(vertex) +
            matrix[axis * 4 + 1]! * positions.getY(vertex) +
            matrix[axis * 4 + 2]! * positions.getZ(vertex) +
            matrix[axis * 4 + 3]!,
        ) as Vec3;
        const distance = Math.hypot(at[0] - placement.x, at[1] - placement.y, at[2] - placement.z);
        if (distance > reach) {
          reach = distance;
          drawn = at;
        }
      }
      const assumed = assumedBySeed.get(actor.figureSeed)!; // the bind-reach-plus-roots bound, replaced
      expect(reach).toBeGreaterThan(assumed);
      expect(reach - 4).toBeGreaterThan(assumed);
      const casts = (box: Box3): boolean => box.distanceToPoint(new Vector3(...drawn)) <= 4;
      expect(casts(boxAround(placement, assumed))).toBe(false); // the placement bound cannot contain it
      renderer.selectShadowCasters(0, casts);
      const twin = variant.shadowPasses[0]!;
      expect(twin.mesh.count).toBe(1);
      expect(Array.from(twin.slots.array as Float32Array).slice(0, twin.mesh.count)).toEqual([state.globalRow]);
    } finally {
      renderer.dispose();
    }
  });

  it('selects debris whose offset carried pivot draws far past the body-centre bound', () => {
    // packDebris draws each carried bone through its own physics-placed matrix,
    // center + delta * (source.t - initialCenter), so an articulated subtree's geometry can draw far
    // from the debris body centre the old bound boxed. The offset-pivot hand below is that case: the
    // packed debris row holds the carried bones' real translations, so boxing the row keeps such
    // debris selected where the centre bound dropped its shadow.
    const swungHandFigures = (): { files: ActorFigureFiles; reachBySeed: Map<number, number> } => {
      const swung = new Map(FIGURES);
      const reachBySeed = new Map<number, number>();
      for (const seed of SHAMBLER_FIGURE_SEEDS) {
        const key = actorFigureKey(SHAMBLER.id, seed);
        const figure = FIGURES.get(key)!;
        // Zero-root frames that rotate only hand.L 180° about Z, pivoting about its offset head.
        const clips: ActorClips = {
          ...figure.clips,
          standing: Object.fromEntries(
            Object.entries(figure.clips.standing ?? {}).map(([name, entry]) => [
              name,
              'kind' in entry && entry.kind === 'pose'
                ? {
                    ...entry,
                    frames: entry.frames.map((frame) => ({
                      ...frame,
                      root: [0, 0, 0] as Vec3,
                      rotations: { 'hand.L': [0, 0, 1, 0] },
                    })),
                  }
                : entry,
            ]),
          ),
        };
        const probe = actorFigureGeometry(figure.mesh, figure.body);
        const sphere = probe.boundingSphere!;
        const bindReach = sphere.center.length() + sphere.radius;
        probe.dispose();
        const casterReach = (bindReach * figure.body.scale + 0.3) as number; // Variant.casterReach's formula
        // The hand pivot offset, sized from the fixture's own sphere so the swung hand's drawn
        // vertices clear the centre bound and a 4 m light volume even after the stance blend dilutes
        // the authored swing.
        const units = Math.ceil((casterReach + 4) / figure.body.scale + bindReach) + 4;
        const body: ActorBody = {
          ...figure.body,
          bones: figure.body.bones.map((bone) =>
            bone.id === 'hand.L'
              ? {
                  ...bone,
                  head: [bone.head[0]! + units, bone.head[1]!, bone.head[2]!],
                  tail: [bone.tail[0]! + units, bone.tail[1]!, bone.tail[2]!],
                }
              : bone,
          ),
        };
        expect(safeParse(ActorBodySchema, body).success).toBe(true);
        expect(safeParse(ActorClipsSchema, clips).success).toBe(true);
        expect(actorClipIssues(body, clips)).toEqual([]);
        swung.set(key, { ...figure, body, clips });
        reachBySeed.set(seed, casterReach);
      }
      return { files: swung, reachBySeed };
    };
    const { files, reachBySeed } = swungHandFigures();
    const renderer = new FixtureMobActorMeshes(0.5, 8, {
      actors: new Map([[SHAMBLER.id, SHAMBLER]]),
      actorFigureFiles: files,
    });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([4, 0, 0]);
      actor.horizontalSpeed = 4; // a walking figure draws the standing walk clip
      actor.gaitPhase = 1;
      const id = store.add(actor);
      renderer.sync(store, 0, 1);
      expect(renderer.actorSevered(id, 'forearm.L')).toBeDefined(); // debris now carries forearm.L + hand.L
      renderer.sync(store, 1 / 60, 1); // advanceDebris packs the debris row
      const internals = rendererInternals(renderer);
      const [, debris] = [...debrisEntries(renderer).entries()].find(([key]) => key.includes(':forearm.L:'))!;
      const variant = internals.variants[debris.variantIndex]!;
      const carried = new Set(severedBoneSet(variant.body.bones, ['forearm.L']));
      const { center } = debris.body;
      // Where the debris actually draws each carried vertex: through the packed matrices the crowd
      // shader applies — renderer.debrisBoneMatrix reads the very row the debris mesh and twin draw.
      const positions = variant.geometry.getAttribute('position');
      const owners = variant.geometry.getAttribute('boneIndex');
      let drawn: Vec3 = [0, 0, 0];
      let reach = Number.NEGATIVE_INFINITY;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const bone = variant.bones[owners.getX(vertex)]!;
        if (!carried.has(bone.id)) {
          continue;
        }
        const matrix = renderer.debrisBoneMatrix(id, 'forearm.L', bone.id)!;
        const at: Vec3 = [0, 1, 2].map(
          (axis) =>
            matrix[axis * 4]! * positions.getX(vertex) +
            matrix[axis * 4 + 1]! * positions.getY(vertex) +
            matrix[axis * 4 + 2]! * positions.getZ(vertex) +
            matrix[axis * 4 + 3]!,
        ) as Vec3;
        const distance = Math.hypot(at[0] - center[0], at[1] - center[1], at[2] - center[2]);
        if (distance > reach) {
          reach = distance;
          drawn = at;
        }
      }
      expect(reach).toBeGreaterThan(0); // the fixture carried and drew real vertices
      const assumed = reachBySeed.get(actor.figureSeed)!; // the body-centre bound the fix replaces
      expect(reach).toBeGreaterThan(assumed + 4); // a 4 m volume at the drawn vertex rejects it
      const centreBound = new Box3(
        new Vector3(center[0] - assumed, center[1] - assumed, center[2] - assumed),
        new Vector3(center[0] + assumed, center[1] + assumed, center[2] + assumed),
      );
      const casts = (box: Box3): boolean => box.distanceToPoint(new Vector3(...drawn)) <= 4;
      expect(casts(centreBound)).toBe(false); // the centre bound cannot contain it
      renderer.selectShadowCasters(0, casts);
      const twin = variant.shadowPasses[0]!;
      const selected = Array.from(twin.slots.array as Float32Array).slice(0, twin.mesh.count);
      expect(selected).toContain(debris.globalRow);
    } finally {
      renderer.dispose();
    }
  });

  it('selects a scaled figure whose crawl fall draws inside a volume holding its drawn vertex', async () => {
    // packCrawlFall packed unit rotations, unlike every other packing path (which scale the rotation
    // by the body's scale, as Variant.casterReach assumes), so a small figure's falling body drew its
    // bind vertices at bind size, past its row box, and the cull selected nothing for a volume that
    // contained what it actually drew.
    const scale = 0.1;
    const scaledFigures = (): ActorFigureFiles => {
      const scaled = new Map(FIGURES);
      for (const seed of SHAMBLER_FIGURE_SEEDS) {
        const key = actorFigureKey(SHAMBLER.id, seed);
        const figure = FIGURES.get(key)!;
        const body = { ...figure.body, scale };
        expect(safeParse(ActorBodySchema, body).success).toBe(true);
        expect(actorClipIssues(body, figure.clips)).toEqual([]);
        scaled.set(key, { ...figure, body });
      }
      return scaled;
    };
    const renderer = new FixtureMobActorMeshes(0.5, 8, {
      actors: new Map([[SHAMBLER.id, SHAMBLER]]),
      actorFigureFiles: scaledFigures(),
    });
    try {
      const store = new MapEntityStore<Actor>();
      const id = store.add(makeActor([0, 0, 0]));
      renderer.sync(store);
      store.replace(id, makeActor([0, 0, 0], [0, 0, -1], ['thigh.L'])); // a severed leg starts a crawl fall
      renderer.sync(store);
      await renderer.whenCorpsesReady();
      renderer.sync(store, ragdollConfig.timestepRealSeconds);
      renderer.sync(store, ragdollConfig.timestepRealSeconds);
      const internals = rendererInternals(renderer);
      const state = internals.states.get(id)!;
      expect(state.drawnFall).toBeDefined(); // the fall is drawing
      const variant = internals.variants[state.variantIndex]!;
      // Where the falling body actually draws each vertex: through the packed matrices the crowd
      // shader applies — renderer.boneMatrix reads the very row the crowd mesh and the twin draw.
      const positions = variant.geometry.getAttribute('position');
      const owners = variant.geometry.getAttribute('boneIndex');
      let box = new Box3();
      renderer.selectShadowCasters(0, (candidate) => {
        box = candidate.clone();
        return true; // capture the real box for the farthest drawn vertex
      });
      const distanceFromBox = (at: Vec3): number => box.distanceToPoint(new Vector3(...at));
      let overflow = Number.NEGATIVE_INFINITY;
      let checked = 0;
      let worst: Vec3 = [0, 0, 0];
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const matrix = renderer.boneMatrix(id, variant.bones[owners.getX(vertex)]!.id)!;
        if (matrix.every((value) => value === 0)) {
          continue; // a severed or hidden bone draws nothing
        }
        const at: Vec3 = [0, 1, 2].map(
          (axis) =>
            matrix[axis * 4]! * positions.getX(vertex) +
            matrix[axis * 4 + 1]! * positions.getY(vertex) +
            matrix[axis * 4 + 2]! * positions.getZ(vertex) +
            matrix[axis * 4 + 3]!,
        ) as Vec3;
        checked += 1;
        // >= keeps `worst` at a genuinely inspected vertex even when every distance ties at zero.
        const distance = distanceFromBox(at);
        if (distance >= overflow) {
          overflow = distance;
          worst = at;
        }
      }
      expect(checked).toBeGreaterThan(0); // real drawn vertices were inspected
      expect(overflow).toBe(0); // every drawn vertex sits inside the row's caster box
      const casts = (candidate: Box3): boolean =>
        candidate.distanceToPoint(new Vector3(...worst)) <= overflow / 2 + 0.1;
      renderer.selectShadowCasters(0, casts);
      const twin = variant.shadowPasses[0]!;
      const selected = Array.from(twin.slots.array as Float32Array).slice(0, twin.mesh.count);
      expect(selected).toContain(state.globalRow); // the volume holds a drawn vertex: keep the shadow
    } finally {
      renderer.dispose();
    }
  });

  it("reports a scaled falling body's anchors where its packed row draws them", async () => {
    // anchors() ran the world-space drawnFall transforms through the model-space conversion (yaw,
    // scale, placement), scaling the already-scaled anchor point again and collapsing its world
    // position toward the origin. An anchor must equal its point through the packed bone matrix —
    // the very matrix that draws the bone it rides.
    const scale = 0.1;
    const anchoredFigures = (): ActorFigureFiles => {
      const anchored = new Map(FIGURES);
      for (const seed of SHAMBLER_FIGURE_SEEDS) {
        const key = actorFigureKey(SHAMBLER.id, seed);
        const figure = FIGURES.get(key)!;
        const body: ActorBody = {
          ...figure.body,
          scale,
          anchors: {
            ...figure.body.anchors,
            mouth: { bone: figure.body.bones[0]!.id, position: [0, 1, 0] },
          },
        };
        expect(safeParse(ActorBodySchema, body).success).toBe(true);
        anchored.set(key, { ...figure, body });
      }
      return anchored;
    };
    const renderer = new FixtureMobActorMeshes(0.5, 8, {
      actors: new Map([[SHAMBLER.id, SHAMBLER]]),
      actorFigureFiles: anchoredFigures(),
    });
    try {
      const store = new MapEntityStore<Actor>();
      const id = store.add(makeActor([80, 0, 0])); // far from the origin, where double-scaling shows
      renderer.sync(store);
      store.replace(id, makeActor([80, 0, 0], [0, 0, -1], ['thigh.L'])); // starts a crawl fall
      renderer.sync(store);
      await renderer.whenCorpsesReady();
      renderer.sync(store, ragdollConfig.timestepRealSeconds);
      const internals = rendererInternals(renderer);
      const state = internals.states.get(id)!;
      expect(state.drawnFall).toBeDefined(); // the fall is drawing
      const variant = internals.variants[state.variantIndex]!;
      const anchor = variant.body.anchors.mouth!;
      // Where the crowd shader draws the anchor: the packed bone matrix applied to its position.
      const matrix = renderer.boneMatrix(id, anchor.bone)!;
      const drawn: Vec3 = [0, 1, 2].map(
        (axis) =>
          matrix[axis * 4]! * anchor.position[0] +
          matrix[axis * 4 + 1]! * anchor.position[1] +
          matrix[axis * 4 + 2]! * anchor.position[2] +
          matrix[axis * 4 + 3]!,
      ) as Vec3;
      expect(Math.abs(drawn[0])).toBeGreaterThan(8); // the fall lies far from the world origin
      const mouth = [...renderer.anchors()][0]!.mouth!;
      expect(mouth).toBeDefined();
      for (const axis of [0, 1, 2]) {
        // The packed matrix is float32 (the crowd texture); drawnFall is float64, so parity to ~1e-5 m.
        expect(mouth[axis]).toBeCloseTo(drawn[axis]!, 4);
      }
    } finally {
      renderer.dispose();
    }
  });

  it('draws every registry zombie type, visibly, with the built figure of its type and seed', () => {
    const renderer = new MobActorMeshes(0.5, registry.actors.size, { actors: registry.actors, poolSize: 1 });
    try {
      const store = new MapEntityStore<Actor>();
      const entries = [...registry.actors.values()].map((type, index) => {
        const figureSeed = type.figureSeeds?.[0] ?? FUSED_MASS_FIGURE_SEED;
        return { type, figureSeed, id: store.add(makeActor([index * 3, 0, 0], [0, 0, -1], [], { type, figureSeed })) };
      });
      expect(entries.length).toBeGreaterThan(0);
      renderer.sync(store, 0, 1);
      const internals = renderer as unknown as {
        group: { visible: boolean };
        states: Map<number, { variantIndex: number }>;
        variants: readonly { mesh: InstancedMesh; body: ActorBody }[];
      };

      expect(internals.group.visible).toBe(true);
      for (const { id, type, figureSeed } of entries) {
        const state = internals.states.get(id);
        expect(state, type.id).toBeDefined();
        if (!state) {
          continue;
        }
        const { mesh, body } = internals.variants[state.variantIndex]!;
        const built = actorFigure(FIGURES, type, figureSeed).body;
        expect({ ...body, type: built.type }, type.id).toEqual(built);
        expect(mesh.visible).toBe(true);
        expect(mesh.count).toBeGreaterThan(0);
        expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        expect(materials.length).toBeGreaterThan(0);
        expect(materials.every((material) => material.visible)).toBe(true);
        const isAmalgam = type === fusedMassTypeOf(registry.actors);
        const matrix = renderer.boneMatrix(id, body.bones[0]!.id);
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
    const renderer = new MobActorMeshes(0.5, registry.actors.size, { actors: registry.actors, poolSize: 1 });
    try {
      const store = new MapEntityStore<Actor>();
      const entries = [...registry.actors.values()].map((type, index) => {
        const figureSeed = type.figureSeeds?.[0] ?? FUSED_MASS_FIGURE_SEED;
        const actor = makeActor([index * 3, 0, 0], [0, 0, -1], [], { type, figureSeed });
        setOneHitParityPose(actor, {
          name: 'attacking',
          chase: true,
          speed: 1,
          phase: 1,
          windup: type.attack!.windupSimSeconds / 2,
          hitFlinchTime: actorHitFlinchDuration(figureVariantOf(type), actorFigure(FIGURES, type, figureSeed)) / 4,
        });
        return { type, body: actorFigure(FIGURES, type, figureSeed).body, id: store.add(actor) };
      });
      expect(entries.length).toBeGreaterThan(0);
      renderer.sync(store, 1 / 60, 1);
      for (const { type, body, id } of entries) {
        expect(body.bones.length, type.id).toBeGreaterThan(0);
        for (const bone of body.bones) {
          const matrix = renderer.boneMatrix(id, bone.id);
          expect(matrix, `${type.id} ${bone.id}`).toHaveLength(12);
          expect(matrix!.every(Number.isFinite), `${type.id} ${bone.id}`).toBe(true);
        }
      }
    } finally {
      renderer.dispose();
    }
  });

  it("a carved cell's bit is set in the cell mask and no other, until its slot is freed", () => {
    const amalgam = fusedMassTypeOf(registry.actors)!;
    const renderer = new MobActorMeshes(0.5, 2, { actors: registry.actors, poolSize: 1 });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, 0], [0, 0, -1], [], { type: amalgam });
      const id = store.add(actor);
      renderer.sync(store, 0, 1);
      const internals = renderer as unknown as {
        states: Map<number, { variantIndex: number; localSlot: number }>;
        variants: readonly {
          geometry: BufferGeometry;
          cells: { data: Float32Array; layout: CrowdCellMaskLayout } | undefined;
        }[];
      };
      const state = internals.states.get(id)!;
      const { geometry, cells } = internals.variants[state.variantIndex]!;
      const { owner } = actorFigure(FIGURES, amalgam, actor.figureSeed).fusedMass!.grid;
      const carved = geometry.getAttribute('cellIndex').getX(0);
      expect(owner[carved]).toBeGreaterThan(0);
      const marked = () =>
        Array.from(owner.keys()).filter((cell) => isCellInMask(cells!.data, cells!.layout, state.localSlot, cell));

      actor.carved = [carved];
      renderer.actorCarved(id, actor);
      expect(marked()).toEqual([carved]);

      store.remove(id);
      renderer.sync(store, 0, 1);
      expect(marked()).toEqual([]);
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
      ...registry.graphics.get(fixtureIds.graphics)!,
      mobActors: { maxCorpses: 0 },
      gore: { dropletCap: 3, splatCap: 3, dropletSpawnsPerFrame: 3, dripSourceCap: 0 },
    };
    const source = { source: 'zero-budget-fixture', data: { graphics: [graphics] } };
    expect(validateContent(source)).toEqual([]);
    const row = buildRegistry([source]).registry.graphics.get(graphics.id)!;
    const renderer = new RenderMobActorMeshes(0.5, 3, {
      ragdoll: ragdollConfig,
      actors: registry.actors,
      poolSize: 1,
      look: LOOK_FIXTURE.mobActors,
      maxCorpses: row.mobActors.maxCorpses,
      handlingReachMetres: reachTuning(registry).reachMetres,
      gravityMetresPerSimSecondSquared: WORLD_GRAVITY,
      actorFigureFiles: FIGURES,
    });
    const gore = new Gore(0.5, WORLD_GRAVITY, row.gore);
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, 0]);
      const id = store.add(actor);
      renderer.sync(store, 0, 1);
      gore.update(1, () => false, { actors: store, listener: [0, 0, 0] });
      expect(gore.activeDroplets).toBe(0);
      renderer.actorSevered(id, 'hand.L');
      expect(debrisEntries(renderer).size).toBe(0);
      renderer.actorDied(id, actor);
      store.remove(id);
      expect(renderer.isTracked(id)).toBe(false);
      const downed = makeActor([0, 0, 0]);
      const downedId = store.add(downed);
      renderer.sync(store, 0, 1);
      const damage = incapacitate(downed);
      renderer.sync(store, 0, 1);
      expect(renderer.isTracked(downedId)).toBe(true);
      damage.system.finishDowned(damage.id, false);
      renderer.actorDied(downedId, downed);
      store.remove(downedId);
      expect(renderer.isTracked(downedId)).toBe(false);
    } finally {
      gore.dispose();
      renderer.dispose();
    }
  });
  it('keeps a corpse (its slot) until it has lain and sunk, then frees it — unlike a plain vanish', async () => {
    const renderer = new MobActorMeshes(0.5, 2, { actors: registry.actors, poolSize: 1 });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, 0]);
      const id = store.add(actor);
      renderer.sync(store, 1 / 60, 1);
      store.remove(id);
      renderer.actorDied(id, actor);
      await renderer.whenCorpsesReady();
      expect(renderer.isTracked(id)).toBe(true); // still drawn, as a corpse

      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isTracked(id)).toBe(true);
      const step = 0.1;
      const lifetime =
        ragdollConfig.stepBudget * ragdollConfig.timestepRealSeconds +
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
    const renderer = new MobActorMeshes(0.5, 2, { actors: registry.actors, poolSize: 1 });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, 0]);
      const id = store.add(actor);
      renderer.sync(store, 0, 1);
      incapacitate(actor, frozen);
      renderer.sync(store, 0, 1, frozen);
      await renderer.whenCorpsesReady();
      const corpse = (
        renderer as unknown as {
          readonly corpses: ReadonlyMap<number, { readonly ragdoll?: { readonly parts: readonly unknown[] } }>;
        }
      ).corpses.get(id);
      expect(actor.incapacitated).toBe(true);
      expect(actor.severed).toEqual([]);
      expect(corpse?.ragdoll?.parts.length).toBeGreaterThan(0);
      const before = renderer.boneMatrix(id, 'pelvis');
      renderer.sync(store, ragdollConfig.timestepRealSeconds, 1, frozen);
      expect(renderer.boneMatrix(id, 'pelvis')).not.toEqual(before);
    } finally {
      renderer.dispose();
    }
  });

  it('finishing a downed ragdoll cuts physical subtrees into shared-world debris without leaking them', async () => {
    const renderer = new MobActorMeshes(0.5, 8, { actors: registry.actors, poolSize: 1 });
    try {
      const { system, id } = incapacitate(makeActor([0, 0, 0]), false, {
        beforeDamage: (owner) => renderer.sync(owner.store, 0, 1),
        effects: {
          onIncapacitated: (entity, actor) => renderer.actorIncapacitated(entity, actor),
          onSever: (entity, actor, part, hit) => {
            renderer.actorSevered(entity, part, hit, actor);
          },
          onDeath: (entity, actor) => renderer.actorDied(entity, actor),
        },
      });
      await renderer.whenCorpsesReady();
      for (let step = 0; step < ragdollConfig.stepBudget; step++) {
        renderer.sync(system.store, ragdollConfig.timestepRealSeconds, 1);
      }
      const before = renderer.boneMatrix(id, 'head');
      expect(before).toBeDefined();
      expect(system.finishDowned(id, true)).toBeUndefined();
      await renderer.whenCorpsesReady();
      renderer.sync(system.store, 0, 1);
      expect(renderer.isBoneHidden(id, 'head')).toBe(true);
      expect(renderer.debrisCountFor(id)).toBeGreaterThan(0);
      const head = actorFigure(FIGURES, SHAMBLER, 1).body.bones.findIndex((bone) => bone.id === 'head');
      const finished = (
        renderer as unknown as {
          corpses: ReadonlyMap<number, { ragdoll: import('@skelly/presentation/internal/render/ragdoll.ts').Ragdoll }>;
        }
      ).corpses.get(id)!;
      expect(finished.ragdoll.parts.length).toBeGreaterThan(0);
      expect(finished.ragdoll.parts.some((part) => part.sources.has(head))).toBe(false);
      const physics = (
        renderer as unknown as { ragdolls: import('@skelly/presentation/internal/render/ragdoll.ts').RagdollWorld }
      ).ragdolls;
      expect(physics.counts().bodies).toBeGreaterThan(0);
      const horizon =
        ragdollConfig.stepBudget * ragdollConfig.timestepRealSeconds +
        CORPSE_LIFECYCLE.lieSimSeconds +
        CORPSE_LIFECYCLE.sinkSimSeconds;
      for (let step = 0; step <= Math.ceil(horizon / ragdollConfig.timestepRealSeconds); step++) {
        renderer.sync(system.store, ragdollConfig.timestepRealSeconds, 1);
      }
      expect(renderer.isTracked(id)).toBe(false);
      expect(renderer.debrisCountFor(id)).toBe(0);
      expect(physics.counts()).toEqual({ bodies: 0, colliders: 0, joints: 0 });
    } finally {
      renderer.dispose();
    }
  });

  it.each([
    { model: 'humanoid', cuts: ['thigh.L'] },
    { model: 'slim-humanoid', cuts: ['thigh.L', 'thigh.R'] },
    { model: 'broad-humanoid', cuts: ['thigh.R'] },
  ])(
    'hands $model leg loss back to crawling and releases its physics without mutating simulation',
    async ({ model, cuts }) => {
      const type = [...registry.actors.values()].find((candidate) => figureVariantOf(candidate) === model)!;
      const renderer = new MobActorMeshes(0.5, 2, { actors: new Map([[type.id, type]]), poolSize: 1 });
      const reference = new MobActorMeshes(0.5, 2, { actors: new Map([[type.id, type]]), poolSize: 1 });
      const store = new MapEntityStore<Actor>();
      const seed = type.figureSeeds![0]!;
      const id = store.add(makeActor([0, 0, 0], [0, 0, -1], [], { type, figureSeed: seed }));
      try {
        renderer.sync(store);
        const upright = renderer.boneMatrix(id, 'chest');
        const crawling = makeActor([0, 0, 0], [0, 0, -1], cuts, { type, figureSeed: seed });
        store.replace(id, crawling);
        const before = structuredClone(crawling);
        renderer.actorWounded(id, { point: [0, 0, 0], direction: [1, 0, 0], impulse: 1 });
        renderer.sync(store);
        expect(renderer.boneMatrix(id, 'chest')).toEqual(upright);
        await renderer.whenCorpsesReady();
        const physics = (
          renderer as unknown as { ragdolls: import('@skelly/presentation/internal/render/ragdoll.ts').RagdollWorld }
        ).ragdolls;
        expect(physics.counts().bodies).toBeGreaterThan(0);
        renderer.sync(store, ragdollConfig.timestepRealSeconds);
        renderer.sync(store, ragdollConfig.timestepRealSeconds);
        expect(renderer.boneMatrix(id, 'chest')).not.toEqual(upright);
        const moved = makeActor([2, 0, 1], [1, 0, 0], cuts, { type, figureSeed: seed });
        store.replace(id, moved);
        const movedBefore = structuredClone(moved);
        const horizon = ragdollConfig.crawlFall.fallRealSeconds + ragdollConfig.crawlFall.blendRealSeconds;
        for (let time = 0; time <= horizon; time += ragdollConfig.timestepRealSeconds) {
          renderer.sync(store, ragdollConfig.timestepRealSeconds);
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
    const renderer = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 1 });
    const store = new MapEntityStore<Actor>();
    const actor = makeActor([0, 0, 0]);
    const id = store.add(actor);
    try {
      renderer.sync(store);
      const crawling = makeActor([0, 0, 0], [0, 0, -1], ['thigh.L']);
      store.replace(id, crawling);
      renderer.sync(store);
      await renderer.whenCorpsesReady();
      renderer.sync(store, ragdollConfig.timestepRealSeconds);
      renderer.sync(store, ragdollConfig.timestepRealSeconds);
      const figure = actorFigure(FIGURES, crawling.type, crawling.figureSeed);
      const before = renderer.boneMatrix(id, 'hand.L')!;
      renderer.actorSevered(id, 'hand.L', undefined, crawling);
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
    const renderer = new MobActorMeshes(0.5, 2, { actors: registry.actors, poolSize: 1 });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, 0]);
      const id = store.add(actor);
      renderer.sync(store, 0, 1);
      incapacitate(actor);
      renderer.sync(store, 0, 1);
      await renderer.whenCorpsesReady();
      expect(warning).toHaveBeenCalledWith(expect.any(String), failure);
      renderer.sync(store, 0, 1);
      renderer.sync(store, 0, 1);
      const upright = renderer.boneMatrix(id, 'pelvis');
      expect(upright).toBeDefined();
      renderer.sync(store, ragdollConfig.stepBudget * ragdollConfig.timestepRealSeconds, 1);
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
      actors: registry.actors,
      poolSize: 1,
    });
    try {
      const store = new MapEntityStore<Actor>();
      const actors = Array.from({ length: CORPSE_LIFECYCLE.maxCorpses + 2 }, (_, i) => makeActor([i * 2, 0, 0]));
      const ids = actors.map((actor) => store.add(actor));
      renderer.sync(store, 0, 1);
      const uprightHead = renderer.boneMatrix(ids[0]!, 'head');
      const incapacitated = actors[0]!;
      incapacitate(incapacitated);
      renderer.sync(store, 0, 1);
      for (let i = 1; i < actors.length; i++) {
        renderer.actorDied(ids[i]!, actors[i]!);
        store.remove(ids[i]!);
      }
      expect(renderer.isTracked(ids[0]!)).toBe(true);
      expect(renderer.isTracked(ids[1]!)).toBe(false); // oldest ordinary corpse evicted; incapacitated row is protected
      await renderer.whenCorpsesReady();
      for (let step = 0; step < ragdollConfig.stepBudget; step++) {
        renderer.sync(store, ragdollConfig.timestepRealSeconds, 1);
      }
      const lying = renderer.boneMatrix(ids[0]!, 'pelvis');
      expect(lying).toBeDefined();
      renderer.sync(
        store,
        ragdollConfig.stepBudget * ragdollConfig.timestepRealSeconds +
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
    const renderer = new MobActorMeshes(0.5, 2, { actors: registry.actors, poolSize: 1 });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, 0]);
      const id = store.add(actor);
      renderer.sync(store, 1 / 60, 1);
      const damage = incapacitate(actor);
      renderer.sync(store, 0, 1);
      await renderer.whenCorpsesReady();
      for (let step = 0; step < ragdollConfig.stepBudget; step++) {
        renderer.sync(store, ragdollConfig.timestepRealSeconds, 1);
      }
      renderer.sync(store, CORPSE_LIFECYCLE.lieSimSeconds + CORPSE_LIFECYCLE.sinkSimSeconds + 1, 1);
      expect(damage.system.finishDowned(damage.id, false)).toBeUndefined();
      store.remove(id);
      renderer.actorDied(id, actor);
      renderer.sync(store, 1, 1);
      expect(renderer.isTracked(id)).toBe(true); // still lies there, now as an ordinary corpse

      renderer.sync(
        store,
        ragdollConfig.stepBudget * ragdollConfig.timestepRealSeconds +
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
    const renderer = new MobActorMeshes(0.5, 64, { actors: registry.actors, poolSize: 1 });
    try {
      const store = new MapEntityStore<Actor>();
      const ids: number[] = [];
      for (let i = 0; i < 64 && (ids.length === 0 || renderer.isTracked(ids[0]!)); i++) {
        const actor = makeActor([i, 0, 0]);
        const id = store.add(actor);
        renderer.sync(store, 1 / 60, 1);
        store.remove(id);
        renderer.actorDied(id, actor);
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
    const renderer = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 2 });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, 0]);
      actor.severed.push('upperArm.L');
      const id = store.add(actor);
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

  it('re-derives hidden bones from zombie.severed when it grows (source of truth, e.g. after a save/load)', () => {
    const renderer = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 2 });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, 0]);
      const id = store.add(actor);
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isBoneHidden(id, 'hand.L')).toBe(false);

      actor.severed.push('hand.L'); // simulates a fresh severing (or a restored save) between syncs
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isBoneHidden(id, 'hand.L')).toBe(true);
    } finally {
      renderer.dispose();
    }
  });

  it('continues corpse sinking while live zombie animation is frozen', async () => {
    const renderer = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 2 });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, 0], [0, 0, -1], [], { figureSeed: 1 });
      const id = store.add(actor);
      renderer.sync(store, 0, 1);
      renderer.actorDied(id, actor);
      store.remove(id);

      const step = 0.1;
      await renderer.whenCorpsesReady();
      let previous = renderer.boneMatrix(id, 'pelvis')![7]!;
      let lying: number | undefined;
      // One extra sample after the step budget distinguishes lying still from falling.
      for (
        let frame = 0;
        frame <= Math.ceil((ragdollConfig.stepBudget * ragdollConfig.timestepRealSeconds) / step) + 1 &&
        lying === undefined;
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
        ragdollConfig.stepBudget * ragdollConfig.timestepRealSeconds +
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
  it('allocates a debris slot on actorSevered and frees it after its lifetime', async () => {
    const renderer = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 2 });
    try {
      renderer.setWorld((_x, y, _z) => y === -1, 0.5);
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, 0]);
      const id = store.add(actor);
      renderer.sync(store, 1 / 60, 1); // establishes render state (lastPos) to spawn debris from

      renderer.actorSevered(id, 'hand.L');
      expect(renderer.debrisCountFor(id)).toBe(1);
      await renderer.whenCorpsesReady();

      const step = ragdollConfig.timestepRealSeconds;
      const settlementBudget = ragdollConfig.stepBudget * step + step;
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
    const renderer = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 1 });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, 0]);
      const id = store.add(actor);
      renderer.sync(store, 1 / 60, 1);
      renderer.actorSevered(id, 'hand.L', undefined, actor);
      await renderer.whenCorpsesReady();
      for (
        let frame = 0;
        frame < ragdollConfig.stepBudget && ![...debrisEntries(renderer).values()][0]!.body.asleep;
        frame++
      ) {
        renderer.sync(store, ragdollConfig.timestepRealSeconds, 1);
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
    const renderer = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 1 });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([2, 0, -3], [1, 0, 0]);
      const id = store.add(actor);
      renderer.sync(store, 1 / 60, 1);
      const boneIds = [...severedBoneSet(actorFigure(FIGURES, actor.type, actor.figureSeed).body.bones, ['forearm.L'])];
      const before = new Map(boneIds.map((bone) => [bone, renderer.boneMatrix(id, bone)!]));
      renderer.actorSevered(id, 'forearm.L', undefined, actor);
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
  it('launches a manifest-owned fused-mass part with blood from its shared severing presentation', () => {
    const type = fusedMassTypeOf(registry.actors)!;
    expect(type).toBeDefined();
    const renderer = new MobActorMeshes(0.5, 4, { actors: new Map([[type.id, type]]), poolSize: 1 });
    const gore = new Gore(0.5, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, 0], [0, 0, -1], [], { type });
      const id = store.add(actor);
      const figure = actorFigure(FIGURES, type, actor.figureSeed).fusedMass!;
      const part = figure.manifest.parts.find((candidate) => candidate.severable)!;
      expect(part).toBeDefined();
      renderer.sync(store, 0, 1);
      const before = renderer.boneMatrix(id, part.rootBone)!;
      const hit = { point: [0, 1, 0] as Vec3, direction: [1, 0, 0] as Vec3, impulse: 10 };
      const velocity = renderer.actorSevered(id, part.id, hit, actor);
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

  it('gives every severable part of every drawn figure a share of its body mass and a box around its voxels', () => {
    const renderer = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 1 });
    try {
      const { variants } = renderer as unknown as {
        variants: readonly {
          body: ActorBody;
          scale: number;
          rigidParts: ReadonlyMap<string, { mass: number; corners: readonly Vec3[]; boneIndices: readonly number[] }>;
        }[];
      };
      expect(variants.length).toBeGreaterThan(0);
      for (const { body, scale, rigidParts } of variants) {
        const key = `${body.model}.${body.seed}`;
        const parts = [...rigidParts.entries()].map(([part, rigid]) => ({ part, ...rigid }));
        expect(parts.length, key).toBeGreaterThan(0);
        for (const part of parts) {
          expect(part.mass, `${key} ${part.part}`).toBeGreaterThan(0);
          for (const outer of parts.filter((candidate) => nestedIn(part, candidate))) {
            expect(part.mass, `${key} ${part.part} within ${outer.part}`).toBeLessThanOrEqual(outer.mass);
          }
          expect(partBoxOverflow(body, scale, part), `${key} ${part.part}`).toBeLessThanOrEqual(1e-9);
        }
        const outermost = parts.filter((part) => !parts.some((outer) => nestedIn(part, outer)));
        const total = outermost.reduce((sum, part) => sum + part.mass, 0);
        expect(total, key).toBeLessThanOrEqual(body.bodyMassKg + 1e-9);
      }
    } finally {
      renderer.dispose();
    }
  });
  it('debris OBB contains the posed limb at spawn', () => {
    const { body } = actorFigure(FIGURES, SHAMBLER, 1);
    const handRenderer = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 1 });
    try {
      const handStore = new MapEntityStore<Actor>();
      const handActor = makeActor([0, 0, 0]);
      const handId = handStore.add(handActor);
      handRenderer.sync(handStore, 0, 1);
      const handRest = handRenderer.boneMatrix(handId, 'hand.L')!;
      handActor.agent!.mode = 'chase';
      handActor.chaseStance = true;
      handActor.attackWait = handActor.type.attack!.cooldownSimSeconds - 0.35;
      handActor.attackWindup = 0;
      handRenderer.sync(handStore, 0, 1);
      const handAttack = handRenderer.boneMatrix(handId, 'hand.L')!;
      // The limb must be posed away from rest, so containment checks the posed box rather than the rest box.
      expect(rotationAngleDeg(handRest, handAttack)).toBeGreaterThan(1);
      handRenderer.actorSevered(handId, 'hand.L', undefined, handActor);
      handRenderer.sync(handStore, 0, 1);
      const handContainment = partContainment({
        renderer: handRenderer,
        id: handId,
        part: 'hand.L',
        body,
      });
      expect(handContainment.count).toBeGreaterThan(0);
      expect(handContainment.maxOverflow).toBeLessThanOrEqual(0);
    } finally {
      handRenderer.dispose();
    }

    const headRenderer = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 1 });
    try {
      const headStore = new MapEntityStore<Actor>();
      const headActor = makeActor([0, 0, 0]);
      const headId = headStore.add(headActor);
      headRenderer.sync(headStore, 0, 1);
      const headRest = headRenderer.boneMatrix(headId, 'head')!;
      headActor.headYaw = 0.6;
      headActor.renderPrevious.headYaw = 0.6;
      headRenderer.sync(headStore, 0, 1);
      const headPose = headRenderer.boneMatrix(headId, 'head')!;
      expect(rotationAngleDeg(headRest, headPose)).toBeGreaterThan(1);
      headRenderer.actorSevered(headId, 'head', undefined, headActor);
      headRenderer.sync(headStore, 0, 1);
      const headContainment = partContainment({
        renderer: headRenderer,
        id: headId,
        part: 'head',
        body,
      });
      expect(headContainment.count).toBeGreaterThan(0);
      expect(headContainment.maxOverflow).toBeLessThanOrEqual(0);
    } finally {
      headRenderer.dispose();
    }
  });

  it('severing a distant zombie uses its current simulation pose', () => {
    const skipped = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 1 });
    const reference = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 1 });
    try {
      const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
      camera.position.set(0, 0, 100);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      skipped.setCamera(camera);
      const skippedStore = new MapEntityStore<Actor>();
      const referenceStore = new MapEntityStore<Actor>();
      const skippedActor = makeActor([0, 0, 0]);
      const referenceActor = makeActor([0, 0, 0]);
      const skippedId = skippedStore.add(skippedActor);
      const referenceId = referenceStore.add(referenceActor);
      skipped.sync(skippedStore, 0, 1);
      skipped.sync(skippedStore, 0, 1);
      reference.sync(referenceStore, 0, 1);
      reference.sync(referenceStore, 0, 1);
      skippedActor.body.pos = [4, 0, 0];
      skippedActor.renderPrevious.pos = [4, 0, 0];
      referenceActor.body.pos = [4, 0, 0];
      referenceActor.renderPrevious.pos = [4, 0, 0];
      skipped.sync(skippedStore, 0, 1);
      reference.sync(referenceStore, 0, 1);
      skipped.actorSevered(skippedId, 'hand.L', undefined, skippedActor);
      reference.actorSevered(referenceId, 'hand.L', undefined, referenceActor);
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
  it('does nothing for actorSevered on an untracked id (over capacity)', () => {
    const renderer = new MobActorMeshes(0.5, 1, { actors: registry.actors, poolSize: 1 }); // capacity 1: a 2nd zombie always overflows
    try {
      const store = new MapEntityStore<Actor>();
      store.add(makeActor([0, 0, 0]));
      const second = store.add(makeActor([1, 0, 1]));
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isTracked(second)).toBe(false);

      expect(() => renderer.actorSevered(second, 'hand.L')).not.toThrow();
      expect(renderer.debrisCountFor(second)).toBe(0);
    } finally {
      renderer.dispose();
    }
  });

  it('debris counts toward the corpse cap, evicting the oldest dead thing first', () => {
    const population = CORPSE_LIFECYCLE.maxCorpses + 1;
    // Leave a live source row alongside every debris row so variant overflow cannot cause the eviction.
    const renderer = new MobActorMeshes(0.5, population + 1, {
      actors: registry.actors,
      poolSize: 1,
    });
    try {
      const store = new MapEntityStore<Actor>();
      const ids: number[] = [];
      for (let i = 0; i < population; i++) {
        const actor = makeActor([i, 0, 0]);
        const id = store.add(actor);
        renderer.sync(store, 1 / 60, 1);
        renderer.actorSevered(id, 'hand.L'); // debris, not a corpse — still counts toward MAX_CORPSES
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
    const renderer = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 1 });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, 0]); // idle, never moves — speed stays exactly 0
      const id = store.add(actor);
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
    const renderer = new MobActorMeshes(0.5, 4, { actors: registry.actors, poolSize: 1 });
    try {
      const store = new MapEntityStore<Actor>();
      const actor = makeActor([0, 0, 0]);
      actor.agent!.mode = 'chase';
      actor.chaseStance = true;
      const id = store.add(actor);
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
