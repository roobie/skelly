// Builds and poses the three.js objects for one stress-test actor, in either of two render paths
// (see stress.ts for the HUD/simulation/UI side):
//
//   'bones'   — exactly buildActor's approach (scene.ts): one Mesh per bone, posed every frame by
//               setting its matrix from boneTransforms. Geometries are built once per pool entry and
//               shared (never re-meshed) across every actor referencing that entry.
//   'skinned' — one merged BufferGeometry per pool entry (skinIndex = bone index, weight 1) and one
//               three.js Skeleton per actor (its own THREE.Bone hierarchy, mirroring body.bones'
//               parent/child structure), driving a SkinnedMesh that shares the pool entry's geometry
//               and a single, fully shared material. One draw call per actor either way at the
//               triangle level three.js reports it (bones mode: many small draws, one per bone-mesh
//               per actor; skinned mode: exactly one).
//
// Bind-pose note (see buildSkinnedActor): every bone's *local* (parent-relative) matrix at pose
// {root:[0,0,0], rotations:{}} is the identity (bone head/tail are already baked into rest-world
// coordinates — see core/body.ts), so binding with an explicit identity bindMatrix and identity
// boneInverses reproduces boneTransforms' own composition exactly, with no separate "measure the rest
// pose" step needed.

import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Skeleton,
  SkinnedMesh,
  Bone as ThreeBone,
} from 'three';
import { generateValid, type Realized } from '../core/generate.ts';
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

export type Mode = 'bones' | 'skinned';

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

/** Generates one pool entry: template cycles shambler/runner/brute (poolIndex % TEMPLATES.length),
 * seed search starts at `fromSeed` (pass 1 for the first entry of a template, then each result's own
 * `nextSeed` for the next one of that same template). */
export const generatePoolEntry = (poolIndex: number, fromSeed: number): PoolGenResult => {
  const template = TEMPLATES[poolIndex % TEMPLATES.length]!;
  const t0 = performance.now();
  const found = generateValid(template, fromSeed);
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

export type PoolRender = BonesPoolRender | SkinnedPoolRender;

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

export const buildPoolRender = (entry: PoolEntry, mode: Mode): PoolRender => {
  if (mode === 'bones') {
    const geometries = new Map<number, BufferGeometry>();
    for (const [boneIndex, boneMesh] of entry.realized.meshes) {
      geometries.set(boneIndex, geometryOf(boneMesh, entry.realized.body.palette));
    }
    return { kind: 'bones', geometries };
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

export const createActor = (entry: PoolEntry, render: PoolRender): StressActor =>
  render.kind === 'bones' ? buildBonesActor(entry, render) : buildSkinnedActor(entry, render);
