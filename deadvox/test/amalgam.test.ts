// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through Deadvox's TypeScript alias.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { voxelBounds } from '@mobgen/core/massProperties.ts';
import { SHAMBLER_FIGURE_SEEDS } from '@mobgen/mob/shamblerFigure.ts';
import { describe, expect, it } from 'vitest';
import { aimBasis, NEUTRAL_AIM } from '../src/core/aim.ts';
import {
  AMALGAM_FIGURE_SEED,
  amalgamCollisionEnvelope,
  amalgamFigure,
  amalgamFigureForType,
} from '../src/core/amalgamFigure.ts';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { pelletShotFromBasis, projectileShot } from '../src/core/pellets.ts';
import { type Body, stepBodyHorizontal } from '../src/core/physics.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import { compileTemplate } from '../src/core/templates.ts';
import { World } from '../src/core/world.ts';
import { zombieFigure } from '../src/core/zombieFigure.ts';
import { zombiePoseInputFor } from '../src/core/zombiePose.ts';
import { posedAmalgamRegionBoxes } from '../src/core/zombieRegions.ts';
import {
  activeAmalgamMembers,
  FISTS_MELEE,
  type PlayerSense,
  ZombieSystem,
  zombieAttackReachMetres,
} from '../src/core/zombies.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { capture, contentLookup, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const BLOCK_SIZE = makeScale(0.5).blockSize;
const FLOOR = (_x: number, y: number): boolean => y === 0;
const player = (): PlayerSense => ({
  pos: [20, 1, 20],
  facing: [-1, 0, 0],
  movement: 'still',
  lit: false,
  lightSeenFrom: 40,
});
const system = (
  sense: () => PlayerSense = player,
  hurtPlayer: (amount: number) => void = () => undefined,
  seed = 17,
): ZombieSystem =>
  new ZombieSystem({
    player: sense,
    isSolid: FLOOR,
    isOpaque: FLOOR,
    dayPhase: () => dayStateAtHour(12),
    blockSize: BLOCK_SIZE,
    physics: physicsFor(makeScale(0.5)),
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    hurtPlayer,
    seed,
  });

const MEMBER_RAY_DIRECTIONS: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
  [0, 1, 0],
  [0, -1, 0],
];

const findRegionRay = ({
  simulation,
  id,
  regionId,
  boxes,
  distanceMetres = 3,
}: {
  simulation: ZombieSystem;
  id: number;
  regionId: string;
  boxes: readonly ReturnType<typeof posedAmalgamRegionBoxes>[string][number][];
  distanceMetres?: number;
}): { origin: Vec3; direction: Vec3 } | null => {
  const weapon = { damage: 0, reach: Math.max(4, distanceMetres), cooldown: 0 };
  for (const box of boxes) {
    for (const direction of MEMBER_RAY_DIRECTIONS) {
      const origin: Vec3 = [
        box.voxelCentroid[0] - (direction[0] * distanceMetres) / BLOCK_SIZE,
        box.voxelCentroid[1] - (direction[1] * distanceMetres) / BLOCK_SIZE,
        box.voxelCentroid[2] - (direction[2] * distanceMetres) / BLOCK_SIZE,
      ];
      const aim = simulation.aimAt(origin, direction, weapon);
      if (aim?.id === id && aim.region === regionId) {
        return { origin, direction };
      }
    }
  }
  return null;
};

const findMemberRay = (simulation: ZombieSystem, id: number, distanceMetres = 3) => {
  const zombie = simulation.store.get(id)!;
  const regions = posedAmalgamRegionBoxes(zombiePoseInputFor(zombie, id, BLOCK_SIZE));
  for (const member of activeAmalgamMembers(zombie)) {
    for (const regionId of member.regionIds) {
      const ray = findRegionRay({ simulation, id, regionId, boxes: regions[regionId] ?? [], distanceMetres });
      if (ray) {
        return { ...ray, partId: member.partId, regionId };
      }
    }
  }
  throw new Error('Could not aim at an exposed amalgam member region');
};

