import type { BlockEntity } from '../core/blockEntities.ts';
import type { HandlingQueue, MoveJob } from '../core/handling.ts';
import type { Inventory, Location } from '../core/inventory.ts';
import { defOf } from '../core/items.ts';
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

interface PendingMove {
  readonly job: MoveJob;
  readonly source?: Location;
  readonly sourceCount?: number;
}

const moveReachedTarget = (job: MoveJob, location: Location | undefined): boolean => {
  if (!location) {
    return false;
  }
  switch (job.target.kind) {
    case 'pocket':
      return (
        location.kind === 'pocket' &&
        location.owner.uid === job.target.ownerUid &&
        location.pocket === job.target.pocket
      );
    case 'furniture':
      return (
        location.kind === 'furniture' &&
        location.entity.uid === job.target.entityUid &&
        location.pocket === job.target.pocket
      );
    case 'pile':
      return (
        location.kind === 'pile' &&
        location.pile.pos[0] === job.target.pos[0] &&
        location.pile.pos[1] === job.target.pos[1] &&
        location.pile.pos[2] === job.target.pos[2]
      );
    case 'hand':
      return location.kind === 'hand' && location.side === job.target.side;
    case 'worn':
      return location.kind === 'worn';
    default:
      return false;
  }
};

const inspectLiveSession = (session: Session): unknown => {
  const inspectItem = (item: import('../core/items.ts').Item): unknown => ({
    uid: item.uid,
    type: item.type,
    count: item.count,
    condition: item.condition,
    charges: item.charges,
    on: item.on,
    pockets: item.pockets?.map((grid) =>
      grid.map((placed) => ({ x: placed.x, y: placed.y, rotated: placed.rotated, item: inspectItem(placed.item) })),
    ),
  });
  const scheduler = (
    session.sim.scheduler as unknown as { entries: { spec: { id: string }; done: number; ticks: number }[] }
  ).entries;
  return {
    sim: {
      calendar: session.sim.calendar,
      time: session.sim.time,
      needs: { ...session.sim.needs },
      dead: session.sim.dead,
      compression: {
        c: session.sim.compression.c,
        active: session.sim.compression.active,
        interruption: session.sim.compression.interruption,
      },
      scheduler: scheduler.map((entry) => [entry.spec.id, entry.done, entry.ticks]),
    },
    body: structuredClone(session.body),
    inventory: {
      version: session.inventory.version,
      nextUid: session.inventory.factory.next,
      hands: Object.fromEntries(
        Object.entries(session.inventory.hands).map(([key, item]) => [key, item && inspectItem(item)]),
      ),
      worn: Object.fromEntries(
        Object.entries(session.inventory.worn).map(([key, item]) => [key, item && inspectItem(item)]),
      ),
      piles: [...session.inventory.piles.entries()].map(([key, pile]) => [
        key,
        pile.items.map((placed) => inspectItem(placed.item)),
      ]),
      looted: [...session.inventory.looted.entries()],
    },
    furniture: [...session.entities.all].map((entity) => ({
      uid: entity.uid,
      searched: session.searching(entity),
      pockets: entity.pockets?.map((grid) => grid.map((placed) => inspectItem(placed.item))),
    })),
    jobs: session.queue.jobs.map((job) => structuredClone(job)),
  };
};

/** Excluded, observational bookkeeping for playtest metrics; the game supplies live state. */
export class PlaytestObserver {
  private readonly lootWindows = new Map<number, LootWindow>();
  private readonly pendingMoves = new Map<MoveJob, PendingMove>();
  private uiContainerUid: number | undefined;
  private lastPersistAt = 0;
  private readonly metrics: SessionMetrics;

  constructor(metrics: SessionMetrics) {
    this.metrics = metrics;
  }

  beginSearch(entity: BlockEntity, name: string): void {
    this.lootWindows.set(entity.uid, this.lootWindows.get(entity.uid) ?? { name, handlingSeconds: 0, uiSeconds: 0 });
    this.uiContainerUid = entity.uid;
  }

