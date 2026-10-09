import type { BlockEntity } from '../core/blockEntities.ts';
import { formatClock } from '../core/clock.ts';
import type { CompletedMove, HandlingQueue, MoveJob, TickResult } from '../core/handling.ts';
import type { Inventory, Location } from '../core/inventory.ts';
import type { PlaytestMarks } from '../core/site.ts';
import {
  measureSnapshots,
  type SessionMetrics,
  SNAPSHOT_BATCH_TARGET_MS,
  type SnapshotMeasurement,
  snapshotTimerQuantumForUserAgent,
} from './playtestTools.ts';
import type { Session } from './session.ts';

interface LootWindow {
  readonly name: string;
  handlingSeconds: number;
  uiSeconds: number;
}

type PendingMove = CompletedMove;

interface MetricsFrame {
  realSeconds: number;
  paused: boolean;
  visible: boolean;
  compression: number;
  interruption: string | undefined;
  now: number;
}

const samePlace = (a: Location | undefined, b: Location | undefined): boolean => {
  if (!(a && b) || a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case 'hand':
      return b.kind === 'hand' && a.side === b.side;
    case 'worn':
      return b.kind === 'worn' && a.slot === b.slot;
    case 'pocket':
      return b.kind === 'pocket' && a.owner.uid === b.owner.uid && a.pocket === b.pocket;
    case 'furniture':
      return b.kind === 'furniture' && a.entity.uid === b.entity.uid && a.pocket === b.pocket;
    case 'pile':
      return b.kind === 'pile' && a.pile.pos.every((part, i) => part === b.pile.pos[i]);
    default:
      return false;
  }
};

const inspectLiveSession = (session: Session): unknown => ({
  simulation: {
    state: session.sim.snapshotState(),
    paused: session.sim.paused,
    godMode: session.sim.godMode,
    ignoreUnsafe: session.sim.ignoreUnsafe,
  },
  body: structuredClone(session.body),
  worldDiffs: session.worldDiffs(),
  inventory: session.inventory.snapshotState(),
  quickbar: session.quickbar.snapshotState(session.inventory),
  searching: [...session.entities.all].map((entity) => [entity.uid, entity.searched, session.searching(entity)]),
  jobs: session.queue.jobs.map((job) => structuredClone(job)),
  zombies: session.zombies.snapshotState(),
  spawner: session.spawner.snapshotState(),
  longAction: session.sim.actions.snapshotState(),
  survival: session.survival.snapshotState(),
  playerAudio: structuredClone(session.playerAudio),
  audio: session.audioState(),
});

/** Excluded, observational bookkeeping for playtest metrics; the game supplies live state. */
export class PlaytestObserver {
  private readonly lootWindows = new Map<number, LootWindow>();
  private readonly outcomes: TickResult[] = [];
  private frameActiveUid: number | undefined;
  private uiContainerUid: number | undefined;
  private lastPersistAt = 0;
  private lastInterruption: string | undefined;
  private readonly metrics: SessionMetrics;
  private readonly marks: PlaytestMarks | undefined;
  private readonly keyItems: ReadonlySet<string>;
  private readonly reachedBeats = new Set<string>();
  /** Item types of this frame's queued moves: a stack that merges on arrival loses its UID. */
  private readonly moveTypes = new Map<number, string>();

  constructor(metrics: SessionMetrics, marks?: PlaytestMarks) {
    this.metrics = metrics;
    this.marks = marks;
    this.keyItems = new Set([...(marks?.keyLoot.values() ?? [])].flatMap((items) => [...items]));
  }

  /** A key item counts as read at its first read, wherever it lies. */
  readItem(itemType: string, calendar: number): void {
    this.guard(() => {
      if (this.keyItems.has(itemType)) {
        this.metrics.recordKeyItem(itemType, 'read', formatClock(calendar));
      }
    });
  }

  beginSearch(entity: BlockEntity, name: string): void {
    this.guard(() => {
      this.lootWindows.set(entity.uid, this.lootWindows.get(entity.uid) ?? { name, handlingSeconds: 0, uiSeconds: 0 });
      this.uiContainerUid = entity.uid;
    });
  }

