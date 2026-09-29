// Builds and poses the three.js objects for one stress-test actor, in either of three render paths
// (see stress.ts for the HUD/simulation/UI side):
//
//   'bones'   — exactly buildActor's approach (scene.ts): one Mesh per bone, posed every frame by
//               setting its matrix from boneTransforms. Geometries are built once per pool entry and
//               shared (never re-meshed) across every actor referencing that entry.
//   'skinned' — one merged BufferGeometry per pool entry (skinIndex = bone index, weight 1) and one
//               three.js Skeleton per actor (its own THREE.Bone hierarchy, mirroring body.bones'
//               parent/child structure), driving a SkinnedMesh that shares the pool entry's geometry
//               and a single, fully shared material.
//   'crowd'   — one InstancedMesh per pool entry (variant), one instance per actor using that variant,
//               with every actor's whole bone-matrix set living in one shared DataTexture (a row per
//               actor) instead of a per-actor Skeleton/bone-texture pair. See buildCrowdRender's own
//               comment for why (mobgen/CHALLENGES.md §1: skinned mode's per-Skeleton bone texture
//               upload and 4-bone-per-vertex sampling lose to bones mode at high actor counts despite
//               less CPU — this trades three.js's generic skinning for exactly the one-bone-per-vertex,
//               one-texture-for-everyone case mobgen actually needs).
//
// One draw call per actor in 'bones'/'skinned' (well, one per bone-mesh per actor in 'bones'); 'crowd'
// draws one InstancedMesh *per variant*, each covering every actor using it in a single call.
//
// Bind-pose note (see buildSkinnedActor/buildCrowdRender): every bone's *local* (parent-relative) matrix
// at pose {root:[0,0,0], rotations:{}} is the identity (bone head/tail are already baked into rest-world
// coordinates — see core/body.ts), so binding with an explicit identity bindMatrix and identity
// boneInverses (skinned) — or just packing boneTransformsInto's own output straight into the texture
// (crowd) — reproduces boneTransforms' own composition exactly, with no separate "measure the rest pose"
// step needed.

import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  type Object3D,
  RGBAFormat,
  Skeleton,
  SkinnedMesh,
  Bone as ThreeBone,
} from 'three';
import { generate, type Realized, realize } from '../core/generate.ts';
import { compose, IDENTITY_M, rotation, rotY, type Transform, translation } from '../core/math.ts';
import {
  allocateBoneTransforms,
  boneTransformsInto,
  indexBonesByParent,
  type MutableTransform,
  type ParentIndex,
  type Pose,
} from '../core/pose.ts';
import type { Genome } from '../core/template.ts';
import { type Extent, footRestExtents, type LegGeometry, legGeometryFor, type WalkActor } from '../mob/gait.ts';
import type { HumanoidParams } from '../mob/humanoid.ts';
import { TEMPLATES } from '../mob/templates.ts';
import { geometryOf, vertexColors } from './scene.ts';

export type Mode = 'bones' | 'skinned' | 'crowd';

// ---- pool: distinct, valid bodies, generated incrementally ----

export interface PoolEntry {
  readonly genome: Genome;
  readonly realized: Realized;
  readonly walkActor: WalkActor;
  readonly extents: ReadonlyMap<string, Extent>;
  readonly legGeometryL: LegGeometry;
}

export interface PoolGenResult {
  readonly entry: PoolEntry;
  /** Wall-clock cost of this pool slot: every seed tried (generate + realize) until one validated. */
  readonly ms: number;
  /** Where the next call for this same template slot should start searching, so pool entries sharing a
   * template never repeat a body. */
  readonly nextSeed: number;
}

/** Same valid-seed search main.ts's "only valid" checkbox runs (generate, realize, keep the first PASS) —
 * duplicated rather than imported because main.ts inlines it too (core/generate.ts's generateValid does
 * the same search but doesn't hand back the Realized it built along the way). */
const findValid = (
  template: (typeof TEMPLATES)[number],
  fromSeed: number,
  maxAttempts = 100,
): { readonly genome: Genome; readonly realized: Realized } | undefined => {
  for (let i = 0; i < maxAttempts; i++) {
    const genome = generate(template, fromSeed + i);
    const realized = realize(genome);
    if (realized.report.ok) {
      return { genome, realized };
    }
  }
  return undefined;
};

