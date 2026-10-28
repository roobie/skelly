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

const clearBox = (min: number[], max: number[], isSolid: SolidAt): boolean => {
  for (let x = Math.floor(min[0]!); x <= Math.floor(max[0]!); x++) {
    for (let y = Math.floor(min[1]!); y <= Math.floor(max[1]!); y++) {
      for (let z = Math.floor(min[2]!); z <= Math.floor(max[2]!); z++) {
        if (isSolid(x, y, z)) {
          return false;
        }
      }
    }
  }
  return true;
};

/** Include rest-to-lean travel so a clear endpoint cannot skip cover. */
export const guardLean = ({
  amount,
  rollRadians,
  boxesAt,
  isSolid,
  marginBlocks,
}: {
  amount: number;
  rollRadians: number;
  boxesAt: (amount: number) => readonly LeanBox[];
  isSolid: SolidAt;
  marginBlocks: number;
}): number => {
  if (amount === 0) {
    return 0;
  }
  const rest = boxesAt(0);
  const clear = (fraction: number): boolean =>
    boxesAt(amount * fraction).every((box, index) => {
      const base = rest[index]!;
      // Chord-to-arc distance is at most r * angle² / 8 for the admitted lean angles.
      const padding = marginBlocks + (Math.max(base.radius, box.radius) * (rollRadians * fraction) ** 2) / 8;
      const min = box.min.map((v, axis) => Math.min(v, base.min[axis]!) - padding);
      const max = box.max.map((v, axis) => Math.max(v, base.max[axis]!) + padding);
      return clearBox(min, max, isSolid);
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
