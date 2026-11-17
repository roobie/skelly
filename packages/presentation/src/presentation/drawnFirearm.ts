import { firearmHandlingFor } from '@skelly/engine/inventory';
import { sightedFirearmModel } from '@skelly/engine/pose';
import type { Session } from '@skelly/engine/session';

/** The firearm the simulation raises, with the model it is drawn as and the hand holding it. */
export const drawnFirearm = ({
  raisableFirearm,
  inventory,
  firearms,
}: Pick<Session, 'raisableFirearm' | 'inventory' | 'firearms'>) => {
  const item = raisableFirearm();
  if (!item) {
    return;
  }
  const { registry } = inventory;
  return {
    item,
    model: sightedFirearmModel(registry, item) ?? firearmHandlingFor(item, registry).model,
    side: inventory.hands.right?.uid === item.uid ? ('right' as const) : ('left' as const),
    frame: firearms.frames().find((entry) => entry.uid === item.uid),
  };
};