/** Generates one pool entry: template cycles shambler/runner/brute (poolIndex % TEMPLATES.length),
 * seed search starts at `fromSeed` (pass 1 for the first entry of a template, then each result's own
 * `nextSeed` for the next one of that same template). */
export const generatePoolEntry = (poolIndex: number, fromSeed: number): PoolGenResult => {
  const template = TEMPLATES[poolIndex % TEMPLATES.length]!;
  const t0 = performance.now();
  const found = findValid(template, fromSeed);
  if (!found) {
    throw new Error(`no valid ${template.name} within 100 seeds of ${fromSeed}`);
  }
  const { genome, realized } = found;
  const extents = footRestExtents(realized.body.bones, realized.voxels);
  const legGeometryL = legGeometryFor(realized.body.bones, extents, 'L');
  const walkActor: WalkActor = {
    bones: realized.body.bones,
    extents,
    params: genome.params as HumanoidParams,
    seed: genome.seed,
  };
  const ms = performance.now() - t0;
  return { entry: { genome, realized, walkActor, extents, legGeometryL }, ms, nextSeed: genome.seed + 1 };
};

// ---- render resources: shared across every actor referencing one pool entry ----

export interface BonesPoolRender {
  readonly kind: 'bones';
  readonly geometries: ReadonlyMap<number, BufferGeometry>;
}

export interface SkinnedPoolRender {
  readonly kind: 'skinned';
  readonly geometry: BufferGeometry;
}

export interface CrowdPoolRender {
  readonly kind: 'crowd';
  /** Like SkinnedPoolRender's geometry, but a single float `boneIndex` attribute instead of
   * skinIndex/skinWeight — see buildCrowdGeometry. */
  readonly geometry: BufferGeometry;
  readonly boneCount: number;
}

export type PoolRender = BonesPoolRender | SkinnedPoolRender | CrowdPoolRender;

// One material per mode, created once and shared by every pool entry and actor: it carries no
// per-actor or per-bone state (vertex colours live in the geometry), so there's nothing to clone.
const fleshMaterial = new MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.92,
  metalness: 0.02,
});
const skinnedMaterial = new MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.92,
  metalness: 0.02,
});

/** Concatenates a pool entry's per-bone meshes into one BufferGeometry with skinIndex = bone index
 * (weight 1, no blending — every voxel belongs to exactly one bone, same as the 'bones' path). */
