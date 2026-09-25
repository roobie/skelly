// The inventory screen (DESIGN.md, "Inventory screen"): what you hold and wear, with
// each pocket drawn as its grid, and the piles and furniture within reach. Items move
// by drag and drop, with the cells where they'd go previewed, or by keys. Every move
// goes through the handling queue, so it takes real seconds while the world keeps
// running. Furniture shows its contents once it has been searched.

import { type BlockEntity, searchTime } from '../core/blockEntities.ts';
import type { Vec3 } from '../core/coords.ts';
import type { HandlingQueue } from '../core/handling.ts';
import { type Inventory, PILE_GRID, type Pile, sameGrid, spotOf, type Target } from '../core/inventory.ts';
import { conditionWord, defOf, footprint, type GridSize, type Item, type Placed, weightOf } from '../core/items.ts';
import type { WearSlot } from '../core/schema.ts';
import { bestPocket, dropTarget, options, toHands } from '../game/targets.ts';

/** Pixels per inventory cell. */
export const CELL = 32;

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
  /** The air block at the player's feet, where drops land. */
  feet: () => Vec3;
  /** Piles within reach. */
  nearby: () => Pile[];
  /** Distance in metres from the player to a pile. */
  distance: (pile: Pile) => number;
  /** Furniture with pockets within reach, nearest first. */
  containers: () => BlockEntity[];
  /** Distance in metres from the player to a piece of furniture. */
  entityDistance: (entity: BlockEntity) => number;
  /** Queues a search of a container; says why not, or undefined. */
  search: (entity: BlockEntity) => string | undefined;
  /** Whether a search of it is queued. */
  searching: (entity: BlockEntity) => boolean;
  notice: (text: string) => void;
  /** Assigns a quickbar slot (0–4). */
  assign: (slot: number, item: Item) => void;
}

interface Drag {
  item: Item;
  /** Pointer offset from the item's top-left corner, in px. */
  grab: [number, number];
  rotated: boolean;
  start: [number, number];
  moved: boolean;
  ghost?: HTMLElement | undefined;
  hover?: { target: Target; ok: boolean; reason: string } | undefined;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};

const QUICK_DIGIT = /^Digit([1-5])$/;
const secs = (s: number) => `${s.toFixed(1)} s`;
const kg = (g: number) => `${(g / 1000).toFixed(2)} kg`;

export class InventoryScreen {
  selected: Item | undefined;
  private readonly root: HTMLElement;
  private readonly inv: Inventory;
  private readonly queue: HandlingQueue;
  private readonly hooks: ScreenHooks;
  private readonly byUid = new Map<number, Item>();
  private readonly entityByUid = new Map<number, BlockEntity>();
  private order: Item[] = [];
  private drawn = '';
  private drag: Drag | undefined;
  private queueBox: HTMLElement | undefined;

  constructor(root: HTMLElement, inv: Inventory, queue: HandlingQueue, hooks: ScreenHooks) {
    this.root = root;
    this.inv = inv;
    this.queue = queue;
    this.hooks = hooks;
    root.addEventListener('pointerdown', (e) => this.pointerDown(e));
    globalThis.addEventListener('pointermove', (e) => this.pointerMove(e));
    globalThis.addEventListener('pointerup', (e) => this.pointerUp(e));
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
    document.body.classList.add('inventory-open');
    this.drawn = '';
    this.update();
  }

  close(): void {
    this.root.hidden = true;
    document.body.classList.remove('inventory-open');
    this.endDrag();
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
      .map((e) => e.uid)
      .join(',');
    const key = `${this.inv.version}|${this.inv.entities.version}|${this.selected?.uid}|${piles}|${containers}|${this.queue.jobs.length}`;
    if (key !== this.drawn) {
      this.drawn = key;
      this.render();
    }
    this.renderQueue();
  }

