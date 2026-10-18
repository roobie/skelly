import type { Body, Bone, Feature } from '../core/body.ts';
import type { Realized } from '../core/generate.ts';
import {
  add,
  cross,
  dot,
  IDENTITY_M,
  length,
  type Mat3,
  mulMM,
  mulMV,
  normalize,
  scale,
  sub,
  transpose,
  type Vec3,
} from '../core/math.ts';
import type { Shape } from '../core/sdf.ts';
import type { Genome } from '../core/template.ts';
import { rasterizeFeatures, type Voxels, worldPosition } from '../core/voxelize.ts';
import type { AcidFeature } from './acid.ts';
import type { AcidTemplate } from './acidTemplate.ts';

const EPSILON = 1e-9;
const matrix = (bone: Bone): Mat3 => {
  const { x, y, z } = bone.frame!;
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
};
const skin = (f: Feature) => f.op === 'add' && f.material === 'skin' && (f as AcidFeature).anatomy !== 'digit';
const transformShape = (shape: Shape, inverse: Mat3, origin: Vec3): Shape => {
  const point = (p: Vec3) => mulMV(inverse, sub(p, origin));
  if (shape.kind === 'capsule') {
    return { ...shape, a: point(shape.a), b: point(shape.b) };
  }
  return { ...shape, center: point(shape.center), rot: mulMM(inverse, shape.rot ?? IDENTITY_M) };
};

export const fleshInFrame = (
  body: Body,
  selected: readonly string[],
  { frame, origin }: { readonly frame: Bone; readonly origin: Vec3 },
  cellSize: number,
): Voxels => {
  const inverse = transpose(matrix(frame));
  const bones = body.bones
    .filter((bone) => selected.includes(bone.id))
    .map((bone) => ({
      ...bone,
      parent: selected.includes(bone.parent ?? '') ? bone.parent : null,
      head: mulMV(inverse, sub(bone.head, origin)),
      tail: mulMV(inverse, sub(bone.tail, origin)),
    }));
  const features = body.features
    .filter((f) => selected.includes(f.bone) && skin(f))
    .map((f) => ({ ...f, shape: transformShape(f.shape, inverse, origin) }));
  return rasterizeFeatures({ ...body, bones, features }, cellSize, 0);
};

export interface Section {
  readonly y: number;
  readonly width: number;
  readonly depth: number;
  readonly area: number;
  readonly fill: number;
  readonly aspect: number;
}

export const sectionsOf = (voxels: Voxels): Section[] => {
  const [nx, ny] = voxels.dims;
  const rows = new Map<number, { minX: number; maxX: number; minZ: number; maxZ: number; area: number }>();
  voxels.owner.forEach((owner, index) => {
    if (!owner) {
      return;
    }
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / (nx * ny));
    const row = rows.get(y) ?? { minX: x, maxX: x, minZ: z, maxZ: z, area: 0 };
    row.minX = Math.min(row.minX, x);
    row.maxX = Math.max(row.maxX, x);
    row.minZ = Math.min(row.minZ, z);
    row.maxZ = Math.max(row.maxZ, z);
    row.area += 1;
    rows.set(y, row);
  });
  return [...rows]
    .map(([y, row]) => {
      const width = row.maxX - row.minX + 1;
      const depth = row.maxZ - row.minZ + 1;
      return {
        y: (y + voxels.origin[1] + 0.5) * voxels.size,
        width: width * voxels.size,
        depth: depth * voxels.size,
        area: row.area,
        fill: row.area / (width * depth),
        aspect: width / depth,
      };
    })
    .sort((a, b) => a.y - b.y);
};

export const widestSection = (sections: readonly Section[]): Section => {
  if (sections.length === 0) {
    throw new Error('cannot measure an empty flesh section');
  }
  return sections.reduce((best, section) =>
    section.width > best.width || (section.width === best.width && section.area > best.area) ? section : best,
  );
};

const measuredBone = (body: Body, id: string): Bone => {
  const bone = body.bones.find((candidate) => candidate.id === id);
  if (!bone) {
    throw new Error(`missing measured bone ${id}`);
  }
  return bone;
};

