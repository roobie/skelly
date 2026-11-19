import type { FurnitureDef, Registry, ScreenText } from '@skelly/engine/content';
import type { ReplayActionPayload } from '@skelly/engine/input';
import { conditionBand, housingBlueprint, type PartServiceOption, type SpareWhere } from '@skelly/engine/inventory';
import type { Session } from '@skelly/engine/session';
import { fillText } from '@skelly/engine/text';
import type { BlockEntity } from '@skelly/engine/world';
import { craftingText, craftTime } from './craftReadout.ts';
import { housingFaults } from './housingFaults.ts';
import type { SiteAnchor, SiteService, WorkSite, WorkSiteProducer } from './workSite.ts';

type HousingSession = Pick<Session, 'inventory' | 'power'> & {
  crafting: Pick<Session['crafting'], 'partServiceOptions'>;
};

const spareWhereText = (where: SpareWhere, text: ScreenText['crafting']): string => {
  switch (where.kind) {
    case 'hand':
      return text.spareInHand;
    case 'worn':
      return text.spareWorn;
    case 'ground':
      return text.spareOnGround;
    case 'in':
      return fillText(text.spareIn, { container: where.container });
    default:
      throw new Error('Unknown spare place');
  }
};

/** The rows of the part services the command owner offers, which owns their feasibility and refusals. */
const partServiceRows = (
  registry: Registry,
  entityUid: number,
  options: readonly PartServiceOption[],
): SiteService[] => {
  const text = craftingText(registry);
  return options.map((option) => {
    const itemName = registry.items.get(option.part.type)!.name;
    const { condition } = option.part;
    return {
      row: {
        id: `part:${option.slot}:${option.operation}:${option.part.type}${option.itemUid === undefined ? '' : `:${option.itemUid}`}`,
        name: itemName,
        itemName,
        kind: option.operation === 'fit' ? 'fit_part' : 'remove_part',
        length: craftTime(option.timeGameMinutes, text),
        part: {
          slot: option.slot,
          ...(condition === undefined ? {} : { condition: conditionBand(registry, condition) }),
        },
        ...(option.where ? { where: spareWhereText(option.where, text) } : {}),
        reason: option.refusal,
        components: [],
        qualities: option.qualities.map(({ quality, required, best }) => ({ name: quality, required, best })),
        skills: option.skills.map(({ skill, required, available }) => ({
          name: registry.skills.get(skill)!.name,
          required,
          available,
        })),
        workstation: null,
      },
      start: serviceStart(entityUid, option),
    };
  });
};
const serviceStart = (
  entityUid: number,
  { slot, operation, itemUid }: PartServiceOption,
): ReplayActionPayload | undefined => {
  if (operation === 'remove') {
    return { kind: 'craft.service-part', entityUid, slot, operation };
  }
  return itemUid === undefined ? undefined : { kind: 'craft.service-part', entityUid, slot, operation, itemUid };
};
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
const slotSites = (target: BlockEntity, { inventory, crafting, power }: HousingSession): WorkSite[] => {
  const { registry, entities } = inventory;
  const anchors = registry.furniture.get(target.type)!.slotAnchors ?? [];
  const services = partServiceRows(registry, target.uid, crafting.partServiceOptions(target.uid));
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

/** The housing producer of work sites: a housing whose take apart names its parts is reviewed by its blueprint slots. */
export const housingSites = (session: HousingSession): WorkSiteProducer => ({
  serves: (target) => session.inventory.registry.furniture.get(target.type)?.takeApart?.parts !== undefined,
  sites: (target) => slotSites(target, session),
  drawState: (target) => session.power?.instruments(target),
});
