import type { PerspectiveCamera } from 'three';
import type { Inventory } from '../core/inventory.ts';
import type { MeleePoseFrame } from '../core/meleePose.ts';
import { createHeldAnimation, type HeldHandlingFrame } from './actorAnimator.ts';
import type { HeldItems } from './hands.ts';
import type { PlayerMeshes } from './playerFigure.ts';

/** Transitional instances share action timing, not scene nodes or the observing camera's pose. */
export const createHeldViews = (
  inventory: Inventory,
  view: Pick<HeldItems, 'update'>,
  world: Pick<PlayerMeshes, 'syncHeldView' | 'stockSeats'>,
) => {
  const animation = createHeldAnimation();
  return (observer: PerspectiveCamera, pose: MeleePoseFrame, recoil: number, handling: HeldHandlingFrame): void => {
    const frame = { ...animation.advance(inventory, handling), stockSeats: world.stockSeats };
    view.update(observer, pose, recoil, frame);
    world.syncHeldView(pose, frame, recoil);
  };
};