  /** Handles a key while the screen is open. Returns true if it was used. */
  onKey(e: KeyboardEvent): boolean {
    if (this.drag?.moved && e.code === 'KeyR') {
      this.drag.rotated = !this.drag.rotated;
      this.drag.grab = [CELL / 2, CELL / 2];
      this.sizeGhost();
      return true;
    }
    const digit = QUICK_DIGIT.exec(e.code);
    const item = this.selected;
    if (e.code === 'KeyX') {
      this.queue.cancel();
      return true;
    }
    if (e.code.startsWith('Arrow')) {
      this.step(e.code === 'ArrowDown' || e.code === 'ArrowRight' ? 1 : -1);
      return true;
    }
    if (e.code === 'KeyS') {
      const next = this.hooks.containers().find((c) => !(c.searched || this.hooks.searching(c)));
      this.report(next ? this.hooks.search(next) : 'Nothing here to search');
      return true;
    }
    if (!item) {
      return false;
    }
    if (digit) {
      this.hooks.assign(Number(digit[1]) - 1, item);
      return true;
    }
    switch (e.code) {
      case 'KeyH':
        this.report(toHands(this.inv, this.queue, item, this.hooks.feet()));
        return true;
      case 'KeyW':
        this.wearOrTakeOff(item);
        return true;
      case 'KeyD':
        this.tryQueue(item, dropTarget(this.inv, item, this.hooks.feet()).target);
        return true;
      case 'KeyR':
        this.rotateInPlace(item);
        return true;
      case 'Enter':
      case 'KeyE': {
        const best = bestPocket(this.inv, item);
        this.report(best ? this.tryQueue(item, best.target) : 'No room on you');
        return true;
      }
      case 'KeyA':
        this.takeAllLike(item);
        return true;
      default:
        return false;
    }
  }

  // ---- actions ----

  private tryQueue(item: Item, target: Target, count = item.count): string | undefined {
    const result = this.queue.enqueue(item, target, count);
    this.drawn = '';
    return result.ok ? undefined : result.reason;
  }

  private report(reason: string | undefined): void {
    if (reason) {
      this.hooks.notice(reason);
    }
  }