const buildSkinnedGeometry = (realized: Realized): BufferGeometry => {
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
  const skinIndex = new Uint16Array(vertexCount * 4);
  const skinWeight = new Float32Array(vertexCount * 4);
  const indices = new Uint32Array(indexCount);

  let vertexOffset = 0;
  let indexOffset = 0;
  for (const [boneIndex, mesh] of meshes) {
    const vertices = mesh.positions.length / 3;
    positions.set(mesh.positions, vertexOffset * 3);
    normals.set(mesh.normals, vertexOffset * 3);
    colors.set(vertexColors(mesh.colors, body.palette), vertexOffset * 3);
    for (let v = 0; v < vertices; v++) {
      skinIndex[(vertexOffset + v) * 4] = boneIndex;
      skinWeight[(vertexOffset + v) * 4] = 1;
    }
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
  geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
};

/** Same merged-geometry shape as buildSkinnedGeometry, but a single float `boneIndex` per vertex instead
 * of skinIndex/skinWeight — crowd mode fetches that bone's matrix straight from the shared bone-matrix
 * texture in the vertex shader (see buildCrowdRender), rather than through three.js's generic (4
 * influences, weighted-blend) skinning path. Kept as its own function rather than parametrizing
 * buildSkinnedGeometry: the two attribute sets are different enough (1 float vs. 2x4) that sharing the
 * loop would need its own branching anyway, and this way skinned mode is untouched. */
const buildCrowdGeometry = (realized: Realized): BufferGeometry => {
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
    colors.set(vertexColors(mesh.colors, body.palette), vertexOffset * 3);
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

export const buildPoolRender = (entry: PoolEntry, mode: Mode): PoolRender => {
  if (mode === 'bones') {
    const geometries = new Map<number, BufferGeometry>();
    for (const [boneIndex, boneMesh] of entry.realized.meshes) {
      geometries.set(boneIndex, geometryOf(boneMesh, entry.realized.body.palette));
    }
    return { kind: 'bones', geometries };
  }
  if (mode === 'crowd') {
    return {
      kind: 'crowd',
      geometry: buildCrowdGeometry(entry.realized),
      boneCount: entry.realized.body.bones.length,
    };
  }
  return { kind: 'skinned', geometry: buildSkinnedGeometry(entry.realized) };
};

export const disposePoolRender = (render: PoolRender): void => {
  if (render.kind === 'bones') {
    for (const geometry of render.geometries.values()) {
      geometry.dispose();
    }
  } else {
    render.geometry.dispose();
  }
};

// ---- one actor: the posed three.js objects, shared geometry, own transform state ----

export interface StressActor {
  /** Add these to a static (never-moved) container in the scene; remove them again to tear the actor
   * down (there's nothing else to dispose — geometry and material are pool-/module-owned). */
  readonly sceneObjects: readonly Object3D[];
  /**
   * Places the actor at world (x, z) facing `yawRad` (three.js convention: yaw 0 faces -Z, matching
   * conventions.ts) and applies `pose` (computed in the actor's own local frame, e.g. by walkPose/
   * attackPose) on top. Bones and skinned modes fold the placement in differently (see
   * buildSkinnedActor's own comment on why a SkinnedMesh can't just sit in a moved Group), but both end
   * up at the same posed-and-placed result.
   */
  readonly place: (x: number, z: number, yawRad: number, pose: Pose) => void;
}

/** Writes a Transform's r/t into an existing Matrix4 in place (Matrix4.set, not `new Matrix4()` —
 * mobgen/CHALLENGES.md §1: this runs for every bone of every actor of every frame, so the difference
 * between mutating one pre-allocated Matrix4 and allocating a fresh one really is the whole point). */
const writeMatrix = (
  target: Matrix4,
  r: readonly [number, number, number, number, number, number, number, number, number],
  t: readonly [number, number, number],
): void => {
  target.set(r[0], r[1], r[2], t[0], r[3], r[4], r[5], t[1], r[6], r[7], r[8], t[2], 0, 0, 0, 1);
};

const buildBonesActor = (entry: PoolEntry, render: BonesPoolRender): StressActor => {
  const group = new Group();
  const meshes = new Map<number, Mesh>();
  for (const [boneIndex, geometry] of render.geometries) {
    const mesh = new Mesh(geometry, fleshMaterial);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    meshes.set(boneIndex, mesh);
  }
  const { bones } = entry.realized.body;
  // Allocated once per actor, reused every frame: boneTransformsInto writes into these in place instead
  // of building a fresh Map<string, Transform> (and a fresh Transform per bone) on every call.
  const parentIndex: ParentIndex = indexBonesByParent(bones);
  const scratch: MutableTransform[] = allocateBoneTransforms(bones.length);

  const place = (x: number, z: number, yawRad: number, pose: Pose): void => {
    group.position.set(x, 0, z);
    group.rotation.set(0, yawRad, 0);
    boneTransformsInto(bones, pose, parentIndex, scratch);
    for (let boneIndex = 0; boneIndex < bones.length; boneIndex++) {
      const mesh = meshes.get(boneIndex);
      if (!mesh) {
        continue;
      }
      const t = scratch[boneIndex]!;
      writeMatrix(mesh.matrix, t.r, t.t);
      mesh.matrixWorldNeedsUpdate = true;
    }
  };

  return { sceneObjects: [group], place };
};

/**
 * A SkinnedMesh's vertex shader computes, per vertex: bindMatrixInverse * boneMatrixWorld *
 * boneInverse * bindMatrix * localVertex, then the renderer multiplies the *mesh's own* matrixWorld on
 * top as usual. With bindMatrix and every boneInverse fixed at identity (see this module's header
 * comment), that collapses to boneMatrixWorld * localVertex — but the mesh's matrixWorld still applies
 * on top of that unconditionally. So if this actor's crowd placement were put on a Group wrapping the
 * mesh (the natural thing to do, and what buildBonesActor does), it would apply *twice*: once baked
 * into every bone's matrixWorld (bones live under the same moving Group) and once more from the mesh's
 * own matrixWorld. The fix: the SkinnedMesh's own transform must stay fixed (added directly to a
 * never-moved container), and the crowd placement instead composes into the ROOT bone's own local
 * matrix — everything below it inherits it normally through the bone hierarchy's matrixWorld chain, and
 * the mesh, sitting elsewhere at a fixed identity transform, contributes nothing extra.
 */
const buildSkinnedActor = (entry: PoolEntry, render: SkinnedPoolRender): StressActor => {
  const { bones } = entry.realized.body;
  const threeBones = bones.map(() => new ThreeBone());
  const parentIndex: ParentIndex = indexBonesByParent(bones);
  let rootIndex = -1;
  for (let i = 0; i < bones.length; i++) {
    threeBones[i]!.matrixAutoUpdate = false;
    const pi = parentIndex[i]!;
    if (pi < 0) {
      rootIndex = i;
      continue;
    }
    threeBones[pi]!.add(threeBones[i]!);
  }
  if (rootIndex < 0) {
    throw new Error('body has no root bone (every bone has a non-null parent)');
  }
  const rootBone = threeBones[rootIndex]!;

  const skeleton = new Skeleton(
    threeBones,
    threeBones.map(() => new Matrix4()), // identity boneInverses — see this function's own comment
  );
  const mesh = new SkinnedMesh(render.geometry, skinnedMaterial);
  mesh.frustumCulled = false; // the geometry's own local bounds sit near the rest pose; skinning (and
  // this actor's own crowd placement, folded into the root bone rather than the mesh) moves the actual
  // visible result somewhere the mesh's static bounding sphere knows nothing about.
  mesh.bind(skeleton, new Matrix4()); // explicit identity bindMatrix — passing one skips the default
  // bind()'s own calculateInverses() call, which would otherwise overwrite the identity boneInverses above.

  const place = (x: number, z: number, yawRad: number, pose: Pose): void => {
    // The root alone needs a real compose() (crowd ∘ local) — cheap, once per actor per frame. Every
    // other bone's local (parent-relative) transform is computed directly (same closed form as
    // core/pose.ts's boneLocalTransform: r = R, t = head - R·head), skipping that function's own
    // allocation since this loop already has to write straight into each THREE.Bone's matrix anyway.
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i]!;
      const r = pose.rotations[bone.id] ?? IDENTITY_M;
      const head = bone.head;
      const hx = head[0];
      const hy = head[1];
      const hz = head[2];
      const ltx = hx - (r[0] * hx + r[1] * hy + r[2] * hz);
      const lty = hy - (r[3] * hx + r[4] * hy + r[5] * hz);
      const ltz = hz - (r[6] * hx + r[7] * hy + r[8] * hz);
      if (i === rootIndex) {
        const root = pose.root;
        const local: Transform = { r, t: [ltx + root[0], lty + root[1], ltz + root[2]] };
        const crowd: Transform = compose(translation([x, 0, z]), rotation(rotY((yawRad * 180) / Math.PI)));
        const final = compose(crowd, local);
        writeMatrix(threeBones[i]!.matrix, final.r, final.t);
      } else {
        writeMatrix(threeBones[i]!.matrix, r, [ltx, lty, ltz]);
      }
      threeBones[i]!.matrixWorldNeedsUpdate = true;
    }
  };

  return { sceneObjects: [mesh, rootBone], place };
};

