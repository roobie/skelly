// A held source item's cast, from the press that captures hand, item and ability through release or cancel. The
// item never leaves the hand, so unlike a throw nothing here moves it (`packages/deadvox/docs/magic-mod.md`, "6. Spells").

import type { Registry } from '../core/content.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import type { LadderHold } from '../core/ladders.ts';
import { castingAbility } from './castCommit.ts';

/** What a press did: refused, nothing to cast, already casting, waiting for handling to finish, or preparing. */
export type CastStart =
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'empty' | 'held' | 'waiting' | 'preparing' };

export interface CastRelease {
  readonly itemUid: number;
  readonly hand: HandSide;
  readonly abilityId: string;
  readonly heldSimSeconds: number;
}

interface Held {
  readonly itemUid: number;
  readonly hand: HandSide;
  readonly abilityId: string;
  readonly preparationSimSeconds: number;
  startedAtSimSeconds: number | undefined;
}

/** Preparation is transient: it is neither saved nor paid for, so a load or a cancel simply drops it. */
export class CastCharge {
  private readonly registry: Registry;
  private readonly inventory: Pick<Inventory, 'hands'>;
  private readonly ladderHold: Pick<LadderHold, 'refusal'>;
  private held: Held | undefined;

  constructor(registry: Registry, inventory: Pick<Inventory, 'hands'>, ladderHold: Pick<LadderHold, 'refusal'>) {
    this.registry = registry;
    this.inventory = inventory;
    this.ladderHold = ladderHold;
  }

  /** A cast is held, preparing, prepared or waiting for handling to finish. */
  get active(): boolean {
    return this.held !== undefined;
  }

  get itemUid(): number | undefined {
    return this.held?.itemUid;
  }

  get hand(): HandSide | undefined {
    return this.held?.hand;
  }

  get abilityId(): string | undefined {
    return this.held?.abilityId;
  }

  /** Sim time preparation began; undefined while none prepares, including while one waits for handling. */
  get startedAtSimSeconds(): number | undefined {
    return this.held?.startedAtSimSeconds;
  }

  /** How far preparation has run, from 0 to 1; undefined while none prepares. */
  progress(time: number): number | undefined {
    const { held } = this;
    return held?.startedAtSimSeconds === undefined
      ? undefined
      : Math.min(1, Math.max(0, time - held.startedAtSimSeconds) / held.preparationSimSeconds);
  }

  /** A prepared cast stays ready until released or cancelled; the same comparison the commit makes. */
  ready(time: number): boolean {
    const { held } = this;
    return held?.startedAtSimSeconds !== undefined && time - held.startedAtSimSeconds >= held.preparationSimSeconds;
  }

  /** A press with `hand`'s item: `busy` handling makes it wait, and preparation starts once that ends (`start`). */
  begin(hand: HandSide, time: number, busy: boolean): CastStart {
    if (this.held) {
      return { kind: 'held' };
    }
    const item = this.inventory.hands[hand];
    const abilityId = castingAbility(this.registry, item);
    if (!(item && abilityId)) {
      return { kind: 'empty' };
    }
    const reason = this.ladderHold.refusal(hand);
    if (reason) {
      return { kind: 'refused', reason };
    }
    const { preparationSimSeconds } = this.registry.abilities.get(abilityId)!;
    this.held = {
      itemUid: item.uid,
      hand,
      abilityId,
      preparationSimSeconds,
      startedAtSimSeconds: busy ? undefined : time,
    };
    return { kind: busy ? 'waiting' : 'preparing' };
  }

  /** Starts a waiting cast's preparation; false, and nothing held, when its item left the hand meanwhile. */
  start(time: number): boolean {
    if (!(this.held && this.sourceHeld(this.held))) {
      this.cancel();
      return false;
    }
    this.held.startedAtSimSeconds = time;
    return true;
  }

  /**
   * Ends the cast at its release: what to commit, or nothing when it was released before preparation ended. The
   * release only proposes; the commit decides again.
   */
  release(time: number): CastRelease | undefined {
    const { held } = this;
    const prepared = this.ready(time);
    this.cancel();
    return held?.startedAtSimSeconds === undefined || !prepared
      ? undefined
      : {
          itemUid: held.itemUid,
          hand: held.hand,
          abilityId: held.abilityId,
          heldSimSeconds: Math.max(0, time - held.startedAtSimSeconds),
        };
  }

  /** Ends a held cast whose hand a ladder hold has taken since it began, returning why; its item stays in the hand. */
  refuseForLadder(): string | undefined {
    const reason = this.held ? this.ladderHold.refusal(this.held.hand) : undefined;
    if (reason) {
      this.cancel();
    }
    return reason;
  }

  /** Ends a held cast whose item has left the captured hand; true when it did. */
  cancelIfSourceLeft(): boolean {
    if (this.held && !this.sourceHeld(this.held)) {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel(): void {
    this.held = undefined;
  }

  private sourceHeld({ hand, itemUid, abilityId }: Held): boolean {
    const item = this.inventory.hands[hand];
    return item?.uid === itemUid && castingAbility(this.registry, item) === abilityId;
  }
}
