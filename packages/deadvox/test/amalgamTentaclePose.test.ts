// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves through this package's aliases.
import { type Mat3, mulMV, rotX, rotY, transpose } from '@mobgen/core/math.ts';
import { boneTransforms, type Pose } from '@mobgen/core/pose.ts';
import { severedBoneSet } from '@mobgen/mob/dismember.ts';
import { describe, expect, it } from 'vitest';
import { AMALGAM_FIGURE_SEED, amalgamFigure, amalgamStrikeOrigin } from '../src/core/amalgamFigure.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { amalgamCoreInteriorAnchor, amalgamTentaclePose } from '../src/render/amalgamTentaclePose.ts';

interface CoreVoxelPointInput {
  readonly figure: ReturnType<typeof amalgamFigure>;
  readonly transforms: ReturnType<typeof boneTransforms>;
  readonly yaw: Mat3;
  readonly position: Vec3;
  readonly point: Vec3;
}

const coreVoxelLocalPoint = ({ figure, transforms, yaw, position, point }: CoreVoxelPointInput): Vec3 => {
  const core = transforms.get('core')!;
  const worldOffset: Vec3 = [point[0] - position[0], point[1] - position[1], point[2] - position[2]];
  const yawLocal = mulMV(transpose(yaw), worldOffset);
  return mulMV(transpose(core.r), [
    yawLocal[0] - core.t[0] * figure.scale,
    yawLocal[1] - core.t[1] * figure.scale,
    yawLocal[2] - core.t[2] * figure.scale,
  ]).map((coordinate) => coordinate / figure.scale) as Vec3;
};

const coreVoxelUnionDistance = (input: CoreVoxelPointInput): number => {
  const { figure } = input;
  const local = coreVoxelLocalPoint(input);
  const halfVoxel = figure.realized.voxels.size / 2;
  return (figure.voxelCentersByBone.get('core') ?? []).reduce(
    (nearest, center) =>
      Math.min(
        nearest,
        Math.hypot(
          Math.max(0, Math.abs(local[0] - center[0]) - halfVoxel),
          Math.max(0, Math.abs(local[1] - center[1]) - halfVoxel),
          Math.max(0, Math.abs(local[2] - center[2]) - halfVoxel),
        ),
      ),
    Number.POSITIVE_INFINITY,
  );
};

const coreVoxelInteriorMargin = (input: CoreVoxelPointInput): number => {
  const { figure } = input;
  const local = coreVoxelLocalPoint(input);
  const halfVoxel = figure.realized.voxels.size / 2;
  return (figure.voxelCentersByBone.get('core') ?? []).reduce(
    (best, center) =>
      Math.max(
        best,
        halfVoxel -
          Math.max(Math.abs(local[0] - center[0]), Math.abs(local[1] - center[1]), Math.abs(local[2] - center[2])),
      ),
    Number.NEGATIVE_INFINITY,
  );
};

