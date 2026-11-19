import { actionText, fillText } from './actionText.ts';
import type { ItemDef } from './content.ts';
import { coreMessage } from './coreText.ts';
import type { Inventory } from './inventory.ts';
import type { Item } from './items.ts';

/** How a part opens, as its content says (`vehicle.opening`). */
export type VehicleOpening = NonNullable<NonNullable<ItemDef['vehicle']>['opening']>;

/** The part in `fittingId`, whether it stands open, and how it opens if it can; undefined once it has left. */
export const fittedOpening = (
  inventory: Pick<Inventory, 'vehicles' | 'registry'>,
  vehicleId: number,
  fittingId: string,
): { readonly item: Item; readonly open: boolean; readonly opening: VehicleOpening | undefined } | undefined => {
  const fitting = inventory.vehicles.get(vehicleId)?.fittings.find(({ id }) => id === fittingId);
  return (
    fitting && {
      item: fitting.item,
      open: fitting.open === true,
      opening: inventory.registry.items.get(fitting.item.type)?.vehicle?.opening,
    }
  );
};

export type VehicleOpeningPlan =
  | {
      readonly ok: true;
      /** True to open it, false to shut it. */
      readonly opening: boolean;
      readonly label: string;
      readonly durationSimSeconds: number;
      /** What is heard as it opens or shuts, if its content names a sound. */
      readonly sound: string | undefined;
    }
  | { readonly ok: false; readonly reason: string };

/** Whether the player can open or shut this part now, and the handling it takes; the label is the content's verb. */
export const vehicleOpeningPlan = (inventory: Inventory, vehicleId: number, fittingId: string): VehicleOpeningPlan => {
  const fitted = fittedOpening(inventory, vehicleId, fittingId);
  const text = actionText(inventory.registry);
  if (!fitted) {
    return { ok: false, reason: text.common.gone };
  }
  if (!fitted.opening) {
    // Only a part whose content says how it opens is offered, and a site takes one family of part.
    throw new Error(`Vehicle fitting ${vehicleId}/${fittingId} does not open`);
  }
  if (!inventory.canReachVehicle(vehicleId)) {
    return { ok: false, reason: coreMessage(inventory.registry, 'tooFar') };
  }
  const { verbs, handlingSimSeconds, openSound, closeSound } = fitted.opening;
  return {
    ok: true,
    opening: !fitted.open,
    label: fillText(text.vehicleParts.operate, {
      action: fitted.open ? verbs.close : verbs.open,
      part: inventory.name(fitted.item).toLowerCase(),
    }),
    durationSimSeconds: handlingSimSeconds,
    sound: fitted.open ? closeSound : openSound,
  };
};
