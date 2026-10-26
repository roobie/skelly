// The quickbar and handling progress shown while playing (`DESIGN.md`, "Inventory screen").

import { html, render, type TemplateResult } from 'lit-html';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import { handlingWeights, type Inventory, type Location } from '../core/inventory.ts';
import { cellCount, defOf, type Item } from '../core/items.ts';
import { countText, decimalText } from '../core/numberText.ts';
import type { ScreenText } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';
import { inputBindings, labelForAction } from '../game/inputBindings.ts';
import type { Quickbar } from '../game/quickbar.ts';
import { activityProgress } from './activityProgress.ts';
import { fillHint, type HintText, keyCap } from './keyCap.ts';

type QuickbarText = ScreenText['quickbar'];
type HandlingText = ScreenText['handling'];

/** Where a quickbar item is on the person, and how long it takes to get it in hand. */
const whereText = (inv: Inventory, item: Item, at: Location | undefined, text: QuickbarText): string => {
  const cells = cellCount(defOf(inv.registry, item.type));
  switch (at?.kind) {
    case 'hand':
      return at.side === 'right' ? text.inRightHand : text.inLeftHand;
    case 'worn':
      return text.worn;
    case 'pocket':
      return fillText(text.pocket, {
        container: inv.name(at.owner).toLowerCase(),
        secs: decimalText(inv.pocketHandling(at.owner, at.pocket) + handlingWeights(inv.registry).perCell * cells),
      });
    default:
      return '';
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

export const quickbarViewModel = (bar: Quickbar, inv: Inventory): QuickbarViewModel => {
  const text = inv.registry.ui.get(CORE_CONTENT_IDS.coreUi)!.screenText.quickbar;
  return {
    slots: bar.slots.map((_, i) => {
      const item = bar.resolve(i, inv);
      if (!item) {
        return { key: labelForAction(`quickbar.use.${i + 1}`), filled: false, name: text.empty, where: '' };
      }
      const at = inv.locate(item);
      return {
        key: labelForAction(`quickbar.use.${i + 1}`),
        filled: true,
        name:
          item.count > 1
            ? fillText(text.count, { item: inv.name(item), count: countText(item.count) })
            : inv.name(item),
        where: whereText(inv, item, at, text),
      };
    }),
  };
};

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
  const visibleTops = [quickbar, document.getElementById('handling'), document.getElementById('hotbar')]
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
  readonly simSecondsLabel: string;
  readonly percent: number;
  readonly next: string;
  readonly cancelLabel: HintText;
  readonly movementLabel: string;
  readonly minimumPercent?: number;
}

interface ThrowChargePresentation {
  readonly elapsedSimSeconds: number;
  readonly chargeSimSeconds: number;
  readonly minimumHoldSimSeconds: number;
}

export interface HandlingPresentationSource {
  readonly jobs: readonly { readonly label: string; readonly duration: number; readonly elapsed: number }[];
  readonly longAction?: TimedActionPresentation;
  readonly throwCharge?: ThrowChargePresentation;
  readonly cancelLabel?: HintText;
  readonly movementLabel?: string;
}

export type TimedActionPresentation = HandlingPresentationSource['jobs'][number] & {
  readonly kind: 'forceDoor' | 'reading' | 'treatment' | 'vehicleWork';
  readonly ownerUid?: number;
  readonly stopped: boolean;
};

export const timedActionHandlingPresentation = (
  action: TimedActionPresentation,
  text: HandlingText,
): HandlingPresentationSource => ({
  jobs: [],
  ...(action.stopped ? {} : { longAction: action }),
  cancelLabel: action.stopped ? '' : fillHint(text.pause, { key: keyCap('handling.stop') }),
  movementLabel: '',
});

const progressLabel = (text: HandlingText, elapsed: number, total: number): string =>
  fillText(text.progress, { done: decimalText(elapsed), total: decimalText(total) });

/** The current move and the next one, while the inventory is closed. */
export const handlingViewModel = (queue: HandlingPresentationSource, text: HandlingText): HandlingViewModel => {
  const [job, next] = queue.jobs;
  if (queue.throwCharge) {
    const { elapsedSimSeconds, chargeSimSeconds, minimumHoldSimSeconds } = queue.throwCharge;
    const percent = (seconds: number) =>
      Math.round((Math.max(0, Math.min(chargeSimSeconds, seconds)) / chargeSimSeconds) * 100);
    return {
      visible: true,
      label: text.throwForce,
      simSecondsLabel: progressLabel(
        text,
        Math.max(0, Math.min(chargeSimSeconds, elapsedSimSeconds)),
        chargeSimSeconds,
      ),
      percent: percent(elapsedSimSeconds),
      minimumPercent: percent(minimumHoldSimSeconds),
      next: '',
      cancelLabel: '',
      movementLabel: '',
    };
  }
  if (queue.longAction) {
    const { label, elapsed, duration } = queue.longAction;
    return {
      visible: true,
      label,
      simSecondsLabel: progressLabel(text, elapsed, duration),
      percent: Math.round((Math.max(0, Math.min(duration, elapsed)) / duration) * 100),
      next: '',
      cancelLabel: queue.cancelLabel ?? '',
      movementLabel: queue.movementLabel ?? '',
    };
  }
  if (!job) {
    return { visible: false, label: '', simSecondsLabel: '', percent: 0, next: '', cancelLabel: '', movementLabel: '' };
  }
  return {
    visible: true,
    label: job.label,
    simSecondsLabel: progressLabel(text, job.elapsed, job.duration),
    percent: Math.round((job.elapsed / Math.max(job.duration, 1e-6)) * 100),
    next: next ? fillText(text.next, { job: next.label }) : '',
    cancelLabel: queue.cancelLabel ?? '',
    movementLabel: queue.movementLabel ?? '',
  };
};

const handlingTemplate = (vm: HandlingViewModel, text: HandlingText): TemplateResult =>
  activityProgress({
    label: vm.label,
    percent: vm.percent,
    progressText: vm.simSecondsLabel,
    ...(vm.minimumPercent === undefined
      ? {}
      : {
          minimum: {
            percent: vm.minimumPercent,
            label: fillText(text.minimumRelease, { percent: countText(vm.minimumPercent) }),
          },
        }),
    detail: html`${vm.next ? html`<span>${vm.next}</span>` : ''}
      ${vm.cancelLabel ? html`<span>${vm.cancelLabel}</span>` : ''}
      ${vm.movementLabel ? html`<span>${vm.movementLabel}</span>` : ''}`,
  });

export const renderHandling = (root: HTMLElement, queue: HandlingPresentationSource, text: HandlingText): void => {
  const vm = handlingViewModel(queue, text);
  root.hidden = !vm.visible;
  if (!vm.visible) {
    return;
  }
  render(handlingTemplate(vm, text), root);
};
