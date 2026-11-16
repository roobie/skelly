import { buildReach } from '@skelly/engine/reachBuild';
import type { LampReach, LampReachCache, LampReachTuning, PoweredLight, ReachBuildInputs } from '@skelly/engine/world';
import { reachAt } from '@skelly/engine/world';
import type { HeldReachJob } from './heldReach.worker.ts';

/**
 * Demo only, never merged: how the picture gets a held lamp's reach grid.
 * now: the owner builds it in the frame that needs it (as main). C: the same, with a cheaper ray walk.
 * A: a worker builds it, the old grid draws until it is ready. B: the main thread builds it in slices, old grid until
 * ready. D: A plus the four horizontal neighbour cells built ahead. E: the GPU builds it, old grid until ready.
 * Rules stay on the owner's synchronous grid in every policy.
 */
export type HeldReachPolicy = 'now' | 'A' | 'B' | 'C' | 'D' | 'E';
export const HELD_REACH_POLICIES: readonly HeldReachPolicy[] = ['now', 'A', 'B', 'C', 'D', 'E'];

/** The GPU spike's build call (`packages/deadvox/tools/item-light-gpu-spike.mjs`, `createItemLightGpuSpike`). */
export interface GpuReach {
  build(args: {
    light: PoweredLight;
    tuning: LampReachTuning;
    blockSize: number;
    penumbra: boolean;
    isBlocking: ReachBuildInputs['isBlocking'];
  }): {
    result: { mainMs: number; gpuMs?: number | null };
    done: Promise<{ result: { cpuCopyMs: number }; cells: Uint8Array }>;
  };
}

export interface HeldReachReadout {
  policy: HeldReachPolicy;
  /** Compute time of the last picture grid built, wherever it ran. */
  buildMs: number;
  /** What the last build cost the main thread. */
  mainMs: number;
  /** Demand to ready for the last build. */
  latencyMs: number;
  /** Frames since the grid drawn matched its lamp's source cell; 0 while it matches. */
  ageFrames: number;
  /** Builds waiting or running. */
  pending: number;
}

type GridParts = Pick<LampReach, 'origin' | 'size' | 'cellBlocks' | 'cells' | 'revision'>;

let shown: HeldReachScheduler | undefined;

/** The debug overlay's line for the held-lamp build policy; empty when the page did not ask for one. */
export const heldReachReadoutText = (): string => {
  if (!shown) {
    return '';
  }
  const { policy, buildMs, mainMs, latencyMs, ageFrames, pending } = shown.readout;
  return `held light: mode ${policy} · last grid build ${buildMs.toFixed(1)} ms (main thread ${mainMs.toFixed(1)} ms) · demand to ready ${latencyMs.toFixed(0)} ms · grid age ${ageFrames} frames · ${pending} pending`;
};

const SLICE_MS = 2;
const KEPT_GRIDS = 24;

interface Job {
  key: string;
  inputs: ReachBuildInputs;
  demandedAt: number;
  prefetch: boolean;
  lastSeen: number;
}

interface Served {
  reach: LampReach;
  key: string;
  matchedFrame: number;
}

export class HeldReachScheduler {
  readonly readout: HeldReachReadout;
  private readonly completed = new Map<string, LampReach>();
  private readonly served = new Map<object, Served>();
  private readonly queue: Job[] = [];
  private active: Job | undefined;
  private worker: Worker | undefined;
  private frame = 0;
  private ageStamp = -1;
  private gpuReady = false;

  private readonly cache: LampReachCache;
  private readonly policy: HeldReachPolicy;
  private readonly cellBlocks: number;
  private readonly gpu: GpuReach | undefined;

  constructor(cache: LampReachCache, policy: HeldReachPolicy, cellBlocks: number, gpu: GpuReach | undefined) {
    this.cache = cache;
    this.policy = policy;
    this.cellBlocks = cellBlocks;
    this.gpu = gpu;
    this.readout = { policy, buildMs: 0, mainMs: 0, latencyMs: 0, ageFrames: 0, pending: 0 };
    cache.setCheapRay(policy === 'C');
    shown = this;
    if (policy === 'E' && gpu) {
      // The driver finishes compiling the trace shader at its first draw; spend that here, at load, not at a step.
      const probe = cache.buildInputs({ pos: [0, 0, 0], radius: 4 });
      const warm = gpu.build({ ...probe, light: probe.light as PoweredLight, isBlocking: () => false });
      // Until the first trace has finished, the old grid draws: the next GPU command would wait the compile out.
      warm.done
        .then(() => {
          this.gpuReady = true;
          this.pump();
        })
        .catch((error: unknown) => console.error('GPU reach warm-up failed', error));
    }
  }

