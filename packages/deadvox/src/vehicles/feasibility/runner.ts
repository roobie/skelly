import envelope from '../../config/vehicleFeasibility.json' with { type: 'json' };
import type { Adapter, Candidate, Fields, Tier, Work } from './contract.ts';
import { movingBody } from './movingBody.ts';
import { firstDivergence, type Trace, trace } from './trace.ts';

export interface DispatchSnapshot {
  pendingQuanta: number;
  body: Uint8Array;
}

export class TickDispatch {
  private pendingQuanta = 0;

  private readonly adapter: Adapter;
  private readonly quantaPerTick: number;
  private readonly maxTicks: number;

  constructor(adapter: Adapter, quantaPerTick: number, maxTicks: number) {
    this.adapter = adapter;
    this.quantaPerTick = quantaPerTick;
    this.maxTicks = maxTicks;
    if (
      !Number.isSafeInteger(quantaPerTick) ||
      quantaPerTick <= 0 ||
      !Number.isSafeInteger(maxTicks) ||
      maxTicks <= 0
    ) {
      throw new Error('Invalid dispatch limits');
    }
  }

  admit(quanta: number): void {
    if (!Number.isSafeInteger(quanta) || quanta < 0 || !Number.isSafeInteger(this.pendingQuanta + quanta)) {
      throw new Error('Invalid elapsed simulated quanta');
    }
    this.pendingQuanta += quanta;
  }

  drain(input: (tick: number) => Fields, committed: (adapter: Adapter, milliseconds: number) => void): number {
    let count = 0;
    while (this.pendingQuanta >= this.quantaPerTick && count < this.maxTicks) {
      const previousTick = this.adapter.observe().tick;
      const tickInput = input(previousTick + 1);
      const start = performance.now();
      this.adapter.advance(tickInput);
      const milliseconds = performance.now() - start;
      if (this.adapter.observe().tick !== previousTick + 1) {
        throw new Error('Dropped or reordered simulated step');
      }
      this.pendingQuanta -= this.quantaPerTick;
      count += 1;
      committed(this.adapter, milliseconds);
    }
    return count;
  }

  snapshot(): DispatchSnapshot {
    return { pendingQuanta: this.pendingQuanta, body: this.adapter.snapshot().slice() };
  }

  restore(snapshot: DispatchSnapshot): void {
    if (!Number.isSafeInteger(snapshot.pendingQuanta) || snapshot.pendingQuanta < 0) {
      throw new Error('Invalid backlog');
    }
    this.adapter.restore(snapshot.body);
    this.pendingQuanta = snapshot.pendingQuanta;
  }
}

export interface Run {
  identity: Fields;
  traces: Trace[];
  work: Work;
  workPerTick: Work[];
  tickRealMilliseconds: number[];
  restoreRealMilliseconds: number[];
  admissionRealMilliseconds: number;
  totalRealMilliseconds: number;
  simSeconds: number;
  simSecondsPerRealSecond: number;
  dispatch: { pendingQuanta: number; bodyBytes: number };
}

function checkWork(work: Work): void {
  if (!Object.values(work).every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error('Invalid work counter');
  }
  const limits = {
    terrainCells: envelope.maxTerrainCellsPerBody,
    colliders: envelope.maxNearbyStaticColliders,
    broadphasePairs: envelope.maxBroadphasePairsPerBody,
    narrowphaseTests: envelope.maxNarrowphaseTestsPerBody,
    ccdIterations: envelope.maxCcdIterationsPerBody,
    contacts: envelope.maxContactsPerBody,
    substeps: envelope.maxSubstepsPerTick,
    allocations: envelope.maxAllocationsPerTick,
    savedBytes: envelope.maxSavedBytesPerBody,
  };
  for (const [key, limit] of Object.entries(limits)) {
    const value = work[key as keyof typeof limits];
    if (!Number.isSafeInteger(value) || value < 0 || value > limit) {
      throw new Error(`Work bound exceeded: ${key}`);
    }
  }
}

function admittedSchedule(schedule: number[]): number[] {
  if (
    schedule.length === 0 ||
    !schedule.some((value) => value > 0) ||
    !schedule.every((value) => Number.isSafeInteger(value) && value >= 0)
  ) {
    throw new Error('Invalid schedule');
  }
  return schedule;
}

function admittedDuration(ticks: number): number {
  if (!Number.isSafeInteger(ticks) || ticks <= 0) {
    throw new Error('Invalid duration');
  }
  return ticks;
}

