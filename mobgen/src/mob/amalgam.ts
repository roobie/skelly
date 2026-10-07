import type { Body, Feature } from '../core/body.ts';
import { type BodyPlanDef, registerBodyPlan, sampleParams } from '../core/generate.ts';
import { mulMM, mulMV, rotY, type Vec3 } from '../core/math.ts';
import type { Genome, Wound } from '../core/template.ts';
import type { Voxels } from '../core/voxelize.ts';
import { severedBoneSet } from './dismember.ts';
import { buildHumanoid, HUMANOID_PARAM_ORDER, sampleWounds, WOUNDABLE_BONES } from './humanoid.ts';

export const AMALGAM_MEMBER_IDS = [0, 1, 2] as const;
const MEMBER_BONE_PREFIX = (member: number): string => `member.${member}.`;
const memberBone = (member: number, bone: string): string => `${MEMBER_BONE_PREFIX(member)}${bone}`;

const memberParam = (member: number, param: string): string => `member.${member}.${param}`;
const MEMBER_PARAM_ORDER = AMALGAM_MEMBER_IDS.flatMap((member) =>
  HUMANOID_PARAM_ORDER.map((param) => memberParam(member, param)),
);
const AMALGAM_PARAM_ORDER = [...MEMBER_PARAM_ORDER, 'height', 'headScale'];

export const AMALGAM_SUPPORT_BONES = AMALGAM_MEMBER_IDS.flatMap((member) =>
  (['L', 'R'] as const).map((side) => memberBone(member, `foot.${side}`)),
);

const WOUND_BONES = AMALGAM_MEMBER_IDS.flatMap((member) => WOUNDABLE_BONES.map((bone) => memberBone(member, bone)));

interface ModulePlacement {
  readonly member: number;
  readonly scale: number;
  readonly offset: Vec3;
  readonly yaw: number;
}

// The offsets overlap the module torsos around the shared trunk while keeping their heads visible.
const MODULE_PLACEMENTS: readonly ModulePlacement[] = [
  { member: 0, scale: 0.72, offset: [-0.44, 0, 0.12], yaw: -24 },
  { member: 1, scale: 0.72, offset: [0, 0, -0.06], yaw: 0 },
  { member: 2, scale: 0.72, offset: [0.44, 0, 0.12], yaw: 24 },
];

const pointFor = (point: Vec3, placement: ModulePlacement): Vec3 => {
  const rotated = mulMV(rotY(placement.yaw), point);
  return [
    rotated[0] * placement.scale + placement.offset[0],
    rotated[1] * placement.scale + placement.offset[1],
    rotated[2] * placement.scale + placement.offset[2],
  ];
};

const rotateShape = (shape: Feature['shape'], placement: ModulePlacement): Feature['shape'] => {
  const rotation = rotY(placement.yaw);
  switch (shape.kind) {
    case 'capsule':
      return {
        ...shape,
        a: pointFor(shape.a, placement),
        b: pointFor(shape.b, placement),
        ra: shape.ra * placement.scale,
        rb: shape.rb * placement.scale,
      };
    case 'ellipsoid':
      return {
        ...shape,
        center: pointFor(shape.center, placement),
        radii: [shape.radii[0] * placement.scale, shape.radii[1] * placement.scale, shape.radii[2] * placement.scale],
        rot: mulMM(rotation, shape.rot ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]),
      };
    case 'box':
      return {
        ...shape,
        center: pointFor(shape.center, placement),
        half: [shape.half[0] * placement.scale, shape.half[1] * placement.scale, shape.half[2] * placement.scale],
        round: shape.round * placement.scale,
        rot: mulMM(rotation, shape.rot ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]),
      };
    default:
      throw new Error(`unknown shape kind "${(shape as Feature['shape']).kind}"`);
  }
};

const namespacedWounds = (member: number, wounds: readonly Wound[]): Wound[] =>
  wounds.map((wound) => ({ ...wound, bone: memberBone(member, wound.bone) }));

