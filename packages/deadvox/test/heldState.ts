import type { ActorAnimator } from '../src/render/actorAnimator.ts';
import type { HeldItems } from '../src/render/hands.ts';

/** Read-only inspection across the transitional adapter and its physical animation owner. */
export const heldState = (held: HeldItems): object => {
  const { animator } = held as unknown as { animator: ActorAnimator };
  return { ...held, ...animator, ...animator.presentation };
};
