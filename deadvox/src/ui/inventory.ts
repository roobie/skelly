// The inventory screen is plain HTML: CDDA-style dense panels are easier in the DOM
// than in a game UI toolkit, and content from mods shows up without code changes.

import type { Registry } from '../core/content.ts';
import { inventoryTotals, type Stack } from '../core/inventory.ts';

const kg = (grams: number) => `${(grams / 1000).toFixed(2)} kg`;
const litres = (ml: number) => `${(ml / 1000).toFixed(2)} L`;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: predates the complexity limit; split it up when next changed
export const renderInventory = (root: HTMLElement, stacks: Stack[], registry: Registry): void => {
  const totals = inventoryTotals(stacks, registry);
  const byCategory = new Map<string, Stack[]>();
  for (const stack of stacks) {
    const category = registry.items.get(stack.item)?.category ?? 'unknown';
    byCategory.set(category, [...(byCategory.get(category) ?? []), stack]);
  }

  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Item</th><th>Qty</th><th>Weight</th><th>Volume</th></tr></thead>';
  const body = table.createTBody();
  for (const [category, list] of [...byCategory].sort(([a], [b]) => a.localeCompare(b))) {
    const heading = body.insertRow();
    heading.className = 'category';
    const cell = heading.insertCell();
    cell.colSpan = 4;
    cell.textContent = category;
    for (const { item, count } of list) {
      const def = registry.items.get(item);
      const row = body.insertRow();
      if (def?.description) {
        row.title = def.description;
      }
      for (const text of [
        def?.name ?? `?? ${item}`,
        String(count),
        def ? kg(def.weight * count) : '',
        def ? litres(def.volume * count) : '',
      ]) {
        row.insertCell().textContent = text;
      }
    }
  }

  const summary = document.createElement('p');
  summary.className = 'totals';
  summary.textContent = `Carrying ${kg(totals.weight)}, ${litres(totals.volume)}`;

  const heading = document.createElement('h2');
  heading.textContent = 'Inventory';
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Tab to close';
  root.replaceChildren(heading, table, summary, hint);
};
