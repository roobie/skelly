// The quickbar and the handling progress shown while playing (DESIGN.md, "Inventory
// screen"). A quickbar key puts its item in your hands, which costs the handling
// time of wherever it is; pressing it again uses it.

import { html, render, type TemplateResult } from 'lit-html';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory, Location } from '../core/inventory.ts';
import { cellCount, defOf, type Item } from '../core/items.ts';

export const QUICKBAR_SLOTS = 5;

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

export interface QuickbarSlotViewModel {
  readonly key: string;
  readonly filled: boolean;
  readonly name: string;
  readonly where: string;
}

export interface QuickbarViewModel {
  readonly slots: readonly QuickbarSlotViewModel[];
}

export const quickbarViewModel = (bar: Quickbar, inv: Inventory): QuickbarViewModel => ({
  slots: bar.slots.map((item, i) => {
    if (!item) {
      return { key: String(i + 1), filled: false, name: 'empty', where: 'set it in the inventory' };
    }
    const at = inv.locate(item);
    return {
      key: String(i + 1),
      filled: true,
      name: `${inv.name(item)}${item.count > 1 ? ` ×${item.count}` : ''}`,
      where: whereText(inv, item, at),
    };
  }),
});

const quickbarTemplate = (vm: QuickbarViewModel): TemplateResult => html`
  ${vm.slots.map(
    (slot) => html`
      <div class=${slot.filled ? 'qb-slot' : 'qb-slot qb-empty'}>
        <span class="qb-key">${slot.key}</span>
        <span class="qb-name">${slot.name}</span>
        <span class="qb-where">${slot.where}</span>
      </div>
    `,
  )}
`;

export const renderQuickbar = (root: HTMLElement, bar: Quickbar, inv: Inventory): void => {
  render(quickbarTemplate(quickbarViewModel(bar, inv)), root);
};

/** Changes when the inventory or a slot's item does; the redraw contract's key. */
export const quickbarKey = (bar: Quickbar, inv: Inventory): string =>
  `${inv.version}|${bar.slots.map((item) => item?.uid ?? 0).join(',')}`;

export interface HandlingViewModel {
  readonly visible: boolean;
  readonly label: string;
  readonly time: string;
  readonly percent: number;
  readonly next: string;
}

/** The current move and the next one, while the inventory is closed. */
export const handlingViewModel = (queue: HandlingQueue): HandlingViewModel => {
  const [job, next] = queue.jobs;
  if (!job) {
    return { visible: false, label: '', time: '', percent: 0, next: '' };
  }
  return {
    visible: true,
    label: job.label,
    time: `${job.elapsed.toFixed(1)} / ${job.duration.toFixed(1)} s`,
    percent: Math.round((job.elapsed / Math.max(job.duration, 1e-6)) * 100),
    next: next ? `Then: ${next.label}` : '',
  };
};

const handlingTemplate = (vm: HandlingViewModel): TemplateResult => html`
  <div class="hd-row">
    <span>${vm.label}</span>
    <span class="hd-time">${vm.time}</span>
  </div>
  <div class="hd-bar"><div class="hd-fill" style=${`width: ${vm.percent}%`}></div></div>
  <div class="hd-row hd-muted">
    <span>${vm.next}</span>
    <span>X cancels</span>
  </div>
  <div class="hd-slow">Half speed · no sprinting</div>
`;

export const renderHandling = (root: HTMLElement, queue: HandlingQueue): void => {
  const vm = handlingViewModel(queue);
  root.hidden = !vm.visible;
  if (!vm.visible) {
    return;
  }
  render(handlingTemplate(vm), root);
};