  /** Attribute elapsed handling time to the queue head; queued jobs are not active yet. */
  beforeFrame(queue: HandlingQueue, inventory: Inventory): void {
    this.guard(() => {
      this.frameActiveUid = this.sourceUid(queue.jobs[0], inventory);
      this.moveTypes.clear();
      if (this.keyItems.size > 0) {
        for (const job of queue.jobs) {
          const type = job.kind === 'move' ? inventory.itemByUid(job.itemUid)?.type : undefined;
          if (job.kind === 'move' && type) {
            this.moveTypes.set(job.itemUid, type);
          }
        }
      }
    });
  }

  /** Called at HandlingQueue.tick's actual completion boundary, never on queue disappearance. */
  handlingOutcomes(result: TickResult): void {
    this.guard(() => this.outcomes.push(result));
  }

  afterFrame(
    frame: { realSeconds: number; screenOpen: boolean; visible: boolean },
    _queue: HandlingQueue,
    session: Session,
  ): void {
    this.guard(() => {
      const runningSeconds = !session.sim.paused && frame.visible ? Math.max(0, frame.realSeconds) : 0;
      const handlingActive = runningSeconds > 0 && session.sim.compression.c <= 1;
      this.recordFrameTime(runningSeconds, frame.screenOpen, handlingActive ? this.frameActiveUid : undefined);
      this.commitOutcomes(session.inventory, () => formatClock(session.sim.calendar));
    });
    this.guard(() => this.observeBeats(session));
  }

  private observeBeats(session: Session): void {
    const beats = this.marks?.beats ?? [];
    if (beats.length === 0) {
      return;
    }
    const [x, , z] = session.body.pos;
    for (const { id, area } of beats) {
      if (!this.reachedBeats.has(id) && x >= area.x0 && x < area.x1 && z >= area.z0 && z < area.z1) {
        this.reachedBeats.add(id);
        this.metrics.reachBeat(id, formatClock(session.sim.calendar));
      }
    }
  }

  private sourceUid(job: HandlingQueue['jobs'][number] | undefined, inventory: Inventory): number | undefined {
    if (job?.kind === 'move') {
      const item = inventory.itemByUid(job.itemUid);
      const source = item ? inventory.locate(item) : undefined;
      if (source?.kind === 'furniture') {
        this.ensureWindow(source.entity, inventory);
        return source.entity.uid;
      }
      return undefined;
    }
    if (job?.kind === 'action' && job.jobType === 'furniture.search' && typeof job.params.entityUid === 'number') {
      const entity = inventory.entities.byUid(job.params.entityUid);
      if (entity) {
        this.ensureWindow(entity, inventory);
        return entity.uid;
      }
    }
    return undefined;
  }

  private recordFrameTime(runningSeconds: number, screenOpen: boolean, activeUid: number | undefined): void {
    for (const [uid, window] of this.lootWindows) {
      if (activeUid === uid) {
        window.handlingSeconds += runningSeconds;
      } else if (runningSeconds > 0 && screenOpen && this.uiContainerUid === uid) {
        window.uiSeconds += runningSeconds;
      }
    }
  }

  private commitOutcomes(inventory: Inventory, gameTime: () => string): void {
    for (const result of this.outcomes) {
      for (const completed of result.completedMoves ?? []) {
        this.completeMove(completed, inventory, gameTime);
      }
    }
    this.outcomes.length = 0;
  }

  private ensureWindow(entity: BlockEntity, inventory: Inventory): LootWindow {
    const existing = this.lootWindows.get(entity.uid);
    if (existing) {
      return existing;
    }
    const window = { name: inventory.entities.defOf(entity).name.toLowerCase(), handlingSeconds: 0, uiSeconds: 0 };
    this.lootWindows.set(entity.uid, window);
    return window;
  }

  private completeMove(pending: PendingMove, inventory: Inventory, gameTime: () => string): void {
    const { job } = pending;
    const item = inventory.itemByUid(job.itemUid);
    const current = item ? inventory.locate(item) : undefined;
    const looted = this.recordSourceLoot(pending, current, item, inventory);
    const type = item?.type ?? this.moveTypes.get(job.itemUid);
    if (looted && type && this.marks?.keyLoot.get(looted.pos.join(','))?.has(type)) {
      this.metrics.recordKeyItem(type, 'looted', gameTime());
    }
    this.recordPocketUse(job, inventory);
  }

