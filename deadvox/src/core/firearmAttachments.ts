import type { ModelDef, Registry } from './content.ts';
import { defOf, type Item } from './items.ts';

/** Sum of attachment mass times its mount distance from the grip, in kg·m. */
export interface FirearmAttachmentResponse {
  readonly recoilScale: number;
  readonly noiseFactor: number;
  readonly swayScale: number;
  readonly recoveryScale: number;
  readonly raiseScale: number;
  readonly swingScale: number;
}

const attachedItems = (item: Item): Item[] => {
  const children = Object.values(item.slots ?? {}).filter((child): child is Item => child !== undefined);
  return children.flatMap((child) => [child, ...attachedItems(child)]);
};

/** Content effects contributed by the fitted attachment tree, scaled by each item's condition. */
export const firearmAttachmentResponse = (registry: Registry, firearm: Item): FirearmAttachmentResponse => {
  let recoilScale = 1;
  let noiseFactor = 1;
  let swayScale = 1;
  let recoveryScale = 1;
  let raiseScale = 1;
  let swingScale = 1;
  for (const attachment of attachedItems(firearm)) {
    const modelId = defOf(registry, attachment.type).model;
    const model = modelId === undefined ? undefined : registry.models.get(modelId);
    const metadata = model?.attachment;
    if (!metadata) {
      continue;
    }
    const effects = defOf(registry, attachment.type).firearmAttachmentEffects;
    const condition = Math.max(0, Math.min(1, attachment.condition));
    if (metadata.kind === 'suppressor') {
      const reduction = effects?.recoilReduction ?? 0;
      recoilScale *= 1 - reduction * condition;
      const fullNoiseFactor = metadata.properties.noiseFactor ?? 1;
      noiseFactor *= 1 - (1 - fullNoiseFactor) * condition;
    }
    if (metadata.kind === 'foregrip') {
      swayScale *= 1 + ((effects?.swayScale ?? 1) - 1) * condition;
      recoveryScale *= 1 + ((effects?.recoveryScale ?? 1) - 1) * condition;
      raiseScale *= 1 + ((effects?.raiseScale ?? 1) - 1) * condition;
      swingScale *= 1 + ((effects?.swingScale ?? 1) - 1) * condition;
    }
  }
  return { recoilScale, noiseFactor, swayScale, recoveryScale, raiseScale, swingScale };
};

/** Wear fitted suppressors once per committed shot; a broken suppressor gives no further benefit. */
export const wearFirearmAttachments = (registry: Registry, firearm: Item): void => {
  for (const attachment of attachedItems(firearm)) {
    const modelId = defOf(registry, attachment.type).model;
    const metadata = modelId === undefined ? undefined : registry.models.get(modelId)?.attachment;
    if (metadata?.kind !== 'suppressor') {
      continue;
    }
    const wear = defOf(registry, attachment.type).firearmAttachmentEffects?.wearPerShot ?? 0;
    attachment.condition = Math.max(0, attachment.condition - wear);
  }
};

export const muzzleLoad = (registry: Registry, firearm: Item): number | undefined => {
  const modelFor = (item: Item): ModelDef | undefined => {
    const modelId = defOf(registry, item.type).model;
    return modelId === undefined ? undefined : registry.models.get(modelId);
  };
  const mountedLoad = (host: ModelDef | undefined, slotId: string, child: Item): number | undefined => {
    const childModel = modelFor(child);
    if (!childModel?.attachment) {
      return 0;
    }
    const { massKg } = childModel.attachment;
    const grip = host?.grip?.at;
    const slot = host?.attachmentSlots?.find(({ id }) => id === slotId);
    if (!(slot && grip)) {
      return undefined;
    }
    const distanceFromGrip = Math.hypot(
      slot.position[0] - grip[0],
      slot.position[1] - grip[1],
      slot.position[2] - grip[2],
    );
    return massKg * distanceFromGrip;
  };
  const visit = (host: Item): number | undefined => {
    const hostModel = modelFor(host);
    let total = 0;
    for (const [slotId, child] of Object.entries(host.slots ?? {})) {
      if (!child) {
        continue;
      }
      const directLoad = mountedLoad(hostModel, slotId, child);
      const nestedLoad = visit(child);
      if (directLoad === undefined || nestedLoad === undefined) {
        return undefined;
      }
      total += directLoad + nestedLoad;
    }
    return total;
  };
  return visit(firearm);
};
