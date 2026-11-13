import type { HandSide } from './inventory.ts';
import type { Item } from './items.ts';

export interface FirearmAimReadiness {
  readonly uid: number;
}

export interface FirearmAimOffHand {
  side: HandSide;
  firearmSide: HandSide;
  mode: 'support' | 'active';
}

/** Resolves the free off-hand role from the firearm being aimed and its existing item state. */
export const firearmAimOffHand = (
  hands: Readonly<Partial<Record<HandSide, Item>>>,
  readiness: FirearmAimReadiness | undefined,
  supportMounted = false,
): FirearmAimOffHand | undefined => {
  if (!(readiness && !supportMounted)) {
    return;
  }
  const firearmSide = (['right', 'left'] as const).find((hand) => hands[hand]?.uid === readiness.uid);
  if (!firearmSide) {
    return;
  }
  const side = firearmSide === 'right' ? 'left' : 'right';
  const item = hands[side];
  if (!item) {
    return { side, firearmSide, mode: 'support' };
  }
  return item.on === true ? { side, firearmSide, mode: 'active' } : undefined;
};
