// Draws zombies as full mobgen actors instead of ZombieMeshes' six boxes — the default behind
// `?actors=detailed` (GameConfig.actors; `?actors=boxes` selects the fallback; see src/game/config.ts).
// Same shape as ZombieMeshes
// (group/sync/…, see ZombieRenderer below) so play.ts can hold either behind one variable.
//
// mobgen's pure core/mob modules (bones, IK, gait, the crowd bone-matrix packing) are reused directly via
// the `@mobgen/` alias (vite.config.ts, tsconfig.json) — no npm dependency, just a sibling-project source
// import. three.js itself is `import`ed here directly; mobgen only reaches three from packages/mobgen/src/viewer,
// which this file — and everything under @mobgen/ — must never import; see test/mobgenBoundary.test.ts. The draw strategy mirrors mobgen's own stress-page 'crowd'
// mode (packages/mobgen/src/viewer/stressActors.ts's buildCrowdRender): one shared bone-matrix DataTexture for
// every zombie (one GPU upload/frame, not one per zombie) and one InstancedMesh per body variant, each
// vertex fetching its own bone's matrix with a single texelFetch — see packages/mobgen/src/mob/crowd.ts for the
// packing/layout and the GLSL, patched into MeshLambertMaterial here via onBeforeCompile exactly as
// stressActors.ts patches MeshStandardMaterial (checked against three r186's meshlambert.glsl.js: same
// <begin_vertex>/<beginnormal_vertex> chunks, same relative order, so the same patch applies unchanged).
//
// Known simplification: each model/seed variant owns a block of `capacity` bone-texture rows. The models
// and seeds are those the `zombies` option's types select and author (`figureSeedsByModel`);
// `DEFAULT_CAPACITY` provides the default capacity. A variant's overflow is not drawn, though its sim state
// is unaffected — a hard per-variant cap for that zombie's whole life, not a rotating "nearest capacity"
// set. Picking the nearest actors would require per-frame distance sorting within every overflowing variant.
//
// Living base pose (gait, idle clock, attack cooldown phase, and hit flinch) is simulation-owned and comes
// from core/zombiePose.ts, the same pure function used by hit-region FK. This renderer adds the
// interpolated root transform and neck/head gaze toward the camera while Zombie.mode is 'chase', or toward
// a recent near stimulus while investigating. Hearing gaze has deterministic render-only jitter; stale gaze
// eases back to the simulation pose at the same bounded rate, and never feeds hit-region FK.
// Fixed-step state, not render dt or randomness, drives the simulation-owned pose. A
// death is different — src/core/zombies.ts's onDeath removes the zombie from its store and calls zombieDied
// here in the very same step, so this renderer owns the corpse from then on: it keeps the existing
// slot/variant/instance, plays deathPose from the frozen living pose, holds once lying, sinks, then frees
// the slot. Corpses are render-only; incapacitated zombies remain simulation entities, fall once and lie in
// their existing row, excluded from corpse eviction, until finishing one off makes it an ordinary corpse.
//
// Dismemberment (packages/mobgen/src/mob/dismember.ts): src/core/zombies.ts's Zombie.severed (part names, e.g.
// "upperArm.L") is the *only* source of truth — this renderer never keeps its own copy for a live zombie,
// just re-expands zombie.severed via severedBoneSet every sync() (cheap, and it's what makes save/load
// "just work": a restored zombie's severed list is already exactly right). A severed bone is hidden by
// writing an all-zero 3x4 matrix for it in the shared texture (packZeroBone) — a zero matrix collapses
// every one of that bone's vertices to the origin, degenerate, so hiding it needs no shader logic at all.
// The severed-bone bitmask (crowd.ts's packSeveredMask) exists only for the *gore* effect: a survivor
// bone's face whose neighbourBone has just been severed (see mobgen's mesh.ts) gets tinted in the fragment
// shader. A corpse's severed set is frozen at the instant of death, same as its pose. Severing also spawns
// one piece of flying debris (see the Debris type below) — its own InstancedMesh row shows only the
// severed subtree (the inverse of a live zombie/corpse: the carried bones are real, everything else is
// zeroed) and is driven by the core rigid-body stepper, reusing the corpse cap/eviction/lifecycle machinery
// (a debris row counts toward the shared corpse budget exactly like a corpse does).

import type { BodyAnchor } from '@mobgen/core/body.ts';
import type { Realized } from '@mobgen/core/generate.ts';
import { voxelBounds } from '@mobgen/core/massProperties.ts';
import {
  applyPoint,
  type Mat3,
  mat3ToQuat,
  mulMM,
  mulMV,
  quatToMat3,
  rotY,
  type Transform,
  transpose,
} from '@mobgen/core/math.ts';
import {
  allocateBoneTransforms,
  boneTransforms,
  boneTransformsInto,
  indexBonesByParent,
  type MutableTransform,
  type ParentIndex,
  type Pose,
} from '@mobgen/core/pose.ts';
import { templatePartMassProperties } from '@mobgen/core/templateMass.ts';
import { cellIndex, worldPosition } from '@mobgen/core/voxelize.ts';
import { acidDeathPose } from '@mobgen/mob/acidPoses.ts';
import { acidTemplate } from '@mobgen/mob/acidTemplate.ts';
import { amalgamTemplate } from '@mobgen/mob/amalgamTemplate.ts';
import {
  CROWD_BEGIN_VERTEX,
  CROWD_BEGINNORMAL_VERTEX,
  CROWD_COLOR_FRAGMENT,
  CROWD_EMISSIVE_FRAGMENT,
  CROWD_FRAGMENT_DECLARATIONS,
  CROWD_VERTEX_DECLARATIONS,
  type CrowdPlacement,
  type CrowdTextureLayout,
  crowdTexelIndex,
  crowdTextureLayout,
  packBloodiness,
  packCharge,
  packCrowdBoneMatrix,
  packSeveredMask,
} from '@mobgen/mob/crowd.ts';
import { burstBones, severableParts, severedBoneSet } from '@mobgen/mob/dismember.ts';
import { bodyRestExtents, createGaitCache, type Extent, footRestExtents, type WalkActor } from '@mobgen/mob/gait.ts';
import type { HumanoidParams } from '@mobgen/mob/humanoid.ts';
import { LOOK_AT_REST, type LookAtState, lookAtPose } from '@mobgen/mob/lookAt.ts';
import { LOOK_AT_PROFILES, type LookAtProfile } from '@mobgen/mob/lookAtProfiles.ts';
import { DEATH_FALL_DURATION, type DeathActor, deathPose } from '@mobgen/mob/reactions.ts';
import { TEMPLATES } from '@mobgen/mob/templates.ts';
import {
  type BufferGeometry,
  type Camera,
  Color,
  CylinderGeometry,
  DataTexture,
  FloatType,
  Frustum,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshDepthMaterial,
  MeshLambertMaterial,
  NearestFilter,
  RGBAFormat,
  Sphere,
  SphereGeometry,
  Vector3,
} from 'three';
import { AMALGAM_FIGURE_SEED, type AmalgamFigure } from '../core/amalgamFigure.ts';
import type { Vec3 } from '../core/coords.ts';
import type { EntityId, EntityStore } from '../core/entities.ts';
import type { LookDefaults } from '../core/mood.ts';
import {
  angularVelocity,
  applyImpulseAtClampedPoint,
  type RigidBody,
  type RigidWorld,
  stepRigidBody,
} from '../core/rigidBody.ts';
import type { Quaternion } from '../core/spatial.ts';
import { amalgamTypeOf, type ZombieFigureType, zombieFigure } from '../core/zombieFigure.ts';
import type { ZombieModel } from '../core/zombieModels.ts';
import { acidSpitWindupProgress, posedShambler, zombiePoseInputFor } from '../core/zombiePose.ts';
import { BACKGROUND_ZOMBIE_RATE, type HitImpulse, type Zombie, zombieAttackReachMetres } from '../core/zombies.ts';
import { ZOMBIE_RATE } from '../game/simulationRates.ts';
import { buildCarvedGeometry, FleshChunks, mergeBoneMeshes } from './amalgamFlesh.ts';
import { amalgamCoreInteriorAnchor, amalgamTentaclePose } from './amalgamTentaclePose.ts';
import { BLOOD_STAIN_COLOR_FRAGMENT, BLOOD_STAIN_FRAGMENT_DECLARATIONS } from './bloodStain.ts';
import type { ColumnReveal } from './columnReveal.ts';
import { woundSeverity } from './gore.ts';
import { patchHeightFog } from './heightFog.ts';
import { PoseTextureUpdates } from './poseTextureUpdates.ts';
import { castsAndReceives } from './shadowFlags.ts';

/** What play.ts needs from either renderer, so it can hold `ZombieMeshes | MobActorMeshes` behind one
 * variable. `dispose`/`setCamera`/`zombieDied` are optional: ZombieMeshes has none of them (see
 * src/render/zombies.ts — left unchanged, so a death for it is just the plain vanish-from-the-store path
 * it's always had), MobActorMeshes has all three. `zombieDied` must be called for every death (see
 * src/core/zombies.ts's onDeath and play.ts's forwarding) so a corpse renderer can tell "died, keep as a
 * corpse" apart from "vanished without dying" (despawn/unload) — see MobActorMeshes' own doc comment. */
export interface ZombieRenderer {
  readonly group: Group;
  sync: (
    store: EntityStore<Zombie>,
    realDt?: number,
    alpha?: number,
    freezeLiving?: boolean,
    backgroundAlpha?: number,
    simulationTime?: number,
  ) => void;
  dispose?: () => void;
  setCamera?: (camera: Camera) => void;
  setPlayerEyePosition?: (position: Vec3, maxSpeed: number) => void;
  setPlayerChestPosition?: (position: Vec3) => void;
  setPerceptionLabels?: (enabled: boolean) => void;
  anchors?: () => Iterable<DrawnAnchors>;
  zombieDied?: (id: EntityId, zombie: Zombie, playerPos?: Vec3) => void;
  zombieIncapacitated?: (id: EntityId, zombie: Zombie) => void;
  /** Called once for every part severed (src/core/zombies.ts's onSever, forwarded by play.ts) — a flying
   * limb of debris, not the whole zombie; see MobActorMeshes' own doc comment. */
  setWorld?: (isSolid: RigidWorld['isSolid'], blockSize: number) => void;
  zombieSevered?: (id: EntityId, part: string, hit?: HitImpulse, zombie?: Zombie) => void;
  /** Called when a hit knocks flesh out of an amalgam (src/core/zombies.ts's onCarve, forwarded by play.ts). */
  zombieCarved?: (id: EntityId, zombie: Zombie, cells: readonly number[], hit: HitImpulse) => void;
}

const DEFAULT_CAPACITY = 64; // matches ZombieMeshes' own default

const PELVIS_HEIGHT_M = 0.9;
const BOUNDING_RADIUS_M = 1.2;

/** Keeps severing-energy tests within the selected fixture seed instead of allocating every renderer variant. */
export const mobFigurePoolSizeThrough = (figureSeeds: readonly number[], figureSeed: number): number => {
  const index = figureSeeds.indexOf(figureSeed);
  if (index < 0) {
    throw new RangeError(`Unknown shambler figure seed: ${figureSeed}`);
  }
  return index + 1;
};

const severedBoneIds = (variant: Variant, parts: readonly string[]): ReadonlySet<string> =>
  severedBoneSet(
    variant.realized.body.bones,
    parts.map((part) => variant.severedRoots.get(part) ?? part),
  );

/** Which way a corpse should topple: away from the player if a position is available (in reach at the
 * moment of death, in the player's forward hemisphere from the zombie's own facing → topple backward,
 * away; otherwise the player is behind it → topple forward, away), else backward — the documented default
 * for "no player position available." Exported for test/mobActors.test.ts. */
export const fallDirectionAwayFromPlayer = (facing: Vec3, zombiePos: Vec3, playerPos: Vec3 | undefined): 1 | -1 => {
  if (!playerPos) {
    return -1;
  }
  const towardPlayerX = playerPos[0] - zombiePos[0];
  const towardPlayerZ = playerPos[2] - zombiePos[2];
  const facingTowardPlayer = facing[0] * towardPlayerX + facing[2] * towardPlayerZ;
  return facingTowardPlayer > 0 ? -1 : 1;
};

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const backgroundActorBlend = (zombie: Zombie, simulationTime: number | undefined, fallback: number): number =>
  simulationTime === undefined || zombie.renderPrevious.time === undefined
    ? fallback
    : clamp01((simulationTime - zombie.renderPrevious.time) * BACKGROUND_ZOMBIE_RATE);
