// Draws zombies as full mobgen actors instead of ZombieMeshes' six boxes — behind `?actors=detailed`
// (GameConfig.actors, default 'boxes'; see src/game/config.ts and play.ts). Same shape as ZombieMeshes
// (group/sync/…, see ZombieRenderer below) so play.ts can hold either behind one variable.
//
// mobgen's pure core/mob modules (bones, IK, gait, the crowd bone-matrix packing) are reused directly via
// the `@mobgen/` alias (vite.config.ts, tsconfig.json) — no npm dependency, just a sibling-project source
// import. three.js itself is `import`ed here from *this* project's own node_modules, never mobgen's (mobgen
// only reaches three from mobgen/src/viewer, which this file — and everything under @mobgen/ — must never
// import; see test/mobgenBoundary.test.ts). The draw strategy mirrors mobgen's own stress-page 'crowd'
// mode (mobgen/src/viewer/stressActors.ts's buildCrowdRender): one shared bone-matrix DataTexture for
// every zombie (one GPU upload/frame, not one per zombie) and one InstancedMesh per body variant, each
// vertex fetching its own bone's matrix with a single texelFetch — see mobgen/src/mob/crowd.ts for the
// packing/layout and the GLSL, patched into MeshLambertMaterial here via onBeforeCompile exactly as
// stressActors.ts patches MeshStandardMaterial (checked against three r186's meshlambert.glsl.js: same
// <begin_vertex>/<beginnormal_vertex> chunks, same relative order, so the same patch applies unchanged).
//
// Known simplification: each of the `poolSize` body variants gets its own fixed `capacity` of texture
// slots (so total texture rows = poolSize * capacity, not `capacity` shared across all variants). If one
// variant's zombies exceed its own capacity, the excess simply aren't drawn by this renderer (their sim
// state is unaffected) — a hard per-variant cap for that zombie's whole life, not a rotating "nearest
// capacity" set. Documented here rather than implemented: picking the nearest N would need a per-frame
// distance sort of every zombie sharing an overflowing variant, and at the default capacity (64, matching
// ZombieMeshes') and pool size (12) this essentially never triggers in practice.
//
// Reactions (mobgen/src/mob/reactions.ts — EPIC.md's "animations for taking damage"): a hit flinch layers
// over whatever pose a live zombie is already in (walk, standing, or mid-attack), detected from a health
// drop each frame (updateFlinch). A death is different — src/core/zombies.ts's onDeath removes the zombie
// from its store and calls zombieDied here in the very same step, so this renderer, not the sim, owns
// everything about a corpse from then on: it *keeps* the zombie's existing slot/variant/instance (a corpse
// is still drawn, so it still counts toward its variant's capacity — a full variant drops its own oldest
// corpse first to make room for a new live zombie, and a global MAX_CORPSES cap drops the globally oldest
// corpse on a new death), plays deathPose from the pose/position/facing frozen at the instant of death,
// holds once it's lying, then sinks (an extra downward Y offset, no re-posing needed) before finally
// freeing the slot the same way a plain vanish (despawn/unload, never a death) always has. Corpses are
// render-only: never saved, and forgotten immediately if this whole renderer is disposed/recreated.

import type { Material } from '@mobgen/core/body.ts';
import { generateValid, type Realized, realize } from '@mobgen/core/generate.ts';
import { IDENTITY_M, type Vec3 as MobVec3, mulMM, rotY } from '@mobgen/core/math.ts';
import {
  allocateBoneTransforms,
  boneTransformsInto,
  indexBonesByParent,
  type MutableTransform,
  type ParentIndex,
  type Pose,
} from '@mobgen/core/pose.ts';
import { materialOf, shadeOf } from '@mobgen/core/voxelize.ts';
import { ATTACK_CLIPS, attackPose } from '@mobgen/mob/attack.ts';
import {
  CROWD_BEGIN_VERTEX,
  CROWD_BEGINNORMAL_VERTEX,
  CROWD_VERTEX_DECLARATIONS,
  type CrowdPlacement,
  type CrowdTextureLayout,
  crowdTextureLayout,
  packCrowdBoneMatrix,
} from '@mobgen/mob/crowd.ts';
import {
  advanceClock,
  bodyRestExtents,
  createGaitCache,
  type Extent,
  footRestExtents,
  type GaitClock,
  INITIAL_CLOCK,
  type LegGeometry,
  legGeometryFor,
  type WalkActor,
  walkPose,
} from '@mobgen/mob/gait.ts';
import type { HumanoidParams } from '@mobgen/mob/humanoid.ts';
import { DEATH_FALL_DURATION, type DeathActor, deathPose, flinchPose, HIT_FLINCH } from '@mobgen/mob/reactions.ts';
import { TEMPLATES } from '@mobgen/mob/templates.ts';
import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  DataTexture,
  FloatType,
  Frustum,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  NearestFilter,
  RGBAFormat,
  Sphere,
  Vector3,
} from 'three';
import type { Vec3 } from '../core/coords.ts';
import type { EntityId, EntityStore } from '../core/entities.ts';
import type { Zombie } from '../core/zombies.ts';
import { StepOffset } from './stepOffset.ts';

