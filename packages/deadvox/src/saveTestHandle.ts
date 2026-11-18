import type { SaveController } from '@skelly/presentation/ui';

type CheckpointSchedule = NonNullable<SaveController['checkpoints']>;

/** The controller's private state the save stages observe and stub. */
export type SaveControllerView = Pick<SaveController, keyof SaveController> & {
  ready: SaveController['ready'];
  writing: SaveController['writing'];
  queued: SaveController['queued'];
  snapshot: SaveController['snapshot'];
  failure: SaveController['failure'];
  capture: SaveController['capture'];
  pageIsLeaving: SaveController['pageIsLeaving'];
  savedGeneration: SaveController['savedGeneration'];
  currentRecord: SaveController['currentRecord'];
  worldOptions: SaveController['worldOptions'];
  checkpoints:
    | (Pick<CheckpointSchedule, keyof CheckpointSchedule> & {
        intervalSimSeconds: CheckpointSchedule['intervalSimSeconds'];
      })
    | undefined;
  identityValue: SaveController['identityValue'];
  simTime: SaveController['simTime'];
  statusText: SaveController['statusText'];
  storageUnavailable: SaveController['storageUnavailable'];
  characterId: SaveController['characterId'];
  text: SaveController['text'];
  worldId: SaveController['worldId'];
};

/** The handle a `save-test=1` page exposes as `skellySaveTest`, so browser stages drive and read its saves. */
export const saveTestHandle = (saveController: SaveController) => ({
  storage: saveController.storage,
  get namespace() {
    return saveController.namespace;
  },
  // TypeScript has no test-only access to private members, so the stages' view of them is asserted here once.
  controller: saveController as unknown as SaveControllerView,
  identity: () => saveController.versionIdentity,
  saveState: () => saveController.saveProgress,
  triggerPeriodicCheckpoint: () => saveController.checkpointNow(),
});
