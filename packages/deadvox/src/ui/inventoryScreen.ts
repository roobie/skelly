// The inventory screen (`DESIGN.md`, "Inventory screen"): what you hold and wear, with
// each pocket drawn as its grid, and the piles and furniture within reach. Items move
// by drag and drop with a destination preview, or by keys. Every move
// goes through the handling queue, so it takes real seconds while the world keeps
// running. Furniture shows its contents once it has been searched.

import { html, nothing, render, type TemplateResult } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { type BlockEntity, searchTime } from '../core/blockEntities.ts';
import { BODY_REGIONS, type Body, type BodyRegion, bodyRegionLabel } from '../core/body.ts';
import { practiceForNextLevel } from '../core/character.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { Vec3 } from '../core/coords.ts';
import { coreLabel } from '../core/coreText.ts';
import type { WorkOperation, WorkOption } from '../core/craftCommands.ts';
import { firearmSlotIds, LIGHT_MOUNT_SLOT } from '../core/firearmFitting.ts';
import type { HandlingQueue } from '../core/handling.ts';
import { type Inventory, type Pile, sameGrid, spotOf, type Target, wornSlotOf } from '../core/inventory.ts';
import { GRID_CELL_REM as CELL_REM } from '../core/inventoryGridName.ts';
import { PILE_GRID } from '../core/inventoryScale.ts';
import { conditionWord, defOf, footprint, type GridSize, type Item, type Placed, weightOf } from '../core/items.ts';
import {
  batterySlotRefusal,
  bestPocket,
  dropTarget,
  type Option,
  options,
  otherHandPour,
  pourRefusal,
  quickMove,
} from '../core/options.ts';
import { type ReachSnapshot, reachTuning } from '../core/reach.ts';
import type { ScreenText, WearSlot } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';
import { clearsFindField, inputBindings, keyboardInput } from '../game/inputBindings.ts';
import type { ReplayActionPayload } from '../game/replayCommands.ts';
import { craftingText, craftTime, workName } from './craftReadout.ts';
import { factDetail } from './factDetail.ts';
import { matchesFind, queryWords } from './inventoryFind.ts';
import { type InventoryTab, InventoryTabState } from './inventoryTabs.ts';
import { ItemViewer, type ItemViewSource, isViewItemPress } from './itemViewer.ts';
import { fillHint, keyCap } from './keyCap.ts';

/** One cell's rendered size in a node's document, for maths against pointer coordinates. */
const cellPx = (node: Element): number => {
  const { defaultView, documentElement } = node.ownerDocument;
  return CELL_REM * Number.parseFloat(defaultView!.getComputedStyle(documentElement).fontSize);
};
const EMPTY_DROP_GRID: GridSize = { w: 2, h: 2 };

export const targetForPackedFloorDrop = (
  inventory: Pick<Inventory, 'locate' | 'plan'>,
  dragged: Item,
  pos: Vec3,
  underPointer?: Item,
): Target => {
  if (underPointer && underPointer.uid !== dragged.uid) {
    const location = inventory.locate(underPointer);
    if (location?.kind === 'pile' && location.pile.pos.every((coordinate, index) => coordinate === pos[index])) {
      const at = spotOf(location);
      if (at) {
        const target: Target = { kind: 'pile', pos, at };
        const plan = inventory.plan(dragged, target);
        if (plan.ok && (plan.merge === underPointer || plan.swap === underPointer)) {
          return target;
        }
      }
    }
  }
  return { kind: 'pile', pos };
};

/** Wear slots always shown, so there's somewhere to drop clothing and a slung long gun. */
const SHOWN_SLOTS: readonly WearSlot[] = ['shoulder', 'torso', 'vest', 'hands', 'legs', 'feet', 'back', 'waist'];
/** Head-worn slots show only while something is worn there, at the top of the worn panel. */
const WORN_ONLY_SLOTS: readonly WearSlot[] = ['head', 'eyes'];

import type { ChargerPanel } from './chargerPanel.ts';

export interface ScreenHooks {
  charger?: (entity: BlockEntity) => ChargerPanel | undefined;
  chargerRevision?: () => number;
  pictures?: { readonly version: number; picture: (item: Item) => string | undefined } | undefined;
  /** Draws an item's model for the item viewer; without it the viewer does not open. */
  itemView?: ItemViewSource | undefined;
  /** What each wear slot is called; from the core ui content. */
  slotLabels: Readonly<Record<WearSlot, string>>;
  reach: () => ReachSnapshot;
  /** The air block at the player's feet, where drops land. */
  feet: () => Vec3;
  /** Piles within reach. */
  nearby: () => readonly Pile[];
  /** Distance in metres from the player to a pile. */
  distance: (pile: Pile) => number;
  /** Furniture with pockets within reach, nearest first. */
  containers: () => readonly BlockEntity[];
  /** Distance in metres from the player to a piece of furniture. */
  entityDistance: (entity: BlockEntity) => number;
  /** Every simulation-changing screen action goes through the replay dispatcher. */
  dispatch: (payload: ReplayActionPayload) => string | undefined;
  /** Whether a search of it is queued. */
  searching: (entity: BlockEntity) => boolean;
  notice: (text: string) => void;
  /** Diegetic feedback for an action the inventory cannot perform. */
  refusal?: (text: string) => void;
  /** Extra lines for the details panel: freshness, charge. */
  describe: (item: Item) => string[];
  workOptions: (uid: number) => readonly WorkOption[];
  character: () => {
    readonly skills: Readonly<Record<string, number>>;
    readonly practice: Readonly<Record<string, number>>;
  };
  body: () => Pick<Body, 'health' | 'blood' | 'shock' | 'regionDamage' | 'wounds' | 'bleedingTier'>;
  needs: () => string;
  /** The alarm's wake hour (undefined: when rested), or undefined while no alarm is carried. */
  wakeGameHour?: () => { readonly gameHour: number | undefined } | undefined;
  actionRefusal?: () => string | undefined;
  attachmentCandidates?: (firearmUid: number, slotId: string) => readonly Item[];
}

interface Drag {
  item: Item;
  /** Pointer offset from the item's top-left corner, in px. */
  grab: [number, number];
  rotated: boolean;
  start: [number, number];
  moved: boolean;
  /** Keep the receiver fixed while dragging onto a service target. */
  card: Item | undefined;
  position?: [number, number];
  hover?: (({ target: Target } | { light: Item } | { receiver: Item }) & { ok: boolean; reason: string }) | undefined;
}

/** The drop zone of a light's battery slot on its card. */
const batterySlotTarget = (lightUid: number): string => `battery:${lightUid}`;

interface ItemViewModel {
  readonly item: Item;
  readonly uid: string;
  readonly className: string;
  readonly title: string;
  readonly name: string;
  readonly count?: string | undefined;
  readonly picture?: string | undefined;
  readonly style?: string | undefined;
}

interface GridViewModel {
  readonly target: string;
  readonly width: number;
  readonly height: number;
  readonly items: readonly ItemViewModel[];
  readonly packed?: boolean | undefined;
}

interface PocketViewModel {
  readonly label: string;
  readonly grid: GridViewModel;
}

interface SlotViewModel {
  readonly target: string;
  readonly label: string;
  readonly item?: ItemViewModel | undefined;
  readonly pockets?: readonly PocketViewModel[];
  readonly occupied?: string | undefined;
}

interface PileViewModel {
  readonly label: string;
  readonly grids: readonly GridViewModel[];
  readonly bags: readonly { readonly name: string; readonly pockets: readonly PocketViewModel[] }[];
}

interface FurnitureViewModel {
  readonly charger?: ChargerPanel | undefined;
  readonly uid: number;
  readonly label: string;
  readonly searching: boolean;
  readonly targeted: boolean;
  readonly searchLabel?: string | undefined;
  readonly grids: readonly { readonly label?: string | undefined; readonly grid: GridViewModel }[];
}

interface OptionViewModel {
  readonly label: string;
  readonly button: boolean;
  readonly time?: string;
  readonly reason?: string;
  readonly target?: Target;
  readonly operation?: WorkOperation;
}

interface AttachmentSlotViewModel {
  readonly id: string;
  readonly label: string;
  readonly occupied?: string;
  readonly attachmentUid?: number;
  readonly battery?: BatterySlotViewModel;
  readonly candidates: readonly { readonly uid: number; readonly name: string }[];
}

/** A powered light's battery slot, which takes a dragged battery. */
interface BatterySlotViewModel {
  readonly lightUid: number;
  /** The fitted battery's name, or the open-slot word. */
  readonly name: string;
  readonly fitted: boolean;
}

interface DetailsViewModel {
  readonly item?: Item;
  readonly empty: boolean;
  readonly category?: string;
  readonly name?: string;
  readonly condition?: string;
  readonly description?: string | undefined;
  readonly lines: readonly string[];
  readonly options: readonly OptionViewModel[];
  readonly attachmentSlots?: readonly AttachmentSlotViewModel[];
  readonly battery?: BatterySlotViewModel;
  readonly reservoir?: string;
  readonly pour?: { readonly label: string; readonly receiverUid?: number; readonly reason?: string };
}

const batterySlotTemplate = (slot: BatterySlotViewModel, text: InventoryText): TemplateResult =>
  html`<div class="inv-line inv-service-target" data-target=${batterySlotTarget(slot.lightUid)} data-occupied=${slot.fitted}>${fillText(text.battery, { battery: slot.name })}</div>`;

