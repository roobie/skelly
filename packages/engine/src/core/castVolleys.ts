import { isCastRay, type ProjectileVolleyRequest } from './castRules.ts';
import type { Vec3 } from './coords.ts';
import { VOLLEY_ARGUMENTS, type VolleyArgument } from './schema/rules.ts';

/**
 * The longest a paid volley may wait for its first launch. A commit lands between two actor steps and its first
 * missile flies only the part of the next step after the commit, so the wait is under one actor step; the ceiling
 * only lets a restore reject a countdown no commit could have left.
 */
export const CAST_LAUNCH_DELAY_LIMIT_SIM_SECONDS = 1;

/**
 * A paid volley still launching. The request keeps the ray captured at release, so a later launch reads neither
 * the source item nor the camera; the countdown runs only while the owner ticks, so a freeze cannot bunch launches.
 */
export interface CastVolleyState {
  request: ProjectileVolleyRequest;
  launched: number;
  nextLaunchInSimSeconds: number;
}

/** A straight shot in flight; position and direction are in blocks, speed and distances in metres. */
export interface CastProjectileState {
  casterId: string;
  abilityId: string;
  damageKind: string;
  damage: number;
  pos: Vec3;
  direction: Vec3;
  speedMetresPerSimSecond: number;
  rangeMetres: number;
  remainingMetres: number;
}

export interface CastProjectileLaunch {
  projectile: CastProjectileState;
  /** How much of the current step the shot has already been in flight. */
  flownSimSeconds: number;
}

export type CastProjectileEnd<T> = { kind: 'hit'; contact: T } | { kind: 'spent' };

const finiteWithin = (value: number, min: number, max: number): boolean =>
  Number.isFinite(value) && value >= min && value <= max;

/** The engine's bounds on a resolved volley, as `resolveCastRule` enforces them on a fresh one. */
const volleyWithinBounds = (request: ProjectileVolleyRequest): boolean =>
  (Object.entries(VOLLEY_ARGUMENTS) as [VolleyArgument, (typeof VOLLEY_ARGUMENTS)[VolleyArgument]][]).every(
    ([field, { min, max }]) => finiteWithin(request[field], min, max),
  ) &&
  Number.isSafeInteger(request.count) &&
  Number.isFinite(request.intervalSimSeconds * (request.count - 1)) &&
  Number.isFinite(request.rangeMetres / request.speedMetresPerSimSecond);

const copyRequest = (request: ProjectileVolleyRequest): ProjectileVolleyRequest => ({
  ...request,
  origin: { ...request.origin },
  aim: { ...request.aim },
});

/** `delaySimSeconds` is how long after the last actor step the volley was paid for. */
export const castVolley = (request: ProjectileVolleyRequest, delaySimSeconds: number): CastVolleyState => {
  if (!finiteWithin(delaySimSeconds, 0, CAST_LAUNCH_DELAY_LIMIT_SIM_SECONDS)) {
    throw new Error('Invalid cast volley delay');
  }
  return { request: copyRequest(request), launched: 0, nextLaunchInSimSeconds: delaySimSeconds };
};

export const castVolleyDone = (volley: Readonly<CastVolleyState>): boolean => volley.launched >= volley.request.count;

export const copyCastVolley = (volley: Readonly<CastVolleyState>): CastVolleyState => ({
  ...volley,
  request: copyRequest(volley.request),
});

export const copyCastProjectile = (projectile: Readonly<CastProjectileState>): CastProjectileState => ({
  ...projectile,
  pos: [...projectile.pos],
  direction: [...projectile.direction],
});

const launch = (request: ProjectileVolleyRequest): CastProjectileState => ({
  casterId: request.casterId,
  abilityId: request.abilityId,
  damageKind: request.damageKind,
  damage: request.damage,
  pos: [request.origin.x, request.origin.y, request.origin.z],
  direction: [request.aim.x, request.aim.y, request.aim.z],
  speedMetresPerSimSecond: request.speedMetresPerSimSecond,
  rangeMetres: request.rangeMetres,
  remainingMetres: request.rangeMetres,
});

/** Runs one step of the countdown and returns the launches that fall inside it, in launch order. */
export const advanceCastVolley = (volley: CastVolleyState, dt: number): CastProjectileLaunch[] => {
  volley.nextLaunchInSimSeconds -= dt;
  const launches: CastProjectileLaunch[] = [];
  while (!castVolleyDone(volley) && volley.nextLaunchInSimSeconds <= 0) {
    launches.push({ projectile: launch(volley.request), flownSimSeconds: -volley.nextLaunchInSimSeconds });
    volley.launched += 1;
    volley.nextLaunchInSimSeconds += volley.request.intervalSimSeconds;
  }
  return launches;
};

