export const installWorldMeshControl = () => {
  const NativeWorker = globalThis.Worker;
  const held = [];
  const meshWorkers = [];
  globalThis.holdWorldMeshes = false;
  globalThis.failWorldMesh = () => {
    if (meshWorkers.length === 0) {
      throw new Error('No mesh owner to fail');
    }
    meshWorkers[0].dispatchEvent(new ErrorEvent('error', { message: 'Controlled loading worker failure' }));
  };
  globalThis.releaseWorldMeshes = () => {
    globalThis.holdWorldMeshes = false;
    for (const [worker, data] of held.splice(0)) {
      worker.dispatchEvent(new MessageEvent('message', { data }));
    }
  };
  globalThis.Worker = class extends NativeWorker {
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