export const createActor = (entry: PoolEntry, render: PoolRender): StressActor => {
  if (render.kind === 'bones') {
    return buildBonesActor(entry, render);
  }
  if (render.kind === 'skinned') {
    return buildSkinnedActor(entry, render);
  }
  throw new Error("createActor doesn't handle 'crowd' — the whole crowd shares one CrowdRender (buildCrowdRender)");
};

// ---- 'crowd' mode: one shared bone-matrix texture, one InstancedMesh per variant ----
//
// mobgen/CHALLENGES.md §1 (measured on the reference laptop): skinned mode loses to bones mode at 240
// actors (40 vs 53 fps) despite less CPU, and stalls 400-600 ms at >=120 actors. Two suspects: three.js's
// generic skinning shader fetches 4 bone matrices per vertex and blends them (we only ever use 1, weight
// 1 — pure waste), and every actor's own Skeleton uploads its own bone texture to the GPU every frame
// (240 uploads/frame at n=240). Crowd mode fixes both: ONE bone-matrix texture for the entire crowd (one
// upload/frame, not one per actor), fetched with a single texelFetch per vertex (no blending, since a
// voxel belongs to exactly one bone), and one InstancedMesh per variant (pool entry) instead of one
// (Skinned)Mesh per actor — the GPU work three.js would otherwise duplicate per actor collapses to
// exactly the geometry + a slot lookup.

