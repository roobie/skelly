import type { SaveController } from '@skelly/presentation/ui';

/** The handle a `save-test=1` page exposes as `skellySaveTest`, so browser stages drive and read its saves. */
export const saveTestHandle = (saveController: SaveController) => ({
  storage: saveController.storage,
  get namespace() {
    return saveController.namespace;
  },
  controller: saveController,
  identity: () => (saveController as unknown as { identity: Promise<unknown> | undefined }).identity,
  saveState: () => {
    const { savedGeneration, failure } = saveController as unknown as {
      savedGeneration: number;
      failure: string;
    };
    return { savedGeneration, failure };
  },
  triggerPeriodicCheckpoint: () => {
    (saveController as unknown as { checkpoints: { nextAt: number } }).checkpoints.nextAt = 0;
    saveController.afterFrame();
  },
});

export type SaveTestHandle = ReturnType<typeof saveTestHandle>;
