import type { ModelDef, Registry } from '../src/core/content.ts';

export type FixtureAttachment = NonNullable<ModelDef['attachment']>;
export type FixtureFittedAttachment = NonNullable<ModelDef['attachments']>[number];

export const withDefaultAttachment = (
  base: Registry,
  firearmType: string,
  attachmentType: string,
  attachmentOverride?: FixtureAttachment,
) => {
  const registry: Registry = {
    ...base,
    items: new Map(base.items),
    models: new Map(base.models),
  };
  const firearmDef = registry.items.get(firearmType);
  const firearmModelId = firearmDef?.model;
  const firearmModel = firearmModelId === undefined ? undefined : registry.models.get(firearmModelId);
  const attachmentDef = registry.items.get(attachmentType);
  const attachmentModelId = attachmentDef?.model;
  const attachmentModel = attachmentModelId === undefined ? undefined : registry.models.get(attachmentModelId);
  const attachment = attachmentOverride ?? attachmentModel?.attachment;
  if (!(firearmModelId && firearmModel && attachmentModelId && attachmentModel && attachment)) {
    throw new Error('Fixture firearm or attachment model is missing');
  }
  const slot = firearmModel.attachmentSlots?.find(({ mount }) => mount === attachment.mount);
  if (!slot) {
    throw new Error('Fixture firearm has no exported slot for the attachment mount');
  }
  const fitted: FixtureFittedAttachment = { ...attachment, node: 'fixture-attachment-node', mountedAt: slot.id };
  registry.models.set(attachmentModelId, { ...attachmentModel, attachment });
  registry.models.set(firearmModelId, {
    ...firearmModel,
    attachments: [...(firearmModel.attachments ?? []), fitted],
  });
  return { registry, fitted, slot, itemType: attachmentType };
};

export const withDefaultMountedLight = (base: Registry, firearmType: string, lightType: string) => {
  const firearmModel = base.models.get(base.items.get(firearmType)?.model ?? '');
  const slots = firearmModel?.attachmentSlots ?? [];
  const slot = slots.find(({ mount }) => mount === 'rail-bottom') ?? slots.find(({ mount }) => mount !== 'muzzle');
  const sourceLight = base.items.get(lightType);
  const sourceModel = sourceLight?.model === undefined ? undefined : base.models.get(sourceLight.model);
  if (!(slot && sourceLight && sourceModel?.id)) {
    throw new Error('Fixture firearm or light has no exported model/rail slot');
  }
  const fixtureType = 'fixture_mounted_light';
  const fixtureModelId = 'fixture_mounted_light';
  const attachment: FixtureAttachment = {
    id: 'fixture-mounted-light',
    kind: 'flashlight-mount',
    mount: slot.mount,
    properties: { railSpanNotches: { minOffset: 0, maxOffset: 0 } },
  };
  const fixtureRegistry: Registry = {
    ...base,
    items: new Map(base.items).set(fixtureType, {
      ...sourceLight,
      id: fixtureType,
      name: 'Fixture mounted light',
      model: fixtureModelId,
    }),
    models: new Map(base.models).set(fixtureModelId, {
      ...sourceModel,
      id: fixtureModelId,
      attachment,
    }),
  };
  return withDefaultAttachment(fixtureRegistry, firearmType, fixtureType, attachment);
};
