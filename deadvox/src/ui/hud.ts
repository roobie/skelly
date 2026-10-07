// The quickbar and handling progress shown while playing (DESIGN.md, "Inventory screen").

import { html, render, type TemplateResult } from 'lit-html';
import type { Inventory, Location } from '../core/inventory.ts';
import { cellCount, defOf, type Item } from '../core/items.ts';
import { inputBindings, labelForAction } from '../game/inputBindings.ts';
import type { Quickbar } from '../game/quickbar.ts';

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

interface QuickbarSlotViewModel {
  readonly key: string;
  readonly filled: boolean;
  readonly name: string;
  readonly where: string;
}

export interface QuickbarViewModel {
  readonly slots: readonly QuickbarSlotViewModel[];
}

export const quickbarViewModel = (bar: Quickbar, inv: Inventory): QuickbarViewModel => ({
  slots: bar.slots.map((_, i) => {
    const item = bar.resolve(i, inv);
    if (!item) {
      return { key: labelForAction(`quickbar.use.${i + 1}`), filled: false, name: 'empty', where: '' };
    }
    const at = inv.locate(item);
    return {
      key: labelForAction(`quickbar.use.${i + 1}`),
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

/** Keep the looked-at debug hint above visible bottom HUD elements, or at the quickbar's own bottom offset. */
export const positionLookedAtReadout = (readout: HTMLElement): void => {
  const quickbar = document.getElementById('quickbar');
  if (!quickbar) {
    return;
  }
  const quickbarStyle = getComputedStyle(quickbar);
  const visibleTops = [quickbar, document.getElementById('handling')]
    .filter((element): element is HTMLElement => element !== null)
    .flatMap((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 0
        ? [rect.top]
        : [];
    });
  if (visibleTops.length > 0) {
    readout.style.bottom = `${window.innerHeight - Math.min(...visibleTops)}px`;
    return;
  }
  const quickbarBottom = Number.parseFloat(quickbarStyle.bottom);
  if (Number.isFinite(quickbarBottom)) {
    readout.style.bottom = `${quickbarBottom}px`;
  } else {
    readout.style.removeProperty('bottom');
  }
};

/** Changes when the inventory or a slot's item does; the redraw contract's key. */
export const quickbarKey = (bar: Quickbar, inv: Inventory): string =>
  `${inputBindings.revision}|${inv.version}|${bar.slots.map((uid) => uid ?? 0).join(',')}`;

export interface HandlingViewModel {
  readonly visible: boolean;
  readonly label: string;
  readonly time: string;
  readonly percent: number;
  readonly next: string;
  readonly cancelLabel: string;
  readonly movementLabel: string;
}

export interface HandlingPresentationSource {
  readonly jobs: readonly { readonly label: string; readonly duration: number; readonly elapsed: number }[];
  readonly cancelLabel?: string;
  readonly movementLabel?: string;
}

/** The current move and the next one, while the inventory is closed. */
export const handlingViewModel = (queue: HandlingPresentationSource): HandlingViewModel => {
  const [job, next] = queue.jobs;
  if (!job) {
    return { visible: false, label: '', time: '', percent: 0, next: '', cancelLabel: '', movementLabel: '' };
  }
  return {
    visible: true,
    label: job.label,
    time: `${job.elapsed.toFixed(1)} / ${job.duration.toFixed(1)} s`,
    percent: Math.round((job.elapsed / Math.max(job.duration, 1e-6)) * 100),
    next: next ? `Then: ${next.label}` : '',
    cancelLabel: queue.cancelLabel ?? 'X cancels',
    movementLabel: queue.movementLabel ?? 'Half speed · no sprinting',
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
    <span>${vm.cancelLabel}</span>
  </div>
  ${vm.movementLabel ? html`<div class="hd-slow">${vm.movementLabel}</div>` : ''}
`;

export const renderHandling = (root: HTMLElement, queue: HandlingPresentationSource): void => {
  const vm = handlingViewModel(queue);
  root.hidden = !vm.visible;
  if (!vm.visible) {
    return;
  }
  render(handlingTemplate(vm), root);
};