const poseInputForFigure = (
  figure: ReturnType<typeof amalgamFigure>,
  position: Vec3,
  facing: Vec3,
  severed: readonly string[] = [],
): Parameters<typeof posedAmalgamRegionBoxes>[0] => ({
  model: 'amalgam',
  seed: figure.seed,
  bodyScale: figure.scale,
  position,
  facing,
  headYaw: 0,
  gaitPhase: 0,
  speed: 0,
  chasing: false,
  attackWindup: 0,
  attackWindupSeconds: 0,
  severed,
  blockSize: BLOCK_SIZE,
});

const regionsInsideBounds = (
  regions: ReturnType<typeof posedAmalgamRegionBoxes>,
  minBounds: readonly number[],
  maxBounds: readonly number[],
): boolean => {
  for (const boxes of Object.values(regions)) {
    for (const box of boxes) {
      for (let axis = 0; axis < 3; axis++) {
        const min = box.center[axis]! * BLOCK_SIZE - box.halfSize[axis]!;
        const max = box.center[axis]! * BLOCK_SIZE + box.halfSize[axis]!;
        if (min < minBounds[axis]! - 1e-6 || max > maxBounds[axis]! + 1e-6) {
          return false;
        }
      }
    }
  }
  return true;
};

const stepHeadingAlignment = (before: Vec3, after: Vec3, target: Vec3): number | undefined => {
  const moveX = after[0] - before[0];
  const moveZ = after[2] - before[2];
  const movementLength = Math.hypot(moveX, moveZ);
  if (movementLength <= 1e-8) {
    return undefined;
  }
  const dx = target[0] - after[0];
  const dz = target[2] - after[2];
  return (moveX * dx + moveZ * dz) / (movementLength * Math.hypot(dx, dz));
};

const boundsOfPosedRegions = (regions: ReturnType<typeof posedAmalgamRegionBoxes>) => {
  const bounds = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  };
  for (const boxes of Object.values(regions)) {
    for (const box of boxes) {
      for (let axis = 0; axis < 3; axis++) {
        const extent = [0, 1, 2].reduce(
          (sum, column) => sum + Math.abs(box.rotation[axis * 3 + column]!) * box.halfSize[column]!,
          0,
        );
        const center = box.center[axis]! * BLOCK_SIZE;
        bounds.min[axis] = Math.min(bounds.min[axis]!, center - extent);
        bounds.max[axis] = Math.max(bounds.max[axis]!, center + extent);
      }
    }
  }
  return bounds;
};

type ObstacleKind = 'fence' | 'crates';
interface ObstacleResult {
  barrierSolid: boolean;
  crossed: boolean;
  leftGround: boolean;
  maxZ: number;
  mode: string;
}

const placeFenceRow = (world: World): void => {
  const fence = compileTemplate(registry, registry.templates.get('rickety_fence')!);
  const [sx, sy, sz] = fence.size;
  for (let originX = -70; originX <= 70; originX += sx) {
    for (let y = 0; y < sy; y++) {
      for (let z = 0; z < sz; z++) {
        for (let x = 0; x < sx; x++) {
          const block = fence.blocks[x + sx * (z + sz * y)]!;
          if (registry.blocks[block]?.solid) {
            world.setBlock(originX + x, y, z, block);
          }
        }
      }
    }
  }
};