  /** Capture queued moves before the simulation advances them; counts are committed only on success. */
  beforeFrame(queue: HandlingQueue, inventory: Inventory): void {
    for (const job of queue.jobs) {
      if (job.kind !== 'move' || this.pendingMoves.has(job)) {
        continue;
      }
      const item = inventory.itemByUid(job.itemUid);
      const source = item ? inventory.locate(item) : undefined;
      if (source?.kind === 'furniture') {
        const { entity } = source;
        this.lootWindows.set(
          entity.uid,
          this.lootWindows.get(entity.uid) ?? {
            name: inventory.entities.defOf(entity).name.toLowerCase(),
            handlingSeconds: 0,
            uiSeconds: 0,
          },
        );
      }
      this.pendingMoves.set(job, { job, ...(source ? { source } : {}), ...(item ? { sourceCount: item.count } : {}) });
    }
  }

  afterFrame(realSeconds: number, screenOpen: boolean, queue: HandlingQueue, inventory: Inventory): void {
    const activeSources = new Set(
      [...this.pendingMoves.values()].flatMap((pending) =>
        pending.source?.kind === 'furniture' ? [pending.source.entity.uid] : [],
      ),
    );
    for (const [uid, window] of this.lootWindows) {
      if (activeSources.has(uid)) {
        window.handlingSeconds += realSeconds;
      } else if (screenOpen && this.uiContainerUid === uid) {
        window.uiSeconds += realSeconds;
      }
    }

    for (const pending of this.pendingMoves.values()) {
      if (!queue.jobs.includes(pending.job)) {
        this.completeMove(pending, inventory);
      }
    }
  }

  private completeMove(pending: PendingMove, inventory: Inventory): void {
    const { job } = pending;
    const item = inventory.itemByUid(job.itemUid);
    const current = item ? inventory.locate(item) : undefined;
    if (moveReachedTarget(job, current)) {
      this.recordSourceLoot(pending, current, item, inventory);
      this.recordPocketUse(job, inventory);
    }
    this.pendingMoves.delete(job);
  }

  private recordSourceLoot(
    pending: PendingMove,
    current: Location | undefined,
    item: ReturnType<Inventory['itemByUid']>,
    inventory: Inventory,
  ): void {
    const { source } = pending;
    if (source?.kind !== 'furniture') {
      return;
    }
    const sourceMoved =
      current?.kind !== 'furniture' ||
      current.entity.uid !== source.entity.uid ||
      Boolean(item && pending.sourceCount !== undefined && item.count < pending.sourceCount);
    if (!sourceMoved) {
      return;
    }
    const window = this.lootWindows.get(source.entity.uid) ?? {
      name: inventory.entities.defOf(source.entity).name.toLowerCase(),
      handlingSeconds: 0,
      uiSeconds: 0,
    };
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
    const name = inventory.entities.defOf(entity).name.toLowerCase();
    const spec = defOf(inventory.registry, entity.type).container?.pockets[job.target.pocket];
    const pocketName = spec?.name ? ` · ${spec.name}` : '';
    this.metrics.recordPocketUse(
      `furniture:${entity.uid}:${job.target.pocket}:${name}${pocketName} pocket ${job.target.pocket + 1}`,
    );
  }

  frame(realSeconds: number, compressed: boolean, interrupted: boolean, now: number): boolean {
    this.metrics.frame(realSeconds, compressed, interrupted);
    if (interrupted || now - this.lastPersistAt >= 5000) {
      this.lastPersistAt = now;
      return true;
    }
    return false;
  }

  measureSnapshot(
    snapshot: () => unknown,
    session: Session,
    history: SnapshotHistory,
    repeats = 50,
  ): SnapshotMeasurement {
    const result = measureSnapshots(snapshot, () => JSON.stringify(inspectLiveSession(session)), repeats);
    for (const duration of result.durationsMs) {
      history.add(duration);
    }
    return result;
  }
}