/** What play.ts needs from either renderer, so it can hold `ZombieMeshes | MobActorMeshes` behind one
 * variable. `dispose`/`setCamera`/`zombieDied` are optional: ZombieMeshes has none of them (see
 * src/render/zombies.ts — left unchanged, so a death for it is just the plain vanish-from-the-store path
 * it's always had), MobActorMeshes has all three. `zombieDied` must be called for every death (see
 * src/core/zombies.ts's onDeath and play.ts's forwarding) so a corpse renderer can tell "died, keep as a
 * corpse" apart from "vanished without dying" (despawn/unload) — see MobActorMeshes' own doc comment. */
export interface ZombieRenderer {
  readonly group: Group;
  sync: (store: EntityStore<Zombie>, realDt?: number, alpha?: number) => void;
  dispose?: () => void;
  setCamera?: (camera: Camera) => void;
  zombieDied?: (id: EntityId, zombie: Zombie, playerPos?: Vec3) => void;
}

const LUNGE_GRAB = ATTACK_CLIPS.LUNGE_GRAB!;

const DEFAULT_POOL_SIZE = 12;
const DEFAULT_CAPACITY = 64; // matches ZombieMeshes' own default
const BASE_SEED = 1; // fixed and deterministic — not Math.random() (the task's own requirement)

const TELEPORT_METRES = 1; // matches StepOffset's own threshold
const SPEED_TIME_CONSTANT_S = 0.25; // low-pass time constant for the walk speed fed to mobgen
// mobgen's per-step caches (mob/gait.ts's cachedFootfallPeak) key on *exact* float speed equality; a
// continuously-varying (lurch) speed would thrash them every frame (see mobgen's own report on this).
// Quantizing keeps the speed stable frame-to-frame whenever it isn't genuinely changing.
const SPEED_QUANTUM = 0.05;
const STEP_HEIGHT_METRES = 0.5; // matches ZombieMeshes' own StepOffset construction

// Distance-based LOD — identical thresholds/intervals to mobgen's own stress page (src/viewer/stress.ts).
const LOD_NEAR_M = 15;
const LOD_FAR_M = 30;
const PELVIS_HEIGHT_M = 0.9; // rough pelvis height above the feet, for both the LOD distance and the
// frustum bounding sphere below — same approximation mobgen's stress page uses for its own LOD.
const BOUNDING_RADIUS_M = 1.2;

const lodIntervalFor = (distance: number): number => {
  if (distance > LOD_FAR_M) {
    return 3;
  }
  if (distance > LOD_NEAR_M) {
    return 2;
  }
  return 1;
};

// Corpse lifecycle: death fall (mobgen's own DEATH_FALL_DURATION), then lies still, then sinks out of
// view — see MobActorMeshes' own doc comment on why a corpse keeps its slot the whole time.
const CORPSE_LIE_S = 8;
const CORPSE_SINK_S = 1.5;
const CORPSE_SINK_DEPTH_M = 1.5; // comfortably below any visible geometry by the end of the sink
const CORPSE_LIFETIME_S = DEATH_FALL_DURATION + CORPSE_LIE_S + CORPSE_SINK_S;
const MAX_CORPSES = 16; // global cap across every variant — see zombieDied's own eviction

/** Deterministic variant pick from a zombie's EntityId — NOT the sim's own behaviour RNG (that must stay
 * reserved for movement/AI decisions; drawing from it here would perturb them by how many zombies exist).
 * Exported for test/mobActors.test.ts. */
export const variantIndexForId = (id: EntityId, poolSize: number): number => {
  let h = (id ^ 0x9e_37_79_b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x04_5d_9f_3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x04_5d_9f_3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h % poolSize;
};

/** Deterministic flinch side from a zombie's own EntityId, in [-1, 1) — same "hash the id, not the sim's
 * behaviour RNG" reasoning as variantIndexForId. A judgment call, not the spec's preferred option: the hit
 * direction relative to facing would need the player's position threaded into sync()'s otherwise
 * store/dt/alpha-only signature (shared with ZombieMeshes and the bench harness) for every frame, just for
 * an occasional cosmetic mirror; fixed-per-zombie-life from its id was the documented fallback for exactly
 * this "awkward to plumb through" case. Exported for test/mobActors.test.ts. */
export const flinchSideForId = (id: EntityId): number => {
  let h = (id ^ 0x5b_ad_c0_de) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c_1b_3c_6d) >>> 0;
  h = (h ^ (h >>> 12)) >>> 0;
  return (h % 2000) / 1000 - 1;
};

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

/** True the instant attackWait *increases* versus last frame's value — the sim sets it to the type's own
 * cooldown exactly when an attack's windup starts, i.e. the telegraph, not when the hit lands
 * (src/core/zombies.ts), so a rise (never a fall — it only ever counts down otherwise) means "an attack
 * just started its windup." Exported for test/mobActors.test.ts. */
