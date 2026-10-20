export function initializeSkyTiming() {
  const absoluteRealMs = () => performance.timeOrigin + performance.now();
  const frame = () => globalThis.skyTiming.renderedFrames;
  const events = [];
  const jobs = [];
  const queues = new Map();
  const seen = new Set();
  const queued = new WeakMap();
  globalThis.skyTiming = {
    events,
    jobs,
    lastSky: null,
    lastPublished: null,
    renderedFrames: 0,
    record(kind, data) {
      const event = { kind, absoluteRealMs: absoluteRealMs(), frame: frame(), ...data };
      events.push(event);
      if (kind === 'published') {
        this.lastPublished = event;
      }
      return event;
    },
    queue(input, mesh, firstMeshDelivered) {
      queued.set(input, this.record('queued', { bounds: input.bounds, mesh, firstMeshDelivered }));
    },
    once(kind, key, data) {
      if (seen.has(`${kind}:${key}`)) {
        return;
      }
      seen.add(`${kind}:${key}`);
      this.record(kind, data);
    },
    send(worker, message) {
      const queue = queues.get(worker) ?? [];
      const job = {
        id: jobs.length,
        type: message.type,
        key: message.key ?? null,
        bounds: message.input?.bounds ?? null,
        queued: message.input ? queued.get(message.input) : null,
        snapshotComplete: message.input?.complete ?? null,
        transferInBytes: message.input?.chunks.reduce((sum, chunk) => sum + (chunk.raw?.byteLength ?? 0), 0) ?? null,
        sentAbsoluteRealMs: absoluteRealMs(),
        sentFrame: frame(),
        ahead: queue.map((prior) => prior.id),
        postRealMs: null,
      };
      jobs.push(job);
      queue.push(job);
      queues.set(worker, queue);
      message.__skyTiming = { id: job.id };
      if (message.type === 'sky') {
        this.lastSky = job.id;
      }
      return job;
    },
    receive(message) {
      const trace = message.__skyTiming;
      if (!trace) {
        return;
      }
      const job = jobs[trace.id];
      Object.assign(job, {
        ...trace,
        resultComplete: message.result?.complete ?? null,
        transferOutBytes: message.result
          ? message.result.heights.byteLength + (message.result.volume?.light.byteLength ?? 0)
          : null,
        receivedAbsoluteRealMs: absoluteRealMs(),
        receivedFrame: frame(),
      });
      for (const queue of queues.values()) {
        const index = queue.indexOf(job);
        if (index >= 0) {
          queue.splice(index, 1);
        }
      }
    },
  };
}

