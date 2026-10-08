// The inventory screen (DESIGN.md, "Inventory screen"): what you hold and wear, with
// each pocket drawn as its grid, and the piles and furniture within reach. Items move
// by drag and drop, with the cells where they'd go previewed, or by keys. Every move
// goes through the handling queue, so it takes real seconds while the world keeps
// running. Furniture shows its contents once it has been searched.

import { html, nothing, render, type TemplateResult } from 'lit-html';
import { type BlockEntity, searchTime } from '../core/blockEntities.ts';
import type { BodyRegion, BodyState } from '../core/body.ts';
import { BODY_REGIONS } from '../core/body.ts';
import type { Vec3 } from '../core/coords.ts';
import type { WorkOperation, WorkOption } from '../core/craftCommands.ts';
import type { HandlingQueue } from '../core/handling.ts';
import { type Inventory, PILE_GRID, type Pile, sameGrid, spotOf, type Target } from '../core/inventory.ts';
import { conditionWord, defOf, footprint, type GridSize, type Item, type Placed, weightOf } from '../core/items.ts';
import { bestPocket, dropTarget, type Option, options, quickMove } from '../core/options.ts';
import type { ReachSnapshot } from '../core/reach.ts';
import type { WearSlot } from '../core/schema.ts';
import { practiceForNextLevel } from '../core/character.ts';
import { inputBindings, keyboardInput, labelForAction } from '../game/inputBindings.ts';
import type { ReplayActionPayload } from '../game/replayCommands.ts';
import { craftTime, workName } from './craftReadout.ts';
import { InventoryTabState, type InventoryTab } from './inventoryTabs.ts';

/** Pixels per inventory cell. */
const CELL = 32;

/** Wear slots always shown, so there's somewhere to drop clothing. */
const SHOWN_SLOTS: readonly WearSlot[] = ['torso', 'legs', 'back', 'waist'];
const SLOT_LABEL: Record<WearSlot, string> = {
  head: 'Head',
  torso: 'Torso',
  legs: 'Legs',
  back: 'Back',
  waist: 'Waist',
  hands: 'Hands',
  feet: 'Feet',
};

export interface ScreenHooks {
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
  body: () => Readonly<BodyState>;
  actionRefusal?: () => string | undefined;
}

interface Drag {
  item: Item;
  /** Pointer offset from the item's top-left corner, in px. */
  grab: [number, number];
  rotated: boolean;
  start: [number, number];
  moved: boolean;
  position?: [number, number];
  hover?: { target: Target; ok: boolean; reason: string } | undefined;
}

interface ItemViewModel {
  readonly item: Item;
  readonly uid: string;
  readonly className: string;
  readonly title: string;
  readonly name: string;
  readonly count?: string | undefined;
  readonly style?: string | undefined;
}

