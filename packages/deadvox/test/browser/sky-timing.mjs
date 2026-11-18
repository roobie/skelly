/**
 * @import { SkyBounds } from '@skelly/engine/internal/core/skylight.ts'
 * @import { SkySnapshot } from '@skelly/engine/internal/core/skySnapshot.ts'
 * @import { FromMesher, ToMesher } from '@skelly/engine/internal/game/mesherProtocol.ts'
 * @import { Vec3 } from '@skelly/engine/world'
 */

/**
 * What the patched engine code records with a timing event; the fields the summary reads are named.
 * @typedef {{
 *   bounds?: SkyBounds;
 *   revision?: number;
 *   dependency?: SkyBounds;
 *   job?: number | null;
 *   origin?: Vec3;
 *   size?: number;
 *   present?: boolean;
 *   startAbsoluteRealMs?: number;
 *   [detail: string]: unknown;
 * }} SkyTimingDetail
 */
/** @typedef {SkyTimingDetail & { kind: string; absoluteRealMs: number; frame: number }} SkyTimingEvent */
/**
 * The mesher's timing of one job, which it returns with the job's reply.
 * @typedef {{
 *   id: number;
 *   workerStartAbsoluteRealMs?: number;
 *   workerEndAbsoluteRealMs?: number;
 *   workerComputeRealMs?: number;
 * }} SkyTimingTrace
 */
/**
 * @typedef {Partial<Omit<SkyTimingTrace, 'id'>> & {
 *   id: number;
 *   type: ToMesher['type'];
 *   key: string | null;
 *   bounds: SkyBounds | null;
 *   queued: SkyTimingEvent | null | undefined;
 *   snapshotComplete: boolean | null;
 *   transferInBytes: number | null;
 *   sentAbsoluteRealMs: number;
 *   sentFrame: number;
 *   ahead: number[];
 *   postRealMs: number | null;
 *   resultComplete?: boolean | null;
 *   transferOutBytes?: number | null;
 *   receivedAbsoluteRealMs?: number;
 *   receivedFrame?: number;
 * }} SkyTimingJob
 */
/**
 * The sky job timing log a stage page keeps; see `initializeSkyTiming`.
 * @typedef {{
 *   events: SkyTimingEvent[];
 *   jobs: SkyTimingJob[];
 *   lastSky: number | null;
 *   lastPublished: SkyTimingEvent | null;
 *   renderedFrames: number;
 *   engineReadyAbsoluteRealMs?: number;
 *   record(kind: string, data?: SkyTimingDetail): SkyTimingEvent;
 *   queue(input: SkySnapshot, mesh: string[], firstMeshDelivered: boolean): void;
 *   once(kind: string, key: string, data: SkyTimingDetail): void;
 *   send(worker: Worker, message: ToMesher & { __skyTiming?: SkyTimingTrace }): SkyTimingJob;
 *   receive(message: FromMesher & { __skyTiming?: SkyTimingTrace }): void;
 * }} SkyTiming
 */

