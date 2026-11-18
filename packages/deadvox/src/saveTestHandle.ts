import type { SaveController } from '@skelly/presentation/ui';

/** The handle a `save-test=1` page exposes as `skellySaveTest`, so browser stages drive and read its saves. */
export const saveTestHandle = (saveController: SaveController) => ({
  storage: saveController.storage,
  get namespace() {
    return saveController.namespace;
  },
  controller: saveController,
  identity: () => saveController.versionIdentity,
  saveState: () => saveController.saveProgress,
  triggerPeriodicCheckpoint: () => saveController.checkpointNow(),
});