const buildVariantGeometry = (realized: Realized): BufferGeometry =>
  mergeBoneMeshes(realized.meshes, realized.body.materials, realized.voxels);

/** A live zombie is keyed by its EntityId; a piece of debris (there can be more than one per zombie, over
 * its lifetime) gets its own synthetic string key — see zombieSevered. Corpses stay EntityId-keyed (one
 * per zombie). */
type SlotKey = EntityId | string;

interface Variant {
  readonly model: string;
  readonly lookAt: LookAtProfile;
  readonly figureSeed: number;
  readonly bodyScale?: number;
  readonly realized: Realized;
  /** Shared bones/extents/params/seed; each zombie using this variant clones it with its own GaitCache
   * (packages/mobgen/src/mob/gait.ts's GaitCache — per zombie, not per variant, since several zombies sharing a
   * variant have different speeds/step indices at once; see mobgen's own crowd-cache report). */
  readonly walkActorTemplate: WalkActor;
  /** Every bone's own rest extents (not just the feet) — deathPose's own re-grounding needs the whole
   * fallen body, since the lowest point once lying down is rarely a foot (see packages/mobgen/src/mob/gait.ts's
   * bodyRestExtents doc comment). */
  readonly bodyExtents: ReadonlyMap<string, Extent>;
  readonly rigidParts: ReadonlyMap<
    string,
    { mass: number; inertiaBody: RigidBody['inertiaBody']; corners: readonly Vec3[]; boneIndices: readonly number[] }
  >;
  readonly severedRoots: ReadonlyMap<string, string>;
  /** The part a cut at the head starts at; a body without one has no gaze. */
  readonly headPart: string | undefined;
  /** Bones a death removes without a severed part (mobgen's `burst` disposition), such as the acid sac. */
  readonly burstIndices: readonly number[];
  readonly parentIndex: ParentIndex;
  /** Bone id -> this variant's own bone array index — translates mobgen's severedBoneSet (string ids, body-
   * plan-generic) into the indices the shared texture and its severed mask are keyed by. */
  readonly boneIndexById: ReadonlyMap<string, number>;
  readonly geometry: BufferGeometry;
  readonly mesh: InstancedMesh;
  readonly crowdSlotAttr: InstancedBufferAttribute;
  /** Reused every frame for every zombie of this variant: each place-and-pack fully consumes it before
   * returning, so nothing overlaps (see mobgen's stressActors.ts for the identical reasoning). */
  readonly scratch: MutableTransform[];
  /** Local slot numbers (0..capacity-1) not currently assigned to a live zombie, corpse, *or debris* of
   * this variant. */
  readonly freeLocalSlots: number[];
  /** Dense, compacted (swap-removed) list of the zombie/corpse/debris keys currently drawn by this
   * variant's InstancedMesh — liveIds[k] is instance k. A corpse or a piece of debris stays in this list
   * exactly like a live zombie (see MobActorMeshes' own doc comment); only freeSlot ever removes an entry. */
  readonly liveIds: SlotKey[];
  readonly idToInstanceIndex: Map<SlotKey, number>;
}

/** The three fields freeSlot needs to release a live zombie's, a corpse's, or a piece of debris's
 * row/instance — ZombieRenderState, Corpse and Debris all satisfy this structurally. */
interface SlotHolder {
  readonly variantIndex: number;
  readonly localSlot: number;
  readonly globalRow: number;
  instanceIndex: number;
}

interface ZombieRenderState extends SlotHolder {
  readonly id: EntityId;
  lookAtState: LookAtState;
  previousPerceptionSimSeconds: number | undefined;
  perceptionSimSeconds: number | undefined;
  readonly walkActor: WalkActor;
  lastPose: Pose | undefined;
  lastPlacement: CrowdPlacement | undefined;
  /** The simulation zombie last drawn in this slot. */
  zombie: Zombie | undefined;
  lastSeenFrame: number;
}

interface TentacleMeshes {
  readonly shaft: Mesh;
  readonly tip: Mesh;
}

export type PerceptionLabel = 'sees you' | 'hears you' | 'notices something' | 'remembers' | 'unaware';

const perceivedAtPlayer = (target: Vec3, playerEye: Vec3 | undefined, blockSize: number, maxSpeed: number): boolean => {
  if (!playerEye) {
    return false;
  }
  // The stored point and eye position differ vertically; horizontal equality identifies a player source without source state.
  // Allow one maximum-speed step between attention samples and the next render frame.
  const tolerance = Math.max(blockSize / 1000, maxSpeed / ZOMBIE_RATE);
  return Math.hypot(target[0] * blockSize - playerEye[0], target[2] * blockSize - playerEye[2]) <= tolerance;
};

export const perceptionLabelFor = (
  zombie: Zombie,
  recentNearStimulus: boolean,
  playerEye: Vec3 | undefined,
  { blockSize, maxSpeed }: { blockSize: number; maxSpeed: number },
): PerceptionLabel => {
  if (zombie.mode === 'chase') {
    return 'sees you';
  }
  if (recentNearStimulus) {
    return zombie.lastPerceived && perceivedAtPlayer(zombie.lastPerceived, playerEye, blockSize, maxSpeed)
      ? 'hears you'
      : 'notices something';
  }
  if (zombie.lastPerceived !== undefined || zombie.mode === 'investigate' || zombie.mode === 'search') {
    return 'remembers';
  }
  return 'unaware';
};

/** Entity identity and simulation presentation time keep render-only variation repeatable without an RNG stream. */
export const hearingGazeTarget = (
  target: readonly [number, number, number],
  id: EntityId,
  presentationSimSeconds: number,
  jitter: LookDefaults['mobActors']['hearingGazeJitter'],
): Vec3 => {
  const distance = Math.hypot(...target);
  if (distance === 0) {
    return [...target];
  }
  const phase = id * 2.399_963_229_728_653 + presentationSimSeconds * 2 * Math.PI * jitter.cyclesPerSimSecond;
  const yaw = Math.atan2(-target[0], -target[2]) + (jitter.yawDegrees * Math.PI * Math.sin(phase)) / 180;
  const pitchBase = Math.atan2(target[1], Math.hypot(target[0], target[2]));
  const pitch = Math.max(
    -Math.PI / 2,
    Math.min(Math.PI / 2, pitchBase + (jitter.pitchDegrees * Math.PI * Math.sin(phase + 1.618_033_988_749_895)) / 180),
  );
  const horizontal = distance * Math.cos(pitch);
  return [-Math.sin(yaw) * horizontal, Math.sin(pitch) * distance, -Math.cos(yaw) * horizontal];
};

/** A dead zombie keeps its live slot after the simulation has forgotten it. */
interface Corpse extends SlotHolder {
  /** Permanent incapacitation uses the fall pose but remains a saved simulation entity and is never evicted. */
  readonly incapacitated: boolean;
  readonly walkActor: WalkActor;
  /** The walk (or walk+attack) pose frozen at the instant of death — deathPose's own basePose. */
  readonly basePose: Pose;
  /** World position (metres) at death; fixed — corpses don't move except sinking (see packCorpse). */
  readonly worldPos: Vec3;
  readonly yaw: number;
  readonly direction: 1 | -1;
  readonly poseSeed: number;
  settledPose?: Pose;
  /** Frozen at the instant of death — a corpse keeps whatever was severed while it was still alive (see
   * this module's header comment); parts severed by the killing blow itself are already included, since
   * onSever fires before onDeath (src/core/zombies.ts's swing). */
  readonly severed: readonly string[];
  /** How bloodied the body was as it fell (gore.ts's woundSeverity), drawn as stains until it's gone. */
  readonly bloodiness: number;
  /** The charged materials' emission multiplier the body keeps (see acidCharge). */
  readonly charge: number;
  elapsed: number;
  /** Insertion order across corpses AND debris together — see evictOldestDeadThing*'s own doc comment on
   * why a single Map's own iteration order isn't enough once there are two Maps to compare. */
  readonly insertOrder: number;
}

/**
 * A carved amalgam's own body mesh, rebuilt without its carved voxels. It reads the same bone-texture row
 * as the amalgam's instance in the shared variant mesh, which is pointed at the all-zero hidden row so
 * only this one draws.
 */
interface Wound {
  readonly mesh: InstancedMesh;
  /** How many cells the current geometry has carved out; `carved` only grows. */
  cells: number;
}

/** Arguments kept together for inserting one physics-backed debris slot. */
interface DebrisSpawn {
  id: EntityId;
  part: string;
  state: ZombieRenderState;
  variant: Variant;
  severedIndices: readonly number[];
  sourceTransforms: Map<number, MutableTransform>;
  initialCenter: Vec3;
  initialOrientation: Quaternion;
  originOffsetY: number;
  body: RigidBody;
  bloodiness: number;
}

/** A flying piece of debris — a severed limb, physically simulated (see zombieSevered/advanceDebris) —
 * drawn as the *inverse* of a corpse: only `severedIndices` are visible (real, physics-placed matrices),
 * every other bone is zeroed. Reuses a corpse-shaped slot/lifecycle (see this module's header comment). */
interface Debris extends SlotHolder {
  readonly walkActor: WalkActor;
  /** The bone indices this debris carries (the cut bone and everything below it) — visible; every other
   * bone in the variant is hidden. */
  readonly severedIndices: readonly number[];
  readonly sourceTransforms: ReadonlyMap<number, MutableTransform>;
  readonly initialCenter: Vec3;
  readonly initialOrientation: Quaternion;
  readonly originOffsetY: number;
  readonly insertOrder: number;
  readonly body: RigidBody;
  /** The stains of the body it was cut from, at the cut. */
  readonly bloodiness: number;
  elapsed: number;
  groundedAt: number | undefined;
}

export interface MobActorMeshesOptions {
  readonly deathPoseId?: string | undefined;
  readonly look: LookDefaults['mobActors'];
  readonly maxCorpses: number;
  readonly canvas?: HTMLCanvasElement | undefined;
  readonly reveal?: ColumnReveal;
  /** The zombie types to draw: a variant per model they select and figure seed they author. */
  readonly zombies: ReadonlyMap<string, DrawnZombieType>;
  /** Builds only the first this-many figure seeds of each model. */
  readonly poolSize?: number;
  /** A chunk of carved flesh came to rest at this centre (metres), for gore to mark. */
  readonly onFleshLanded?: (centre: Vec3) => void;
  /** How bloodied a live body is drawn, 0 to 1; gore.ts's woundSeverity unless gore shares its per-frame value. */
  readonly bloodiness?: (zombie: Zombie) => number;
  /** A death burst bones away (the acid sac) at this glow-anchor position in metres, for the splash. */
  readonly onBurst?: (position: Vec3, zombie: Zombie) => void;
}

/** Where a live actor's body anchors were drawn this frame, in metres, for presentation that follows them. */
export interface DrawnAnchors {
  readonly zombie: Zombie;
  readonly glow: Vec3 | undefined;
  readonly mouth: Vec3 | undefined;
}

/** The sac's emission multiplier: idle at rest, rising to charged across the spit wind-up. */
const acidCharge = (zombie: Zombie): number => {
  const body = zombie.type.acidBody;
  if (!body) {
    return 1;
  }
  return body.charge.idle + (body.charge.charged - body.charge.idle) * acidSpitWindupProgress(zombie);
};

const anchorWorld = (
  transforms: ReadonlyMap<string, Transform>,
  anchor: BodyAnchor,
  placement: CrowdPlacement,
  scale = 1,
): Vec3 => {
  const local = applyPoint(transforms.get(anchor.bone)!, anchor.position);
  const world = mulMV(rotY((placement.yawRad * 180) / Math.PI), [local[0] * scale, local[1] * scale, local[2] * scale]);
  return [placement.x + world[0], placement.y + world[1], placement.z + world[2]];
};

type ActorModel = ZombieModel;
type DrawnZombieType = ZombieFigureType & {
  readonly model: ZombieModel;
  readonly carving?: { readonly interiorColor: string } | undefined;
};
interface BuiltActorVariant {
  model: ActorModel;
  figureSeed: number;
  bodyScale?: number;
  realized: Realized;
  walkActorTemplate: WalkActor;
  bodyExtents: ReadonlyMap<string, Extent>;
  lookAt: LookAtProfile;
  severedRoots: ReadonlyMap<string, string>;
  headPart: string | undefined;
}

const requireAmalgamType = (type: ZombieFigureType | undefined): ZombieFigureType => {
  if (type?.model !== 'amalgam') {
    throw new Error('MobActorMeshes requires the amalgam content type when amalgam actors are enabled');
  }
  return type;
};