/**
 * The shared texture's layout: `width` = bonesPerSlot * 3 texels, so one actor's whole bone set fits in
 * exactly one texture row (`height` = slot count, one row per actor) — no wraparound to reason about in
 * either the packing code below or the shader's texel math. Each bone occupies 3 consecutive texels
 * within its actor's row (RGBA each): a row-major 3x4 affine matrix, r0 r1 r2 tx | r3 r4 r5 ty | r6 r7 r8
 * tz (no perspective row — every transform here is rigid).
 */
export interface CrowdTextureLayout {
  readonly bonesPerSlot: number;
  readonly width: number;
  readonly height: number;
}

export const crowdTextureLayout = (bonesPerSlot: number, slotCount: number): CrowdTextureLayout => ({
  bonesPerSlot,
  width: bonesPerSlot * 3,
  height: Math.max(1, slotCount),
});

/** Flat Float32Array index (RGBA-interleaved) of bone `bone`'s first texel (row 0 of its 3x4 matrix) in
 * actor `slot`'s row. Add 4/8 for rows 1/2, as packCrowdBoneMatrix does. */
export const crowdTexelIndex = (layout: CrowdTextureLayout, slot: number, bone: number): number =>
  (slot * layout.bonesPerSlot + bone) * 3 * 4;

/** A crowd placement: yaw about Y (radians, three.js/conventions.ts convention: yaw 0 faces -Z) plus an
 * (x, z) translation — the same thing buildBonesActor hands its wrapping Group and buildSkinnedActor
 * composes onto its root bone, just applied to every bone here instead of one Group/root. */
export interface CrowdPlacement {
  readonly x: number;
  readonly z: number;
  readonly yawRad: number;
}

/** Where one bone's matrix lives in the shared texture — grouped (see GaitBasis's own comment in
 * mob/gait.ts for the same reasoning) since `layout`/`slot`/`bone` always travel together and
 * individually would put packCrowdBoneMatrix over useMaxParams. */
export interface CrowdTexel {
  readonly layout: CrowdTextureLayout;
  readonly slot: number;
  readonly bone: number;
}

/**
 * Writes `texel.bone`'s WORLD transform (placement ∘ boneWorld, where `boneWorld` is boneTransformsInto's
 * own output — already "world, if this actor's root sat at the scene origin") for actor `texel.slot` into
 * `data` (the shared texture's backing array). Composes the placement by hand (r' = Ry·r, t' = Ry·t +
 * [x,0,z], with Ry = core/math.ts's rotY(yawDeg) — see its own [c,0,s; 0,1,0; -s,0,c] layout) instead of
 * calling core/math.ts's compose()/rotation()/translation(): those each allocate a fresh Mat3/Vec3/
 * Transform, and this runs for every bone of every actor of every frame (see mobgen/CHALLENGES.md §1 —
 * the same reasoning as boneTransformsInto itself). Verified equal to compose(translation([x,0,z]),
 * rotation(rotY(deg))) composed onto boneWorld by hand once in this module's own derivation (see
 * mobgen's report) and cross-checked in test/stressActors.test.ts against boneTransformsInto +
 * core/math.ts's compose, applied to real points.
 */
export const packCrowdBoneMatrix = (
  data: Float32Array,
  texel: CrowdTexel,
  boneWorld: MutableTransform,
  placement: CrowdPlacement,
): void => {
  const cos = Math.cos(placement.yawRad);
  const sin = Math.sin(placement.yawRad);
  const r = boneWorld.r;
  const t = boneWorld.t;
  const r0 = cos * r[0] + sin * r[6];
  const r1 = cos * r[1] + sin * r[7];
  const r2 = cos * r[2] + sin * r[8];
  const r6 = cos * r[6] - sin * r[0];
  const r7 = cos * r[7] - sin * r[1];
  const r8 = cos * r[8] - sin * r[2];
  const tx = cos * t[0] + sin * t[2] + placement.x;
  const tz = cos * t[2] - sin * t[0] + placement.z;
  const i = crowdTexelIndex(texel.layout, texel.slot, texel.bone);
  data[i] = r0;
  data[i + 1] = r1;
  data[i + 2] = r2;
  data[i + 3] = tx;
  data[i + 4] = r[3];
  data[i + 5] = r[4];
  data[i + 6] = r[5];
  data[i + 7] = t[1];
  data[i + 8] = r6;
  data[i + 9] = r7;
  data[i + 10] = r8;
  data[i + 11] = tz;
};