export function skyTimingPlugin() {
  return {
    name: 'sky-job-timing',
    enforce: 'pre',
    transform(code, id) {
      const [path] = id.split('?');
      if (path.endsWith('/src/game/engine.ts')) {
        return code.replace(
          '  return {\n    ...worldSetup,',
          '  if(globalThis.skyTiming) globalThis.skyTiming.engineReadyAbsoluteRealMs=performance.timeOrigin+performance.now();\n  return {\n    ...worldSetup,',
        );
      }
      if (path.endsWith('/src/game/streamer.ts')) {
        return code
          .replace(
            '    worker.postMessage(msg, transfer);',
            `
const timingJob = msg.type==='init' ? undefined : globalThis.skyTiming?.send(worker,msg);
const postStartRealMs = performance.now();
worker.postMessage(msg,transfer);
if(timingJob) {
  timingJob.postRealMs=performance.now()-postStartRealMs;
  const evidence=globalThis.skyRouteEvidence;
  if(msg.type==='sky' && evidence && !evidence.inSkyUpdate) evidence.serviceRealMs+=timingJob.postRealMs;
}
`,
          )
          .replace(
            '  private receive(worker: Worker, msg: FromMesher): void {',
            '  private receive(worker: Worker, msg: FromMesher): void {\nglobalThis.skyTiming?.receive(msg);',
          )
          .replace(
            '    if (this.skyReply) {',
            `
globalThis.skyTiming?.record('admission',{bounds:input.bounds,mesh:[...this.inFlight],meshCapacity:this.maxInFlight,lightingBusy:Boolean(this.skyReply)});
    if (this.skyReply) {`,
          )
          .replace(
            '    this.pendingSky = input;',
            '    this.pendingSky = input;\nglobalThis.skyTiming?.queue(input,[...this.inFlight],this.firstMeshDelivered);',
          )
          .replace(
            '    this.receiveMesh(msg);',
            "    const meshApplyStartAbsoluteRealMs=performance.timeOrigin+performance.now();\nthis.receiveMesh(msg);\nglobalThis.skyTiming?.record('mesh-apply',{key:msg.key,startAbsoluteRealMs:meshApplyStartAbsoluteRealMs,realMs:performance.timeOrigin+performance.now()-meshApplyStartAbsoluteRealMs});",
          )
          .replace(
            '    this.firstMeshDelivered ||= msg.mesh.indices.length > 0;',
            "    if(!this.firstMeshDelivered && msg.mesh.indices.length>0) globalThis.skyTiming?.record('first-mesh',{key:msg.key});\n    this.firstMeshDelivered ||= msg.mesh.indices.length > 0;",
          );
      }
      if (path.endsWith('/src/worker/mesh.worker.ts')) {
        return code
          .replace(
            "  if (msg.type === 'init') {",
            `
const workerStartAbsoluteRealMs=performance.timeOrigin+performance.now();
  if (msg.type === 'init') {`,
          )
          .replaceAll(
            'postMessage(reply,',
            `
if(msg.__skyTiming) reply.__skyTiming={...msg.__skyTiming,workerStartAbsoluteRealMs,
  workerEndAbsoluteRealMs:performance.timeOrigin+performance.now(),workerComputeRealMs:reply.workerRealMs ?? reply.ms};
postMessage(reply,`,
          );
      }
      if (path.endsWith('/src/render/skylight.ts')) {
        return code
          .replace(
            '  private prepare(nearby: Field[], position: Vec3, deadline: number): void {',
            `
  private prepare(nearby: Field[], position: Vec3, deadline: number): void {
const rangeForTiming=PREFETCH_M/this.blockSize;
for(const candidate of nearby) {
  if(!candidate.attempted && position.every((v,a)=>v>=candidate.bounds.min[a]-rangeForTiming&&v<candidate.bounds.max[a]+rangeForTiming))
    globalThis.skyTiming?.once('candidate',candidate.index+':'+candidate.revision,{field:candidate.index,revision:candidate.revision,bounds:candidate.bounds,dependency:candidate.dependency,lightingBusy:this.inFlight,priorLighting:globalThis.skyTiming.lastSky});
}`,
          )
          .replace(
            '      this.preparation = {',
            `
globalThis.skyTiming?.record('selected',{field:field.index,revision:field.revision,bounds:field.bounds});
      this.preparation = {`,
          )
          .replace(
            '        preparation.captured = next.value;',
            `
preparation.captured=next.value;
globalThis.skyTiming?.record('captured',{field:preparation.field.index,revision:preparation.revision,bounds:preparation.field.bounds});`,
          )
          .replace(
            '    preparation.field.result = result;',
            `
globalThis.skyTiming?.record('published',{field:preparation.field.index,revision:preparation.revision,bounds:preparation.field.bounds,job:globalThis.skyTiming.lastSky});
    preparation.field.result = result;`,
          )
          .replace(
            '  chunkChanged(origin: Vec3): void {',
            "  chunkChanged(origin: Vec3): void {\nglobalThis.skyTiming?.record('chunk',{origin,size:CHUNK,present:Boolean(this.context.world.getChunk(...origin.map(v=>v/CHUNK)))});",
          )
          .replace(
            '  private upload(): void {',
            '  private upload(): void {\nconst skyPackStartRealMs=performance.now();',
          )
          .replace(
            '    this.texture.value = volumeTexture(light, size);',
            "    this.texture.value = volumeTexture(light, size);\nglobalThis.skyTiming?.record('atlas-packed',{realMs:performance.now()-skyPackStartRealMs,job:globalThis.skyTiming.lastPublished?.job});",
          )
          .replace(
            '  update(scene: Scene, position: Vec3): void {',
            '  update(scene: Scene, position: Vec3): void {\nif(globalThis.skyTiming) globalThis.skyTiming.renderedFrames++;',
          );
      }
    },
  };
}

