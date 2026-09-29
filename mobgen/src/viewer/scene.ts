// Builds three.js objects from a realized actor. This is the only place core
// types are converted to three.js types (gungen's src/viewer/scene.ts does
// the same for its domain).

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import type { Material } from '../core/body.ts';
import type { Realized } from '../core/generate.ts';
import { applyPoint, type Transform, type Vec3 } from '../core/math.ts';
import type { BoneMesh } from '../core/mesh.ts';
import { boneTransforms, type Pose } from '../core/pose.ts';
import { materialOf, shadeOf } from '../core/voxelize.ts';

/** Exported for stress.ts: same rest-world -> posed-world matrix every applyPose call here uses,
 * needed there too (per-actor bone/mesh matrices, built without going through buildActor's groups). */
export const matrixOf = (t: Transform): Matrix4 => {
  const { r, t: p } = t;
  // three.js Matrix4.set takes elements row-major.
  return new Matrix4().set(r[0], r[1], r[2], p[0], r[3], r[4], r[5], p[1], r[6], r[7], r[8], p[2], 0, 0, 0, 1);
};

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Shade 0..3 (see voxelize.ts) as a brightness multiplier on the material's base colour. */
const SHADE_FACTORS = [0.72, 0.88, 1.04, 1.2] as const;

/** Exported for stress.ts: turns a BoneMesh's palette-index colour bytes into per-vertex RGB, same as
 * every flesh mesh here — reused there so a merged (skinned) geometry gets identical vertex colours. */
export const vertexColors = (colorBytes: Uint8Array, palette: Readonly<Record<Material, Vec3>>): Float32Array => {
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

/** Exported for stress.ts: one bone's BoneMesh as a BufferGeometry, in the same rest-world coordinates
 * boneTransforms/matrixOf pose from. */
export const geometryOf = (mesh: BoneMesh, palette: Readonly<Record<Material, Vec3>>): BufferGeometry => {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geo.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  geo.setAttribute('color', new BufferAttribute(vertexColors(mesh.colors, palette), 3));
  geo.setIndex(new BufferAttribute(mesh.indices, 1));
  geo.computeBoundingSphere();
  return geo;
};

/** A distinct, stable colour per bone index (golden-angle hue step, so adjacent indices read apart). */
const boneColor = (index: number): Color => new Color().setHSL((index * 0.618_034) % 1, 0.55, 0.55);

export interface Actor {
  /** Everything below in one group, for framing/disposal. */
  readonly root: Group;
  readonly flesh: Group;
  readonly colorByBone: Group;
  readonly skeleton: Group;
  /** Applies a pose (from gait.ts, or the identity rest pose) to every part above. */
  readonly applyPose: (pose: Pose) => void;
}

const DOT_RADIUS_FACTOR = 0.35; // relative to voxel size, just big enough to read as a joint

/** Builds the flesh, colour-by-bone and skeleton layers for one realized actor. Call `applyPose`
 * once after building (and again each frame, for the walk) to place every bone. */
export const buildActor = (realized: Realized, voxelSize: number): Actor => {
  const { body, meshes, report } = realized;
  const flesh = new Group();
  const colorByBone = new Group();
  const skeleton = new Group();
  const root = new Group();
  root.add(flesh, colorByBone, skeleton);

  const fleshMeshes = new Map<number, Mesh>();
  const tintMeshes = new Map<number, Mesh>();
  for (const [boneIndex, boneMesh] of meshes) {
    const bone = body.bones[boneIndex]!;
    const geometry = geometryOf(boneMesh, body.palette);

    const fleshMesh = new Mesh(
      geometry,
      new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.02 }),
    );
    fleshMesh.matrixAutoUpdate = false;
    fleshMesh.userData = { boneId: bone.id, voxelCount: report.stats.perBoneVoxels[bone.id] ?? 0 };
    flesh.add(fleshMesh);
    fleshMeshes.set(boneIndex, fleshMesh);

    const tintMesh = new Mesh(
      geometry,
      new MeshStandardMaterial({ color: boneColor(boneIndex), flatShading: true, roughness: 0.92, metalness: 0.02 }),
    );
    tintMesh.matrixAutoUpdate = false;
    tintMesh.userData = fleshMesh.userData;
    colorByBone.add(tintMesh);
    tintMeshes.set(boneIndex, tintMesh);
  }

  // Skeleton: a line per bone (head -> tail) plus a dot at every head, drawn on top (no depth test)
  // so bent joints stay legible even inside the flesh.
  const boneCount = body.bones.length;
  const linePositions = new Float32Array(boneCount * 2 * 3);
  const lineGeometry = new BufferGeometry();
  const linePositionAttr = new BufferAttribute(linePositions, 3);
  linePositionAttr.setUsage(DynamicDrawUsage);
  lineGeometry.setAttribute('position', linePositionAttr);
  const lines = new LineSegments(
    lineGeometry,
    new LineBasicMaterial({ color: 0xff_e6_8a, depthTest: false, transparent: true, opacity: 0.9 }),
  );
  lines.renderOrder = 999;
  lines.frustumCulled = false; // the position buffer changes every frame; don't rely on a stale bounding sphere
  const dots = new InstancedMesh(
    new SphereGeometry(voxelSize * DOT_RADIUS_FACTOR, 8, 6),
    new MeshStandardMaterial({ color: 0xff_4d_4d, depthTest: false, transparent: true, opacity: 0.95 }),
    boneCount,
  );
  dots.renderOrder = 999;
  dots.frustumCulled = false;
  dots.instanceMatrix.setUsage(DynamicDrawUsage);
  skeleton.add(lines, dots);

  const dotMatrix = new Matrix4();
  const applyPose = (pose: Pose): void => {
    const transforms = boneTransforms(body.bones, pose);
    for (const [boneIndex, bone] of body.bones.entries()) {
      const t = transforms.get(bone.id)!;
      const m = matrixOf(t);
      const fm = fleshMeshes.get(boneIndex);
      if (fm) {
        fm.matrix.copy(m);
        fm.matrixWorldNeedsUpdate = true;
      }
      const tm = tintMeshes.get(boneIndex);
      if (tm) {
        tm.matrix.copy(m);
        tm.matrixWorldNeedsUpdate = true;
      }
      const head = applyPoint(t, bone.head);
      const tail = applyPoint(t, bone.tail);
      linePositions[boneIndex * 6] = head[0];
      linePositions[boneIndex * 6 + 1] = head[1];
      linePositions[boneIndex * 6 + 2] = head[2];
      linePositions[boneIndex * 6 + 3] = tail[0];
      linePositions[boneIndex * 6 + 4] = tail[1];
      linePositions[boneIndex * 6 + 5] = tail[2];
      dotMatrix.makeTranslation(head[0], head[1], head[2]);
      dots.setMatrixAt(boneIndex, dotMatrix);
    }
    linePositionAttr.needsUpdate = true;
    dots.instanceMatrix.needsUpdate = true;
  };

  return { root, flesh, colorByBone, skeleton, applyPose };
};