const severedRootsFor = (figure: ReturnType<typeof zombieFigure>): ReadonlyMap<string, string> => {
  if (!('manifest' in figure)) {
    return new Map();
  }
  const amalgam = figure as AmalgamFigure;
  return new Map(amalgam.manifest.parts.filter((part) => part.severable).map((part) => [part.id, part.rootBone]));
};

const copyScaledTransform = (source: Transform, target: MutableTransform, scale?: number): void => {
  for (let i = 0; i < 9; i++) {
    target.r[i] = scale === undefined ? source.r[i]! : source.r[i]! * scale;
  }
  for (let i = 0; i < 3; i++) {
    target.t[i] = scale === undefined ? source.t[i]! : source.t[i]! * scale;
  }
};

const scaleTransformsInPlace = (transforms: readonly MutableTransform[], scale?: number): void => {
  if (scale === undefined) {
    return;
  }
  for (const transform of transforms) {
    for (let i = 0; i < 9; i++) {
      transform.r[i] = transform.r[i]! * scale;
    }
    for (let i = 0; i < 3; i++) {
      transform.t[i] = transform.t[i]! * scale;
    }
  }
};

const buildActorVariant = (model: ActorModel, seed: number, amalgamType?: ZombieFigureType): BuiltActorVariant => {
  const type = model === 'amalgam' ? requireAmalgamType(amalgamType) : { model };
  const figure = zombieFigure(type, seed);
  const { genome, realized } = figure;
  const bodyScale = model === 'amalgam' ? type.bodyScale : undefined;
  return {
    model,
    figureSeed: seed,
    ...(bodyScale === undefined ? {} : { bodyScale }),
    realized,
    walkActorTemplate: {
      bones: realized.body.bones,
      extents: footRestExtents(realized.body.bones, realized.voxels),
      params: genome.params as HumanoidParams,
      seed: genome.seed,
    },
    bodyExtents: bodyRestExtents(realized.body.bones, realized.voxels),
    lookAt: LOOK_AT_PROFILES[model === 'amalgam' ? 'shambler' : model]!,
    severedRoots: severedRootsFor(figure),
    headPart: 'severableParts' in figure ? figure.severableParts.head[0] : undefined,
  };
};

/** Each model the types select, with the figure seeds they author for it in authored order, the first
 * `poolSize` of them; the amalgam's seed is fixed. */
const figureSeedsByModel = (
  zombies: ReadonlyMap<string, DrawnZombieType>,
  poolSize: number | undefined,
): ReadonlyMap<ActorModel, readonly number[]> => {
  const byModel = new Map<ActorModel, number[]>();
  for (const type of zombies.values()) {
    const authored = type.model === 'amalgam' ? [AMALGAM_FIGURE_SEED] : (type.figureSeeds ?? []);
    const seeds = byModel.get(type.model) ?? [];
    byModel.set(type.model, [...new Set([...seeds, ...authored])]);
  }
  for (const [model, seeds] of byModel) {
    if (seeds.length === 0) {
      throw new Error(`MobActorMeshes requires authored figureSeeds for the ${model} model`);
    }
    if (poolSize !== undefined) {
      seeds.splice(Math.max(1, poolSize));
    }
  }
  return byModel;
};

const buildActorVariants = (
  seedsByModel: ReadonlyMap<ActorModel, readonly number[]>,
  amalgamType?: ZombieFigureType,
): BuiltActorVariant[] =>
  [...seedsByModel].flatMap(([model, seeds]) => seeds.map((seed) => buildActorVariant(model, seed, amalgamType)));

/** Draws zombies as full mobgen actors, one shared bone-matrix texture and one InstancedMesh per variant
 * — see this module's own header comment for the whole design and its one documented simplification. */
export class MobActorMeshes implements ZombieRenderer {
  readonly group = new Group();
  private readonly blockSize: number;
  private readonly reveal: ColumnReveal | undefined;
  private readonly capacity: number;
  private readonly variants: readonly Variant[];
  private readonly variantIndexBySeed: ReadonlyMap<string, number>;
  private readonly layout: CrowdTextureLayout;
  private readonly textureData: Float32Array;
  private readonly texture: DataTexture;
  private readonly textureUpdates: PoseTextureUpdates;
  private readonly material: MeshLambertMaterial;
  private readonly states = new Map<EntityId, ZombieRenderState>();
  private readonly corpses = new Map<EntityId, Corpse>();
  private readonly tentacles = new Map<EntityId, TentacleMeshes>();
  private readonly tentacleGeometry: CylinderGeometry | undefined;
  private readonly tentacleTipGeometry: SphereGeometry | undefined;
  private readonly tentacleMaterial: MeshLambertMaterial | undefined;
  private readonly tentacleUp = new Vector3(0, 1, 0);
  private readonly tentacleDirection = new Vector3();
  private readonly debris = new Map<string, Debris>();
  private readonly wounds = new Map<EntityId, Wound>();
  /** One bone-texture row past every variant's, left all zero: an instance pointed at it collapses unseen. */
  private readonly hiddenRow: number;
  private readonly depthMaterial: MeshDepthMaterial;
  private readonly fleshInterior: Color | undefined;
  private readonly fleshChunks: FleshChunks;
  private readonly bloodiness: (zombie: Zombie) => number;
  /** Shared by corpses and debris, so "oldest across both" (evictOldestDeadThing*) is a simple comparison
   * instead of needing to interleave two Maps' own iteration orders. */
  private nextDeadOrder = 0;
  private frameCounter = 0;
  private renderBlend = 1;
  private activeBlend = 1;
  private backgroundBlend = 1;
  private camera: Camera | undefined;
  private playerEyePosition: Vec3 | undefined;
  private playerMaxSpeed = 0;
  private playerChestPosition: Vec3 | undefined;
  private perceptionLabelsEnabled = false;
  private perceptionLabelRoot: HTMLDivElement | undefined;
  private readonly perceptionLabels = new Map<EntityId, HTMLSpanElement>();
  private readonly labelProjection = new Vector3();
  private readonly cameraPosition = new Vector3();
  private readonly frustum = new Frustum();
  private readonly frustumMatrix = new Matrix4();
  private readonly boundingSphere = new Sphere(new Vector3(), BOUNDING_RADIUS_M);
  private world: RigidWorld | undefined;

  private readonly options: MobActorMeshesOptions;