interface GridViewModel {
  readonly target: string;
  readonly width: number;
  readonly height: number;
  readonly items: readonly ItemViewModel[];
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
  readonly uid: number;
  readonly label: string;
  readonly searching: boolean;
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

interface DetailsViewModel {
  readonly item?: Item;
  readonly empty: boolean;
  readonly category?: string;
  readonly name?: string;
  readonly condition?: string;
  readonly description?: string | undefined;
  readonly lines: readonly string[];
  readonly options: readonly OptionViewModel[];
}

interface BodyRegionViewModel {
  readonly region: BodyRegion;
  readonly bleeding: boolean;
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
  readonly weight: string;
  readonly hands: readonly SlotViewModel[];
  readonly worn: readonly SlotViewModel[];
  readonly piles: readonly PileViewModel[];
  readonly hasFeetPile: boolean;
  readonly feetTarget: string;
  readonly furniture: readonly FurnitureViewModel[];
  readonly details: DetailsViewModel;
}

const secs = (s: number) => `${s.toFixed(1)} s`;
const kg = (g: number) => `${(g / 1000).toFixed(2)} kg`;
const occupiedHand = (inv: Pick<Inventory, 'hands' | 'registry'>, side: 'right' | 'left'): string | undefined => {
  const other = inv.hands[side === 'right' ? 'left' : 'right'];
  return !inv.hands[side] && other && defOf(inv.registry, other.type).twoHanded
    ? workName(inv.registry, other)
    : undefined;
};

const handContents = (slot: SlotViewModel): TemplateResult | typeof nothing => {
  if (slot.item) {
    return itemTemplate(slot.item);
  }
  return slot.occupied ? html`<span class="inv-occupied-hand">Reserved: ${slot.occupied}</span>` : nothing;
};
const optionAction = (option: Option | WorkOption): Pick<OptionViewModel, 'target' | 'operation'> => {
  if ('kind' in option) {
    return option.kind === 'move' ? { target: option.target } : {};
  }
  return { operation: option.operation };
};

const itemTemplate = (vm: ItemViewModel): TemplateResult => html`
  <div class=${vm.className} data-uid=${vm.uid} title=${vm.title} style=${vm.style ?? ''}>
    <span class="inv-item-name">${vm.name}</span>
    ${vm.count ? html`<span class="inv-item-count">${vm.count}</span>` : nothing}
  </div>
`;

const gridTemplate = (vm: GridViewModel): TemplateResult => html`
  <div class="inv-grid" data-target=${vm.target} style=${`width: ${vm.width}px; height: ${vm.height}px`}>
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

const detailsTemplate = (
  vm: DetailsViewModel,
  queue: (item: Item, target?: Target, operation?: WorkOperation) => void,
): TemplateResult => {
  if (vm.empty) {
    return html`<aside class="inv-details"><p class="inv-muted">Pick an item to see what it is and where it can go.</p></aside>`;
  }
  const item = vm.item!;
  return html`
    <aside class="inv-details">
      <div class="inv-kicker">${vm.category}</div>
      <h3>${vm.name}</h3>
      <div class="inv-condition">${vm.condition}</div>
      ${vm.description ? html`<p class="inv-muted">${vm.description}</p>` : nothing}
      <div class="inv-kicker">Inspect</div>
      ${vm.lines.map((line) => html`<div class="inv-line">${line}</div>`)}
      <div class="inv-kicker">Where it can go</div>
      ${vm.options.map((option) => optionTemplate(option, item, queue))}
    </aside>
  `;
};

const furnitureBodyTemplate = (
  furniture: FurnitureViewModel,
  search: (uid: number) => void,
): TemplateResult | TemplateResult[] => {
  if (furniture.searching) {
    return html`<p class="inv-muted">Searching…</p>`;
  }
  if (furniture.searchLabel) {
    return html`<button class="inv-option" type="button" @click=${() => search(furniture.uid)}><span>Search it (S)</span><span class="inv-time">${furniture.searchLabel}</span></button>`;
  }
  return furniture.grids.map(
    (pocket) => html`
      ${pocket.label ? html`<span class="inv-pocket-label">${pocket.label}</span>` : nothing}
      <div class="inv-grid-scroll">${gridTemplate(pocket.grid)}</div>
    `,
  );
};

const inventoryTemplate = (
  vm: InventoryScreenViewModel,
  tab: InventoryTab,
  selectTab: (tab: InventoryTab) => void,
  queue: (item: Item, target?: Target, operation?: WorkOperation) => void,
  search: (uid: number) => void,
): TemplateResult => html`
  <header class="inv-head">
    <div class="inv-title"><h2>Inventory</h2><span class="inv-weight">Carrying ${vm.weight}</span></div>
    <nav class="inv-tabs" aria-label="Character screen">
      ${(['items', 'skills', 'crafting'] as const).map((name) => html`
        <button type="button" class="inv-tab" data-tab=${name} aria-selected=${tab === name} @click=${() => selectTab(name)}>
          ${name === 'items' ? 'Items' : name === 'skills' ? 'Skills' : 'Crafting'}
        </button>
      `)}
    </nav>
    <details class="inv-help">
      <summary>Controls</summary>
      <span>Drag items · Hold ${labelForAction('inventory.quick-action-gate')} and click for quick move · ${['inventory.hands', 'inventory.wear', 'inventory.drop', 'inventory.best-pocket', 'inventory.rotate', 'inventory.search', 'handling.stop', 'ui.inventory-toggle'].map((id) => `${labelForAction(id)}: ${inputBindings.binding(id)!.description}`).join(' · ')} · ${Array.from({ length: 5 }, (_, i) => labelForAction(`quickbar.assign.${i + 1}`)).join(' / ')}: assign quickbar</span>
    </details>
  </header>
  <div class="inv-body" data-tab-panel="items" ?hidden=${tab !== 'items'}>
    <section class="inv-pane" data-pane="you">
      <h3>You</h3>
      <div class="inv-hands">
        ${vm.hands.map((slot) => html`
          <div class="inv-slot" data-target=${slot.target}>
            <span class="inv-slot-label">${slot.label}</span>${handContents(slot)}
          </div>
        `)}
      </div>
      ${vm.worn.map((slot) => html`
        <div class="inv-worn">
          <div class="inv-slot inv-slot-worn" data-target=${slot.target}>
            <span class="inv-slot-label">${slot.label}</span>${slot.item ? itemTemplate(slot.item) : nothing}
          </div>
          ${slot.pockets?.length ? html`<div class="inv-pockets">${slot.pockets.map(pocketTemplate)}</div>` : nothing}
        </div>
      `)}
    </section>
    <section class="inv-pane" data-pane="around">
      <h3>Around you</h3>
      ${vm.piles.map((pile) => html`
        <div class="inv-pile">
          <div class="inv-pile-label">${pile.label}</div>
          ${pile.grids.map(gridTemplate)}
          ${pile.bags.map((bag) => html`
            <div class="inv-bag">
              <div class="inv-pile-label">${bag.name}, on the floor</div>
              <div class="inv-pockets">${bag.pockets.map(pocketTemplate)}</div>
            </div>
          `)}
        </div>
      `)}
      ${vm.hasFeetPile ? nothing : html`
        <div class="inv-pile">
          <div class="inv-pile-label">At your feet</div>${gridTemplate({ target: `pile:${vm.feetTarget}`, width: PILE_GRID.w * CELL, height: PILE_GRID.h * CELL, items: [] })}
        </div>
      `}
      ${vm.furniture.map((furniture) => html`
        <div class="inv-pile">
          <div class="inv-pile-label">${furniture.label}</div>
          ${furnitureBodyTemplate(furniture, search)}
        </div>
      `)}
    </section>
    ${detailsTemplate(vm.details, queue)}
  </div>
  <div class="inv-body inv-skills" data-tab-panel="skills" ?hidden=${tab !== 'skills'}>
    <section class="inv-pane inv-body-panel" data-pane="body">
      <h3>Body</h3>
      <div class="inv-body-vitals">Health ${vm.body.health} · Blood ${vm.body.blood} · Shock ${vm.body.shock}</div>
      ${vm.body.regions.map((region) => html`
        <div class="inv-body-region" data-body-region=${region.region}>
          <span class="inv-body-region-name">${region.region.replace(/([A-Z])/g, ' $1')}</span>
          <span>${region.damage} damage</span>
          ${region.bleeding ? html`<span class="inv-body-warning">Bleeding</span>` : nothing}
          ${region.infection !== 'none' && region.infection !== 'resolved' ? html`<span class="inv-body-warning">${region.infection} infection</span>` : nothing}
        </div>
      `)}
    </section>
    <section class="inv-pane inv-skill-list" aria-label="Skills">
      <h3>Skills</h3>
      ${vm.skills.map((skill) => html`
        <div class="inv-skill" data-skill=${skill.id} data-level=${skill.level}>
          <div class="inv-skill-heading"><strong>${skill.name}</strong><span>Level ${skill.level}</span></div>
          <div class="inv-skill-practice">${Number.isFinite(skill.nextLevelPractice)
            ? `${skill.practice} / ${skill.nextLevelPractice} practice`
            : `${skill.practice} practice · no next level`}</div>
          ${Number.isFinite(skill.nextLevelPractice) ? html`
            <div class="inv-skill-progress" role="progressbar" aria-label=${`${skill.name} progress`} aria-valuemin="0" aria-valuemax=${skill.nextLevelPractice} aria-valuenow=${skill.practice}>
              <span style=${`width:${skill.progress}%`}></span>
            </div>
          ` : nothing}
        </div>
      `)}
    </section>
  </div>
  <footer class="inv-queue"></footer>
`;

const queueTemplate = (queue: Pick<HandlingQueue, 'jobs' | 'busy' | 'remaining'>): TemplateResult => {
  const rows = queue.jobs.map((job, i) => ({
    n: String(i + 1),
    label: job.label,
    percent: Math.round((job.elapsed / Math.max(job.duration, 1e-6)) * 100),
    duration: secs(job.duration),
  }));
  return html`
    <div class="inv-queue-title">
      <strong>Doing next</strong>
      <span class="inv-muted">${queue.busy ? `${secs(queue.remaining)} left · half speed, no sprinting · ${labelForAction('handling.stop')} cancels` : 'Nothing queued'}</span>
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

export class InventoryScreen {
  selected: Item | undefined;
  private readonly root: HTMLElement;
  private readonly dragRoot: HTMLElement;
  private readonly inv: Pick<
    Inventory,
    | 'carried'
    | 'carriedWeight'
    | 'entities'
    | 'hands'
    | 'locate'
    | 'name'
    | 'plan'
    | 'planAdd'
    | 'registry'
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
  private drag: Drag | undefined;