export const disposeActor = (actor: Actor): void => {
  actor.root.traverse((obj) => {
    const o = obj as Mesh;
    o.geometry?.dispose();
    const m = o.material;
    if (Array.isArray(m)) {
      for (const x of m) {
        x.dispose();
      }
    } else {
      m?.dispose();
    }
  });
};

// ---- The deadvox shambler, for scale comparison ----
// Box sizes and colours copied from deadvox/src/render/zombies.ts's BOXES constant (not imported:
// subprojects don't share code across the repo boundary). Kept in metres, at the same scale as the
// generated figure, placed 1 m to its right (+X).

interface ShamblerBox {
  readonly size: readonly [number, number, number];
  readonly at: readonly [number, number, number];
}

const SHAMBLER_BOXES: Readonly<Record<string, ShamblerBox>> = {
  body: { size: [0.42, 0.78, 0.28], at: [0, 1.02, 0] },
  head: { size: [0.3, 0.32, 0.3], at: [0, 1.58, 0] },
  leftArm: { size: [0.15, 0.68, 0.16], at: [-0.225, 1.02, 0] },
  rightArm: { size: [0.15, 0.68, 0.16], at: [0.225, 1.02, 0] },
  leftLeg: { size: [0.18, 0.62, 0.2], at: [-0.12, 0.62, 0] },
  rightLeg: { size: [0.18, 0.62, 0.2], at: [0.12, 0.62, 0] },
};
const SHAMBLER_FLESH_COLOR = 0x87_96_78;
const SHAMBLER_CLOTHES_COLOR = 0x68_6f_5e;
const SHAMBLER_OFFSET_X = 1;

export const buildShambler = (): Group => {
  const group = new Group();
  for (const [part, box] of Object.entries(SHAMBLER_BOXES)) {
    const flesh = part === 'body' || part === 'head';
    const mesh = new Mesh(
      new BoxGeometry(...box.size),
      new MeshStandardMaterial({ color: flesh ? SHAMBLER_FLESH_COLOR : SHAMBLER_CLOTHES_COLOR, flatShading: true }),
    );
    mesh.position.set(box.at[0] + SHAMBLER_OFFSET_X, box.at[1], box.at[2]);
    mesh.userData = { boneId: `shambler ${part}` };
    group.add(mesh);
  }
  return group;
};