/** One actor's handle into the shared crowd texture: writing its own row, nothing else. */
export interface CrowdActorHandle {
  readonly place: (x: number, z: number, yawRad: number, pose: Pose) => void;
}

export interface CrowdRender {
  /** The InstancedMeshes (one per variant actually used) — add these to the scene once. */
  readonly sceneObjects: readonly Object3D[];
  /** One handle per actor, in the same order as `assignments` was given to buildCrowdRender. */
  readonly actors: readonly CrowdActorHandle[];
  /** Uploads the shared texture — call once per frame, after every place() call for that frame. A no-op
   * if nothing was placed (e.g. every actor was LOD-skipped this frame). */
  readonly commit: () => void;
  readonly dispose: () => void;
}

/** Which pool entry (variant) one actor uses. */
export interface CrowdVariantAssignment {
  readonly poolIndex: number;
}

const CROWD_VERTEX_DECLARATIONS = /* glsl */ `
uniform highp sampler2D crowdBoneTexture;
attribute float crowdSlot;
attribute float boneIndex;

mat4 crowdBoneMatrix( float slot, float bone ) {

	int x = int( bone ) * 3;
	int y = int( slot );
	vec4 c0 = texelFetch( crowdBoneTexture, ivec2( x, y ), 0 );
	vec4 c1 = texelFetch( crowdBoneTexture, ivec2( x + 1, y ), 0 );
	vec4 c2 = texelFetch( crowdBoneTexture, ivec2( x + 2, y ), 0 );

	return mat4(
		vec4( c0.x, c1.x, c2.x, 0.0 ),
		vec4( c0.y, c1.y, c2.y, 0.0 ),
		vec4( c0.z, c1.z, c2.z, 0.0 ),
		vec4( c0.w, c1.w, c2.w, 1.0 )
	);

}
`;

// Computed independently in each replacement (rather than sharing one `crowdM` local) since
// <beginnormal_vertex> runs *before* <begin_vertex> in three's own vertex shader template (checked
// against the installed three.js version's ShaderLib/meshphysical.glsl.js) — three extra texelFetches
// per vertex, cheap, and it means this doesn't silently break if three ever reorders those chunks again.
const CROWD_BEGIN_VERTEX = /* glsl */ `
mat4 crowdM = crowdBoneMatrix( crowdSlot, boneIndex );
vec3 transformed = ( crowdM * vec4( position, 1.0 ) ).xyz;
`;

const CROWD_BEGINNORMAL_VERTEX = /* glsl */ `
mat4 crowdNormalM = crowdBoneMatrix( crowdSlot, boneIndex );
vec3 objectNormal = mat3( crowdNormalM ) * normal;
`;

/**
 * Builds the whole crowd's three.js objects for 'crowd' mode: one InstancedMesh per variant (pool entry)
 * actually used by `assignments`, sharing one bone-matrix DataTexture sized from the actor count. Unlike
 * 'bones'/'skinned' (one StressActor per actor, each owning its own scene objects), 'crowd' needs
 * crowd-level state — the texture and the InstancedMeshes — that no single actor can own, hence this
 * separate builder instead of createActor.
 *
 * Shadows: this stress scene never enables renderer.shadowMap or any light's castShadow (see stress.ts),
 * so there's no shadow depth pass to patch here — customDepthMaterial doesn't apply. If that changes,
 * the depth material would need the same <begin_vertex> replacement (position only; shadow depth doesn't
 * need normals).
 */
