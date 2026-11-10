import type { HeldItems } from '../src/presentation/entries/render.ts';
import type { ActorAnimator } from '../src/render/actorAnimator.ts';

/** Read-only inspection across the transitional adapter and its physical animation owner. */
export const heldState = (held: HeldItems): object => {
  const { animator } = held as unknown as { animator: ActorAnimator };
  return { ...held, ...animator, ...animator.presentation };
};
