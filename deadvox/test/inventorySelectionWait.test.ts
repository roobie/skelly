// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { inventorySelectionChanged } from './browser/inventory-selection.ts';

afterEach(() => document.body.replaceChildren());

it('native inventory selection waits cannot settle before a selected UID actually changes', () => {
  const container = document.createElement('div');
  container.id = 'inventory';
  document.body.replaceChildren(container);
  expect(inventorySelectionChanged(null)).toBe(false);
  const row = document.createElement('div');
  row.classList.add('selected');
  row.setAttribute('data-uid', 'fixture-first');
  container.append(row);
  expect(inventorySelectionChanged(null)).toBe(true);
  expect(inventorySelectionChanged('fixture-first')).toBe(false);
  row.setAttribute('data-uid', 'fixture-next');
  expect(inventorySelectionChanged('fixture-first')).toBe(true);
});
