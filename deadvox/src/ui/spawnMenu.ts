// The spawn menu (G, with ?debug=1): a development tool that makes any item in the
// content and drops it at your feet, for looking at models and trying things out
// without hunting through the hamlet's furniture.

import type { Registry } from '../core/content.ts';

const WHITESPACE = /\s+/;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
};

export class SpawnMenu {
  private readonly filter = el('input');
  private readonly list = el('div');
  private readonly status = el('p');
  private readonly root: HTMLElement;
  private readonly registry: Registry;
  private readonly spawn: (type: string) => string;

  /** `spawn` makes one of the item type and says what happened. */
  constructor(root: HTMLElement, registry: Registry, spawn: (type: string) => string) {
    this.root = root;
    this.registry = registry;
    this.spawn = spawn;
    const card = el('div');
    card.className = 'card';
    this.filter.type = 'search';
    this.filter.placeholder = 'Filter by name, id or category';
    this.filter.addEventListener('input', () => this.render());
    this.list.className = 'spawn-list';
    this.status.className = 'spawn-status';
    card.append(
      el('h2', 'Spawn an item'),
      el('p', 'Drops it at your feet. Esc or G closes.'),
      this.filter,
      this.list,
      this.status,
    );
    root.replaceChildren(card);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
    this.render();
    this.filter.focus();
    this.filter.select();
  }

  close(): void {
    this.root.hidden = true;
  }

  private render(): void {
    const words = this.filter.value.toLowerCase().split(WHITESPACE).filter(Boolean);
    const items = [...this.registry.items.values()]
      .filter((def) => words.every((w) => `${def.name} ${def.id} ${def.category}`.toLowerCase().includes(w)))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    this.list.replaceChildren(
      ...items.map((def) => {
        const button = el('button');
        button.type = 'button';
        button.append(el('span', def.name), el('span', `${def.category}${def.model ? ', model' : ''}`));
        button.addEventListener('click', () => {
          this.status.textContent = this.spawn(def.id);
        });
        return button;
      }),
    );
  }
}