const runObstacleCase = (
  kind: ObstacleKind,
  typeId: 'amalgam' | 'shambler',
  canJumpObstacles?: boolean,
): ObstacleResult => {
  const world = new World();
  const entities = new BlockEntities(registry);
  const centerX = kind === 'fence' ? 0 : 50;
  const startZ = -30;
  if (kind === 'fence') {
    placeFenceRow(world);
  } else {
    for (let x = centerX - 50; x <= centerX + 50; x += 2) {
      entities.add({ type: 'crate', pos: [x, 0, 0], size: [2, 2, 2], facing: 'n' });
    }
  }
  const isSolid = (x: number, y: number, z: number): boolean =>
    y === 0 || Boolean(registry.blocks[world.getBlock(x, y, z)]?.solid) || entities.isSolid(x, y, z);
  const barrierSolid = isSolid(centerX, 1, 0);
  const seenPlayer: PlayerSense = { ...player(), pos: [centerX, 1, 18] };
  const simulation = new ZombieSystem({
    player: () => seenPlayer,
    isSolid,
    isOpaque: () => false,
    dayPhase: () => dayStateAtHour(12),
    blockSize: BLOCK_SIZE,
    physics: physicsFor(makeScale(0.5)),
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    hurtPlayer: () => undefined,
  });
  const type = registry.zombies.get(typeId)!;
  const configuredType = canJumpObstacles === undefined ? type : { ...type, canJumpObstacles };
  const id = simulation.add(configuredType, [centerX, 1, startZ], [0, 0, 1]);
  let crossed = false;
  let leftGround = false;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let tick = 0; tick < 1200; tick++) {
    simulation.tick(1 / 60);
    const { body } = simulation.store.get(id)!;
    crossed ||= body.pos[2] > 2.5;
    leftGround ||= !body.onGround;
    maxZ = Math.max(maxZ, body.pos[2]);
  }
  return { barrierSolid, crossed, leftGround, maxZ, mode: simulation.store.get(id)!.mode };
};