/** Only a tier content marks `warn` gets the warning style (`DESIGN.md`, "Bleeding"). */
const bleedingTemplate = (bleeding: BodyRegionViewModel['bleeding']) => {
  if (!bleeding) {
    return nothing;
  }
  return bleeding.warn
    ? html`<span class="inv-body-warning">${bleeding.label}</span>`
    : html`<span>${bleeding.label}</span>`;
};

interface BodyRegionViewModel {
  readonly region: BodyRegion;
  readonly bleeding: Readonly<{ label: string; warn: boolean }> | undefined;
  readonly infection: string;
  readonly damage: string;
}

interface SkillViewModel {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly practice: number;
  readonly nextLevelPractice: number;
  readonly progress: number;
}

interface InventoryScreenViewModel {
  readonly body: {
    readonly health: string;
    readonly blood: string;
    readonly shock: string;
    readonly regions: readonly BodyRegionViewModel[];
  };
  readonly skills: readonly SkillViewModel[];
  readonly needs: string;
  /** Shown only while an alarm is carried. */
  readonly wakeAt?: string | undefined;
  readonly containerMaxWidthCells?: number | undefined;
  readonly weight: string;
  readonly hands: readonly SlotViewModel[];
  readonly worn: readonly SlotViewModel[];
  readonly piles: readonly PileViewModel[];
  readonly hasFeetPile: boolean;
  readonly feetTarget: string;
  readonly furniture: readonly FurnitureViewModel[];
  readonly details: DetailsViewModel;
}

type InventoryText = ScreenText['inventory'];

const secs = (text: InventoryText, s: number) => fillText(text.secs, { value: s.toFixed(1) });
const kg = (text: InventoryText, g: number) => fillText(text.kg, { value: (g / 1000).toFixed(2) });
const occupiedHand = (inv: Pick<Inventory, 'hands' | 'registry'>, side: 'right' | 'left'): string | undefined => {
  const other = inv.hands[side === 'right' ? 'left' : 'right'];
  return !inv.hands[side] && other && defOf(inv.registry, other.type).twoHanded
    ? workName(inv.registry, other)
    : undefined;
};

const handContents = (slot: SlotViewModel, text: InventoryText): TemplateResult | typeof nothing => {
  if (slot.item) {
    return itemTemplate(slot.item);
  }
  return slot.occupied
    ? html`<span class="inv-occupied-hand">${fillText(text.reserved, { item: slot.occupied })}</span>`
    : nothing;
};
const optionAction = (option: Option | WorkOption): Pick<OptionViewModel, 'target' | 'operation'> => {
  if ('kind' in option) {
    return option.kind === 'move' ? { target: option.target } : {};
  }
  return { operation: option.operation };
};

const addScrollOffset = (parent: HTMLElement, axis: 'x' | 'y', offset: number): void => {
  if (axis === 'x') {
    parent.scrollLeft += offset;
  } else {
    parent.scrollTop += offset;
  }
};

const scrollItemWithinAncestor = (row: HTMLElement, parent: HTMLElement, axis: 'x' | 'y'): void => {
  const style = parent.ownerDocument.defaultView?.getComputedStyle(parent);
  if (!style) {
    return;
  }
  const overflow = axis === 'x' ? style.overflowX : style.overflowY;
  if (!['auto', 'scroll', 'hidden'].includes(overflow)) {
    return;
  }
  const bounds = parent.getBoundingClientRect();
  const viewportStart = axis === 'x' ? bounds.left + parent.clientLeft : bounds.top + parent.clientTop;
  const viewportSize = axis === 'x' ? parent.clientWidth : parent.clientHeight;
  if (viewportSize <= 0) {
    return;
  }
  const rect = row.getBoundingClientRect();
  const itemStart = axis === 'x' ? rect.left : rect.top;
  const itemEnd = axis === 'x' ? rect.right : rect.bottom;
  if (itemStart < viewportStart) {
    addScrollOffset(parent, axis, itemStart - viewportStart);
  } else if (itemEnd > viewportStart + viewportSize) {
    addScrollOffset(parent, axis, itemEnd - viewportStart - viewportSize);
  }
};

const itemTemplate = (vm: ItemViewModel): TemplateResult => html`
  <div class=${vm.className} data-uid=${vm.uid} title=${vm.title} style=${vm.style ?? ''}>
    ${vm.picture ? html`<img class="inv-item-picture" src=${vm.picture} alt="" draggable="false" />` : nothing}
    <span class="inv-item-name">${vm.name}</span>
    ${vm.count ? html`<span class="inv-item-count">${vm.count}</span>` : nothing}
  </div>
`;

const gridTemplate = (vm: GridViewModel): TemplateResult => html`
  <div
    class=${vm.packed ? 'inv-grid inv-grid-packed' : 'inv-grid'}
    data-target=${vm.target}
    style=${vm.packed ? `--inv-grid-max-width: ${vm.width}rem` : `width: ${vm.width}rem; height: ${vm.height}rem`}
  >
    ${vm.items.map(itemTemplate)}
  </div>
`;

const pocketTemplate = (vm: PocketViewModel): TemplateResult => html`
  <div class="inv-pocket">
    <span class="inv-pocket-label">${vm.label}</span>
    ${gridTemplate(vm.grid)}
  </div>
`;

const optionTemplate = (
  option: OptionViewModel,
  item: Item,
  queue: (item: Item, target?: Target, operation?: WorkOperation) => void,
): TemplateResult =>
  option.button
    ? html`
        <button class="inv-option" type="button" @click=${() => queue(item, option.target, option.operation)}>
          <span>${option.label}</span><span class="inv-time">${option.time}</span>
        </button>
      `
    : html`
        <div class="inv-option inv-option-no">
          <span>${option.label}</span><span class="inv-reason">${option.reason}</span>
        </div>
      `;

const attachmentSlotTemplate = (
  firearm: Item,
  slot: AttachmentSlotViewModel,
  attachmentAction: (payload: ReplayActionPayload) => void,
  text: InventoryText,
): TemplateResult => html`
  <div class="inv-line" data-attachment-slot=${slot.id} data-occupied=${slot.attachmentUid !== undefined}>
    <span>${fillText(text.slot, { slot: slot.label, item: slot.occupied ?? text.open })}</span>
    ${
      slot.attachmentUid === undefined
        ? slot.candidates.map(
            (candidate) =>
              html`<button class="inv-option" type="button" @click=${() => attachmentAction({ kind: 'firearm.attachment.fit', firearmUid: firearm.uid, slotId: slot.id, attachmentUid: candidate.uid })}>${fillText(text.fit, { item: candidate.name })}</button>`,
          )
        : html`<button class="inv-option" type="button" @click=${() => attachmentAction({ kind: 'firearm.attachment.remove', firearmUid: firearm.uid, slotId: slot.id })}>${text.remove}</button>`
    }
  </div>
  ${slot.battery === undefined ? nothing : batterySlotTemplate(slot.battery, text)}
`;

const detailsTemplate = (
  vm: DetailsViewModel,
  queue: (item: Item, target?: Target, operation?: WorkOperation) => void,
  attachmentAction: (payload: ReplayActionPayload) => void,
  text: InventoryText,
): TemplateResult => {
  if (vm.empty) {
    return html`<aside class="inv-details" data-pane="details" data-selected-uid=""><p class="inv-muted">${text.noSelection}</p></aside>`;
  }
  const item = vm.item!;
  return html`
    <aside class="inv-details" data-pane="details" data-selected-uid=${item.uid}>
      <div class="inv-kicker">${vm.category}</div>
      <h3>${vm.name}</h3>
      <div class="inv-condition">${vm.condition}</div>
      ${vm.description ? html`<p class="inv-muted">${vm.description}</p>` : nothing}
      <div class="inv-kicker">${text.inspect}</div>
      ${vm.lines.map((line) => html`<div class="inv-line">${line}</div>`)}
      ${vm.battery ? batterySlotTemplate(vm.battery, text) : nothing}
      ${vm.reservoir ? html`<div class="inv-line inv-service-target" data-target=${`reservoir:${item.uid}`}>${vm.reservoir}</div>` : nothing}
      ${vm.pour ? html`<button class="inv-pour" ?disabled=${vm.pour.reason !== undefined} title=${vm.pour.reason ?? ''} @click=${() => attachmentAction({ kind: 'liquid.pour', sourceUid: item.uid, receiverUid: vm.pour!.receiverUid! })}>${vm.pour.label}</button>` : nothing}
      <div class="inv-kicker">${text.whereItCanGo}</div>
      ${vm.options.map((option) => optionTemplate(option, item, queue))}
      ${
        vm.attachmentSlots?.length
          ? html`<div class="inv-kicker">${text.firearmSlots}</div>${vm.attachmentSlots.map((slot) => attachmentSlotTemplate(item, slot, attachmentAction, text))}`
          : nothing
      }
    </aside>
  `;
};

/** Steps through "when rested" (undefined) and the 24 hours of the day, wrapping both ways. */
const stepWakeGameHour = (gameHour: number | undefined, step: 1 | -1): number | undefined => {
  const next = ((gameHour === undefined ? 0 : gameHour + 1) + step + 25) % 25;
  return next === 0 ? undefined : next - 1;
};

const wakeLabel = (gameHour: number | undefined, text: InventoryText): string =>
  gameHour === undefined ? text.whenRested : `${String(gameHour).padStart(2, '0')}:00`;

