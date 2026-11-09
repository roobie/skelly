import { type ActorFigureFiles, actorFigure } from './actorFigureFiles.ts';
import type { Actor } from './actorState.ts';
import { activeFusedMassMembers, actorAttackReachMetres, requiredGrabBand } from './actorState.ts';
import { severedBoneSet } from './boneTree.ts';
import type { MeleeBlocker } from './collision.ts';
import type { Vec3 } from './coords.ts';
import { fusedMassFigureForType, fusedMassStrikeOrigin } from './fusedMassFigure.ts';
import type { FusedMassShape } from './fusedMassShape.ts';
import type { Body } from './physics.ts';
import type { Rng } from './random.ts';
import { raycast, type SolidAt } from './raycast.ts';
import type { ActorBody } from './schema/actors.ts';
import type { HumanoidHitRegion } from './schema.ts';

export const pickByWeight = <T extends { weight: number }>(choices: readonly T[], roll: number): T => {
  let left = roll * choices.reduce((sum, choice) => sum + choice.weight, 0);
  for (const choice of choices) {
    left -= choice.weight;
    if (left < 0) {
      return choice;
    }
  }
  return choices.at(-1)!;
};

export const horizontalDistance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);
export const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v);
  return n > 0 ? [v[0] / n, v[1] / n, v[2] / n] : [0, 0, 0];
};
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const angleOf = (v: Vec3): number => Math.atan2(v[0], v[2]);
export const headingAt = (angle: number): Vec3 => [Math.sin(angle), 0, Math.cos(angle)];
export const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
export const approach = (current: number, target: number, amount: number): number =>
  current < target ? Math.min(target, current + amount) : Math.max(target, current - amount);
const smooth01 = (value: number): number => value * value * (3 - 2 * value);
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;
const approachAngle = (current: number, target: number, amount: number): number =>
  current + Math.sign(wrapAngle(target - current)) * Math.min(Math.abs(wrapAngle(target - current)), amount);
const turnToward = (current: Vec3, target: Vec3, radians: number): Vec3 =>
  headingAt(approachAngle(angleOf(current), angleOf(target), radians));
/**
 * Turns a zombie by up to `radians` and gives the heading it moves along. A forward walker turns toward `move`
 * and moves only where it faces, so it turns before it heads somewhere new; an omnidirectional one moves along
 * `move` at once and turns to face `goal`.
 */
export const steer = (actor: Actor, move: Vec3, radians: number, goal: Vec3 = move): Vec3 => {
  if (actor.type.locomotion === 'omnidirectional') {
    actor.facing = turnToward(actor.facing, goal, radians);
    return move;
  }
  actor.facing = turnToward(actor.facing, move, radians);
  return actor.facing;
};
export const inRange = (rng: Rng, range: { min: number; max: number }): number => rng.range(range.min, range.max);

/** The player point every zombie attack aims at, in metres above the feet: the chest. */
export const PLAYER_CHEST_METRES = 1;

interface AttackReachProbe {
  actor: Actor;
  actorPos: Vec3;
  playerPos: Vec3;
  blockSize: number;
  isSolid: SolidAt;
}

/** A grab reaches horizontally from the body, within its type's vertical band, chest to chest. */
const grabOrigin = (
  { actor, actorPos, playerPos, blockSize }: AttackReachProbe,
  reachMetres: number,
  chestOffset: number,
): Vec3 | undefined =>
  horizontalDistance(playerPos, actorPos) * blockSize > reachMetres ||
  Math.abs(playerPos[1] - actorPos[1]) * blockSize >= requiredGrabBand(actor.type)
    ? undefined
    : [actorPos[0], actorPos[1] + chestOffset, actorPos[2]];

/** An amalgam's tentacle strikes in a straight line from its core, at any height, as far as its reach. */
const strikeOrigin = (
  { actor, actorPos, blockSize }: AttackReachProbe,
  reachMetres: number,
  playerChest: Vec3,
): Vec3 | undefined => {
  const offset = fusedMassStrikeOrigin(fusedMassFigureForType(actor.type, actor.figureSeed), actor.facing);
  const origin: Vec3 = [
    actorPos[0] + offset[0] / blockSize,
    actorPos[1] + offset[1] / blockSize,
    actorPos[2] + offset[2] / blockSize,
  ];
  return Math.hypot(...sub(playerChest, origin)) * blockSize > reachMetres ? undefined : origin;
};

/** Shared by both attack start (telegraph) and attack resolve (after the windup elapses): the attack's
 * reach rule, then a clear line from its origin to the player's chest. Used identically at both times so
 * "still in reach" at resolve means exactly what "in reach" meant at start. */