export const buildCrowdRender = (
  pool: readonly PoolEntry[],
  renders: readonly CrowdPoolRender[],
  assignments: readonly CrowdVariantAssignment[],
): CrowdRender => {
  const slotCount = assignments.length;
  const bonesPerSlot = Math.max(1, ...pool.map((entry) => entry.realized.body.bones.length));
  const layout = crowdTextureLayout(bonesPerSlot, slotCount);
  const data = new Float32Array(layout.width * layout.height * 4);
  // Identity (r = I, t = 0) for every slot/bone by default: every actor is placed at least once before
  // the first render in practice, but this keeps an unplaced slot's geometry at the origin (a stationary,
  // recognizable rest pose) instead of the zero matrix a fresh Float32Array would otherwise leave it at.
  for (let slot = 0; slot < layout.height; slot++) {
    for (let bone = 0; bone < layout.bonesPerSlot; bone++) {
      const i = crowdTexelIndex(layout, slot, bone);
      data[i] = 1;
      data[i + 5] = 1;
      data[i + 10] = 1;
    }
  }

  const texture = new DataTexture(data, layout.width, layout.height, RGBAFormat, FloatType);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  // A fresh material per build (not a module-level singleton like fleshMaterial/skinnedMaterial): its
  // onBeforeCompile closes over *this* build's texture, and a rebuild (actor count change, mode switch)
  // gets a new texture, so it needs a new material too. customProgramCacheKey keeps it from being
  // (mis)treated as cache-equivalent to a plain MeshStandardMaterial with the same base parameters.
  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.92,
    metalness: 0.02,
  });
  material.customProgramCacheKey = () => 'mobgen-crowd-bone-texture';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.crowdBoneTexture = { value: texture };
    shader.vertexShader = `${CROWD_VERTEX_DECLARATIONS}\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', CROWD_BEGIN_VERTEX)
      .replace('#include <beginnormal_vertex>', CROWD_BEGINNORMAL_VERTEX);
  };

  const byVariant = new Map<number, number[]>();
  for (let slot = 0; slot < slotCount; slot++) {
    const { poolIndex } = assignments[slot]!;
    const slots = byVariant.get(poolIndex);
    if (slots) {
      slots.push(slot);
    } else {
      byVariant.set(poolIndex, [slot]);
    }
  }

  const sceneObjects: Object3D[] = [];
  const actors: CrowdActorHandle[] = new Array(slotCount);
  let dirty = false;

  for (const [poolIndex, slots] of byVariant) {
    const entry = pool[poolIndex]!;
    const render = renders[poolIndex]!;
    const count = slots.length;
    const { bones } = entry.realized.body;
    const parentIndex = indexBonesByParent(bones);
    // Shared across every actor of this one variant, not per actor: each place() call fully consumes it
    // (FK, then immediately packed into the texture) before returning, so nothing overlaps — see
    // buildBonesActor's identical per-actor version of this scratch for the general reasoning.
    const scratch = allocateBoneTransforms(bones.length);

    const mesh = new InstancedMesh(render.geometry, material, count);
    mesh.frustumCulled = false; // see buildSkinnedActor's own note: the geometry's local bounds don't
    // reflect where the shared texture + crowdSlot actually place each instance.
    // instanceMatrix must be identity, not its zero-filled default (three.js still multiplies mvPosition
    // by it in <project_vertex>, which our <begin_vertex> replacement runs before, not instead of).
    const instanceArray = mesh.instanceMatrix.array as Float32Array;
    for (let k = 0; k < count; k++) {
      instanceArray[k * 16] = 1;
      instanceArray[k * 16 + 5] = 1;
      instanceArray[k * 16 + 10] = 1;
      instanceArray[k * 16 + 15] = 1;
    }
    mesh.instanceMatrix.needsUpdate = true;

    const crowdSlotArray = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      crowdSlotArray[k] = slots[k]!;
    }
    mesh.geometry.setAttribute('crowdSlot', new InstancedBufferAttribute(crowdSlotArray, 1));

    sceneObjects.push(mesh);

    for (const slot of slots) {
      actors[slot] = {
        place: (x: number, z: number, yawRad: number, pose: Pose): void => {
          boneTransformsInto(bones, pose, parentIndex, scratch);
          const placement: CrowdPlacement = { x, z, yawRad };
          for (let bone = 0; bone < bones.length; bone++) {
            packCrowdBoneMatrix(data, { layout, slot, bone }, scratch[bone]!, placement);
          }
          dirty = true;
        },
      };
    }
  }

  return {
    sceneObjects,
    actors,
    commit: (): void => {
      if (dirty) {
        texture.needsUpdate = true;
        dirty = false;
      }
    },
    dispose: (): void => {
      // Geometries are pool-owned (disposed via disposePoolRender); only this build's own texture and
      // material belong to this CrowdRender.
      texture.dispose();
      material.dispose();
    },
  };
};