const sampleAmalgam: BodyPlanDef['sample'] = (rng, template) => {
  const params = sampleParams(rng, template.params, MEMBER_PARAM_ORDER);
  for (const derived of ['height', 'headScale'] as const) {
    params[derived] =
      AMALGAM_MEMBER_IDS.reduce<number>((sum, member) => sum + params[memberParam(member, derived)]!, 0) /
      AMALGAM_MEMBER_IDS.length;
  }
  const wounds = AMALGAM_MEMBER_IDS.flatMap((member) =>
    namespacedWounds(member, sampleWounds(rng, params[memberParam(member, 'woundCount')]!)),
  );
  return { params, wounds };
};

const humanoidGenome = (genome: Genome, member: number): Genome => {
  const prefix = MEMBER_BONE_PREFIX(member);
  const params = Object.fromEntries(
    HUMANOID_PARAM_ORDER.map((param) => [param, genome.params[memberParam(member, param)]!]),
  );
  const wounds = genome.wounds
    .filter((wound) => wound.bone.startsWith(prefix))
    .map((wound) => ({ ...wound, bone: wound.bone.slice(prefix.length) }));
  return { ...genome, params, wounds };
};

const buildAmalgam: BodyPlanDef['build'] = (genome, _template) => {
  const height = genome.params.height!;
  const coreBone = {
    id: 'core',
    parent: null,
    head: [0, height * 0.26, 0] as Vec3,
    tail: [0, height * 0.73, 0] as Vec3,
  };
  const bones: Body['bones'][number][] = [coreBone];
  const features: Feature[] = [
    {
      bone: 'core',
      op: 'add',
      shape: { kind: 'ellipsoid', center: [0, height * 0.57, 0], radii: [height * 0.22, height * 0.13, height * 0.18] },
      material: 'skin',
      blend: height * 0.08,
    },
    {
      bone: 'core',
      op: 'add',
      shape: { kind: 'capsule', a: coreBone.head, b: coreBone.tail, ra: height * 0.1, rb: height * 0.1 },
      material: 'skin',
    },
  ];
  let palette: Body['palette'] | undefined;

  for (const placement of MODULE_PLACEMENTS) {
    const memberBody = buildHumanoid(humanoidGenome(genome, placement.member));
    palette ??= memberBody.palette;
    const ids = new Map(memberBody.bones.map((bone) => [bone.id, memberBone(placement.member, bone.id)]));
    bones.push(
      ...memberBody.bones.map((bone) => ({
        ...bone,
        id: ids.get(bone.id)!,
        parent: bone.parent === null ? 'core' : ids.get(bone.parent)!,
        head: pointFor(bone.head, placement),
        tail: pointFor(bone.tail, placement),
      })),
    );
    features.push(
      ...memberBody.features.map((feature) => ({
        ...feature,
        bone: ids.get(feature.bone)!,
        shape: rotateShape(feature.shape, placement),
        ...(feature.noise ? { noise: { ...feature.noise, scale: feature.noise.scale * placement.scale } } : {}),
      })),
    );
  }

  if (!palette) {
    throw new Error('amalgam has no member modules');
  }
  return { bones, features, palette };
};

registerBodyPlan('amalgam', {
  sample: sampleAmalgam,
  build: buildAmalgam,
  paramOrder: AMALGAM_PARAM_ORDER,
  woundBones: WOUND_BONES,
});

interface AmalgamRegion {
  readonly id: string;
  readonly partId: string;
  readonly boneIds: readonly string[];
}

interface AmalgamPart {
  readonly id: string;
  readonly rootBone: string;
  readonly boneIds: readonly string[];
  readonly severable: boolean;
  readonly regionIds: readonly string[];
  readonly massFraction: number;
  readonly capabilityIds: readonly string[];
}

interface AmalgamManifest {
  readonly parts: readonly AmalgamPart[];
  readonly regions: readonly AmalgamRegion[];
  readonly headBoneIds: readonly string[];
}