const withinAttackReach = (probe: AttackReachProbe): boolean => {
  const { actor, playerPos, blockSize, isSolid } = probe;
  const reachMetres = actorAttackReachMetres(actor);
  if (reachMetres <= 0) {
    return false;
  }
  const chestOffset = PLAYER_CHEST_METRES / blockSize;
  const playerChest: Vec3 = [playerPos[0], playerPos[1] + chestOffset, playerPos[2]];
  const origin =
    actor.type.model === 'fused-mass'
      ? strikeOrigin(probe, reachMetres, playerChest)
      : grabOrigin(probe, reachMetres, chestOffset);
  return origin !== undefined && clearLine(origin, playerChest, isSolid);
};

/** Nothing solid between two points: the line rule every attack's start and resolve share. */
export const clearLine = (from: Vec3, to: Vec3, isSolid: SolidAt): boolean => {
  const toward = sub(to, from);
  const lineDistance = Math.hypot(...toward);
  return lineDistance > 0 && raycast(from, unit(toward), lineDistance, isSolid) === undefined;
};

/**
 * Shoves a body off the terrain its shape's turn of `turn` radians swung into, if a push can, and drops its
 * velocity back toward what it was pushed off; see ActorSystem.settleTurn.
 */
export const pushTurn = (body: Body, shape: FusedMassShape, turn: number): boolean => {
  const { pos, vel } = body;
  const push = shape.pushOut(pos, turn * shape.radius);
  if (!push) {
    return false;
  }
  pos[0] += push[0];
  pos[2] += push[2];
  const away = unit(push);
  const back = Math.min(0, vel[0] * away[0] + vel[2] * away[2]);
  vel[0] -= back * away[0];
  vel[2] -= back * away[2];
  return true;
};

export const stepChaseMotion = (actor: Actor, dt: number, rng: Rng): { sway: number; speedFactor: number } => {
  const { chaseMotion } = actor.type;
  if (!chaseMotion) {
    throw new Error(`Actor ${actor.type.id} has no chaseMotion`);
  }
  if (actor.swayDuration === 0 || actor.swayElapsed >= actor.swayDuration) {
    actor.swayStart = actor.swayValue;
    actor.swayTarget = rng.range(-chaseMotion.swayDegrees, chaseMotion.swayDegrees);
    actor.swayDuration = inRange(rng, chaseMotion.swayIntervalSimSeconds);
    actor.swayElapsed = 0;
  } else {
    actor.swayElapsed = Math.min(actor.swayDuration, actor.swayElapsed + dt);
  }
  actor.swayValue = lerp(actor.swayStart, actor.swayTarget, smooth01(actor.swayElapsed / actor.swayDuration));

  if (actor.lurchDuration === 0 || actor.lurchElapsed >= actor.lurchDuration) {
    actor.lurchStart = actor.lurchValue;
    actor.lurchTarget = inRange(rng, chaseMotion.speedMultiplier);
    actor.lurchDuration = chaseMotion.lurchSimSeconds;
    actor.lurchElapsed = 0;
  } else {
    actor.lurchElapsed = Math.min(actor.lurchDuration, actor.lurchElapsed + dt);
  }
  actor.lurchValue = lerp(actor.lurchStart, actor.lurchTarget, smooth01(actor.lurchElapsed / actor.lurchDuration));

  if (actor.stumbleDuration === 0 && rng.chance(chaseMotion.stumbleChancePerSimSecond * dt)) {
    actor.stumbleDuration = inRange(rng, chaseMotion.stumbleDurationSimSeconds);
    actor.stumbleElapsed = 0;
  }
  if (actor.stumbleDuration > 0) {
    actor.stumbleElapsed = Math.min(actor.stumbleDuration, actor.stumbleElapsed + dt);
    const entering = smooth01(Math.min(1, actor.stumbleElapsed / chaseMotion.stumbleEaseSimSeconds));
    const leaving = smooth01(
      Math.min(1, (actor.stumbleDuration - actor.stumbleElapsed) / chaseMotion.stumbleEaseSimSeconds),
    );
    const depth = Math.min(entering, leaving);
    actor.stumbleFactor = 1 - depth * (1 - chaseMotion.stumbleSpeedFraction);
    if (actor.stumbleElapsed >= actor.stumbleDuration) {
      actor.stumbleDuration = 0;
      actor.stumbleElapsed = 0;
      actor.stumbleFactor = 1;
    }
  }
  return {
    sway: actor.swayValue * (Math.PI / 180),
    speedFactor: actor.lurchValue * actor.stumbleFactor,
  };
};
export type TerrainFloorAt = (x: number, z: number) => number;
export interface HorizontalFootprint {
  halfWidth: number;
  halfDepth: number;
}
export const terrainStance = (
  x: number,
  z: number,
  terrainFloor: TerrainFloorAt,
  footprint: HorizontalFootprint,
): number => {
  let level = Number.NEGATIVE_INFINITY;
  for (let bz = Math.floor(z - footprint.halfDepth); bz < Math.ceil(z + footprint.halfDepth); bz++) {
    for (let bx = Math.floor(x - footprint.halfWidth); bx < Math.ceil(x + footprint.halfWidth); bx++) {
      level = Math.max(level, Math.round(terrainFloor(bx, bz)));
    }
  }
  return level;
};
export const onTerrainFloor = (pos: Vec3, terrainFloor: TerrainFloorAt, footprint: HorizontalFootprint): boolean =>
  Math.round(pos[1]) === terrainStance(pos[0], pos[2], terrainFloor, footprint);