const furnitureBodyTemplate = (
  furniture: FurnitureViewModel,
  search: (uid: number) => void,
  text: InventoryText,
): TemplateResult | TemplateResult[] => {
  if (furniture.searching) {
    return html`<p class="inv-muted">${text.searching}</p>`;
  }
  if (furniture.searchLabel) {
    return html`<button class="inv-option" type="button" data-action="furniture.search" @click=${() => search(furniture.uid)}><span>${fillHint(text.searchIt, { key: keyCap('inventory.search') })}</span><span class="inv-time">${furniture.searchLabel}</span></button>`;
  }
  return furniture.grids.map(
    (pocket) => html`
      ${pocket.label ? html`<span class="inv-pocket-label">${pocket.label}</span>` : nothing}
      ${gridTemplate(pocket.grid)}
    `,
  );
};

const inventoryTemplate = (
  vm: InventoryScreenViewModel,
  { tab, splitRatio, text }: { tab: InventoryTab; splitRatio: number; text: InventoryText },
  selectTab: (tab: InventoryTab) => void,
  {
    find,
    queue,
    search,
    attachmentAction,
    wait,
    stepWake,
  }: {
    find: { query: string; change: (query: string) => void; key: (e: Event) => void };
    queue: (item: Item, target?: Target, operation?: WorkOperation) => void;
    search: (uid: number) => void;
    attachmentAction: (payload: ReplayActionPayload) => void;
    wait: () => void;
    stepWake: (step: 1 | -1) => void;
  },
): TemplateResult => html`
  <header class="inv-head">
    <div class="inv-title"><h2>${factDetail(text.heading, text.headingFact)}</h2><span class="inv-weight">${fillText(text.carrying, { weight: vm.weight })}</span></div>
    <nav class="inv-tabs" aria-label=${text.tabsLabel}>
      ${(['items', 'skills', 'crafting', 'actions'] as const).map(
        (name) => html`
        <button type="button" class="inv-tab" data-tab=${name} aria-selected=${tab === name} @click=${() => selectTab(name)}>
          ${({ items: text.tabItems, skills: text.tabSkills, crafting: text.tabCrafting, actions: text.tabActions } satisfies Record<InventoryTab, string>)[name]}
        </button>
      `,
      )}
    </nav>
    <input
      class="inv-find"
      type="search"
      data-inventory-find
      placeholder=${text.find}
      aria-label=${text.findLabel}
      autocomplete="off"
      .value=${live(find.query)}
      @input=${(e: Event) => find.change((e.target as HTMLInputElement).value)}
      @keydown=${find.key}
    />
    <div class="inv-needs" aria-label=${text.needsLabel}>${vm.needs}</div>
    <details class="inv-help">
      <summary>${text.controls}</summary>
      <span>${['inventory.find', 'inventory.hands', 'inventory.wear', 'inventory.drop', 'inventory.best-pocket', 'inventory.rotate', 'inventory.view-item', 'inventory.search', 'inventory.cycle-target', 'inventory.put-target', 'handling.stop', 'ui.inventory-toggle'].map((id) => fillHint(text.controlLine, { key: keyCap(id), action: inputBindings.binding(id)!.description })).flatMap((line, i) => (i === 0 ? [line] : [' · ', line]))} · ${fillHint(text.assignQuickbar, { keys: html`${Array.from({ length: 5 }, (_, i) => keyCap(`quickbar.assign.${i + 1}`)).flatMap((cap, i) => (i === 0 ? [cap] : [' / ', cap]))}` })}</span>
    </details>
  </header>
  <div
    class="inv-body"
    data-tab-panel="items"
    style=${[
      `--inv-you-fr: ${splitFactors(splitRatio).you}`,
      `--inv-around-fr: ${splitFactors(splitRatio).around}`,
      vm.containerMaxWidthCells === undefined
        ? ''
        : `--inv-around-container-width-cap: ${vm.containerMaxWidthCells * CELL_REM}rem`,
    ]
      .filter(Boolean)
      .join('; ')}
    ?hidden=${tab !== 'items'}
  >
    <section class="inv-pane" data-pane="you">
      <h3>${text.you}</h3>
      <div class="inv-hands">
        ${vm.hands.map(
          (slot) => html`
          <div class="inv-slot" data-target=${slot.target}>
            <span class="inv-slot-label">${slot.label}</span>${handContents(slot, text)}
          </div>
        `,
        )}
      </div>
      ${vm.worn.map(
        (slot) => html`
        <div class="inv-worn">
          <div class="inv-slot inv-slot-worn" data-target=${slot.target}>
            <span class="inv-slot-label">${slot.label}</span>${slot.item ? itemTemplate(slot.item) : nothing}
          </div>
          ${slot.pockets?.length ? html`<div class="inv-pockets">${slot.pockets.map(pocketTemplate)}</div>` : nothing}
        </div>
      `,
      )}
    </section>
    <div
      class="inv-splitter"
      data-inventory-splitter
      role="separator"
      aria-label=${text.splitterLabel}
      aria-orientation="vertical"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow=${Math.round(splitRatio * 100)}
    ></div>
    <section class="inv-pane" data-pane="around">
      <h3>${text.around}</h3>
      <div class="inv-around-sections">
        ${vm.piles.map(
          (pile) => html`
          <div class="inv-around-section inv-around-floor" data-around-section="floor">
            <div class="inv-pile-label">${pile.label}</div>
            ${pile.grids.map(gridTemplate)}
          </div>
          ${pile.bags.map(
            (bag) => html`
            <div class="inv-around-section inv-around-container" data-around-section="container">
              <div class="inv-pile-label">${fillText(text.bagOnFloor, { bag: bag.name })}</div>
              <div class="inv-pockets">${bag.pockets.map(pocketTemplate)}</div>
            </div>
          `,
          )}
        `,
        )}
        ${
          vm.hasFeetPile
            ? nothing
            : html`
          <div class="inv-around-section inv-around-floor" data-around-section="floor">
            <div class="inv-pile-label">${text.atFeet}</div>${gridTemplate({ target: `pile:${vm.feetTarget}`, width: EMPTY_DROP_GRID.w * CELL_REM, height: EMPTY_DROP_GRID.h * CELL_REM, items: [] })}
          </div>
        `
        }
        ${vm.furniture.map(
          (furniture) => html`
          <div class="inv-around-section inv-around-container inv-pile${furniture.targeted ? ' inv-target' : ''}" data-around-section="container" data-entity-uid=${furniture.uid} data-target=${furniture.targeted ? 'true' : 'false'}>
            <div class="inv-pile-label">${furniture.targeted ? '▸ ' : ''}${furniture.label}</div>
            ${furnitureBodyTemplate(furniture, search, text)}
            ${
              furniture.charger
                ? html`<div class="inv-charger" data-charger=${furniture.uid}>
              <div data-charger-status>${furniture.charger.status}</div>
              <div>${furniture.charger.remaining}</div>
              ${furniture.charger.actions.map((action) => html`<button type="button" class="inv-option" data-charger-action=${action.payload.kind} @click=${() => attachmentAction(action.payload)}>${action.label}</button>`)}
            </div>`
                : nothing
            }
          </div>
        `,
        )}
      </div>
    </section>
    ${detailsTemplate(vm.details, queue, attachmentAction, text)}
  </div>
  <div class="inv-body inv-skills" data-tab-panel="skills" ?hidden=${tab !== 'skills'}>
    <section class="inv-pane inv-body-panel" data-pane="body">
      <h3>${text.body}</h3>
      <div class="inv-body-vitals">${fillText(text.vitals, { health: vm.body.health, blood: vm.body.blood, shock: vm.body.shock })}</div>
      ${vm.body.regions.map(
        (region) => html`
        <div class="inv-body-region" data-body-region=${region.region}>
          <span class="inv-body-region-name">${bodyRegionLabel(region.region)}</span>
          <span>${fillText(text.regionDamage, { damage: region.damage })}</span>
          ${bleedingTemplate(region.bleeding)}
          ${region.infection !== 'none' && region.infection !== 'resolved' ? html`<span class="inv-body-warning">${fillText(text.infection, { infection: region.infection })}</span>` : nothing}
        </div>
      `,
      )}
    </section>
    <section class="inv-pane inv-skill-list" aria-label=${text.skillsHeading}>
      <h3>${text.skillsHeading}</h3>
      ${vm.skills.map(
        (skill) => html`
        <div class="inv-skill" data-skill=${skill.id} data-level=${skill.level}>
          <div class="inv-skill-heading"><strong>${skill.name}</strong><span>${fillText(text.level, { level: skill.level })}</span></div>
          <div class="inv-skill-practice">${
            Number.isFinite(skill.nextLevelPractice)
              ? fillText(text.practice, { practice: skill.practice, next: skill.nextLevelPractice })
              : fillText(text.practiceMax, { practice: skill.practice })
          }</div>
          ${
            Number.isFinite(skill.nextLevelPractice)
              ? html`
            <div class="inv-skill-progress" role="progressbar" aria-label=${fillText(text.skillProgress, { skill: skill.name })} aria-valuemin="0" aria-valuemax=${skill.nextLevelPractice} aria-valuenow=${skill.practice}>
              <span style=${`width:${skill.progress}%`}></span>
            </div>
          `
              : nothing
          }
        </div>
      `,
      )}
    </section>
  </div>
  <div class="inv-body inv-actions" data-tab-panel="actions" ?hidden=${tab !== 'actions'}>
    <section class="inv-pane inv-body-panel" aria-label=${text.actionsHeading}>
      <h3>${text.actionsHeading}</h3>
      <button class="inv-option" type="button" data-action="wait" @click=${wait}>${text.wait}</button>
      ${
        vm.wakeAt === undefined
          ? nothing
          : html`
        <div class="inv-option" role="group" aria-label=${text.wakeAt}>
          <span>${text.wakeAt}</span>
          <span class="inv-wake-step">
            <button class="inv-option" type="button" data-action="wake-earlier" aria-label=${text.earlier} @click=${() => stepWake(-1)}>−</button>
            <span class="inv-time" data-wake-at>${vm.wakeAt}</span>
            <button class="inv-option" type="button" data-action="wake-later" aria-label=${text.later} @click=${() => stepWake(1)}>+</button>
          </span>
        </div>
      `
      }
    </section>
  </div>
  <footer class="inv-queue"></footer>
  <div class="inv-gutter-probe" aria-hidden="true"></div>
  <div class="inv-viewer-host"></div>
`;