  constructor(
    root: HTMLElement,
    inv: Pick<
      Inventory,
      | 'carried'
      | 'carriedWeight'
      | 'entities'
      | 'hands'
      | 'locate'
      | 'name'
      | 'plan'
      | 'planAdd'
      | 'registry'
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
    root.addEventListener('pointerdown', (e) => this.pointerDown(e));
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
    this.root.hidden = true;
    document.body.classList.remove('inventory-open', 'inventory-tab-crafting');
    this.endDrag();
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
    const key = `${inputBindings.revision}|${this.inv.version}|${this.inv.entities.version}|${this.selected?.uid}|${piles}|${containers}|${view.origin.join(',')}|${bodyKey}|${characterKey}`;
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
        (action.startsWith('inventory.') || action.startsWith('quickbar.assign.') || action === 'handling.stop')
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
    this.drag.grab = [CELL / 2, CELL / 2];
    this.renderDrag();
    return true;
  }

  private quickbarDigit(action: string): number | undefined {
    return action.startsWith('quickbar.assign.') ? Number(action.slice('quickbar.assign.'.length)) - 1 : undefined;
  }

  /** The shared input owner has already selected an inventory command. */
  onAction(action: string): boolean {
    if (this.refuseUnconsciousAction(action) || this.rotateDraggedItem(action)) {
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
    if (action === 'inventory.search') {
      const next = this.hooks.containers().find((c) => !(c.searched || this.hooks.searching(c)));
      this.report(
        next ? this.hooks.dispatch({ kind: 'inventory.search', entityUid: next.uid }) : 'Nothing here to search',
      );
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
      case 'inventory.drop':
        this.tryQueue(item, dropTarget(this.inv, item, this.hooks.feet()).target);
        return true;
      case 'inventory.rotate':
        this.rotateInPlace(item);
        return true;
      case 'inventory.best-pocket': {
        const best = bestPocket(this.inv, item);
        this.report(best ? this.tryQueue(item, best.target) : 'No room on you');
        return true;
      }
      case 'inventory.take-all-like':
        this.takeAllLike(item);
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
      this.hooks.notice(`Taking ${queued} ${category} items`);
    } else {
      this.refuse(`No ${category} items to take`);
    }
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
        this.tabs.active,
        (tab) => this.selectTab(tab),
        (item, target, operation) => {
          const refusal = this.hooks.actionRefusal?.();
          if (refusal) {
            this.refuse(refusal);
          } else if (operation) {
            this.report(this.hooks.dispatch({ kind: 'inventory.work', itemUid: item.uid, operation }));
          } else if (target) {
            this.report(this.tryQueue(item, target));
          }
        },
        (uid) => {
          const refusal = this.hooks.actionRefusal?.();
          const entity = this.entityByUid.get(uid);
          if (refusal) {
            this.refuse(refusal);
          } else if (entity) {
            this.report(this.hooks.dispatch({ kind: 'inventory.search', entityUid: entity.uid }));
          }
        },
      ),
      this.root,
    );
    this.renderQueue();
  }