export function runProbe(
  buildIdentity: string,
  candidate: Candidate = movingBody,
  options: { restore?: boolean; schedule?: number[]; simTickCount?: number } = {},
): Run {
  const durationTicks = admittedDuration(options.simTickCount ?? envelope.probe.simTickCount);
  const start = performance.now();
  let adapter = candidate.create(envelope.probe, envelope.tickHz);
  const admissionMilliseconds = performance.now() - start;
  let dispatch = new TickDispatch(adapter, envelope.quantaPerTick, envelope.maxTicksPerDispatch);
  const traces: Trace[] = [];
  const tickMilliseconds: number[] = [];
  const restoreMilliseconds: number[] = [];
  let { work } = adapter.observe();
  const workPerTick: Work[] = [];
  let restored = false;
  const transitions = new Map<number, Tier>([
    [envelope.probe.coarseAtTick, 'coarse'],
    [envelope.probe.nearAtTick, 'near'],
  ]);
  const input = (tick: number): Fields => {
    const tier = transitions.get(tick);
    if (tier) {
      adapter.transition(tier);
    }
    return { drive: false };
  };
  const committed = (body: Adapter, milliseconds: number) => {
    const observation = body.observe();
    traces.push(trace(observation));
    checkWork(observation.work);
    workPerTick.push({ ...observation.work });
    work = Object.fromEntries(
      Object.keys(work).map((key) => [key, Math.max(work[key as keyof Work], observation.work[key as keyof Work])]),
    ) as unknown as Work;
    tickMilliseconds.push(milliseconds);
  };
  try {
    const schedule = admittedSchedule(options.schedule ?? [envelope.quantaPerTick]);
    let admitted = 0;
    let frame = 0;
    const target = durationTicks * envelope.quantaPerTick + envelope.probe.pendingQuantaAtSave;
    while (admitted < target) {
      // Split at the save boundary so continuation includes a nonzero sub-tick phase.
      const saveBoundary = envelope.probe.saveAtTick * envelope.quantaPerTick + envelope.probe.pendingQuantaAtSave;
      const boundary = admitted < saveBoundary ? Math.min(saveBoundary, target) : target;
      const amount = Math.min(schedule[frame % schedule.length]!, boundary - admitted);
      frame += 1;
      dispatch.admit(amount);
      admitted += amount;
      while (dispatch.drain(input, committed) > 0) {
        /* retain and drain every admitted tick */
      }
      if (options.restore && !restored && admitted === saveBoundary) {
        const snapshot = dispatch.snapshot();
        adapter.dispose();
        const restoreStart = performance.now();
        adapter = candidate.create(envelope.probe, envelope.tickHz);
        dispatch = new TickDispatch(adapter, envelope.quantaPerTick, envelope.maxTicksPerDispatch);
        dispatch.restore(snapshot);
        restoreMilliseconds.push(performance.now() - restoreStart);
        restored = true;
      }
    }
    if (traces.length !== durationTicks || (options.restore && !restored)) {
      throw new Error('Incomplete probe');
    }
    const final = dispatch.snapshot();
    const totalMilliseconds = performance.now() - start;
    const simulatedSeconds = durationTicks / envelope.tickHz;
    return {
      identity: {
        ...candidate.identity,
        build: buildIdentity,
        fixture: JSON.stringify(envelope),
        numericEncoding: 'IEEE754-f64-little-endian',
      },
      traces,
      work,
      workPerTick,
      tickRealMilliseconds: tickMilliseconds,
      restoreRealMilliseconds: restoreMilliseconds,
      admissionRealMilliseconds: admissionMilliseconds,
      totalRealMilliseconds: totalMilliseconds,
      simSeconds: simulatedSeconds,
      simSecondsPerRealSecond: simulatedSeconds / (totalMilliseconds / 1000),
      dispatch: { pendingQuanta: final.pendingQuanta, bodyBytes: final.body.byteLength },
    };
  } finally {
    adapter.dispose();
  }
}

export function runSuite(buildIdentity: string, candidate: Candidate = movingBody) {
  runProbe(buildIdentity, candidate, { simTickCount: envelope.probe.warmupTicks });
  const regular = runProbe(buildIdentity, candidate);
  const irregular = runProbe(buildIdentity, candidate, { schedule: envelope.schedulesQuanta.irregular });
  const restored = runProbe(buildIdentity, candidate, { restore: true, schedule: envelope.schedulesQuanta.restored });
  const compressed = runProbe(buildIdentity, candidate, {
    schedule: [envelope.probe.simTickCount * envelope.quantaPerTick],
  });
  const differences = [irregular, restored, compressed].map(
    (run) =>
      firstDivergence(regular.traces, run.traces) ??
      (regular.dispatch.pendingQuanta === run.dispatch.pendingQuanta
        ? null
        : {
            tick: envelope.probe.simTickCount,
            field: '$pendingQuanta',
            expected: String(regular.dispatch.pendingQuanta),
            actual: String(run.dispatch.pendingQuanta),
          }),
  );
  return { regular, irregular, restored, compressed, differences };
}