const queueTemplate = (
  queue: Pick<HandlingQueue, 'jobs' | 'busy' | 'remaining'>,
  text: InventoryText,
): TemplateResult => {
  const rows = queue.jobs.map((job, i) => ({
    n: String(i + 1),
    label: job.label,
    percent: Math.round((job.elapsed / Math.max(job.duration, 1e-6)) * 100),
    duration: secs(text, job.duration),
  }));
  return html`
    <div class="inv-queue-title">
      <strong>${factDetail(text.doingNext, text.doingNextFact)}</strong>
      <span class="inv-muted">${queue.busy ? fillHint(text.queueLeft, { span: secs(text, queue.remaining), key: keyCap('handling.stop') }) : text.nothingQueued}</span>
    </div>
    ${rows.map(
      (row) => html`
        <div class="inv-job">
          <span class="inv-job-n">${row.n}</span><span class="inv-job-label">${row.label}</span>
          <span class="inv-bar"><span class="inv-bar-fill" style=${`width: ${row.percent}%`}></span></span>
          <span class="inv-time">${row.duration}</span>
        </div>
      `,
    )}
  `;
};

/** The You-pane share the side-by-side Items columns allow, as fractions of the width they share. */
interface SplitBounds {
  readonly availableWidth: number;
  readonly min: number;
  readonly max: number;
}

/** Undefined while the Items columns stack or are hidden, when the split doesn't apply. */
const splitBounds = (body: HTMLElement): SplitBounds | undefined => {
  const splitter = body.querySelector<HTMLElement>('[data-inventory-splitter]');
  const you = body.querySelector<HTMLElement>('[data-pane="you"]');
  const details = body.querySelector<HTMLElement>('[data-pane="details"]');
  const around = body.querySelector<HTMLElement>('[data-pane="around"]');
  if (!(splitter && you && details && around && splitter.offsetWidth > 0)) {
    return;
  }
  const availableWidth = Math.max(1, body.clientWidth - splitter.offsetWidth - details.offsetWidth);
  // Each side pane's min-width is its grid column's floor, so the clamp and the CSS can't disagree.
  const floor = (pane: HTMLElement): number => Number.parseFloat(getComputedStyle(pane).minWidth) || 0;
  const min = Math.min(1, floor(you) / availableWidth);
  return { availableWidth, min, max: Math.max(min, 1 - floor(around) / availableWidth) };
};

const clampSplit = (ratio: number, bounds: SplitBounds): number => Math.max(bounds.min, Math.min(bounds.max, ratio));

/**
 * The side tracks' fr factors for a split, scaled so the smaller is 1. When one side sits at its floor, CSS Grid
 * gives the other track only its factor times the rest (a factor sum below 1 counts as 1), so a factor below 1
 * would leave an empty band and pull the split away from where the player put it.
 */
const splitFactors = (ratio: number): { readonly you: string; readonly around: string } => {
  const smaller = Math.max(Math.min(ratio, 1 - ratio), 0.01);
  return { you: `${ratio / smaller}fr`, around: `${(1 - ratio) / smaller}fr` };
};

/**
 * The width a stable scroll gutter takes here (0 for overlay scrollbars), which no CSS value reports, so the
 * layout floors can reserve exactly one per gutter. The probe has a stable gutter like the panes, not
 * `overflow: scroll`: a browser can hide scrollbars yet still reserve a stable gutter. Undefined while hidden.
 */
const scrollbarWidth = (root: HTMLElement): number | undefined => {
  const probe = root.querySelector<HTMLElement>('.inv-gutter-probe');
  return probe && probe.offsetWidth > 0 ? probe.offsetWidth - probe.clientWidth : undefined;
};

export class InventoryScreen {
  selected: Item | undefined;
  /** The container keyboard puts go to; not kept across a reload of the screen. */
  private targetUid: number | undefined;
  private readonly root: HTMLElement;
  private readonly dragRoot: HTMLElement;
  private readonly inv: Pick<
    Inventory,
    | 'carried'
    | 'carriedWeight'
    | 'entities'
    | 'hands'
    | 'landing'
    | 'locate'
    | 'name'
    | 'plan'
    | 'planAdd'
    | 'registry'
    | 'scaleHandlingTime'
    | 'targetState'
    | 'version'
    | 'worn'
  >;
  private readonly queue: Pick<HandlingQueue, 'jobs' | 'busy' | 'remaining'>;
  private readonly hooks: ScreenHooks;
  private readonly tabs = new InventoryTabState();
  private readonly byUid = new Map<number, Item>();
  private readonly entityByUid = new Map<number, BlockEntity>();
  private order: Item[] = [];
  private drawn = '';
  private revealedSelectionUid: number | undefined;
  /** The player's chosen split; a narrow window clamps only what it applies, so widening restores the choice. */
  private splitRatio = 0.5;
  private splitDrag: { startX: number; startRatio: number; bounds: SplitBounds } | undefined;
  private drag: Drag | undefined;
  /** What the player typed into the find field; items it doesn't match are dimmed, not hidden. */
  private findQuery = '';
  private readonly viewer: ItemViewer;

  constructor(
    root: HTMLElement,
    inv: Pick<
      Inventory,
      | 'carried'
      | 'carriedWeight'
      | 'entities'
      | 'hands'
      | 'landing'
      | 'locate'
      | 'name'
      | 'plan'
      | 'planAdd'
      | 'registry'
      | 'scaleHandlingTime'
      | 'targetState'
      | 'version'
      | 'worn'
    >,
    queue: Pick<HandlingQueue, 'jobs' | 'busy' | 'remaining'>,
    hooks: ScreenHooks,
  ) {
    this.root = root;
    this.dragRoot = root.ownerDocument.querySelector<HTMLElement>('#inventory-drag-root')!;
    this.inv = inv;
    this.queue = queue;
    this.hooks = hooks;
    this.viewer = new ItemViewer(
      () => root.querySelector<HTMLElement>('.inv-viewer-host'),
      () => this.hooks.itemView,
      () => inv.registry.graphics.get(CORE_CONTENT_IDS.coreGraphics)!.itemViewer,
      () => this.text().viewerClose,
    );
    root.addEventListener('pointerdown', (e) => this.pointerDown(e));
    // A middle press would otherwise start the browser's autoscroll while the pointer is free.
    root.addEventListener('mousedown', (e) => {
      if (e.button !== 0 && isViewItemPress(e)) {
        e.preventDefault();
      }
    });
    globalThis.addEventListener('resize', () => this.syncSplitterToLayout());
    globalThis.addEventListener('pointermove', (e) => this.pointerMove(e));
    globalThis.addEventListener('pointerup', (e) => this.pointerUp(e));
  }

  get isOpen(): boolean {
    return this.tabs.isOpen;
  }

  get activeTab(): InventoryTab {
    return this.tabs.active;
  }

  open(): void {
    this.tabs.open();
    this.root.hidden = false;
    this.root.dataset.tab = this.tabs.active;
    document.body.classList.add('inventory-open');
    this.syncTabClass();
    this.drawn = '';
    this.update();
  }

  close(): void {
    this.tabs.close();
    this.revealedSelectionUid = undefined;
    this.findQuery = '';
    this.root.hidden = true;
    document.body.classList.remove('inventory-open', 'inventory-tab-crafting');
    this.splitDrag = undefined;
    this.endDrag();
    this.viewer.close();
  }

  /** The item the viewer shows, or undefined while it is closed. */
  get viewedUid(): number | undefined {
    return this.viewer.viewedUid;
  }

  private viewItem(item: Item): void {
    this.endDrag();
    this.viewer.open(item, workName(this.inv.registry, item));
  }

  openOnTab(tab: InventoryTab): void {
    if (!this.isOpen) {
      this.open();
    }
    this.selectTab(tab);
  }

  selectTab(tab: InventoryTab): void {
    this.tabs.select(tab);
    this.root.dataset.tab = tab;
    this.syncTabClass();
    this.drawn = '';
    this.update();
  }

  private syncTabClass(): void {
    document.body.classList.toggle('inventory-tab-crafting', this.tabs.active === 'crafting');
  }