  private viewModel(): InventoryScreenViewModel {
    const body = this.hooks.body();
    const character = this.hooks.character();
    const bodyView = {
      health: `${Math.round(body.health)}%`,
      blood: `${Math.round(body.blood)}%`,
      shock: `${Math.round(body.shock)}%`,
      regions: BODY_REGIONS.map((region) => ({
        region,
        damage: `${Math.round(body.regionDamage[region])}%`,
        bleeding: body.wounds[region]?.bleeding ?? false,
        infection: body.wounds[region]?.infection ?? 'none',
      })),
    };
    const hands = (['right', 'left'] as const).map(
      (side): SlotViewModel => ({
        target: `hand:${side}`,
        label: `${side === 'right' ? 'Right' : 'Left'} hand`,
        item: this.inv.hands[side] ? this.itemViewModel(this.inv.hands[side]!, 'inv-item inv-item-slot') : undefined,
        occupied: occupiedHand(this.inv, side),
      }),
    );
    const slots = new Set<WearSlot>([...SHOWN_SLOTS, ...(Object.keys(this.inv.worn) as WearSlot[])]);
    const worn = [...slots].map((slot): SlotViewModel => {
      const item = this.inv.worn[slot];
      return {
        target: `worn:${slot}`,
        label: SLOT_LABEL[slot],
        item: item ? this.itemViewModel(item, 'inv-item inv-item-slot') : undefined,
        pockets: item ? this.pocketsViewModel(item) : [],
      };
    });

    const piles = this.hooks.nearby().map(
      (pile): PileViewModel => ({
        label: `On the floor · ${this.hooks.distance(pile).toFixed(1)} m`,
        grids: [this.gridViewModel(PILE_GRID, pile.items, `pile:${pile.pos.join(',')}`)],
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
                ? `${spec.name ?? `pocket ${i + 1}`} · ${secs(spec.handlingSimSeconds)}`
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
        label: `${def.name} · ${this.hooks.entityDistance(entity).toFixed(1)} m`,
        searching: !entity.searched && this.hooks.searching(entity),
        searchLabel: entity.searched || this.hooks.searching(entity) ? undefined : secs(searchTime(def)),
        grids: searchedGrids,
      };
    });
    const skills = [...this.inv.registry.skills.values()].map((definition): SkillViewModel => {
      const level = character.skills[definition.id] ?? 0;
      const practice = character.practice[definition.id] ?? 0;
      const nextLevelPractice = practiceForNextLevel(level);
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
      weight: kg(this.inv.carriedWeight()),
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
    return specs.map((spec, i) => ({
      label: `${spec.name ?? 'pocket'} · ${secs(spec.handlingSimSeconds)}`,
      grid: this.gridViewModel(
        { w: spec.grid[0], h: spec.grid[1] },
        owner.pockets?.[i] ?? [],
        `pocket:${owner.uid}:${i}`,
      ),
    }));
  }

  private gridViewModel(size: GridSize, placed: readonly Placed[], target: string): GridViewModel {
    return {
      target,
      width: size.w * CELL,
      height: size.h * CELL,
      items: placed.map(({ item, x, y, rotated }) => {
        const [w, h] = footprint(defOf(this.inv.registry, item.type), rotated);
        return this.itemViewModel(item, h > w ? 'inv-item inv-item-tall' : 'inv-item', {
          left: `${x * CELL + 1}px`,
          top: `${y * CELL + 1}px`,
          width: `${w * CELL - 2}px`,
          height: `${h * CELL - 2}px`,
        });
      }),
    };
  }

  private itemViewModel(item: Item, className: string, style?: Record<string, string>): ItemViewModel {
    const def = defOf(this.inv.registry, item.type);
    this.byUid.set(item.uid, item);
    this.order.push(item);
    return {
      item,
      uid: String(item.uid),
      className: `${className} cat-${def.category}${item === this.selected ? ' selected' : ''}`,
      title: `${def.name}${item.count > 1 ? ` ×${item.count}` : ''}, ${conditionWord(item.condition)}`,
      name: workName(this.inv.registry, item),
      count: item.count > 1 ? `×${item.count}` : undefined,
      style: style
        ? Object.entries(style)
            .map(([key, value]) => `${key}: ${value}`)
            .join('; ')
        : undefined,
    };
  }

  private detailsViewModel(): DetailsViewModel {
    const item = this.selected && this.inv.locate(this.selected) ? this.selected : undefined;
    if (!item) {
      return { empty: true, lines: [], options: [] };
    }
    const def = defOf(this.inv.registry, item.type);
    return {
      item,
      empty: false,
      category: def.category,
      name: `${workName(this.inv.registry, item)}${item.count > 1 ? ` ×${item.count}` : ''}`,
      condition: conditionWord(item.condition),
      description: def.description,
      lines: this.inspect(item),
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
                    ? craftTime(option.duration)
                    : secs(option.plan.time),
                ...optionAction(option),
              }
            : { label: option.label, button: false, reason: option.plan.reason.toLowerCase() },
      ),
    };
  }

