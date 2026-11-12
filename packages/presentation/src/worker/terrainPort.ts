import type { FromTerrain, TerrainPort, TerrainWorkerSource } from '@skelly/engine/world';

/** A module worker running the shared terrain evaluator, seen as the streamer's port. */
export const workerTerrainPort = (worker: Worker): TerrainPort => ({
  post: (msg) => worker.postMessage(msg),
  listen: (handlers) => {
    worker.onmessage = (event: MessageEvent<FromTerrain>) => handlers.message(event.data);
    worker.onerror = (event) => handlers.failure(event.message || 'Terrain worker failed');
    worker.onmessageerror = () => handlers.failure('Terrain worker reply could not be decoded');
  },
  terminate: () => worker.terminate(),
});

/** One module worker per call; graphics tuning decides how many the streamer makes. */
export const browserTerrainWorkerSource: TerrainWorkerSource = () =>
  workerTerrainPort(new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' }));