  /** Redraws when something changed; call every frame while open. */
  update(): void {
    if (!this.isOpen) {
      return;
    }
    const piles = this.hooks
      .nearby()
      .map((p) => p.pos.join(','))
      .join(';');
    const containers = this.hooks
      .containers()
      .map((entity) => `${entity.uid}:${entity.searched ? 1 : 0}:${this.hooks.searching(entity) ? 1 : 0}`)
      .join(',');
    const view = this.hooks.reach();
    const bodyKey = JSON.stringify(this.hooks.body());
    const characterKey = JSON.stringify(this.hooks.character());
    const needsKey = this.hooks.needs();
    const wakeKey = JSON.stringify(this.hooks.wakeGameHour?.() ?? null);
    const key = `${this.hooks.chargerRevision?.()}|${this.hooks.pictures?.version}|${this.findQuery}|${inputBindings.revision}|${this.inv.version}|${this.inv.entities.version}|${this.selected?.uid}|${this.drag ? `card${this.drag.card?.uid}` : ''}|${this.targetUid}|${piles}|${containers}|${view.origin.join(',')}|${bodyKey}|${characterKey}|${needsKey}|${wakeKey}`;
    if (key !== this.drawn) {
      this.drawn = key;
      this.render();
    }
    this.renderQueue();
  }

  private refuseUnconsciousAction(action: string): boolean {
    const refusal = this.hooks.actionRefusal?.();
    if (
      !(
        refusal &&
        ((action.startsWith('inventory.') && action !== 'inventory.find') ||
          action.startsWith('quickbar.assign.') ||
          action === 'handling.stop')
      )
    ) {
      return false;
    }
    this.refuse(refusal);
    return true;
  }

  private rotateDraggedItem(action: string): boolean {
    if (!this.drag?.moved || action !== 'inventory.rotate') {
      return false;
    }
    this.drag.rotated = !this.drag.rotated;
    const halfCell = cellPx(this.root) / 2;
    this.drag.grab = [halfCell, halfCell];
    this.renderDrag();
    return true;
  }

  private quickbarDigit(action: string): number | undefined {
    return action.startsWith('quickbar.assign.') ? Number(action.slice('quickbar.assign.'.length)) - 1 : undefined;
  }

  /** The viewer covers the items, so their keys wait until it closes; its own binding closes it. */
  private viewerHoldsAction(action: string): boolean {
    if (
      this.viewer.viewedUid === undefined ||
      !(action.startsWith('inventory.') || this.quickbarDigit(action) !== undefined)
    ) {
      return false;
    }
    if (action === 'inventory.view-item') {
      this.viewer.close();
    }
    return true;
  }

  /** The shared input owner has already selected an inventory command. */
  onAction(action: string): boolean {
    if (this.refuseUnconsciousAction(action) || this.rotateDraggedItem(action) || this.viewerHoldsAction(action)) {
      return true;
    }
    const digit = this.quickbarDigit(action);
    const item = this.selected;
    if (action === 'handling.stop') {
      this.report(this.hooks.dispatch({ kind: 'inventory.cancel-handling' }));
      return true;
    }
    if (action === 'inventory.previous' || action === 'inventory.next') {
      this.step(action === 'inventory.next' ? 1 : -1);
      return true;
    }
    if (action === 'inventory.find') {
      this.root.querySelector<HTMLInputElement>('[data-inventory-find]')?.focus();
      return true;
    }
    if (action === 'inventory.search') {
      const next = this.hooks.containers().find((c) => !(c.searched || this.hooks.searching(c)));
      this.report(
        next ? this.hooks.dispatch({ kind: 'inventory.search', entityUid: next.uid }) : this.text().nothingToSearch,
      );
      return true;
    }
    if (action === 'inventory.cycle-target') {
      this.cycleTarget();
      return true;
    }
    if (!item) {
      return action.startsWith('inventory.') || digit !== undefined;
    }
    if (digit !== undefined) {
      this.report(this.hooks.dispatch({ kind: 'inventory.assign', slot: digit, itemUid: item.uid }));
      return true;
    }
    return this.selectedAction(action, item);
  }

  private selectedAction(action: string, item: Item): boolean {
    switch (action) {
      case 'inventory.hands':
        this.report(this.hooks.dispatch({ kind: 'inventory.to-hands', itemUid: item.uid, feet: this.hooks.feet() }));
        return true;
      case 'inventory.wear':
        this.wearOrTakeOff(item);
        return true;
      case 'inventory.drop': {
        const drop = dropTarget(this.inv, item, this.hooks.feet());
        this.report(drop.plan.ok ? this.tryQueue(item, drop.target) : drop.plan.reason);
        return true;
      }
      case 'inventory.rotate':
        this.rotateInPlace(item);
        return true;
      case 'inventory.best-pocket': {
        const best = bestPocket(this.inv, item);
        this.report(best ? this.tryQueue(item, best.target) : this.text().noRoom);
        return true;
      }
      case 'inventory.put-target':
        this.putInTarget(item);
        return true;
      case 'inventory.take-all-like':
        this.takeAllLike(item);
        return true;
      case 'inventory.view-item':
        this.viewItem(item);
        return true;
      default:
        return false;
    }
  }

  // ---- actions ----

  private tryQueue(item: Item, target: Target, count = item.count): string | undefined {
    const refusal = this.hooks.actionRefusal?.();
    if (refusal) {
      return refusal;
    }
    return this.hooks.dispatch({
      kind: 'inventory.move',
      itemUid: item.uid,
      target: this.inv.targetState(target),
      count,
    });
  }

  private loadBattery(light: Item, battery: Item): string | undefined {
    return (
      this.hooks.actionRefusal?.() ??
      this.hooks.dispatch({ kind: 'light.battery.load', lightUid: light.uid, batteryUid: battery.uid })
    );
  }

  private refuse(text: string): void {
    (this.hooks.refusal ?? this.hooks.notice)(text);
  }

  private report(reason: string | undefined): void {
    if (reason) {
      this.refuse(reason);
    }
  }

  private wearOrTakeOff(item: Item): void {
    if (this.inv.locate(item)?.kind === 'worn') {
      this.report(this.hooks.dispatch({ kind: 'inventory.to-hands', itemUid: item.uid, feet: this.hooks.feet() }));
      return;
    }
    this.report(this.tryQueue(item, { kind: 'worn' }));
  }

  private rotateInPlace(item: Item): void {
    const at = this.inv.locate(item);
    const spot = at && spotOf(at);
    const target = spot && sameGrid(at, { ...spot, rotated: !spot.rotated });
    if (target) {
      this.report(this.tryQueue(item, target));
    }
  }

  /** The chosen container if it is still within reach, else the nearest one. */
  private targetEntity(): BlockEntity | undefined {
    const containers = this.hooks.containers();
    return containers.find((c) => c.uid === this.targetUid) ?? containers[0];
  }

  private cycleTarget(): void {
    const containers = this.hooks.containers();
    if (containers.length === 0) {
      this.refuse('No container in reach');
      return;
    }
    const at = containers.findIndex((c) => c.uid === this.targetEntity()?.uid);
    this.targetUid = containers[(at + 1) % containers.length]!.uid;
  }

  /** The mouse path's move into a container pocket, with the whole stack going to the first pocket that takes it. */
  private putInTarget(item: Item): void {
    const entity = this.targetEntity();
    if (!entity) {
      this.refuse('No container in reach');
      return;
    }
    const pockets = this.inv.entities.defOf(entity).container?.pockets ?? [];
    let refusal: string | undefined;
    for (let pocket = 0; pocket < pockets.length; pocket += 1) {
      const target: Target = { kind: 'furniture', entity, pocket };
      const plan = this.inv.plan(item, target);
      if (plan.ok) {
        this.report(this.tryQueue(item, target));
        return;
      }
      refusal ??= plan.reason;
    }
    this.refuse(refusal ?? 'No room there');
  }

  /** Takes every item of the same category from the piles within reach. */
  private takeAllLike(item: Item): void {
    const { category } = defOf(this.inv.registry, item.type);
    let queued = 0;
    const around = [
      ...this.hooks.nearby().map((p) => p.items),
      ...this.hooks
        .containers()
        .filter((c) => c.searched)
        .flatMap((c) => c.pockets ?? []),
    ];
    for (const grid of around) {
      for (const { item: other } of [...grid]) {
        if (defOf(this.inv.registry, other.type).category !== category) {
          continue;
        }
        const best = bestPocket(this.inv, other);
        if (best && this.tryQueue(other, best.target) === undefined) {
          queued += 1;
        }
      }
    }
    if (queued > 0) {
      this.hooks.notice(fillText(this.text().taking, { count: queued, category }));
    } else {
      this.refuse(fillText(this.text().noneToTake, { category }));
    }
  }

  private clearFind(): void {
    this.findQuery = '';
    this.drawn = '';
    this.update();
    this.root.querySelector<HTMLInputElement>('[data-inventory-find]')?.blur();
  }

  private step(dir: number): void {
    if (this.order.length === 0) {
      return;
    }
    const at = this.selected ? this.order.indexOf(this.selected) : -1;
    this.selected = this.order[(at + dir + this.order.length) % this.order.length];
  }

  // ---- view model ----