  private inspect(item: Item): string[] {
    const def = defOf(this.inv.registry, item.type);
    const lines = [
      `${kg(weightOf(this.inv.registry, item))} · ${def.size[0]} × ${def.size[1]} cells · condition ${Math.round(item.condition * 100)}%`,
    ];
    if (item.work) {
      lines.push(
        item.work.kind === 'craft'
          ? `Recipe: ${item.work.recipe}`
          : `Taking apart: ${defOf(this.inv.registry, item.work.source).name}`,
        `Progress: ${item.work.elapsed.toFixed(1)} / ${item.work.duration.toFixed(1)} game seconds`,
      );
    }
    if (def.stack) {
      lines.push(`Stacks up to ${def.stack}`);
    }
    if (def.twoHanded) {
      lines.push('Needs both hands');
    }
    if (def.food) {
      lines.push(`${def.food.calories} kcal · ${def.food.water} ml water`);
    }
    if (def.tool) {
      lines.push(
        Object.entries(def.tool.qualities)
          .map(([q, level]) => `${q} ${level}`)
          .join(' · '),
      );
    }
    if (def.weapon) {
      const m = def.weapon.melee;
      lines.push(`Melee ${m.damage} ${m.type} · reach ${m.reach} m beyond hand · ${m.cooldownSimSeconds} s a swing`);
    }
    if (def.light) {
      lines.push(`Lights ${def.light.radius} m · seen from ${def.light.seenFrom} m`);
    }
    if (def.wearable) {
      lines.push(`Worn on the ${def.wearable.slot} · encumbrance ${def.wearable.encumbrance}`);
    }
    lines.push(...this.hooks.describe(item));
    if (def.container) {
      lines.push(`Pockets: ${def.container.pockets.map((p) => `${p.grid[0]} × ${p.grid[1]}`).join(', ')}`);
    }
    return lines;
  }

