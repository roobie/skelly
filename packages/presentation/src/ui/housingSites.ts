import type { FurnitureDef, Registry } from '@skelly/engine/content';
import { type CraftCommands, conditionBand, housingBlueprint } from '@skelly/engine/inventory';
import type { BlockEntities, BlockEntity, SitePower } from '@skelly/engine/world';
import type { SiteAnchor } from '../render/slotSockets.ts';
import { partServiceRows, type WorkSite } from './craftReadout.ts';
import { housingFaults } from './housingFaults.ts';

type SlotAnchor = NonNullable<FurnitureDef['slotAnchors']>[number];

const siteAnchor = ({ position, orientationDegrees, pickSize, socketShape }: SlotAnchor): SiteAnchor => ({
  position,
  ...(orientationDegrees ? { orientationDegrees } : {}),
  pickSize,
  socketArt: socketShape !== undefined,
});

/**
 * A housing's work sites: its blueprint slots in blueprint order, each where its look anchors it, with the part it
 * holds, the fault it causes and the services offered for it. A fit's service is one spare in reach, so the player
 * picks which part goes in.
 */
export const housingSites = (
  registry: Registry,
  target: BlockEntity,
  {
    crafting,
    entities,
    power,
  }: {
    crafting: Pick<CraftCommands, 'partServiceOptions'>;
    entities: Pick<BlockEntities, 'housingView'>;
    power: SitePower | undefined;
  },
): WorkSite[] => {
  const anchors = registry.furniture.get(target.type)!.slotAnchors ?? [];
  const services = partServiceRows(registry, crafting.partServiceOptions(target.uid));
  const housing = entities.housingView(target);
  const faults = housingFaults(registry, target, power);
  return housingBlueprint(registry, target.type)!.slots.map((slot) => {
    const anchor = anchors.find((entry) => entry.slot === slot.id);
    const fitted = housing.find((view) => view.slot === slot.id)?.part;
    const fault = faults.find((entry) => entry.slot === slot.id);
    return {
      id: slot.id,
      name: slot.name,
      ...(anchor ? { anchor: siteAnchor(anchor) } : {}),
      ...(fitted
        ? {
            part: { name: registry.items.get(fitted.type)!.name, condition: conditionBand(registry, fitted.condition) },
          }
        : {}),
      ...(fault ? { fault } : {}),
      services: services.filter(({ row }) => row.part!.slot === slot.id),
    };
  });
};
