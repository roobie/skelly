import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { figureSeedPool } from '../src/core/zombieFigure.ts';
import { posedRegionHitDistance, posedShamblerRegionBoxes, type ZombieRegion } from '../src/core/zombieRegions.ts';
import type { HitImpulse } from '../src/core/zombies.ts';
import { mobFigurePoolSizeThrough } from '../src/render/mobActors.ts';
import { angularVelocity, type RigidBody } from '../src/render/rigidImpulse.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { LOOK_FIXTURE } from './lookFixture.ts';
import { MobActorMeshes } from './mobActorsFixture.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ZombieSystem } from './zombieSystemFixture.ts';

const BLOCK = 0.5;
const registry = baseRegistry();
const SHAMBLER = registry.zombies.get('shambler')!;
const BAT_DEF = registry.items.get('baseball_bat')!.weapon!.melee!;
const BAT = { ...BAT_DEF, cooldown: BAT_DEF.cooldownSimSeconds };
const HEALTHY_REGIONS = { head: 1000, torso: 1000, leftArm: 1000, rightArm: 1000, leftLeg: 1000, rightLeg: 1000 };
const senses = (isSolid: (x: number, y: number, z: number) => boolean) => ({
  isSolid,
  isOpaque: isSolid,
  blockSize: BLOCK,
  physics: physicsFor(makeScale(BLOCK)),
  tuning: TEST_SENSE_TUNING,
  player: () => ({
    pos: [100, 2, 100] as Vec3,
    facing: [0, 0, -1] as Vec3,
    movement: 'still' as const,
    lit: false,
    lightSeenFrom: 40,
    eyeHeightMetres: 1.3,
  }),
  dayPhase: () => dayStateAtHour(12),
  hurtPlayer: () => undefined,
});