  private renderQueue(): void {
    const queueRoot = this.root.querySelector<HTMLElement>('.inv-queue');
    if (queueRoot) {
      render(queueTemplate(this.queue), queueRoot);
    }
  }

  // ---- drag and drop ----

  private pointerDown(e: PointerEvent): void {
    const refusal = this.hooks.actionRefusal?.();
    if (refusal) {
      this.refuse(refusal);
      return;
    }
    const node = (e.target as HTMLElement).closest<HTMLElement>('[data-uid]');
    const item = node ? this.byUid.get(Number(node.dataset.uid)) : undefined;
    if (!(node && item) || e.button !== 0) {
      return;
    }
    e.preventDefault();
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
    this.drag = {
      item,
      grab: [Math.min(e.clientX - rect.left, CELL / 2), Math.min(e.clientY - rect.top, CELL / 2)],
      rotated,
      start: [e.clientX, e.clientY],
      moved: false,
    };
    this.drawn = '';
    this.update();
  }

  private pointerMove(e: PointerEvent): void {
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
    const { drag } = this;
    if (!drag) {
      return;
    }
    if (drag.moved) {
      this.hover(e.clientX, e.clientY, e.clientX - drag.grab[0], e.clientY - drag.grab[1]);
      const { hover } = drag;
      if (hover?.ok) {
        this.report(this.tryQueue(drag.item, hover.target));
      } else if (hover) {
        this.refuse(hover.reason);
      }
    }
    this.endDrag();
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
    const [w, h] = footprint(defOf(this.inv.registry, drag.item.type), drag.rotated);
    render(
      html`<div
        class=${`inv-ghost cat-${defOf(this.inv.registry, drag.item.type).category}`}
        style=${`left: ${drag.position[0]}px; top: ${drag.position[1]}px; width: ${w * CELL - 2}px; height: ${h * CELL - 2}px`}
        >${this.inv.name(drag.item)}</div
      >`,
      this.dragRoot,
    );
  }

