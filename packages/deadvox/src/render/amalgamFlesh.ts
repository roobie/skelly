// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves through this package's aliases.
import type { Body } from '@mobgen/core/body.ts';
import type { Realized } from '@mobgen/core/generate.ts';
import { type Mat3, mat3ToQuat, quatToMat3 } from '@mobgen/core/math.ts';
import { type BoneMesh, meshBones } from '@mobgen/core/mesh.ts';
import { materialOf, shadeOf, type Voxels, worldPosition } from '@mobgen/core/voxelize.ts';
import { crowdEmission } from '@mobgen/mob/crowd.ts';
import { BufferAttribute, BufferGeometry, type Color, type Group, Mesh, MeshLambertMaterial } from 'three';
import type { Vec3 } from '../core/coords.ts';
import type { Quaternion } from '../core/spatial.ts';
import { patchHeightFog } from './heightFog.ts';
import { type Ragdoll, type RagdollWorld, ragdollContent } from './ragdoll.ts';
import type { RigidBody, RigidWorld } from './rigidImpulse.ts';
import { castsAndReceives } from './shadowFlags.ts';

// The amalgam's carved flesh (core/amalgamCarving.ts, Zombie.carved), drawn two ways: the body rebuilt
// without its carved voxels, so each hole shows from every side with flesh-coloured walls, and the chunk a
// hit knocks out, flying off as render-only debris. Neither touches the simulation.

/** Same conversion mobgen's own viewer/scene.ts uses (not importable — that file pulls in three and
 * the DOM) — palette-index colour bytes to per-vertex RGB. */
const SHADE_FACTORS = [0.72, 0.88, 1.04, 1.2] as const;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const vertexColorsFrom = (
  colorBytes: Uint8Array,
  materials: Body['materials'],
  voxels: Pick<Voxels, 'materials'>,
): Float32Array => {
  const out = new Float32Array(colorBytes.length * 3);
  for (let v = 0; v < colorBytes.length; v++) {
    const byte = colorBytes[v]!;
    const base = materials[materialOf(voxels, byte)]!.color;
    const factor = SHADE_FACTORS[shadeOf(byte)] ?? 1;
    out[v * 3] = clamp01(base[0] * factor);
    out[v * 3 + 1] = clamp01(base[1] * factor);
    out[v * 3 + 2] = clamp01(base[2] * factor);
  }
  return out;
};

/**
 * `neighbourBone` for a face a carved hole exposed: flesh inside the body. The crowd shader's gore tint
 * ignores negative neighbours, so it stays plain until a gore effect keys on this value.
 */
export const CARVED_NEIGHBOUR = -2;

interface CarvedFaces {
  /** The pseudo-bone the carved cells were given while meshing. */
  readonly neighbour: number;
  readonly color: Color;
}

interface VertexSource {
  readonly mesh: BoneMesh;
  readonly vertex: number;
  readonly materials: Body['materials'];
  readonly voxels: Pick<Voxels, 'materials'>;
  readonly carved: CarvedFaces | undefined;
}

/** A hole wall takes the carved colour and marker; any other face takes its neighbour and its material's emission. */
const writeVertexSurface = (
  out: { neighbour: Float32Array; emission: Float32Array; colors: Float32Array },
  at: number,
  { mesh, vertex, materials, voxels, carved }: VertexSource,
): void => {
  if (carved !== undefined && mesh.neighbourBone[vertex] === carved.neighbour) {
    out.neighbour[at] = CARVED_NEIGHBOUR;
    out.colors[at * 3] = carved.color.r;
    out.colors[at * 3 + 1] = carved.color.g;
    out.colors[at * 3 + 2] = carved.color.b;
    return;
  }
  out.neighbour[at] = mesh.neighbourBone[vertex]!;
  out.emission.set(crowdEmission(materials[materialOf(voxels, mesh.colors[vertex]!)]!), at * 2);
};

/** Merged geometry for one body: like mobgen's own buildCrowdGeometry (stressActors.ts, not importable for
 * the same reason as vertexColorsFrom above) — one float `boneIndex` per vertex instead of
 * skinIndex/skinWeight, fetched straight from the shared bone texture in the vertex shader. */
