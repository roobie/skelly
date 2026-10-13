// A held item's throw, from the press that picks its hand and item, through the release or cancel that ends its
// charge, to the player tick that lands it. The session owns it so a climber holds still while it charges (`DESIGN.md`, "Ladders and hatches"), and a replay, driven by the same recorded presses and releases, charges at the same ticks as
// the live game and lands its recorded throws through the same `land`.

import { dominantSide, offSide } from '../core/character.ts';
import type { Vec3 } from '../core/coords.ts';
import type { HandSide, Inventory, Pile, Plan, Spot, Target } from '../core/inventory.ts';
import type { Item, Placed } from '../core/items.ts';
import type { LadderHold } from '../core/ladders.ts';
import { pileItemPosition } from '../core/pileLayout.ts';

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
  private readonly blockSize: number;
  private chargeStartedAtSimSeconds: number | undefined;
  private chargeItemUid: number | undefined;
  private chargeHand: HandSide | undefined;

  constructor(inventory: Inventory, ladderHold: LadderHold, blockSize = 1) {
    this.inventory = inventory;
    this.ladderHold = ladderHold;
    this.blockSize = blockSize;
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

  /**
   * Admits a released throw and transfers its item into simulation-owned flight state. The ladder admits the hand
   * again here, as a hold can take it between the release and this tick.
   */
  land(
    item: Item,
    hand: HandSide,
    target: Extract<Target, { kind: 'pile' }>,
    flight: { origin: Vec3; landing: Vec3; startedAtSimSeconds: number; landingAt: number },
  ): { readonly landed: true } | { readonly landed: false; readonly reason?: string } {
    const { inventory } = this;
    const ladderRefusal = this.ladderHold.refusal(hand);
    if (ladderRefusal) {
      return { landed: false, reason: ladderRefusal };
    }
    const placement = inventory.planAdd(item, target);
    if (!placement.ok) {
      return { landed: false, reason: `Can't throw it there: ${placement.reason}` };
    }
    const destination = this.destination(item, target, placement);
    if (!destination) {
      return { landed: false };
    }
    const location = inventory.locate(item);
    if (
      location?.kind !== 'hand' ||
      location.side !== hand ||
      !inventory.beginItemFlight(item, hand, {
        ...flight,
        ...(destination.landing ? { landing: destination.landing } : {}),
        targetPos: [...target.pos],
        targetSpot: destination.targetSpot,
        ...(destination.mergeUid === undefined ? {} : { mergeUid: destination.mergeUid }),
      })
    ) {
      return { landed: false };
    }
    return { landed: true };
  }

  private destination(
    item: Item,
    target: Extract<Target, { kind: 'pile' }>,
    placement: Extract<Plan, { ok: true }>,
  ): { targetSpot: Spot; mergeUid?: number; landing?: Vec3 } | undefined {
    let targetSpot = placement.at;
    let mergeUid: number | undefined;
    if (placement.merge) {
      const location = this.inventory.locate(placement.merge);
      if (location?.kind !== 'pile' || !location.pile.pos.every((axis, index) => axis === target.pos[index])) {
        return undefined;
      }
      targetSpot = { x: location.placed.x, y: location.placed.y, rotated: location.placed.rotated };
      mergeUid = placement.merge.uid;
    }
    if (!targetSpot) {
      return undefined;
    }
    const pile = this.inventory.pileAt(target.pos);
    const items: Placed[] = [...(pile?.items ?? [])];
    if (!placement.merge) {
      items.push({ item, ...targetSpot });
    }
    const projectedPile: Pile = { pos: [...target.pos], items };
    const landing = pileItemPosition(this.inventory.registry, projectedPile, mergeUid ?? item.uid, {
      blockSize: this.blockSize,
    });
    return { targetSpot, ...(mergeUid === undefined ? {} : { mergeUid }), ...(landing ? { landing } : {}) };
  }

  cancel(): void {
    this.chargeStartedAtSimSeconds = undefined;
    this.chargeItemUid = undefined;
    this.chargeHand = undefined;
  }
}