const REGION_BONES: Readonly<Record<string, readonly string[]>> = {
  head: ['head', 'jaw'],
  torso: ['pelvis', 'spine', 'chest', 'neck'],
  leftArm: ['upperArm.L', 'forearm.L', 'hand.L'],
  rightArm: ['upperArm.R', 'forearm.R', 'hand.R'],
  leftLeg: ['thigh.L', 'shin.L', 'foot.L'],
  rightLeg: ['thigh.R', 'shin.R', 'foot.R'],
};

const assertPartHierarchy = (
  part: AmalgamPart,
  bonesById: ReadonlyMap<string, Body['bones'][number]>,
  owned: Set<string>,
): void => {
  const root = bonesById.get(part.rootBone);
  if (!(root && part.boneIds.includes(part.rootBone))) {
    throw new Error(`amalgam part "${part.id}" has an unresolved root bone`);
  }
  if (part.severable && root.parent !== 'core') {
    throw new Error(`severable amalgam part "${part.id}" must root under core`);
  }
  for (const boneId of part.boneIds) {
    const bone = bonesById.get(boneId);
    if (!bone) {
      throw new Error(`amalgam part "${part.id}" references missing bone "${boneId}"`);
    }
    if (owned.has(boneId)) {
      throw new Error(`amalgam bone "${boneId}" belongs to multiple parts`);
    }
    owned.add(boneId);
    if (boneId !== part.rootBone && !part.boneIds.includes(bone.parent ?? '')) {
      throw new Error(`amalgam bone "${boneId}" has a parent outside part "${part.id}"`);
    }
  }
};

const assertTreeRoot = (body: Body, manifest: AmalgamManifest): ReadonlyMap<string, Body['bones'][number]> => {
  const bonesById = new Map(body.bones.map((bone) => [bone.id, bone]));
  if (bonesById.size !== body.bones.length) {
    throw new Error('amalgam manifest has duplicate bone ids');
  }
  const roots = body.bones.filter((bone) => bone.parent === null);
  if (roots.length !== 1 || roots[0]?.id !== 'core') {
    throw new Error('amalgam body must have core as its only root');
  }
  const partsById = new Map(manifest.parts.map((part) => [part.id, part]));
  if (partsById.size !== manifest.parts.length) {
    throw new Error('amalgam manifest has duplicate part ids');
  }
  const core = partsById.get('core');
  if (!(core && !core.severable && core.rootBone === 'core' && core.boneIds.includes('core'))) {
    throw new Error('amalgam core part must own the non-severable root');
  }
  return bonesById;
};

const assertPartOwnership = (
  body: Body,
  manifest: AmalgamManifest,
  bonesById: ReadonlyMap<string, Body['bones'][number]>,
): void => {
  const owned = new Set<string>();
  for (const part of manifest.parts) {
    assertPartHierarchy(part, bonesById, owned);
  }
  if (owned.size !== body.bones.length || body.bones.some((bone) => !owned.has(bone.id))) {
    throw new Error('amalgam parts must own every body bone exactly once');
  }
};

const assertRegionReferences = (
  region: AmalgamRegion,
  partsById: ReadonlyMap<string, AmalgamPart>,
  bonesById: ReadonlyMap<string, Body['bones'][number]>,
): void => {
  const part = partsById.get(region.partId);
  if (!part?.regionIds.includes(region.id)) {
    throw new Error(`amalgam region "${region.id}" has an unresolved part`);
  }
  for (const boneId of region.boneIds) {
    if (!(bonesById.has(boneId) && part.boneIds.includes(boneId))) {
      throw new Error(`amalgam region "${region.id}" references an unresolved bone`);
    }
  }
};

const assertManifestReferences = (body: Body, manifest: AmalgamManifest): void => {
  const bonesById = new Map(body.bones.map((bone) => [bone.id, bone]));
  const partsById = new Map(manifest.parts.map((part) => [part.id, part]));
  const regionsById = new Map(manifest.regions.map((region) => [region.id, region]));
  if (regionsById.size !== manifest.regions.length) {
    throw new Error('amalgam manifest has duplicate region ids');
  }
  for (const region of manifest.regions) {
    assertRegionReferences(region, partsById, bonesById);
  }
  for (const part of manifest.parts) {
    for (const regionId of part.regionIds) {
      if (regionsById.get(regionId)?.partId !== part.id) {
        throw new Error(`amalgam part "${part.id}" has an unresolved region`);
      }
    }
  }
  for (const headBoneId of manifest.headBoneIds) {
    if (!bonesById.has(headBoneId)) {
      throw new Error('amalgam manifest has an unresolved head bone');
    }
  }
};