export const mergeBoneMeshes = (
  meshes: ReadonlyMap<number, BoneMesh>,
  materials: Body['materials'],
  voxels: Pick<Voxels, 'materials'>,
  carved?: CarvedFaces,
): BufferGeometry => {
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
  // -1 for a face exposed to empty space, CARVED_NEIGHBOUR for one a hole exposed, else the neighbouring
  // bone's own index — dismemberment's gore effect (crowd.ts) tints a face whose neighbour has just been
  // severed but this bone hasn't.
  const neighbourBoneAttr = new Float32Array(vertexCount);
  const emissionAttr = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);

  let vertexOffset = 0;
  let indexOffset = 0;
  for (const [boneIndex, mesh] of meshes) {
    const vertices = mesh.positions.length / 3;
    positions.set(mesh.positions, vertexOffset * 3);
    normals.set(mesh.normals, vertexOffset * 3);
    colors.set(vertexColorsFrom(mesh.colors, materials, voxels), vertexOffset * 3);
    boneIndexAttr.fill(boneIndex, vertexOffset, vertexOffset + vertices);
    for (let v = 0; v < vertices; v++) {
      writeVertexSurface({ neighbour: neighbourBoneAttr, emission: emissionAttr, colors }, vertexOffset + v, {
        mesh,
        vertex: v,
        materials,
        voxels,
        carved,
      });
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
  geometry.setAttribute('boneIndex', new BufferAttribute(boneIndexAttr, 1));
  geometry.setAttribute('neighbourBone', new BufferAttribute(neighbourBoneAttr, 1));
  geometry.setAttribute('crowdEmission', new BufferAttribute(emissionAttr, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
};

/**
 * The body with its carved cells knocked out. Meshing it with the carved cells owned by one extra
 * pseudo-bone exposes every face that borders a hole, and marks it with that bone as its neighbour: those
 * are the hole's walls, coloured `interior`. The pseudo-bone's own mesh is dropped.
 */
export const buildCarvedGeometry = (realized: Realized, carved: readonly number[], interior: Color): BufferGeometry => {
  const { voxels, body } = realized;
  const hole = body.bones.length;
  if (hole + 1 > 255) {
    throw new Error(`An amalgam with ${hole} bones has no owner value left for its carved cells`);
  }
  const owner = Uint8Array.from(voxels.owner);
  for (const cell of carved) {
    owner[cell] = hole + 1;
  }
  const meshes = meshBones({ ...voxels, owner }, hole + 1);
  meshes.delete(hole);
  return mergeBoneMeshes(meshes, body.materials, voxels, { neighbour: hole, color: interior });
};

/** The flesh one hit knocked out, where it was on the body when it came away. */
export interface FleshChunkSpawn {
  readonly realized: Realized;
  readonly scale: number;
  /** Cells of the realized voxel grid. */
  readonly cells: readonly number[];
  /** World placement of the cells' rest frame: world = translation + rotation · (scale · rest), metres. */
  readonly rotation: Mat3;
  readonly translation: Vec3;
  /** The strike's unit direction: the chunk flies on along it. */
  readonly direction: Vec3;
}

interface FleshChunk {
  readonly mesh: Mesh;
  readonly body: RigidBody;
  readonly physics: Ragdoll;
  readonly order: number;
  ageRealSeconds: number;
  groundedAtRealSeconds: number | undefined;
}

const tuning = ragdollContent.flesh;

const rotate = (r: Mat3, p: Vec3): Vec3 => [
  r[0] * p[0] + r[1] * p[1] + r[2] * p[2],
  r[3] * p[0] + r[4] * p[1] + r[5] * p[2],
  r[6] * p[0] + r[7] * p[1] + r[8] * p[2],
];

/** Flying chunks of carved flesh, capped: the oldest goes first. Render-only; each settles, lies, then sinks. */
export class FleshChunks {
  private readonly chunks: FleshChunk[] = [];
  private readonly material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly group: Group;
  private readonly onLanded: ((centre: Vec3) => void) | undefined;

  private readonly owner: { physics: () => RagdollWorld; ground: () => RigidWorld; reserve: () => number | undefined };

  constructor(
    group: Group,
    owner: { physics: () => RagdollWorld; ground: () => RigidWorld; reserve: () => number | undefined },
    onLanded?: (centre: Vec3) => void,
  ) {
    this.owner = owner;
    this.group = group;
    this.onLanded = onLanded;
    this.material.customProgramCacheKey = () => 'deadvox-flesh-chunk';
    this.material.onBeforeCompile = (shader) => patchHeightFog(shader, 'mob');
  }

  get count(): number {
    return this.chunks.length;
  }

  spawn({ realized, scale, cells, rotation, translation, direction }: FleshChunkSpawn): void {
    if (cells.length === 0) {
      return;
    }
    const order = this.owner.reserve();
    if (order === undefined) {
      return;
    }
    const { voxels, body } = realized;
    const owner = new Uint8Array(voxels.owner.length);
    const centre: Vec3 = [0, 0, 0];
    for (const cell of cells) {
      owner[cell] = voxels.owner[cell]!;
      const i = cell % voxels.dims[0];
      const j = Math.floor(cell / voxels.dims[0]) % voxels.dims[1];
      const k = Math.floor(cell / (voxels.dims[0] * voxels.dims[1]));
      const point = worldPosition(voxels, i, j, k);
      centre[0] += point[0] / cells.length;
      centre[1] += point[1] / cells.length;
      centre[2] += point[2] / cells.length;
    }
    const geometry = mergeBoneMeshes(meshBones({ ...voxels, owner }, body.bones.length), body.materials, voxels);
    geometry.translate(-centre[0], -centre[1], -centre[2]);
    geometry.scale(scale, scale, scale);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const half: Vec3 = [
      Math.max(1e-3, (box.max.x - box.min.x) / 2),
      Math.max(1e-3, (box.max.y - box.min.y) / 2),
      Math.max(1e-3, (box.max.z - box.min.z) / 2),
    ];
    const mass = cells.length * (voxels.size * scale) ** 3 * tuning.density;
    const inertia: Vec3 = [
      (mass / 3) * (half[1] ** 2 + half[2] ** 2),
      (mass / 3) * (half[0] ** 2 + half[2] ** 2),
      (mass / 3) * (half[0] ** 2 + half[1] ** 2),
    ];
    const offset = rotate(rotation, [centre[0] * scale, centre[1] * scale, centre[2] * scale]);
    // Spin about the horizontal axis across the strike, so the chunk tumbles away from the hit.
    const across = Math.hypot(direction[0], direction[2]) > 1e-6 ? [-direction[2], 0, direction[0]] : [1, 0, 0];
    const acrossLength = Math.hypot(...across);
    const spin =
      (tuning.launchSpin * ragdollContent.debris.impulseScale * (inertia[0] + inertia[1] + inertia[2])) /
      3 /
      acrossLength;
    const corners: Vec3[] = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          corners.push([sx * half[0], sy * half[1], sz * half[2]]);
        }
      }
    }
    const rigid: RigidBody = {
      mass,
      center: [translation[0] + offset[0], translation[1] + offset[1], translation[2] + offset[2]],
      orientation: mat3ToQuat(rotation) as Quaternion,
      velocity: [
        direction[0] * tuning.launchSpeed * ragdollContent.debris.impulseScale,
        (direction[1] * tuning.launchSpeed + tuning.launchLift) * ragdollContent.debris.impulseScale,
        direction[2] * tuning.launchSpeed * ragdollContent.debris.impulseScale,
      ],
      angularMomentum: [across[0]! * spin, across[1]! * spin, across[2]! * spin],
      inertiaBody: [
        [inertia[0], 0, 0],
        [0, inertia[1], 0],
        [0, 0, inertia[2]],
      ],
      corners,
      asleep: false,
    };
    const mesh = new Mesh(geometry, this.material);
    mesh.matrixAutoUpdate = false;
    castsAndReceives(mesh);
    this.group.add(mesh);
    this.chunks.push({
      mesh,
      body: rigid,
      physics: this.owner.physics().spawnRigid(rigid, this.owner.ground()),
      order,
      ageRealSeconds: 0,
      groundedAtRealSeconds: undefined,
    });
    this.place(this.chunks.at(-1)!, 0);
  }

  /** Steps every chunk against the world; drops each once it has lain and sunk, or never settled. */
  update(dt: number): void {
    for (let index = this.chunks.length - 1; index >= 0; index--) {
      const chunk = this.chunks[index]!;
      chunk.ageRealSeconds += dt;
      if (chunk.body.asleep && chunk.groundedAtRealSeconds === undefined) {
        chunk.groundedAtRealSeconds = chunk.ageRealSeconds;
        this.onLanded?.([...chunk.body.center]);
      }
      const sinking =
        chunk.groundedAtRealSeconds === undefined
          ? 0
          : chunk.ageRealSeconds - chunk.groundedAtRealSeconds - tuning.lieSeconds;
      if (
        sinking >= tuning.sinkSeconds ||
        chunk.ageRealSeconds >= tuning.maxAgeSeconds ||
        this.owner.physics().failed
      ) {
        this.remove(index);
        continue;
      }
      if (sinking > 0) {
        this.owner.physics().hideColliders(chunk.physics);
      }
      this.place(chunk, (Math.max(0, sinking) / tuning.sinkSeconds) * tuning.sinkDepthMetres);
    }
  }

  get oldestOrder(): number {
    return this.chunks[0]?.order ?? Number.POSITIVE_INFINITY;
  }

  evictOldest(): void {
    this.remove(0);
  }

  dispose(): void {
    while (this.chunks.length > 0) {
      this.remove(this.chunks.length - 1);
    }
    this.material.dispose();
  }

  private place(chunk: FleshChunk, sinkMetres: number): void {
    const r = quatToMat3(chunk.body.orientation);
    const [x, y, z] = chunk.body.center;
    chunk.mesh.matrix.set(r[0], r[1], r[2], x, r[3], r[4], r[5], y - sinkMetres, r[6], r[7], r[8], z, 0, 0, 0, 1);
    chunk.mesh.matrixWorldNeedsUpdate = true;
  }

  private remove(index: number): void {
    const [chunk] = this.chunks.splice(index, 1);
    if (chunk) {
      this.owner.physics().remove(chunk.physics);
      this.group.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
    }
  }
}