  /** Records a container loot and returns the looted furniture, if the move took from one. */
  private recordSourceLoot(
    pending: PendingMove,
    current: Location | undefined,
    item: ReturnType<Inventory['itemByUid']>,
    inventory: Inventory,
  ): BlockEntity | undefined {
    const { source, job } = pending;
    if (source?.kind !== 'furniture') {
      return undefined;
    }
    const targetIsSameFurniture = job.target.kind === 'furniture' && job.target.entityUid === source.entity.uid;
    const sourceChanged =
      !samePlace(source, current) ||
      Boolean(item && pending.sourceCount !== undefined && item.count <= pending.sourceCount - job.count);
    if (!sourceChanged || targetIsSameFurniture) {
      return undefined;
    }
    const window = this.ensureWindow(source.entity, inventory);
    this.metrics.recordContainerLoot(window.name, window.handlingSeconds, window.uiSeconds);
    this.lootWindows.delete(source.entity.uid);
    if (this.uiContainerUid === source.entity.uid) {
      this.uiContainerUid = undefined;
    }
    return source.entity;
  }

  private recordPocketUse(job: MoveJob, inventory: Inventory): void {
    if (job.target.kind === 'pocket') {
      const owner = inventory.itemByUid(job.target.ownerUid);
      if (!owner) {
        return;
      }
      const spec = inventory.registry.items.get(owner.type)?.container?.pockets?.[job.target.pocket];
      const pocketName = spec?.name ? ` · ${spec.name}` : '';
      this.metrics.recordPocketUse(
        `player:${owner.uid}:${job.target.pocket}:${inventory.name(owner)}${pocketName} pocket ${job.target.pocket + 1}`,
      );
      return;
    }
    if (job.target.kind !== 'furniture') {
      return;
    }
    const entity = inventory.entities.byUid(job.target.entityUid);
    if (!entity) {
      return;
    }
    const definition = inventory.entities.defOf(entity);
    const name = definition.name.toLowerCase();
    const spec = definition.container?.pockets[job.target.pocket];
    const pocketName = spec?.name ? ` · ${spec.name}` : '';
    this.metrics.recordPocketUse(
      `furniture:${entity.uid}:${job.target.pocket}:${name}${pocketName} pocket ${job.target.pocket + 1}`,
    );
  }

  /** Owns pause, visibility, compression, and interruption accounting policy. */
  frame(frame: MetricsFrame): boolean {
    try {
      const runningSeconds = !frame.paused && frame.visible ? frame.realSeconds : 0;
      const interrupted = frame.interruption !== undefined && frame.interruption !== this.lastInterruption;
      this.lastInterruption = frame.interruption;
      this.metrics.frame(runningSeconds, !frame.paused && frame.compression > 1, interrupted);
      if (interrupted || frame.now - this.lastPersistAt >= 5000) {
        this.lastPersistAt = frame.now;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  measureSnapshot(snapshot: () => unknown, session: Session, repeats = 50): SnapshotMeasurement {
    try {
      const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
      return measureSnapshots(snapshot, () => inspectLiveSession(session), {
        repeats,
        now: () => performance.now(),
        timerQuantum: snapshotTimerQuantumForUserAgent(userAgent),
      });
    } catch {
      return {
        batchCount: 0,
        batchSize: 0,
        observedTimerTickMs: null,
        timerQuantum: null,
        timerQuantumCrossCheckPassed: false,
        targetBatchMs: SNAPSHOT_BATCH_TARGET_MS,
        calibrationBatchMs: 0,
        batchMeanP50Ms: 0,
        batchMeanP95Ms: 0,
        batchMeanDurationsMs: [],
        individualCaptureCount: 0,
        individualCaptureP95Ms: 0,
        individualCaptureMaxMs: 0,
        individualCaptureP95UpperBoundMs: null,
        individualCaptureMaxUpperBoundMs: null,
        netStateUnchanged: false,
      };
    }
  }

  /** Metrics must never make an otherwise valid simulation frame fail. */
  private guard(operation: () => void): void {
    try {
      operation();
    } catch {
      this.lootWindows.clear();
      this.outcomes.length = 0;
      this.frameActiveUid = undefined;
      this.uiContainerUid = undefined;
    }
  }
}