const assertManifestResolves = (body: Body, manifest: AmalgamManifest): void => {
  const bonesById = assertTreeRoot(body, manifest);
  assertPartOwnership(body, manifest, bonesById);
  assertManifestReferences(body, manifest);
};

/** Builds the resolved part/region metadata from a realized amalgam, without gameplay tuning. */
export const amalgamManifest = (body: Body, voxels: Voxels): AmalgamManifest => {
  const regions: AmalgamRegion[] = [{ id: 'core.trunk', partId: 'core', boneIds: ['core'] }];
  const parts: AmalgamPart[] = [];
  const headBoneIds: string[] = [];
  const ownerCounts = new Map<string, number>();
  for (const owner of voxels.owner) {
    if (owner === 0) {
      continue;
    }
    const bone = body.bones[owner - 1];
    if (!bone) {
      throw new Error(`amalgam voxel references missing bone index ${owner}`);
    }
    const { id } = bone;
    const partId = id === 'core' ? 'core' : id.split('.').slice(0, 2).join('.');
    ownerCounts.set(partId, (ownerCounts.get(partId) ?? 0) + 1);
  }
  const totalOwned = [...ownerCounts.values()].reduce((sum, count) => sum + count, 0);
  if (totalOwned === 0) {
    throw new Error('amalgam manifest cannot resolve a body without owned voxels');
  }
  const coreBones = body.bones.filter((bone) => bone.id === 'core').map((bone) => bone.id);
  parts.push({
    id: 'core',
    rootBone: 'core',
    boneIds: coreBones,
    severable: false,
    regionIds: ['core.trunk'],
    massFraction: (ownerCounts.get('core') ?? 0) / totalOwned,
    capabilityIds: [],
  });

  for (const member of AMALGAM_MEMBER_IDS) {
    const partId = `member.${member}`;
    const prefix = MEMBER_BONE_PREFIX(member);
    const boneIds = body.bones.filter((bone) => bone.id.startsWith(prefix)).map((bone) => bone.id);
    const memberRegions = Object.entries(REGION_BONES).map(([name, suffixes]) => {
      const region: AmalgamRegion = {
        id: `${partId}.${name}`,
        partId,
        boneIds: suffixes.map((suffix) => memberBone(member, suffix)).filter((id) => boneIds.includes(id)),
      };
      regions.push(region);
      return region.id;
    });
    const head = memberBone(member, 'head');
    if (boneIds.includes(head)) {
      headBoneIds.push(head);
    }
    parts.push({
      id: partId,
      rootBone: memberBone(member, 'pelvis'),
      boneIds,
      severable: true,
      regionIds: memberRegions,
      massFraction: (ownerCounts.get(partId) ?? 0) / totalOwned,
      capabilityIds: [`${partId}.support`, `${partId}.attacks`, `${partId}.reach`, `${partId}.health`],
    });
  }
  const manifest = { parts, regions, headBoneIds };
  assertManifestResolves(body, manifest);
  return manifest;
};

/** Removes one member subtree, retaining the shared core and the other members. */
export const bodyWithoutAmalgamPart = (body: Body, partId: string): Body => {
  const root = body.bones.find((bone) => bone.id === `${partId}.pelvis`);
  if (!(root && partId.startsWith('member.'))) {
    throw new Error(`unknown severable amalgam part "${partId}"`);
  }
  const hidden = severedBoneSet(body.bones, [root.id]);
  return {
    ...body,
    bones: body.bones.filter((bone) => !hidden.has(bone.id)),
    features: body.features.filter((feature) => !hidden.has(feature.bone)),
  };
};