/** How far a ray from `pos` travels before it leaves the sphere; 0 when it starts outside. All in blocks. */
export const sphereExitDistance = (pos: Vec3, direction: Vec3, centre: Vec3, radius: number): number => {
  const offset: Vec3 = [pos[0] - centre[0], pos[1] - centre[1], pos[2] - centre[2]];
  const outside = offset[0] ** 2 + offset[1] ** 2 + offset[2] ** 2 - radius ** 2;
  if (outside >= 0) {
    return 0;
  }
  const along = offset[0] * direction[0] + offset[1] * direction[1] + offset[2] * direction[2];
  return -along + Math.sqrt(along * along - outside);
};

/**
 * Casts the step's whole travel as one segment, so a shot faster than a block per step still meets the wall or
 * body it would pass. Travel ends at `boundBlocks`, past which nothing is simulated finely enough to hit, so no
 * content speed or range sets the work of a step. `cast` measures in blocks; returns how the shot ended, or
 * undefined while it still flies.
 */
export const advanceCastProjectile = <T extends { distance: number }>(
  projectile: CastProjectileState,
  { dt, blockSize, boundBlocks }: { dt: number; blockSize: number; boundBlocks: number },
  cast: (origin: Vec3, direction: Vec3, distance: number) => T | undefined,
): CastProjectileEnd<T> | undefined => {
  const metres = Math.min(projectile.speedMetresPerSimSecond * dt, projectile.remainingMetres);
  const segment = metres / blockSize;
  const reach = Math.min(segment, boundBlocks);
  const contact = reach > 0 ? cast(projectile.pos, projectile.direction, reach) : undefined;
  const travelled = contact ? contact.distance : reach;
  projectile.pos = [
    projectile.pos[0] + projectile.direction[0] * travelled,
    projectile.pos[1] + projectile.direction[1] * travelled,
    projectile.pos[2] + projectile.direction[2] * travelled,
  ];
  if (contact) {
    return { kind: 'hit', contact };
  }
  projectile.remainingMetres -= metres;
  return projectile.remainingMetres <= 0 || reach < segment ? { kind: 'spent' } : undefined;
};

const id = (value: unknown): boolean => typeof value === 'string' && value.length > 0;
const point = ([x, y, z]: Vec3) => ({ x, y, z });

/** Shape and bound checks for a restored volley; content references are the save codec's to check. */
export const validCastVolleyState = (volley: Readonly<CastVolleyState>): boolean => {
  const { request, launched, nextLaunchInSimSeconds } = volley;
  return (
    request.verb === 'projectileVolley' &&
    id(request.casterId) &&
    id(request.abilityId) &&
    id(request.damageKind) &&
    Number.isSafeInteger(request.sourceItemUid) &&
    request.sourceItemUid >= 0 &&
    (request.hand === 'left' || request.hand === 'right') &&
    Number.isSafeInteger(request.abilityLevel) &&
    request.abilityLevel >= 0 &&
    isCastRay(request.origin, request.aim) &&
    volleyWithinBounds(request) &&
    Number.isSafeInteger(launched) &&
    launched >= 0 &&
    launched < request.count &&
    finiteWithin(
      nextLaunchInSimSeconds,
      0,
      launched === 0 ? CAST_LAUNCH_DELAY_LIMIT_SIM_SECONDS : request.intervalSimSeconds,
    )
  );
};

/** Shape and bound checks for a restored shot in flight; content references are the save codec's to check. */
export const validCastProjectileState = (projectile: Readonly<CastProjectileState>): boolean =>
  id(projectile.casterId) &&
  id(projectile.abilityId) &&
  id(projectile.damageKind) &&
  finiteWithin(projectile.damage, VOLLEY_ARGUMENTS.damage.min, VOLLEY_ARGUMENTS.damage.max) &&
  isCastRay(point(projectile.pos), point(projectile.direction)) &&
  finiteWithin(
    projectile.speedMetresPerSimSecond,
    VOLLEY_ARGUMENTS.speedMetresPerSimSecond.min,
    VOLLEY_ARGUMENTS.speedMetresPerSimSecond.max,
  ) &&
  finiteWithin(projectile.rangeMetres, VOLLEY_ARGUMENTS.rangeMetres.min, VOLLEY_ARGUMENTS.rangeMetres.max) &&
  Number.isFinite(projectile.rangeMetres / projectile.speedMetresPerSimSecond) &&
  projectile.remainingMetres > 0 &&
  projectile.remainingMetres <= projectile.rangeMetres;

/** Detached copies of saved casts in flight; throws before the caller mutates anything when one is malformed. */
export const restoredCastFlight = (state: {
  readonly castVolleys: readonly Readonly<CastVolleyState>[];
  readonly castProjectiles: readonly Readonly<CastProjectileState>[];
}): { volleys: CastVolleyState[]; projectiles: CastProjectileState[] } => {
  if (!(state.castVolleys.every(validCastVolleyState) && state.castProjectiles.every(validCastProjectileState))) {
    throw new Error('Invalid cast volley state');
  }
  return { volleys: state.castVolleys.map(copyCastVolley), projectiles: state.castProjectiles.map(copyCastProjectile) };
};