type CutMode = 'region' | 'rolled' | 'head' | 'offRay';
interface AppliedPoint {
  readonly body: RigidBody;
  readonly point: Vec3;
}
const rotated = (q: RigidBody['orientation'], v: Vec3): Vec3 => {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  return [
    (1 - 2 * (y * y + z * z)) * vx + 2 * (x * y - z * w) * vy + 2 * (x * z + y * w) * vz,
    2 * (x * y + z * w) * vx + (1 - 2 * (x * x + z * z)) * vy + 2 * (y * z - x * w) * vz,
    2 * (x * z - y * w) * vx + 2 * (y * z + x * w) * vy + (1 - 2 * (x * x + y * y)) * vz,
  ];
};
const impactPointIsInside = ({ body, point }: AppliedPoint): boolean => {
  const local = rotated(
    [-body.orientation[0], -body.orientation[1], -body.orientation[2], body.orientation[3]],
    [point[0] - body.center[0], point[1] - body.center[1], point[2] - body.center[2]],
  );
  const halfExtents = [0, 0, 0];
  for (const corner of body.corners) {
    for (let axis = 0; axis < 3; axis++) {
      halfExtents[axis] = Math.max(halfExtents[axis]!, Math.abs(corner[axis]!));
    }
  }
  return local.every((coordinate, axis) => Math.abs(coordinate) <= halfExtents[axis]! + 1e-9);
};
const zombieTypeForCut = (mode: CutMode) => {
  const regions = { ...SHAMBLER.regions };
  if (mode === 'rolled') {
    Object.assign(regions, HEALTHY_REGIONS);
  }
  if (mode === 'region') {
    regions.leftArm = 1;
  }
  if (mode === 'head') {
    regions.head = 1;
  }
  return {
    ...SHAMBLER,
    regions,
    dismember: { chance: mode === 'rolled' ? 1 : 0, headOnKillChance: mode === 'head' ? 1 : 0 },
  };
};
const targetForCut = (mode: CutMode): { region: ZombieRegion; bone: string; direction: Vec3; distanceM: number } => {
  switch (mode) {
    case 'rolled':
    case 'offRay':
      return { region: 'torso', bone: 'chest', direction: [0, 0.2, -0.979_795_897_1], distanceM: 0.9 };
    case 'region':
      return { region: 'leftArm', bone: 'forearm.L', direction: [0, 0, -1], distanceM: 0.45 };
    case 'head':
      return { region: 'head', bone: 'head', direction: [0, 0, -1], distanceM: 0.45 };
    default:
      throw new Error(`Unknown cut mode: ${mode satisfies never}`);
  }
};
const createSeveredHit = (mode: CutMode) => {
  const isSolid = (_x: number, y: number, _z: number) => y === -1;
  let renderer: MobActorMeshes | undefined;
  const system = new ZombieSystem({
    ...senses(isSolid),
    seed: 5,
    onSever: (entityId, source, cut, hit) => renderer?.zombieSevered(entityId, cut, hit, source),
    onDeath: (entityId, source) => renderer?.zombieDied(entityId, source),
  });
  const id = system.add(zombieTypeForCut(mode), [4, 1, 4], [0, 0, -1]);
  const zombie = system.store.get(id)!;
  const actorMeshes = new MobActorMeshes(BLOCK, 16, {
    zombies: new Map([[zombie.type.id, zombie.type]]),
    poolSize: mobFigurePoolSizeThrough(figureSeedPool(new Map([[zombie.type.id, zombie.type]])), zombie.figureSeed),
  });
  renderer = actorMeshes;
  actorMeshes.setWorld(isSolid, BLOCK);
  const appliedPoints: AppliedPoint[] = [];
  const instrumented = actorMeshes as unknown as {
    applyDebrisHit: (body: RigidBody, center: Vec3, offset: number, hit: HitImpulse) => Vec3;
  };
  const apply = instrumented.applyDebrisHit.bind(actorMeshes);
  instrumented.applyDebrisHit = (body, center, offset, hit) => {
    const point = apply(body, center, offset, hit);
    appliedPoints.push({ body, point });
    return point;
  };
  actorMeshes.sync(system.store, 0, 1);
  const boxes = posedShamblerRegionBoxes({
    seed: zombie.figureSeed,
    position: zombie.body.pos,
    facing: zombie.facing,
    headYaw: zombie.headYaw,
    gaitPhase: zombie.gaitPhase,
    speed: zombie.horizontalSpeed,
    chasing: false,
    attackWindup: 0,
    attackWindupSeconds: zombie.type.attack.windupSimSeconds,
    severed: [],
    blockSize: BLOCK,
  });
  const target = targetForCut(mode);
  const targetBox = boxes[target.region].find((box) => box.bone === target.bone)!;
  const distance = target.distanceM / BLOCK;
  const origin: Vec3 = [
    targetBox.center[0] - target.direction[0] * distance,
    targetBox.center[1] - target.direction[1] * distance,
    targetBox.center[2] - target.direction[2] * distance,
  ];
  const targetRayHitsRegion =
    posedRegionHitDistance(boxes[target.region], origin, target.direction, BLOCK) !== undefined;
  let part: string;
  if (mode === 'rolled') {
    system.swing(origin, target.direction, BAT);
    part = zombie.severed[0] ?? '';
  } else {
    part = mode === 'head' ? 'head' : 'upperArm.L';
    actorMeshes.zombieSevered(
      id,
      part,
      { point: targetBox.center, direction: target.direction, impulse: BAT.impulse! },
      zombie,
    );
  }
  const partBox = Object.values(boxes)
    .flat()
    .find((box) => box.bone === part);
  const missedRandomPart =
    partBox !== undefined && posedRegionHitDistance([partBox], origin, target.direction, BLOCK) === undefined;
  return { renderer: actorMeshes, appliedPoints, missedRandomPart, targetRayHitsRegion };
};

describe('severed limb launch', () => {
  it('clamps application points and spin for region, random-roll, head-cut and off-ray debris', () => {
    const reports = (['region', 'rolled', 'head', 'offRay'] as const).map(createSeveredHit);
    try {
      expect(reports[3]!.targetRayHitsRegion).toBe(true);
      expect(reports[3]!.missedRandomPart).toBe(true);
      for (const report of reports) {
        expect(report.appliedPoints).toHaveLength(1);
        const point = report.appliedPoints[0]!;
        expect(impactPointIsInside(point)).toBe(true);
        expect(Math.hypot(...angularVelocity(point.body))).toBeLessThanOrEqual(
          LOOK_FIXTURE.mobActors.launchSpinRadiansPerSimSecond + 1e-6,
        );
      }
    } finally {
      for (const report of reports) {
        report.renderer.dispose();
      }
    }
  });
});
