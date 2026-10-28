import type { Vec3 } from './coords.ts';
import type { PlayerStance } from './playerStance.ts';
import type { SolidAt } from './raycast.ts';
import type { PlayerDef } from './schema.ts';

export interface LeanFrame {
  readonly offsetMetres: number;
  readonly rollRadians: number;
}

export const leanFrame = (amount: number, tuning: PlayerDef['lean']): LeanFrame => ({
  offsetMetres: amount * tuning.offsetMetres,
  rollRadians: (-amount * tuning.rollDegrees * Math.PI) / 180,
});

export const advanceLean = ({
  amount,
  wanted,
  stance,
  sprinting,
  dt,
  tuning,
}: {
  amount: number;
  wanted: number;
  stance: PlayerStance;
  sprinting: boolean;
  dt: number;
  tuning: PlayerDef['lean'];
}): number => {
  if (sprinting || stance === 'prone') {
    return 0;
  }
  const target = Math.max(-1, Math.min(1, wanted));
  const step = dt / (target === 0 ? tuning.returnSimSeconds : tuning.enterSimSeconds);
  return amount + Math.max(-step, Math.min(step, target - amount));
};

export interface LeanBox {
  readonly min: Vec3;
  readonly max: Vec3;
  /** Greatest distance from the lean pivot, in blocks; bounds the rotational sweep between endpoints. */
  readonly radius: number;
}

const clearBox = (
  box: LeanBox,
  base: LeanBox,
  padding: number,
  { offset, isSolid }: { offset: Vec3; isSolid: SolidAt },
): boolean => {
  const minX = Math.floor(Math.min(box.min[0], base.min[0]) + offset[0] - padding);
  const minY = Math.floor(Math.min(box.min[1], base.min[1]) + offset[1] - padding);
  const minZ = Math.floor(Math.min(box.min[2], base.min[2]) + offset[2] - padding);
  const maxX = Math.floor(Math.max(box.max[0], base.max[0]) + offset[0] + padding);
  const maxY = Math.floor(Math.max(box.max[1], base.max[1]) + offset[1] + padding);
  const maxZ = Math.floor(Math.max(box.max[2], base.max[2]) + offset[2] + padding);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (isSolid(x, y, z)) {
          return false;
        }
      }
    }
  }
  return true;
};

interface LeanGuardInput {
  amount: number;
  rollRadians: number;
  boxesAt: (amount: number) => readonly LeanBox[];
  isSolid: SolidAt;
  marginBlocks: number;
  offset?: Vec3;
}

/** Include rest-to-lean travel so a clear endpoint cannot skip cover. */
export const guardLean = ({
  amount,
  rollRadians,
  boxesAt,
  isSolid,
  marginBlocks,
  offset = [0, 0, 0],
}: LeanGuardInput): number => {
  if (amount === 0) {
    return 0;
  }
  const rest = boxesAt(0);
  const space = { offset, isSolid };
  const clear = (fraction: number): boolean =>
    (fraction === 0 ? rest : boxesAt(amount * fraction)).every((box, index) => {
      const base = rest[index]!;
      // Chord-to-arc distance is at most r * angle² / 8 for the admitted lean angles.
      const padding = marginBlocks + (Math.max(base.radius, box.radius) * (rollRadians * fraction) ** 2) / 8;
      return clearBox(box, base, padding, space);
    });
  if (!clear(0)) {
    return 0;
  }
  if (clear(1)) {
    return amount;
  }
  let low = 0;
  let high = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (low + high) / 2;
    if (clear(mid)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return amount * low;
};

const sameKey = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/** Pose bounds survive translation; clearance survives only while both the pose and surroundings agree. */
export const createLeanGuard = () => {
  let poseKey: readonly unknown[] = [];
  let spaceKey: readonly unknown[] = [];
  const bounds = new Map<number, readonly LeanBox[]>();
  const limits = new Map<number, number>();
  return (input: LeanGuardInput & { poseKey: readonly unknown[]; spaceKey: readonly unknown[] }): number => {
    if (input.amount === 0) {
      return 0;
    }
    const newPose = !sameKey(poseKey, input.poseKey);
    if (newPose) {
      poseKey = input.poseKey.slice();
      bounds.clear();
    }
    if (newPose || !sameKey(spaceKey, input.spaceKey)) {
      spaceKey = input.spaceKey.slice();
      limits.clear();
    }
    const sign = Math.sign(input.amount);
    let limit = limits.get(sign);
    if (limit === undefined) {
      const boxesAt = (amount: number): readonly LeanBox[] => {
        let boxes = bounds.get(amount);
        if (!boxes) {
          boxes = input.boxesAt(amount);
          // Moving beside cover can visit many bisection fractions without changing the anatomical pose.
          if (bounds.size >= 64) {
            bounds.delete(bounds.keys().next().value!);
          }
          bounds.set(amount, boxes);
        }
        return boxes;
      };
      // A fixed full-range solve keeps warm and cold caches identical at standalone replay starts.
      limit = guardLean({ ...input, amount: sign, rollRadians: input.rollRadians / Math.abs(input.amount), boxesAt });
      limits.set(sign, limit);
    }
    return limit === 0 ? 0 : sign * Math.min(Math.abs(input.amount), Math.abs(limit));
  };
};