describe('amalgam attack tentacle pose', () => {
  it('extends toward the player through windup and strike, then retracts within attack reach', () => {
    const start: [number, number, number] = [0, 0, 0];
    const target: [number, number, number] = [3, 0, 4];
    const reachMetres = 3;
    const windupSeconds = 0.4;
    const cooldownSeconds = 1.8;
    const pose = (attackWindup: number, attackWait: number) =>
      amalgamTentaclePose({
        start,
        target,
        facing: [0, 0, -1],
        reachMetres,
        attackWindupSimSeconds: attackWindup,
        attackWindupDurationSimSeconds: windupSeconds,
        attackWaitSimSeconds: attackWait,
        attackCooldownDurationSimSeconds: cooldownSeconds,
      });

    const idle = pose(0, 0);
    const windupStart = pose(windupSeconds, cooldownSeconds);
    const windupMidpoint = pose(windupSeconds / 2, cooldownSeconds - windupSeconds / 2);
    const strike = pose(0, cooldownSeconds - windupSeconds);
    const retracting = pose(0, cooldownSeconds - windupSeconds * 1.5);

    expect(idle.extension).toBe(0);
    expect(windupStart.extension).toBe(0);
    expect(windupMidpoint.extension).toBeGreaterThan(windupStart.extension);
    expect(strike.extension).toBeGreaterThan(windupMidpoint.extension);
    expect(retracting.extension).toBeLessThan(strike.extension);
    expect(strike.start).toEqual(start);
    const dx = strike.end[0] - start[0];
    const dy = strike.end[1] - start[1];
    const dz = strike.end[2] - start[2];
    expect(Math.hypot(dx, dy, dz)).toBeLessThanOrEqual(reachMetres + 1e-9);
    const targetGap = Math.hypot(strike.end[0] - target[0], strike.end[1] - target[1], strike.end[2] - target[2]);
    expect(targetGap).toBeGreaterThan(1e-9);
    expect(dx * (target[0] - start[0]) + dy * (target[1] - start[1]) + dz * (target[2] - start[2])).toBeGreaterThan(0);
  });

  it('anchors the tentacle root to the posed core after attack, flinch and member loss', () => {
    const figure = amalgamFigure(AMALGAM_FIGURE_SEED, 1);
    const position: Vec3 = [13, 7, -4];
    const target: Vec3 = [position[0] + 2, position[1], position[2] - 3];
    const yaw = rotY(37);
    const basePose: Pose = {
      root: figure.originOffset.map((coordinate) => coordinate / figure.scale) as Vec3,
      rotations: {},
    };
    const flinchPose: Pose = { ...basePose, rotations: { core: rotX(-15) } };
    const partRoots = new Map(figure.manifest.parts.map((part) => [part.id, part.rootBone]));
    const shedMembers = figure.manifest.parts
      .filter((part) => part.severable)
      .map((part) => partRoots.get(part.id) ?? part.id);
    const shed = severedBoneSet(figure.realized.body.bones, shedMembers);
    expect(shed.size).toBeGreaterThan(0);
    const poses = [
      { pose: basePose, attack: 0, hidden: new Set<string>() },
      { pose: basePose, attack: 0.2, hidden: new Set<string>() },
      { pose: flinchPose, attack: 0.2, hidden: new Set<string>() },
      { pose: flinchPose, attack: 0, hidden: shed },
    ];
    const halfVoxelMetres = (figure.realized.voxels.size * figure.scale) / 2;
    const restTransforms = boneTransforms(figure.realized.body.bones, basePose);
    const flinchTransforms = boneTransforms(figure.realized.body.bones, flinchPose);
    const restCore = restTransforms.get('core')!;
    const flinchAtRestTranslation = new Map(flinchTransforms);
    flinchAtRestTranslation.set('core', { ...flinchTransforms.get('core')!, t: restCore.t });
    const restAnchor = amalgamCoreInteriorAnchor({
      figure,
      transforms: restTransforms,
      hidden: new Set(),
      yaw,
      position,
    });
    const flinchAnchor = amalgamCoreInteriorAnchor({
      figure,
      transforms: flinchAtRestTranslation,
      hidden: new Set(),
      yaw,
      position,
    });
    expect(
      Math.hypot(flinchAnchor[0] - restAnchor[0], flinchAnchor[1] - restAnchor[1], flinchAnchor[2] - restAnchor[2]),
    ).toBeGreaterThan(0);

    for (const scenario of poses) {
      const transforms = boneTransforms(figure.realized.body.bones, scenario.pose);
      const start = amalgamCoreInteriorAnchor({ figure, transforms, hidden: scenario.hidden, yaw, position });
      const tentacle = amalgamTentaclePose({
        start,
        target,
        facing: [0, 0, -1],
        reachMetres: 4,
        attackWindupSimSeconds: scenario.attack,
        attackWindupDurationSimSeconds: 0.4,
        attackWaitSimSeconds: 0,
        attackCooldownDurationSimSeconds: 1.8,
      });

      expect(scenario.hidden.has('core')).toBe(false);
      const anchorInput = { figure, transforms, yaw, position, point: tentacle.start };
      expect(coreVoxelUnionDistance(anchorInput)).toBeLessThanOrEqual(halfVoxelMetres * 1e-6);
      expect(coreVoxelInteriorMargin(anchorInput)).toBeGreaterThan(figure.realized.voxels.size * 1e-6);
      expect(
        Math.hypot(tentacle.end[0] - start[0], tentacle.end[1] - start[1], tentacle.end[2] - start[2]),
      ).toBeLessThanOrEqual(4 + 1e-9);
    }
  });

  it('starts the rendered tentacle at rest where the simulation starts its strike line', () => {
    const figure = amalgamFigure(AMALGAM_FIGURE_SEED, 4);
    const position: Vec3 = [13, 7, -4];
    const facing: Vec3 = [Math.sin(0.6), 0, -Math.cos(0.6)];
    const restPose: Pose = {
      root: figure.originOffset.map((coordinate) => coordinate / figure.scale) as Vec3,
      rotations: {},
    };
    const rendered = amalgamCoreInteriorAnchor({
      figure,
      transforms: boneTransforms(figure.realized.body.bones, restPose),
      hidden: new Set(),
      yaw: rotY((Math.atan2(-facing[0], -facing[2]) * 180) / Math.PI),
      position,
    });
    const offset = amalgamStrikeOrigin(figure, facing);
    const simulated: Vec3 = [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]];
    expect(Math.hypot(offset[0], offset[2])).toBeGreaterThan(0);
    expect(Math.hypot(rendered[0] - simulated[0], rendered[1] - simulated[1], rendered[2] - simulated[2])).toBeLessThan(
      1e-9,
    );
  });

  it('stays retracted when the amalgam has no remaining attack reach', () => {
    const pose = amalgamTentaclePose({
      start: [0, 0, 0],
      target: [1, 0, 0],
      facing: [1, 0, 0],
      reachMetres: 0,
      attackWindupSimSeconds: 0.1,
      attackWindupDurationSimSeconds: 0.4,
      attackWaitSimSeconds: 0.3,
      attackCooldownDurationSimSeconds: 1.8,
    });

    expect(pose.extension).toBe(0);
    expect(pose.end).toEqual(pose.start);
  });
});