  private render(): void {
    this.byUid.clear();
    this.entityByUid.clear();
    this.order = [];
    const vm = this.viewModel();
    render(
      inventoryTemplate(
        vm,
        { tab: this.tabs.active, splitRatio: this.splitRatio, text: this.text() },
        (tab) => this.selectTab(tab),
        {
          find: {
            query: this.findQuery,
            change: (query) => {
              this.findQuery = query;
              this.drawn = '';
              this.update();
            },
            key: (e) => {
              if (clearsFindField(e)) {
                this.clearFind();
                e.preventDefault();
                e.stopPropagation();
              }
            },
          },
          queue: (item, target, operation) => {
            const refusal = this.hooks.actionRefusal?.();
            if (refusal) {
              this.refuse(refusal);
            } else if (operation) {
              this.report(this.hooks.dispatch({ kind: 'inventory.work', itemUid: item.uid, operation }));
            } else if (target) {
              this.report(this.tryQueue(item, target));
            }
          },
          search: (uid) => {
            const refusal = this.hooks.actionRefusal?.();
            const entity = this.entityByUid.get(uid);
            if (refusal) {
              this.refuse(refusal);
            } else if (entity) {
              this.report(this.hooks.dispatch({ kind: 'inventory.search', entityUid: entity.uid }));
            }
          },
          attachmentAction: (payload) => {
            const refusal = this.hooks.actionRefusal?.();
            if (refusal) {
              this.refuse(refusal);
            } else {
              this.report(this.hooks.dispatch(payload));
            }
          },
          wait: () => {
            const refusal = this.hooks.actionRefusal?.();
            if (refusal) {
              this.refuse(refusal);
            } else {
              this.report(this.hooks.dispatch({ kind: 'action.wait' }));
            }
          },
          stepWake: (step) => {
            const alarm = this.hooks.wakeGameHour?.();
            const refusal = this.hooks.actionRefusal?.();
            if (refusal) {
              this.refuse(refusal);
            } else if (alarm) {
              const gameHour = stepWakeGameHour(alarm.gameHour, step) ?? null;
              this.report(this.hooks.dispatch({ kind: 'action.wake-hour', gameHour }));
            }
          },
        },
      ),
      this.root,
    );
    this.renderQueue();
    const selectedUid = this.selected?.uid;
    if (selectedUid === undefined) {
      this.revealedSelectionUid = undefined;
    } else if (selectedUid !== this.revealedSelectionUid && this.scrollSelectedItemIntoView()) {
      this.revealedSelectionUid = selectedUid;
    }
    this.syncSplitterToLayout();
    this.viewer.sync(
      (uid) => this.byUid.get(uid),
      (item) => workName(this.inv.registry, item),
    );
  }

  private syncSplitterToLayout(): void {
    const scrollbar = scrollbarWidth(this.root);
    if (scrollbar !== undefined) {
      this.root.style.setProperty('--inv-scrollbar-width', `${scrollbar}px`);
    }
    const body = this.root.querySelector<HTMLElement>('.inv-body[data-tab-panel="items"]');
    const bounds = body ? splitBounds(body) : undefined;
    if (body && bounds) {
      this.applySplit(body, bounds);
    }
  }

  private applySplit(body: HTMLElement, bounds: SplitBounds): void {
    const applied = clampSplit(this.splitRatio, bounds);
    const factors = splitFactors(applied);
    body.style.setProperty('--inv-you-fr', factors.you);
    body.style.setProperty('--inv-around-fr', factors.around);
    const splitter = body.querySelector<HTMLElement>('[data-inventory-splitter]');
    splitter?.setAttribute('aria-valuemin', String(Math.round(bounds.min * 100)));
    splitter?.setAttribute('aria-valuemax', String(Math.round(bounds.max * 100)));
    splitter?.setAttribute('aria-valuenow', String(Math.round(applied * 100)));
  }

  private scrollSelectedItemIntoView(): boolean {
    if (!this.selected) {
      return false;
    }
    const selectedUid = String(this.selected.uid);
    const row = [...this.root.querySelectorAll<HTMLElement>('.inv-item[data-uid]')].find(
      (candidate) => candidate.dataset.uid === selectedUid,
    );
    if (!row?.getClientRects().length) {
      return false;
    }
    for (let parent = row.parentElement; parent; parent = parent.parentElement) {
      scrollItemWithinAncestor(row, parent, 'x');
      scrollItemWithinAncestor(row, parent, 'y');
    }
    return true;
  }

  private viewModel(): InventoryScreenViewModel {
    const text = this.text();
    const body = this.hooks.body();
    const character = this.hooks.character();
    const alarm = this.hooks.wakeGameHour?.();
    const bodyView = {
      health: `${Math.round(body.health)}%`,
      blood: `${Math.round(body.blood)}%`,
      shock: `${Math.round(body.shock)}%`,
      regions: BODY_REGIONS.map((region) => ({
        region,
        damage: `${Math.round(body.regionDamage[region])}%`,
        bleeding: body.bleedingTier(region),
        infection: body.wounds[region]?.infection ?? 'none',
      })),
    };
    const hands = (['right', 'left'] as const).map(
      (side): SlotViewModel => ({
        target: `hand:${side}`,
        label: side === 'right' ? text.rightHand : text.leftHand,
        item: this.inv.hands[side] ? this.itemViewModel(this.inv.hands[side]!, 'inv-item inv-item-slot') : undefined,
        occupied: occupiedHand(this.inv, side),
      }),
    );
    const slots = new Set<WearSlot>([
      ...WORN_ONLY_SLOTS.filter((slot) => this.inv.worn[slot]),
      ...SHOWN_SLOTS,
      ...(Object.keys(this.inv.worn) as WearSlot[]),
    ]);
    const worn = [...slots].map((slot): SlotViewModel => {
      const item = this.inv.worn[slot];
      return {
        target: `worn:${slot}`,
        label: this.hooks.slotLabels[slot],
        item: item ? this.itemViewModel(item, 'inv-item inv-item-slot') : undefined,
        pockets: item ? this.pocketsViewModel(item) : [],
      };
    });

    const piles = this.hooks.nearby().map(
      (pile): PileViewModel => ({
        label: fillText(text.onFloor, { distance: this.hooks.distance(pile).toFixed(1) }),
        grids: [this.gridViewModel(PILE_GRID, pile.items, `pile:${pile.pos.join(',')}`, true)],
        bags: pile.items
          .filter(({ item }) => item.pockets)
          .map(({ item }) => ({ name: this.inv.name(item), pockets: this.pocketsViewModel(item) })),
      }),
    );
    const feet = this.hooks.feet();
    const hasFeetPile = this.hooks.nearby().some((pile) => pile.pos.join(',') === feet.join(','));
    const furniture = this.hooks.containers().map((entity): FurnitureViewModel => {
      this.entityByUid.set(entity.uid, entity);
      const def = this.inv.entities.defOf(entity);
      const searchedGrids = entity.searched
        ? (def.container?.pockets ?? []).map((spec, i) => ({
            label:
              def.container!.pockets.length > 1 || spec.name
                ? fillText(text.pocketReach, {
                    pocket: spec.name ?? fillText(text.pocket, { number: i + 1 }),
                    span: secs(text, spec.handlingSimSeconds),
                  })
                : undefined,
            grid: this.gridViewModel(
              { w: spec.grid[0], h: spec.grid[1] },
              entity.pockets?.[i] ?? [],
              `furniture:${entity.uid}:${i}`,
            ),
          }))
        : [];
      return {
        uid: entity.uid,
        charger: this.hooks.charger?.(entity),
        label: fillText(text.furniture, { name: def.name, distance: this.hooks.entityDistance(entity).toFixed(1) }),
        searching: !entity.searched && this.hooks.searching(entity),
        targeted: entity.uid === this.targetEntity()?.uid,
        searchLabel:
          entity.searched || this.hooks.searching(entity)
            ? undefined
            : secs(text, this.inv.scaleHandlingTime(searchTime(def, reachTuning(this.inv.registry)))),
        grids: searchedGrids,
      };
    });
    const skills = [...this.inv.registry.skills.values()].map((definition): SkillViewModel => {
      const level = character.skills[definition.id] ?? 0;
      const practice = character.practice[definition.id] ?? 0;
      const nextLevelPractice = practiceForNextLevel(this.inv.registry, level);
      return {
        id: definition.id,
        name: definition.name,
        level,
        practice,
        nextLevelPractice,
        progress: Number.isFinite(nextLevelPractice) ? (practice / nextLevelPractice) * 100 : 100,
      };
    });
    return {
      body: bodyView,
      skills,
      needs: this.hooks.needs(),
      wakeAt: alarm && wakeLabel(alarm.gameHour, text),
      containerMaxWidthCells: this.inv.registry.inventory.get(CORE_CONTENT_IDS.player)?.containerMaxWidthCells,
      weight: kg(text, this.inv.carriedWeight()),
      hands,
      worn,
      piles,
      hasFeetPile,
      feetTarget: feet.join(','),
      furniture,
      details: this.detailsViewModel(),
    };
  }

  private pocketsViewModel(owner: Item): PocketViewModel[] {
    const specs = defOf(this.inv.registry, owner.type).container?.pockets ?? [];
    const text = this.text();
    return specs.map((spec, i) => ({
      label: fillText(text.pocketReach, {
        pocket: spec.name ?? text.pocketName,
        span: secs(text, spec.handlingSimSeconds),
      }),
      grid: this.gridViewModel(
        { w: spec.grid[0], h: spec.grid[1] },
        owner.pockets?.[i] ?? [],
        `pocket:${owner.uid}:${i}`,
      ),
    }));
  }