function difference(from, to) {
  return from === undefined || to === undefined ? null : to - from;
}
export function summarizeSkyTiming({ events, jobs }) {
  return jobs
    .filter((job) => job.type === 'sky')
    .map((job) => {
      const boundKey = JSON.stringify(job.bounds);
      const matching = events.filter(
        (event) =>
          JSON.stringify(event.bounds) === boundKey &&
          event.absoluteRealMs <= (job.queued?.absoluteRealMs ?? job.sentAbsoluteRealMs),
      );
      const selected = matching.filter((event) => event.kind === 'selected').at(-1);
      const candidate = matching
        .filter((event) => event.kind === 'candidate' && event.revision === selected?.revision)
        .at(-1);
      const captured = matching.filter((event) => event.kind === 'captured').at(-1);
      const published = events.find((event) => event.kind === 'published' && event.job === job.id);
      const ahead = job.ahead
        .map((id) => jobs[id])
        .filter((prior) => prior.workerEndAbsoluteRealMs > job.sentAbsoluteRealMs);
      return {
        ...job,
        candidate,
        selected,
        captured,
        published,
        selectionWaitRealMs: difference(candidate?.absoluteRealMs, selected?.absoluteRealMs),
        selectionWaitFrames: difference(candidate?.frame, selected?.frame),
        preparationFrames: difference(selected?.frame, captured?.frame),
        atlasPacking: events.filter((event) => event.kind === 'atlas-packed' && event.job === job.id),
        priorLighting: jobs
          .filter(
            (prior) =>
              prior.type === 'sky' &&
              prior.id !== job.id &&
              prior.sentAbsoluteRealMs < selected?.absoluteRealMs &&
              prior.receivedAbsoluteRealMs > candidate?.absoluteRealMs,
          )
          .map((prior) => prior.id),
        admissionAttempts: matching.filter(
          (event) =>
            event.kind === 'admission' &&
            event.absoluteRealMs >= captured?.absoluteRealMs &&
            event.absoluteRealMs < job.sentAbsoluteRealMs,
        ),
        firstDependencyChunk: events.find(
          (event) =>
            event.kind === 'chunk' &&
            event.present &&
            candidate?.dependency &&
            event.origin.every(
              (value, axis) =>
                value < candidate.dependency.max[axis] && value + event.size > candidate.dependency.min[axis],
            ),
        ),
        lastDependencyChunk: events
          .filter(
            (event) =>
              event.kind === 'chunk' &&
              event.present &&
              candidate?.dependency &&
              event.absoluteRealMs <= job.sentAbsoluteRealMs &&
              event.origin.every(
                (value, axis) =>
                  value < candidate.dependency.max[axis] && value + event.size > candidate.dependency.min[axis],
              ),
          )
          .at(-1),
        preparationElapsedRealMs: difference(selected?.absoluteRealMs, captured?.absoluteRealMs),
        admissionWaitRealMs: difference(captured?.absoluteRealMs, job.sentAbsoluteRealMs),
        dispatchToWorkerRealMs: difference(job.sentAbsoluteRealMs, job.workerStartAbsoluteRealMs),
        workerToMainRealMs: difference(job.workerEndAbsoluteRealMs, job.receivedAbsoluteRealMs),
        publicationWaitRealMs: difference(job.receivedAbsoluteRealMs, published?.absoluteRealMs),
        queueWaitRealMs: difference(job.queued?.absoluteRealMs, job.sentAbsoluteRealMs),
        firstMesh: events.find((event) => event.kind === 'first-mesh'),
        returnMeshApplications: events.filter(
          (event) =>
            event.kind === 'mesh-apply' &&
            event.absoluteRealMs > job.workerEndAbsoluteRealMs &&
            event.startAbsoluteRealMs < job.receivedAbsoluteRealMs,
        ),
        busyAhead: ahead.map((prior) => ({
          id: prior.id,
          type: prior.type,
          key: prior.key,
          overlapRealMs: Math.max(
            0,
            Math.min(job.workerStartAbsoluteRealMs, prior.workerEndAbsoluteRealMs) -
              Math.max(job.sentAbsoluteRealMs, prior.workerStartAbsoluteRealMs),
          ),
        })),
      };
    });
}
