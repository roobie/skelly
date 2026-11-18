export const installWorldMeshControl = () => {
  const NativeWorker = globalThis.Worker;
  /** @type {[Worker, unknown][]} */
  const held = [];
  /** @type {Worker[]} */
  const meshWorkers = [];
  globalThis.holdWorldMeshes = false;
  globalThis.failWorldMesh = () => {
    const [meshWorker] = meshWorkers;
    if (!meshWorker) {
      throw new Error('No mesh owner to fail');
    }
    meshWorker.dispatchEvent(new ErrorEvent('error', { message: 'Controlled loading worker failure' }));
  };
  globalThis.releaseWorldMeshes = () => {
    globalThis.holdWorldMeshes = false;
    for (const [worker, data] of held.splice(0)) {
      worker.dispatchEvent(new MessageEvent('message', { data }));
    }
  };
  globalThis.Worker = class extends NativeWorker {
    /**
     * @param {string | URL} workerUrl
     * @param {WorkerOptions} [options]
     */
    constructor(workerUrl, options) {
      super(workerUrl, options);
      if (String(workerUrl).includes('mesh.worker')) {
        meshWorkers.push(this);
        this.addEventListener('message', (event) => {
          if (globalThis.holdWorldMeshes) {
            event.stopImmediatePropagation();
            held.push([this, event.data]);
          }
        });
      }
    }
  };
};
