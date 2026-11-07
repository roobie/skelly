import type { FromMesher, MesherPort, MesherSource } from '../game/mesherProtocol.ts';

/** A module worker running the mesher, seen as the streamer's port. */
export const workerMesherPort = (worker: Worker): MesherPort => ({
  post: (msg, transfer) => worker.postMessage(msg, [...transfer]),
  listen: (handlers) => {
    worker.onmessage = (event: MessageEvent<FromMesher>) => handlers.message(event.data);
    worker.onerror = (event) => handlers.failure(event.message || 'World mesh worker failed');
    worker.onmessageerror = () => handlers.failure('World mesh worker reply could not be decoded');
  },
});

/** The browser's world meshers: one module worker each. */
export const browserMesherSource = (): MesherSource => ({
  // Leave a physical core for the main thread: hardwareConcurrency counts hyperthreads.
  count: Math.max(1, Math.min(3, Math.floor((navigator.hardwareConcurrency || 2) / 2) - 1)),
  create: () => workerMesherPort(new Worker(new URL('./mesh.worker.ts', import.meta.url), { type: 'module' })),
});