  private clearPreview(): void {
    for (const node of this.root.querySelectorAll<HTMLElement>('.drop-ok, .drop-no')) {
      node.classList.remove('drop-ok', 'drop-no');
      for (const property of ['--preview-left', '--preview-top', '--preview-width', '--preview-height']) {
        node.style.removeProperty(property);
      }
    }
  }

  /** Whether the dragged item can go to a target, and why not. */
  private dropCheck(item: Item, spec: string, target: Target): { ok: boolean; reason: string } {
    if (spec.startsWith('worn:') && defOf(this.inv.registry, item.type).wearable?.slot !== spec.slice(5)) {
      return { ok: false, reason: "It isn't worn there" };
    }
    const plan = this.inv.plan(item, target);
    return plan.ok ? { ok: true, reason: '' } : { ok: false, reason: plan.reason };
  }

  /** Works out the drop target under the pointer and previews it. */
  private hover(px: number, py: number, left: number, top: number): void {
    const drag = this.drag!;
    this.clearPreview();
    drag.hover = undefined;
    const zone = document
      .elementsFromPoint(px, py)
      .map((n) => (n as HTMLElement).closest<HTMLElement>('[data-target]'))
      .find((n) => n !== null && this.root.contains(n));
    if (!zone) {
      return;
    }
    const spec = zone.dataset.target!;
    const rect = zone.getBoundingClientRect();
    const spot = {
      x: Math.round((left - rect.left) / CELL),
      y: Math.round((top - rect.top) / CELL),
      rotated: drag.rotated,
    };
    const target = this.targetFrom(spec, spot);
    if (!target) {
      return;
    }
    const { ok, reason } = this.dropCheck(drag.item, spec, target);
    drag.hover = { target, ok, reason };
    zone.classList.add(ok ? 'drop-ok' : 'drop-no');
    if (spec.startsWith('pocket:') || spec.startsWith('pile:') || spec.startsWith('furniture:')) {
      const [w, h] = footprint(defOf(this.inv.registry, drag.item.type), drag.rotated);
      zone.style.setProperty('--preview-left', `${spot.x * CELL}px`);
      zone.style.setProperty('--preview-top', `${spot.y * CELL}px`);
      zone.style.setProperty('--preview-width', `${w * CELL}px`);
      zone.style.setProperty('--preview-height', `${h * CELL}px`);
    }
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
