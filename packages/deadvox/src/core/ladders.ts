// Ladders (`DESIGN.md`, "Ladders and hatches"): furniture only the player climbs, after grabbing it. A body is on a
// ladder while it overlaps one of the ladder's cells, counting a step's height below its feet. A climb ends with the
// feet level with the ladder's top, where moving toward the ladder steps off onto what it serves.

import type { BlockEntities, BlockEntity } from './blockEntities.ts';
import { dominantSide, offSide } from './character.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import { coreMessage } from './coreText.ts';
import type { HandHold, HandSide, Inventory } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import type { Body } from './physics.ts';
import type { Facing } from './templates.ts';

/** The horizontal direction a facing points, as [x, z]; north is -z (coords.ts, `WORLD_NORTH`). */
const OUTWARD: Readonly<Record<Facing, readonly [number, number]>> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export const ladderOutward = (facing: Facing): readonly [number, number] => OUTWARD[facing];

/** Blocks: how close to the top the feet count as there, so float error can't strand a climber just below it. */
const AT_TOP = 1e-6;

/**
 * The ladder piece the body is on: the highest one whose cells its box overlaps, counting `reachBelow` blocks under
 * its feet. Ladders stack one piece per layer, so the highest piece tells whether the body is at the top.
 */
const ladderAt = (entities: BlockEntities, body: Body, reachBelow: number): BlockEntity | undefined => {
  const [x, y, z] = body.pos;
  const halfX = body.halfWidth;
  const halfZ = body.halfDepth ?? halfX;
  for (let by = Math.ceil(y + body.height) - 1; by >= Math.floor(y - reachBelow); by--) {
    for (let bz = Math.floor(z - halfZ); bz < z + halfZ; bz++) {
      for (let bx = Math.floor(x - halfX); bx < x + halfX; bx++) {
        const entity = entities.at(bx, by, bz);
        if (entity && entities.defOf(entity).climbable) {
          return entity;
        }
      }
    }
  }
  return undefined;
};

/**
 * Turns the steered velocity into a climb, in blocks per Sim second. Moving toward the ladder's climbing side climbs
 * and moving away climbs down; neither carries the body off the ladder, which holds it on its centre line unless it
 * strafes across to step off sideways. The feet rise no higher than the top piece; there, moving toward the ladder
 * carries the body off onto what it serves, and a braced climber steps up the ledge of a hatch or roof edge on the
 * way. Returns false where the body walks instead: on the ground, unless it moves toward the ladder.
 */
export const climb = (
  body: Body,
  ladder: BlockEntity,
  { speed, dt, strafing }: { speed: number; dt: number; strafing: boolean },
): boolean => {
  const [ox, oz] = ladderOutward(ladder.facing);
  const away = body.vel[0] * ox + body.vel[2] * oz;
  if (body.onGround && away >= 0) {
    return false;
  }
  const top = ladder.pos[1] + ladder.size[1];
  const moving = Math.hypot(body.vel[0], body.vel[2]);
  const rise = moving > 0 ? (-away / moving) * speed : 0;
  body.vel[1] = Math.min(rise, Math.max(-speed, (top - body.pos[1]) / dt));
  const across = body.vel[0] * -oz + body.vel[2] * ox;
  const offsetX = body.pos[0] - (ladder.pos[0] + ladder.size[0] / 2);
  const offsetZ = body.pos[2] - (ladder.pos[2] + ladder.size[2] / 2);
  const pull = (offset: number): number => Math.max(-speed, Math.min(speed, -offset / dt));
  const atTop = body.pos[1] >= top - AT_TOP;
  const outward = atTop ? Math.min(away, 0) : pull(offsetX * ox + offsetZ * oz);
  const sideways = atTop || strafing ? across : pull(offsetX * -oz + offsetZ * ox);
  body.vel[0] = outward * ox + sideways * -oz;
  body.vel[2] = outward * oz + sideways * ox;
  return true;
};

/** A ladder hold as a save keeps it: on a ladder, or grabbed with F and not reached yet. */
export type LadderHoldState = { readonly on: true } | { readonly on: false; readonly grabbedUid: number };

export interface LadderHoldOptions {
  readonly entities: BlockEntities;
  readonly body: Body;
  readonly inventory: Inventory;
  /** Blocks under the feet a ladder still holds the body: a step's height. */
  readonly reachBelow: number;
  /** Blocks from a grabbed ladder's centre the player walks before letting go of it. */
  readonly reach: number;
  readonly restored?: LadderHoldState | null | undefined;
}

/**
 * The player's hold on a ladder: grabbed with F but not reached yet, or climbed with the off hand on it. Every hand
 * use, every move into or out of a hand and every furniture lift is admitted through it, so the hand on the ladder
 * does nothing else. A carried piece fills both hands, so no ladder is held while one is carried.
 */