  private gridViewModel(size: GridSize, placed: readonly Placed[], target: string, packed = false): GridViewModel {
    return {
      target,
      width: size.w * CELL_REM,
      height: size.h * CELL_REM,
      packed,
      items: placed.map(({ item, x, y, rotated }) => {
        const [w, h] = footprint(defOf(this.inv.registry, item.type), rotated);
        return this.itemViewModel(
          item,
          h > w ? 'inv-item inv-item-tall' : 'inv-item',
          packed
            ? { 'grid-column': `span ${w}`, 'grid-row': `span ${h}` }
            : {
                left: `calc(${x * CELL_REM}rem + 1px)`,
                top: `calc(${y * CELL_REM}rem + 1px)`,
                width: `calc(${w * CELL_REM}rem - 2px)`,
                height: `calc(${h * CELL_REM}rem - 2px)`,
              },
        );
      }),
    };
  }

  private itemViewModel(item: Item, className: string, style?: Record<string, string>): ItemViewModel {
    const def = defOf(this.inv.registry, item.type);
    const text = this.text();
    const itemStyle = style ?? {};
    this.byUid.set(item.uid, item);
    this.order.push(item);
    const words = queryWords(this.findQuery);
    const unmatched = !matchesFind(words, [workName(this.inv.registry, item), def.name, ...(def.keywords ?? [])]);
    return {
      item,
      uid: String(item.uid),
      className: `${className} cat-${def.category}${item === this.selected ? ' selected' : ''}${unmatched ? ' inv-item-unmatched' : ''}`,
      title: fillText(text.itemTitle, {
        item: item.count > 1 ? fillText(text.count, { item: def.name, count: item.count }) : def.name,
        condition: conditionWord(this.inv.registry, item.condition),
      }),
      name: workName(this.inv.registry, item),
      picture: this.hooks.pictures?.picture(item),
      count: item.count > 1 ? fillText(text.countBadge, { count: item.count }) : undefined,
      style:
        Object.keys(itemStyle).length > 0
          ? Object.entries(itemStyle)
              .map(([key, value]) => `${key}: ${value}`)
              .join('; ')
          : undefined,
    };
  }

  private detailsViewModel(): DetailsViewModel {
    const shown = this.drag ? this.drag.card : this.selected;
    const item = shown && this.inv.locate(shown) ? shown : undefined;
    if (!item) {
      return { empty: true, lines: [], options: [] };
    }
    const def = defOf(this.inv.registry, item.type);
    const slotIds = def.firearm ? firearmSlotIds(this.inv.registry, def) : [];
    const attachmentSlots = slotIds.map((slotId): AttachmentSlotViewModel => {
      const fitted = item.slots?.[slotId];
      const battery = fitted && this.batterySlot(fitted);
      return {
        id: slotId,
        label: slotId === LIGHT_MOUNT_SLOT ? 'Light mount' : slotId,
        ...(fitted ? { occupied: workName(this.inv.registry, fitted), attachmentUid: fitted.uid } : {}),
        ...(battery ? { battery } : {}),
        candidates: fitted
          ? []
          : (this.hooks.attachmentCandidates?.(item.uid, slotId) ?? []).map((candidate) => ({
              uid: candidate.uid,
              name: workName(this.inv.registry, candidate),
            })),
      };
    });
    const text = this.text();
    const name = workName(this.inv.registry, item);
    const battery = this.batterySlot(item);
    return {
      ...this.reservoirViewModel(item),
      item,
      empty: false,
      ...(battery ? { battery } : {}),
      category: def.category,
      name: item.count > 1 ? fillText(text.count, { item: name, count: item.count }) : name,
      condition: conditionWord(this.inv.registry, item.condition),
      description: def.description,
      lines: this.inspect(item),
      ...(attachmentSlots.length > 0 ? { attachmentSlots } : {}),
      options: [
        ...options(item, this.hooks.reach()).filter((option) => option.kind !== 'use'),
        ...this.hooks.workOptions(item.uid),
      ].map(
        (option): OptionViewModel =>
          option.plan.ok
            ? {
                label: option.label,
                button: true,
                time:
                  'duration' in option && option.duration !== undefined
                    ? craftTime(option.duration, craftingText(this.inv.registry))
                    : secs(text, option.plan.time),
                ...optionAction(option),
              }
            : { label: option.label, button: false, reason: option.plan.reason.toLowerCase() },
      ),
    };
  }

  private reservoirViewModel(item: Item): Pick<DetailsViewModel, 'reservoir' | 'pour'> {
    const { vessel } = defOf(this.inv.registry, item.type);
    if (!vessel) {
      return {};
    }
    const option = otherHandPour(item, this.hooks.reach());
    return {
      reservoir: coreLabel(this.inv.registry, 'reservoir', {
        volume: String((item.liquidContents?.kind === 'filled' ? item.liquidContents.volumeMicrolitres : 0) / 1000),
        capacity: String(vessel.capacityMicrolitres / 1000),
      }),
      ...(vessel.pour
        ? {
            pour: {
              label: option.receiver
                ? coreLabel(this.inv.registry, 'pourInto', { item: this.inv.name(option.receiver) })
                : option.label,
              ...(option.receiver ? { receiverUid: option.receiver.uid } : {}),
              ...(option.plan.ok ? {} : { reason: option.plan.reason }),
            },
          }
        : {}),
    };
  }

  private batterySlot(light: Item): BatterySlotViewModel | undefined {
    if (!defOf(this.inv.registry, light.type).light?.power) {
      return undefined;
    }
    const fitted = light.slots?.battery;
    return {
      lightUid: light.uid,
      name: fitted ? workName(this.inv.registry, fitted) : this.text().open,
      fitted: fitted !== undefined,
    };
  }

  private inspect(item: Item): string[] {
    const def = defOf(this.inv.registry, item.type);
    const text = this.text();
    const lines = [
      fillText(text.weightSize, {
        weight: kg(text, weightOf(this.inv.registry, item)),
        width: def.size[0],
        height: def.size[1],
        condition: Math.round(item.condition * 100),
      }),
    ];
    if (item.work) {
      lines.push(
        item.work.kind === 'craft'
          ? fillText(text.recipe, { recipe: item.work.recipe })
          : fillText(text.takingApart, { item: defOf(this.inv.registry, item.work.source).name }),
        fillText(text.progress, {
          done: item.work.elapsed.toFixed(1),
          total: item.work.duration.toFixed(1),
        }),
      );
    }
    if (def.stack) {
      lines.push(fillText(text.stacks, { count: def.stack }));
    }
    if (def.twoHanded) {
      lines.push(text.twoHanded);
    }
    if (def.food) {
      lines.push(fillText(text.food, { calories: def.food.calories, water: def.food.water }));
    }
    if (def.tool) {
      lines.push(
        Object.entries(def.tool.qualities)
          .map(([quality, level]) => fillText(text.quality, { quality, level }))
          .join(' · '),
      );
    }
    if (def.weapon) {
      const m = def.weapon.melee;
      lines.push(
        fillText(text.melee, { damage: m.damage, type: m.type, reach: m.reach, recovery: m.cooldownSimSeconds }),
      );
    }
    if (def.light) {
      lines.push(fillText(text.light, { radius: def.light.radius, seenFrom: def.light.seenFrom }));
    }
    if (def.wearable) {
      lines.push(fillText(text.worn, { slot: def.wearable.slot, encumbrance: def.wearable.encumbrance }));
    }
    lines.push(...this.hooks.describe(item));
    if (def.container) {
      const sizes = def.container.pockets.map((p) =>
        fillText(text.pocketSize, { width: p.grid[0], height: p.grid[1] }),
      );
      lines.push(fillText(text.pockets, { sizes: sizes.join(', ') }));
    }
    return lines;
  }

  private text(): InventoryText {
    return this.inv.registry.ui.get(CORE_CONTENT_IDS.coreUi)!.screenText.inventory;
  }

  private renderQueue(): void {
    const queueRoot = this.root.querySelector<HTMLElement>('.inv-queue');
    if (queueRoot) {
      render(queueTemplate(this.queue, this.text()), queueRoot);
    }
  }

  // ---- drag and drop ----

  private startSplitterDrag(e: PointerEvent): boolean {
    const splitter = (e.target as HTMLElement).closest<HTMLElement>('[data-inventory-splitter]');
    if (!(splitter && e.button === 0 && (!e.pointerType || e.pointerType === 'mouse'))) {
      return false;
    }
    const body = splitter.closest<HTMLElement>('.inv-body');
    const bounds = body ? splitBounds(body) : undefined;
    if (!bounds) {
      return true;
    }
    e.preventDefault();
    this.splitDrag = { startX: e.clientX, startRatio: clampSplit(this.splitRatio, bounds), bounds };
    return true;
  }

  private pointerDown(e: PointerEvent): void {
    if (this.startSplitterDrag(e)) {
      return;
    }
    const refusal = this.hooks.actionRefusal?.();
    if (refusal) {
      this.refuse(refusal);
      return;
    }
    const node = (e.target as HTMLElement).closest<HTMLElement>('[data-uid]');
    const item = node ? this.byUid.get(Number(node.dataset.uid)) : undefined;
    if (node && item && isViewItemPress(e)) {
      e.preventDefault();
      this.viewItem(item);
      return;
    }
    if (!(node && item) || e.button !== 0) {
      return;
    }
    e.preventDefault();
    const card = this.selected;
    this.selected = item;
    if (keyboardInput.held('inventory.quick-action-gate')) {
      const option = quickMove(item, this.hooks.reach());
      this.report(option.plan.ok ? this.tryQueue(item, option.target) : option.plan.reason);
      this.drawn = '';
      this.update();
      return;
    }
    const rect = node.getBoundingClientRect();
    const at = this.inv.locate(item);
    const rotated = (at && spotOf(at)?.rotated) ?? false;
    const halfCell = cellPx(node) / 2;
    this.drag = {
      item,
      grab: [Math.min(e.clientX - rect.left, halfCell), Math.min(e.clientY - rect.top, halfCell)],
      rotated,
      start: [e.clientX, e.clientY],
      moved: false,
      card,
    };
    this.drawn = '';
    this.update();
  }

