import type { Vec3 } from '../core/coords.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory, Target } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { putDownRefusal } from '../core/itemThrow.ts';
import { freshDropTarget, playerPockets } from '../core/options.ts';

export const UNPACK_ACTION = 'item.unpack';

/** Activation only: deliberately not an inventory Use option. */
export class Unpacking {
  private readonly inventory: Inventory;
  private readonly queue: HandlingQueue;
  private readonly feet: () => Vec3;
  private readonly onUnpacked: (type: string) => void;

  constructor(
    inventory: Inventory,
    queue: HandlingQueue,
    feet: () => Vec3,
    onUnpacked: (type: string) => void = () => undefined,
  ) {
    this.inventory = inventory;
    this.queue = queue;
    this.feet = feet;
    this.onUnpacked = onUnpacked;
    queue.registerAction(UNPACK_ACTION, (params) => this.complete(params.uid));
  }

  activate(item: Item): string | undefined {
    const { unpack } = defOf(this.inventory.registry, item.type);
    if (!unpack) {
      return 'This item cannot be unpacked';
    }
    if (
      !Object.entries(unpack.qualities ?? {}).every(([quality, level]) =>
        [...this.inventory.carriedTree()].some(
          ({ item: tool }) => (defOf(this.inventory.registry, tool.type).tool?.qualities[quality] ?? 0) >= level,
        ),
      )
    ) {
      return 'I need a tool for this';
    }
    if (this.inventory.locate(item)?.kind !== 'hand') {
      return 'Wield the package to unpack it';
    }
    if (this.queue.busy) {
      return 'Already handling something';
    }
    this.queue.enqueueAction(
      UNPACK_ACTION,
      `Unpack ${this.inventory.name(item)}`,
      this.inventory.scaleHandlingTime(defOf(this.inventory.registry, item.type).unpack!.simSeconds),
      {
        uid: item.uid,
      },
    );
    return undefined;
  }

  private complete(uid: unknown): string | undefined {
    const box = typeof uid === 'number' ? this.inventory.itemByUid(uid) : undefined;
    if (!box || this.inventory.locate(box)?.kind !== 'hand') {
      return 'Package is no longer held';
    }
    const payload = defOf(this.inventory.registry, box.type).unpack;
    if (!payload) {
      return 'Package no longer has unpacking data';
    }
    const shell = this.inventory.create(payload.item, payload.count, 1);
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
      return 'Package is no longer held';
    }
    this.deliver(shell, { pocket, spill });
    this.onUnpacked(payload.item);
    return undefined;
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
      const next = i === 0 ? shell : this.inventory.create(shell.type, 1, 1);
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
