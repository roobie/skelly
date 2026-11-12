// Draws actors as their built figures instead of ActorMeshes' six boxes — the default behind
// the hash `actors` key (GameConfig.actors; `actors:boxes` selects the fallback; see `packages/engine/src/game/config.ts`).
// Same shape as ActorMeshes
// (group/sync/…, see ActorRenderer below) so play.ts can hold either behind one variable.
//
// Each figure is drawn from the session's built files (`packages/engine/src/core/actorFigureFiles.ts`): its mesh, body and clips,
// so the game draws exactly the figure the authoring tools exported. The draw strategy: one shared bone-matrix
// DataTexture for every actor so shadow and colour passes consume the same pose, and one InstancedMesh per body
// variant, each vertex fetching its own bone's matrix with a single texelFetch — see ./crowd.ts for the
// packing/layout and the GLSL, patched into MeshLambertMaterial here via onBeforeCompile at the
// <begin_vertex>/<beginnormal_vertex> chunks (checked against three r186's meshlambert.glsl.js).
//
// Those bone-placed instances are invisible to frustum culling (identity instance matrices; see
// `frustumCulled = false`), so three.js would draw every figure in the world into every shadow map.
// Each variant therefore draws shadows through selection-only twins on SHADOW_CROWD_LAYER, one twin per
// light pass, whose instance slots and count selectShadowCasters sets for that pass — the same per-light
// caster selection chunks.ts makes for its boxes; the crowd mesh itself never casts. One twin per pass,
// not one shared twin, because three uploads a geometry's attributes only once per renderer frame
// (`WebGLObjects.update` guards on `info.render.frame`): rows rewritten per light into one shared
// attribute would reach the GPU once, and every later pass in the frame would draw the first pass's rows.
// A light's map draws only the figures that can cast into the map's volume, and the same bone texture
// poses every twin.
//
// Known simplification: each drawn figure variant owns a block of `capacity` bone-texture rows. The figures
// are those the `actors` option's types author (`drawnSeeds`), and types that bake the same figure share one
// variant (`src/render/actorFigureVariants.ts`, `figureVariants`);
// `DEFAULT_CAPACITY` provides the default capacity. A variant's overflow is not drawn, though its sim state
// is unaffected — a hard per-variant cap for that actor's whole life, not a rotating "nearest capacity"
// set. Picking the nearest actors would require per-frame distance sorting within every overflowing variant.
//
// Living base pose (gait, idle clock, attack cooldown phase, and hit flinch) is simulation-owned and comes
// from core/actorPose.ts, the same pure function used by hit-region FK. This renderer adds the
// interpolated root transform and neck/head gaze toward the camera while Actor.agent.mode is 'chase', or toward
// a recent near stimulus while investigating. Hearing gaze has deterministic render-only jitter; stale gaze
// eases back to the simulation pose at the same bounded rate, and never feeds hit-region FK.
// Fixed-step state, not render dt or randomness, drives the simulation-owned pose. A
// death is different — packages/engine/src/core/actorSystem.ts's onDeath removes the actor from its store and calls actorDied
// here in the very same step, so this renderer owns the corpse from then on: it keeps the existing
// slot/variant/instance, falls (as a ragdoll, or through the figure's built death clip when it bakes one),
// holds once lying, sinks, then frees the slot. Corpses are render-only; incapacitated actors remain
// simulation entities, fall once and lie in their existing row, excluded from corpse eviction, until finishing
// one off makes it an ordinary corpse.
//
// Dismemberment: packages/engine/src/core/actorState.ts's Actor.severed (part names, e.g.
// "upperArm.L") is the *only* source of truth — this renderer never keeps its own copy for a live actor,
// just re-expands actor.severed via severedBoneSet whenever that list grows (the simulation only appends
// to it), which is what makes save/load "just work": a restored actor's severed list is already exactly
// right. A severed bone is hidden by
// writing an all-zero 3x4 matrix for it in the shared texture (packZeroBone) — a zero matrix collapses
// every one of that bone's vertices to the origin, degenerate, so hiding it needs no shader logic at all.
// The severed-bone bitmask (crowd.ts's packSeveredMask) exists only for the *gore* effect: a survivor
// bone's face whose neighbourBone has just been severed (see ./actorFigureGeometry.ts) gets tinted in the fragment
// shader. A corpse's severed set is frozen at the instant of death, same as its pose. Severing also spawns
// one piece of flying debris (see the Debris type below) — its own InstancedMesh row shows only the
// severed subtree (the inverse of a live actor/corpse: the carried bones are real, everything else is
// zeroed) and shares the corpse Rapier world and cap/eviction/lifecycle machinery
// (a debris row counts toward the shared corpse budget exactly like a corpse does).

