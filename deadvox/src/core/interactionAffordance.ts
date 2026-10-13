import type { InteractionTarget } from './interactionPick.ts';

/** Presentation projection shared by the world marker and the interaction prompt. */
export const interactionAffordance = (
  findTarget: () => InteractionTarget | undefined,
  visible: boolean,
  locked: boolean,
  buildMode: boolean,
): { readonly target: InteractionTarget | undefined; readonly furnitureUid: number | undefined } => {
  const enabled = visible && locked && !buildMode;
  const selected = enabled ? findTarget() : undefined;
  return {
    target: selected,
    furnitureUid: selected?.kind === 'furniture' ? selected.entity.uid : undefined,
  };
};