export function haltActor(actor: Actor) {
  actor.horizontalSpeed = 0;
  actor.body.vel[0] = 0;
  actor.body.vel[2] = 0;
}
export function turnActorBodyLook(actor: Actor, type: Actor['type'], dt: number, target: number) {
  actor.facing = turnToward(
    actor.facing,
    headingAt(target),
    (type.motion.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180,
  );
}
export function turnActorHeadLook(actor: Actor, type: Actor['type'], dt: number, target: number) {
  actor.headYaw = approachAngle(actor.headYaw, target, (type.motion.headTurnDegreesPerSimSecond * Math.PI * dt) / 180);
}
export function reachableActorMoves(
  actor: Actor,
  actorPos: Vec3,
  playerPos: Vec3,
  options: { blockSize: number; isSolid: SolidAt; meleeBlocker?: MeleeBlocker },
): NonNullable<Actor['type']['attack']>['moves'] {
  if (!actor.type.attack) {
    return [];
  }
  return actor.type.attack.moves.filter((move) =>
    withinAttackReach({
      actor,
      actorPos,
      playerPos,
      blockSize: options.blockSize,
      isSolid:
        options.meleeBlocker?.({
          kind: 'actor',
          motion: move.motion,
          reachMetres: actorAttackReachMetres(actor),
        }) ?? options.isSolid,
    }),
  );
}
// ---- dismemberment: which part a hit can sever, and the gameplay effect of already-severed parts ----
// The built body's severable parts say what each hit region may lose, so no skeleton's bone names are listed
// here. The random roll picks among arm parts; a destroyed region cuts at its top part; the head has its own
// headOnKillChance roll.
export const cutsFor = (body: ActorBody) => {
  const { severableParts } = body;
  if (severableParts === undefined) {
    throw new Error(`Actor body ${body.type} has no severable parts`);
  }
  // A region the body lists no parts for has nothing to sever.
  const parts = (region: HumanoidHitRegion): readonly string[] => severableParts[region] ?? [];
  return { parts, bones: body.bones };
};
/** True once an arm's cut reaches above its last part: a lost hand alone still lets it grab with the stump. */
const armDisabled = (arm: readonly string[], hidden: ReadonlySet<string>): boolean =>
  arm.length > 0 && hidden.has(arm[Math.max(0, arm.length - 2)]!);
/** Both disabled arms leave nothing to grab or claw with; an already-started windup is not cancelled. */
const canStillAttack = (actor: Actor, body: ActorBody): boolean => {
  if (actor.severed.length === 0) {
    return true;
  }
  const { parts, bones } = cutsFor(body);
  const hidden = severedBoneSet(bones, actor.severed);
  return !(armDisabled(parts('leftArm'), hidden) && armDisabled(parts('rightArm'), hidden));
};

export function setActorChaseStance(actor: Actor, chasing: boolean): void {
  actor.chaseStance = chasing;
}

export function limitActorHorizontalSpeed(actor: Actor, maximum: number): void {
  actor.horizontalSpeed = Math.min(actor.horizontalSpeed, maximum);
}
export function setActorObstacleContact(actor: Actor, contact: boolean): void {
  actor.obstacleContact = contact;
}
export function setActorAttackWait(actor: Actor, wait: number): void {
  actor.attackWait = wait;
}
export function setActorAttackWindup(actor: Actor, windup: number): void {
  actor.attackWindup = windup;
}
export function faceActorDirection(actor: Actor, direction: Vec3): void {
  actor.facing = [direction[0], direction[1], direction[2]];
}
export function canStartBodyAttack(actor: Actor, figures: ActorFigureFiles) {
  if (actor.type.model === 'fused-mass') {
    return activeFusedMassMembers(actor).length > 0;
  }
  return canStillAttack(actor, actorFigure(figures, actor.type, actor.figureSeed).body);
}
