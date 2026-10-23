import { SKILL_LEVEL_MIN, skillEffectLevel, skillSaturation } from '../core/character.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { Vec3 } from '../core/coords.ts';
import { attachmentIdFor, firearmSlotIds, LIGHT_MOUNT_SLOT, SLING_SLOT } from '../core/firearmFitting.ts';
import type { HandlingQueue, Job } from '../core/handling.ts';
import { handlingWeights, type Inventory, type Location, type Target } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { slotsReason } from '../core/magazine.ts';
import { opticViewSettings } from '../core/opticView.ts';
import { stowTarget } from '../core/options.ts';
import { firearmsCombatTuning } from '../core/skillTraining.ts';

const ATTACHMENT_ACTION = 'firearm.attachment';

const availableAt = (inventory: Inventory, location: Location | undefined): boolean => {
  if (!location || location.kind === 'slot' || location.kind === 'work') {
    return false;
  }
  if (location.kind === 'pile') {
    return inventory.canReach(location.pile.pos);
  }
  if (location.kind === 'furniture') {
    return inventory.canReachEntity(location.entity);
  }
  return true;
};

const available = (inventory: Inventory, item: Item): boolean => availableAt(inventory, inventory.locate(item));

const rootTarget = (inventory: Inventory, location: Location): Target => inventory.targetForLocation(location);

// Firearms Combat governs attachment work until Gunsmithing exists; this is the one place that names the skill.
export const ATTACHMENT_WORK_SKILL = CORE_CONTENT_IDS.firearmsCombat;

export const isAttachmentWorkAction = (job: Job): boolean => job.kind === 'action' && job.jobType === ATTACHMENT_ACTION;

const attachmentWorkSeconds = (inventory: Inventory): number => {
  const tuning = firearmsCombatTuning(inventory.registry);
  const level = skillEffectLevel(inventory.character.skills?.[ATTACHMENT_WORK_SKILL] ?? SKILL_LEVEL_MIN);
  return (
    handlingWeights(inventory.registry).ground *
    skillSaturation(level, tuning.attachmentFactorFloor, tuning.attachmentFactorHalfLifeLevels)
  );
};

/** Firearm attachment changes are serialized handling actions, with all fit rules rechecked at completion. */
export class FirearmAttachmentHandling {
  private readonly inventory: Inventory;
  private readonly queue: HandlingQueue;
  private readonly feet: () => Vec3;

  constructor(inventory: Inventory, queue: HandlingQueue, feet: () => Vec3) {
    this.inventory = inventory;
    this.queue = queue;
    this.feet = feet;
    queue.registerAction(ATTACHMENT_ACTION, (params) => this.complete(params));
  }

  candidates(firearmUid: number, slotId: string): Item[] {
    const entries = Array.from(this.inventory.items());
    const firearmEntry = entries.find(({ item }) => item.uid === firearmUid);
    if (!firearmEntry) {
      return [];
    }
    if (!availableAt(this.inventory, firearmEntry.location)) {
      return [];
    }
    const firearm = firearmEntry.item;
    if (!defOf(this.inventory.registry, firearm.type).firearm || this.firearmSlotReason(firearm, slotId)) {
      return [];
    }
    return entries
      .filter(({ item, location }) => {
        if (item.uid === firearmUid) {
          return false;
        }
        const definition = defOf(this.inventory.registry, item.type);
        return (
          this.couldFit(slotId, item, definition) &&
          availableAt(this.inventory, location) &&
          this.attachmentFitReason(firearm, slotId, item) === undefined
        );
      })
      .map(({ item }) => item);
  }

  private couldFit(slotId: string, item: Item, definition: ReturnType<typeof defOf>): boolean {
    if (slotId === SLING_SLOT) {
      return definition.sling === true;
    }
    if (slotId === LIGHT_MOUNT_SLOT) {
      return definition.lightMount !== undefined;
    }
    return attachmentIdFor(this.inventory.registry, item) !== undefined;
  }

  fitReason(firearm: Item, slotId: string, attachment: Item): string | undefined {
    if (!(available(this.inventory, firearm) && defOf(this.inventory.registry, firearm.type).firearm)) {
      return 'Firearm is no longer accessible';
    }
    if (!available(this.inventory, attachment)) {
      return 'Attachment is no longer accessible';
    }
    return this.firearmSlotReason(firearm, slotId) ?? this.attachmentFitReason(firearm, slotId, attachment);
  }

  private firearmSlotReason(firearm: Item, slotId: string): string | undefined {
    if (!firearmSlotIds(this.inventory.registry, defOf(this.inventory.registry, firearm.type)).includes(slotId)) {
      return 'Firearm has no such attachment slot';
    }
    if (firearm.slots?.[slotId]) {
      return 'That slot is occupied';
    }
    return undefined;
  }

  private attachmentFitReason(firearm: Item, slotId: string, attachment: Item): string | undefined {
    return (
      this.kindReason(slotId, attachment) ??
      slotsReason(this.inventory.registry, firearm.type, { ...firearm.slots, [slotId]: attachment })
    );
  }

  /** The light mount's kind match is `slotsReason`'s; gungen's certificate covers only the exported slots. */
  private kindReason(slotId: string, attachment: Item): string | undefined {
    if (slotId === SLING_SLOT) {
      return this.slingReason(attachment);
    }
    return slotId === LIGHT_MOUNT_SLOT ? undefined : this.exportedAttachmentReason(attachment);
  }

  private slingReason(attachment: Item): string | undefined {
    return defOf(this.inventory.registry, attachment.type).sling ? undefined : 'Only a sling fits the sling mount';
  }