import {
  type ActorBody,
  type ActorClips,
  type ActorFigureFiles,
  actorFigure,
  actorFigureKey,
  type LookAtProfile,
} from '@skelly/engine/content';
import type { LookDefaults } from '@skelly/engine/look';
import type { Quaternion } from '@skelly/engine/math';
import type { ColumnReveal } from '@skelly/engine/mesh';
import {
  type ActorPoseScene,
  acidSpitWindupProgress,
  actorCrawls,
  actorPoseInputFor,
  allocateBoneTransforms,
  applyPoint,
  type BodyAnchor,
  type Bone,
  bodyPartMass,
  bodySkeleton,
  boneTransforms,
  boneTransformsInto,
  boneVoxelCentres,
  FUSED_MASS_FIGURE_SEED,
  type FusedMassGrid,
  fusedMassTypeOf,
  indexBonesByParent,
  type Mat3,
  type MutableTransform,
  mat3ToQuat,
  mulMM,
  mulMV,
  type ParentIndex,
  type Pose,
  posedActor,
  quatToMat3,
  rotY,
  severableParts,
  severedBoneSet,
  slerpQuat,
  type Transform,
  transpose,
  voxelBounds,
} from '@skelly/engine/pose';
import {
  ACTIVE_ACTOR_RATE,
  type Actor,
  actorAttackReachMetres,
  BACKGROUND_ACTOR_RATE,
  type EntityId,
  type EntityStore,
  type HitImpulse,
} from '@skelly/engine/sim';
import type { Vec3 } from '@skelly/engine/world';
import {
  Box3,
  BufferGeometry,
  type Camera,
  Color,
  CylinderGeometry,
  DataTexture,
  FloatType,
  Frustum,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshDepthMaterial,
  MeshLambertMaterial,
  NearestFilter,
  RedFormat,
  RGBAFormat,
  Sphere,
  SphereGeometry,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { figureVariants } from './actorFigureVariants.ts';
import { BLOOD_STAIN_COLOR_FRAGMENT, BLOOD_STAIN_FRAGMENT_DECLARATIONS } from './bloodStain.ts';
import { corpseFallPose, deathClip } from './corpsePose.ts';
import {
  CROWD_BEGIN_VERTEX,
  CROWD_BEGINNORMAL_VERTEX,
  CROWD_CELL_BEGIN_VERTEX,
  CROWD_CELL_VERTEX_DECLARATIONS,
  CROWD_COLOR_FRAGMENT,
  CROWD_EMISSIVE_FRAGMENT,
  CROWD_FRAGMENT_DECLARATIONS,
  CROWD_VERTEX_DECLARATIONS,
  type CrowdCellMaskLayout,
  type CrowdPlacement,
  type CrowdTextureLayout,
  crowdCellMaskLayout,
  crowdTexelIndex,
  crowdTextureLayout,
  packBloodiness,
  packCellMask,
  packCharge,
  packCrowdBoneMatrix,
  packSeveredMask,
} from './crowd.ts';
import { fusedMassCoreInteriorAnchor, fusedMassTentaclePose } from './fusedMassTentaclePose.ts';
import { woundSeverity } from './gore.ts';
import { patchHeightFog } from './heightFog.ts';
import { holeWallGeometry } from './holeWalls.ts';
import { LOOK_AT_REST, type LookAtState, lookAtPose } from './lookAt.ts';
import { PoseTextureUpdates } from './poseTextureUpdates.ts';
import { type Ragdoll, type RagdollConfig, RagdollWorld } from './ragdoll.ts';
import { angularVelocity, applyImpulseAtClampedPoint, type RigidBody, type RigidWorld } from './rigidImpulse.ts';
import { castsAndReceives, SHADOW_CROWD_LAYER } from './shadowFlags.ts';

/** What play.ts needs from either renderer, so it can hold `ActorMeshes | MobActorMeshes` behind one
 * variable. `dispose`/`setCamera`/`actorDied` are optional: ActorMeshes has none of them (see
 * src/render/actors.ts), MobActorMeshes has all three. `actorDied` must be called for every death (see
 * packages/engine/src/core/actorSystem.ts's onDeath and play.ts's forwarding) so a corpse renderer can tell "died, keep as a
 * corpse" apart from "vanished without dying" (despawn/unload) — see MobActorMeshes' own doc comment. */
export interface ActorRenderer {
  readonly group: Group;
  sync: (
    store: EntityStore<Actor>,
    realDt?: number,
    alpha?: number,
    freezeLiving?: boolean,
    backgroundAlpha?: number,
    simulationTime?: number,
  ) => void;
  dispose?: () => void;
  uploadPoses?: (renderer: WebGLRenderer) => void;
  setCamera?: (camera: Camera) => void;
  setPlayerEyePosition?: (position: Vec3, maxSpeed: number) => void;
  setPlayerChestPosition?: (position: Vec3) => void;
  setPerceptionLabels?: (enabled: boolean) => void;
  anchors?: () => Iterable<DrawnAnchors>;
  actorWounded?: (id: EntityId, hit: HitImpulse) => void;
  actorDied?: (id: EntityId, actor: Actor, playerPos?: Vec3) => void;
  actorIncapacitated?: (id: EntityId, actor: Actor) => void;
  /** Called once for every part severed (packages/engine/src/core/actorSystem.ts's onSever, forwarded by play.ts) — a flying
   * limb of debris, not the whole actor; see MobActorMeshes' own doc comment. */
  setWorld?: (isSolid: RigidWorld['isSolid'], blockSize: number) => void;
  actorSevered?: (id: EntityId, part: string, hit?: HitImpulse, actor?: Actor) => Vec3 | undefined;
  /** Called when a hit knocks flesh out of a fused-mass body (packages/engine/src/core/actorSystem.ts's onCarve, forwarded by play.ts). */
  actorCarved?: (id: EntityId, actor: Actor) => void;
  /** Picks the instanced figures each shadow pass draws, per light (render/shadows.ts): the crowd twins'
   * selection, or a no-op where three.js already culls (ActorMeshes' boxes). */
  selectShadowCasters: (slot: number, casts: (box: Box3) => boolean) => void;
  /** Makes `slots` per-pass shadow selections available (one per light that can cast in a renderer
   * frame); render/shadows.ts calls it before the first render. No-op where three.js already culls. */
  reserveShadowSlots: (slots: number) => void;
}

const DEFAULT_CAPACITY = 64; // matches ActorMeshes' own default

const PELVIS_HEIGHT_M = 0.9;
const BOUNDING_RADIUS_M = 1.2;

/** Keeps severing-energy tests within the selected fixture seed instead of allocating every renderer variant. */
export const mobFigurePoolSizeThrough = (figureSeeds: readonly number[], figureSeed: number): number => {
  const index = figureSeeds.indexOf(figureSeed);
  if (index < 0) {
    throw new RangeError(`Unknown actor figure seed: ${figureSeed}`);
  }
  return index + 1;
};

const severedBoneIds = (variant: Variant, parts: readonly string[]): ReadonlySet<string> =>
  severedBoneSet(
    variant.bones,
    parts.map((part) => variant.severedRoots.get(part) ?? part),
  );

/** Which way a corpse should topple: away from the player if a position is available (in reach at the
 * moment of death, in the player's forward hemisphere from the actor's own facing → topple backward,
 * away; otherwise the player is behind it → topple forward, away), else backward — the documented default
 * for "no player position available." Exported for test/mobActors.test.ts. */
export const fallDirectionAwayFromPlayer = (facing: Vec3, actorPos: Vec3, playerPos: Vec3 | undefined): 1 | -1 => {
  if (!playerPos) {
    return -1;
  }
  const towardPlayerX = playerPos[0] - actorPos[0];
  const towardPlayerZ = playerPos[2] - actorPos[2];
  const facingTowardPlayer = facing[0] * towardPlayerX + facing[2] * towardPlayerZ;
  return facingTowardPlayer > 0 ? -1 : 1;
};

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const backgroundActorBlend = (actor: Actor, simulationTime: number | undefined, fallback: number): number =>
  simulationTime === undefined || actor.renderPrevious.time === undefined
    ? fallback
    : clamp01((simulationTime - actor.renderPrevious.time) * BACKGROUND_ACTOR_RATE);

/** A live actor is keyed by its EntityId; a piece of debris (there can be more than one per actor, over
 * its lifetime) gets its own synthetic string key — see actorSevered. Corpses stay EntityId-keyed (one
 * per actor). */
type SlotKey = EntityId | string;

/** A severable part's rigid body as debris, in the scaled rest frame about its centre of mass. */
interface RigidPart {
  readonly mass: number;
  readonly inertiaBody: RigidBody['inertiaBody'];
  readonly corners: readonly Vec3[];
  readonly boneIndices: readonly number[];
}

/** One light pass's selection twin (see the module header): the crowd geometry's vertex buffers in
 * their own geometry wrapper, with this pass's own crowd slots — a geometry's attributes upload once
 * per renderer frame in three, so each pass's rows must live in their own attribute. */
interface ShadowPassTwin {
  readonly mesh: InstancedMesh;
  readonly slots: InstancedBufferAttribute;
}

interface Variant {
  readonly body: ActorBody;
  readonly clips: ActorClips;
  /** The body's bones as the pose solver's skeleton, in body bone order. */
  readonly bones: readonly Bone[];
  /** The authored body scale, 1 for every model drawn at figure size. */
  readonly scale: number;
  /** A body gazes only while it keeps a head part, so a body without one never gazes. */
  readonly gaze: { readonly profile: LookAtProfile; readonly headPart: string } | undefined;
  /** The carved-cell mask of a figure whose mesh carries cell indices: the fused mass. */
  readonly cells: VariantCells | undefined;
  readonly rigidParts: ReadonlyMap<string, RigidPart>;
  readonly severedRoots: ReadonlyMap<string, string>;
  /** Bones a death removes without a severed part (the `burst` disposition), such as the acid sac. */
  readonly burstIndices: readonly number[];
  readonly parentIndex: ParentIndex;
  /** Bone id -> this variant's own bone array index — translates severedBoneSet (string ids, body-plan-
   * generic) into the indices the shared texture and its severed mask are keyed by. */
  readonly boneIndexById: ReadonlyMap<string, number>;
  readonly geometry: BufferGeometry;
  readonly mesh: InstancedMesh;
  readonly crowdSlotAttr: InstancedBufferAttribute;
  /** The pass-through twins the shadow passes draw instead of drawing every figure: one per light pass
   * (`ShadowPassTwin`), same geometry and materials, its own slots (`slots`) and a per-light count set by
   * selectShadowCasters. Grown by reserveShadowSlots; slot 0 exists from construction. */
  readonly shadowPasses: ShadowPassTwin[];
  /** How far a drawn vertex can sit from the translation of the packed bone matrix that poses it: the
   * bind sphere centre's distance from the origin plus its radius (bind geometry can sit offset from
   * its origin; the diameter alone would ignore that), since the crowd shader applies each vertex
   * exactly one packed matrix (render/crowd.ts, CROWD_BEGIN_VERTEX) whose rotation is the bind
   * vertex's rotation scaled by this variant's scale — every packing path (packPlaced, packCrawlFall,
   * packCorpse, packDebris) packs it that way. Expands the box around packed bone translations
   * (boxAroundRow). Metres. */
  readonly casterReach: number;
  /** Reused every frame for every actor of this variant: each place-and-pack fully consumes it before
   * returning, so nothing overlaps. */
  readonly scratch: MutableTransform[];
  /** Local slot numbers (0..capacity-1) not currently assigned to a live actor, corpse, *or debris* of
   * this variant. */
  readonly freeLocalSlots: number[];
  /** Dense, compacted (swap-removed) list of the actor/corpse/debris keys currently drawn by this
   * variant's InstancedMesh — liveIds[k] is instance k. A corpse or a piece of debris stays in this list
   * exactly like a live actor (see MobActorMeshes' own doc comment); only freeSlot ever removes an entry. */
  readonly liveIds: SlotKey[];
  readonly idToInstanceIndex: Map<SlotKey, number>;
}

/** The three fields freeSlot needs to release a live actor's, a corpse's, or a piece of debris's
 * row/instance — ActorRenderState, Corpse and Debris all satisfy this structurally. */
interface SlotHolder {
  readonly variantIndex: number;
  readonly localSlot: number;
  readonly globalRow: number;
  instanceIndex: number;
}

interface ActorRenderState extends SlotHolder {
  readonly id: EntityId;
  lookAtState: LookAtState;
  previousPerceptionSimSeconds: number | undefined;
  perceptionSimSeconds: number | undefined;
  crawling: boolean;
  fallHit?: Vec3 | undefined;
  crawlFall?: { physics: Ragdoll; elapsedRealSeconds: number; released: boolean } | undefined;
  drawnFall?: Map<number, Transform> | undefined;
  lastPose: Pose | undefined;
  /** `lastPose`'s bone transforms at the body's scale, in bone order: what the row is drawn from. */
  readonly bodyTransforms: MutableTransform[];
  lastPlacement: CrowdPlacement | undefined;
  /** Every input `lastPose` read; equal inputs and a resting gaze pose the same body again. */
  poseStamp: readonly (number | string)[] | undefined;
  /** Bone indices `actor.severed` hides, kept until the list grows. */
  severed: SeveredBones | undefined;
  /** What the row holds besides `bodyTransforms`; undefined once the pose or row changes underneath it. */
  row: RowInputs | undefined;
  /** The simulation actor last drawn in this slot. */
  actor: Actor | undefined;
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
  const tolerance = Math.max(blockSize / 1000, maxSpeed / ACTIVE_ACTOR_RATE);
  return Math.hypot(target[0] * blockSize - playerEye[0], target[2] * blockSize - playerEye[2]) <= tolerance;
};

export const perceptionLabelFor = (
  actor: Actor,
  recentNearStimulus: boolean,
  playerEye: Vec3 | undefined,
  { blockSize, maxSpeed }: { blockSize: number; maxSpeed: number },
): PerceptionLabel => {
  if (!actor.agent) {
    return 'unaware';
  }
  if (actor.agent.mode === 'chase') {
    return 'sees you';
  }
  if (recentNearStimulus) {
    return actor.agent.lastPerceived && perceivedAtPlayer(actor.agent.lastPerceived, playerEye, blockSize, maxSpeed)
      ? 'hears you'
      : 'notices something';
  }
  if (actor.agent.lastPerceived !== undefined || actor.agent.mode === 'investigate' || actor.agent.mode === 'search') {
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

/** A dead actor keeps its live slot after the simulation has forgotten it. */
interface Corpse extends SlotHolder {
  /** Permanent incapacitation uses the fall pose but remains a saved simulation entity and is never evicted. */
  readonly incapacitated: boolean;
  /** The pose frozen at the instant of death. */
  readonly basePose: Pose;
  /** The simulation's death point stays separate from render-only limb motion and sinking. */
  readonly worldPos: Vec3;
  readonly yaw: number;
  readonly direction: 1 | -1;
  readonly poseSeed: number;
  launch?: Vec3 | undefined;
  settledPose?: Pose;
  ragdoll?: Ragdoll;
  groundedAt?: number;
  /** Frozen at the instant of death — a corpse keeps whatever was severed while it was still alive (see
   * this module's header comment); parts severed by the killing blow itself are already included, since
   * onSever fires before onDeath (packages/engine/src/core/actorSystem.ts's swing). */
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

/** One variant's carved cells: a mask row per local slot, read by its own materials' vertex shaders. */
interface VariantCells {
  readonly layout: CrowdCellMaskLayout;
  readonly data: Float32Array;
  readonly texture: DataTexture;
  readonly material: MeshLambertMaterial;
  readonly depthMaterial: MeshDepthMaterial;
  /** How many carved cells each local slot's row holds; `carved` only grows, so an equal count needs no upload. */
  readonly packed: number[];
  readonly grid: FusedMassGrid;
  readonly slotBase: number;
  /** Each local slot's last packed carved cells, which a severed piece's walls are built from. */
  readonly carved: (readonly number[])[];
  /** Each local slot's hole walls (src/render/holeWalls.ts), freed with the slot. */
  readonly walls: (Mesh | undefined)[];
}

/** Arguments kept together for inserting one physics-backed debris slot. */
interface DebrisSpawn {
  id: EntityId;
  part: string;
  state: Pick<SlotHolder, 'variantIndex' | 'localSlot'>;
  variant: Variant;
  severedIndices: readonly number[];
  sourceTransforms: Map<number, MutableTransform>;
  initialCenter: Vec3;
  initialOrientation: Quaternion;
  originOffsetY: number;
  body: RigidBody;
  bloodiness: number;
}

/** A flying piece of debris — a severed limb, physically simulated (see actorSevered/advanceDebris) —
 * drawn as the *inverse* of a corpse: only `severedIndices` are visible (real, physics-placed matrices),
 * every other bone is zeroed. Reuses a corpse-shaped slot/lifecycle (see this module's header comment). */
interface Debris extends SlotHolder {
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
  readonly physics: Ragdoll;
}

export interface MobActorMeshesOptions {
  readonly ragdollSeed?: number | undefined;
  readonly look: LookDefaults['mobActors'];
  readonly maxCorpses: number;
  readonly handlingReachMetres: number;
  readonly gravityMetresPerSimSecondSquared: number;
  /** The product's corpse physics tuning. */
  readonly ragdoll: RagdollConfig;
  readonly canvas?: HTMLCanvasElement | undefined;
  readonly reveal?: ColumnReveal;
  /** The actor types to draw: a variant per model they select and figure seed they author. */
  readonly actors: ReadonlyMap<string, DrawnActorType>;
  /** The session's built actor figures, handed to each pose input (`packages/engine/src/core/actorPose.ts`, `ActorPoseInput`). */
  readonly actorFigureFiles: ActorFigureFiles;
  /** Draws only the first this-many figure seeds of each type. */
  readonly poolSize?: number;
  /** How bloodied a live body is drawn, 0 to 1; gore.ts's woundSeverity unless gore shares its per-frame value. */
  readonly bloodiness?: (actor: Actor) => number;
  /** A death burst bones away (the acid sac) at this glow-anchor position in metres, for the splash. */
  readonly onBurst?: (position: Vec3, actor: Actor) => void;
}

/** Where a live actor's body anchors were drawn this frame, in metres, for presentation that follows them. */
export interface DrawnAnchors {
  readonly actor: Actor;
  readonly glow: Vec3 | undefined;
  readonly mouth: Vec3 | undefined;
}

const gazeAtRest = (state: LookAtState): boolean =>
  state.every((value, index) => Math.abs(value - LOOK_AT_REST[index]!) < 1e-6);

const sameStamp = (a: readonly (number | string)[], b: readonly (number | string)[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/** The simulation only appends to `actor.severed`, so the list and its length identify what it hides. */
interface SeveredBones {
  readonly parts: readonly string[];
  readonly count: number;
  readonly indices: ReadonlySet<number>;
}

/** Everything a skeleton row packs besides its bone transforms. */
interface RowInputs {
  readonly placement: CrowdPlacement;
  readonly severedIndices: ReadonlySet<number>;
  readonly bloodiness: number;
  readonly charge: number;
}

const sameRow = (a: RowInputs, b: RowInputs): boolean =>
  a.placement.x === b.placement.x &&
  a.placement.y === b.placement.y &&
  a.placement.z === b.placement.z &&
  a.placement.yawRad === b.placement.yawRad &&
  a.severedIndices === b.severedIndices &&
  a.bloodiness === b.bloodiness &&
  a.charge === b.charge;

/** The sac's emission multiplier: idle at rest, rising to charged across the spit wind-up. */
const acidCharge = (actor: Actor): number => {
  const body = actor.type.acidBody;
  if (!body) {
    return 1;
  }
  return body.charge.idle + (body.charge.charged - body.charge.idle) * acidSpitWindupProgress(actor);
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

interface DrawnActorType {
  readonly id: string;
  readonly model: string;
  readonly bodyScale?: number | undefined;
  readonly figureSeeds?: readonly number[] | undefined;
  readonly carving?: { readonly interiorColor: string } | undefined;
}

/** The figure seeds drawn for `type` in authored order, the first `poolSize` of them; the fused-mass seed is fixed. */
const drawnSeeds = (type: DrawnActorType, poolSize: number | undefined): readonly number[] => {
  const seeds = type.model === 'fused-mass' ? [FUSED_MASS_FIGURE_SEED] : (type.figureSeeds ?? []);
  if (seeds.length === 0) {
    throw new Error(`MobActorMeshes requires authored figureSeeds for actor type ${type.id}`);
  }
  return poolSize === undefined ? seeds : seeds.slice(0, Math.max(1, poolSize));
};

/** Each severable part's rigid body, from its share of the body's mass and its bones' voxels. */
const rigidPartsOf = (
  body: ActorBody,
  bones: readonly Bone[],
  severedRoots: ReadonlyMap<string, string>,
  boneIndexById: ReadonlyMap<string, number>,
): ReadonlyMap<string, RigidPart> => {
  const parts = severedRoots.size > 0 ? [...severedRoots.keys()] : severableParts(bones);
  const { scale } = body;
  return new Map(
    parts.map((part) => {
      const boneIndices = [...severedBoneSet(bones, [severedRoots.get(part) ?? part])].map(
        (boneId) => boneIndexById.get(boneId)!,
      );
      const properties = bodyPartMass(body, part, boneIndices);
      const bounds = voxelBounds(boneVoxelCentres(body, boneIndices), body.voxelSize, properties.center);
      return [
        part,
        {
          mass: properties.mass,
          inertiaBody: properties.inertia.map((row) =>
            row.map((value) => value * scale ** 2),
          ) as unknown as RigidPart['inertiaBody'],
          corners: bounds.corners.map((corner) => corner.map((value) => value * scale) as Vec3),
          boneIndices,
        },
      ];
    }),
  );
};

const copyScaledTransform = (source: Transform, target: MutableTransform, scale: number): void => {
  for (let i = 0; i < 9; i++) {
    target.r[i] = source.r[i]! * scale;
  }
  for (let i = 0; i < 3; i++) {
    target.t[i] = source.t[i]! * scale;
  }
};

const scaleTransformsInPlace = (transforms: readonly MutableTransform[], scale: number): void => {
  for (const transform of transforms) {
    for (let i = 0; i < 9; i++) {
      transform.r[i] = transform.r[i]! * scale;
    }
    for (let i = 0; i < 3; i++) {
      transform.t[i] = transform.t[i]! * scale;
    }
  }
};

/** The farthest a drawn vertex can sit from the translation of the packed bone matrix that poses it:
 * the crowd shader applies each vertex exactly one packed matrix (render/crowd.ts,
 * CROWD_BEGIN_VERTEX), whose rotation is the bind vertex's rotation scaled by the body's scale —
 * every packing path maintains that — so the vertex's distance from that translation is at most its
 * bind-space norm times that scale: the bind sphere centre's distance from the origin plus its
 * radius. The diameter alone is not that norm — bind geometry can sit offset from its origin, and
 * its far side then reaches past the diameter. Model units. */
const bindReachOf = (geometry: BufferGeometry): number => {
  const sphere = geometry.boundingSphere;
  return sphere ? sphere.center.length() + sphere.radius : 2;
};

/**
 * Builds a variant's selection-only shadow twin (see the module header): the crowd geometry's vertex
 * buffers with the twin's own crowd slots, identity instance matrices, and the crowd's materials — on
 * SHADOW_CROWD_LAYER so no main view draws it. `geometry` must have its bounding sphere computed.
 */
const shadowCrowdTwin = (
  geometry: BufferGeometry,
  material: Material,
  depthMaterial: Material,
  capacity: number,
): ShadowPassTwin => {
  const shadowSlotAttr = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  const shadowGeometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    shadowGeometry.setAttribute(name, attribute);
  }
  shadowGeometry.setIndex(geometry.index);
  shadowGeometry.setAttribute('crowdSlot', shadowSlotAttr);
  shadowGeometry.boundingBox = geometry.boundingBox;
  shadowGeometry.boundingSphere = geometry.boundingSphere;
  const shadowMesh = new InstancedMesh(shadowGeometry, material, capacity);
  shadowMesh.customDepthMaterial = depthMaterial;
  shadowMesh.castShadow = true;
  shadowMesh.frustumCulled = false; // instances are bone-placed, like the crowd mesh's (module header)
  shadowMesh.count = 0;
  const shadowInstances = shadowMesh.instanceMatrix.array as Float32Array;
  for (let k = 0; k < capacity; k++) {
    shadowInstances[k * 16] = 1;
    shadowInstances[k * 16 + 5] = 1;
    shadowInstances[k * 16 + 10] = 1;
    shadowInstances[k * 16 + 15] = 1;
  }
  shadowMesh.instanceMatrix.needsUpdate = true;
  shadowMesh.layers.set(SHADOW_CROWD_LAYER);
  shadowMesh.visible = false; // only the pass that just selected this twin draws it
  return { mesh: shadowMesh, slots: shadowSlotAttr };
};

/**
 * The crowd's colour and shadow materials over the shared bone texture; with `cells`, they also hide the carved
 * cells that mask holds. The shadow pass draws with a depth material, which would leave every actor in its bind
 * pose: this one fetches the same bone matrices (the gore varying it declares is simply unused).
 */
const crowdMaterials = (
  texture: DataTexture,
  layout: CrowdTextureLayout,
  cells?: { readonly texture: DataTexture; readonly slotBase: number; readonly rowsPerSlot: number },
): { material: MeshLambertMaterial; depthMaterial: MeshDepthMaterial } => {
  const declarations = cells
    ? `${CROWD_VERTEX_DECLARATIONS}\n${CROWD_CELL_VERTEX_DECLARATIONS}`
    : CROWD_VERTEX_DECLARATIONS;
  const beginVertex = cells ? `${CROWD_BEGIN_VERTEX}\n${CROWD_CELL_BEGIN_VERTEX}` : CROWD_BEGIN_VERTEX;
  const key = cells ? 'skelly-mob-actor-crowd-cells' : 'skelly-mob-actor-crowd-texture';
  const uniforms = (shader: { uniforms: Record<string, { value: unknown }> }): void => {
    shader.uniforms.crowdBoneTexture = { value: texture };
    shader.uniforms.crowdBonesPerSlot = { value: layout.bonesPerSlot };
    if (cells) {
      shader.uniforms.crowdCellTexture = { value: cells.texture };
      shader.uniforms.crowdCellSlotBase = { value: cells.slotBase };
      shader.uniforms.crowdCellRowsPerSlot = { value: cells.rowsPerSlot };
    }
  };
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = (shader) => {
    uniforms(shader);
    patchHeightFog(shader, 'mob');
    shader.vertexShader = `${declarations}\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', beginVertex)
      .replace('#include <beginnormal_vertex>', CROWD_BEGINNORMAL_VERTEX);
    shader.fragmentShader =
      `${CROWD_FRAGMENT_DECLARATIONS}\n${BLOOD_STAIN_FRAGMENT_DECLARATIONS}\n${shader.fragmentShader}`
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>\n${CROWD_COLOR_FRAGMENT}\n${BLOOD_STAIN_COLOR_FRAGMENT}`,
        )
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${CROWD_EMISSIVE_FRAGMENT}`);
  };
  const depthMaterial = new MeshDepthMaterial();
  depthMaterial.customProgramCacheKey = () => `${key}-depth`;
  depthMaterial.onBeforeCompile = (shader) => {
    uniforms(shader);
    shader.vertexShader = `${declarations}\n${shader.vertexShader}`.replace('#include <begin_vertex>', beginVertex);
  };
  return { material, depthMaterial };
};

/** Draws actors as their built figures, one shared bone-matrix texture and one InstancedMesh per variant
 * — see this module's own header comment for the whole design and its one documented simplification. */
export class MobActorMeshes implements ActorRenderer {
  readonly group = new Group();
  private readonly blockSize: number;
  private readonly poseScene: ActorPoseScene;
  private readonly reveal: ColumnReveal | undefined;
  private readonly capacity: number;
  private readonly variants: readonly Variant[];
  /** Figure key (`actorFigureKey`) -> the variant drawing that figure. */
  private readonly variantIndexByFigure: ReadonlyMap<string, number>;
  private readonly layout: CrowdTextureLayout;
  private readonly textureData: Float32Array;
  private readonly texture: DataTexture;
  private readonly textureUpdates: PoseTextureUpdates;
  private readonly material: MeshLambertMaterial;
  private readonly states = new Map<EntityId, ActorRenderState>();
  private readonly corpses = new Map<EntityId, Corpse>();
  private readonly tentacles = new Map<EntityId, TentacleMeshes>();
  private readonly tentacleGeometry: CylinderGeometry | undefined;
  private readonly tentacleTipGeometry: SphereGeometry | undefined;
  private readonly tentacleMaterial: MeshLambertMaterial | undefined;
  private readonly tentacleUp = new Vector3(0, 1, 0);
  private readonly tentacleDirection = new Vector3();
  private readonly debris = new Map<string, Debris>();
  /** The fused mass's hole-wall flesh, in the renderer's working colour space; none without carving. */
  private readonly flesh: Color | undefined;
  /** One bone-texture row past every variant's, left all zero: an instance pointed at it collapses unseen. */
  private readonly hiddenRow: number;
  private readonly depthMaterial: MeshDepthMaterial;
  private readonly bloodiness: (actor: Actor) => number;
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
  private ragdolls: RagdollWorld | undefined;

  private readonly options: MobActorMeshesOptions;

  constructor(blockSize: number, requestedCapacity: number | undefined, options: MobActorMeshesOptions) {
    this.options = options;
    const capacity = requestedCapacity ?? DEFAULT_CAPACITY;
    this.blockSize = blockSize;
    this.poseScene = { blockSize, actorFigureFiles: options.actorFigureFiles };
    this.reveal = options.reveal;
    this.capacity = capacity;
    const fusedMassType = fusedMassTypeOf(options.actors);
    const interiorColor = fusedMassType?.carving?.interiorColor;
    this.flesh = interiorColor === undefined ? undefined : new Color(interiorColor);
    this.tentacleGeometry = fusedMassType ? new CylinderGeometry(0.08, 0.22, 1, 8) : undefined;
    this.tentacleTipGeometry = fusedMassType ? new SphereGeometry(0.16, 8, 6) : undefined;
    this.tentacleMaterial = fusedMassType
      ? new MeshLambertMaterial({ color: 0xb9_4c_3e, emissive: 0x2c_0b_08 })
      : undefined;
    const t0 = performance.now();
    const built = figureVariants(
      [...options.actors.values()].flatMap((type) =>
        drawnSeeds(type, options.poolSize).map((seed) => ({
          key: actorFigureKey(type.id, seed),
          type,
          figure: actorFigure(options.actorFigureFiles, type, seed),
        })),
      ),
    );
    const buildMs = performance.now() - t0;
    // biome-ignore lint/suspicious/noConsole: a one-time, useful-to-see startup cost, not per-frame noise.
    console.info(`MobActorMeshes: built ${built.length} actor figure variants in ${buildMs.toFixed(1)} ms`);

    const bonesPerSlot = Math.max(1, ...built.map((v) => v.figure.body.bones.length));
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

    const materials = crowdMaterials(this.texture, this.layout);
    this.material = materials.material;
    this.depthMaterial = materials.depthMaterial;
    this.bloodiness = options.bloodiness ?? woundSeverity;

    this.variants = built.map(({ figure: { body, clips, fusedMass }, geometry }, variantIndex) => {
      const cells = geometry.hasAttribute('cellIndex')
        ? this.variantCells(body, fusedMass?.grid, variantIndex * capacity)
        : undefined;
      const mesh = new InstancedMesh(geometry, cells?.material ?? this.material, capacity);
      mesh.customDepthMaterial = cells?.depthMaterial ?? this.depthMaterial;
      castsAndReceives(mesh);
      mesh.count = 0;
      mesh.frustumCulled = false; // see this module's header comment
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
      mesh.castShadow = false; // the passes draw the twin's selected instances instead
      geometry.computeBoundingSphere();
      // three.js would otherwise draw every instance of the un-cullable crowd into every shadow map.
      // Slot 0 exists from construction; reserveShadowSlots grows the rest before the first render.
      const shadowPasses: ShadowPassTwin[] = [this.addShadowPass(geometry, cells)];

      const freeLocalSlots: number[] = [];
      for (let k = capacity - 1; k >= 0; k--) {
        freeLocalSlots.push(k);
      }
      const bones = bodySkeleton(body);
      const boneIndexById = new Map(bones.map((bone, index) => [bone.id, index]));
      const severedRoots = new Map(
        (body.manifest?.parts ?? []).filter((part) => part.severable).map((part) => [part.id, part.rootBone]),
      );
      const headPart = body.severableParts?.head?.[0];
      return {
        body,
        clips,
        bones,
        scale: body.scale,
        gaze: body.lookAt && headPart !== undefined ? { profile: body.lookAt, headPart } : undefined,
        cells,
        rigidParts: rigidPartsOf(body, bones, severedRoots, boneIndexById),
        severedRoots,
        burstIndices: body.burstBones.map((id) => boneIndexById.get(id)!),
        parentIndex: indexBonesByParent(bones),
        boneIndexById,
        geometry,
        mesh,
        crowdSlotAttr,
        shadowPasses,
        casterReach: bindReachOf(geometry) * body.scale + 0.3,
        scratch: allocateBoneTransforms(bones.length),
        freeLocalSlots,
        liveIds: [],
        idToInstanceIndex: new Map(),
      } satisfies Variant;
    });
    this.variantIndexByFigure = new Map(built.flatMap(({ keys }, index) => keys.map((key) => [key, index])));
  }

  async whenCorpsesReady(): Promise<void> {
    await this.ragdolls?.ready;
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
    actor: Actor,
    state: ActorRenderState,
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
      label.className = 'actor-perception-label';
      label.dataset.actorId = String(id);
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
    const perception = perceptionLabelFor(actor, this.hasRecentNearStimulus(state, actor), this.playerEyePosition, {
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

  /** Whether `id` currently has a drawn instance (a slot) — true for a live actor *or* a corpse still
   * lying/sinking. False for an id the sim knows about but this renderer hasn't (yet, or ever, if its
   * variant is at capacity) assigned one — see this module's header comment on the overflow behaviour.
   * Exported for test/mobActors.test.ts; play.ts has no use for it. */
  isTracked(id: EntityId): boolean {
    return this.states.has(id) || this.corpses.has(id);
  }

  /** Test-only: `boneId`'s *rotation* submatrix (row-major, the Mat3 convention of
   * packages/engine/src/core/boneMath.ts) as currently packed in the shared texture for `id` (a live actor or a corpse) —
   * the world rotation, not just this bone's own local pose delta, but since an actor facing along +Z has
   * yaw 0 (packCrowdBoneMatrix contributes no extra rotation at yaw 0 — see its own comment), comparing this
   * against IDENTITY_M is exactly "did any pose ever rotate this bone or one of its ancestors" —
   * used to assert the old bind/A-pose (every bone left at its raw rest orientation) never reappears.
   * Undefined for an unknown id/boneId, or for a bone this actor/corpse has severed (reads as the zero
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
   * live actor or a corpse), is the all-zero matrix a severed bone is packed as (see packZeroBone). False
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
   * for a live actor needing a slot there, or a new corpse/debris exceeding the shared corpse budget. Scans both Maps
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

  /** The oldest corpse or limb gives up the shared presentation budget. */
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

  private addActor(id: EntityId, actor: Actor): ActorRenderState | undefined {
    const variantIndex = this.variantIndexByFigure.get(actorFigureKey(actor.type.id, actor.figureSeed));
    if (variantIndex === undefined) {
      return undefined;
    }
    const variant = this.variants[variantIndex]!;
    if (variant.freeLocalSlots.length === 0) {
      // Corpses and debris count toward capacity (see this module's header comment): make room by dropping
      // this variant's own oldest dead thing before giving up on a live actor.
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
    const state: ActorRenderState = {
      id,
      lookAtState: LOOK_AT_REST,
      previousPerceptionSimSeconds: undefined,
      perceptionSimSeconds: undefined,
      variantIndex,
      localSlot,
      globalRow,
      instanceIndex,
      crawling: actorCrawls(actor, variant.body),
      lastPose: undefined,
      bodyTransforms: allocateBoneTransforms(variant.bones.length),
      lastPlacement: undefined,
      poseStamp: undefined,
      severed: undefined,
      row: undefined,
      actor: undefined,
      lastSeenFrame: this.frameCounter,
    };
    this.states.set(id, state);
    if (variant.body.bodyPlan === 'fused-mass') {
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

  private updateTentacle(state: ActorRenderState, actor: Actor, placement: { worldPos: Vec3; yaw: number }): void {
    const meshes = this.tentacles.get(state.id);
    if (!meshes) {
      return;
    }
    const { lastPose } = state;
    const variant = this.variants[state.variantIndex]!;
    const target = this.playerChestPosition;
    const reachMetres = actorAttackReachMetres(actor, variant.body);
    if (!target || reachMetres <= 0 || !lastPose) {
      meshes.shaft.visible = false;
      meshes.tip.visible = false;
      return;
    }
    const { manifest, coreInteriorPoint } = variant.body;
    if (!(manifest && coreInteriorPoint)) {
      throw new Error('Fused-mass tentacle requires the fused-mass figure');
    }
    const transforms = boneTransforms(variant.bones, lastPose);
    const partRoots = new Map(manifest.parts.map((part) => [part.id, part.rootBone]));
    const hidden = severedBoneSet(
      variant.bones,
      actor.severed.map((part) => partRoots.get(part) ?? part),
    );
    const start = fusedMassCoreInteriorAnchor({
      figure: { coreInteriorPoint, scale: variant.scale },
      transforms,
      hidden,
      yaw: rotY((placement.yaw * 180) / Math.PI),
      position: placement.worldPos,
    });
    const facing: Vec3 = [Math.sin(placement.yaw), 0, Math.cos(placement.yaw)];
    const pose = fusedMassTentaclePose({
      start,
      target,
      facing,
      reachMetres,
      attackWindupSimSeconds: actor.attackWindup,
      attackWindupDurationSimSeconds: actor.type.attack?.windupSimSeconds ?? 0,
      attackWaitSimSeconds: actor.attackWait,
      attackCooldownDurationSimSeconds: actor.type.attack?.cooldownSimSeconds ?? 0,
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

  /** Releases `entry`'s row/instance back to its variant, swap-compacting whichever key (a live actor, a
   * corpse, or a piece of debris — all three share the same dense liveIds/instanceIndex bookkeeping) was
   * drawn last into the now-vacated slot. Shared by removeActor (a plain vanish), freeCorpse and
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
      variant.crowdSlotAttr.setX(entry.instanceIndex, moved.globalRow);
    }
    this.packCells(entry, []);
    variant.liveIds.pop();
    variant.idToInstanceIndex.delete(key);
    variant.freeLocalSlots.push(entry.localSlot);
    variant.mesh.count = variant.liveIds.length;
    variant.crowdSlotAttr.needsUpdate = true;
  }

  /** The carved-cell mask of a variant whose mesh carries cell indices, over its block of slots from `slotBase`. */
  private variantCells(body: ActorBody, grid: FusedMassGrid | undefined, slotBase: number): VariantCells {
    if (grid === undefined) {
      throw new Error(`Actor figure ${body.type}.${body.seed} carries cell indices but no fused-mass grid`);
    }
    const layout = crowdCellMaskLayout(grid.owner.length, this.capacity);
    const data = new Float32Array(layout.width * layout.height);
    const texture = new DataTexture(data, layout.width, layout.height, RedFormat, FloatType);
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return {
      layout,
      data,
      texture,
      ...crowdMaterials(this.texture, this.layout, { texture, slotBase, rowsPerSlot: layout.rowsPerSlot }),
      packed: new Array<number>(this.capacity).fill(0),
      grid,
      slotBase,
      carved: new Array<readonly number[]>(this.capacity).fill([]),
      walls: new Array<Mesh | undefined>(this.capacity).fill(undefined),
    };
  }

  /** Writes `carved` into the holder's cell-mask row when it differs from what the row holds. */
  private packCells(holder: SlotHolder, carved: readonly number[]): void {
    const { cells } = this.variants[holder.variantIndex]!;
    if (!cells || cells.packed[holder.localSlot] === carved.length) {
      return;
    }
    packCellMask(cells.data, cells.layout, holder.localSlot, carved);
    cells.packed[holder.localSlot] = carved.length;
    cells.texture.needsUpdate = true;
    this.buildWalls(cells, holder.localSlot, carved);
  }

  /** A severed piece keeps the holes its body had at the cut, walls included. */
  private copyCells(variant: Variant, from: number, to: number): void {
    const { cells } = variant;
    if (!cells || from === to) {
      return;
    }
    const span = cells.layout.rowsPerSlot * cells.layout.width;
    cells.data.copyWithin(to * span, from * span, (from + 1) * span);
    cells.packed[to] = cells.packed[from]!;
    cells.texture.needsUpdate = true;
    this.buildWalls(cells, to, cells.carved[from]!);
  }

  /** Replaces a slot's hole walls with those of `carved`; an empty list only frees them. */
  private buildWalls(cells: VariantCells, localSlot: number, carved: readonly number[]): void {
    cells.carved[localSlot] = carved;
    const previous = cells.walls[localSlot];
    if (previous) {
      this.group.remove(previous);
      previous.geometry.dispose();
      cells.walls[localSlot] = undefined;
    }
    const geometry = this.flesh && holeWallGeometry(cells.grid, carved, this.flesh, cells.slotBase + localSlot);
    if (!geometry) {
      return;
    }
    const mesh = new Mesh(geometry, cells.material);
    mesh.customDepthMaterial = cells.depthMaterial;
    castsAndReceives(mesh);
    // Its vertices are placed by the bone texture, like the crowd mesh's, so its own bounds mean nothing.
    mesh.frustumCulled = false;
    this.group.add(mesh);
    cells.walls[localSlot] = mesh;
  }

  /** Called when a hit knocks flesh out of a fused-mass body (packages/engine/src/core/actorSystem.ts's onCarve, forwarded by play.ts):
   * hides the carved cells, a corpse's too, since the shot that kills it carves after its death. */
  actorCarved(id: EntityId, actor: Actor): void {
    const holder = this.states.get(id) ?? this.corpses.get(id);
    if (holder) {
      this.packCells(holder, actor.carved);
    }
  }

  /** A plain vanish (despawn/unload) — not a death; see this module's header comment and actorDied. */
  private removeActor(id: EntityId, state: ActorRenderState): void {
    this.removePerceptionLabel(id);
    this.removeTentacle(id);
    this.releaseCrawlFall(state);
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
    if (corpse.ragdoll) {
      this.ragdolls?.remove(corpse.ragdoll);
    }
    this.freeSlot(id, corpse);
    this.corpses.delete(id);
  }

  private freeDebris(key: string): void {
    const d = this.debris.get(key);
    if (!d) {
      return;
    }
    this.ragdolls?.remove(d.physics);
    this.freeSlot(key, d);
    this.debris.delete(key);
  }

  /** A torso-destroyed actor remains in the store, so its fallen row stays while it lies there: no sink/despawn
   * and no corpse-budget eviction until it dies (see finishDownedCorpse). A death corpse is render-only with the
   * finite lifecycle below. */
  actorIncapacitated(id: EntityId, actor: Actor): void {
    const state = this.states.get(id);
    this.removePerceptionLabel(id);
    if (!state || this.corpses.has(id)) {
      return;
    }
    const worldPos: Vec3 = [
      actor.body.pos[0] * this.blockSize,
      actor.body.pos[1] * this.blockSize,
      actor.body.pos[2] * this.blockSize,
    ];
    this.releaseCrawlFall(state);
    const basePose = this.posedFrame(state, actor, this.currentRenderPlacement(actor), { dt: 0 }).pose;
    this.corpses.set(id, {
      incapacitated: true,
      variantIndex: state.variantIndex,
      localSlot: state.localSlot,
      globalRow: state.globalRow,
      instanceIndex: state.instanceIndex,
      basePose,
      worldPos,
      yaw: Math.atan2(actor.facing[0], actor.facing[2]),
      direction: fallDirectionAwayFromPlayer(actor.facing, actor.body.pos, undefined),
      launch: this.hitDirections.get(id),
      poseSeed: id ^ actor.figureSeed,
      severed: [...actor.severed],
      bloodiness: woundSeverity(actor),
      charge: acidCharge(actor),
      elapsed: 0,
      insertOrder: this.takeDeadOrder(),
    });
    this.startRagdoll(this.corpses.get(id)!);
    this.states.delete(id);
  }

  /**
   * Called once for every death (packages/engine/src/core/actorSystem.ts's onDeath, forwarded by play.ts) — the sim removes
   * the actor from its store in the very same call, before or after this frame's sync() runs either way
   * (see this module's header comment on why that ordering is safe): this method moves `id` out of
   * `this.states` (the live map) into `this.corpses` *immediately and synchronously*, so sync()'s prune
   * loop — which only ever looks at `this.states` — never sees `id` at all once it's died, whichever order
   * sync() and this run in. A corpse keeps its existing slot/variant/instance untouched (still drawn every
   * frame, see packCorpse) until its content-authored lifetime frees it the same way a plain vanish
   * would. No-ops for an id this renderer was never drawing (e.g. its variant was already full).
   */
  actorDied(id: EntityId, actor: Actor, playerPos?: Vec3): void {
    this.removePerceptionLabel(id);
    this.removeTentacle(id);
    if (this.options.maxCorpses === 0) {
      this.freeCorpse(id);
      const state = this.states.get(id);
      if (state) {
        this.removeActor(id, state);
      }
      return;
    }
    if (this.corpses.get(id)?.incapacitated) {
      this.finishDownedCorpse(id, actor);
      return;
    }
    const state = this.states.get(id);
    if (!state) {
      return;
    }
    // `id` deliberately stays in this.states until the very end: a global-cap eviction below can swap-
    // compact the *dying* actor's own instance into the vacated slot (if it happens to be the one
    // currently last in its variant's liveIds) — freeSlot's lookup must still find it as a SlotHolder,
    // which this.states (not yet deleted) still provides, exactly as it did before this death.
    if (this.evictableDeadThingCount() >= this.options.maxCorpses) {
      this.evictOldestDeadThingGlobally();
    }
    const worldPos: Vec3 = [
      actor.body.pos[0] * this.blockSize,
      actor.body.pos[1] * this.blockSize,
      actor.body.pos[2] * this.blockSize,
    ];
    this.releaseCrawlFall(state);
    const posed = this.posedFrame(state, actor, this.currentRenderPlacement(actor), { dt: 0 });
    const basePose = posed.pose;
    this.burst(this.variants[state.variantIndex]!, posed.transforms, posed.placement, actor);
    this.corpses.set(id, {
      incapacitated: false,
      variantIndex: state.variantIndex,
      localSlot: state.localSlot,
      globalRow: state.globalRow,
      instanceIndex: state.instanceIndex,
      basePose,
      worldPos,
      yaw: Math.atan2(actor.facing[0], actor.facing[2]),
      direction: fallDirectionAwayFromPlayer(actor.facing, actor.body.pos, playerPos),
      launch: this.hitDirections.get(id),
      poseSeed: id ^ actor.figureSeed,
      severed: [...actor.severed],
      bloodiness: woundSeverity(actor),
      charge: acidCharge(actor),
      elapsed: 0,
      insertOrder: this.takeDeadOrder(),
    });
    this.startRagdoll(this.corpses.get(id)!);
    this.states.delete(id);
  }

  private readonly hitDirections = new Map<EntityId, Vec3>();

  actorWounded(id: EntityId, hit: HitImpulse): void {
    const direction: Vec3 = [...hit.direction];
    this.hitDirections.set(id, direction);
    const state = this.states.get(id);
    if (state) {
      state.fallHit = direction;
    }
    queueMicrotask(() => {
      if (this.hitDirections.get(id) === direction) {
        this.hitDirections.delete(id);
      }
    });
  }

  private startRagdoll(corpse: Corpse): void {
    if (this.ragdolls?.failed) {
      return;
    }
    const variant = this.variants[corpse.variantIndex]!;
    if (this.options.ragdoll.models.includes(variant.body.model)) {
      this.ragdolls ??= new RagdollWorld(this.options.gravityMetresPerSimSecondSquared, this.options.ragdoll);
      corpse.ragdoll = this.ragdolls.spawn({
        body: variant.body,
        model: variant.body.model,
        pose: corpse.basePose,
        position: corpse.worldPos,
        yaw: corpse.yaw,
        direction: corpse.direction,
        seed: this.options.ragdollSeed ?? corpse.poseSeed,
        scale: variant.scale,
        ground: this.rigidWorld(),
        excluded: new Set(this.indicesFor(variant, severedBoneIds(variant, corpse.severed))),
        ...(corpse.launch ? { launch: corpse.launch } : {}),
        ...(corpse.incapacitated
          ? { reach: Math.min(this.options.handlingReachMetres, this.options.ragdoll.downedDriftMetres) }
          : {}),
      });
    }
  }

  /** Reports where a dying body's burst bones (the acid sac) were, for the splash. */
  private burst(
    variant: Variant,
    transforms: ReadonlyMap<string, Transform>,
    placement: CrowdPlacement,
    actor: Actor,
  ): void {
    const glow = variant.body.anchors?.glow;
    if (variant.burstIndices.length > 0 && glow && this.options.onBurst) {
      this.options.onBurst(anchorWorld(transforms, glow, placement, variant.scale), actor);
    }
  }

  /** A downed body that dies (finished off or dismembered) becomes an ordinary corpse where it lies: it keeps its
   * fallen pose and slot, shows the parts cut since it fell, then lies and sinks like any other corpse. */
  private finishDownedCorpse(id: EntityId, actor: Actor): void {
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
    if (!downed.ragdoll) {
      this.burst(variant, boneTransforms(variant.bones, this.corpsePose(downed, variant)), placement, actor);
    }
    const corpse: Corpse = {
      ...this.corpses.get(id)!,
      incapacitated: false,
      severed: [...actor.severed],
      bloodiness: woundSeverity(actor),
      insertOrder: this.takeDeadOrder(),
    };
    if (corpse.ragdoll) {
      this.ragdolls?.sever(
        corpse.ragdoll,
        variant.body,
        new Set(this.indicesFor(variant, severedBoneIds(variant, corpse.severed))),
        variant.scale,
      );
      corpse.elapsed = 0;
      if (corpse.ragdoll.settled) {
        corpse.groundedAt = 0;
      }
    } else {
      corpse.elapsed = 0;
    }
    this.corpses.set(id, corpse);
  }

  /**
   * Called once for every part severed (packages/engine/src/core/actorSystem.ts's onSever, forwarded by play.ts) — spawns one
   * piece of flying debris in the *same* actor's variant (see this module's header comment). No-ops for an
   * id this renderer isn't tracking as a live actor (over capacity, or — per packages/engine/src/core/actorSystem.ts's swing,
   * which calls onSever before onDeath on the same hit — already dead this exact hit is impossible, since
   * actorDied hasn't run yet; but a stale/unknown part name, or no position yet on the actor's very first
   * frame, are both defensively handled the same way: nothing to spawn from). Debris counts toward
   * the shared corpse budget exactly like a corpse (see actorDied's own eviction).
   * Returns the piece's launch velocity (metres per real second), which the cut's blood inherits; undefined when
   * no piece was spawned.
   */
  actorSevered(id: EntityId, part: string, hit?: HitImpulse, actor?: Actor): Vec3 | undefined {
    const state = this.states.get(id);
    if (!state) {
      return this.severDowned(id, part, hit, actor);
    }
    const variant = this.variants[state.variantIndex]!;
    if (actor && !state.drawnFall && !(actorCrawls(actor, variant.body) && !state.crawling && state.lastPose)) {
      this.keepPose(state, variant, this.posedFrame(state, actor, this.currentRenderPlacement(actor)));
    }
    if (!(state.lastPose && state.lastPlacement)) {
      return undefined;
    }
    const partData = variant.rigidParts.get(part);
    if (!partData) {
      return undefined;
    }

    const severedIndices = partData.boneIndices;
    const sourceTransforms = this.posedSourceTransforms(variant, state, severedIndices);
    const initialCenter = this.posedPartCenter(variant, sourceTransforms, new Set(severedIndices));
    if (!initialCenter) {
      return undefined;
    }
    const topIndex = variant.boneIndexById.get(variant.severedRoots.get(part) ?? part);
    if (topIndex === undefined) {
      return undefined;
    }
    // The cached OBB and inertia are in the rest-pose model frame. Orient them with the posed cut bone;
    // relative bends in carried descendants (e.g. an elbow in a whole arm) remain an approximation.
    const { scale } = variant;
    const initialOrientation = mat3ToQuat(
      sourceTransforms.get(topIndex)!.r.map((v) => v / scale) as unknown as Transform['r'],
    ) as Quaternion;
    const originOffsetY = 0;
    const simulationCenter: Vec3 = [initialCenter[0], initialCenter[1] - originOffsetY, initialCenter[2]];
    const velocity = actor?.body.vel ?? [0, 0, 0];
    const rigidBody: RigidBody = {
      mass: partData.mass,
      center: simulationCenter,
      orientation: initialOrientation,
      velocity: [velocity[0] * this.blockSize, velocity[1] * this.blockSize, velocity[2] * this.blockSize],
      angularMomentum: [0, 0, 0],
      inertiaBody: partData.inertiaBody,
      corners: partData.corners,
      asleep: false,
    };
    if (hit) {
      this.applyDebrisHit(rigidBody, initialCenter, originOffsetY, hit);
    }
    const launchVelocity: Vec3 = [...rigidBody.velocity];
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
      bloodiness: actor ? woundSeverity(actor) : 0,
    });
    return launchVelocity;
  }

  private severDowned(
    id: EntityId,
    part: string,
    hit: HitImpulse | undefined,
    actor: Actor | undefined,
  ): Vec3 | undefined {
    const corpse = this.corpses.get(id);
    if (!(corpse?.incapacitated && corpse.ragdoll)) {
      return undefined;
    }
    const variant = this.variants[corpse.variantIndex]!;
    const data = variant.rigidParts.get(part);
    if (!data) {
      return undefined;
    }
    const sourceTransforms = new Map<number, MutableTransform>();
    const { scale } = variant;
    for (const index of data.boneIndices) {
      const source = corpse.ragdoll.transforms.get(index)!;
      sourceTransforms.set(index, {
        r: source.r.map((value) => value * scale) as MutableTransform['r'],
        t: [...source.t],
      });
    }
    const root = corpse.ragdoll.transforms.get(data.boneIndices[0]!)!;
    const bounds = voxelBounds(boneVoxelCentres(variant.body, data.boneIndices), variant.body.voxelSize);
    const initialCenter = applyPoint(root, bounds.center.map((value) => value * scale) as Vec3) as Vec3;
    const initialOrientation = mat3ToQuat(root.r) as Quaternion;
    const body: RigidBody = {
      mass: data.mass,
      center: [...initialCenter],
      orientation: initialOrientation,
      velocity: [0, 0, 0],
      angularMomentum: [0, 0, 0],
      inertiaBody: data.inertiaBody,
      corners: data.corners,
      asleep: false,
    };
    if (hit) {
      this.applyDebrisHit(body, initialCenter, 0, hit);
    }
    this.insertDebris({
      id,
      part,
      state: corpse,
      variant,
      severedIndices: data.boneIndices,
      sourceTransforms,
      initialCenter,
      initialOrientation,
      originOffsetY: 0,
      body,
      bloodiness: actor ? woundSeverity(actor) : corpse.bloodiness,
    });
    this.ragdolls?.sever(corpse.ragdoll, variant.body, new Set(data.boneIndices), scale);
    this.corpses.set(id, { ...corpse, severed: actor ? [...actor.severed] : [...corpse.severed, part] });
    return [...body.velocity];
  }

  private posedSourceTransforms(
    variant: Variant,
    state: ActorRenderState,
    indices: readonly number[],
  ): Map<number, MutableTransform> {
    if (state.drawnFall) {
      // drawnFall already carries the body's scale (packCrawlFall packs it scaled), so copy as is.
      return new Map(
        indices.map((index) => {
          const source = state.drawnFall!.get(index)!;
          return [index, { r: [...source.r] as MutableTransform['r'], t: [...source.t] as Vec3 }];
        }),
      );
    }
    boneTransformsInto(variant.bones, state.lastPose!, variant.parentIndex, variant.scratch);
    const yawMatrix = rotY((state.lastPlacement!.yawRad * 180) / Math.PI);
    const { x, y, z } = state.lastPlacement!;
    const transforms = new Map<number, MutableTransform>();
    const { scale } = variant;
    for (const index of indices) {
      const source = variant.scratch[index]!;
      const rotated = mulMV(yawMatrix, source.t.map((value) => value * scale) as Vec3);
      transforms.set(index, {
        r: mulMM(yawMatrix, source.r).map((value) => value * scale) as MutableTransform['r'],
        t: [rotated[0] + x, rotated[1] + y, rotated[2] + z],
      });
    }
    return transforms;
  }

  /** The rendered pose can bend each carried bone separately; average its voxels in posed world space. */
  private posedPartCenter(
    variant: Variant,
    transforms: ReadonlyMap<number, Transform>,
    selected: ReadonlySet<number>,
  ): Vec3 | undefined {
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    for (const index of selected) {
      const transform = transforms.get(index)!;
      for (const centre of variant.body.bones[index]!.voxels ?? []) {
        const point = applyPoint(transform, centre);
        sumX += point[0];
        sumY += point[1];
        sumZ += point[2];
        count += 1;
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
      dx * hit.impulse * this.options.ragdoll.debris.impulseScale,
      dy * hit.impulse * this.options.ragdoll.debris.impulseScale,
      dz * hit.impulse * this.options.ragdoll.debris.impulseScale,
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
    this.copyCells(variant, state.localSlot, localSlot);
    this.ragdolls ??= new RagdollWorld(this.options.gravityMetresPerSimSecondSquared, this.options.ragdoll);
    this.debris.set(key, {
      physics: this.ragdolls.spawnRigid(body, this.rigidWorld()),
      variantIndex: state.variantIndex,
      localSlot,
      globalRow,
      instanceIndex,
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

  /** Interpolated pos/yaw/headYaw at `blend` between an actor's last two fixed-step poses — exactly
   * ActorMeshes.renderPose's own maths (src/render/actors.ts), duplicated rather than extracted there:
   * that file is left alone on purpose (see this module's header comment). */
  private interpolateRenderPose(actor: Actor, blend: number): { pos: Vec3; yaw: number; headYaw: number } {
    const previous = actor.renderPrevious;
    const pos: Vec3 = [
      previous.pos[0] + (actor.body.pos[0] - previous.pos[0]) * blend,
      previous.pos[1] + (actor.body.pos[1] - previous.pos[1]) * blend,
      previous.pos[2] + (actor.body.pos[2] - previous.pos[2]) * blend,
    ];
    const yawBefore = Math.atan2(previous.facing[0], previous.facing[2]);
    const yawAfter = Math.atan2(actor.facing[0], actor.facing[2]);
    const yawDelta = Math.atan2(Math.sin(yawAfter - yawBefore), Math.cos(yawAfter - yawBefore));
    const yaw = yawBefore + yawDelta * blend;
    const headYaw = previous.headYaw + (actor.headYaw - previous.headYaw) * blend;
    return { pos, yaw, headYaw };
  }

  private currentRenderPlacement(actor: Actor): { position: Vec3; worldPos: Vec3; yaw: number; headYaw: number } {
    const { pos, yaw, headYaw } = this.interpolateRenderPose(actor, this.renderBlend);
    return {
      position: pos,
      worldPos: [pos[0] * this.blockSize, pos[1] * this.blockSize + (actor.stepOffset ?? 0), pos[2] * this.blockSize],
      yaw,
      headYaw,
    };
  }

  /** Translates severedBoneSet's bone ids (body-plan-generic) into this variant's own bone array indices,
   * dropping any id this variant's rig doesn't have. */
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

  /** Packs every bone of `transforms` (scaled, in bone order) at `globalRow`: severed bones get a zero matrix
   * (hidden — see packZeroBone), survivors get their real placed transform. Always (re)packs the severed mask
   * and the bloodiness too, even when nothing is severed or bloodied, so a reused row never goes stale. Shared
   * by packPlaced (a live actor) and packCorpse; packDebris packs its own inverse (only the carried subtree is
   * real) directly, since the two cases share little beyond "call packCrowdBoneMatrix or packZeroBone". */
  private packSkeleton(
    globalRow: number,
    variant: Variant,
    transforms: readonly MutableTransform[],
    { placement, severedIndices, bloodiness, charge }: RowInputs,
  ): void {
    for (let bone = 0; bone < variant.bones.length; bone++) {
      if (severedIndices.has(bone)) {
        this.packZeroBone(globalRow, bone);
      } else {
        packCrowdBoneMatrix(
          this.textureData,
          { layout: this.layout, slot: globalRow, bone },
          transforms[bone]!,
          placement,
        );
      }
    }
    packSeveredMask(this.textureData, this.layout, globalRow, severedIndices);
    packBloodiness(this.textureData, this.layout, globalRow, bloodiness);
    packCharge(this.textureData, this.layout, globalRow, charge);
    this.textureUpdates.touch(globalRow);
  }

  private observePerceptionTime(state: ActorRenderState, actor: Actor): void {
    const { time } = actor.renderPrevious;
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

  private hasRecentNearStimulus(state: ActorRenderState, actor: Actor): boolean {
    if (!actor.agent) {
      return false;
    }
    const { stimulusAt, mode, investigationTier } = actor.agent;
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
    state: ActorRenderState,
    actor: Actor,
    placement: { position: Vec3; worldPos: Vec3; yaw: number; headYaw: number },
    gazeFrame: { readonly dt?: number; readonly presentationSimSeconds?: number } = {},
  ): { pose: Pose; transforms: ReadonlyMap<string, Transform>; placement: CrowdPlacement } {
    const { dt: gazeFrameDelta = 0, presentationSimSeconds = 0 } = gazeFrame;
    const { position, worldPos, yaw, headYaw } = placement;
    const variant = this.variants[state.variantIndex]!;
    const posed = posedActor(
      actorPoseInputFor(actor, state.id, this.poseScene, {
        position,
        facing: [Math.sin(yaw), 0, Math.cos(yaw)],
        headYaw,
      }),
    );
    let { pose, transforms }: { pose: Pose; transforms: ReadonlyMap<string, Transform> } = posed;
    const { gaze } = variant;
    if (gaze && actor.regions.head! > 0 && !actor.severed.includes(gaze.headPart)) {
      const rootRotation = transpose(rotY((yaw * 180) / Math.PI));
      const eye = this.playerEyePosition ?? [this.cameraPosition.x, this.cameraPosition.y, this.cameraPosition.z];
      let target: readonly [number, number, number] | undefined;
      if (actor.agent?.mode === 'chase' && (this.playerEyePosition !== undefined || this.camera)) {
        target = mulMV(rootRotation, [eye[0] - worldPos[0], eye[1] - worldPos[1], eye[2] - worldPos[2]]);
      } else if (this.hasRecentNearStimulus(state, actor) && actor.agent?.lastPerceived) {
        target = hearingGazeTarget(
          mulMV(rootRotation, [
            actor.agent.lastPerceived[0] * this.blockSize - worldPos[0],
            actor.agent.lastPerceived[1] * this.blockSize - worldPos[1],
            actor.agent.lastPerceived[2] * this.blockSize - worldPos[2],
          ]),
          state.id,
          presentationSimSeconds,
          this.options.look.hearingGazeJitter,
        );
      }
      const gazed = lookAtPose({
        bones: variant.bones,
        pose,
        target,
        profile: gaze.profile,
        state: state.lookAtState,
        gazeFrameDelta,
        baseTransforms: transforms,
      });
      state.lookAtState = gazed.state;
      ({ pose, transforms } = gazed);
    } else {
      state.lookAtState = LOOK_AT_REST;
    }
    return {
      pose,
      transforms,
      placement: { x: worldPos[0], y: worldPos[1], z: worldPos[2], yawRad: yaw },
    };
  }

  /** Keeps `posed` as the actor's pose, which neither its stamp nor its packed row describes yet. */
  private keepPose(state: ActorRenderState, variant: Variant, posed: ReturnType<MobActorMeshes['posedFrame']>): void {
    for (let bone = 0; bone < variant.bones.length; bone++) {
      copyScaledTransform(posed.transforms.get(variant.bones[bone]!.id)!, state.bodyTransforms[bone]!, variant.scale);
    }
    state.lastPose = posed.pose;
    state.lastPlacement = posed.placement;
    state.poseStamp = undefined;
    state.row = undefined;
  }

  /** Bone indices `actor.severed` hides (it is the only source of truth), re-expanded only when it grows. */
  private severedIndicesOf(state: ActorRenderState, variant: Variant, actor: Actor): ReadonlySet<number> {
    const { severed } = state;
    if (severed?.parts === actor.severed && severed.count === actor.severed.length) {
      return severed.indices;
    }
    const indices = this.indicesFor(variant, severedBoneIds(variant, actor.severed));
    state.severed = { parts: actor.severed, count: actor.severed.length, indices };
    return indices;
  }

  /** Draws the kept pose at this frame's placement, leaving a row that already holds exactly that untouched. */
  private packPlaced(
    state: ActorRenderState,
    variant: Variant,
    actor: Actor,
    placement: { worldPos: Vec3; yaw: number },
  ): void {
    state.drawnFall = undefined;
    const row: RowInputs = {
      placement: {
        x: placement.worldPos[0],
        y: placement.worldPos[1],
        z: placement.worldPos[2],
        yawRad: placement.yaw,
      },
      severedIndices: this.severedIndicesOf(state, variant, actor),
      bloodiness: this.bloodiness(actor),
      charge: acidCharge(actor),
    };
    state.lastPlacement = row.placement;
    if (state.row && sameRow(state.row, row)) {
      return;
    }
    this.packSkeleton(state.globalRow, variant, state.bodyTransforms, row);
    state.row = row;
  }

  private releaseCrawlFall(state: ActorRenderState): void {
    if (state.crawlFall && !state.crawlFall.released) {
      this.ragdolls?.remove(state.crawlFall.physics);
    }
    state.crawlFall = undefined;
    state.drawnFall = undefined;
  }

  private beginCrawlFall(state: ActorRenderState, variant: Variant, actor: Actor): void {
    const crawling = actorCrawls(actor, variant.body);
    if (crawling && !state.crawling && state.lastPose && state.lastPlacement && !this.ragdolls?.failed) {
      this.ragdolls ??= new RagdollWorld(this.options.gravityMetresPerSimSecondSquared, this.options.ragdoll);
      const placement = state.lastPlacement;
      state.crawlFall = {
        elapsedRealSeconds: 0,
        released: false,
        physics: this.ragdolls.spawn({
          body: variant.body,
          model: variant.body.model,
          pose: state.lastPose,
          position: [placement.x, placement.y, placement.z],
          yaw: placement.yawRad,
          direction: -1,
          seed: this.options.ragdollSeed ?? state.id ^ actor.figureSeed,
          ground: this.rigidWorld(),
          excluded: this.severedIndicesOf(state, variant, actor),
          ...(state.fallHit ? { launch: state.fallHit } : {}),
          motion: this.options.ragdoll.crawlFall.motion,
          motionScale: this.options.ragdoll.crawlFall.motionScale,
        }),
      };
    }
    if (state.crawlFall && !state.crawlFall.released) {
      const excluded = this.severedIndicesOf(state, variant, actor);
      if ([...excluded].some((index) => !state.crawlFall!.physics.excluded.has(index))) {
        this.ragdolls?.sever(state.crawlFall.physics, variant.body, excluded);
      }
    }
    state.crawling = crawling;
    state.fallHit = undefined;
  }

  private packCrawlFall(
    state: ActorRenderState,
    variant: Variant,
    actor: Actor,
    {
      posed,
      severedIndices,
    }: {
      posed: ReturnType<MobActorMeshes['posedFrame']>;
      severedIndices: ReadonlySet<number>;
    },
  ): void {
    const fall = state.crawlFall!;
    const progress = clamp01(
      (fall.elapsedRealSeconds - this.options.ragdoll.crawlFall.fallRealSeconds) /
        this.options.ragdoll.crawlFall.blendRealSeconds,
    );
    const blend = progress * progress * (3 - 2 * progress);
    const yaw = rotY((posed.placement.yawRad * 180) / Math.PI);
    const hidden = new Set(severedIndices);
    const drawn = new Map<number, Transform>();
    state.drawnFall = drawn;
    variant.bones.forEach((bone, index) => {
      const source = fall.physics.transforms.get(index)!;
      const target = posed.transforms.get(bone.id)!;
      // The pose side of the blend is model-space (posedFrame) while the ragdoll side is world-space,
      // and the packed rotation must land at the body's scale like every packing path does
      // (Variant.casterReach bounds a drawn vertex by it): scaling it here also draws a scaled
      // figure's fall at its authored size instead of its bind size.
      const offset = mulMV(yaw, target.t.map((value) => value * variant.scale) as Vec3);
      const translation = [posed.placement.x, posed.placement.y, posed.placement.z];
      const transform: MutableTransform = {
        r: [...quatToMat3(slerpQuat(mat3ToQuat(source.r), mat3ToQuat(mulMM(yaw, target.r)), blend))].map(
          (value) => value * variant.scale,
        ) as MutableTransform['r'],
        t: source.t.map((value, axis) => value + (offset[axis]! + translation[axis]! - value) * blend) as Vec3,
      };
      drawn.set(index, transform);
      if (hidden.has(index)) {
        this.packZeroBone(state.globalRow, index);
        return;
      }
      packCrowdBoneMatrix(this.textureData, { layout: this.layout, slot: state.globalRow, bone: index }, transform, {
        x: 0,
        y: 0,
        z: 0,
        yawRad: 0,
      });
    });
    packSeveredMask(this.textureData, this.layout, state.globalRow, hidden);
    packBloodiness(this.textureData, this.layout, state.globalRow, this.bloodiness(actor));
    packCharge(this.textureData, this.layout, state.globalRow, acidCharge(actor));
    this.textureUpdates.touch(state.globalRow);
  }

  /** Live actors' glow and mouth anchors as last drawn, for the glow light and drips. Presentation only. */
  *anchors(): Iterable<DrawnAnchors> {
    for (const state of this.states.values()) {
      const variant = this.variants[state.variantIndex]!;
      const { anchors } = variant.body;
      const { actor } = state;
      if (!((anchors?.glow || anchors?.mouth) && state.lastPose && state.lastPlacement && actor)) {
        continue;
      }
      const transforms = state.drawnFall
        ? new Map(variant.bones.map((bone, index) => [bone.id, state.drawnFall!.get(index)!]))
        : boneTransforms(variant.bones, state.lastPose);
      // drawnFall transforms are world-space already (packCrawlFall packs them scaled and placed), so
      // an anchor needs only their point; the pose branch still converts model space — yaw, scale,
      // placement (anchorWorld).
      const at = (anchor: BodyAnchor | undefined): Vec3 | undefined => {
        if (!anchor) {
          return undefined;
        }
        if (state.drawnFall) {
          const world = applyPoint(transforms.get(anchor.bone)!, anchor.position);
          return [world[0], world[1], world[2]];
        }
        return anchorWorld(transforms, anchor, state.lastPlacement!, variant.scale);
      };
      yield { actor, glow: at(anchors.glow), mouth: at(anchors.mouth) };
    }
  }

  /** No LOD/frustum culling: the shared corpse cap bounds presentation work regardless of camera distance. */
  private corpsePose(corpse: Corpse, variant: Variant): Pose {
    if (corpse.settledPose) {
      return corpse.settledPose;
    }
    const clip = deathClip(variant.clips, corpse.direction);
    if (!clip) {
      return corpse.basePose;
    }
    const pose = corpseFallPose(clip, corpse.basePose, corpse.elapsed);
    if (corpse.elapsed >= clip.durationRealSeconds) {
      corpse.settledPose = pose;
    }
    return pose;
  }

  private packCorpse(corpse: Corpse): void {
    const variant = this.variants[corpse.variantIndex]!;
    const severedIndices = new Set(this.indicesFor(variant, severedBoneIds(variant, corpse.severed)));
    if (!corpse.incapacitated) {
      for (const index of variant.burstIndices) {
        severedIndices.add(index);
      }
    }
    const sinkElapsed =
      corpse.elapsed -
      ((corpse.ragdoll ? (corpse.groundedAt ?? corpse.elapsed) : this.corpseFallDuration(corpse)) +
        this.options.look.corpseLieSimSeconds);
    if (corpse.ragdoll) {
      const sinkT = corpse.incapacitated
        ? 0
        : Math.max(0, Math.min(1, sinkElapsed / this.options.look.corpseSinkSimSeconds));
      for (const [bone, transform] of corpse.ragdoll.transforms) {
        if (severedIndices.has(bone)) {
          this.packZeroBone(corpse.globalRow, bone);
          continue;
        }
        packCrowdBoneMatrix(
          this.textureData,
          { layout: this.layout, slot: corpse.globalRow, bone },
          {
            r: transform.r.map((value) => value * variant.scale) as MutableTransform['r'],
            t: [...transform.t],
          },
          {
            x: 0,
            y: -sinkT * this.options.look.corpseSinkDepthMetres,
            z: 0,
            yawRad: 0,
          },
        );
      }
      packSeveredMask(this.textureData, this.layout, corpse.globalRow, severedIndices);
      packBloodiness(this.textureData, this.layout, corpse.globalRow, corpse.bloodiness);
      packCharge(this.textureData, this.layout, corpse.globalRow, corpse.charge);
      this.textureUpdates.touch(corpse.globalRow);
      return;
    }
    const pose = this.corpsePose(corpse, variant);
    const sinkT = corpse.incapacitated
      ? 0
      : Math.max(0, Math.min(1, sinkElapsed / this.options.look.corpseSinkSimSeconds));
    const crowdPlacement: CrowdPlacement = {
      x: corpse.worldPos[0],
      y: corpse.worldPos[1] - sinkT * this.options.look.corpseSinkDepthMetres,
      z: corpse.worldPos[2],
      yawRad: corpse.yaw,
    };
    boneTransformsInto(variant.bones, pose, variant.parentIndex, variant.scratch);
    scaleTransformsInPlace(variant.scratch, variant.scale);
    this.packSkeleton(corpse.globalRow, variant, variant.scratch, {
      placement: crowdPlacement,
      severedIndices,
      bloodiness: corpse.bloodiness,
      charge: corpse.charge,
    });
  }

  /** A piece of debris's own per-frame pose+pack — the inverse of packSkeleton: only `severedIndices` (the
   * carried subtree) gets a real, physics-placed matrix; every other bone is zeroed (hidden). Spin is
   * composed onto the severed bone's own pose rotation, so it carries the whole subtree with it through
   * ordinary FK composition. The
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
    for (let bone = 0; bone < variant.bones.length; bone++) {
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

  private actorPoseBounds(actor: Actor, placement: { worldPos: Vec3 }): { center: Vector3; radius: number } {
    const halfWidth = actor.body.halfWidth * this.blockSize;
    const halfDepth = (actor.body.halfDepth ?? actor.body.halfWidth) * this.blockSize;
    const height = actor.body.height * this.blockSize;
    const isFusedMass = actor.type.model === 'fused-mass';
    return {
      center: new Vector3(
        placement.worldPos[0],
        placement.worldPos[1] + (isFusedMass ? height / 2 : PELVIS_HEIGHT_M),
        placement.worldPos[2],
      ),
      radius: isFusedMass ? Math.hypot(halfWidth, halfDepth, height / 2) : BOUNDING_RADIUS_M,
    };
  }

  private packActorPose(
    state: ActorRenderState,
    variant: Variant,
    actor: Actor,
    frame: {
      placement: { position: Vec3; worldPos: Vec3; yaw: number; headYaw: number };
      gazeFrameDelta: number;
      presentationSimSeconds: number;
    },
  ): void {
    state.actor = actor;
    const bounds = this.actorPoseBounds(actor, frame.placement);
    const keepsPose = !state.crawlFall && state.lastPose && this.shouldSkipPose(bounds.center, bounds.radius);
    if (!keepsPose) {
      const stamp = this.poseStampOf(state, variant, actor, frame.placement);
      if (!(stamp && state.poseStamp && sameStamp(stamp, state.poseStamp))) {
        const posed = this.posedFrame(state, actor, frame.placement, {
          dt: frame.gazeFrameDelta,
          presentationSimSeconds: frame.presentationSimSeconds,
        });
        this.keepPose(state, variant, posed);
        state.poseStamp = stamp;
        if (state.crawlFall) {
          this.packCrawlFall(state, variant, actor, {
            posed,
            severedIndices: this.severedIndicesOf(state, variant, actor),
          });
          return;
        }
      }
    }
    this.packPlaced(state, variant, actor, frame.placement);
  }

  /**
   * The numbers posing the body reads, or undefined when the pose also depends on something else (a fall in
   * progress, a gaze that is turning or following the player). Placement is not among them: the pose is root-local.
   */
  private poseStampOf(
    state: ActorRenderState,
    variant: Variant,
    actor: Actor,
    placement: { headYaw: number },
  ): (number | string)[] | undefined {
    if (state.crawlFall || state.drawnFall || actor.spitWindup > 0) {
      return undefined;
    }
    if (
      variant.gaze &&
      actor.regions.head! > 0 &&
      !actor.severed.includes(variant.gaze.headPart) &&
      (!gazeAtRest(state.lookAtState) || actor.agent?.mode === 'chase' || this.hasRecentNearStimulus(state, actor))
    ) {
      return undefined;
    }
    return [
      placement.headYaw,
      actor.gaitPhase,
      actor.horizontalSpeed,
      actor.chaseStance ? 1 : 0,
      actor.attackWindup,
      actor.attackWait ?? -1,
      actor.wanderClock,
      actor.stanceWeight ?? -1,
      actor.hitFlinchTime ?? -1,
      actor.regions.head!,
      actor.regions.leftLeg!,
      actor.regions.rightLeg!,
      actor.severed.join(','),
    ];
  }

  private syncActor(
    { id, actor }: { id: EntityId; actor: Actor },
    gazeDt: number,
    presentationSimSeconds: number,
  ): void {
    if (!actor.incapacitated && this.corpses.get(id)?.incapacitated) {
      this.freeCorpse(id);
    }
    if (actor.incapacitated) {
      this.removeTentacle(id);
      if (!this.corpses.has(id)) {
        let state = this.states.get(id);
        if (!state) {
          state = this.addActor(id, actor);
        }
        if (state) {
          this.actorIncapacitated(id, actor);
        }
      }
      return;
    }
    let state = this.states.get(id);
    if (!state) {
      state = this.addActor(id, actor);
      if (!state) {
        return; // this variant is full — not drawn (see this module's header comment)
      }
    }
    state.lastSeenFrame = this.frameCounter;
    this.observePerceptionTime(state, actor);
    this.packCells(state, actor.carved);
    const variant = this.variants[state.variantIndex]!;
    const placement = this.currentRenderPlacement(actor);
    this.beginCrawlFall(state, variant, actor);
    this.updatePerceptionLabel(id, actor, state, placement);
    this.packActorPose(state, variant, actor, {
      placement,
      gazeFrameDelta: gazeDt,
      presentationSimSeconds,
    });
    this.updateTentacle(state, actor, placement);
  }

  // biome-ignore lint/complexity/useMaxParams: Keep the renderer interface aligned with its base implementation.
  sync(
    store: EntityStore<Actor>,
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
    this.advanceCrawlFalls(realDt);
    const present = new Set<EntityId>();
    for (const [id, actor] of store.entries()) {
      present.add(id);
      const actorBackgroundBlend = backgroundActorBlend(actor, simulationTime, this.backgroundBlend);
      this.renderBlend = actor.tier === 'background' ? actorBackgroundBlend : this.activeBlend;
      this.syncActor({ id, actor }, Math.max(0, Math.min(realDt, 0.05)), simulationTime ?? 0);
    }
    for (const [id, state] of this.states) {
      if (state.lastSeenFrame !== this.frameCounter) {
        this.removeActor(id, state); // a plain vanish (despawn/unload) — a death goes through actorDied
      }
    }
    for (const [id, corpse] of this.corpses) {
      if (corpse.incapacitated && !present.has(id)) {
        this.freeCorpse(id);
      }
    }
    this.advanceCorpses(realDt);
    this.advanceDebris(realDt);
    this.applyReveal();
    this.textureUpdates.flush();
  }

  uploadPoses(renderer: WebGLRenderer): void {
    this.textureUpdates.upload(renderer);
  }

  private advanceCrawlFalls(realDt: number): void {
    for (const state of this.states.values()) {
      const fall = state.crawlFall;
      if (!fall) {
        continue;
      }
      fall.elapsedRealSeconds += realDt;
      if (
        !fall.released &&
        (fall.physics.settled || fall.elapsedRealSeconds >= this.options.ragdoll.crawlFall.fallRealSeconds)
      ) {
        this.ragdolls?.remove(fall.physics);
        fall.released = true;
      }
      if (
        fall.elapsedRealSeconds >=
        this.options.ragdoll.crawlFall.fallRealSeconds + this.options.ragdoll.crawlFall.blendRealSeconds
      ) {
        state.crawlFall = undefined;
      }
    }
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
    const row = allowed ? holder.globalRow : this.hiddenRow;
    if (variant.crowdSlotAttr.getX(holder.instanceIndex) !== row) {
      variant.crowdSlotAttr.setX(holder.instanceIndex, row);
      variant.crowdSlotAttr.needsUpdate = true;
    }
    const walls = variant.cells?.walls[holder.localSlot];
    if (walls) {
      walls.visible = allowed;
    }
    if (typeof key === 'number' && !allowed) {
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

  private corpseFallDuration(corpse: Corpse): number {
    return deathClip(this.variants[corpse.variantIndex]!.clips, corpse.direction)?.durationRealSeconds ?? 0;
  }

  private advanceCorpses(realDt: number): void {
    this.ragdolls?.advance(realDt);
    for (const [id, corpse] of this.corpses) {
      if (corpse.ragdoll) {
        this.advanceRagdoll(id, corpse, realDt);
        continue;
      }
      const duration = this.corpseFallDuration(corpse);
      const wasFalling = corpse.incapacitated && corpse.elapsed < duration;
      corpse.elapsed += realDt;
      if (corpse.incapacitated) {
        corpse.elapsed = Math.min(corpse.elapsed, duration);
        if (wasFalling || corpse.elapsed < duration) {
          this.packCorpse(corpse);
        }
        continue;
      }
      if (corpse.elapsed >= duration + this.options.look.corpseLieSimSeconds + this.options.look.corpseSinkSimSeconds) {
        this.freeCorpse(id);
        continue;
      }
      this.packCorpse(corpse);
    }
  }

  private advanceRagdoll(id: EntityId, corpse: Corpse, realDt: number): void {
    if (this.ragdolls?.failed) {
      this.freeCorpse(id);
      return;
    }
    corpse.elapsed += realDt;
    if (
      !corpse.incapacitated &&
      corpse.groundedAt !== undefined &&
      corpse.elapsed > corpse.groundedAt + this.options.look.corpseLieSimSeconds
    ) {
      this.ragdolls?.hideColliders(corpse.ragdoll!);
    }
    if (corpse.ragdoll!.settled && corpse.groundedAt === undefined) {
      corpse.groundedAt = corpse.elapsed;
    }
    if (
      !corpse.incapacitated &&
      corpse.groundedAt !== undefined &&
      corpse.elapsed >=
        corpse.groundedAt + this.options.look.corpseLieSimSeconds + this.options.look.corpseSinkSimSeconds
    ) {
      this.freeCorpse(id);
    } else {
      this.packCorpse(corpse);
    }
  }

  /** Debris lifetime begins at physical rest, not at launch. */
  private advanceDebris(realDt: number): void {
    for (const [key, d] of this.debris) {
      d.elapsed += realDt;
      if (this.ragdolls?.failed) {
        this.freeDebris(key);
        continue;
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
      if (d.groundedAt !== undefined && d.elapsed > d.groundedAt + this.options.look.corpseLieSimSeconds) {
        this.ragdolls?.hideColliders(d.physics);
      }
      this.packDebris(d);
    }
  }

  /** Makes `slots` per-pass selections available (see ActorRenderer.reserveShadowSlots): one twin per
   * slot, because three uploads a geometry's attributes once per renderer frame, so two passes sharing
   * one twin's attribute would both draw whichever rows reached the GPU. Only grows, never shrinks. */
  reserveShadowSlots(slots: number): void {
    if (!(Number.isInteger(slots) && slots >= 1)) {
      throw new RangeError(`shadow slots must be a positive integer, got ${slots}`);
    }
    for (const variant of this.variants) {
      for (let slot = variant.shadowPasses.length; slot < slots; slot++) {
        variant.shadowPasses.push(this.addShadowPass(variant.geometry, variant.cells));
      }
    }
  }

  /** Builds one twin and adds it to the group. */
  private addShadowPass(geometry: BufferGeometry, cells: VariantCells | undefined): ShadowPassTwin {
    const twin = shadowCrowdTwin(
      geometry,
      cells?.material ?? this.material,
      cells?.depthMaterial ?? this.depthMaterial,
      this.capacity,
    );
    this.group.add(twin.mesh);
    return twin;
  }

  /**
   * Makes the shadow pass owning `slot` draw only the figures that can cast into the volume `casts`
   * accepts — shadows.ts calls this per light, before that light's map is drawn, and each pass reads its
   * own twin. A figure's caster box bounds what its packed row actually draws (see holderCasterBox),
   * so a box `casts` rejects cannot shadow the volume; holders whose position is not yet known (first
   * sync pending) stay selected rather than lose a shadow. The twin reads the same revealed row the crowd
   * mesh draws (`crowdSlotAttr` at the holder's live instance), so hidden figures stay hidden here too.
   * Only this slot's twin stays visible, so the pass about to draw sees its own rows and no other pass's.
   */
  selectShadowCasters(slot: number, casts: (box: Box3) => boolean): void {
    for (const variant of this.variants) {
      const twin = variant.shadowPasses[slot];
      if (!twin) {
        throw new RangeError(`shadow slot ${slot} was not reserved (reserveShadowSlots)`);
      }
      twin.mesh.count = this.packShadowRows(variant, twin.slots, casts);
      for (const other of variant.shadowPasses) {
        other.mesh.visible = false;
      }
      twin.mesh.visible = twin.mesh.count > 0;
      twin.slots.needsUpdate = true;
    }
  }

  /** Writes the rows of every holder that can cast into the selected volume, densely from 0; returns
   * how many. A holder whose position is not yet known (first sync pending) stays selected rather than
   * lose a shadow. */
  private packShadowRows(variant: Variant, slots: InstancedBufferAttribute, casts: (box: Box3) => boolean): number {
    const rows = slots.array as Float32Array;
    let count = 0;
    for (const key of variant.liveIds) {
      const holder = typeof key === 'number' ? (this.states.get(key) ?? this.corpses.get(key)) : this.debris.get(key);
      if (!holder) {
        continue;
      }
      const box = this.holderCasterBox(key, variant);
      if (!box || casts(box)) {
        rows[count] = variant.crowdSlotAttr.getX(holder.instanceIndex);
        count += 1;
      }
    }
    return count;
  }

  private readonly casterBox = new Box3();
  private readonly casterPoint = new Vector3();

  /** The world box a holder's drawn figure occupies, read from what it actually draws: the box around
   * its crowd row's packed bone translations (boxAroundRow). Every holder kind packs the row it draws
   * before any shadow pass selects — a live actor at its placement (packPlaced), a crawl-fall body
   * (packCrawlFall packs the very transforms it stores in drawnFall), a corpse (packCorpse packs its
   * ragdoll or death-clip pose with the sink offset already applied), debris (packDebris packs each
   * carried bone's own physics-placed matrix) — so the row holds exactly the translations the mesh and
   * the twin draw, whatever pivot, root motion, sink or debris flight moved them. Reused per call. */
  private holderCasterBox(key: SlotKey, variant: Variant): Box3 | undefined {
    const holder: SlotHolder | undefined =
      typeof key === 'number' ? (this.states.get(key) ?? this.corpses.get(key)) : this.debris.get(key);
    return holder ? this.boxAroundRow(holder.globalRow, variant) : undefined;
  }

  /** The box around the packed bone translations a figure's crowd row holds, expanded by the rotations
   * reach: a drawn vertex sits at most that far from the translation of the packed matrix that poses it
   * (see Variant.casterReach), and the row's matrices are exactly what the mesh and the twin draw — so
   * every pivot, ancestor and root translation a pose authored is already inside the box. Read straight
   * back from the crowd texture's own data, so no pose is recomputed here. A bone packed zero
   * (packZeroBone — severed) draws nothing, so its zero translation is skipped; a row whose every bone
   * is zero (never packed, or fully severed) has no box, and its holder stays selected rather than lose
   * a shadow. Reuses this.casterBox. */
  private boxAroundRow(globalRow: number, variant: Variant): Box3 | undefined {
    const box = this.casterBox.makeEmpty();
    const data = this.textureData;
    for (let bone = 0; bone < variant.bones.length; bone++) {
      const i = crowdTexelIndex(this.layout, globalRow, bone);
      let packed = false;
      for (let k = 0; k < 12; k++) {
        if (data[i + k] !== 0) {
          packed = true;
          break;
        }
      }
      if (packed) {
        box.expandByPoint(this.casterPoint.set(data[i + 3]!, data[i + 7]!, data[i + 11]!));
      }
    }
    return box.isEmpty() ? undefined : box.expandByScalar(variant.casterReach);
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
    this.ragdolls?.dispose();
    this.textureUpdates.dispose();
    this.texture.dispose();
    this.material.dispose();
    this.depthMaterial.dispose();
    for (const variant of this.variants) {
      // The twins' geometries share the crowd's vertex buffers, so all must go together (nothing renders
      // between the disposals) or a later disposal would free buffers a remaining geometry still uses.
      for (const twin of variant.shadowPasses) {
        twin.mesh.geometry.dispose();
      }
      variant.geometry.dispose();
      for (const walls of variant.cells?.walls ?? []) {
        walls?.geometry.dispose();
      }
      variant.cells?.texture.dispose();
      variant.cells?.material.dispose();
      variant.cells?.depthMaterial.dispose();
    }
  }
}