export class LadderHold implements HandHold {
  private readonly options: LadderHoldOptions;
  private hold: { readonly on: true } | { readonly on: false; readonly grabbed: BlockEntity } | undefined;

  constructor(options: LadderHoldOptions) {
    this.options = options;
    const { restored } = options;
    if (restored && !restored.on) {
      const grabbed = options.entities.byUid(restored.grabbedUid);
      if (!(grabbed && options.entities.defOf(grabbed).climbable)) {
        throw new Error(`Invalid grabbed ladder ${restored.grabbedUid}`);
      }
      this.hold = { on: false, grabbed };
    } else {
      this.hold = restored ? { on: true } : undefined;
    }
  }

  snapshotState(): LadderHoldState | null {
    if (!this.hold) {
      return null;
    }
    return this.hold.on ? { on: true } : { on: false, grabbedUid: this.hold.grabbed.uid };
  }

  /** Whether the player climbs a ladder, rather than only having grabbed one. */
  get on(): boolean {
    return this.hold?.on === true;
  }

  /** The hand on the ladder while the player climbs: the off hand, which leaves the dominant hand free. */
  hand(): HandSide | undefined {
    return this.on ? offSide(this.options.inventory.character) : undefined;
  }

  /** The hand an action that would use `hand` (or either, when undefined) uses: the free one while one holds a ladder. */
  freeHand<Hand extends HandSide | undefined>(hand: Hand): Hand | HandSide {
    return this.on ? dominantSide(this.options.inventory.character) : hand;
  }

  /** Why `hand` can't act while a hand holds a ladder: it is that hand, or its item needs both hands. */
  refusal(hand: HandSide): string | undefined {
    const item = this.options.inventory.hands[hand];
    return hand === this.hand() || (item && this.bothHands(item)) ? this.holding() : undefined;
  }

  /**
   * Why a move can't take `item` out of hand `from` or into hand `to` while a hand holds a ladder: it needs that
   * hand, or the item needs both hands to hold.
   */
  moveRefusal(item: Item, from: HandSide | undefined, to: HandSide | undefined): string | undefined {
    const holding = this.hand();
    const needed = from === holding || to === holding || (to !== undefined && this.bothHands(item));
    return holding !== undefined && needed ? this.holding() : undefined;
  }

  /** Why both hands can't take up a piece of furniture: one is on the ladder. */
  liftRefusal(): string | undefined {
    return this.on ? this.holding() : undefined;
  }

  private holding(): string {
    const key = this.hand() === 'right' ? 'rightHandOnLadder' : 'leftHandOnLadder';
    return coreMessage(this.options.inventory.registry, key);
  }

  private bothHands(item: Item): boolean {
    return this.on && defOf(this.options.inventory.registry, item.type).twoHanded === true;
  }

  /** F at a ladder grabs it, the climb starting once the body reaches it; returns why not. */
  grab(entity: BlockEntity): string | undefined {
    const { inventory } = this.options;
    if (this.options.entities.carrying()) {
      return inventory.registry.ui.get(CORE_CONTENT_IDS.coreUi)!.furnitureMoveMessages.handsFull;
    }
    const reserved = this.options.entities.useRefusal(entity);
    if (reserved) {
      return reserved;
    }
    this.hold = this.reached() ? { on: true } : { on: false, grabbed: entity };
    return undefined;
  }

  /** Lets go of a ladder that is being removed, so the hold never names a missing piece. */
  releasePiece(entity: BlockEntity): void {
    const held = this.hold?.on ? this.reached() : this.hold?.grabbed;
    if (held?.uid === entity.uid) {
      this.hold = undefined;
    }
  }

  /**
   * The ladder piece the player climbs this step, updating the hold: `letGo` (a jump or a knockout) lets go, as does
   * leaving the ladder once on it, walking away from one grabbed but not reached, or lifting a piece meanwhile.
   */
  piece(letGo: boolean): BlockEntity | undefined {
    if (letGo || this.options.entities.carrying()) {
      this.hold = undefined;
    }
    const piece = this.hold ? this.reached() : undefined;
    if (piece) {
      this.hold = { on: true };
    } else if (this.hold?.on || (this.hold && this.beyondReach(this.hold.grabbed))) {
      this.hold = undefined;
    }
    return piece;
  }

  private reached(): BlockEntity | undefined {
    return ladderAt(this.options.entities, this.options.body, this.options.reachBelow);
  }

  private beyondReach(entity: BlockEntity): boolean {
    const { pos } = this.options.body;
    const centreX = entity.pos[0] + entity.size[0] / 2;
    const centreZ = entity.pos[2] + entity.size[2] / 2;
    return Math.hypot(pos[0] - centreX, pos[2] - centreZ) > this.options.reach;
  }
}
