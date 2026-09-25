// The quickbar and the handling progress shown while playing (DESIGN.md, "Inventory
// screen"). A quickbar key puts its item in your hands, which costs the handling
// time of wherever it is; pressing it again uses it.

import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory, Location } from '../core/inventory.ts';
import { cellCount, defOf, type Item } from '../core/items.ts';

export const QUICKBAR_SLOTS = 5;

const el = (tag: string, className = '', text = ''): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};

export class Quickbar {
  readonly slots: (Item | undefined)[] = new Array(QUICKBAR_SLOTS).fill(undefined);

  assign(slot: number, item: Item): void {
    // An item sits in one slot at most.
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] === item) {
        this.slots[i] = undefined;
      }
    }
    this.slots[slot] = item;
  }
}

/** Where a quickbar item is, and how long it takes to get it in hand. */
const whereText = (inv: Inventory, item: Item, at: Location | undefined): string => {
  if (!at) {
    return 'not with you';
  }
  const cells = cellCount(defOf(inv.registry, item.type));
  switch (at.kind) {
    case 'hand':
      return `in ${at.side} hand`;
    case 'worn':
      return 'worn';
    case 'pocket':
      return `${inv.name(at.owner).toLowerCase()} · ${(inv.pocketHandling(at.owner, at.pocket) + 0.05 * cells).toFixed(1)} s`;
    case 'furniture':
      return `in the ${inv.entities.defOf(at.entity).name.toLowerCase()}`;
    default:
      return 'on the floor';
  }
};

export const renderQuickbar = (root: HTMLElement, bar: Quickbar, inv: Inventory): void => {
  const nodes = bar.slots.map((item, i) => {
    const slot = el('div', item ? 'qb-slot' : 'qb-slot qb-empty');
    slot.append(el('span', 'qb-key', String(i + 1)));
    if (item) {
      const at = inv.locate(item);
      slot.append(
        el('span', 'qb-name', `${inv.name(item)}${item.count > 1 ? ` ×${item.count}` : ''}`),
        el('span', 'qb-where', whereText(inv, item, at)),
      );
    } else {
      slot.append(el('span', 'qb-name', 'empty'), el('span', 'qb-where', 'set it in the inventory'));
    }
    return slot;
  });
  root.replaceChildren(...nodes);
};

/** The current move and the next one, while the inventory is closed. */
export const renderHandling = (root: HTMLElement, queue: HandlingQueue): void => {
  const [job, next] = queue.jobs;
  root.hidden = !job;
  if (!job) {
    return;
  }
  const bar = el('div', 'hd-bar');
  const fill = el('div', 'hd-fill');
  fill.style.width = `${Math.round((job.elapsed / Math.max(job.duration, 1e-6)) * 100)}%`;
  bar.append(fill);
  const top = el('div', 'hd-row');
  top.append(
    el('span', '', job.label),
    el('span', 'hd-time', `${job.elapsed.toFixed(1)} / ${job.duration.toFixed(1)} s`),
  );
  const bottom = el('div', 'hd-row hd-muted');
  bottom.append(el('span', '', next ? `Then: ${next.label}` : ''), el('span', '', 'X cancels'));
  root.replaceChildren(top, bar, bottom, el('div', 'hd-slow', 'Half speed · no sprinting'));
};
