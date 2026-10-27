import type { PerspectiveCamera } from 'three';
import type { Inventory } from '../core/inventory.ts';
import type { MeleePoseFrame } from '../core/meleePose.ts';
import { createHeldAnimation, type HeldHandlingFrame } from './actorAnimator.ts';
import type { HeldItems } from './hands.ts';
import type { PlayerMeshes } from './playerFigure.ts';

/** The observer must not own the actor's solve, including when the camera is detached. */
export const createHeldViews = (
  inventory: Inventory,
  view: Pick<HeldItems, 'update'>,
  world: Pick<PlayerMeshes, 'syncHeldView' | 'stockSeats' | 'adsEyes'>,
) => {
  const animation = createHeldAnimation();
  return (observer: PerspectiveCamera, pose: MeleePoseFrame, recoil: number, handling: HeldHandlingFrame): void => {
    const frame = { ...animation.advance(inventory, handling), stockSeats: world.stockSeats, adsEyes: world.adsEyes };
    const source = world.syncHeldView(pose, frame, recoil);
    view.update(observer, pose, recoil, { ...frame, poseSource: source });
  };
};