export function initializeSkyTiming() {
  const absoluteRealMs = () => performance.timeOrigin + performance.now();
  const frame = () => globalThis.skyTiming.renderedFrames;
  /** @type {SkyTimingEvent[]} */
  const events = [];
  /** @type {SkyTimingJob[]} */
  const jobs = [];
  /** @type {Map<Worker, SkyTimingJob[]>} */
  const queues = new Map();
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {WeakMap<SkySnapshot, SkyTimingEvent>} */
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
      const input = message.type === 'sky' ? message.input : undefined;
      /** @type {SkyTimingJob} */
      const job = {
        id: jobs.length,
        type: message.type,
        key: 'key' in message ? message.key : null,
        bounds: input?.bounds ?? null,
        queued: input ? queued.get(input) : null,
        snapshotComplete: input?.complete ?? null,
        transferInBytes: input?.chunks.reduce((sum, chunk) => sum + (chunk.raw?.byteLength ?? 0), 0) ?? null,
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
      if (!job) {
        throw new Error(`A mesher reply carries timing for unknown job ${trace.id}`);
      }
      const result = message.type === 'sky' ? message.result : undefined;
      Object.assign(job, {
        ...trace,
        resultComplete: result?.complete ?? null,
        transferOutBytes: result ? result.heights.byteLength + (result.volume?.light.byteLength ?? 0) : null,
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
      if (path.endsWith('/src/presentation/engine.ts')) {
        return code.replace(
          '  return {\n    ...worldSetup,',
          '  if(globalThis.skyTiming) globalThis.skyTiming.engineReadyAbsoluteRealMs=performance.timeOrigin+performance.now();\n  return {\n    ...worldSetup,',
        );
      }
      if (path.endsWith('/engine/src/game/streamer.ts')) {
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
            '    if (this.skyReplies.size >= this.maxInFlight) {',
            `
globalThis.skyTiming?.record('admission',{bounds:input.bounds,mesh:[...this.inFlight],meshCapacity:this.maxInFlight,lightingBusy:this.skyReplies.size});
    if (this.skyReplies.size >= this.maxInFlight) {`,
          )
          .replace(
            '    this.pendingSky.push({ id, input });',
            '    this.pendingSky.push({ id, input });\nglobalThis.skyTiming?.queue(input,[...this.inFlight],this.firstMeshDelivered);',
          )
          .replace(
            '    this.receiveMesh(msg);',
            "    const meshApplyStartAbsoluteRealMs=performance.timeOrigin+performance.now();\nthis.receiveMesh(msg);\nglobalThis.skyTiming?.record('mesh-apply',{key:msg.key,startAbsoluteRealMs:meshApplyStartAbsoluteRealMs,realMs:performance.timeOrigin+performance.now()-meshApplyStartAbsoluteRealMs});",
          )
          .replace(
            '      for (const chunk of arrived) {',
            "      for (const chunk of arrived) {\nglobalThis.skyTiming?.record('chunk',{origin:[chunk.cx*CHUNK,chunk.cy*CHUNK,chunk.cz*CHUNK],size:CHUNK,present:true});",
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
      if (path.endsWith('/engine/src/core/skyField.ts')) {
        return code.replace(
          '    entry.request ??= { captured: this.capture(entry), submitted: false };',
          `
if(!entry.request) {
  const timingRevision=this.owner.world.version;
  globalThis.skyTiming?.record('selected',{field:index,revision:timingRevision,bounds:entry.bounds});
  entry.request={captured:this.capture(entry),submitted:false};
  globalThis.skyTiming?.record('captured',{field:index,revision:timingRevision,bounds:entry.bounds});
}`,
        );
      }
      if (path.endsWith('/src/render/skylight.ts')) {
        return code
          .replace(
            '  private request(index: number): boolean {',
            `
  private request(index: number): boolean {
    const timingRevision=this.sky.owner.world.version;
    const timingField=this.fields[index];
    globalThis.skyTiming?.once('candidate',index+':'+timingRevision,{field:index,revision:timingRevision,bounds:timingField.bounds,dependency:timingField.dependency,lightingBusy:this.inFlight,priorLighting:globalThis.skyTiming.lastSky});`,
          )
          .replace(
            '      this.shown[index] = result;',
            `
if(result) {
  const bounds=this.fields[index].bounds;
  const job=globalThis.skyTiming?.jobs.findLast(job=>job.type==='sky' && JSON.stringify(job.bounds)===JSON.stringify(bounds) && job.receivedAbsoluteRealMs !== undefined);
  globalThis.skyTiming?.record('published',{field:index,bounds,job:job?.id ?? null});
}
      this.shown[index] = result;`,
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

/**
 * @param {number | undefined} from
 * @param {number | undefined} to
 */
function difference(from, to) {
  return from === undefined || to === undefined ? null : to - from;
}
// A missing time compares false, as a comparison with undefined does.
/**
 * @param {number | undefined} from
 * @param {number | undefined} to
 */
const before = (from, to) => from !== undefined && to !== undefined && from < to;
/**
 * @param {number | undefined} from
 * @param {number | undefined} to
 */
const notAfter = (from, to) => from !== undefined && to !== undefined && from <= to;
/**
 * Whether `event` is a present chunk whose cube overlaps `dependency`.
 * @param {SkyTimingEvent} event
 * @param {SkyBounds | undefined} dependency
 */
const dependencyChunk = ({ kind, present, origin, size }, dependency) =>
  kind === 'chunk' &&
  present === true &&
  dependency !== undefined &&
  origin !== undefined &&
  size !== undefined &&
  origin.every((value, axis) => before(value, dependency.max[axis]) && before(dependency.min[axis], value + size));
/** @param {Pick<SkyTiming, 'events' | 'jobs'>} timing */
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
      const ahead = job.ahead.flatMap((id) => {
        const prior = jobs[id];
        return prior && before(job.sentAbsoluteRealMs, prior.workerEndAbsoluteRealMs) ? [prior] : [];
      });
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
              before(prior.sentAbsoluteRealMs, selected?.absoluteRealMs) &&
              before(candidate?.absoluteRealMs, prior.receivedAbsoluteRealMs),
          )
          .map((prior) => prior.id),
        admissionAttempts: matching.filter(
          (event) =>
            event.kind === 'admission' &&
            notAfter(captured?.absoluteRealMs, event.absoluteRealMs) &&
            event.absoluteRealMs < job.sentAbsoluteRealMs,
        ),
        firstDependencyChunk: events.find((event) => dependencyChunk(event, candidate?.dependency)),
        lastDependencyChunk: events
          .filter(
            (event) => dependencyChunk(event, candidate?.dependency) && event.absoluteRealMs <= job.sentAbsoluteRealMs,
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
            before(job.workerEndAbsoluteRealMs, event.absoluteRealMs) &&
            before(event.startAbsoluteRealMs, job.receivedAbsoluteRealMs),
        ),
        busyAhead: ahead.map(({ id, type, key, workerStartAbsoluteRealMs, workerEndAbsoluteRealMs }) => ({
          id,
          type,
          key,
          // Null where a worker time is missing, as the evidence's JSON writes the NaN that arithmetic would give.
          overlapRealMs:
            job.workerStartAbsoluteRealMs === undefined ||
            workerStartAbsoluteRealMs === undefined ||
            workerEndAbsoluteRealMs === undefined
              ? null
              : Math.max(
                  0,
                  Math.min(job.workerStartAbsoluteRealMs, workerEndAbsoluteRealMs) -
                    Math.max(job.sentAbsoluteRealMs, workerStartAbsoluteRealMs),
                ),
        })),
      };
    });
}
