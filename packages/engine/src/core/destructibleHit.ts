export interface DestructibleHit {
  force: number;
  /** Fraction of residual force the source can carry past a broken part; melee carries none. */
  continuation: number;
}

export interface DestructibleResistance {
  minimumForce: number;
  breakForce: number;
  forceTaken: number;
}

export type DestructibleOutcome = 'resisted' | 'damaged' | 'broken';

export interface DestructibleHitResult {
  outcome: DestructibleOutcome;
  damage: number;
  remainingForce: number;
}

export const resolveDestructibleHit = (
  damage: number,
  hit: DestructibleHit,
  resistance: DestructibleResistance,
): DestructibleHitResult => {
  if (!(Number.isFinite(hit.force) && hit.force >= 0 && hit.continuation >= 0 && hit.continuation <= 1)) {
    throw new Error('Invalid destructible hit');
  }
  if (hit.force < resistance.minimumForce) {
    return { outcome: 'resisted', damage, remainingForce: 0 };
  }
  const next = damage + hit.force;
  return next < resistance.breakForce
    ? { outcome: 'damaged', damage: next, remainingForce: 0 }
    : {
        outcome: 'broken',
        damage: resistance.breakForce,
        remainingForce: Math.max(0, hit.force - resistance.forceTaken) * hit.continuation,
      };
};
