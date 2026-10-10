// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through Deadvox's TypeScript alias.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { voxelBounds } from '@mobgen/core/massProperties.ts';
import { SHAMBLER_FIGURE_SEEDS } from '@mobgen/mob/shamblerFigure.ts';
import { describe, expect, it } from 'vitest';
import { aimBasis, NEUTRAL_AIM } from '../src/core/aim.ts';
import { carveAround, missingFlesh, protectedCoreCell } from '../src/core/amalgamCarving.ts';
import {
  AMALGAM_FIGURE_SEED,
  amalgamCollisionEnvelope,
  amalgamFigure,
  amalgamFigureForType,
  amalgamStrikeOrigin,
} from '../src/core/amalgamFigure.ts';
import { AmalgamShape } from '../src/core/amalgamShape.ts';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { pelletShotFromBasis, projectileShot } from '../src/core/pellets.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import { testedBricks } from '../src/core/solidBricks.ts';
import { compileTemplate } from '../src/core/templates.ts';
import { World } from '../src/core/world.ts';
import { zombieFigure } from '../src/core/zombieFigure.ts';
import { posedShambler, zombiePoseInputFor } from '../src/core/zombiePose.ts';
import { posedAmalgamRegionBoxes } from '../src/core/zombieRegions.ts';
import {
  activeAmalgamMembers,
  FISTS_MELEE,
  PLAYER_CHEST_METRES,
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

/**
 * The centre of each flesh voxel in the amalgam's own frame (facing -z, from its ground origin), and the voxel edge,
 * in blocks: the rest pose the rendered figure stands in.
 */
const fleshVoxels = (figure: ReturnType<typeof amalgamFigure>): { voxel: number; centres: Vec3[] } => {
  const { dims, owner, size, origin } = figure.realized.voxels;
  const metres = size * figure.scale;
  const centres: Vec3[] = [];
  owner.forEach((bone, cell) => {
    if (bone > 0) {
      const [i, j, k] = [cell % dims[0], Math.floor(cell / dims[0]) % dims[1], Math.floor(cell / (dims[0] * dims[1]))];
      centres.push([
        ((origin[0] + i) * metres + figure.originOffset[0]) / BLOCK_SIZE,
        ((origin[1] + j + 0.5) * metres + figure.originOffset[1]) / BLOCK_SIZE,
        ((origin[2] + k) * metres + figure.originOffset[2]) / BLOCK_SIZE,
      ]);
    }
  });
  return { voxel: metres / BLOCK_SIZE, centres };
};

type ObstacleKind = 'fence' | 'crates';
interface ObstacleResult {
  barrierSolid: boolean;
  crossed: boolean;
  leftGround: boolean;
  maxZ: number;
  stalled: boolean;
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
  let stalled = false;
  let stalledTicks = 0;
  let previousZ = startZ;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let tick = 0; tick < 1200; tick++) {
    simulation.tick(1 / 60);
    const { body } = simulation.store.get(id)!;
    const [, , z] = body.pos;
    crossed ||= z > 2.5;
    leftGround ||= !body.onGround;
    maxZ = Math.max(maxZ, z);
    stalledTicks = z <= previousZ + 1e-8 ? stalledTicks + 1 : 0;
    previousZ = z;
    if (typeId === 'amalgam' && stalledTicks >= 60) {
      stalled = true;
      break;
    }
    if (typeId === 'shambler' && crossed) {
      break;
    }
  }
  return { barrierSolid, crossed, leftGround, maxZ, stalled, mode: simulation.store.get(id)!.mode };
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
    expect(registry.zombies.get('amalgam')?.authoredOnly).toBe(true);
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

  it.each(['fence', 'crates'] as const)('keeps amalgams grounded behind %s while shamblers cross', (kind) => {
    const amalgam = runObstacleCase(kind, 'amalgam');
    expect(amalgam.barrierSolid).toBe(true);
    expect(amalgam.mode).toBe('chase');
    expect(amalgam.stalled).toBe(true);
    expect(amalgam.maxZ).toBeGreaterThan(-30);
    expect(amalgam.crossed).toBe(false);
    expect(amalgam.leftGround).toBe(false);
    expect(runObstacleCase(kind, 'shambler').crossed).toBe(true);
  });

  it('walks through an opening its flesh fits but its old collision box does not', () => {
    const amalgam = registry.zombies.get('amalgam')!;
    const figure = amalgamFigureForType(amalgam, AMALGAM_FIGURE_SEED);
    const envelope = amalgamCollisionEnvelope(figure, BLOCK_SIZE);
    const start: Vec3 = [0.5, 1, 8];
    // A wall at z = 0, open in each block row half a block beyond the flesh that crosses it facing -z (the
    // flesh above and below the row by that margin too, since the body stands a skin above the floor).
    const { voxel, centres } = fleshVoxels(figure);
    const rows = new Map<number, [number, number]>();
    for (const [x, y] of centres) {
      for (let row = Math.floor(start[1] + y - voxel / 2 - 0.5); row < start[1] + y + voxel / 2 + 0.5; row++) {
        const [low, high] = rows.get(row) ?? [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
        rows.set(row, [Math.min(low, start[0] + x - voxel / 2), Math.max(high, start[0] + x + voxel / 2)]);
      }
    }
    const wall = (x: number, y: number): boolean => {
      const open = rows.get(y);
      return y > 0 && y <= start[1] + envelope.height + 2 && (!open || x < open[0] - 0.5 || x + 1 > open[1] + 0.5);
    };
    const walled = (x: number, y: number, z: number): boolean => y === 0 || (z === 0 && wall(x, y));
    let boxBlocked = false;
    for (let y = 1; y < start[1] + envelope.height; y++) {
      for (let x = Math.floor(start[0] - envelope.halfWidth); x < start[0] + envelope.halfWidth; x++) {
        boxBlocked ||= wall(x, y);
      }
    }
    expect(boxBlocked).toBe(true);

    // In sight from the start, and far enough beyond the wall that the amalgam clears it before it stops to strike.
    const seenPlayer: PlayerSense = { ...player(), pos: [start[0], 1, -28] };
    const simulation = new ZombieSystem({
      player: () => seenPlayer,
      isSolid: walled,
      isOpaque: () => false,
      dayPhase: () => dayStateAtHour(12),
      blockSize: BLOCK_SIZE,
      physics: physicsFor(makeScale(0.5)),
      jumpSpeed: PLAYER.jump,
      tuning: TEST_SENSE_TUNING,
      hurtPlayer: () => undefined,
    });
    const id = simulation.add(amalgam, start, [0, 0, -1]);
    const reached = (): number => simulation.store.get(id)!.body.pos[2];
    const through = -envelope.halfDepth - 1;
    for (let tick = 0; tick < 3600 && reached() > through; tick++) {
      simulation.tick(1 / 60);
    }
    expect(reached()).toBeLessThan(through);
  });

  it('turns off a pillar its flesh is pressed against to strike a player behind it', () => {
    const amalgam = registry.zombies.get('amalgam')!;
    const pillar = (x: number, y: number, z: number): boolean => x >= 0 && x <= 1 && z >= -1 && z <= 0 && y > 0;
    // Seen beyond the pillar, so the amalgam chases into it.
    let sense: PlayerSense = { ...player(), pos: [0.5, 1, -8] };
    const simulation = new ZombieSystem({
      player: () => sense,
      isSolid: (x, y, z) => y === 0 || pillar(x, y, z),
      isOpaque: () => false,
      dayPhase: () => dayStateAtHour(12),
      blockSize: BLOCK_SIZE,
      physics: physicsFor(makeScale(0.5)),
      jumpSpeed: PLAYER.jump,
      tuning: TEST_SENSE_TUNING,
      hurtPlayer: () => undefined,
    });
    const id = simulation.add(amalgam, [0.5, 1, 14], [0, 0, -1]);
    const zombie = simulation.store.get(id)!;
    let still = 0;
    for (let tick = 0; tick < 1200 && still < 30; tick++) {
      const [fromX, , fromZ] = zombie.body.pos;
      simulation.tick(1 / 60);
      still = fromX === zombie.body.pos[0] && fromZ === zombie.body.pos[2] ? still + 1 : 0;
    }
    const [atX, atY, atZ] = zombie.body.pos;
    expect(simulation.shapeOf(zombie.body)!.overlapsTerrain([atX, atY, atZ - 0.05])).toBe(true);
    expect(zombie.attackWait).toBe(0);

    // It hears the player jog round behind it, outside its sight.
    sense = { ...player(), pos: [atX + 3, 1, atZ + 10], movement: 'jogging' };
    const [fx, , fz] = zombie.facing;
    const facingPlayer = (fx * 3 + fz * 10) / Math.hypot(3, 10);
    expect(facingPlayer).toBeLessThan(Math.cos((zombie.type.sightCone * Math.PI) / 180));
    const halfTurnTicks = (180 / amalgam.wander.bodyTurnDegreesPerSimSecond) * 60;
    let struck = false;
    for (let tick = 0; tick < 2 * halfTurnTicks && !struck; tick++) {
      simulation.tick(1 / 60);
      struck = zombie.attackWindup > 0;
    }
    expect(struck).toBe(true);
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

    // Blasts down one line bore through the core and later ones pass, so each follow-up aims at a patch of core
    // flesh still there, wide enough for the spread.
    const coreWeapon = { damage: 0, reach: rangeMetres + 4, cooldown: 0 };
    const coreOffsets = Array.from({ length: 17 * 17 }, (_, index): [number, number] => [
      (index % 17) / 2 - 4,
      Math.floor(index / 17) / 2 - 4,
    ]).sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
    const lineAt = ([dx, dy]: readonly number[]): Vec3 => [coreOrigin[0] + dx!, coreOrigin[1] + dy!, coreOrigin[2]];
    const hitsCore = (offset: readonly number[]): boolean =>
      simulation.aimAt(lineAt(offset), [0, 0, -1], coreWeapon)?.region === 'core.trunk';
    const patch = [
      [0, 0],
      [0.5, 0],
      [-0.5, 0],
      [0, 0.5],
      [0, -0.5],
    ];
    const coreLine = (): Vec3 | undefined => {
      const offset =
        coreOffsets.find(([dx, dy]) => patch.every(([ex, ey]) => hitsCore([dx + ex!, dy + ey!]))) ??
        coreOffsets.find(hitsCore);
      return offset && lineAt(offset);
    };
    let followup = 0;
    const maxFollowupBlasts = 256;
    while (simulation.store.get(id) !== undefined && followup < maxFollowupBlasts) {
      const healthBefore = zombie.regions['core.trunk']!;
      const origin = coreLine();
      expect(origin).toBeDefined();
      expect(fire(origin!, coreBasis, `core-followup-${followup}`)).toBeGreaterThan(0);
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

interface AttackLineCase {
  readonly typeId: 'amalgam' | 'shambler';
  /** The line from the attack's origin up to the player's chest: its angle above level ground. */
  readonly elevation: number;
  /** That line's length, as a share of the attack's reach. */
  readonly reachShare: number;
  /** A solid slab across the whole map, under the player's feet. */
  readonly roof?: boolean;
}

/** Places the player at the far end of the line, then ticks once and through one windup. */
const attackAlong = ({ typeId, elevation, reachShare, roof = false }: AttackLineCase) => {
  let roofY = Number.NaN;
  let sense = player();
  const hits: number[] = [];
  const simulation = new ZombieSystem({
    player: () => sense,
    isSolid: (_x, y) => y === 0 || y === roofY,
    isOpaque: FLOOR,
    dayPhase: () => dayStateAtHour(12),
    blockSize: BLOCK_SIZE,
    physics: physicsFor(makeScale(0.5)),
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    hurtPlayer: (amount) => hits.push(amount),
  });
  const feet: Vec3 = [0, 1, 0];
  const id = simulation.add(registry.zombies.get(typeId)!, feet, [0, 0, 1]);
  const zombie = simulation.store.get(id)!;
  const reachMetres = zombieAttackReachMetres(zombie);
  const offsetMetres =
    typeId === 'amalgam'
      ? amalgamStrikeOrigin(amalgamFigureForType(zombie.type, zombie.figureSeed), zombie.facing)
      : [0, PLAYER_CHEST_METRES, 0];
  const origin = feet.map((coordinate, axis) => coordinate + offsetMetres[axis]! / BLOCK_SIZE) as Vec3;
  const line = (reachMetres * reachShare) / BLOCK_SIZE;
  const chest: Vec3 = [origin[0], origin[1] + line * Math.sin(elevation), origin[2] + line * Math.cos(elevation)];
  sense = { ...player(), pos: [chest[0], chest[1] - PLAYER_CHEST_METRES / BLOCK_SIZE, chest[2]] };
  if (roof) {
    roofY = Math.floor(sense.pos[1]) - 1;
  }
  simulation.tick(1 / 60);
  const started = zombie.attackWindup > 0;
  for (let tick = 0; tick <= Math.ceil(zombie.type.attack.windupSimSeconds * 60); tick++) {
    simulation.tick(1 / 60);
  }
  return {
    started,
    hit: hits.length > 0,
    reachMetres,
    riseMetres: (sense.pos[1] - feet[1]) * BLOCK_SIZE,
    horizontalMetres: Math.hypot(sense.pos[0] - feet[0], sense.pos[2] - feet[2]) * BLOCK_SIZE,
    roofClearsBody: roof && roofY > feet[1] + zombie.body.height,
  };
};

describe('attack line', () => {
  it('lets an amalgam strike a player higher than a standing player when the straight line is within reach', () => {
    const strike = attackAlong({ typeId: 'amalgam', elevation: Math.PI / 4, reachShare: 0.9 });
    expect(strike.riseMetres).toBeGreaterThan(PLAYER.height);
    expect(strike.started).toBe(true);
    expect(strike.hit).toBe(true);
  });

  it('keeps an amalgam from striking when the straight line exceeds reach, though the ground distance is within it', () => {
    const strike = attackAlong({ typeId: 'amalgam', elevation: Math.acos(0.9 / 1.2), reachShare: 1.2 });
    expect(strike.horizontalMetres).toBeLessThanOrEqual(strike.reachMetres);
    expect(strike.started).toBe(false);
  });

  it('keeps an amalgam from striking through a roof across the line', () => {
    const strike = attackAlong({ typeId: 'amalgam', elevation: Math.PI / 4, reachShare: 0.9, roof: true });
    expect(strike.roofClearsBody).toBe(true);
    expect(strike.started).toBe(false);
    expect(strike.hit).toBe(false);
  });

  it('keeps a shambler grab horizontal: it reaches a player a step above, past its straight-line reach', () => {
    const grab = attackAlong({ typeId: 'shambler', elevation: Math.atan2(0.6, 0.9), reachShare: Math.hypot(0.9, 0.6) });
    expect(grab.horizontalMetres).toBeLessThanOrEqual(grab.reachMetres);
    expect(grab.riseMetres).toBeLessThan(PLAYER.height);
    expect(grab.started).toBe(true);
  });
});

describe('amalgam flesh carving', () => {
  const amalgam = registry.zombies.get('amalgam')!;
  const carving = amalgam.carving!;
  const { carving: _ignored, ...uncarvedAmalgam } = amalgam;
  const buck = registry.items.get('shell_12_gauge_00_buck')!.ammo!;
  const figure = amalgamFigureForType(amalgam, AMALGAM_FIGURE_SEED);
  const voxelMetres = figure.realized.voxels.size * figure.scale;

  /** One amalgam, and a straight line at its core from a few metres out. */
  const coreTarget = (simulation = system(), type: typeof amalgam = amalgam) => {
    const id = simulation.add(type, [0, 1, 0]);
    const zombie = simulation.store.get(id)!;
    const core = posedAmalgamRegionBoxes(zombiePoseInputFor(zombie, id, BLOCK_SIZE))['core.trunk']![0]!.voxelCentroid;
    const origin: Vec3 = [core[0], core[1], core[2] + 6 / BLOCK_SIZE];
    const direction: Vec3 = [0, 0, -1];
    const pellets = (count: number, damage: number) =>
      simulation.firePellets(
        projectileShot({ ...buck, pellets: count, damage }, origin, new Array(count).fill(direction)),
      );
    return { simulation, id, zombie, origin, direction, pellets };
  };

  it('knocks out the flesh where a hit lands, and more of it for a heavier hit', () => {
    const light = coreTarget();
    const heavy = coreTarget();
    light.pellets(1, 1);
    heavy.pellets(1, Math.min(carving.maxRadiusMetres, 2 * voxelMetres) / carving.radiusMetresPerDamage);
    expect(light.zombie.carved.length).toBeGreaterThan(0);
    expect(heavy.zombie.carved).toEqual(expect.arrayContaining(light.zombie.carved));
    expect(heavy.zombie.carved.length).toBeGreaterThan(light.zombie.carved.length);
  });

  it("makes one hole from one shot's pellets, sized by their summed damage, instead of one per pellet", () => {
    const shot = coreTarget();
    const slug = coreTarget();
    const pellet = coreTarget();
    shot.pellets(buck.pellets, buck.damage);
    slug.pellets(1, buck.pellets * buck.damage);
    pellet.pellets(1, buck.damage);
    expect(shot.zombie.carved).toEqual(slug.zombie.carved);
    expect(shot.zombie.carved.length).toBeGreaterThan(pellet.zombie.carved.length);
  });

  it('never carves the core cell the tentacle roots in, whatever is carved around it', () => {
    const keep = protectedCoreCell(figure);
    const core = figure.realized.body.bones.findIndex((bone) => bone.id === 'core') + 1;
    expect(figure.realized.voxels.owner[keep]).toBe(core);
    const around = carveAround({
      figure,
      carving,
      missing: missingFlesh(figure, { carved: [], severed: [] }),
      struck: keep,
      damage: Number.MAX_VALUE,
    });
    expect(around.length).toBeGreaterThan(0);
    expect(around).not.toContain(keep);
  });

  it('keeps its holes through the save codec and a restore', async () => {
    const runtime = createRuntime();
    const target = coreTarget(runtime.zombies);
    target.pellets(buck.pellets, buck.damage);
    expect(target.zombie.carved.length).toBeGreaterThan(0);
    const decoded = await decodeSave(await encodeFixture(capture(runtime)), { contentLookup, version: formatVersion });
    expect(decoded.snapshot.world.zombies.zombies.find(({ id }) => id === target.id)?.zombie.carved).toEqual(
      target.zombie.carved,
    );
    const restored = system();
    restored.restoreState(runtime.zombies.snapshotState(), (typeId) => registry.zombies.get(typeId));
    expect(restored.store.get(target.id)!.carved).toEqual(target.zombie.carved);
  });

  it.each([
    { hole: 'a cell outside the grid', typeId: 'amalgam', carved: [figure.realized.voxels.owner.length] },
    { hole: 'a cell with no flesh', typeId: 'amalgam', carved: [figure.realized.voxels.owner.indexOf(0)] },
    { hole: 'the protected core cell', typeId: 'amalgam', carved: [protectedCoreCell(figure)] },
    { hole: 'a hole on a type that does not carve', typeId: 'shambler', carved: [0] },
  ])('refuses a save with $hole', ({ typeId, carved }) => {
    const simulation = system();
    const id = simulation.add(registry.zombies.get(typeId)!, [0, 1, 0]);
    const state = structuredClone(simulation.snapshotState());
    state.zombies.find((entry) => entry.id === id)!.zombie.carved = carved;
    expect(() => system().restoreState(state, (type) => registry.zombies.get(type))).toThrow(
      `Invalid carved cells for entity ${id}`,
    );
  });

  /** An amalgam with every member severed, brought back by a save restore as a load would. */
  const severedAmalgam = () => {
    const simulation = system();
    const id = simulation.add(amalgam, [0, 1, 0]);
    const state = structuredClone(simulation.snapshotState());
    state.zombies.find((entry) => entry.id === id)!.zombie.severed = figure.manifest.parts
      .filter((part) => part.severable)
      .map((part) => part.id);
    const restored = system();
    restored.restoreState(state, (type) => registry.zombies.get(type));
    const zombie = restored.store.get(id)!;
    const input = zombiePoseInputFor(zombie, id, BLOCK_SIZE);
    const { hidden } = posedShambler(input);
    const { owner } = figure.realized.voxels;
    const lost = (cell: number): boolean =>
      owner[cell]! > 0 && hidden.has(figure.realized.body.bones[owner[cell]! - 1]!.id);
    return { simulation: restored, zombie, input, lost };
  };

  it('misses with a ray just beside the flesh, inside the core box', () => {
    const { simulation, zombie, input } = severedAmalgam();
    const weapon = { damage: 0, reach: 10, cooldown: 0 };
    const step = voxelMetres / BLOCK_SIZE;
    const { pos, halfWidth, height } = zombie.body;
    const halfDepth = zombie.body.halfDepth ?? halfWidth;
    const within = (box: (typeof boxes)[number], point: Vec3): boolean => {
      const offset = point.map((value, axis) => (value - box.center[axis]!) * BLOCK_SIZE);
      const local = [0, 1, 2].map((column) =>
        [0, 1, 2].reduce((sum, axis) => sum + box.rotation[axis * 3 + column]! * offset[axis]!, 0),
      );
      return (
        local.every((value, axis) => Math.abs(value) < box.halfSize[axis]!) &&
        Math.abs(point[0] - pos[0]) < halfWidth &&
        Math.abs(point[2] - pos[2]) < halfDepth &&
        point[1] > pos[1] &&
        point[1] < pos[1] + height
      );
    };
    const boxes = posedAmalgamRegionBoxes(input)['core.trunk']!;
    /** Horizontal lines along one row, outward from a core box's centre: the first to miss after one that strikes. */
    const besideOnRow = (box: (typeof boxes)[number], direction: Vec3, row: number, sign: number): Vec3[] => {
      const side: Vec3 = [direction[2], 0, -direction[0]];
      let struck = false;
      for (let out = 0; out < 40; out++) {
        const point = box.voxelCentroid.map(
          (value, axis) => value + (side[axis]! * sign * out + (axis === 1 ? row : 0)) * step,
        ) as Vec3;
        if (!within(box, point)) {
          return [];
        }
        const from = point.map((value, axis) => value - (direction[axis]! * 4) / BLOCK_SIZE) as Vec3;
        const aim = simulation.aimAt(from, direction, weapon);
        if (struck && aim === undefined) {
          return [point];
        }
        struck ||= aim?.region === 'core.trunk';
      }
      return [];
    };
    const beside = boxes.flatMap((box) =>
      MEMBER_RAY_DIRECTIONS.filter((candidate) => candidate[1] === 0).flatMap((direction) =>
        [-12, -9, -6, -3, 0, 3, 6, 9, 12].flatMap((row) =>
          [-1, 1].flatMap((sign) => besideOnRow(box, direction, row, sign)),
        ),
      ),
    );
    expect(beside.length).toBeGreaterThan(0);
  });

  it('lets a later shot through a carved hole strike the flesh behind it, or pass through', () => {
    const target = coreTarget();
    const weapon = { damage: 0, reach: 10, cooldown: 0 };
    const before = target.simulation.aimAt(target.origin, target.direction, weapon);
    expect(before?.region).toBe('core.trunk');
    target.pellets(1, Math.min(carving.maxRadiusMetres, 2 * voxelMetres) / carving.radiusMetresPerDamage);
    expect(target.zombie.carved.length).toBeGreaterThan(0);
    const after = target.simulation.aimAt(target.origin, target.direction, weapon);
    expect(after === undefined || after.distanceMetres > before!.distanceMetres).toBe(true);
  });

  it('turns its movement shape as the posed figure turns, and keeps it in step with its holes, carve by carve', () => {
    const target = coreTarget();
    const { simulation, zombie } = target;
    const kept = simulation.shapeOf(zombie.body) as AmalgamShape;
    for (const [key, yaw] of [
      ['first', 0],
      ['second', 0.15],
      ['third', -0.15],
    ] as const) {
      simulation.firePellets(
        pelletShotFromBasis({ ammo: buck, origin: target.origin, basis: aimBasis(yaw, 0, NEUTRAL_AIM), seed: 5, key }),
      );
      simulation.shapeOf(zombie.body);
    }
    const built = (carved: readonly number[]): AmalgamShape => {
      const shape = new AmalgamShape(figure, BLOCK_SIZE, testedBricks(FLOOR));
      shape.keep(carved, 0, () => missingFlesh(figure, { carved, severed: [] }));
      return shape;
    };
    // A small box at the centre of every voxel of flesh the figure was built with, turned off the axes as the
    // posed figure turns: by its core box's turn from facing -z.
    const facing: Vec3 = [Math.sin(0.7), 0, -Math.cos(0.7)];
    const coreTurn = (toward: Vec3) =>
      posedAmalgamRegionBoxes(poseInputForFigure(figure, [0, 0, 0], toward))['core.trunk']![0]!.rotation;
    const [turned, unturned] = [coreTurn(facing), coreTurn([0, 0, -1])];
    const turn = (row: number, column: number): number =>
      [0, 1, 2].reduce((sum, k) => sum + turned[row * 3 + k]! * unturned[column * 3 + k]!, 0);
    const centres = fleshVoxels(figure).centres.map((point) =>
      [0, 1, 2].map((row) => [0, 1, 2].reduce((sum, column) => sum + turn(row, column) * point[column]!, 0)),
    );
    const probe = (shape: AmalgamShape): boolean[] => {
      shape.face(facing);
      return centres.map(([x, y, z]) =>
        shape.overlapsBox([0, 0, 0], [x! - 0.01, y! - 0.01, z! - 0.01], [x! + 0.01, y! + 0.01, z! + 0.01]),
      );
    };
    const whole = probe(built([]));
    const fresh = probe(built(zombie.carved));
    expect(whole.every(Boolean)).toBe(true);
    expect(zombie.carved.length).toBeGreaterThan(0);
    expect(fresh).not.toEqual(whole);
    expect(probe(kept)).toEqual(fresh);
  });

  it('opens a hole for every shot that hits the core after its members are severed', () => {
    const { simulation, zombie, input } = severedAmalgam();
    // A ring of light pellets at each core box; some lines cross where a lost member's voxels were.
    const lines = posedAmalgamRegionBoxes(input)['core.trunk']!.flatMap((box) =>
      Array.from({ length: 16 }, (_, step) => (step / 16) * 2 * Math.PI).flatMap((angle) =>
        [-0.4, 0, 0.4].map((lift) => {
          const length = Math.hypot(1, lift);
          const direction: Vec3 = [Math.cos(angle) / length, lift / length, Math.sin(angle) / length];
          const origin = box.voxelCentroid.map((value, axis) => value - (direction[axis]! * 4) / BLOCK_SIZE) as Vec3;
          return { origin, direction };
        }),
      ),
    );
    let hits = 0;
    let holes = 0;
    for (const { origin, direction } of lines) {
      const before = zombie.carved.length;
      if (simulation.firePellets(projectileShot({ ...buck, pellets: 1, damage: 1 }, origin, [direction])) > 0) {
        hits += 1;
        holes += zombie.carved.length > before ? 1 : 0;
      }
    }
    expect(hits).toBeGreaterThan(0);
    expect(holes).toBe(hits);
  });

  it("never knocks out a lost member's hidden voxels, even with a blast struck beside them", () => {
    const { zombie, lost } = severedAmalgam();
    const { dims, owner } = figure.realized.voxels;
    const faceNeighbours = (cell: number): number[] => {
      const [i, j, k] = [cell % dims[0], Math.floor(cell / dims[0]) % dims[1], Math.floor(cell / (dims[0] * dims[1]))];
      return [
        [i + 1, j, k],
        [i - 1, j, k],
        [i, j + 1, k],
        [i, j - 1, k],
        [i, j, k + 1],
        [i, j, k - 1],
      ]
        .filter(([a, b, c]) => a! >= 0 && b! >= 0 && c! >= 0 && a! < dims[0] && b! < dims[1] && c! < dims[2])
        .map(([a, b, c]) => a! + b! * dims[0] + c! * dims[0] * dims[1]);
    };
    const struck = owner.findIndex(
      (value, cell) =>
        value > 0 && !lost(cell) && cell !== protectedCoreCell(figure) && faceNeighbours(cell).some(lost),
    );
    expect(struck).toBeGreaterThanOrEqual(0);
    const cells = carveAround({
      figure,
      carving,
      missing: missingFlesh(figure, zombie),
      struck,
      damage: buck.pellets * buck.damage,
    });
    expect(cells).toContain(struck);
    expect(cells.filter(lost)).toEqual([]);
  });

  it('carves the same holes when the same hits replay', () => {
    const play = () => {
      const target = coreTarget();
      for (const key of ['first', 'second', 'third']) {
        target.simulation.firePellets(
          pelletShotFromBasis({ ammo: buck, origin: target.origin, basis: aimBasis(0, 0, NEUTRAL_AIM), seed: 5, key }),
        );
      }
      return target.zombie.carved;
    };
    const first = play();
    expect(first.length).toBeGreaterThan(0);
    expect(play()).toEqual(first);
  });

  it('leaves the damage, region health and severing of the hit that carves as they would be without holes', () => {
    const play = (type: typeof amalgam) => {
      const target = coreTarget(system(), type);
      target.simulation.firePellets(
        pelletShotFromBasis({
          ammo: buck,
          origin: target.origin,
          basis: aimBasis(0.2, 0.1, NEUTRAL_AIM),
          seed: 9,
          key: 'a',
        }),
      );
      const { regions, severed, carved } = target.zombie;
      const alive = target.simulation.store.get(target.id) !== undefined;
      return { regions: { ...regions }, severed: [...severed], carved, alive };
    };
    const carved = play(amalgam);
    const whole = play(uncarvedAmalgam);
    expect(carved.carved.length).toBeGreaterThan(0);
    expect(whole.carved).toEqual([]);
    expect({ ...carved, carved: [] }).toEqual(whole);
  });
});