export const sectionAcceptance = (
  section: Section,
  limits: { readonly maximumSectionFill: number; readonly minimumSectionAspect: number },
) => ({
  ...section,
  passes:
    section.fill <= limits.maximumSectionFill + EPSILON && section.aspect >= limits.minimumSectionAspect - EPSILON,
});

export const taperAcceptance = (
  sections: readonly Section[],
  boneLength: number,
  voxelSize: number,
  { minimumTaperVoxels, peakRange }: { readonly minimumTaperVoxels: number; readonly peakRange: readonly number[] },
) => {
  const peak = widestSection(sections);
  const minimumWidth = Math.min(...sections.map((section) => section.width));
  const widthVariation = peak.width - minimumWidth;
  const peakAlong = peak.y / boneLength;
  return {
    minimumWidth,
    maximumWidth: peak.width,
    widthVariation,
    peakAlong,
    passes:
      widthVariation >= minimumTaperVoxels * voxelSize - EPSILON &&
      peakAlong >= peakRange[0]! - EPSILON &&
      peakAlong <= peakRange[1]! + EPSILON,
  };
};

export const closestSection = (sections: readonly Section[], y: number): Section => {
  if (sections.length === 0) {
    throw new Error('missing joint slab');
  }
  return sections.reduce((best, section) => (Math.abs(section.y - y) < Math.abs(best.y - y) ? section : best));
};

