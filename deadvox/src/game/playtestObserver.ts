import type { BlockEntity } from '../core/blockEntities.ts';
import type { CompletedMove, HandlingQueue, MoveJob, TickResult } from '../core/handling.ts';
import type { Inventory, Location } from '../core/inventory.ts';
import {
  measureSnapshots,
  type SessionMetrics,
  type SnapshotHistory,
  type SnapshotMeasurement,
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
  quickbar: session.quickbar.snapshotState(),
  searching: [...session.entities.all].map((entity) => [entity.uid, entity.searched, session.searching(entity)]),
  jobs: session.queue.jobs.map((job) => structuredClone(job)),
  zombies: session.zombies.snapshotState(),
  spawner: session.spawner.snapshotState(),
  rest: session.rest.snapshotState(),
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

  constructor(metrics: SessionMetrics) {
    this.metrics = metrics;
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
      this.commitOutcomes(session.inventory);
    });
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

  private commitOutcomes(inventory: Inventory): void {
    for (const result of this.outcomes) {
      for (const completed of result.completedMoves ?? []) {
        this.completeMove(completed, inventory);
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

  private completeMove(pending: PendingMove, inventory: Inventory): void {
    const { job } = pending;
    const item = inventory.itemByUid(job.itemUid);
    const current = item ? inventory.locate(item) : undefined;
    this.recordSourceLoot(pending, current, item, inventory);
    this.recordPocketUse(job, inventory);
  }

  private recordSourceLoot(
    pending: PendingMove,
    current: Location | undefined,
    item: ReturnType<Inventory['itemByUid']>,
    inventory: Inventory,
  ): void {
    const { source, job } = pending;
    if (source?.kind !== 'furniture') {
      return;
    }
    const targetIsSameFurniture = job.target.kind === 'furniture' && job.target.entityUid === source.entity.uid;
    const sourceChanged =
      !samePlace(source, current) ||
      Boolean(item && pending.sourceCount !== undefined && item.count <= pending.sourceCount - job.count);
    if (!sourceChanged || targetIsSameFurniture) {
      return;
    }
    const window = this.ensureWindow(source.entity, inventory);
    this.metrics.recordContainerLoot(window.name, window.handlingSeconds, window.uiSeconds);
    this.lootWindows.delete(source.entity.uid);
    if (this.uiContainerUid === source.entity.uid) {
      this.uiContainerUid = undefined;
    }
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

  measureSnapshot(
    snapshot: () => unknown,
    session: Session,
    history: SnapshotHistory,
    repeats = 50,
  ): SnapshotMeasurement {
    try {
      const result = measureSnapshots(snapshot, () => inspectLiveSession(session), repeats);
      for (const duration of result.durationsMs) {
        history.add(duration);
      }
      return result;
    } catch {
      return { samples: 0, p50Ms: 0, p95Ms: 0, durationsMs: [], stateUnchanged: false };
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