  /** Once per rendered frame, before the lamps ask. */
  beginFrame(): void {
    this.frame++;
    // Work nobody asked for in the last frame is for a cell the player has left.
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i]!.lastSeen < this.frame - 1) {
        this.queue.splice(i, 1);
      }
    }
    this.readout.pending = this.queue.length + (this.active ? 1 : 0);
  }

  reachOf(light: PoweredLight): LampReach | undefined {
    const id = light.reachSource;
    if (id === undefined || this.policy === 'now' || this.policy === 'C') {
      return this.synchronous(light);
    }
    const key = this.keyOf(light);
    const ready = this.completed.get(key);
    if (ready) {
      this.served.set(id, { reach: ready, key, matchedFrame: this.frame });
      this.noteAge(0);
      if (this.policy === 'D') {
        this.prefetch(light);
      }
      return ready;
    }
    this.request(light, key, false);
    const previous = this.served.get(id);
    if (previous) {
      this.noteAge(this.frame - previous.matchedFrame);
      return previous.reach;
    }
    // Nothing has ever drawn for this lamp: the first grid is the owner's, as at load.
    const first = this.synchronous(light);
    if (first) {
      this.served.set(id, { reach: first, key, matchedFrame: this.frame });
      this.completed.set(key, first);
    }
    return first;
  }

  dispose(): void {
    this.worker?.terminate();
    if (shown === this) {
      shown = undefined;
    }
  }

  private synchronous(light: PoweredLight): LampReach | undefined {
    if (light.reachSource === undefined || this.cache.isCurrent(light)) {
      return this.cache.reachOf(light);
    }
    const start = performance.now();
    const reach = this.cache.reachOf(light);
    const ms = performance.now() - start;
    Object.assign(this.readout, { buildMs: ms, mainMs: ms, latencyMs: 0, ageFrames: 0 });
    return reach;
  }

  private noteAge(age: number): void {
    // One number per frame: the oldest of the lamps drawn.
    this.readout.ageFrames = this.ageStamp === this.frame ? Math.max(this.readout.ageFrames, age) : age;
    this.ageStamp = this.frame;
  }

  private keyOf(light: PoweredLight): string {
    return `${light.pos.map((value) => Math.floor(value / this.cellBlocks)).join(',')}:${light.radius}`;
  }

  private request(light: PoweredLight, key: string, prefetch: boolean): void {
    const queued = this.queue.find((job) => job.key === key);
    if (queued) {
      queued.lastSeen = this.frame;
      queued.prefetch &&= prefetch;
      return;
    }
    if (this.active?.key === key || this.completed.has(key)) {
      return;
    }
    this.queue.push({
      key,
      inputs: this.cache.buildInputs(light),
      demandedAt: performance.now(),
      prefetch,
      lastSeen: this.frame,
    });
    this.pump();
  }

  private prefetch(light: PoweredLight): void {
    for (const axis of [0, 2]) {
      for (const sign of [-1, 1]) {
        const pos = [...light.pos] as PoweredLight['pos'];
        pos[axis] = pos[axis]! + sign * this.cellBlocks;
        this.request({ ...light, pos }, this.keyOf({ ...light, pos }), true);
      }
    }
  }

  private pump(): void {
    if (this.active || this.queue.length === 0 || (this.policy === 'E' && !this.gpuReady)) {
      return;
    }
    // The cell the player stands in outranks a guess about the next one.
    const index = Math.max(
      0,
      this.queue.findIndex((job) => !job.prefetch),
    );
    const [job] = this.queue.splice(index, 1);
    this.active = job!;
    if (this.policy === 'B') {
      this.sliced(job!);
    } else if (this.policy === 'E') {
      this.gpuBuild(job!);
    } else {
      this.offThread(job!);
    }
  }

  private finish(job: Job, parts: GridParts): void {
    const { origin, size, cellBlocks, cells } = parts;
    this.completed.set(job.key, { ...parts, at: reachAt(origin, size, cellBlocks, cells) });
    while (this.completed.size > KEPT_GRIDS) {
      this.completed.delete(this.completed.keys().next().value!);
    }
    if (!job.prefetch) {
      this.readout.latencyMs = performance.now() - job.demandedAt;
    }
    this.active = undefined;
    this.pump();
  }

  /** The occupancy the build reads, copied a slice of a frame at a time so a worker can own it. */
  private snapshot(
    job: Job,
    done: (min: [number, number, number], extent: number, blocking: Uint8Array) => void,
  ): void {
    const { light, tuning, blockSize } = job.inputs;
    const cell = tuning.cellBlocks;
    const half = Math.ceil(light.radius / blockSize / cell);
    const size = 2 * half + 1;
    const min = light.pos.map((value) => Math.floor((Math.floor(value / cell) - half) * cell) - 1) as [
      number,
      number,
      number,
    ];
    const extent = Math.ceil(size * cell) + 3;
    const blocking = new Uint8Array(extent ** 3);
    let row = 0;
    let spent = 0;
    const slice = () => {
      const start = performance.now();
      do {
        const y = Math.floor(row / extent);
        const z = row % extent;
        for (let x = 0; x < extent; x++) {
          blocking[x + extent * (z + extent * y)] = Number(job.inputs.isBlocking(x + min[0], y + min[1], z + min[2]));
        }
        row++;
      } while (row < extent ** 2 && performance.now() - start < SLICE_MS);
      spent += performance.now() - start;
      if (row < extent ** 2) {
        requestAnimationFrame(slice);
        return;
      }
      this.readout.mainMs = spent;
      done(min, extent, blocking);
    };
    requestAnimationFrame(slice);
  }

  private offThread(job: Job): void {
    this.snapshot(job, (min, extent, blocking) => {
      const worker = (this.worker ??= new Worker(new URL('./heldReach.worker.ts', import.meta.url), {
        type: 'module',
      }));
      worker.onmessage = ({ data }: MessageEvent<GridParts & { ms: number }>) => {
        this.readout.buildMs = data.ms;
        this.finish(job, data);
      };
      const { isBlocking: _unused, ...inputs } = job.inputs;
      const message: HeldReachJob = { inputs, min, extent, blocking };
      worker.postMessage(message, [blocking.buffer]);
    });
  }

  private sliced(job: Job): void {
    const steps = this.buildSteps(job);
    let spent = 0;
    const tick = () => {
      const start = performance.now();
      let step = steps.next();
      while (!step.done && performance.now() - start < SLICE_MS) {
        step = steps.next();
      }
      spent += performance.now() - start;
      if (step.done) {
        Object.assign(this.readout, { buildMs: spent, mainMs: spent });
        this.finish(job, step.value);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private buildSteps(job: Job) {
    return buildReach(job.inputs);
  }

  private gpuBuild(job: Job): void {
    const { light, tuning, blockSize, penumbra, isBlocking } = job.inputs;
    try {
      const { result, done } = this.gpu!.build({
        light: light as PoweredLight,
        tuning,
        blockSize,
        penumbra,
        isBlocking,
      });
      done
        .then(({ result: copied, cells }) => {
          const reach = this.cpuShape(job, cells);
          this.readout.buildMs = result.gpuMs ?? 0;
          this.readout.mainMs = result.mainMs + copied.cpuCopyMs;
          this.finish(job, reach);
        })
        .catch((error: unknown) => this.gpuFailed(job, error));
    } catch (error) {
      this.gpuFailed(job, error);
    }
  }

  private gpuFailed(job: Job, error: unknown): void {
    console.error('GPU reach build failed; the owner builds this grid instead', error);
    const steps = this.buildSteps(job);
    let step = steps.next();
    while (!step.done) {
      step = steps.next();
    }
    this.finish(job, step.value);
  }

  private cpuShape(job: Job, cells: Uint8Array): GridParts {
    const { light, tuning, blockSize } = job.inputs;
    const half = Math.ceil(light.radius / blockSize / tuning.cellBlocks);
    return {
      origin: light.pos.map((value) => Math.floor(value / tuning.cellBlocks) - half) as LampReach['origin'],
      size: 2 * half + 1,
      cellBlocks: tuning.cellBlocks,
      cells,
      revision: 1,
    };
  }
}
