import type { Vec3 } from '../core/coords.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory, Target } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { dropSpots, playerPockets } from '../core/options.ts';

/** Gameplay handling estimate for opening a sealed cardboard package. */
export const BOX_UNPACK_SECONDS = 1.2;
const UNPACK_ACTION = 'item.unpack';

/** Activation only: deliberately not an inventory Use option. */
export class Unpacking {
  private readonly inventory: Inventory;
  private readonly queue: HandlingQueue;
  private readonly feet: () => Vec3;

  constructor(inventory: Inventory, queue: HandlingQueue, feet: () => Vec3) {
    this.inventory = inventory;
    this.queue = queue;
    this.feet = feet;
    queue.registerAction(UNPACK_ACTION, (params) => this.complete(params.uid));
  }

  activate(item: Item): string | undefined {
    if (!defOf(this.inventory.registry, item.type).unpack) {
      return 'This item cannot be unpacked';
    }
    if (this.inventory.locate(item)?.kind !== 'hand') {
      return 'Wield the package to unpack it';
    }
    if (this.queue.busy) {
      return 'Already handling something';
    }
    this.queue.enqueueAction(UNPACK_ACTION, `Unpack ${this.inventory.name(item)}`, BOX_UNPACK_SECONDS, {
      uid: item.uid,
    });
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
    const shell = this.inventory.create(payload.item, payload.count);
    // Admission guarantees one stack. Reserve enough ordinary spill capacity for the entire
    // payload before consuming the package; filling pockets can only reduce that spill.
    const spill = dropSpots(this.feet())
      .map((pos): Target => ({ kind: 'pile', pos }))
      .find((target) => this.inventory.planAdd(shell, target).ok);
    const pocket = this.pocketFor(shell);
    if (!(spill || pocket)) {
      return 'No room for the unpacked contents nearby';
    }
    if (!this.inventory.consume(box, 1)) {
      return 'Package is no longer held';
    }
    this.deliver(shell, { pocket, spill });
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
      const next = i === 0 ? shell : this.inventory.create(shell.type);
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
