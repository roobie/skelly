import type { Chunk } from '../core/chunk.ts';
import type { Scale } from '../core/scale.ts';
import type { TerrainPlan } from '../core/terrainPlan.ts';
import { decodeColumn, type FromTerrain, type TerrainPort, type TerrainWorkerSource } from './terrainProtocol.ts';

/** Speculative terrain workers and their bounds, from graphics tuning. */
export interface TerrainWorkerOptions {
  readonly source: TerrainWorkerSource;
  readonly count: number;
  /** Missing columns requested ahead of admission, nearest first. */
  readonly lookaheadColumns: number;
  /** Running (wanted or retired) plus staged columns. */
  readonly maxOutstandingColumns: number;
}

interface Slot {
  readonly port: TerrainPort;
  ready: boolean;
  running: number;
}

interface Ticket {
  readonly cx: number;
  readonly cz: number;
  readonly slot: Slot;
  /** False once admission, a recentre or replay no longer wants its result; it still holds capacity until it replies. */
  wanted: boolean;
}

let epochs = 0;
const nextEpoch = (): number => {
  epochs += 1;
  return epochs;
};

/**
 * Computes columns ahead of admission. A reply is only staged here: the streamer alone admits a column,
 * at its own update boundary, and evaluates any column not staged by then itself.
 */
export class TerrainJobs {
  readonly lookahead: number;
  private readonly maxOutstanding: number;
  private readonly scale: Scale;
  private readonly epoch = nextEpoch();
  private nextTicket = 0;
  private readonly slots: Slot[] = [];
  private readonly tickets = new Map<number, Ticket>();
  private readonly wantedTickets = new Map<string, number>();
  private readonly staged = new Map<string, Chunk[]>();
  private disposed = false;
  /** Latched: a worker that failed once is never trusted or retried. */
  failure: string | undefined;

  constructor(options: TerrainWorkerOptions, plan: TerrainPlan, scale: Scale) {
    this.lookahead = options.lookaheadColumns;
    this.maxOutstanding = options.maxOutstandingColumns;
    this.scale = scale;
    try {
      for (let i = 0; i < options.count && !this.disposed; i++) {
        const slot: Slot = { port: options.source(), ready: false, running: 0 };
        this.slots.push(slot);
        slot.port.listen({
          message: (reply) => this.receive(slot, reply),
          failure: (reason) => this.fail(reason),
        });
        slot.port.post({ type: 'init', epoch: this.epoch, plan });
      }
    } catch (error) {
      // Latched like any other fault; the streamer reports it at its next update.
      this.fail(reasonOf(error));
    }
  }

  /** Columns holding capacity: running, whether still wanted or not, and staged. */
  get outstanding(): number {
    return this.tickets.size + this.staged.size;
  }

  /** The staged column for admission, if any. Nothing computed or running for it is wanted afterwards. */
  take(cx: number, cz: number): Chunk[] | undefined {
    const key = `${cx},${cz}`;
    this.unwant(key);
    const chunks = this.staged.get(key);
    this.staged.delete(key);
    return chunks;
  }

  /** Requests `columns`, nearest first, as far as ready workers and capacity allow. */
  want(columns: readonly (readonly [number, number])[]): void {
    for (const [cx, cz] of columns) {
      if (this.disposed || this.outstanding >= this.maxOutstanding) {
        return;
      }
      const key = `${cx},${cz}`;
      if (this.wantedTickets.has(key) || this.staged.has(key)) {
        continue;
      }
      const slot = this.slots.reduce<Slot | undefined>(
        (least, candidate) => (candidate.ready && (!least || candidate.running < least.running) ? candidate : least),
        undefined,
      );
      if (!slot) {
        return;
      }
      const ticket = this.nextTicket;
      this.nextTicket += 1;
      try {
        slot.port.post({ type: 'generate', epoch: this.epoch, ticket, cx, cz });
      } catch (error) {
        this.fail(reasonOf(error));
        return;
      }
      this.tickets.set(ticket, { cx, cz, slot, wanted: true });
      this.wantedTickets.set(key, ticket);
      slot.running += 1;
    }
  }

  /** Drops every staged result and wanted request, so a later reply for the same coordinates is stale. */
  retireAll(): void {
    for (const ticket of this.tickets.values()) {
      ticket.wanted = false;
    }
    this.wantedTickets.clear();
    this.staged.clear();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.retireAll();
    this.tickets.clear();
    for (const { port } of this.slots) {
      port.terminate();
    }
  }

  private unwant(key: string): void {
    const ticket = this.wantedTickets.get(key);
    if (ticket !== undefined) {
      this.wantedTickets.delete(key);
      this.tickets.get(ticket)!.wanted = false;
    }
  }

  private fail(reason: string): void {
    if (this.disposed) {
      return;
    }
    this.failure ??= `Terrain worker failed: ${reason}`;
    this.dispose();
  }

  /** Checks the envelope first: a port's reply is whatever arrived, whatever its declared type says. */
  private receive(slot: Slot, msg: unknown): void {
    if (this.disposed) {
      return;
    }
    if (!isEnvelope(msg)) {
      this.fail('malformed reply');
      return;
    }
    if (msg.epoch !== this.epoch) {
      return;
    }
    if (msg.type === 'ready') {
      slot.ready = true;
      return;
    }
    if (msg.type === 'failed') {
      this.fail(String(msg.reason));
      return;
    }
    const ticket = this.tickets.get(msg.ticket);
    try {
      if (!ticket || ticket.slot !== slot || ticket.cx !== msg.cx || ticket.cz !== msg.cz) {
        throw new Error(`reply for unknown ticket ${msg.ticket}`);
      }
      this.tickets.delete(msg.ticket);
      slot.running -= 1;
      const chunks = decodeColumn(msg.chunks, ticket.cx, ticket.cz, this.scale);
      if (ticket.wanted) {
        const key = `${ticket.cx},${ticket.cz}`;
        this.wantedTickets.delete(key);
        this.staged.set(key, chunks);
      }
    } catch (error) {
      this.fail(reasonOf(error));
    }
  }
}

const REPLY_TYPES: readonly unknown[] = ['ready', 'column', 'failed'] satisfies FromTerrain['type'][];

const isEnvelope = (msg: unknown): msg is FromTerrain =>
  typeof msg === 'object' &&
  msg !== null &&
  REPLY_TYPES.includes((msg as { type?: unknown }).type) &&
  Number.isInteger((msg as { epoch?: unknown }).epoch);

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