export const attackJustStarted = (attackWait: number, previousAttackWait: number): boolean =>
  attackWait > previousAttackWait;

/** Where in mobgen's LUNGE_GRAB clip to start playing an attack so its own hitTime lands exactly when the
 * sim's windup elapses and the hit resolves (src/core/zombies.ts telegraphs an attack with a windup before
 * the hit, rather than landing it instantly) — clamped to 0 for a windup at or beyond the clip's hitTime,
 * so the clip still plays (just with no lead-in) rather than starting at a negative time. Rendering
 * interpolates roughly one tick behind the sim; not corrected for here. Exported for
 * test/mobActors.test.ts. */
export const attackStartTime = (windupSeconds: number): number => Math.max(0, LUNGE_GRAB.hitTime - windupSeconds);

/** The (clock, smoothed/quantized speed) triple advanceGaitFromMovement threads through frame to frame —
 * pulled out of ZombieRenderState so the update itself is a plain, testable function of its inputs. */
export interface GaitMovementState {
  readonly clock: GaitClock;
  readonly smoothedSpeed: number;
  readonly quantizedSpeed: number;
}

/** Grouped (see mobgen's own GaitBasis for the same reasoning) since they always travel together. */
export interface GaitMovementBasis {
  readonly params: HumanoidParams;
  readonly geomL: LegGeometry;
  readonly seed: number;
}

/**
 * Advances the gait clock by `distance` (metres moved this render frame) and updates the low-pass
 * filtered, quantized speed mobgen's own per-step caches need held steady (mob/gait.ts's
 * cachedFootfallPeak keys on *exact* float speed equality — a continuously-varying lurch speed would
 * thrash it every frame without quantizing; see this module's own SPEED_QUANTUM comment). A `distance`
 * over TELEPORT_METRES in one frame is treated as a teleport: returns `current` unchanged (no clock
 * advance, no speed-filter update) — the caller is still responsible for resetting its own `lastPos` to
 * the new position either way, so the *next* frame's delta doesn't include the jump.
 */
export const advanceGaitFromMovement = (
  current: GaitMovementState,
  distance: number,
  realDt: number,
  basis: GaitMovementBasis,
): GaitMovementState => {
  if (distance > TELEPORT_METRES) {
    return current;
  }
  let { smoothedSpeed, quantizedSpeed } = current;
  if (realDt > 0) {
    const raw = distance / realDt;
    const lowpass = Math.min(1, realDt / SPEED_TIME_CONSTANT_S);
    smoothedSpeed += (raw - smoothedSpeed) * lowpass;
    quantizedSpeed = Math.max(0, Math.round(smoothedSpeed / SPEED_QUANTUM) * SPEED_QUANTUM);
  }
  const clock = advanceClock(current.clock, distance, { ...basis, speed: quantizedSpeed });
  return { clock, smoothedSpeed, quantizedSpeed };
};

/** Same conversion mobgen's own viewer/scene.ts uses (not importable — that file pulls in three from
 * mobgen's own node_modules) — palette-index colour bytes to per-vertex RGB. */
const SHADE_FACTORS = [0.72, 0.88, 1.04, 1.2] as const;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const vertexColorsFrom = (colorBytes: Uint8Array, palette: Readonly<Record<Material, MobVec3>>): Float32Array => {
  const out = new Float32Array(colorBytes.length * 3);
  for (let v = 0; v < colorBytes.length; v++) {
    const byte = colorBytes[v]!;
    const base = palette[materialOf(byte)];
    const factor = SHADE_FACTORS[shadeOf(byte)] ?? 1;
    out[v * 3] = clamp01(base[0] * factor);
    out[v * 3 + 1] = clamp01(base[1] * factor);
    out[v * 3 + 2] = clamp01(base[2] * factor);
  }
  return out;
};

/** Merged geometry for one body variant: like mobgen's own buildCrowdGeometry (stressActors.ts, not
 * importable for the same reason as vertexColorsFrom above) — one float `boneIndex` per vertex instead of
 * skinIndex/skinWeight, fetched straight from the shared bone texture in the vertex shader. */