  private pointerMove(e: PointerEvent): void {
    if (this.splitDrag) {
      const { startX, startRatio, bounds } = this.splitDrag;
      this.splitRatio = clampSplit(startRatio + (e.clientX - startX) / bounds.availableWidth, bounds);
      const body = this.root.querySelector<HTMLElement>('.inv-body[data-tab-panel="items"]');
      if (body) {
        this.applySplit(body, bounds);
      }
      return;
    }
    const { drag } = this;
    if (!drag) {
      return;
    }
    if (!drag.moved && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 5) {
      return;
    }
    drag.moved = true;
    const left = e.clientX - drag.grab[0];
    const top = e.clientY - drag.grab[1];
    drag.position = [left, top];
    this.renderDrag();
    this.hover(e.clientX, e.clientY, left, top);
  }

  private pointerUp(e: PointerEvent): void {
    if (this.splitDrag) {
      this.splitDrag = undefined;
      return;
    }
    const { drag } = this;
    if (!drag) {
      return;
    }
    if (drag.moved) {
      this.hover(e.clientX, e.clientY, e.clientX - drag.grab[0], e.clientY - drag.grab[1]);
      const { hover } = drag;
      if (hover && !('target' in hover)) {
        this.selected = drag.card;
      }
      if (hover?.ok) {
        this.report(this.commitDrop(drag.item, hover));
      } else if (hover) {
        this.refuse(hover.reason);
      }
    }
    this.endDrag();
    this.update();
  }

  private commitDrop(item: Item, hover: NonNullable<Drag['hover']>): string | undefined {
    if ('receiver' in hover) {
      return this.hooks.dispatch({ kind: 'liquid.pour', sourceUid: item.uid, receiverUid: hover.receiver.uid });
    }
    return 'light' in hover ? this.loadBattery(hover.light, item) : this.tryQueue(item, hover.target);
  }

  private endDrag(): void {
    this.drag = undefined;
    render(nothing, this.dragRoot);
    this.clearPreview();
  }

  private renderDrag(): void {
    const { drag } = this;
    if (!(drag?.moved && drag.position)) {
      render(nothing, this.dragRoot);
      return;
    }
    const def = defOf(this.inv.registry, drag.item.type);
    const [w, h] = footprint(def, drag.rotated);
    render(
      html`<div
        class=${`inv-ghost${h > w ? ' inv-item-tall' : ''} cat-${def.category}`}
        style=${`left: ${drag.position[0]}px; top: ${drag.position[1]}px; width: calc(${w * CELL_REM}rem - 2px); height: calc(${h * CELL_REM}rem - 2px)`}
      ><span class="inv-item-name">${workName(this.inv.registry, drag.item)}</span></div>`,
      this.dragRoot,
    );
  }

  private clearPreview(): void {
    for (const node of this.root.querySelectorAll<HTMLElement>('.drop-ok, .drop-no')) {
      node.classList.remove('drop-ok', 'drop-no');
      delete node.dataset.dropShape;
      delete node.dataset.dropMark;
      for (const property of ['--preview-left', '--preview-top', '--preview-width', '--preview-height']) {
        node.style.removeProperty(property);
      }
    }
  }

  /** Whether the dragged item can go to a target, and why not. */
  private dropCheck(
    item: Item,
    spec: string,
    target: Target,
  ): { ok: boolean; reason: string; at?: { x: number; y: number; rotated: boolean } } {
    if (spec.startsWith('worn:') && wornSlotOf(this.inv.registry, item) !== spec.slice(5)) {
      return { ok: false, reason: this.text().notWornThere };
    }
    const plan = this.inv.plan(item, target);
    return plan.ok ? { ok: true, reason: '', ...(plan.at ? { at: plan.at } : {}) } : { ok: false, reason: plan.reason };
  }

  /** Works out the drop target under the pointer and previews it. */
  private hover(px: number, py: number, left: number, top: number): void {
    const drag = this.drag!;
    this.clearPreview();
    drag.hover = undefined;
    const hits = document.elementsFromPoint(px, py).map((node) => node as HTMLElement);
    const zone = hits
      .map((node) => node.closest<HTMLElement>('[data-target]'))
      .find((node) => node !== null && this.root.contains(node));
    if (!zone) {
      return;
    }
    const spec = zone.dataset.target!;
    if (this.hoverServiceTarget(drag, zone, spec)) {
      return;
    }
    const rect = zone.getBoundingClientRect();
    const cell = cellPx(zone);
    const spot = {
      x: Math.round((left - rect.left) / cell),
      y: Math.round((top - rect.top) / cell),
      rotated: drag.rotated,
    };
    const packedFloor = spec.startsWith('pile:') && zone.classList.contains('inv-grid-packed');
    let target: Target | undefined;
    if (packedFloor) {
      const pos = spec.slice('pile:'.length).split(',').map(Number) as Vec3;
      const underPointerNode = hits
        .map((node) => node.closest<HTMLElement>('.inv-item[data-uid]'))
        .find((node) => node !== null && zone.contains(node));
      const underPointer = underPointerNode ? this.byUid.get(Number(underPointerNode.dataset.uid)) : undefined;
      target = targetForPackedFloorDrop(this.inv, drag.item, pos, underPointer);
    } else {
      target = this.targetFrom(spec, spot);
    }
    if (!target) {
      return;
    }
    const { ok, reason, at: landingSpot } = this.dropCheck(drag.item, spec, target);
    const previewSpot = landingSpot ?? spot;
    drag.hover = { target, ok, reason };
    zone.classList.add(ok ? 'drop-ok' : 'drop-no');
    zone.dataset.dropShape = ok ? 'will-land' : 'blocked';
    zone.dataset.dropMark = ok ? '✓' : '×';
    if (packedFloor) {
      zone.style.setProperty('--preview-left', '0px');
      zone.style.setProperty('--preview-top', '0px');
      zone.style.setProperty('--preview-width', `${zone.clientWidth}px`);
      zone.style.setProperty('--preview-height', `${zone.clientHeight}px`);
    } else if (spec.startsWith('pocket:') || spec.startsWith('pile:') || spec.startsWith('furniture:')) {
      const [w, h] = footprint(defOf(this.inv.registry, drag.item.type), drag.rotated);
      zone.style.setProperty('--preview-left', `${previewSpot.x * CELL_REM}rem`);
      zone.style.setProperty('--preview-top', `${previewSpot.y * CELL_REM}rem`);
      zone.style.setProperty('--preview-width', `${w * CELL_REM}rem`);
      zone.style.setProperty('--preview-height', `${h * CELL_REM}rem`);
    }
  }

  private hoverServiceTarget(drag: Drag, zone: HTMLElement, spec: string): boolean {
    if (spec.startsWith('reservoir:')) {
      this.hoverReservoir(drag, zone, Number(spec.slice('reservoir:'.length)));
      return true;
    }
    if (spec.startsWith('battery:')) {
      this.hoverBatterySlot(drag, zone, Number(spec.slice('battery:'.length)));
      return true;
    }
    return false;
  }

  private hoverReservoir(drag: Drag, zone: HTMLElement, receiverUid: number): void {
    const view = this.hooks.reach();
    const receiver = view.player.inventory.itemByUid(receiverUid);
    if (!receiver) {
      return;
    }
    const reason = this.hooks.actionRefusal?.() ?? pourRefusal(view, drag.item.uid, receiver.uid);
    drag.hover = { receiver, ok: reason === undefined, reason: reason ?? '' };
    zone.classList.add(reason ? 'drop-no' : 'drop-ok');
    zone.dataset.dropShape = reason ? 'blocked' : 'will-land';
    zone.dataset.dropMark = reason ? '×' : '✓';
  }

  private hoverBatterySlot(drag: Drag, zone: HTMLElement, lightUid: number): void {
    const view = this.hooks.reach();
    const light = view.player.inventory.itemByUid(lightUid);
    if (!light) {
      return;
    }
    const reason = batterySlotRefusal(view, light, drag.item);
    drag.hover = { light, ok: reason === undefined, reason: reason ?? '' };
    zone.classList.add(reason ? 'drop-no' : 'drop-ok');
    zone.dataset.dropShape = reason ? 'blocked' : 'will-land';
    zone.dataset.dropMark = reason ? '×' : '✓';
  }

  private targetFrom(spec: string, at: { x: number; y: number; rotated: boolean }): Target | undefined {
    const [kind, a, b] = spec.split(':');
    switch (kind) {
      case 'hand':
        return { kind: 'hand', side: a === 'left' ? 'left' : 'right' };
      case 'worn':
        return { kind: 'worn' };
      case 'pocket': {
        const owner = this.byUid.get(Number(a));
        return owner ? { kind: 'pocket', owner, pocket: Number(b), at } : undefined;
      }
      case 'pile': {
        const pos = a!.split(',').map(Number) as Vec3;
        return { kind: 'pile', pos, at };
      }
      case 'furniture': {
        const entity = this.entityByUid.get(Number(a));
        return entity ? { kind: 'furniture', entity, pocket: Number(b), at } : undefined;
      }
      default:
        return undefined;
    }
  }
}