  private wearOrTakeOff(item: Item): void {
    if (this.inv.locate(item)?.kind === 'worn') {
      this.report(toHands(this.inv, this.queue, item, this.hooks.feet()));
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
        if (best && this.queue.enqueue(other, best.target).ok) {
          queued += 1;
        }
      }
    }
    this.hooks.notice(queued > 0 ? `Taking ${queued} ${category} items` : `No ${category} items to take`);
  }

  private step(dir: number): void {
    if (this.order.length === 0) {
      return;
    }
    const at = this.selected ? this.order.indexOf(this.selected) : -1;
    this.selected = this.order[(at + dir + this.order.length) % this.order.length];
  }

  // ---- drawing ----

  private render(): void {
    this.byUid.clear();
    this.entityByUid.clear();
    this.order = [];
    const head = el('header', 'inv-head');
    head.append(
      el('h2', '', 'Inventory'),
      el('span', 'inv-weight', `Carrying ${kg(this.inv.carriedWeight())}`),
      el(
        'span',
        'inv-help',
        'Drag items · H hands · W wear · D drop · E take · R rotate · S search · 1–5 quickbar · X cancel · Tab close',
      ),
    );
    const body = el('div', 'inv-body');
    body.append(this.youPane(), this.aroundPane(), this.details());
    this.queueBox = el('footer', 'inv-queue');
    this.root.replaceChildren(head, body, this.queueBox);
    this.renderQueue();
  }

  private youPane(): HTMLElement {
    const pane = el('section', 'inv-pane');
    pane.append(el('h3', '', 'You'));
    const hands = el('div', 'inv-hands');
    for (const side of ['right', 'left'] as const) {
      const slot = el('div', 'inv-slot');
      slot.dataset.target = `hand:${side}`;
      slot.append(el('span', 'inv-slot-label', `${side === 'right' ? 'Right' : 'Left'} hand`));
      const held = this.inv.hands[side];
      if (held) {
        slot.append(this.slotItem(held));
      }
      hands.append(slot);
    }
    pane.append(hands);
    const slots = new Set<WearSlot>([...SHOWN_SLOTS, ...(Object.keys(this.inv.worn) as WearSlot[])]);
    for (const slot of slots) {
      pane.append(this.wornBlock(slot));
    }
    return pane;
  }

  private wornBlock(slot: WearSlot): HTMLElement {
    const block = el('div', 'inv-worn');
    const row = el('div', 'inv-slot inv-slot-worn');
    row.dataset.target = `worn:${slot}`;
    row.append(el('span', 'inv-slot-label', SLOT_LABEL[slot]));
    const item = this.inv.worn[slot];
    if (item) {
      row.append(this.slotItem(item));
    }
    block.append(row);
    if (item) {
      block.append(this.pocketsOf(item));
    }
    return block;
  }

  private pocketsOf(owner: Item): HTMLElement {
    const wrap = el('div', 'inv-pockets');
    const specs = defOf(this.inv.registry, owner.type).container?.pockets ?? [];
    specs.forEach((spec, i) => {
      const box = el('div', 'inv-pocket');
      box.append(el('span', 'inv-pocket-label', `${spec.name ?? 'pocket'} · ${secs(spec.handling)}`));
      box.append(this.grid({ w: spec.grid[0], h: spec.grid[1] }, owner.pockets?.[i] ?? [], `pocket:${owner.uid}:${i}`));
      wrap.append(box);
    });
    return wrap;
  }

  private aroundPane(): HTMLElement {
    const pane = el('section', 'inv-pane');
    pane.append(el('h3', '', 'Around you'));
    const piles = this.hooks.nearby();
    const feet = this.hooks.feet();
    const hasFeet = piles.some((p) => p.pos.join(',') === feet.join(','));
    for (const pile of piles) {
      const box = el('div', 'inv-pile');
      box.append(el('div', 'inv-pile-label', `On the floor · ${this.hooks.distance(pile).toFixed(1)} m`));
      box.append(this.grid(PILE_GRID, pile.items, `pile:${pile.pos.join(',')}`));
      for (const placed of pile.items) {
        if (placed.item.pockets) {
          box.append(this.bagInPile(placed.item));
        }
      }
      pane.append(box);
    }
    if (!hasFeet) {
      const box = el('div', 'inv-pile');
      box.append(el('div', 'inv-pile-label', 'At your feet'));
      box.append(this.grid(PILE_GRID, [], `pile:${feet.join(',')}`));
      pane.append(box);
    }
    for (const entity of this.hooks.containers()) {
      pane.append(this.container(entity));
    }
    return pane;
  }

  /** A piece of furniture: its pockets once searched, or a button to search it. */
  private container(entity: BlockEntity): HTMLElement {
    this.entityByUid.set(entity.uid, entity);
    const def = this.inv.entities.defOf(entity);
    const box = el('div', 'inv-pile');
    box.append(el('div', 'inv-pile-label', `${def.name} · ${this.hooks.entityDistance(entity).toFixed(1)} m`));
    if (entity.searched) {
      def.container?.pockets.forEach((spec, i) => {
        if (def.container!.pockets.length > 1 || spec.name) {
          box.append(el('span', 'inv-pocket-label', `${spec.name ?? `pocket ${i + 1}`} · ${secs(spec.handling)}`));
        }
        box.append(
          this.grid({ w: spec.grid[0], h: spec.grid[1] }, entity.pockets?.[i] ?? [], `furniture:${entity.uid}:${i}`),
        );
      });
      return box;
    }
    if (this.hooks.searching(entity)) {
      box.append(el('p', 'inv-muted', 'Searching…'));
      return box;
    }
    const button = el('button', 'inv-option');
    button.type = 'button';
    button.append(el('span', '', 'Search it (S)'), el('span', 'inv-time', secs(searchTime(def))));
    button.addEventListener('click', () => this.report(this.hooks.search(entity)));
    box.append(button);
    return box;
  }

  /** A bag lying on the floor shows its pockets, so it can be looted without picking it up. */
  private bagInPile(bag: Item): HTMLElement {
    const box = el('div', 'inv-bag');
    box.append(el('div', 'inv-pile-label', `${this.inv.name(bag)}, on the floor`));
    box.append(this.pocketsOf(bag));
    return box;
  }

  private grid(size: GridSize, placed: readonly Placed[], target: string): HTMLElement {
    const grid = el('div', 'inv-grid');
    grid.dataset.target = target;
    grid.style.width = `${size.w * CELL}px`;
    grid.style.height = `${size.h * CELL}px`;
    for (const p of placed) {
      grid.append(this.gridItem(p));
    }
    return grid;
  }

  private gridItem(p: Placed): HTMLElement {
    const [w, h] = footprint(defOf(this.inv.registry, p.item.type), p.rotated);
    const node = this.itemNode(p.item, h > w ? 'inv-item inv-item-tall' : 'inv-item');
    node.style.left = `${p.x * CELL + 1}px`;
    node.style.top = `${p.y * CELL + 1}px`;
    node.style.width = `${w * CELL - 2}px`;
    node.style.height = `${h * CELL - 2}px`;
    return node;
  }

  private slotItem(item: Item): HTMLElement {
    return this.itemNode(item, 'inv-item inv-item-slot');
  }

  private itemNode(item: Item, className: string): HTMLElement {
    const def = defOf(this.inv.registry, item.type);
    const node = el('div', `${className} cat-${def.category}${item === this.selected ? ' selected' : ''}`);
    node.dataset.uid = String(item.uid);
    node.title = `${def.name}${item.count > 1 ? ` ×${item.count}` : ''}, ${conditionWord(item.condition)}`;
    node.append(el('span', 'inv-item-name', def.name));
    if (item.count > 1) {
      node.append(el('span', 'inv-item-count', `×${item.count}`));
    }
    this.byUid.set(item.uid, item);
    this.order.push(item);
    return node;
  }

  private details(): HTMLElement {
    const box = el('aside', 'inv-details');
    const item = this.selected && this.inv.locate(this.selected) ? this.selected : undefined;
    if (!item) {
      box.append(el('p', 'inv-muted', 'Pick an item to see what it is and where it can go.'));
      return box;
    }
    const def = defOf(this.inv.registry, item.type);
    box.append(
      el('div', 'inv-kicker', def.category),
      el('h3', '', `${def.name}${item.count > 1 ? ` ×${item.count}` : ''}`),
      el('div', 'inv-condition', conditionWord(item.condition)),
    );
    if (def.description) {
      box.append(el('p', 'inv-muted', def.description));
    }
    box.append(el('div', 'inv-kicker', 'Inspect'));
    for (const line of this.inspect(item)) {
      box.append(el('div', 'inv-line', line));
    }
    box.append(el('div', 'inv-kicker', 'Where it can go'));
    for (const option of options(this.inv, item, this.hooks.feet())) {
      if (option.plan.ok) {
        const button = el('button', 'inv-option');
        button.type = 'button';
        button.append(el('span', '', option.label), el('span', 'inv-time', secs(option.plan.time)));
        const { target } = option;
        button.addEventListener('click', () => this.report(this.tryQueue(item, target)));
        box.append(button);
      } else {
        const row = el('div', 'inv-option inv-option-no');
        row.append(el('span', '', option.label), el('span', 'inv-reason', option.plan.reason.toLowerCase()));
        box.append(row);
      }
    }
    return box;
  }

  private inspect(item: Item): string[] {
    const def = defOf(this.inv.registry, item.type);
    const lines = [
      `${kg(weightOf(this.inv.registry, item))} · ${def.size[0]} × ${def.size[1]} cells · condition ${Math.round(item.condition * 100)}%`,
    ];
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
      lines.push(`Melee ${m.damage} ${m.type} · reach ${m.reach} m · ${m.cooldown} s a swing`);
    }
    if (def.light) {
      lines.push(`Lights ${def.light.radius} m · seen from ${def.light.seenFrom} m`);
    }
    if (def.wearable) {
      lines.push(`Worn on the ${def.wearable.slot} · encumbrance ${def.wearable.encumbrance}`);
    }
    if (def.container) {
      lines.push(`Pockets: ${def.container.pockets.map((p) => `${p.grid[0]} × ${p.grid[1]}`).join(', ')}`);
    }
    return lines;
  }

  private renderQueue(): void {
    const box = this.queueBox;
    if (!box) {
      return;
    }
    const rows = this.queue.jobs.map((job, i) => {
      const row = el('div', 'inv-job');
      const bar = el('span', 'inv-bar');
      const fill = el('span', 'inv-bar-fill');
      fill.style.width = `${Math.round((job.elapsed / Math.max(job.duration, 1e-6)) * 100)}%`;
      bar.append(fill);
      row.append(
        el('span', 'inv-job-n', String(i + 1)),
        el('span', 'inv-job-label', job.label),
        bar,
        el('span', 'inv-time', secs(job.duration)),
      );
      return row;
    });
    const title = el('div', 'inv-queue-title');
    title.append(
      el('strong', '', 'Doing next'),
      el(
        'span',
        'inv-muted',
        this.queue.busy
          ? `${secs(this.queue.remaining)} left · half speed, no sprinting · X cancels`
          : 'Nothing queued',
      ),
    );
    box.replaceChildren(title, ...rows);
  }

  // ---- drag and drop ----

  private pointerDown(e: PointerEvent): void {
    const node = (e.target as HTMLElement).closest<HTMLElement>('[data-uid]');
    const item = node ? this.byUid.get(Number(node.dataset.uid)) : undefined;
    if (!(node && item) || e.button !== 0) {
      return;
    }
    e.preventDefault();
    this.selected = item;
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
    if (!drag.moved) {
      drag.moved = true;
      drag.ghost = el(
        'div',
        `inv-ghost cat-${defOf(this.inv.registry, drag.item.type).category}`,
        this.inv.name(drag.item),
      );
      document.body.append(drag.ghost);
      this.sizeGhost();
    }
    const left = e.clientX - drag.grab[0];
    const top = e.clientY - drag.grab[1];
    drag.ghost!.style.left = `${left}px`;
    drag.ghost!.style.top = `${top}px`;
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
        this.hooks.notice(hover.reason);
      }
    }
    this.endDrag();
  }

  private endDrag(): void {
    this.drag?.ghost?.remove();
    this.drag = undefined;
    this.clearPreview();
  }

  private sizeGhost(): void {
    const { drag } = this;
    if (!drag?.ghost) {
      return;
    }
    const [w, h] = footprint(defOf(this.inv.registry, drag.item.type), drag.rotated);
    drag.ghost.style.width = `${w * CELL - 2}px`;
    drag.ghost.style.height = `${h * CELL - 2}px`;
  }

  private clearPreview(): void {
    for (const node of this.root.querySelectorAll('.inv-preview')) {
      node.remove();
    }
    for (const node of this.root.querySelectorAll('.drop-ok, .drop-no')) {
      node.classList.remove('drop-ok', 'drop-no');
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
    if (!(spec.startsWith('pocket:') || spec.startsWith('pile:') || spec.startsWith('furniture:'))) {
      zone.classList.add(ok ? 'drop-ok' : 'drop-no');
      return;
    }
    const [w, h] = footprint(defOf(this.inv.registry, drag.item.type), drag.rotated);
    const preview = el('div', `inv-preview ${ok ? 'drop-ok' : 'drop-no'}`);
    preview.style.left = `${spot.x * CELL}px`;
    preview.style.top = `${spot.y * CELL}px`;
    preview.style.width = `${w * CELL}px`;
    preview.style.height = `${h * CELL}px`;
    zone.append(preview);
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