describe('amalgam body and combat seam', () => {
  it('authors a slow beeline and delayed heavier strike', () => {
    const amalgam = registry.zombies.get('amalgam')!;
    const shambler = registry.zombies.get('shambler')!;
    expect(amalgam.speed.chaseMetresPerSimSecond).toBeLessThan(shambler.speed.chaseMetresPerSimSecond);
    expect(amalgam.attack.damage).toBeGreaterThan(shambler.attack.damage);
    expect(amalgam.attack.windupSimSeconds).toBeGreaterThan(shambler.attack.windupSimSeconds);

    const seenPlayer: PlayerSense = { ...player(), pos: [0, 1, 30] };
    const chase = (type: typeof amalgam, seed = 17) => {
      const simulation = system(() => seenPlayer, undefined, seed);
      const id = simulation.add(type, [0, 1, 0], [0, 0, 1]);
      let checkedAmalgamHeading = false;
      for (let tick = 0; tick < 120; tick++) {
        const before = [...simulation.store.get(id)!.body.pos] as Vec3;
        simulation.tick(1 / 60);
        const chasing = simulation.store.get(id)!;
        if (type.id === 'amalgam' && chasing.mode === 'chase') {
          const alignment = stepHeadingAlignment(before, chasing.body.pos, seenPlayer.pos);
          expect(alignment ?? 1).toBeGreaterThan(Math.cos(Math.PI / 180));
          checkedAmalgamHeading ||= alignment !== undefined;
        }
      }
      const zombie = simulation.store.get(id)!;
      expect(zombie.mode).toBe('chase');
      if (type.id === 'amalgam') {
        expect(checkedAmalgamHeading).toBe(true);
      }
      return Math.hypot(seenPlayer.pos[0] - zombie.body.pos[0], seenPlayer.pos[2] - zombie.body.pos[2]) * BLOCK_SIZE;
    };
    const initialDistance = seenPlayer.pos[2] * BLOCK_SIZE;
    const amalgamRemainingDistance = chase(amalgam);
    const shamblerRemainingDistance = chase(shambler);
    expect(amalgamRemainingDistance).toBeLessThan(initialDistance);
    expect(amalgamRemainingDistance).toBeGreaterThan(shamblerRemainingDistance);

    const closePlayer: PlayerSense = { ...player(), pos: [0, 1, 5] };
    const damage: number[] = [];
    const combat = system(
      () => closePlayer,
      (amount) => damage.push(amount),
    );
    const id = combat.add(amalgam, [0, 1, 0], [0, 0, 1]);
    combat.tick(1 / 60);
    const zombie = combat.store.get(id)!;
    expect(zombie.attackWindup).toBeGreaterThan(0);
    expect(damage).toEqual([]);
    const beforeResolutionTicks = Math.floor(zombie.attackWindup * 30);
    for (let tick = 0; tick < beforeResolutionTicks; tick++) {
      combat.tick(1 / 60);
    }
    expect(damage).toEqual([]);
    const resolutionLimit = Math.ceil(zombie.type.attack.windupSimSeconds * 60) + 60;
    let resolvedAfterWindup = false;
    for (let tick = 0; tick < resolutionLimit && damage.length === 0; tick++) {
      combat.tick(1 / 60);
      resolvedAfterWindup = damage.length > 0 && combat.store.get(id)?.attackWindup === 0;
    }
    expect(damage.length).toBeGreaterThan(0);
    expect(resolvedAfterWindup).toBe(true);
  });

  it('maps its four cues to shambler recordings and authors a lower pitch', () => {
    const amalgam = registry.zombies.get('amalgam')!;
    const shambler = registry.zombies.get('shambler')!;
    expect(amalgam.soundPitchMultiplier).toBeDefined();
    expect(amalgam.soundPitchMultiplier!).toBeLessThan(1);
    for (const action of ['idle', 'alert', 'attack', 'hurt'] as const) {
      const amalgamSound = registry.sounds.get(amalgam.sounds[action])!;
      const shamblerSound = registry.sounds.get(shambler.sounds[action])!;
      expect(amalgamSound.variants).toEqual(shamblerSound.variants);
    }
  });

  it('derives a tight collision envelope and region boxes from the realized body manifest', () => {
    expect(registry.zombies.get('amalgam')?.debugOnly).toBe(true);
    const amalgamType = registry.zombies.get('amalgam')!;
    const figure = amalgamFigure(3, amalgamType.bodyScale!);
    const envelope = amalgamCollisionEnvelope(figure, BLOCK_SIZE);
    const { bounds, originOffset } = figure;
    const localMin = [
      bounds.min[0] + originOffset[0],
      bounds.min[1] + originOffset[1],
      bounds.min[2] + originOffset[2],
    ];
    const localMax = [
      bounds.max[0] + originOffset[0],
      bounds.max[1] + originOffset[1],
      bounds.max[2] + originOffset[2],
    ];

    expect(localMin[1]).toBeCloseTo(0);
    expect(envelope.halfWidth * BLOCK_SIZE).toBeGreaterThanOrEqual(
      Math.max(Math.abs(localMin[0]!), Math.abs(localMax[0]!)),
    );
    expect(envelope.halfDepth * BLOCK_SIZE).toBeGreaterThanOrEqual(
      Math.max(Math.abs(localMin[2]!), Math.abs(localMax[2]!)),
    );
    expect(envelope.height * BLOCK_SIZE).toBeGreaterThanOrEqual(localMax[1]! - localMin[1]!);

    const posed = posedAmalgamRegionBoxes(poseInputForFigure(figure, [0, 0, 0], [0, 0, -1]));
    expect(regionsInsideBounds(posed, localMin, localMax)).toBe(true);
    const regionBounds = boundsOfPosedRegions(posed);
    const scaledVoxel = figure.realized.voxels.size * figure.scale;
    for (let axis = 0; axis < 3; axis++) {
      expect(Math.abs(regionBounds.min[axis]! - localMin[axis]!)).toBeLessThanOrEqual(scaledVoxel);
      expect(Math.abs(regionBounds.max[axis]! - localMax[axis]!)).toBeLessThanOrEqual(scaledVoxel);
    }

    for (const region of figure.manifest.regions) {
      expect(figure.boxes[region.id]?.length, region.id).toBeGreaterThan(0);
      for (const box of figure.boxes[region.id]!) {
        expect(region.boneIds).toContain(box.bone);
      }
    }
  });

  it('keeps Deadvox metre bounds aligned with the generated mobgen body', () => {
    const type = registry.zombies.get('amalgam')!;
    const figure = amalgamFigure(3, type.bodyScale!);
    const generatedBounds = voxelBounds(
      figure.realized.voxels,
      figure.realized.body.bones.map((_, index) => index),
    );

    expect((figure.bounds.max[1] - figure.bounds.min[1]) / figure.scale).toBeCloseTo(
      generatedBounds.halfExtents[1] * 2,
    );
  });

  it('realizes the authored figure when perception emits an amalgam alert sound', () => {
    const type = registry.zombies.get('amalgam')!;
    const noisyPlayer: PlayerSense = {
      ...player(),
      pos: [1000, 1, 1000],
      vocalNoise: { id: 1, pos: [4, 1, 0], radiusMetres: 12, expiresAt: 10 },
    };
    let heardBody = false;
    const hearingSystem = new ZombieSystem({
      player: () => noisyPlayer,
      isSolid: FLOOR,
      isOpaque: FLOOR,
      dayPhase: () => dayStateAtHour(12),
      blockSize: BLOCK_SIZE,
      physics: physicsFor(makeScale(0.5)),
      jumpSpeed: PLAYER.jump,
      tuning: TEST_SENSE_TUNING,
      hurtPlayer: () => undefined,
      onSound: (event, _position, zombie) => {
        if (event === type.sounds.alert && zombie?.type.id === type.id) {
          heardBody = zombieFigure(zombie.type, zombie.figureSeed).realized.body.bones.length > 0;
        }
      },
    });
    hearingSystem.add(type, [0, 1, 0], [1, 0, 0]);

    hearingSystem.tick(1 / 60);

    expect(heardBody).toBe(true);
  });

  it('uses the shared flinch transform for rendered and hit-region amalgam pose', () => {
    const type = registry.zombies.get('amalgam')!;
    let heardBody = false;
    const combatSystem = new ZombieSystem({
      player,
      isSolid: FLOOR,
      isOpaque: FLOOR,
      dayPhase: () => dayStateAtHour(12),
      blockSize: BLOCK_SIZE,
      physics: physicsFor(makeScale(0.5)),
      jumpSpeed: PLAYER.jump,
      tuning: TEST_SENSE_TUNING,
      hurtPlayer: () => undefined,
      onSound: (event, _position, targetZombie) => {
        if (event === 'melee_hit' && targetZombie?.type.id === type.id) {
          heardBody = zombieFigure(targetZombie.type, targetZombie.figureSeed).realized.body.bones.length > 0;
        }
      },
    });
    const id = combatSystem.add(type, [0, 1, 0], [1, 0, 0]);
    const ray = findMemberRay(combatSystem, id);
    const hit = combatSystem.swing(ray.origin, ray.direction, { ...FISTS_MELEE, damage: 1, reach: 4, impulse: 0 });

    expect(hit).toBe(id);
    expect(heardBody).toBe(true);
    for (let tick = 0; tick < 3; tick++) {
      combatSystem.tick(1 / 60);
    }
    const zombie = combatSystem.store.get(id)!;
    const poseInput = zombiePoseInputFor(zombie, id, BLOCK_SIZE);
    const { hitFlinchTime, ...withoutFlinch } = poseInput;
    expect(hitFlinchTime).toBeGreaterThan(0);

    const memberRegion = activeAmalgamMembers(zombie)[0]!.regionIds[0]!;
    const posedBoxes = posedAmalgamRegionBoxes(poseInput)[memberRegion] ?? [];
    const unflinchedBoxes = posedAmalgamRegionBoxes(withoutFlinch)[memberRegion] ?? [];
    const aim = combatSystem.aimAt(ray.origin, ray.direction, FISTS_MELEE);
    expect(aim?.id).toBe(id);
    expect(aim?.region).toBe(memberRegion);
    expect(aim?.boxes).toEqual(posedBoxes);
    expect(aim?.boxes).not.toEqual(unflinchedBoxes);
  });

  it('uses the realized envelope to stop at a wall', () => {
    const envelope = amalgamCollisionEnvelope(
      amalgamFigure(5, registry.zombies.get('amalgam')!.bodyScale!),
      BLOCK_SIZE,
    );
    const body: Body = {
      pos: [-(envelope.halfWidth + 2), 0, 0],
      vel: [0, 0, 0],
      halfWidth: envelope.halfWidth,
      halfDepth: envelope.halfDepth,
      height: envelope.height,
      onGround: true,
    };
    const wall = (x: number, y: number, z: number): boolean => x === 0 && y === 0 && z === 0;

    stepBodyHorizontal(body, {
      dx: envelope.halfWidth + 4,
      dz: 0,
      isSolid: wall,
      params: { gravity: 0, stepHeight: 0 },
    });

    expect(body.pos[0]).toBeLessThan(-envelope.halfWidth);
  });

  it('uses the BlockEntities closed-door path to stop the envelope', () => {
    const envelope = amalgamCollisionEnvelope(
      amalgamFigure(5, registry.zombies.get('amalgam')!.bodyScale!),
      BLOCK_SIZE,
    );
    const entities = new BlockEntities(registry);
    entities.add({ type: 'wood_door', pos: [0, 0, 0], size: [2, 4, 1], facing: 'n' });
    const body: Body = {
      pos: [-(envelope.halfWidth + 2), 0, 0],
      vel: [0, 0, 0],
      halfWidth: envelope.halfWidth,
      halfDepth: envelope.halfDepth,
      height: envelope.height,
      onGround: true,
    };

    expect(entities.isSolid(0, 0, 0)).toBe(true);
    stepBodyHorizontal(body, {
      dx: envelope.halfWidth + 4,
      dz: 0,
      isSolid: (x, y, z) => entities.isSolid(x, y, z),
      params: { gravity: 0, stepHeight: 0 },
    });

    expect(body.pos[0]).toBeLessThan(-envelope.halfWidth);
  });

  it.each(['fence', 'crates'] as const)('keeps amalgams grounded behind %s while shamblers cross', (kind) => {
    const amalgam = runObstacleCase(kind, 'amalgam');
    expect(amalgam.barrierSolid).toBe(true);
    expect(amalgam.mode).toBe('chase');
    expect(amalgam.maxZ).toBeGreaterThan(-30);
    expect(amalgam.crossed).toBe(false);
    expect(amalgam.leftGround).toBe(false);
    expect(runObstacleCase(kind, 'shambler').crossed).toBe(true);
  });

  it('keeps a grounded shambler from crossing a fence', () => {
    const groundedShambler = runObstacleCase('fence', 'shambler', false);
    expect(groundedShambler.crossed).toBe(false);
    expect(groundedShambler.leftGround).toBe(false);
  });

  it('routes a firearm projectile hit into the manifest-backed amalgam region', () => {
    const simulation = system();
    const id = simulation.add(registry.zombies.get('amalgam')!, [0, 1, 0]);
    const zombie = simulation.store.get(id)!;
    const ray = findMemberRay(simulation, id);
    const before = { ...zombie.regions };

    expect(
      simulation.firePellets(
        projectileShot(
          { calibre: 'test', pellets: 1, damage: 1, impulse: 0, rangeMetres: 50, diameterMm: 5 },
          ray.origin,
          [ray.direction],
        ),
      ),
    ).toBe(1);
    expect(zombie.regions[ray.regionId]).toBeLessThan(before[ray.regionId]!);
    expect(Object.keys(before).filter((region) => zombie.regions[region] !== before[region])).toEqual([ray.regionId]);
  });

  it('survives a pump blast and loses a member before the core dies', () => {
    const simulation = system();
    const type = registry.zombies.get('amalgam')!;
    const id = simulation.add(type, [0, 1, 0]);
    const zombie = simulation.store.get(id)!;
    const ammo = registry.items.get('shell_12_gauge_00_buck')!.ammo!;
    const fire = (origin: Vec3, basis: ReturnType<typeof aimBasis>, key: string): number =>
      simulation.firePellets(pelletShotFromBasis({ ammo, origin, basis, seed: 73, key }));
    const coreBoxes = posedAmalgamRegionBoxes(zombiePoseInputFor(zombie, id, BLOCK_SIZE));
    const coreCenter = coreBoxes['core.trunk']?.[0]?.voxelCentroid;
    expect(coreCenter).toBeDefined();
    const rangeMetres = 6;
    const coreOrigin: Vec3 = [coreCenter![0], coreCenter![1], coreCenter![2] + rangeMetres / BLOCK_SIZE];
    const coreBasis = aimBasis(0, 0, NEUTRAL_AIM);
    const coreBefore = zombie.regions['core.trunk']!;

    expect(fire(coreOrigin, coreBasis, 'opening-core-shot')).toBeGreaterThan(0);
    expect(simulation.store.get(id)).toBe(zombie);
    expect(zombie.regions['core.trunk']).toBeLessThan(coreBefore);

    const member = findMemberRay(simulation, id, rangeMetres);
    const memberDirection = member.direction;
    const memberBasis = aimBasis(
      Math.atan2(memberDirection[0], -memberDirection[2]),
      Math.atan2(memberDirection[1], Math.hypot(memberDirection[0], memberDirection[2])),
      NEUTRAL_AIM,
    );
    expect(fire(member.origin, memberBasis, 'member-shot')).toBeGreaterThan(0);
    expect(simulation.store.get(id)).toBe(zombie);
    expect(zombie.severed).toContain(member.partId);

    let followup = 0;
    const maxFollowupBlasts = 256;
    while (simulation.store.get(id) !== undefined && followup < maxFollowupBlasts) {
      const healthBefore = zombie.regions['core.trunk']!;
      expect(fire(coreOrigin, coreBasis, `core-followup-${followup}`)).toBeGreaterThan(0);
      followup += 1;
      if (simulation.store.get(id) !== undefined) {
        expect(zombie.regions['core.trunk']).toBeLessThan(healthBefore);
      }
    }
    expect(simulation.store.get(id), 'amalgam should die within a bounded number of follow-up blasts').toBeUndefined();
    expect(zombie.regions['core.trunk']).toBe(0);
    expect(zombie.severed).toContain(member.partId);
  });

  it('removes a severed member from attack reach while preserving the other members', () => {
    const simulation = system();
    const id = simulation.add(registry.zombies.get('amalgam')!, [0, 1, 0]);
    const zombie = simulation.store.get(id)!;
    const reach = zombieAttackReachMetres(zombie);
    const severOne = () => {
      const ray = findMemberRay(simulation, id);
      const damage = zombie.regions[ray.regionId]! + 1;
      expect(
        simulation.swing(ray.origin, ray.direction, {
          ...FISTS_MELEE,
          damage,
          reach: 4,
          impulse: 0,
        }),
      ).toBe(id);
    };

    expect(reach).toBeGreaterThan(0);
    expect(reach).toBeCloseTo(zombie.type.attack.reach * zombie.type.bodyScale!);
    severOne();
    expect(activeAmalgamMembers(zombie).length).toBeGreaterThan(0);
    expect(zombieAttackReachMetres(zombie)).toBe(reach);
    const noMembers = {
      ...zombie,
      severed: [
        ...zombie.severed,
        ...amalgamFigureForType(zombie.type, zombie.figureSeed)
          .manifest.parts.filter((part) => part.severable)
          .map((part) => part.id),
      ],
    };
    expect(activeAmalgamMembers(noMembers)).toHaveLength(0);
    expect(zombieAttackReachMetres(noMembers)).toBe(0);
  });

  it('rejects an amalgam save with a seed that has no rendered variant', () => {
    const simulation = system();
    const type = registry.zombies.get('amalgam')!;
    const id = simulation.add(type, [0, 1, 0]);
    const state = structuredClone(simulation.snapshotState());
    const { zombie } = state.zombies.find((entry) => entry.id === id)!;
    const unsupportedSeed = SHAMBLER_FIGURE_SEEDS.find((seed) => seed !== AMALGAM_FIGURE_SEED)!;
    const unsupportedFigure = amalgamFigureForType(type, unsupportedSeed);
    zombie.figureSeed = unsupportedSeed;
    zombie.regions = Object.fromEntries(
      unsupportedFigure.manifest.regions.map(({ id: region }) => {
        const healthKey = region === 'core.trunk' ? region : `member.${region.slice(region.lastIndexOf('.') + 1)}`;
        return [region, type.regions[healthKey]!];
      }),
    );
    const envelope = amalgamCollisionEnvelope(unsupportedFigure, BLOCK_SIZE);
    zombie.body.halfWidth = envelope.halfWidth;
    zombie.body.halfDepth = envelope.halfDepth;
    zombie.body.height = envelope.height;

    expect(() => system().restoreState(state, (typeId) => registry.zombies.get(typeId))).toThrow(
      `Invalid amalgam figure seed for entity ${id}`,
    );
  });

  it('round-trips an amalgam seed, dynamic regions and rectangular envelope through the save codec', async () => {
    const runtime = createRuntime();
    const id = runtime.zombies.add(registry.zombies.get('amalgam')!, [0, 1, 0]);
    const original = runtime.zombies.store.get(id)!;
    const decoded = await decodeSave(await encodeFixture(capture(runtime)), {
      contentLookup,
      version: formatVersion,
    });
    const saved = decoded.snapshot.world.zombies.zombies.find(({ zombie }) => zombie.type === 'amalgam')?.zombie;

    expect(saved?.figureSeed).toBe(original.figureSeed);
    expect(saved?.regions).toEqual(original.regions);
    expect(saved?.body.halfWidth).toBe(original.body.halfWidth);
    expect(saved?.body.halfDepth).toBe(original.body.halfDepth);
    expect(saved?.body.height).toBe(original.body.height);
  });

  it('severs one manifest member, preserves the core and other members, and restores that state', () => {
    const simulation = system();
    const type = registry.zombies.get('amalgam')!;
    const id = simulation.add(type, [0, 1, 0]);
    const zombie = simulation.store.get(id)!;
    const membersBefore = activeAmalgamMembers(zombie);
    const ray = findMemberRay(simulation, id);
    const target = membersBefore.find((member) => member.partId === ray.partId)!;
    const { regionId } = ray;
    const before = { ...zombie.regions };

    expect(
      simulation.swing(ray.origin, ray.direction, {
        ...FISTS_MELEE,
        damage: before[regionId]! + 1,
        reach: 4,
        impulse: 0,
      }),
    ).toBe(id);
    expect(zombie.severed).toContain(target.partId);
    expect(zombie.regions['core.trunk']).toBe(before['core.trunk']);
    for (const region of Object.keys(before)) {
      if (region.startsWith(`${target.partId}.`) && region !== regionId) {
        expect(zombie.regions[region]).toBe(before[region]);
      }
    }
    expect(activeAmalgamMembers(zombie).map(({ partId }) => partId)).toEqual(
      membersBefore.filter(({ partId }) => partId !== target.partId).map(({ partId }) => partId),
    );

    const boxesAfter = posedAmalgamRegionBoxes(zombiePoseInputFor(zombie, id, BLOCK_SIZE));
    for (const region of target.regionIds) {
      expect(boxesAfter[region]).toHaveLength(0);
    }
    expect(boxesAfter['core.trunk']!.length).toBeGreaterThan(0);

    const saved = simulation.snapshotState();
    const restored = system();
    restored.restoreState(saved, (typeId) => registry.zombies.get(typeId));
    expect(restored.snapshotState()).toEqual(saved);
    expect(activeAmalgamMembers(restored.store.get(id)!).map(({ partId }) => partId)).toEqual(
      activeAmalgamMembers(zombie).map(({ partId }) => partId),
    );
  });
});