export interface SideCell {
  readonly y: number;
  readonly z: number;
}
export interface BackRay {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

const farthest = (
  cells: readonly SideCell[],
  cellSize: number,
  { origin: point, direction }: BackRay,
  ray: boolean,
): number => {
  const half = cellSize / 2;
  let rear = Number.NEGATIVE_INFINITY;
  for (const cell of cells) {
    let lo = ray ? 0 : Number.NEGATIVE_INFINITY;
    let hi = Number.POSITIVE_INFINITY;
    for (const [value, center, axis] of [
      [point[1], cell.y, direction[1]],
      [point[2], cell.z, direction[2]],
    ] as const) {
      if (Math.abs(axis) <= EPSILON) {
        if (Math.abs(value - center) > half + EPSILON) {
          hi = Number.NEGATIVE_INFINITY;
          break;
        }
      } else {
        const a = (center - half - value) / axis;
        const b = (center + half - value) / axis;
        lo = Math.max(lo, Math.min(a, b));
        hi = Math.min(hi, Math.max(a, b));
      }
    }
    if (lo <= hi + EPSILON) {
      rear = Math.max(rear, hi);
    }
  }
  if (!Number.isFinite(rear)) {
    throw new Error('back ray has no filled measuring cells');
  }
  return rear;
};

export const backStations = (
  cells: readonly SideCell[],
  { cellSize, stationSize }: { readonly cellSize: number; readonly stationSize: number },
  lower: BackRay,
  upper: BackRay,
) => {
  const endpoint = (ray: BackRay): Vec3 => {
    const origin: Vec3 = [0, ray.origin[1], ray.origin[2]];
    const direction = normalize([0, ray.direction[1], ray.direction[2]]);
    return add(origin, scale(direction, farthest(cells, cellSize, { origin, direction }, true)));
  };
  const start = endpoint(lower);
  const end = endpoint(upper);
  const chord = sub(end, start);
  const chordLength = length(chord);
  const tangent = normalize(chord);
  const normal: Vec3 = [0, -tangent[2], tangent[1]];
  const distances: number[] = [];
  for (let station = 0; station * stationSize <= chordLength + EPSILON; station++) {
    const point = add(start, scale(tangent, station * stationSize));
    distances.push(farthest(cells, cellSize, { origin: point, direction: normal }, false));
  }
  const peak = Math.max(...distances);
  const peakIndex = distances.indexOf(peak);
  let maximumFallBeforePeak = 0;
  let maximumRiseAfterPeak = 0;
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  distances.forEach((value, index) => {
    if (index <= peakIndex) {
      high = Math.max(high, value);
      maximumFallBeforePeak = Math.max(maximumFallBeforePeak, high - value);
    }
    if (index >= peakIndex) {
      low = Math.min(low, value);
      maximumRiseAfterPeak = Math.max(maximumRiseAfterPeak, value - low);
    }
  });
  const maximumStep = Math.max(0, ...distances.slice(1).map((value, index) => Math.abs(value - distances[index]!)));
  return {
    lower,
    upper,
    start,
    end,
    normal,
    cellSize,
    stationSize,
    chordLength,
    distances,
    peak,
    maximumFallBeforePeak,
    maximumRiseAfterPeak,
    minimumDistance: Math.min(...distances),
    maximumStep,
  };
};

export const backAcceptance = (profile: ReturnType<typeof backStations>, minimumPeak: number, tolerance: number) => ({
  ...profile,
  minimumPeak,
  passes:
    profile.peak >= minimumPeak - EPSILON &&
    profile.maximumFallBeforePeak <= tolerance + EPSILON &&
    profile.maximumRiseAfterPeak <= tolerance + EPSILON &&
    profile.minimumDistance >= -tolerance - EPSILON &&
    profile.maximumStep <= tolerance + EPSILON,
});

export const jointAcceptance = (
  joint: { readonly widthDifference: number; readonly depthDifference: number },
  voxelSize: number,
  maximumDifferenceVoxels: number,
): boolean => Math.max(joint.widthDifference, joint.depthDifference) <= maximumDifferenceVoxels * voxelSize + EPSILON;

export const jointSections = (
  body: Body,
  parent: Bone,
  child: Bone,
  { voxelSize, cellSize }: { readonly voxelSize: number; readonly cellSize: number },
) => {
  const y = normalize(add(parent.frame!.y, child.frame!.y));
  const x = normalize(sub(parent.frame!.x, scale(y, dot(parent.frame!.x, y))));
  const frame = { x, y, z: cross(x, y) };
  // The phase shift prevents nearest-row snapping from moving the prescribed joint slabs.
  const origin = add(parent.tail, scale(y, cellSize / 2));
  const rows = sectionsOf(fleshInFrame(body, [parent.id, child.id], { frame: { ...parent, frame }, origin }, cellSize));
  const beforeRow = closestSection(rows, -voxelSize / 2 - cellSize / 2);
  const afterRow = closestSection(rows, voxelSize / 2 - cellSize / 2);
  const before = { ...beforeRow, y: beforeRow.y + cellSize / 2 };
  const after = { ...afterRow, y: afterRow.y + cellSize / 2 };
  return {
    frame,
    origin: parent.tail,
    before,
    after,
    widthDifference: Math.abs(before.width - after.width),
    depthDifference: Math.abs(before.depth - after.depth),
  };
};

const backProfile = (body: Body, genome: Genome, template: AcidTemplate) => {
  const limits = template.organic;
  const { voxelSize } = genome;
  const cellSize = voxelSize / limits.measureDivisor;
  const trunkIds = body.bones
    .filter((bone) => ['hips', 'belly', 'chest', 'neck'].includes(bone.id) || bone.id.startsWith('shoulder.'))
    .map((bone) => bone.id);
  const features = body.features.filter((feature) => trunkIds.includes(feature.bone) && skin(feature));
  const used = new Set(features.map((feature) => feature.bone));
  const measuringBody: Body = {
    ...body,
    bones: body.bones
      .filter((bone) => used.has(bone.id))
      .map((bone) => ({
        ...bone,
        parent: used.has(bone.parent ?? '') ? bone.parent : null,
      })),
    features,
  };
  const voxels = rasterizeFeatures(measuringBody, cellSize, genome.seed);
  const [nx, ny] = voxels.dims;
  const cells = new Map<string, SideCell>();
  voxels.owner.forEach((owner, index) => {
    if (!owner) {
      return;
    }
    const [, y, z] = worldPosition(voxels, index % nx, Math.floor(index / nx) % ny, Math.floor(index / (nx * ny)));
    cells.set(`${y},${z}`, { y, z });
  });
  const neck = measuredBone(body, 'neck');
  return backAcceptance(
    backStations(
      [...cells.values()],
      { cellSize, stationSize: voxelSize },
      { origin: measuredBone(body, 'hips').tail, direction: measuredBone(body, 'belly').frame!.z },
      { origin: scale(add(neck.head, neck.tail), 0.5), direction: neck.frame!.z },
    ),
    limits.minimumBackBulge * genome.params.height!,
    limits.profileToleranceVoxels * voxelSize,
  );
};

export const organicRead = (body: Body, genome: Genome, template: AcidTemplate) => {
  const limits = template.organic;
  const { voxelSize } = genome;
  const cellSize = voxelSize / limits.measureDivisor;
  const boneLength = (bone: Bone) => length(sub(bone.tail, bone.head));
  const scan = (id: string) => {
    const bone = measuredBone(body, id);
    const len = boneLength(bone);
    const sections = sectionsOf(fleshInFrame(body, [id], { frame: bone, origin: bone.head }, cellSize)).filter(
      (section) => section.y >= 0 && section.y <= len,
    );
    return { sections, len, peak: widestSection(sections) };
  };
  const chest = scan('chest');
  const belly = measuredBone(body, 'belly');
  const bellyOrigin = add(belly.head, scale(belly.frame!.y, boneLength(belly) / 2 - cellSize / 2));
  const bellyMid = closestSection(
    sectionsOf(fleshInFrame(body, ['belly'], { frame: belly, origin: bellyOrigin }, cellSize)),
    cellSize / 2,
  );
  const trunk = {
    chest: sectionAcceptance(chest.peak, limits),
    belly: sectionAcceptance(bellyMid, limits),
  };
  const joints = [
    ['hips', 'belly'],
    ['belly', 'chest'],
    ['arm.L', 'fore.L'],
    ['arm.R', 'fore.R'],
  ].map(([parentId, childId]) => {
    const parent = measuredBone(body, parentId!);
    const child = measuredBone(body, childId!);
    const measured = jointSections(body, parent, child, { voxelSize, cellSize });
    return {
      parent: parent.id,
      child: child.id,
      ...measured,
      passes: jointAcceptance(measured, voxelSize, limits.maximumJointDifferenceVoxels),
    };
  });
  const arms = ['L', 'R'].map((side) => {
    const taper = (id: string, peakRange: readonly number[]) => {
      const { sections, len } = scan(id);
      return {
        bone: id,
        ...taperAcceptance(sections, len, voxelSize, { minimumTaperVoxels: limits.minimumTaperVoxels, peakRange }),
      };
    };
    const hand = measuredBone(body, `hand.${side}`);
    const fore = measuredBone(body, `fore.${side}`);
    const palm = scan(hand.id).peak;
    const wrist = jointSections(body, fore, hand, { voxelSize, cellSize }).before;
    const palmExtra = palm.width - wrist.width;
    return {
      side,
      arm: taper(`arm.${side}`, limits.armPeak),
      fore: taper(`fore.${side}`, limits.forePeak),
      palmWidth: palm.width,
      wristWidth: wrist.width,
      palmExtra,
      palmPasses: palmExtra >= limits.minimumPalmExtraVoxels * voxelSize - EPSILON,
    };
  });
  const back = backProfile(body, genome, template);
  return {
    voxelSize,
    cellSize,
    trunk,
    back,
    joints,
    arms,
    passes:
      trunk.chest.passes &&
      trunk.belly.passes &&
      back.passes &&
      joints.every((joint) => joint.passes) &&
      arms.every((arm) => arm.arm.passes && arm.fore.passes && arm.palmPasses),
  };
};

export const silhouetteMasks = (model: Realized) => {
  const support = model.body.bones.filter((bone) => model.supportBones.has(bone.id));
  if (support.length === 0) {
    throw new Error('silhouette measurement needs ground supports');
  }
  const centerX = support.reduce((sum, bone) => sum + bone.head[0] + bone.tail[0], 0) / (2 * support.length);
  const centerZ = support.reduce((sum, bone) => sum + bone.head[2] + bone.tail[2], 0) / (2 * support.length);
  const { voxels } = model;
  const [nx, ny] = voxels.dims;
  const front = new Set<string>();
  const side = new Set<string>();
  voxels.owner.forEach((owner, index) => {
    if (!owner) {
      return;
    }
    const x = (index % nx) + voxels.origin[0] - Math.round(centerX / voxels.size);
    const y = (Math.floor(index / nx) % ny) + voxels.origin[1];
    const z = Math.floor(index / (nx * ny)) + voxels.origin[2] - Math.round(centerZ / voxels.size);
    front.add(`${x},${y}`);
    side.add(`${z},${y}`);
  });
  return { front, side };
};
