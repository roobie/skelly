import { actionText, fillText } from '../core/actionText.ts';
import type { Vec3 } from '../core/coords.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory, Target } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { putDownRefusal } from '../core/itemThrow.ts';
import { freshDropTarget, playerPockets } from '../core/options.ts';
import { unpackingTool } from './canOpening.ts';

export const UNPACK_ACTION = 'item.unpack';

export interface UnpackingDone {
  calendar?: () => number;
  opened?: (type: string) => void;
  unpacked?: (type: string) => void;
}

/** Activation only: deliberately not an inventory Use option. */
export class Unpacking {
  private readonly inventory: Inventory;
  private readonly queue: HandlingQueue;
  private readonly feet: () => Vec3;
  private readonly done: UnpackingDone;
  private readonly calendar: () => number;

  constructor(inventory: Inventory, queue: HandlingQueue, feet: () => Vec3, done: UnpackingDone = {}) {
    this.calendar = done.calendar ?? (() => 0);
    this.done = done;
    this.inventory = inventory;
    this.queue = queue;
    this.feet = feet;
    queue.registerAction(UNPACK_ACTION, (params) => this.complete(params.uid, params.toolUid));
  }

  activate(item: Item): string | undefined {
    const text = actionText(this.inventory.registry);
    const { unpack } = defOf(this.inventory.registry, item.type);
    if (!unpack) {
      return text.unpacking.cannot;
    }
    const tool = unpackingTool(this.inventory, item);
    if (Object.keys(unpack.qualities ?? {}).length > 0 && !tool) {
      return text.unpacking.needTool;
    }
    const rate =
      unpack.qualities?.opening && tool ? defOf(this.inventory.registry, tool.type).tool!.qualities.opening! : 1;
    if (this.inventory.locate(item)?.kind !== 'hand') {
      return text.unpacking.notInHands;
    }
    if (this.queue.busy) {
      return text.common.busy;
    }
    this.queue.enqueueAction(
      UNPACK_ACTION,
      fillText(text.unpacking.unpack, { item: this.inventory.name(item) }),
      this.inventory.scaleHandlingTime(unpack.simSeconds / rate),
      {
        uid: item.uid,
        toolUid: tool?.uid ?? null,
      },
    );
    return undefined;
  }

  private complete(uid: unknown, toolUid: unknown): string | undefined {
    const text = actionText(this.inventory.registry);
    const box = typeof uid === 'number' ? this.inventory.itemByUid(uid) : undefined;
    if (!box || this.inventory.locate(box)?.kind !== 'hand') {
      return text.common.notHeld;
    }
    const payload = defOf(this.inventory.registry, box.type).unpack;
    if (!payload) {
      return text.unpacking.cannot;
    }
    if (Object.keys(payload.qualities ?? {}).length > 0 && unpackingTool(this.inventory, box)?.uid !== toolUid) {
      return text.unpacking.toolGone;
    }
    if (payload.inPlace) {
      const { type } = box;
      this.inventory.transform(
        box,
        payload.item,
        box.foodExposure ? { kind: 'same' } : { kind: 'new', calendar: this.calendar() },
      );
      this.done.opened?.(type);
      return undefined;
    }
    const shell = this.createOutput(payload.item, payload.count, box);
    // Admission guarantees one stack. Reserve enough ordinary spill capacity for the entire
    // payload before consuming the package; filling pockets can only reduce that spill.
    const landed = freshDropTarget(this.inventory, shell, this.feet());
    const refusal = putDownRefusal(this.inventory, shell, landed);
    const spill = refusal ? undefined : landed;
    const pocket = this.pocketFor(shell);
    if (!(spill || pocket)) {
      return refusal;
    }
    if (!this.inventory.consume(box, 1)) {
      return text.common.notHeld;
    }
    this.deliver(shell, { pocket, spill });
    this.done.unpacked?.(payload.item);
    return undefined;
  }

  private createOutput(type: string, count: number, source: Item): Item {
    const output = this.inventory.create(type, count, 1, this.calendar());
    if (source.foodExposure && output.foodExposure) {
      output.foodExposure = this.inventory.currentFood(source);
      output.madeAtGameTimestamp = source.madeAtGameTimestamp;
    }
    return output;
  }

  private deliver(shell: Item, { pocket, spill }: { pocket: Target | undefined; spill: Target | undefined }): void {
    if (pocket) {
      if (!this.inventory.add(shell, pocket)) {
        throw new Error('Preflighted unpack pocket changed during synchronous commit');
      }
      return;
    }
    const { count } = shell;
    shell.count = 1;
    for (let i = 0; i < count; i++) {
      const next = i === 0 ? shell : this.createOutput(shell.type, 1, shell);
      const target = this.pocketFor(next) ?? spill!;
      if (!this.inventory.add(next, target)) {
        throw new Error('Reserved unpack spill capacity changed during synchronous commit');
      }
    }
  }

  private pocketFor(item: Item): Target | undefined {
    return playerPockets(this.inventory)
      .map(({ owner, pocket }): Target => ({ kind: 'pocket', owner, pocket }))
      .find((target) => this.inventory.planAdd(item, target).ok);
  }
}