  constructor(blockSize: number, requestedCapacity: number | undefined, options: MobActorMeshesOptions) {
    this.options = options;
    const capacity = requestedCapacity ?? DEFAULT_CAPACITY;
    this.blockSize = blockSize;
    this.reveal = options.reveal;
    this.capacity = capacity;
    const amalgamType = amalgamTypeOf(options.zombies);
    this.tentacleGeometry = amalgamType ? new CylinderGeometry(0.08, 0.22, 1, 8) : undefined;
    this.tentacleTipGeometry = amalgamType ? new SphereGeometry(0.16, 8, 6) : undefined;
    this.tentacleMaterial = amalgamType
      ? new MeshLambertMaterial({ color: 0xb9_4c_3e, emissive: 0x2c_0b_08 })
      : undefined;
    const templatesByModel = new Map(
      [...TEMPLATES, acidTemplate, amalgamTemplate].map((template) => [template.name, template]),
    );

    const t0 = performance.now();
    const built = buildActorVariants(figureSeedsByModel(options.zombies, options.poolSize), amalgamType);
    const generationMs = performance.now() - t0;
    // biome-ignore lint/suspicious/noConsole: a one-time, useful-to-see startup cost, not per-frame noise.
    console.info(`MobActorMeshes: generated ${built.length} zombie model variants in ${generationMs.toFixed(1)} ms`);

    const bonesPerSlot = Math.max(1, ...built.map((v) => v.realized.body.bones.length));
    // Each model/seed variant owns its own capacity rows in the shared bone texture, plus the hidden row.
    this.hiddenRow = built.length * capacity;
    this.layout = crowdTextureLayout(bonesPerSlot, this.hiddenRow + 1);
    this.textureData = new Float32Array(this.layout.width * this.layout.height * 4);
    for (let slot = 0; slot < this.hiddenRow; slot++) {
      for (let bone = 0; bone < this.layout.bonesPerSlot; bone++) {
        const i = (slot * this.layout.bonesPerSlot + bone) * 3 * 4;
        this.textureData[i] = 1;
        this.textureData[i + 5] = 1;
        this.textureData[i + 10] = 1;
      }
    }
    this.texture = new DataTexture(this.textureData, this.layout.width, this.layout.height, RGBAFormat, FloatType);
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    this.textureUpdates = new PoseTextureUpdates(this.texture, options.canvas);

    this.material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.material.customProgramCacheKey = () => 'deadvox-mob-actor-crowd-texture';
    const { texture, layout } = this;
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.crowdBoneTexture = { value: texture };
      shader.uniforms.crowdBonesPerSlot = { value: layout.bonesPerSlot };
      patchHeightFog(shader, 'mob');
      shader.vertexShader = `${CROWD_VERTEX_DECLARATIONS}\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', CROWD_BEGIN_VERTEX)
        .replace('#include <beginnormal_vertex>', CROWD_BEGINNORMAL_VERTEX);
      shader.fragmentShader =
        `${CROWD_FRAGMENT_DECLARATIONS}\n${BLOOD_STAIN_FRAGMENT_DECLARATIONS}\n${shader.fragmentShader}`
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>\n${CROWD_COLOR_FRAGMENT}\n${BLOOD_STAIN_COLOR_FRAGMENT}`,
          )
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${CROWD_EMISSIVE_FRAGMENT}`);
    };

    // The shadow pass draws with a depth material, which would leave every actor in its bind pose: this
    // one fetches the same bone matrices (the gore varying it declares is simply unused).
    const depthMaterial = new MeshDepthMaterial();
    this.depthMaterial = depthMaterial;
    const interiorColor = amalgamType?.carving?.interiorColor;
    this.fleshInterior = interiorColor === undefined ? undefined : new Color(interiorColor);
    this.fleshChunks = new FleshChunks(this.group, options.onFleshLanded);
    this.bloodiness = options.bloodiness ?? woundSeverity;
    depthMaterial.customProgramCacheKey = () => 'deadvox-mob-actor-crowd-depth';
    depthMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.crowdBoneTexture = { value: texture };
      shader.uniforms.crowdBonesPerSlot = { value: layout.bonesPerSlot };
      shader.vertexShader = `${CROWD_VERTEX_DECLARATIONS}\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        CROWD_BEGIN_VERTEX,
      );
    };

    this.variants = built.map((v, variantIndex) => {
      const geometry = buildVariantGeometry(v.realized);
      const mesh = new InstancedMesh(geometry, this.material, capacity);
      mesh.customDepthMaterial = depthMaterial;
      castsAndReceives(mesh);
      mesh.count = 0;
      mesh.frustumCulled = false; // see this module's header comment — same reasoning as mobgen's crowd mode
      const instanceArray = mesh.instanceMatrix.array as Float32Array;
      for (let k = 0; k < capacity; k++) {
        instanceArray[k * 16] = 1;
        instanceArray[k * 16 + 5] = 1;
        instanceArray[k * 16 + 10] = 1;
        instanceArray[k * 16 + 15] = 1;
      }
      mesh.instanceMatrix.needsUpdate = true;
      const crowdSlotAttr = new InstancedBufferAttribute(new Float32Array(capacity), 1);
      mesh.geometry.setAttribute('crowdSlot', crowdSlotAttr);
      this.group.add(mesh);

      const freeLocalSlots: number[] = [];
      for (let k = capacity - 1; k >= 0; k--) {
        freeLocalSlots.push(k);
      }
      const boneIndexById = new Map<string, number>();
      v.realized.body.bones.forEach((bone, index) => {
        boneIndexById.set(bone.id, index);
      });
      const rigidParts = new Map<
        string,
        {
          mass: number;
          inertiaBody: RigidBody['inertiaBody'];
          corners: readonly Vec3[];
          boneIndices: readonly number[];
        }
      >();
      for (const part of v.model === 'amalgam' ? [] : severableParts(v.realized.body.bones)) {
        const boneIndices = [...severedBoneSet(v.realized.body.bones, [part])]
          .map((boneId) => boneIndexById.get(boneId))
          .filter((index): index is number => index !== undefined);
        const properties = templatePartMassProperties({
          voxels: v.realized.voxels,
          partBoneIndices: boneIndices,
          bodyBoneIndices: v.realized.body.bones.map((_, index) => index),
          voxelSize: v.realized.voxels.size,
          template: templatesByModel.get(v.model)!,
          part,
        });
        const bounds = voxelBounds(v.realized.voxels, boneIndices, properties.center);
        rigidParts.set(part, {
          mass: properties.mass,
          inertiaBody: [
            [...properties.inertia[0]] as Vec3,
            [...properties.inertia[1]] as Vec3,
            [...properties.inertia[2]] as Vec3,
          ],
          corners: bounds.corners.map((corner) => [...corner] as Vec3),
          boneIndices,
        });
      }
      return {
        model: v.model,
        lookAt: v.lookAt,
        figureSeed: v.figureSeed,
        ...(v.bodyScale === undefined ? {} : { bodyScale: v.bodyScale }),
        realized: v.realized,
        walkActorTemplate: v.walkActorTemplate,
        bodyExtents: v.bodyExtents,
        rigidParts,
        severedRoots: v.severedRoots,
        headPart: v.headPart,
        burstIndices: burstBones(v.realized.body.bones).map((id) => boneIndexById.get(id)!),
        parentIndex: indexBonesByParent(v.realized.body.bones),
        boneIndexById,
        geometry,
        mesh,
        crowdSlotAttr,
        scratch: allocateBoneTransforms(v.realized.body.bones.length),
        freeLocalSlots,
        liveIds: [],
        idToInstanceIndex: new Map(),
        variantIndex,
      } satisfies Variant & { variantIndex: number };
    });
    this.variantIndexBySeed = new Map(
      this.variants.map((variant, index) => [`${variant.model}:${variant.figureSeed}`, index]),
    );
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
  }

  setPlayerEyePosition(position: Vec3, maxSpeed: number): void {
    this.playerEyePosition = [...position];
    this.playerMaxSpeed = maxSpeed;
  }

  setPlayerChestPosition(position: Vec3): void {
    this.playerChestPosition = [...position];
  }

  setPerceptionLabels(enabled: boolean): void {
    if (enabled === this.perceptionLabelsEnabled) {
      return;
    }
    this.perceptionLabelsEnabled = enabled;
    if (enabled) {
      const root = document.createElement('div');
      root.dataset.perceptionLabels = 'true';
      Object.assign(root.style, {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        zIndex: 'var(--ui-layer-perception-labels)',
      });
      document.body.append(root);
      this.perceptionLabelRoot = root;
      return;
    }
    this.perceptionLabelRoot?.remove();
    this.perceptionLabelRoot = undefined;
    this.perceptionLabels.clear();
  }

  private removePerceptionLabel(id: EntityId): void {
    const label = this.perceptionLabels.get(id);
    label?.remove();
    this.perceptionLabels.delete(id);
  }

  private updatePerceptionLabel(
    id: EntityId,
    zombie: Zombie,
    state: ZombieRenderState,
    placement: { readonly worldPos: Vec3 },
  ): void {
    if (!this.perceptionLabelsEnabled) {
      return;
    }
    const { camera, perceptionLabelRoot } = this;
    if (!(camera && perceptionLabelRoot)) {
      return;
    }
    let label: HTMLSpanElement | undefined = this.perceptionLabels.get(id);
    if (!label) {
      label = document.createElement('span');
      label.className = 'zombie-perception-label';
      label.dataset.zombieId = String(id);
      Object.assign(label.style, {
        position: 'fixed',
        transform: 'translate(-50%, -100%)',
        whiteSpace: 'nowrap',
        padding: 'calc(var(--ui-spacing) * 0.125rem) calc(var(--ui-spacing) * 0.25rem)',
        borderRadius: '0.125rem',
        background: 'rgba(0, 0, 0, 0.75)',
        color: '#fff',
        font: '0.75rem monospace',
      });
      perceptionLabelRoot.append(label);
      this.perceptionLabels.set(id, label);
    }
    const perception = perceptionLabelFor(zombie, this.hasRecentNearStimulus(state, zombie), this.playerEyePosition, {
      blockSize: this.blockSize,
      maxSpeed: this.playerMaxSpeed,
    });
    label.textContent = perception;
    label.dataset.perceptionLabel = perception;
    this.labelProjection.set(placement.worldPos[0], placement.worldPos[1] + 1.8, placement.worldPos[2]).project(camera);
    const visible =
      this.labelProjection.z >= -1 &&
      this.labelProjection.z <= 1 &&
      Math.abs(this.labelProjection.x) <= 1 &&
      Math.abs(this.labelProjection.y) <= 1;
    label.style.display = visible ? 'block' : 'none';
    if (visible) {
      label.style.left = `${((this.labelProjection.x + 1) * window.innerWidth) / 2}px`;
      label.style.top = `${((1 - this.labelProjection.y) * window.innerHeight) / 2}px`;
    }
  }

  setWorld(isSolid: RigidWorld['isSolid'], blockSize: number): void {
    if (!(blockSize > 0 && Number.isFinite(blockSize))) {
      throw new RangeError('blockSize must be positive and finite');
    }
    this.world = { isSolid, blockSize };
  }

  /** The next insertOrder value for a new corpse or debris (see nextDeadOrder's own doc comment). */
  private takeDeadOrder(): number {
    const order = this.nextDeadOrder;
    this.nextDeadOrder += 1;
    return order;
  }

  /** Whether `id` currently has a drawn instance (a slot) — true for a live zombie *or* a corpse still
   * lying/sinking. False for an id the sim knows about but this renderer hasn't (yet, or ever, if its
   * variant is at capacity) assigned one — see this module's header comment on the overflow behaviour.
   * Exported for test/mobActors.test.ts; play.ts has no use for it. */
  isTracked(id: EntityId): boolean {
    return this.states.has(id) || this.corpses.has(id);
  }

  /** Test-only: `boneId`'s *rotation* submatrix (row-major, mobgen's own Mat3 convention — see
   * mobgen/core/math.ts) as currently packed in the shared texture for `id` (a live zombie or a corpse) —
   * the world rotation, not just this bone's own local pose delta, but since a zombie facing along -Z has
   * yaw 0 (packCrowdBoneMatrix contributes no extra rotation at yaw 0 — see its own comment), comparing this
   * against mobgen's IDENTITY_M is exactly "did any pose ever rotate this bone or one of its ancestors" —
   * used to assert the old bind/A-pose (every bone left at its raw rest orientation) never reappears.
   * Undefined for an unknown id/boneId, or for a bone this zombie/corpse has severed (reads as the zero
   * matrix, not a rotation). */
  boneRotation(id: EntityId, boneId: string): Mat3 | undefined {
    const holder: SlotHolder | undefined = this.states.get(id) ?? this.corpses.get(id);
    if (!holder) {
      return undefined;
    }
    const variant = this.variants[holder.variantIndex]!;
    const boneIndex = variant.boneIndexById.get(boneId);
    if (boneIndex === undefined) {
      return undefined;
    }
    const i = crowdTexelIndex(this.layout, holder.globalRow, boneIndex);
    const d = this.textureData;
    return [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 4]!, d[i + 5]!, d[i + 6]!, d[i + 8]!, d[i + 9]!, d[i + 10]!];
  }

  /** Test-only: full bone matrix currently packed for live-to-debris transform continuity. */
  boneMatrix(id: EntityId, boneId: string): readonly number[] | undefined {
    const holder: SlotHolder | undefined = this.states.get(id) ?? this.corpses.get(id);
    if (!holder) {
      return undefined;
    }
    const variant = this.variants[holder.variantIndex]!;
    const boneIndex = variant.boneIndexById.get(boneId);
    if (boneIndex === undefined) {
      return undefined;
    }
    const start = crowdTexelIndex(this.layout, holder.globalRow, boneIndex);
    return Array.from(this.textureData.slice(start, start + 12));
  }

  /** Test-only: full matrix for one carried bone in a debris slot. */
  debrisBoneMatrix(id: EntityId, part: string, boneId: string): readonly number[] | undefined {
    const debris = [...this.debris.entries()].find(([key]) => key.startsWith(`debris:${id}:${part}:`))?.[1];
    if (!debris) {
      return undefined;
    }
    const variant = this.variants[debris.variantIndex]!;
    const boneIndex = variant.boneIndexById.get(boneId);
    if (boneIndex === undefined) {
      return undefined;
    }
    const start = crowdTexelIndex(this.layout, debris.globalRow, boneIndex);
    return Array.from(this.textureData.slice(start, start + 12));
  }

  /** Test-only: true if `boneId`'s matrix in the shared texture, for the row currently assigned to `id` (a
   * live zombie or a corpse), is the all-zero matrix a severed bone is packed as (see packZeroBone). False
   * if `id`/`boneId` aren't found — a caller checking "is this hidden" for a bone that doesn't exist would
   * otherwise read as trivially true from an all-zero read past the texture's own bounds. */
  isBoneHidden(id: EntityId, boneId: string): boolean {
    const holder: SlotHolder | undefined = this.states.get(id) ?? this.corpses.get(id);
    if (!holder) {
      return false;
    }
    const variant = this.variants[holder.variantIndex]!;
    const boneIndex = variant.boneIndexById.get(boneId);
    if (boneIndex === undefined) {
      return false;
    }
    const i = crowdTexelIndex(this.layout, holder.globalRow, boneIndex);
    for (let k = 0; k < 12; k++) {
      if (this.textureData[i + k] !== 0) {
        return false;
      }
    }
    return true;
  }

  /** Test-only: how many pieces of debris currently tracked came from `id` (there can be more than one,
   * severed over separate hits). */
  debrisCountFor(id: EntityId): number {
    let count = 0;
    for (const key of this.debris.keys()) {
      if (key.startsWith(`debris:${id}:`)) {
        count += 1;
      }
    }
    return count;
  }

  /** The oldest (lowest insertOrder) corpse or debris belonging to `variantIndex` — evicted to make room
   * for a live zombie needing a slot there, or a new corpse/debris exceeding the shared corpse budget. Scans both Maps
   * since neither's own iteration order alone says which of a corpse and a debris is older (see Corpse/
   * Debris's own insertOrder doc comments). */
  private evictOldestDeadThingInVariant(variantIndex: number): void {
    let oldestOrder = Number.POSITIVE_INFINITY;
    let oldestCorpseId: EntityId | undefined;
    let oldestDebrisKey: string | undefined;
    for (const [id, corpse] of this.corpses) {
      if (!corpse.incapacitated && corpse.variantIndex === variantIndex && corpse.insertOrder < oldestOrder) {
        oldestOrder = corpse.insertOrder;
        oldestCorpseId = id;
        oldestDebrisKey = undefined;
      }
    }
    for (const [key, d] of this.debris) {
      if (d.variantIndex === variantIndex && d.insertOrder < oldestOrder) {
        oldestOrder = d.insertOrder;
        oldestDebrisKey = key;
        oldestCorpseId = undefined;
      }
    }
    if (oldestCorpseId !== undefined) {
      this.freeCorpse(oldestCorpseId);
    } else if (oldestDebrisKey !== undefined) {
      this.freeDebris(oldestDebrisKey);
    }
  }

  /** Same as evictOldestDeadThingInVariant but across every variant — used when a new corpse or debris
   * itself would exceed the global corpse cap. */
  private evictOldestDeadThingGlobally(): void {
    let oldestOrder = Number.POSITIVE_INFINITY;
    let oldestCorpseId: EntityId | undefined;
    let oldestDebrisKey: string | undefined;
    for (const [id, corpse] of this.corpses) {
      if (!corpse.incapacitated && corpse.insertOrder < oldestOrder) {
        oldestOrder = corpse.insertOrder;
        oldestCorpseId = id;
        oldestDebrisKey = undefined;
      }
    }
    for (const [key, d] of this.debris) {
      if (d.insertOrder < oldestOrder) {
        oldestOrder = d.insertOrder;
        oldestDebrisKey = key;
        oldestCorpseId = undefined;
      }
    }
    if (oldestCorpseId !== undefined) {
      this.freeCorpse(oldestCorpseId);
    } else if (oldestDebrisKey !== undefined) {
      this.freeDebris(oldestDebrisKey);
    }
  }

  private addZombie(id: EntityId, zombie: Zombie): ZombieRenderState | undefined {
    const variantIndex = this.variantIndexBySeed.get(`${zombie.type.model}:${zombie.figureSeed}`);
    if (variantIndex === undefined) {
      return undefined;
    }
    const variant = this.variants[variantIndex]!;
    if (variant.freeLocalSlots.length === 0) {
      // Corpses and debris count toward capacity (see this module's header comment): make room by dropping
      // this variant's own oldest dead thing before giving up on a live zombie.
      this.evictOldestDeadThingInVariant(variantIndex);
    }
    const localSlot = variant.freeLocalSlots.pop();
    if (localSlot === undefined) {
      return undefined; // this variant is at capacity — see this module's header comment
    }
    const globalRow = variantIndex * this.capacity + localSlot;
    const instanceIndex = variant.liveIds.length;
    variant.liveIds.push(id);
    variant.idToInstanceIndex.set(id, instanceIndex);
    variant.crowdSlotAttr.setX(instanceIndex, globalRow);
    variant.crowdSlotAttr.needsUpdate = true;
    variant.mesh.count = variant.liveIds.length;
    const state: ZombieRenderState = {
      id,
      lookAtState: LOOK_AT_REST,
      previousPerceptionSimSeconds: undefined,
      perceptionSimSeconds: undefined,
      variantIndex,
      localSlot,
      globalRow,
      instanceIndex,
      walkActor: { ...variant.walkActorTemplate, cache: createGaitCache() },
      lastPose: undefined,
      lastPlacement: undefined,
      zombie: undefined,
      lastSeenFrame: this.frameCounter,
    };
    this.states.set(id, state);
    if (variant.model === 'amalgam') {
      this.addTentacle(id);
    }
    return state;
  }

  private addTentacle(id: EntityId): void {
    if (!(this.tentacleGeometry && this.tentacleTipGeometry && this.tentacleMaterial)) {
      return;
    }
    const shaft = new Mesh(this.tentacleGeometry, this.tentacleMaterial);
    const tip = new Mesh(this.tentacleTipGeometry, this.tentacleMaterial);
    shaft.visible = false;
    tip.visible = false;
    castsAndReceives(shaft);
    castsAndReceives(tip);
    this.group.add(shaft, tip);
    this.tentacles.set(id, { shaft, tip });
  }

  private removeTentacle(id: EntityId): void {
    const meshes = this.tentacles.get(id);
    if (!meshes) {
      return;
    }
    this.group.remove(meshes.shaft, meshes.tip);
    this.tentacles.delete(id);
  }

  private updateTentacle(
    id: EntityId,
    zombie: Zombie,
    placement: { worldPos: Vec3; yaw: number },
    lastPose: Pose | undefined,
  ): void {
    const meshes = this.tentacles.get(id);
    if (!meshes) {
      return;
    }
    const target = this.playerChestPosition;
    const reachMetres = zombieAttackReachMetres(zombie);
    if (!target || reachMetres <= 0 || !lastPose) {
      meshes.shaft.visible = false;
      meshes.tip.visible = false;
      return;
    }
    const figure = zombieFigure(zombie.type, zombie.figureSeed);
    if (zombie.type.model !== 'amalgam') {
      throw new Error('Amalgam tentacle requires the amalgam figure');
    }
    const amalgam = figure as AmalgamFigure;
    const transforms = boneTransforms(amalgam.realized.body.bones, lastPose);
    const partRoots = new Map(amalgam.manifest.parts.map((part) => [part.id, part.rootBone]));
    const hidden = severedBoneSet(
      amalgam.realized.body.bones,
      zombie.severed.map((part) => partRoots.get(part) ?? part),
    );
    const start = amalgamCoreInteriorAnchor({
      figure: amalgam,
      transforms,
      hidden,
      yaw: rotY((placement.yaw * 180) / Math.PI),
      position: placement.worldPos,
    });
    const facing: Vec3 = [-Math.sin(placement.yaw), 0, -Math.cos(placement.yaw)];
    const pose = amalgamTentaclePose({
      start,
      target,
      facing,
      reachMetres,
      attackWindupSimSeconds: zombie.attackWindup,
      attackWindupDurationSimSeconds: zombie.type.attack.windupSimSeconds,
      attackWaitSimSeconds: zombie.attackWait,
      attackCooldownDurationSimSeconds: zombie.type.attack.cooldownSimSeconds,
    });
    const deltaX = pose.end[0] - pose.start[0];
    const deltaY = pose.end[1] - pose.start[1];
    const deltaZ = pose.end[2] - pose.start[2];
    const length = Math.hypot(deltaX, deltaY, deltaZ);
    if (pose.extension <= 0 || length <= 0.01) {
      meshes.shaft.visible = false;
      meshes.tip.visible = false;
      return;
    }
    meshes.shaft.visible = true;
    meshes.tip.visible = true;
    meshes.shaft.position.set(
      (pose.start[0] + pose.end[0]) / 2,
      (pose.start[1] + pose.end[1]) / 2,
      (pose.start[2] + pose.end[2]) / 2,
    );
    meshes.shaft.quaternion.setFromUnitVectors(
      this.tentacleUp,
      this.tentacleDirection.set(deltaX / length, deltaY / length, deltaZ / length),
    );
    meshes.shaft.scale.set(1, length, 1);
    meshes.tip.position.set(pose.end[0], pose.end[1], pose.end[2]);
  }

  /** Releases `entry`'s row/instance back to its variant, swap-compacting whichever key (a live zombie, a
   * corpse, or a piece of debris — all three share the same dense liveIds/instanceIndex bookkeeping) was
   * drawn last into the now-vacated slot. Shared by removeZombie (a plain vanish), freeCorpse and
   * freeDebris (expiry or eviction); none of them touch `this.states`/`this.corpses`/`this.debris`
   * themselves — callers do that. */
  private freeSlot(key: SlotKey, entry: SlotHolder): void {
    const variant = this.variants[entry.variantIndex]!;
    const lastIndex = variant.liveIds.length - 1;
    if (entry.instanceIndex !== lastIndex) {
      const movedKey = variant.liveIds[lastIndex]!;
      const moved = (
        typeof movedKey === 'number'
          ? (this.states.get(movedKey) ?? this.corpses.get(movedKey))
          : this.debris.get(movedKey)
      )!;
      variant.liveIds[entry.instanceIndex] = movedKey;
      variant.idToInstanceIndex.set(movedKey, entry.instanceIndex);
      moved.instanceIndex = entry.instanceIndex;
      variant.crowdSlotAttr.setX(entry.instanceIndex, this.rowFor(movedKey, moved.globalRow));
    }
    if (typeof key === 'number') {
      this.removeWound(key);
    }
    variant.liveIds.pop();
    variant.idToInstanceIndex.delete(key);
    variant.freeLocalSlots.push(entry.localSlot);
    variant.mesh.count = variant.liveIds.length;
    variant.crowdSlotAttr.needsUpdate = true;
  }

  /** The bone-texture row an instance in a shared variant mesh reads: hidden while its own wound mesh draws it. */
  private rowFor(key: SlotKey, globalRow: number): number {
    return typeof key === 'number' && this.wounds.has(key) ? this.hiddenRow : globalRow;
  }

  /**
   * Brings an amalgam's wound mesh up to date with its carved cells: built on its first hole, rebuilt when
   * more are carved. Its shared instance then reads the hidden row, so only the wound mesh draws the body.
   */
  private syncWound(id: EntityId, holder: SlotHolder, carved: readonly number[]): void {
    const wound = this.wounds.get(id);
    if (carved.length === 0 || !this.fleshInterior || (wound && wound.cells === carved.length)) {
      return;
    }
    const variant = this.variants[holder.variantIndex]!;
    const geometry = buildCarvedGeometry(variant.realized, carved, this.fleshInterior);
    geometry.setAttribute('crowdSlot', new InstancedBufferAttribute(new Float32Array([holder.globalRow]), 1));
    if (wound) {
      wound.mesh.geometry.dispose();
      wound.mesh.geometry = geometry;
      wound.cells = carved.length;
      return;
    }
    const mesh = new InstancedMesh(geometry, this.material, 1);
    mesh.customDepthMaterial = this.depthMaterial;
    mesh.frustumCulled = false; // as the variant meshes: the bone texture, not the geometry, places it
    mesh.setMatrixAt(0, new Matrix4());
    castsAndReceives(mesh);
    this.group.add(mesh);
    this.wounds.set(id, { mesh, cells: carved.length });
    variant.crowdSlotAttr.setX(holder.instanceIndex, this.hiddenRow);
    variant.crowdSlotAttr.needsUpdate = true;
  }

  private removeWound(id: EntityId): void {
    const wound = this.wounds.get(id);
    if (wound) {
      this.group.remove(wound.mesh);
      wound.mesh.geometry.dispose();
      this.wounds.delete(id);
    }
  }

  /**
   * Called when a hit knocks flesh out of an amalgam (src/core/zombies.ts's onCarve, forwarded by play.ts).
   * Rebuilds its wound mesh — a corpse's too, since the shot that kills it carves after its death — and
   * throws the knocked-out cells as one chunk of flesh along the strike.
   */
  zombieCarved(id: EntityId, zombie: Zombie, cells: readonly number[], hit: HitImpulse): void {
    const corpse = this.corpses.get(id);
    const holder = this.states.get(id) ?? corpse;
    if (!holder) {
      return;
    }
    this.syncWound(id, holder, zombie.carved);
    const variant = this.variants[holder.variantIndex]!;
    const pose = this.states.get(id)?.lastPose ?? corpse?.basePose;
    if (!pose || variant.bodyScale === undefined) {
      return;
    }
    const placement = this.currentRenderPlacement(zombie);
    const bone = variant.realized.voxels.owner[cells[0]!]! - 1;
    const transform = boneTransforms(variant.realized.body.bones, pose).get(variant.realized.body.bones[bone]!.id);
    if (!transform) {
      return;
    }
    const yaw = rotY((placement.yaw * 180) / Math.PI);
    const scale = variant.bodyScale;
    const offset = mulMV(yaw, [transform.t[0] * scale, transform.t[1] * scale, transform.t[2] * scale]);
    this.fleshChunks.spawn({
      realized: variant.realized,
      scale,
      cells,
      rotation: mulMM(yaw, transform.r),
      translation: [
        placement.worldPos[0] + offset[0],
        placement.worldPos[1] + offset[1],
        placement.worldPos[2] + offset[2],
      ],
      direction: hit.direction,
    });
  }

  /** A plain vanish (despawn/unload) — not a death; see this module's header comment and zombieDied. */
  private removeZombie(id: EntityId, state: ZombieRenderState): void {
    this.removePerceptionLabel(id);
    this.removeTentacle(id);
    this.freeSlot(id, state);
    this.states.delete(id);
  }

  private evictableDeadThingCount(): number {
    return [...this.corpses.values()].filter((corpse) => !corpse.incapacitated).length + this.debris.size;
  }

  private freeCorpse(id: EntityId): void {
    const corpse = this.corpses.get(id);
    if (!corpse) {
      return;
    }
    this.freeSlot(id, corpse);
    this.corpses.delete(id);
  }

  private freeDebris(key: string): void {
    const d = this.debris.get(key);
    if (!d) {
      return;
    }
    this.freeSlot(key, d);
    this.debris.delete(key);
  }

  /** A torso-destroyed zombie remains in the store, so its fallen row stays while it lies there: no sink/despawn
   * and no corpse-budget eviction until it dies (see finishDownedCorpse). A death corpse is render-only with the
   * finite lifecycle below. */
  zombieIncapacitated(id: EntityId, zombie: Zombie): void {
    const state = this.states.get(id);
    this.removePerceptionLabel(id);
    if (!state || this.corpses.has(id)) {
      return;
    }
    const worldPos: Vec3 = [
      zombie.body.pos[0] * this.blockSize,
      zombie.body.pos[1] * this.blockSize,
      zombie.body.pos[2] * this.blockSize,
    ];
    const basePose = this.posedFrame(state, zombie, this.currentRenderPlacement(zombie)).pose;
    this.corpses.set(id, {
      incapacitated: true,
      variantIndex: state.variantIndex,
      localSlot: state.localSlot,
      globalRow: state.globalRow,
      instanceIndex: state.instanceIndex,
      walkActor: state.walkActor,
      basePose,
      worldPos,
      yaw: Math.atan2(-zombie.facing[0], -zombie.facing[2]),
      direction: fallDirectionAwayFromPlayer(zombie.facing, zombie.body.pos, undefined),
      poseSeed: id ^ zombie.figureSeed,
      severed: [...zombie.severed],
      bloodiness: woundSeverity(zombie),
      charge: acidCharge(zombie),
      elapsed: 0,
      insertOrder: this.takeDeadOrder(),
    });
    this.states.delete(id);
  }

  /**
   * Called once for every death (src/core/zombies.ts's onDeath, forwarded by play.ts) — the sim removes
   * the zombie from its store in the very same call, before or after this frame's sync() runs either way
   * (see this module's header comment on why that ordering is safe): this method moves `id` out of
   * `this.states` (the live map) into `this.corpses` *immediately and synchronously*, so sync()'s prune
   * loop — which only ever looks at `this.states` — never sees `id` at all once it's died, whichever order
   * sync() and this run in. A corpse keeps its existing slot/variant/instance untouched (still drawn every
   * frame, see packCorpse) until its content-authored lifetime frees it the same way a plain vanish
   * would. No-ops for an id this renderer was never drawing (e.g. its variant was already full).
   */
  zombieDied(id: EntityId, zombie: Zombie, playerPos?: Vec3): void {
    this.removePerceptionLabel(id);
    this.removeTentacle(id);
    if (this.options.maxCorpses === 0) {
      this.freeCorpse(id);
      const state = this.states.get(id);
      if (state) {
        this.removeZombie(id, state);
      }
      return;
    }
    if (this.corpses.get(id)?.incapacitated) {
      this.finishDownedCorpse(id, zombie);
      return;
    }
    const state = this.states.get(id);
    if (!state) {
      return;
    }
    // `id` deliberately stays in this.states until the very end: a global-cap eviction below can swap-
    // compact the *dying* zombie's own instance into the vacated slot (if it happens to be the one
    // currently last in its variant's liveIds) — freeSlot's lookup must still find it as a SlotHolder,
    // which this.states (not yet deleted) still provides, exactly as it did before this death.
    if (this.evictableDeadThingCount() >= this.options.maxCorpses) {
      this.evictOldestDeadThingGlobally();
    }
    const worldPos: Vec3 = [
      zombie.body.pos[0] * this.blockSize,
      zombie.body.pos[1] * this.blockSize,
      zombie.body.pos[2] * this.blockSize,
    ];
    const posed = this.posedFrame(state, zombie, this.currentRenderPlacement(zombie), { dt: 0 });
    const basePose = posed.pose;
    this.burst(this.variants[state.variantIndex]!, posed.transforms, posed.placement, zombie);
    this.corpses.set(id, {
      incapacitated: false,
      variantIndex: state.variantIndex,
      localSlot: state.localSlot,
      globalRow: state.globalRow,
      instanceIndex: state.instanceIndex,
      walkActor: state.walkActor,
      basePose,
      worldPos,
      yaw: Math.atan2(-zombie.facing[0], -zombie.facing[2]),
      direction: fallDirectionAwayFromPlayer(zombie.facing, zombie.body.pos, playerPos),
      poseSeed: id ^ zombie.figureSeed,
      severed: [...zombie.severed],
      bloodiness: woundSeverity(zombie),
      charge: acidCharge(zombie),
      elapsed: 0,
      insertOrder: this.takeDeadOrder(),
    });
    this.states.delete(id);
  }

  /** Reports where a dying body's burst bones (the acid sac) were, for the splash. */
  private burst(
    variant: Variant,
    transforms: ReadonlyMap<string, Transform>,
    placement: CrowdPlacement,
    zombie: Zombie,
  ): void {
    const glow = variant.realized.body.anchors?.glow;
    if (variant.burstIndices.length > 0 && glow && this.options.onBurst) {
      this.options.onBurst(anchorWorld(transforms, glow, placement, variant.bodyScale), zombie);
    }
  }

  /** A downed body that dies (finished off or dismembered) becomes an ordinary corpse where it lies: it keeps its
   * fallen pose and slot, shows the parts cut since it fell, then lies and sinks like any other corpse. */
  private finishDownedCorpse(id: EntityId, zombie: Zombie): void {
    if (this.evictableDeadThingCount() >= this.options.maxCorpses) {
      this.evictOldestDeadThingGlobally();
    }
    // Read after the eviction, which may have moved this corpse's instance.
    const downed = this.corpses.get(id)!;
    const variant = this.variants[downed.variantIndex]!;
    const placement = {
      x: downed.worldPos[0],
      y: downed.worldPos[1],
      z: downed.worldPos[2],
      yawRad: downed.yaw,
    };
    this.burst(
      variant,
      boneTransforms(variant.realized.body.bones, this.corpsePose(downed, variant)),
      placement,
      zombie,
    );
    const corpse: Corpse = {
      ...this.corpses.get(id)!,
      incapacitated: false,
      severed: [...zombie.severed],
      bloodiness: woundSeverity(zombie),
      insertOrder: this.takeDeadOrder(),
    };
    corpse.elapsed = Math.min(corpse.elapsed, DEATH_FALL_DURATION);
    this.corpses.set(id, corpse);
  }

  /**
   * Called once for every part severed (src/core/zombies.ts's onSever, forwarded by play.ts) — spawns one
   * piece of flying debris in the *same* zombie's variant (see this module's header comment). No-ops for an
   * id this renderer isn't tracking as a live zombie (over capacity, or — per src/core/zombies.ts's swing,
   * which calls onSever before onDeath on the same hit — already dead this exact hit is impossible, since
   * zombieDied hasn't run yet; but a stale/unknown part name, or no position yet on the zombie's very first
   * frame, are both defensively handled the same way: nothing to spawn from). Debris counts toward
   * the shared corpse budget exactly like a corpse (see zombieDied's own eviction).
   */
  zombieSevered(id: EntityId, part: string, hit?: HitImpulse, zombie?: Zombie): void {
    const state = this.states.get(id);
    if (!state) {
      return;
    }
    const variant = this.variants[state.variantIndex]!;
    if (zombie) {
      const posed = this.posedFrame(state, zombie, this.currentRenderPlacement(zombie));
      state.lastPose = posed.pose;
      state.lastPlacement = posed.placement;
    }
    if (!(state.lastPose && state.lastPlacement)) {
      return;
    }
    const partData = variant.rigidParts.get(part);
    if (!partData) {
      return;
    }

    const severedIndices = partData.boneIndices;
    const sourceTransforms = this.posedSourceTransforms(variant, state, severedIndices);
    const initialCenter = this.posedPartCenter(variant, state, new Set(severedIndices));
    if (!initialCenter) {
      return;
    }
    const topIndex = variant.boneIndexById.get(part);
    if (topIndex === undefined) {
      return;
    }
    // The cached OBB and inertia are in the rest-pose model frame. Orient them with the posed cut bone;
    // relative bends in carried descendants (e.g. an elbow in a whole arm) remain an approximation.
    const yawRotation = rotY((state.lastPlacement.yawRad * 180) / Math.PI);
    const initialOrientation = mat3ToQuat(mulMM(yawRotation, variant.scratch[topIndex]!.r)) as Quaternion;
    const originOffsetY = this.world ? 0 : state.lastPlacement.y;
    const simulationCenter: Vec3 = [initialCenter[0], initialCenter[1] - originOffsetY, initialCenter[2]];
    const velocity = zombie?.body.vel ?? [0, 0, 0];
    const rigidBody: RigidBody = {
      mass: partData.mass,
      center: simulationCenter,
      orientation: initialOrientation,
      velocity: [velocity[0] * this.blockSize, velocity[1] * this.blockSize, velocity[2] * this.blockSize],
      angularMomentum: [0, 0, 0],
      inertiaBody: partData.inertiaBody,
      corners: partData.corners,
      remainderRealSeconds: 0,
      elapsedRealSeconds: 0,
      quietRealSeconds: 0,
      asleep: false,
    };
    if (hit) {
      this.applyDebrisHit(rigidBody, initialCenter, originOffsetY, hit);
    }
    this.insertDebris({
      id,
      part,
      state,
      variant,
      severedIndices,
      sourceTransforms,
      initialCenter,
      initialOrientation,
      originOffsetY,
      body: rigidBody,
      bloodiness: zombie ? woundSeverity(zombie) : 0,
    });
  }

  private posedSourceTransforms(
    variant: Variant,
    state: ZombieRenderState,
    indices: readonly number[],
  ): Map<number, MutableTransform> {
    boneTransformsInto(variant.realized.body.bones, state.lastPose!, variant.parentIndex, variant.scratch);
    const yawMatrix = rotY((state.lastPlacement!.yawRad * 180) / Math.PI);
    const { x, y, z } = state.lastPlacement!;
    const transforms = new Map<number, MutableTransform>();
    for (const index of indices) {
      const source = variant.scratch[index]!;
      const rotated = mulMV(yawMatrix, source.t);
      transforms.set(index, {
        r: [...mulMM(yawMatrix, source.r)] as MutableTransform['r'],
        t: [rotated[0] + x, rotated[1] + y, rotated[2] + z],
      });
    }
    return transforms;
  }

  /** The rendered pose can bend each carried bone separately; average its voxels in posed world space. */
  private posedPartCenter(variant: Variant, state: ZombieRenderState, selected: ReadonlySet<number>): Vec3 | undefined {
    const { voxels } = variant.realized;
    const { x, y, z, yawRad } = state.lastPlacement!;
    const cos = Math.cos(yawRad);
    const sin = Math.sin(yawRad);
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    for (let k = 0; k < voxels.dims[2]; k++) {
      for (let j = 0; j < voxels.dims[1]; j++) {
        for (let i = 0; i < voxels.dims[0]; i++) {
          const owner = voxels.owner[cellIndex(voxels.dims, i, j, k)]! - 1;
          if (owner < 0 || !selected.has(owner)) {
            continue;
          }
          const bone = variant.scratch[owner]!;
          const actorPoint = mulMV(bone.r, worldPosition(voxels, i, j, k));
          const actorX = actorPoint[0] + bone.t[0];
          const actorY = actorPoint[1] + bone.t[1];
          const actorZ = actorPoint[2] + bone.t[2];
          sumX += cos * actorX + sin * actorZ + x;
          sumY += actorY + y;
          sumZ += cos * actorZ - sin * actorX + z;
          count += 1;
        }
      }
    }
    return count ? [sumX / count, sumY / count, sumZ / count] : undefined;
  }

  private applyDebrisHit(body: RigidBody, center: Vec3, originOffsetY: number, hit: HitImpulse): Vec3 {
    const [dx, dy, dz] = hit.direction;
    const hitPoint: Vec3 = [
      hit.point[0] * this.blockSize,
      hit.point[1] * this.blockSize,
      hit.point[2] * this.blockSize,
    ];
    const projection = (center[0] - hitPoint[0]) * dx + (center[1] - hitPoint[1]) * dy + (center[2] - hitPoint[2]) * dz;
    const point: Vec3 = [
      hitPoint[0] + dx * projection,
      hitPoint[1] + dy * projection - originOffsetY,
      hitPoint[2] + dz * projection,
    ];
    const appliedPoint = applyImpulseAtClampedPoint(body, point, [
      dx * hit.impulse,
      dy * hit.impulse,
      dz * hit.impulse,
    ]);
    const spin = Math.hypot(...angularVelocity(body));
    if (spin > this.options.look.launchSpinRadiansPerSimSecond) {
      const factor = this.options.look.launchSpinRadiansPerSimSecond / spin;
      body.angularMomentum = [
        body.angularMomentum[0] * factor,
        body.angularMomentum[1] * factor,
        body.angularMomentum[2] * factor,
      ];
    }
    return appliedPoint;
  }

  private insertDebris(spawn: DebrisSpawn): void {
    if (this.options.maxCorpses === 0) {
      return;
    }
    const {
      id,
      part,
      state,
      variant,
      severedIndices,
      sourceTransforms,
      initialCenter,
      initialOrientation,
      originOffsetY,
      body,
      bloodiness,
    } = spawn;
    if (this.evictableDeadThingCount() >= this.options.maxCorpses) {
      this.evictOldestDeadThingGlobally();
    }
    if (variant.freeLocalSlots.length === 0) {
      this.evictOldestDeadThingInVariant(state.variantIndex);
    }
    const localSlot = variant.freeLocalSlots.pop();
    if (localSlot === undefined) {
      return;
    }
    const globalRow = state.variantIndex * this.capacity + localSlot;
    const instanceIndex = variant.liveIds.length;
    const order = this.takeDeadOrder();
    const key = `debris:${id}:${part}:${order}`;
    variant.liveIds.push(key);
    variant.idToInstanceIndex.set(key, instanceIndex);
    variant.crowdSlotAttr.setX(instanceIndex, globalRow);
    variant.crowdSlotAttr.needsUpdate = true;
    variant.mesh.count = variant.liveIds.length;
    this.debris.set(key, {
      variantIndex: state.variantIndex,
      localSlot,
      globalRow,
      instanceIndex,
      walkActor: state.walkActor,
      severedIndices,
      sourceTransforms,
      initialCenter,
      initialOrientation,
      originOffsetY,
      insertOrder: order,
      body,
      bloodiness,
      elapsed: 0,
      groundedAt: undefined,
    });
  }

  /** Off-screen detailed actors can skip packing; visible actors always use the current simulation pose. */
  private shouldSkipPose(worldPelvis: Vector3, radius = BOUNDING_RADIUS_M): boolean {
    if (!this.camera) {
      return false;
    }
    this.boundingSphere.center.copy(worldPelvis);
    this.boundingSphere.radius = radius;
    return !this.frustum.intersectsSphere(this.boundingSphere);
  }

  /** Interpolated pos/yaw/headYaw at `blend` between a zombie's last two fixed-step poses — exactly
   * ZombieMeshes.renderPose's own maths (src/render/zombies.ts), duplicated rather than extracted there:
   * that file is left alone on purpose (see this module's header comment). */
  private interpolateRenderPose(zombie: Zombie, blend: number): { pos: Vec3; yaw: number; headYaw: number } {
    const previous = zombie.renderPrevious;
    const pos: Vec3 = [
      previous.pos[0] + (zombie.body.pos[0] - previous.pos[0]) * blend,
      previous.pos[1] + (zombie.body.pos[1] - previous.pos[1]) * blend,
      previous.pos[2] + (zombie.body.pos[2] - previous.pos[2]) * blend,
    ];
    const yawBefore = Math.atan2(-previous.facing[0], -previous.facing[2]);
    const yawAfter = Math.atan2(-zombie.facing[0], -zombie.facing[2]);
    const yawDelta = Math.atan2(Math.sin(yawAfter - yawBefore), Math.cos(yawAfter - yawBefore));
    const yaw = yawBefore + yawDelta * blend;
    const headYaw = previous.headYaw + (zombie.headYaw - previous.headYaw) * blend;
    return { pos, yaw, headYaw };
  }

  private currentRenderPlacement(zombie: Zombie): { position: Vec3; worldPos: Vec3; yaw: number; headYaw: number } {
    const { pos, yaw, headYaw } = this.interpolateRenderPose(zombie, this.renderBlend);
    return {
      position: pos,
      worldPos: [pos[0] * this.blockSize, pos[1] * this.blockSize + (zombie.stepOffset ?? 0), pos[2] * this.blockSize],
      yaw,
      headYaw,
    };
  }

  /** Translates mobgen's severedBoneSet (bone id strings — body-plan-generic) into this variant's own bone
   * array indices, dropping any id this variant's rig doesn't have (defensive; shouldn't happen since every
   * variant is the same shambler body plan). */
  private indicesFor(variant: Variant, boneIds: ReadonlySet<string>): Set<number> {
    const indices = new Set<number>();
    for (const boneId of boneIds) {
      const index = variant.boneIndexById.get(boneId);
      if (index !== undefined) {
        indices.add(index);
      }
    }
    return indices;
  }

  /** Zeroes one bone's matrix in the shared texture — the whole 3x4, not just translation, so every vertex
   * of a severed bone collapses to the origin regardless of its own rest-pose offset from that bone's head
   * (see this module's header comment on why hiding needs no shader logic at all). */
  private packZeroBone(globalRow: number, bone: number): void {
    const i = crowdTexelIndex(this.layout, globalRow, bone);
    for (let k = 0; k < 12; k++) {
      this.textureData[i + k] = 0;
    }
  }

  /** FK from `pose`, then packs every bone at `globalRow`: severed bones get a zero matrix (hidden — see
   * packZeroBone), survivors get their real placed transform. Always (re)packs the severed mask and the
   * bloodiness too, even when nothing is severed or bloodied, so a reused row never goes stale. Shared by
   * packPose (a live zombie) and packCorpse; packDebris packs its own inverse (only the carried subtree is
   * real) directly, since the two cases share little beyond "call packCrowdBoneMatrix or packZeroBone". */
  private packSkeleton(
    globalRow: number,
    variant: Variant,
    frame: {
      pose: Pose;
      placement: CrowdPlacement;
      severedIndices: ReadonlySet<number>;
      bloodiness: number;
      charge: number;
      transforms?: ReadonlyMap<string, Transform>;
    },
  ): void {
    const { pose, placement, severedIndices, bloodiness, charge, transforms } = frame;
    if (transforms) {
      for (let bone = 0; bone < variant.realized.body.bones.length; bone++) {
        const source = transforms.get(variant.realized.body.bones[bone]!.id)!;
        copyScaledTransform(source, variant.scratch[bone]!, variant.bodyScale);
      }
    } else {
      boneTransformsInto(variant.realized.body.bones, pose, variant.parentIndex, variant.scratch);
      scaleTransformsInPlace(variant.scratch, variant.bodyScale);
    }
    for (let bone = 0; bone < variant.realized.body.bones.length; bone++) {
      if (severedIndices.has(bone)) {
        this.packZeroBone(globalRow, bone);
      } else {
        packCrowdBoneMatrix(
          this.textureData,
          { layout: this.layout, slot: globalRow, bone },
          variant.scratch[bone]!,
          placement,
        );
      }
    }
    packSeveredMask(this.textureData, this.layout, globalRow, severedIndices);
    packBloodiness(this.textureData, this.layout, globalRow, bloodiness);
    packCharge(this.textureData, this.layout, globalRow, charge);
    this.textureUpdates.touch(globalRow);
  }

  private observePerceptionTime(state: ZombieRenderState, zombie: Zombie): void {
    const { time } = zombie.renderPrevious;
    if (time === undefined || time === state.perceptionSimSeconds) {
      return;
    }
    if (state.perceptionSimSeconds !== undefined && time < state.perceptionSimSeconds) {
      state.previousPerceptionSimSeconds = undefined;
    } else {
      state.previousPerceptionSimSeconds = state.perceptionSimSeconds;
    }
    state.perceptionSimSeconds = time;
  }

  private hasRecentNearStimulus(state: ZombieRenderState, zombie: Zombie): boolean {
    const { stimulusAt, mode, investigationTier } = zombie;
    return (
      (mode === 'hesitate' || mode === 'investigate') &&
      investigationTier === 'near' &&
      stimulusAt !== undefined &&
      (mode === 'hesitate' ||
        stimulusAt === state.perceptionSimSeconds ||
        stimulusAt === state.previousPerceptionSimSeconds)
    );
  }

  private posedFrame(
    state: ZombieRenderState,
    zombie: Zombie,
    placement: { position: Vec3; worldPos: Vec3; yaw: number; headYaw: number },
    gazeFrame: { readonly dt?: number; readonly presentationSimSeconds?: number } = {},
  ): { pose: Pose; transforms: ReadonlyMap<string, Transform>; placement: CrowdPlacement } {
    const { dt: gazeFrameDelta = 0, presentationSimSeconds = 0 } = gazeFrame;
    const { position, worldPos, yaw, headYaw } = placement;
    const variant = this.variants[state.variantIndex]!;
    const posed = posedShambler(
      zombiePoseInputFor(zombie, state.id, this.blockSize, {
        position,
        facing: [-Math.sin(yaw), 0, -Math.cos(yaw)],
        headYaw,
      }),
    );
    let { pose, transforms }: { pose: Pose; transforms: ReadonlyMap<string, Transform> } = posed;
    const hasHead =
      variant.headPart !== undefined && zombie.regions.head! > 0 && !zombie.severed.includes(variant.headPart);
    if (hasHead) {
      const rootRotation = transpose(rotY((yaw * 180) / Math.PI));
      const eye = this.playerEyePosition ?? [this.cameraPosition.x, this.cameraPosition.y, this.cameraPosition.z];
      let target: readonly [number, number, number] | undefined;
      if (zombie.mode === 'chase' && (this.playerEyePosition !== undefined || this.camera)) {
        target = mulMV(rootRotation, [eye[0] - worldPos[0], eye[1] - worldPos[1], eye[2] - worldPos[2]]);
      } else if (this.hasRecentNearStimulus(state, zombie) && zombie.lastPerceived) {
        target = hearingGazeTarget(
          mulMV(rootRotation, [
            zombie.lastPerceived[0] * this.blockSize - worldPos[0],
            zombie.lastPerceived[1] * this.blockSize - worldPos[1],
            zombie.lastPerceived[2] * this.blockSize - worldPos[2],
          ]),
          state.id,
          presentationSimSeconds,
          this.options.look.hearingGazeJitter,
        );
      }
      const gaze = lookAtPose({
        bones: variant.realized.body.bones,
        pose,
        target,
        profile: variant.lookAt,
        state: state.lookAtState,
        gazeFrameDelta,
        baseTransforms: transforms,
      });
      state.lookAtState = gaze.state;
      ({ pose, transforms } = gaze);
    } else {
      state.lookAtState = LOOK_AT_REST;
    }
    return {
      pose,
      transforms,
      placement: { x: worldPos[0], y: worldPos[1], z: worldPos[2], yawRad: yaw },
    };
  }

  /** Packs the shared simulation pose and its FK into the texture, hiding whatever zombie.severed currently
   * covers (zombie.severed is the only source of truth, re-expanded every call). */
  private packPose(
    state: ZombieRenderState,
    variant: Variant,
    zombie: Zombie,
    frame: {
      placement: { position: Vec3; worldPos: Vec3; yaw: number; headYaw: number };
      gazeFrameDelta: number;
      presentationSimSeconds: number;
    },
  ): void {
    const posed = this.posedFrame(state, zombie, frame.placement, {
      dt: frame.gazeFrameDelta,
      presentationSimSeconds: frame.presentationSimSeconds,
    });
    const severedIndices = this.indicesFor(variant, severedBoneIds(variant, zombie.severed));
    this.packSkeleton(state.globalRow, variant, {
      ...posed,
      severedIndices,
      bloodiness: this.bloodiness(zombie),
      charge: acidCharge(zombie),
    });
    state.lastPose = posed.pose;
    state.lastPlacement = posed.placement;
    state.zombie = zombie;
  }

  /** Live actors' glow and mouth anchors as last drawn, for the glow light and drips. Presentation only. */
  *anchors(): Iterable<DrawnAnchors> {
    for (const state of this.states.values()) {
      const variant = this.variants[state.variantIndex]!;
      const { anchors } = variant.realized.body;
      const { zombie } = state;
      if (!((anchors?.glow || anchors?.mouth) && state.lastPose && state.lastPlacement && zombie)) {
        continue;
      }
      const transforms = boneTransforms(variant.realized.body.bones, state.lastPose);
      const at = (anchor: BodyAnchor | undefined): Vec3 | undefined =>
        anchor && anchorWorld(transforms, anchor, state.lastPlacement!, variant.bodyScale);
      yield { zombie, glow: at(anchors.glow), mouth: at(anchors.mouth) };
    }
  }

  private packCachedPose(
    state: ZombieRenderState,
    variant: Variant,
    zombie: Zombie,
    placement: { worldPos: Vec3; yaw: number },
  ): void {
    const crowdPlacement: CrowdPlacement = {
      x: placement.worldPos[0],
      y: placement.worldPos[1],
      z: placement.worldPos[2],
      yawRad: placement.yaw,
    };
    const severedIndices = this.indicesFor(variant, severedBoneIds(variant, zombie.severed));
    this.packSkeleton(state.globalRow, variant, {
      pose: state.lastPose!,
      placement: crowdPlacement,
      severedIndices,
      bloodiness: this.bloodiness(zombie),
      charge: acidCharge(zombie),
    });
    state.lastPlacement = crowdPlacement;
    state.zombie = zombie;
  }

  /** A corpse's own per-frame pose+pack: deathPose from its frozen basePose, sinking (an extra downward Y
   * offset, no re-posing needed) once it's been lying long enough. No LOD/frustum culling — the global
   * shared corpse cap already bounds this to a small, fixed extra cost regardless of camera or distance. */
  private corpsePose(corpse: Corpse, variant: Variant): Pose {
    if (corpse.settledPose) {
      return corpse.settledPose;
    }
    if (variant.model === 'acid') {
      const pose = acidDeathPose(variant.realized, corpse.basePose, corpse.elapsed, corpse.direction);
      if (corpse.elapsed >= acidTemplate.animation.deathDuration) {
        corpse.settledPose = pose;
      }
      return pose;
    }
    const deathActor: DeathActor = { ...corpse.walkActor, bodyExtents: variant.bodyExtents };
    const pose = deathPose(deathActor, corpse.basePose, corpse.elapsed, {
      direction: corpse.direction,
      seed: corpse.poseSeed,
      ...(this.options.deathPoseId === undefined ? {} : { poseId: this.options.deathPoseId }),
    });
    if (corpse.elapsed >= DEATH_FALL_DURATION) {
      corpse.settledPose = pose;
    }
    return pose;
  }

  private packCorpse(corpse: Corpse): void {
    const variant = this.variants[corpse.variantIndex]!;
    const pose = this.corpsePose(corpse, variant);
    const sinkElapsed = corpse.elapsed - (DEATH_FALL_DURATION + this.options.look.corpseLieSimSeconds);
    const sinkT = corpse.incapacitated
      ? 0
      : Math.max(0, Math.min(1, sinkElapsed / this.options.look.corpseSinkSimSeconds));
    const crowdPlacement: CrowdPlacement = {
      x: corpse.worldPos[0],
      y: corpse.worldPos[1] - sinkT * this.options.look.corpseSinkDepthMetres,
      z: corpse.worldPos[2],
      yawRad: corpse.yaw,
    };
    const severedIndices = new Set(this.indicesFor(variant, severedBoneIds(variant, corpse.severed)));
    if (!corpse.incapacitated) {
      for (const index of variant.burstIndices) {
        severedIndices.add(index);
      }
    }
    this.packSkeleton(corpse.globalRow, variant, {
      pose,
      placement: crowdPlacement,
      severedIndices,
      bloodiness: corpse.bloodiness,
      charge: corpse.charge,
    });
  }

  /** A piece of debris's own per-frame pose+pack — the inverse of packSkeleton: only `severedIndices` (the
   * carried subtree) gets a real, physics-placed matrix; every other bone is zeroed (hidden). Spin is
   * composed onto the severed bone's own pose rotation, so it carries the whole subtree with it through
   * ordinary FK composition — the same trick deathPose uses to topple the whole body from the pelvis. The
   * mask is inverted too (everything the debris does *not* carry reads as "severed" from its own
   * perspective), so its own stump face still gets the gore tint. */
  private packDebris(d: Debris): void {
    const variant = this.variants[d.variantIndex]!;
    const currentRotation = quatToMat3(d.body.orientation);
    const originalRotation = quatToMat3(d.initialOrientation);
    const delta = mulMM(currentRotation, transpose(originalRotation));
    const sinkElapsed = d.elapsed - (d.groundedAt ?? d.elapsed) - this.options.look.corpseLieSimSeconds;
    const sinkT = Math.max(0, Math.min(1, sinkElapsed / this.options.look.corpseSinkSimSeconds));
    const center: Vec3 = [
      d.body.center[0],
      d.body.center[1] + d.originOffsetY - sinkT * this.options.look.corpseSinkDepthMetres,
      d.body.center[2],
    ];
    const carried = new Set(d.severedIndices);
    const hidden = new Set<number>();
    for (let bone = 0; bone < variant.realized.body.bones.length; bone++) {
      const source = d.sourceTransforms.get(bone);
      if (carried.has(bone) && source) {
        const offset = mulMV(delta, [
          source.t[0] - d.initialCenter[0],
          source.t[1] - d.initialCenter[1],
          source.t[2] - d.initialCenter[2],
        ]);
        const placed: MutableTransform = {
          r: [...mulMM(delta, source.r)] as MutableTransform['r'],
          t: [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]],
        };
        packCrowdBoneMatrix(this.textureData, { layout: this.layout, slot: d.globalRow, bone }, placed, {
          x: 0,
          y: 0,
          z: 0,
          yawRad: 0,
        });
      } else {
        this.packZeroBone(d.globalRow, bone);
        hidden.add(bone);
      }
    }
    packSeveredMask(this.textureData, this.layout, d.globalRow, hidden);
    packBloodiness(this.textureData, this.layout, d.globalRow, d.bloodiness);
    packCharge(this.textureData, this.layout, d.globalRow, 1);
    this.textureUpdates.touch(d.globalRow);
  }

  private zombiePoseBounds(zombie: Zombie, placement: { worldPos: Vec3 }): { center: Vector3; radius: number } {
    const halfWidth = zombie.body.halfWidth * this.blockSize;
    const halfDepth = (zombie.body.halfDepth ?? zombie.body.halfWidth) * this.blockSize;
    const height = zombie.body.height * this.blockSize;
    const amalgam = zombie.type.model === 'amalgam';
    return {
      center: new Vector3(
        placement.worldPos[0],
        placement.worldPos[1] + (amalgam ? height / 2 : PELVIS_HEIGHT_M),
        placement.worldPos[2],
      ),
      radius: amalgam ? Math.hypot(halfWidth, halfDepth, height / 2) : BOUNDING_RADIUS_M,
    };
  }

  private packZombiePose(
    state: ZombieRenderState,
    variant: Variant,
    zombie: Zombie,
    frame: {
      placement: { position: Vec3; worldPos: Vec3; yaw: number; headYaw: number };
      gazeFrameDelta: number;
      presentationSimSeconds: number;
    },
  ): void {
    const bounds = this.zombiePoseBounds(zombie, frame.placement);
    if (this.shouldSkipPose(bounds.center, bounds.radius) && state.lastPose) {
      this.packCachedPose(state, variant, zombie, frame.placement);
      return;
    }
    this.packPose(state, variant, zombie, frame);
  }

  private syncZombie(
    { id, zombie }: { id: EntityId; zombie: Zombie },
    gazeDt: number,
    presentationSimSeconds: number,
  ): void {
    if (!zombie.incapacitated && this.corpses.get(id)?.incapacitated) {
      this.freeCorpse(id);
    }
    if (zombie.incapacitated) {
      this.removeTentacle(id);
      if (!this.corpses.has(id)) {
        let state = this.states.get(id);
        if (!state) {
          state = this.addZombie(id, zombie);
        }
        if (state) {
          this.zombieIncapacitated(id, zombie);
        }
      }
      return;
    }
    let state = this.states.get(id);
    if (!state) {
      state = this.addZombie(id, zombie);
      if (!state) {
        return; // this variant is full — not drawn (see this module's header comment)
      }
    }
    state.lastSeenFrame = this.frameCounter;
    this.observePerceptionTime(state, zombie);
    this.syncWound(id, state, zombie.carved);
    const variant = this.variants[state.variantIndex]!;
    const placement = this.currentRenderPlacement(zombie);
    this.updatePerceptionLabel(id, zombie, state, placement);
    this.packZombiePose(state, variant, zombie, {
      placement,
      gazeFrameDelta: gazeDt,
      presentationSimSeconds,
    });
    this.updateTentacle(id, zombie, placement, state.lastPose);
  }

  // biome-ignore lint/complexity/useMaxParams: Keep the renderer interface aligned with its base implementation.
  sync(
    store: EntityStore<Zombie>,
    realDt = 0,
    alpha = 1,
    _freezeLiving = false,
    backgroundAlpha = alpha,
    simulationTime?: number,
  ): void {
    this.frameCounter += 1;
    if (this.camera) {
      this.camera.getWorldPosition(this.cameraPosition);
      this.frustumMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.frustumMatrix);
    }
    const blend = Math.max(0, Math.min(1, alpha));
    this.activeBlend = blend;
    this.backgroundBlend = Math.max(0, Math.min(1, backgroundAlpha));
    this.renderBlend = blend;
    const present = new Set<EntityId>();
    for (const [id, zombie] of store.entries()) {
      present.add(id);
      const actorBackgroundBlend = backgroundActorBlend(zombie, simulationTime, this.backgroundBlend);
      this.renderBlend = zombie.tier === 'background' ? actorBackgroundBlend : this.activeBlend;
      this.syncZombie({ id, zombie }, Math.max(0, Math.min(realDt, 0.05)), simulationTime ?? 0);
    }
    for (const [id, state] of this.states) {
      if (state.lastSeenFrame !== this.frameCounter) {
        this.removeZombie(id, state); // a plain vanish (despawn/unload) — a death goes through zombieDied
      }
    }
    for (const [id, corpse] of this.corpses) {
      if (corpse.incapacitated && !present.has(id)) {
        this.freeCorpse(id);
      }
    }
    this.advanceCorpses(realDt);
    this.advanceDebris(realDt);
    this.fleshChunks.update(realDt, this.rigidWorld());
    this.applyReveal();
    this.textureUpdates.flush();
  }

  // Slot compaction can rewrite a moved actor's row, so gate only after all insertion and pruning.
  private applyReveal(): void {
    if (!this.reveal) {
      return;
    }
    for (const [id, state] of this.states) {
      const placement = state.lastPlacement;
      if (placement) {
        this.revealSlot(id, state, placement.x / this.blockSize, placement.z / this.blockSize);
      }
    }
    for (const [id, corpse] of this.corpses) {
      this.revealSlot(id, corpse, corpse.worldPos[0] / this.blockSize, corpse.worldPos[2] / this.blockSize);
    }
    for (const [key, debris] of this.debris) {
      this.revealSlot(key, debris, debris.body.center[0] / this.blockSize, debris.body.center[2] / this.blockSize);
    }
  }

  private revealSlot(key: SlotKey, holder: SlotHolder, x: number, z: number): void {
    const allowed = this.reveal!.isRevealed(x, z);
    const variant = this.variants[holder.variantIndex]!;
    const row = allowed ? this.rowFor(key, holder.globalRow) : this.hiddenRow;
    if (variant.crowdSlotAttr.getX(holder.instanceIndex) !== row) {
      variant.crowdSlotAttr.setX(holder.instanceIndex, row);
      variant.crowdSlotAttr.needsUpdate = true;
    }
    if (typeof key !== 'number') {
      return;
    }
    const wound = this.wounds.get(key);
    if (wound) {
      wound.mesh.visible = allowed;
    }
    if (!allowed) {
      const tentacle = this.tentacles.get(key);
      if (tentacle) {
        tentacle.shaft.visible = false;
        tentacle.tip.visible = false;
      }
      const label = this.perceptionLabels.get(key);
      if (label) {
        label.style.display = 'none';
      }
    }
  }

  /** The loaded voxel world, or a local feet-height plane if no world was supplied (tests/bench). */
  private rigidWorld(): RigidWorld {
    return this.world ?? { blockSize: this.blockSize, isSolid: (_x: number, y: number, _z: number) => y < 0 };
  }

  /** Corpses are driven entirely by their own `elapsed`, not by the store (the sim has already forgotten
   * them) — advance, re-pose/pack, and free once their whole lifetime (fall + lie + sink) has passed. */
  private advanceCorpses(realDt: number): void {
    for (const [id, corpse] of this.corpses) {
      const wasFalling = corpse.incapacitated && corpse.elapsed < DEATH_FALL_DURATION;
      corpse.elapsed += realDt;
      if (corpse.incapacitated) {
        corpse.elapsed = Math.min(corpse.elapsed, DEATH_FALL_DURATION);
        if (wasFalling || corpse.elapsed < DEATH_FALL_DURATION) {
          this.packCorpse(corpse);
        }
        continue;
      }
      if (
        corpse.elapsed >=
        DEATH_FALL_DURATION + this.options.look.corpseLieSimSeconds + this.options.look.corpseSinkSimSeconds
      ) {
        this.freeCorpse(id);
        continue;
      }
      this.packCorpse(corpse);
    }
  }

  /** Steps each debris rigid body against `rigidWorld()`. Lying and sinking begin only after the solver
   * sleeps the body. */
  private advanceDebris(realDt: number): void {
    const world = this.rigidWorld();
    for (const [key, d] of this.debris) {
      d.elapsed += realDt;
      if (!d.body.asleep) {
        stepRigidBody(d.body, realDt, world);
      }
      if (d.body.asleep && d.groundedAt === undefined) {
        d.groundedAt = d.elapsed;
      }
      if (
        d.groundedAt !== undefined &&
        d.elapsed >= d.groundedAt + this.options.look.corpseLieSimSeconds + this.options.look.corpseSinkSimSeconds
      ) {
        this.freeDebris(key);
        continue;
      }
      this.packDebris(d);
    }
  }

  /** Adds `headYawRad` as an extra yaw on the head bone, innermost (applied before whatever sway/tilt
   * walkPose already gave it) — same "yaw innermost" convention walkPose itself uses for the pelvis (see
   * mob/gait.ts's own pelvisR composition). Cheap and clean since Pose.rotations is just one matrix per
   * bone; nothing more elaborate (e.g. touching the neck too) seemed necessary. */
  dispose(): void {
    this.setPerceptionLabels(false);
    for (const id of [...this.tentacles.keys()]) {
      this.removeTentacle(id);
    }
    this.tentacleGeometry?.dispose();
    this.tentacleTipGeometry?.dispose();
    this.tentacleMaterial?.dispose();
    for (const id of [...this.wounds.keys()]) {
      this.removeWound(id);
    }
    this.fleshChunks.dispose();
    this.textureUpdates.dispose();
    this.texture.dispose();
    this.material.dispose();
    for (const variant of this.variants) {
      variant.geometry.dispose();
    }
  }
}