const buildVariantGeometry = (realized: Realized): BufferGeometry => {
  const { meshes, body } = realized;
  let vertexCount = 0;
  let indexCount = 0;
  for (const mesh of meshes.values()) {
    vertexCount += mesh.positions.length / 3;
    indexCount += mesh.indices.length;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const boneIndexAttr = new Float32Array(vertexCount);
  const indices = new Uint32Array(indexCount);

  let vertexOffset = 0;
  let indexOffset = 0;
  for (const [boneIndex, mesh] of meshes) {
    const vertices = mesh.positions.length / 3;
    positions.set(mesh.positions, vertexOffset * 3);
    normals.set(mesh.normals, vertexOffset * 3);
    colors.set(vertexColorsFrom(mesh.colors, body.palette), vertexOffset * 3);
    boneIndexAttr.fill(boneIndex, vertexOffset, vertexOffset + vertices);
    for (let i = 0; i < mesh.indices.length; i++) {
      indices[indexOffset + i] = mesh.indices[i]! + vertexOffset;
    }
    vertexOffset += vertices;
    indexOffset += mesh.indices.length;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('boneIndex', new BufferAttribute(boneIndexAttr, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
};

interface Variant {
  readonly realized: Realized;
  /** Shared bones/extents/params/seed; each zombie using this variant clones it with its own GaitCache
   * (mobgen/src/mob/gait.ts's GaitCache — per zombie, not per variant, since several zombies sharing a
   * variant have different speeds/step indices at once; see mobgen's own crowd-cache report). */
  readonly walkActorTemplate: WalkActor;
  readonly legGeometryL: LegGeometry;
  /** Every bone's own rest extents (not just the feet) — deathPose's own re-grounding needs the whole
   * fallen body, since the lowest point once lying down is rarely a foot (see mobgen/src/mob/gait.ts's
   * bodyRestExtents doc comment). */
  readonly bodyExtents: ReadonlyMap<string, Extent>;
  readonly parentIndex: ParentIndex;
  readonly geometry: BufferGeometry;
  readonly mesh: InstancedMesh;
  readonly crowdSlotAttr: InstancedBufferAttribute;
  /** Reused every frame for every zombie of this variant: each place-and-pack fully consumes it before
   * returning, so nothing overlaps (see mobgen's stressActors.ts for the identical reasoning). */
  readonly scratch: MutableTransform[];
  /** Local slot numbers (0..capacity-1) not currently assigned to a live zombie *or corpse* of this
   * variant. */
  readonly freeLocalSlots: number[];
  /** Dense, compacted (swap-removed) list of the zombie/corpse ids currently drawn by this variant's
   * InstancedMesh — liveIds[k] is instance k. A corpse stays in this list exactly like a live zombie (see
   * MobActorMeshes' own doc comment); only freeSlot ever removes an entry. */
  readonly liveIds: EntityId[];
  readonly idToInstanceIndex: Map<EntityId, number>;
}

/** The three fields freeSlot needs to release a live zombie's or a corpse's row/instance — both
 * ZombieRenderState and Corpse satisfy this structurally. */
interface SlotHolder {
  readonly variantIndex: number;
  readonly localSlot: number;
  readonly globalRow: number;
  instanceIndex: number;
}

interface ZombieRenderState extends SlotHolder {
  readonly walkActor: WalkActor;
  clock: GaitClock;
  /** World-space (metres) interpolated position last frame, or undefined the first frame we've seen it —
   * distance moved since then (not since the last *sim tick*) is what advances the gait clock. */
  lastPos: Vec3 | undefined;
  smoothedSpeed: number;
  quantizedSpeed: number;
  attackTime: number | undefined;
  prevAttackWait: number;
  /** health last frame — a drop starts a flinch (see updateFlinch). */
  prevHealth: number;
  hitTime: number | undefined;
  /** Fixed for this zombie's whole life (see flinchSideForId's own doc comment on why it's id-hashed
   * rather than read from the player's position each hit). */
  readonly hitSide: number;
  readonly stepOffset: StepOffset;
  lastSeenFrame: number;
}

/** A dead zombie that still occupies its live slot (see MobActorMeshes' own doc comment): frozen at the
 * pose/position/facing/fall-direction it died with, and driven purely by `elapsed` from there — the sim
 * has already forgotten this id entirely. */
interface Corpse extends SlotHolder {
  readonly walkActor: WalkActor;
  /** The walk (or walk+attack) pose frozen at the instant of death — deathPose's own basePose. */
  readonly basePose: Pose;
  /** World position (metres) at death; fixed — corpses don't move except sinking (see packCorpse). */
  readonly worldPos: Vec3;
  readonly yaw: number;
  readonly direction: 1 | -1;
  elapsed: number;
}

export interface MobActorMeshesOptions {
  readonly poolSize?: number;
}

/** Draws zombies as full mobgen actors, one shared bone-matrix texture and one InstancedMesh per variant
 * — see this module's own header comment for the whole design and its one documented simplification. */
export class MobActorMeshes implements ZombieRenderer {
  readonly group = new Group();
  private readonly blockSize: number;
  private readonly capacity: number;
  private readonly variants: readonly Variant[];
  private readonly layout: CrowdTextureLayout;
  private readonly textureData: Float32Array;
  private readonly texture: DataTexture;
  private readonly material: MeshLambertMaterial;
  private readonly states = new Map<EntityId, ZombieRenderState>();
  private readonly corpses = new Map<EntityId, Corpse>();
  private frameCounter = 0;
  private camera: Camera | undefined;
  private readonly frustum = new Frustum();
  private readonly frustumMatrix = new Matrix4();
  private readonly boundingSphere = new Sphere(new Vector3(), BOUNDING_RADIUS_M);

  constructor(blockSize: number, capacity = DEFAULT_CAPACITY, options: MobActorMeshesOptions = {}) {
    this.blockSize = blockSize;
    this.capacity = capacity;
    const poolSize = Math.max(1, options.poolSize ?? DEFAULT_POOL_SIZE);
    const shamblerTemplate = TEMPLATES.find((t) => t.name === 'shambler');
    if (!shamblerTemplate) {
      throw new Error("MobActorMeshes: mobgen has no 'shambler' template");
    }

    const t0 = performance.now();
    const built: {
      realized: Realized;
      walkActorTemplate: WalkActor;
      legGeometryL: LegGeometry;
      bodyExtents: ReadonlyMap<string, Extent>;
    }[] = [];
    let seed = BASE_SEED;
    for (let i = 0; i < poolSize; i++) {
      const found = generateValid(shamblerTemplate, seed);
      if (!found) {
        throw new Error(`MobActorMeshes: no valid shambler within 100 seeds of ${seed}`);
      }
      seed = found.seed + 1;
      const realized = realize(found.genome);
      const extents = footRestExtents(realized.body.bones, realized.voxels);
      const bodyExtents = bodyRestExtents(realized.body.bones, realized.voxels);
      const legGeometryL = legGeometryFor(realized.body.bones, extents, 'L');
      const walkActorTemplate: WalkActor = {
        bones: realized.body.bones,
        extents,
        params: found.genome.params as HumanoidParams,
        seed: found.genome.seed,
      };
      built.push({ realized, walkActorTemplate, legGeometryL, bodyExtents });
    }
    const generationMs = performance.now() - t0;
    // biome-ignore lint/suspicious/noConsole: a one-time, useful-to-see startup cost, not per-frame noise.
    console.info(
      `MobActorMeshes: generated ${poolSize} shambler variant${poolSize === 1 ? '' : 's'} in ${generationMs.toFixed(1)} ms`,
    );

    const bonesPerSlot = Math.max(1, ...built.map((v) => v.realized.body.bones.length));
    this.layout = crowdTextureLayout(bonesPerSlot, poolSize * capacity);
    this.textureData = new Float32Array(this.layout.width * this.layout.height * 4);
    for (let slot = 0; slot < this.layout.height; slot++) {
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

    this.material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.material.customProgramCacheKey = () => 'deadvox-mob-actor-crowd-texture';
    const { texture } = this;
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.crowdBoneTexture = { value: texture };
      shader.vertexShader = `${CROWD_VERTEX_DECLARATIONS}\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', CROWD_BEGIN_VERTEX)
        .replace('#include <beginnormal_vertex>', CROWD_BEGINNORMAL_VERTEX);
    };

    this.variants = built.map((v, variantIndex) => {
      const geometry = buildVariantGeometry(v.realized);
      const mesh = new InstancedMesh(geometry, this.material, capacity);
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
      return {
        realized: v.realized,
        walkActorTemplate: v.walkActorTemplate,
        legGeometryL: v.legGeometryL,
        bodyExtents: v.bodyExtents,
        parentIndex: indexBonesByParent(v.realized.body.bones),
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
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
  }

  /** Whether `id` currently has a drawn instance (a slot) — true for a live zombie *or* a corpse still
   * lying/sinking. False for an id the sim knows about but this renderer hasn't (yet, or ever, if its
   * variant is at capacity) assigned one — see this module's header comment on the overflow behaviour.
   * Exported for test/mobActors.test.ts; play.ts has no use for it. */
  isTracked(id: EntityId): boolean {
    return this.states.has(id) || this.corpses.has(id);
  }

  /** Whether `id` is a live zombie currently mid-flinch. False for a corpse or an untracked id. Exported
   * for test/mobActors.test.ts; play.ts has no use for it. */
  isFlinching(id: EntityId): boolean {
    return this.states.get(id)?.hitTime !== undefined;
  }

  /** The oldest (first-inserted) corpse belonging to `variantIndex`, or undefined if it has none —
   * insertion order on a Map is iteration order, so this is just "the first match." */
  private oldestCorpseInVariant(variantIndex: number): EntityId | undefined {
    for (const [id, corpse] of this.corpses) {
      if (corpse.variantIndex === variantIndex) {
        return id;
      }
    }
    return undefined;
  }

  private addZombie(id: EntityId, zombie: Zombie): ZombieRenderState | undefined {
    const variantIndex = variantIndexForId(id, this.variants.length);
    const variant = this.variants[variantIndex]!;
    if (variant.freeLocalSlots.length === 0) {
      // Corpses count toward capacity (see this module's header comment): make room by dropping this
      // variant's own oldest corpse before giving up on a live zombie.
      const oldestCorpseId = this.oldestCorpseInVariant(variantIndex);
      if (oldestCorpseId !== undefined) {
        this.freeCorpse(oldestCorpseId);
      }
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
      variantIndex,
      localSlot,
      globalRow,
      instanceIndex,
      walkActor: { ...variant.walkActorTemplate, cache: createGaitCache() },
      clock: INITIAL_CLOCK,
      lastPos: undefined,
      smoothedSpeed: 0,
      quantizedSpeed: 0,
      attackTime: undefined,
      prevAttackWait: zombie.attackWait,
      prevHealth: zombie.health,
      hitTime: undefined,
      hitSide: flinchSideForId(id),
      stepOffset: new StepOffset(STEP_HEIGHT_METRES),
      lastSeenFrame: this.frameCounter,
    };
    this.states.set(id, state);
    return state;
  }

  /** Releases `entry`'s row/instance back to its variant, swap-compacting whichever id (a live zombie or a
   * corpse — both share the same dense liveIds/instanceIndex bookkeeping) was drawn last into the
   * now-vacated slot. Shared by removeZombie (a plain vanish) and freeCorpse (a corpse's own expiry or
   * eviction); neither touches `this.states`/`this.corpses` themselves — callers do that. */
  private freeSlot(id: EntityId, entry: SlotHolder): void {
    const variant = this.variants[entry.variantIndex]!;
    const lastIndex = variant.liveIds.length - 1;
    if (entry.instanceIndex !== lastIndex) {
      const movedId = variant.liveIds[lastIndex]!;
      const moved = (this.states.get(movedId) ?? this.corpses.get(movedId))!;
      variant.liveIds[entry.instanceIndex] = movedId;
      variant.idToInstanceIndex.set(movedId, entry.instanceIndex);
      moved.instanceIndex = entry.instanceIndex;
      variant.crowdSlotAttr.setX(entry.instanceIndex, moved.globalRow);
    }
    variant.liveIds.pop();
    variant.idToInstanceIndex.delete(id);
    variant.freeLocalSlots.push(entry.localSlot);
    variant.mesh.count = variant.liveIds.length;
    variant.crowdSlotAttr.needsUpdate = true;
  }

  /** A plain vanish (despawn/unload) — not a death; see this module's header comment and zombieDied. */
  private removeZombie(id: EntityId, state: ZombieRenderState): void {
    this.freeSlot(id, state);
    this.states.delete(id);
  }

  private freeCorpse(id: EntityId): void {
    const corpse = this.corpses.get(id);
    if (!corpse) {
      return;
    }
    this.freeSlot(id, corpse);
    this.corpses.delete(id);
  }

  /**
   * Called once for every death (src/core/zombies.ts's onDeath, forwarded by play.ts) — the sim removes
   * the zombie from its store in the very same call, before or after this frame's sync() runs either way
   * (see this module's header comment on why that ordering is safe): this method moves `id` out of
   * `this.states` (the live map) into `this.corpses` *immediately and synchronously*, so sync()'s prune
   * loop — which only ever looks at `this.states` — never sees `id` at all once it's died, whichever order
   * sync() and this run in. A corpse keeps its existing slot/variant/instance untouched (still drawn every
   * frame, see packCorpse) until its own lifetime (CORPSE_LIFETIME_S) frees it the same way a plain vanish
   * would. No-ops for an id this renderer was never drawing (e.g. its variant was already full).
   */
  zombieDied(id: EntityId, zombie: Zombie, playerPos?: Vec3): void {
    const state = this.states.get(id);
    if (!state) {
      return;
    }
    // `id` deliberately stays in this.states until the very end: a global-cap eviction below can swap-
    // compact the *dying* zombie's own instance into the vacated slot (if it happens to be the one
    // currently last in its variant's liveIds) — freeSlot's lookup must still find it as a SlotHolder,
    // which this.states (not yet deleted) still provides, exactly as it did before this death.
    if (this.corpses.size >= MAX_CORPSES) {
      const oldestId = this.corpses.keys().next().value;
      if (oldestId !== undefined) {
        this.freeCorpse(oldestId);
      }
    }
    const worldPos: Vec3 = [
      zombie.body.pos[0] * this.blockSize,
      zombie.body.pos[1] * this.blockSize,
      zombie.body.pos[2] * this.blockSize,
    ];
    const walkBase = walkPose(state.walkActor, state.clock, state.quantizedSpeed);
    const basePose =
      state.attackTime === undefined ? walkBase : attackPose(state.walkActor, LUNGE_GRAB, state.attackTime, walkBase);
    this.corpses.set(id, {
      variantIndex: state.variantIndex,
      localSlot: state.localSlot,
      globalRow: state.globalRow,
      instanceIndex: state.instanceIndex,
      walkActor: state.walkActor,
      basePose,
      worldPos,
      yaw: Math.atan2(-zombie.facing[0], -zombie.facing[2]),
      direction: fallDirectionAwayFromPlayer(zombie.facing, zombie.body.pos, playerPos),
      elapsed: 0,
    });
    this.states.delete(id);
  }

  /** True if `worldPelvis` is farther from the camera than LOD_NEAR/FAR_M warrants skipping this frame
   * (staggered by id so a whole LOD tier doesn't update/skip in lockstep), or outside the frustum. False
   * (never skip) if no camera has been set yet. */
  private shouldSkipPose(id: EntityId, worldPelvis: Vector3): boolean {
    const { camera } = this;
    if (!camera) {
      return false;
    }
    this.boundingSphere.center.copy(worldPelvis);
    if (!this.frustum.intersectsSphere(this.boundingSphere)) {
      return true;
    }
    const distance = camera.position.distanceTo(worldPelvis);
    const interval = lodIntervalFor(distance);
    return interval > 1 && (this.frameCounter + id) % interval !== 0;
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

  /** Advances this zombie's gait clock/speed from how far it moved since last frame (see
   * advanceGaitFromMovement), and its attack timer from attackWait — both regardless of LOD/frustum, so
   * neither falls behind while this zombie's own expensive pose step is being skipped. */
  private updateMovementAndAttack(
    state: ZombieRenderState,
    zombie: Zombie,
    frame: { variant: Variant; worldPos: Vec3; realDt: number },
  ): void {
    const { variant, worldPos, realDt } = frame;
    if (state.lastPos) {
      const dx = worldPos[0] - state.lastPos[0];
      const dz = worldPos[2] - state.lastPos[2];
      const distance = Math.hypot(dx, dz);
      const updated = advanceGaitFromMovement(
        { clock: state.clock, smoothedSpeed: state.smoothedSpeed, quantizedSpeed: state.quantizedSpeed },
        distance,
        realDt,
        { params: state.walkActor.params, geomL: variant.legGeometryL, seed: state.walkActor.seed },
      );
      state.clock = updated.clock;
      state.smoothedSpeed = updated.smoothedSpeed;
      state.quantizedSpeed = updated.quantizedSpeed;
    }
    state.lastPos = worldPos;

    // mobgen's LUNGE_GRAB starts the instant attackWait jumps up (the sim sets it to the type's cooldown
    // exactly when an attack's windup starts — src/core/zombies.ts), and plays out over the walk until the
    // clip ends, same as mobgen's own viewer/stress page drive attackPose. Starting the clip at
    // hitTime − windup (via attackStartTime) lines up the clip's own hitTime with the sim's
    // real hit, instead of always starting from 0 and landing the visual hit late.
    if (attackJustStarted(zombie.attackWait, state.prevAttackWait)) {
      state.attackTime = attackStartTime(zombie.type.attack.windup);
    }
    state.prevAttackWait = zombie.attackWait;
    if (state.attackTime !== undefined) {
      state.attackTime += realDt;
      if (state.attackTime > LUNGE_GRAB.duration) {
        state.attackTime = undefined;
      }
    }
  }

  /** Starts a flinch the instant health drops versus last frame (any amount — the sim only ever decreases
   * it on a hit; death is handled separately by zombieDied, not here), and advances/ends one already
   * playing — regardless of LOD/frustum, same reasoning as updateMovementAndAttack's own comment. */
  private updateFlinch(state: ZombieRenderState, zombie: Zombie, realDt: number): void {
    if (zombie.health < state.prevHealth) {
      state.hitTime = 0; // (re)starts even if one is already playing, same restart rule as an attack
    }
    state.prevHealth = zombie.health;
    if (state.hitTime !== undefined) {
      state.hitTime += realDt;
      if (state.hitTime > HIT_FLINCH.duration) {
        state.hitTime = undefined;
      }
    }
  }

  /** The expensive step LOD/frustum culling skips for a distant or off-screen zombie: pose (walk, or walk
   * + attackPose while lunging, plus the extra head yaw, plus a flinch layered on top of *that* while one
   * is playing — "layer flinch on top of the attack pose"), FK, and packing every bone into the shared
   * texture at this zombie's own stable row. */
  private packPose(
    state: ZombieRenderState,
    variant: Variant,
    placement: { worldPos: Vec3; yaw: number; headYaw: number; verticalOffset: number },
  ): void {
    const { worldPos, yaw, headYaw, verticalOffset } = placement;
    const basePose = walkPose(state.walkActor, state.clock, state.quantizedSpeed);
    const attacked =
      state.attackTime === undefined ? basePose : attackPose(state.walkActor, LUNGE_GRAB, state.attackTime, basePose);
    const headPose = this.withHeadYaw(attacked, headYaw);
    const pose =
      state.hitTime === undefined
        ? headPose
        : flinchPose(state.walkActor, state.hitTime, headPose, { side: state.hitSide });

    boneTransformsInto(variant.realized.body.bones, pose, variant.parentIndex, variant.scratch);
    // Feet land at the pose's own local y = 0 (walkPose's groundOffset puts the lowest foot there — see
    // mobgen/src/mob/gait.ts) — so placing the whole rig at body.pos's own Y (plus the render-only
    // StepOffset) puts the feet exactly at body.pos.y, matching ZombieMeshes' box figure.
    const crowdPlacement: CrowdPlacement = {
      x: worldPos[0],
      y: worldPos[1] + verticalOffset,
      z: worldPos[2],
      yawRad: yaw,
    };
    for (let bone = 0; bone < variant.realized.body.bones.length; bone++) {
      packCrowdBoneMatrix(
        this.textureData,
        { layout: this.layout, slot: state.globalRow, bone },
        variant.scratch[bone]!,
        crowdPlacement,
      );
    }
  }

  /** A corpse's own per-frame pose+pack: deathPose from its frozen basePose, sinking (an extra downward Y
   * offset, no re-posing needed) once it's been lying long enough. No LOD/frustum culling — the global
   * MAX_CORPSES cap already bounds this to a small, fixed extra cost regardless of camera or distance. */
  private packCorpse(corpse: Corpse): void {
    const variant = this.variants[corpse.variantIndex]!;
    const deathActor: DeathActor = { ...corpse.walkActor, bodyExtents: variant.bodyExtents };
    const pose = deathPose(deathActor, corpse.basePose, corpse.elapsed, { direction: corpse.direction });
    boneTransformsInto(variant.realized.body.bones, pose, variant.parentIndex, variant.scratch);

    const sinkElapsed = corpse.elapsed - (DEATH_FALL_DURATION + CORPSE_LIE_S);
    const sinkT = Math.max(0, Math.min(1, sinkElapsed / CORPSE_SINK_S));
    const crowdPlacement: CrowdPlacement = {
      x: corpse.worldPos[0],
      y: corpse.worldPos[1] - sinkT * CORPSE_SINK_DEPTH_M,
      z: corpse.worldPos[2],
      yawRad: corpse.yaw,
    };
    for (let bone = 0; bone < variant.realized.body.bones.length; bone++) {
      packCrowdBoneMatrix(
        this.textureData,
        { layout: this.layout, slot: corpse.globalRow, bone },
        variant.scratch[bone]!,
        crowdPlacement,
      );
    }
  }

  sync(store: EntityStore<Zombie>, realDt = 0, alpha = 1): void {
    this.frameCounter += 1;
    if (this.camera) {
      this.frustumMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.frustumMatrix);
    }
    const blend = Math.max(0, Math.min(1, alpha));
    let anyDirty = false;

    for (const [id, zombie] of store.entries()) {
      let state = this.states.get(id);
      if (!state) {
        state = this.addZombie(id, zombie);
        if (!state) {
          continue; // this variant is full — not drawn (see this module's header comment)
        }
      }
      state.lastSeenFrame = this.frameCounter;
      const variant = this.variants[state.variantIndex]!;

      const { pos, yaw, headYaw } = this.interpolateRenderPose(zombie, blend);
      const worldPos: Vec3 = [pos[0] * this.blockSize, pos[1] * this.blockSize, pos[2] * this.blockSize];
      const verticalOffset = state.stepOffset.update(worldPos, zombie.body.onGround, realDt);
      this.updateMovementAndAttack(state, zombie, { variant, worldPos, realDt });
      this.updateFlinch(state, zombie, realDt);

      const worldPelvis = new Vector3(worldPos[0], worldPos[1] + PELVIS_HEIGHT_M, worldPos[2]);
      if (this.shouldSkipPose(id, worldPelvis)) {
        continue; // clock/attack/flinch above already advanced; only the expensive pose+pack step skips
      }
      this.packPose(state, variant, { worldPos, yaw, headYaw, verticalOffset });
      anyDirty = true;
    }

    for (const [id, state] of this.states) {
      if (state.lastSeenFrame !== this.frameCounter) {
        this.removeZombie(id, state); // a plain vanish (despawn/unload) — a death goes through zombieDied
      }
    }

    if (this.advanceCorpses(realDt) || anyDirty) {
      this.texture.needsUpdate = true;
    }
  }

  /** Corpses are driven entirely by their own `elapsed`, not by the store (the sim has already forgotten
   * them) — advance, re-pose/pack, and free once their whole lifetime (fall + lie + sink) has passed.
   * Returns whether any corpse was (re)packed this frame, i.e. whether the texture needs uploading. */
  private advanceCorpses(realDt: number): boolean {
    let anyDirty = false;
    for (const [id, corpse] of this.corpses) {
      corpse.elapsed += realDt;
      if (corpse.elapsed >= CORPSE_LIFETIME_S) {
        this.freeCorpse(id);
        continue;
      }
      this.packCorpse(corpse);
      anyDirty = true;
    }
    return anyDirty;
  }

  /** Adds `headYawRad` as an extra yaw on the head bone, innermost (applied before whatever sway/tilt
   * walkPose already gave it) — same "yaw innermost" convention walkPose itself uses for the pelvis (see
   * mob/gait.ts's own pelvisR composition). Cheap and clean since Pose.rotations is just one matrix per
   * bone; nothing more elaborate (e.g. touching the neck too) seemed necessary. */
  private withHeadYaw(pose: Pose, headYawRad: number): Pose {
    if (headYawRad === 0) {
      return pose;
    }
    const existing = pose.rotations.head ?? IDENTITY_M;
    const headYawDeg = (headYawRad * 180) / Math.PI;
    return { root: pose.root, rotations: { ...pose.rotations, head: mulMM(existing, rotY(headYawDeg)) } };
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    for (const variant of this.variants) {
      variant.geometry.dispose();
    }
  }
}
