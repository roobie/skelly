// The spawn menu (G, with ?debug=1): a development tool that makes any item in the
// content and drops it at your feet, for looking at models and trying things out
// without hunting through the hamlet's furniture.

import { html, render, type TemplateResult } from 'lit-html';
import type { Registry } from '../core/content.ts';
import { WORK_IN_PROGRESS } from '../core/inventory.ts';
import { installSearchInputKeyboardBoundary } from './searchInputKeyboard.ts';

const WHITESPACE = /\s+/;

interface SpawnMenuItem {
  readonly id: string;
  readonly name: string;
  /** "category" or "category, model". */
  readonly meta: string;
}

export interface SpawnMenuViewModel {
  readonly filter: string;
  readonly status: string;
  readonly selectedIndex: number;
  /** Matching the filter's words against name, id and category; category then name. */
  readonly items: readonly SpawnMenuItem[];
}

/** Every item whose name, id or category contains each word of the filter. */
export const spawnMenuViewModel = (
  registry: Registry,
  filter: string,
  status: string,
  selectedIndex = 0,
): SpawnMenuViewModel => {
  const words = filter.toLowerCase().split(WHITESPACE).filter(Boolean);
  const items = [...registry.items.values()]
    .filter((def) => def.id !== WORK_IN_PROGRESS)
    .filter((def) => words.every((w) => `${def.name} ${def.id} ${def.category}`.toLowerCase().includes(w)))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .map((def) => ({ id: def.id, name: def.name, meta: `${def.category}${def.model ? ', model' : ''}` }));
  return { filter, status, selectedIndex: Math.min(selectedIndex, Math.max(0, items.length - 1)), items };
};

interface SpawnMenuActions {
  onFilter: (value: string) => void;
  onSpawn: (id: string) => void;
}

const spawnMenuTemplate = (vm: SpawnMenuViewModel, actions: SpawnMenuActions): TemplateResult => html`
  <div class="card">
    <h2>Spawn an item</h2>
    <p>Drops it at your feet. Press Tab to close.</p>
    <input
      type="search"
      placeholder="Filter by name, id or category"
      .value=${vm.filter}
      @input=${(e: Event) => actions.onFilter((e.target as HTMLInputElement).value)}
    />
    <div class="spawn-list">
      ${vm.items.map(
        (item, index) => html`
          <button
            type="button"
            data-spawn-item=${item.id}
            class=${index === vm.selectedIndex ? 'selected' : ''}
            aria-current=${index === vm.selectedIndex ? 'true' : 'false'}
            @click=${() => actions.onSpawn(item.id)}
          >
            <span>${item.name}</span>
            <span>${item.meta}</span>
          </button>
        `,
      )}
    </div>
    <p class="spawn-status">${vm.status}</p>
  </div>
`;

export class SpawnMenu {
  private root: HTMLElement | undefined;
  private opened = false;
  private readonly registry: Registry;
  private readonly spawn: (type: string) => string;
  private readonly drawTemplate: (template: TemplateResult, root: HTMLElement) => void;
  private filter = '';
  private status = '';
  private selectedIndex = 0;
  private drawn = '';

  /** `spawn` makes one of the item type and says what happened. */
  constructor(
    registry: Registry,
    spawn: (type: string) => string,
    drawTemplate: (template: TemplateResult, root: HTMLElement) => void = render,
  ) {
    this.registry = registry;
    this.spawn = spawn;
    this.drawTemplate = drawTemplate;
    installSearchInputKeyboardBoundary((target) => this.opened && target === this.root?.querySelector('input'));
  }

  get isOpen(): boolean {
    return this.opened;
  }

  setRoot(root: HTMLElement): void {
    this.root = root;
    this.root.hidden = !this.opened;
    if (this.opened) {
      this.render();
      this.focusInput();
    }
  }

  open(): void {
    this.opened = true;
    if (this.root) {
      this.root.hidden = false;
    }
    this.filter = '';
    this.status = '';
    this.selectedIndex = 0;
    this.drawn = '';
    this.render();
    const input = this.root?.querySelector('input');
    if (input) {
      input.value = this.filter;
      input.focus();
    }
  }

  close(): void {
    this.opened = false;
    this.root?.querySelector('input')?.blur();
    if (this.root) {
      this.root.hidden = true;
    }
  }

  /** Keyboard commands are handled here; other open-menu keys remain available to the search field. */
  handleKey(event: KeyboardEvent): boolean {
    if (event.key === 'Tab') {
      event.preventDefault();
      this.close();
      return true;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const { items, selectedIndex } = this.viewModel;
      if (items.length > 0) {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        this.selectedIndex = Math.max(0, Math.min(items.length - 1, selectedIndex + direction));
        this.render();
        [...(this.root?.querySelectorAll<HTMLButtonElement>('[data-spawn-item]') ?? [])]
          .find((button) => button.dataset.spawnItem === items[this.selectedIndex]?.id)
          ?.scrollIntoView({ block: 'nearest' });
      }
      return true;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const { items, selectedIndex } = this.viewModel;
      const selected = items[selectedIndex];
      if (selected) {
        this.spawn(selected.id);
        this.close();
      }
      return true;
    }
    return false;
  }

  private focusInput(): void {
    this.root?.querySelector<HTMLInputElement>('input')?.focus();
  }

  get viewModel(): SpawnMenuViewModel {
    return spawnMenuViewModel(this.registry, this.filter, this.status, this.selectedIndex);
  }

  /** Redraws when the filter or the status changed. */
  private render(): void {
    if (!this.root) {
      return;
    }
    const key = `${this.filter}|${this.status}|${this.selectedIndex}`;
    if (key === this.drawn) {
      return;
    }
    this.drawn = key;
    this.drawTemplate(
      spawnMenuTemplate(this.viewModel, {
        onFilter: (value) => {
          this.filter = value;
          this.selectedIndex = 0;
          this.render();
        },
        onSpawn: (id) => {
          this.status = this.spawn(id);
          this.render();
        },
      }),
      this.root,
    );
  }
}
