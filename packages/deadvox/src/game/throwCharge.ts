// A held item's throw, from the press that picks its hand and item through release or cancel. The session owns it so a climber holds still while it charges (`DESIGN.md`, "Ladders and hatches").

import { dominantSide, offSide } from '../core/character.ts';
import type { HandSide, Inventory, Target } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import type { LadderHold } from '../core/ladders.ts';

/** What a press did: refused, nothing to throw, already throwing, waiting for handling to finish, or charging. */
export type ThrowStart =
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'empty' | 'held' | 'waiting' | 'charging' };

export interface ThrowRelease {
  readonly itemUid: number;
  readonly hand: HandSide;
  readonly heldSimSeconds: number;
}

export class ThrowCharge {
  private readonly inventory: Inventory;
  private readonly ladderHold: LadderHold;
  private chargeStartedAtSimSeconds: number | undefined;
  private chargeItemUid: number | undefined;
  private chargeHand: HandSide | undefined;

  constructor(inventory: Inventory, ladderHold: LadderHold) {
    this.inventory = inventory;
    this.ladderHold = ladderHold;
  }

  /** Sim time the charge began; undefined while none charges, including while one waits for handling. */
  get startedAt(): number | undefined {
    return this.chargeStartedAtSimSeconds;
  }

  get itemUid(): number | undefined {
    return this.chargeItemUid;
  }

  get hand(): HandSide | undefined {
    return this.chargeHand;
  }

  /** A throw is held, charging or waiting for handling to finish. */
  get active(): boolean {
    return this.chargeItemUid !== undefined;
  }

  /** The hand a throw uses: an occupied off hand first, but never a hand on a ladder. */
  throwHand(): HandSide {
    const { character, hands } = this.inventory;
    const off = offSide(character);
    return this.ladderHold.freeHand(hands[off] ? off : dominantSide(character));
  }

  /** A press of the throw: `busy` handling makes it wait, and the charge starts once that ends (`start`). */
  begin(time: number, busy: boolean): ThrowStart {
    if (this.active) {
      return { kind: 'held' };
    }
    const hand = this.throwHand();
    const item = this.inventory.hands[hand];
    if (!item) {
      return { kind: 'empty' };
    }
    const reason = this.ladderHold.refusal(hand);
    if (reason) {
      return { kind: 'refused', reason };
    }
    this.chargeHand = hand;
    this.chargeItemUid = item.uid;
    if (busy) {
      return { kind: 'waiting' };
    }
    this.chargeStartedAtSimSeconds = time;
    return { kind: 'charging' };
  }

  /** Starts a waiting throw's charge; false, and nothing held, when its item left the hand meanwhile. */
  start(time: number): boolean {
    if (this.chargeHand === undefined || this.inventory.hands[this.chargeHand]?.uid !== this.chargeItemUid) {
      this.cancel();
      return false;
    }
    this.chargeStartedAtSimSeconds = time;
    return true;
  }

  /** Ends the throw at its release: the item, hand and charge to throw with, or nothing if it never charged. */
  release(time: number): ThrowRelease | undefined {
    const { chargeItemUid: itemUid, chargeHand: hand, chargeStartedAtSimSeconds: startedAt } = this;
    this.cancel();
    return itemUid === undefined || hand === undefined || startedAt === undefined
      ? undefined
      : { itemUid, hand, heldSimSeconds: Math.max(0, time - startedAt) };
  }

  /** Ends a held throw whose hand a ladder hold has taken since it began, returning why; its item stays in the hand. */
  refuseForLadder(): string | undefined {
    const reason = this.chargeHand === undefined ? undefined : this.ladderHold.refusal(this.chargeHand);
    if (reason) {
      this.cancel();
    }
    return reason;
  }

  /** Commits the item to its pile at release; only the renderer presents the travel arc. */
  place(
    item: Item,
    hand: HandSide,
    target: Extract<Target, { kind: 'pile' }>,
  ): { readonly landed: true; readonly item: Item } | { readonly landed: false; readonly reason?: string } {
    const ladderRefusal = this.ladderHold.refusal(hand);
    if (ladderRefusal) {
      return { landed: false, reason: ladderRefusal };
    }
    const placed = this.inventory.throwToPile(item, hand, target);
    if (!placed.ok) {
      return { landed: false, reason: `Can't throw it there: ${placed.reason}` };
    }
    return { landed: true, item: placed.item };
  }

  cancel(): void {
    this.chargeStartedAtSimSeconds = undefined;
    this.chargeItemUid = undefined;
    this.chargeHand = undefined;
  }
}
