import { type HorizontalFootprint, headingAt, onTerrainFloor, sub, type TerrainFloorAt, unit } from './actorMotion.ts';
import type {
  HeardNoise,
  HearingInput,
  HearingTier,
  PerceptionInput,
  PlayerMovement,
  PlayerSense,
  SensedLightSource,
  VocalNoise,
} from './actorSense.ts';
import { copy } from './actorState.ts';
import type { ActorDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { DayPhase } from './dayPhase.ts';
import { lightSenseRangeScale } from './lights.ts';
import type { PlayerStance } from './playerStance.ts';
import type { Rng } from './random.ts';
import { raycast, type SolidAt } from './raycast.ts';
import type { SenseDef } from './schema.ts';
import { soundOcclusion } from './soundOcclusion.ts';

/** A lowered stance's tuning, or undefined standing. */
export const loweredStanceTuning = <T>(tuning: { crouch: T; prone: T }, stance: PlayerStance | undefined) => {
  switch (stance) {
    case 'crouching':
      return tuning.crouch;
    case 'prone':
      return tuning.prone;
    default:
      return;
  }
};

const hearingRange = (actor: ActorDef, movement: PlayerMovement): number => {
  if (movement === 'sprinting') {
    return actor.agent.hearingRange.sprint * actor.agent.hearing;
  }
  if (movement === 'jogging') {
    return actor.agent.hearingRange.jog * actor.agent.hearing;
  }
  if (movement === 'walking') {
    return actor.agent.hearingRange.walk * actor.agent.hearing;
  }
  return 0;
};

export const hearingTier = ({
  def: actor,
  from,
  player,
  blockSize,
  isSolid,
  tuning,
}: Omit<HearingInput, 'rng'>): HearingTier | undefined => {
  const range =
    hearingRange(actor, player.movement) * (loweredStanceTuning(tuning, player.stance)?.hearingRangeScale ?? 1);
  if (range <= 0) {
    return undefined;
  }
  const distance = Math.hypot(...sub(player.pos, from)) * blockSize;
  if (distance > range * actor.agent.hearingModel.farMultiplier) {
    return undefined;
  }
  const earOffset = actor.earHeightMetres / blockSize;
  const origin: Vec3 = [from[0], from[1] + earOffset, from[2]];
  const source: Vec3 = [player.pos[0], player.pos[1] + earOffset, player.pos[2]];
  const wallScale = soundOcclusion({ listener: origin, source, isSolid, globalWall: tuning.wall }).occluded
    ? tuning.wall.hearingRangeScale
    : 1;
  const effectiveRange = range * wallScale;
  if (distance <= effectiveRange) {
    return 'near';
  }
  if (distance <= effectiveRange * actor.agent.hearingModel.farMultiplier) {
    return 'far';
  }
  return undefined;
};

export const farBearingTarget = ({
  def: actor,
  from,
  source,
  blockSize,
  rng,
}: {
  def: ActorDef;
  from: Vec3;
  source: Vec3;
  blockSize: number;
  rng: Rng;
}): Vec3 => {
  const angle = Math.atan2(source[0] - from[0], source[2] - from[2]);
  const error = rng.range(-actor.agent.hearingModel.bearingErrorRadians, actor.agent.hearingModel.bearingErrorRadians);
  const bearing = headingAt(angle + error);
  const distance = actor.agent.hearingModel.investigationDistanceMetres / blockSize;
  return [from[0] + bearing[0] * distance, from[1], from[2] + bearing[2] * distance];
};

/** Returns an exact near-noise position or a seeded, uncertain far bearing. */
export const hearPlayer = (input: HearingInput): HeardNoise | undefined => {
  const tier = hearingTier(input);
  if (!tier) {
    return undefined;
  }
  return {
    tier,
    target: tier === 'near' ? copy(input.player.pos) : farBearingTarget({ ...input, source: input.player.pos }),
  };
};

export interface VocalNoiseInput {
  def: ActorDef;
  from: Vec3;
  noise: VocalNoise;
  time: number;
  blockSize: number;
  isSolid: SolidAt;
  rng: Rng;
  tuning: SenseDef;
}

/** Applies the shared coarse wall step and two-tier bearing model to a player sound. */
export const hearVocalNoise = ({
  def: actor,
  from,
  noise,
  time,
  blockSize,
  isSolid,
  rng,
  tuning,
}: VocalNoiseInput): HeardNoise | undefined => {
  if (time > noise.expiresAt) {
    return undefined;
  }
  const distance = Math.hypot(...sub(noise.pos, from)) * blockSize;
  if (distance > noise.radiusMetres * actor.agent.hearing * actor.agent.hearingModel.farMultiplier) {
    return undefined;
  }
  const earOffset = actor.earHeightMetres / blockSize;
  const origin: Vec3 = [from[0], from[1] + earOffset, from[2]];
  const source: Vec3 = [noise.pos[0], noise.pos[1] + earOffset, noise.pos[2]];
  const wallScale = soundOcclusion({ listener: origin, source, isSolid, globalWall: tuning.wall }).occluded
    ? tuning.wall.hearingRangeScale
    : 1;
  const hearingRadius = noise.radiusMetres * actor.agent.hearing * wallScale;
  if (distance <= hearingRadius) {
    return { tier: 'near', target: copy(noise.pos) };
  }
  if (distance <= hearingRadius * actor.agent.hearingModel.farMultiplier) {
    return {
      tier: 'far',
      target: farBearingTarget({ def: actor, from, source: noise.pos, blockSize, rng }),
    };
  }
  return undefined;
};

export const seesPlayer = ({
  def: actor,
  from,
  facing,
  player,
  dayPhase,
  sightBlend,
  blockSize,
  isSolid,
  isSunExposedAt,
  tuning,
}: PerceptionInput): boolean => {
  const delta = sub(player.pos, from);
  const metres = Math.hypot(delta[0], delta[2]) * blockSize;
  const dir = unit(delta);
  const look = unit(facing);
  const dot = Math.max(-1, Math.min(1, look[0] * dir[0] + look[2] * dir[2]));
  const inCone = dot >= Math.cos((actor.agent.sightCone * Math.PI) / 180);
  if (!inCone || metres <= 0) {
    return false;
  }
  let sightRange = actor.agent.nightSight + (actor.agent.sight - actor.agent.nightSight) * sightBlend;
  const playerSunlit = player.sunlit ?? isSunExposedAt?.(player.pos) ?? dayPhase === 'day';
  const playerLightScale = lightSenseRangeScale('carried', playerSunlit, tuning.light);
  const lightSpotScale = actor.agent.lightSightScale ?? 1;
  const maximumRange = Math.max(sightRange, player.lit ? player.lightSeenFrom * playerLightScale * lightSpotScale : 0);
  if (metres > maximumRange) {
    return false;
  }
  const rayOrigin: Vec3 = [from[0], from[1] + actor.eyeHeightMetres / blockSize, from[2]];
  const rayTarget: Vec3 = [player.pos[0], player.pos[1] + player.eyeHeightMetres / blockSize, player.pos[2]];
  const toTarget = sub(rayTarget, rayOrigin);
  const clear = raycast(rayOrigin, unit(toTarget), Math.hypot(...toTarget), isSolid) === undefined;
  if (player.lit && clear && playerLightScale > 0) {
    sightRange = Math.max(sightRange, player.lightSeenFrom * playerLightScale * lightSpotScale);
  } else {
    sightRange *= loweredStanceTuning(tuning, player.stance)?.sightRangeScale ?? 1;
  }
  return clear && metres <= sightRange;
};

const canSeeLight = ({
  def: actor,
  from,
  look,
  source,
  dayPhase,
  blockSize,
  isOpaque,
  isSunExposedAt,
  tuning,
}: {
  def: ActorDef;
  from: Vec3;
  look: Vec3;
  source: SensedLightSource;
  dayPhase: DayPhase;
  blockSize: number;
  isOpaque: SolidAt;
  isSunExposedAt?: ((position: Vec3) => boolean) | undefined;
  tuning: SenseDef;
}): number | undefined => {
  const delta = sub(source.pos, from);
  const distance = Math.hypot(delta[0], delta[2]) * blockSize;
  const sunlit = source.sunlit ?? isSunExposedAt?.(source.pos) ?? dayPhase === 'day';
  const exposure = source.carried ? 'carried' : 'world';
  if (
    distance <= 0 ||
    distance >
      source.seenFrom * lightSenseRangeScale(exposure, sunlit, tuning.light) * (actor.agent.lightSightScale ?? 1)
  ) {
    return undefined;
  }
  const direction = unit(delta);
  const dot = Math.max(-1, Math.min(1, look[0] * direction[0] + look[2] * direction[2]));
  if (dot < Math.cos((actor.agent.sightCone * Math.PI) / 180)) {
    return undefined;
  }
  const origin: Vec3 = [from[0], from[1] + actor.eyeHeightMetres / blockSize, from[2]];
  const target: Vec3 = [source.pos[0], source.pos[1] + source.heightMetres / blockSize, source.pos[2]];
  const ray = sub(target, origin);
  return raycast(origin, unit(ray), Math.hypot(...ray), isOpaque) === undefined ? distance : undefined;
};

export const visibleLightTarget = ({
  def: actor,
  from,
  facing,
  player,
  dayPhase,
  blockSize,
  isOpaque,
  isSunExposedAt,
  tuning,
}: {
  def: ActorDef;
  from: Vec3;
  facing: Vec3;
  player: PlayerSense;
  dayPhase: DayPhase;
  blockSize: number;
  isOpaque: SolidAt;
  isSunExposedAt?: ((position: Vec3) => boolean) | undefined;
  tuning: SenseDef;
}): Vec3 | undefined => {
  const look = unit(facing);
  let nearest: SensedLightSource | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const source of player.lightSources ?? []) {
    const distance = canSeeLight({
      def: actor,
      from,
      look,
      source,
      dayPhase,
      blockSize,
      isOpaque,
      isSunExposedAt,
      tuning,
    });
    if (distance !== undefined && distance < nearestDistance) {
      nearest = source;
      nearestDistance = distance;
    }
  }
  return nearest ? copy(nearest.pos) : undefined;
};

/** Returns true for sight or either audible tier, using metres for distances and angles. */
export const perceivePlayer = (input: PerceptionInput): boolean =>
  seesPlayer(input) || hearingTier(input) !== undefined;
export const sameInvestigationFloor = (
  a: Vec3,
  b: Vec3,
  terrainFloor: TerrainFloorAt | undefined,
  footprint: HorizontalFootprint,
): boolean =>
  Math.round(a[1]) === Math.round(b[1]) ||
  (terrainFloor !== undefined &&
    onTerrainFloor(a, terrainFloor, footprint) &&
    onTerrainFloor(b, terrainFloor, footprint));