  private exportedAttachmentReason(attachment: Item): string | undefined {
    const attachmentId = attachmentIdFor(this.inventory.registry, attachment);
    if (!attachmentId) {
      return 'Item is not an exported firearm attachment';
    }
    const attachmentDefinition = defOf(this.inventory.registry, attachment.type);
    const attachmentModel = attachmentDefinition.model
      ? this.inventory.registry.models.get(attachmentDefinition.model)
      : undefined;
    const effects = attachmentDefinition.firearmAttachmentEffects;
    if (
      effects?.kind === 'suppressor' &&
      skillEffectLevel(this.inventory.character.skills?.[ATTACHMENT_WORK_SKILL] ?? SKILL_LEVEL_MIN) <
        effects.fitSkillLevel
    ) {
      return effects.fitRefusal;
    }
    if (
      attachmentModel?.gun?.attachment?.kind === 'optic' &&
      !opticViewSettings(attachmentDefinition, attachmentModel)
    ) {
      return 'This optic has no supported view';
    }
    return undefined;
  }

  removeReason(firearm: Item, slotId: string): string | undefined {
    if (!(available(this.inventory, firearm) && defOf(this.inventory.registry, firearm.type).firearm)) {
      return 'Firearm is no longer accessible';
    }
    if (!firearmSlotIds(this.inventory.registry, defOf(this.inventory.registry, firearm.type)).includes(slotId)) {
      return 'Firearm has no such attachment slot';
    }
    if (!firearm.slots?.[slotId]) {
      return 'That slot is empty';
    }
    // The shoulder holds the gun by its sling, so the sling stays while the gun is slung.
    if (slotId === SLING_SLOT && this.inventory.locate(firearm)?.kind === 'worn') {
      return 'Take it off your shoulder first';
    }
    return undefined;
  }

  fit(firearmUid: number, slotId: string, attachmentUid: number): string | undefined {
    const firearm = this.inventory.itemByUid(firearmUid);
    const attachment = this.inventory.itemByUid(attachmentUid);
    if (!(firearm && attachment)) {
      return 'Firearm or attachment is no longer available';
    }
    const reason = this.fitReason(firearm, slotId, attachment);
    if (reason) {
      return reason;
    }
    this.queue.enqueueAction(
      ATTACHMENT_ACTION,
      `Fit ${this.inventory.name(attachment)}`,
      attachmentWorkSeconds(this.inventory),
      {
        operation: 'fit',
        firearmUid,
        slotId,
        attachmentUid,
      },
    );
    return undefined;
  }

  remove(firearmUid: number, slotId: string): string | undefined {
    const firearm = this.inventory.itemByUid(firearmUid);
    if (!firearm) {
      return 'Firearm is no longer available';
    }
    const reason = this.removeReason(firearm, slotId);
    if (reason) {
      return reason;
    }
    const attachment = firearm.slots![slotId]!;
    this.queue.enqueueAction(
      ATTACHMENT_ACTION,
      `Remove ${this.inventory.name(attachment)}`,
      attachmentWorkSeconds(this.inventory),
      {
        operation: 'remove',
        firearmUid,
        slotId,
      },
    );
    return undefined;
  }

  private complete(params: Record<string, unknown>): string | undefined {
    const firearm = typeof params.firearmUid === 'number' ? this.inventory.itemByUid(params.firearmUid) : undefined;
    const slotId = typeof params.slotId === 'string' ? params.slotId : undefined;
    if (!(firearm && slotId)) {
      return 'Firearm or slot is no longer available';
    }
    if (params.operation === 'fit') {
      const attachmentUid = typeof params.attachmentUid === 'number' ? params.attachmentUid : undefined;
      return attachmentUid === undefined
        ? 'Attachment is no longer available'
        : this.completeFit(firearm, slotId, attachmentUid);
    }
    if (params.operation === 'remove') {
      return this.completeRemove(firearm, slotId);
    }
    return 'Unknown firearm attachment operation';
  }

  private completeFit(firearm: Item, slotId: string, attachmentUid: number): string | undefined {
    const attachment = this.inventory.itemByUid(attachmentUid);
    if (!attachment) {
      return 'Attachment is no longer available';
    }
    const reason = this.fitReason(firearm, slotId, attachment);
    if (reason) {
      return reason;
    }
    const source = this.inventory.locate(attachment);
    if (!source) {
      return 'Attachment is no longer available';
    }
    const returnTo = rootTarget(this.inventory, source);
    if (!this.inventory.consume(attachment, attachment.count)) {
      return 'Attachment is no longer available';
    }
    try {
      this.inventory.fitSlot(firearm, slotId, attachment);
    } catch (error) {
      this.inventory.add(attachment, returnTo);
      return error instanceof Error ? error.message : 'Attachment no longer fits';
    }
    return undefined;
  }

  private completeRemove(firearm: Item, slotId: string): string | undefined {
    const reason = this.removeReason(firearm, slotId);
    if (reason) {
      return reason;
    }
    const location = this.inventory.locate(firearm);
    const feet = location?.kind === 'pile' ? location.pile.pos : this.feet();
    const removed = this.inventory.fitSlot(firearm, slotId, undefined);
    const destination = removed ? stowTarget(this.inventory, removed, feet) : undefined;
    if (removed && destination && this.inventory.add(removed, destination)) {
      return undefined;
    }
    if (removed) {
      this.inventory.fitSlot(firearm, slotId, removed);
    }
    return 'There is nowhere to put the attachment';
  }
}
