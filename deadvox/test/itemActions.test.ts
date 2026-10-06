import { describe, expect, it } from 'vitest';
import { defaultItemAction, ItemActionSelection, type ItemAction } from '../src/game/itemActions.ts';

const actions: readonly ItemAction[] = [
  { id: 'damaged-nonbleeding', label: 'nonbleeding', priority: { bleeding: false, damage: 90 } },
  { id: 'less-damaged-bleeding', label: 'bleeding', priority: { bleeding: true, damage: 10 } },
  { id: 'more-damaged-bleeding', label: 'bleeding and damaged', priority: { bleeding: true, damage: 20 } },
];

const item = { uid: 7 };

describe('selected item actions', () => {
  it('defaults to bleeding before damage, then the more damaged region', () => {
    expect(defaultItemAction(actions)?.id).toBe('more-damaged-bleeding');
  });

  it('cycles and wraps without changing the default policy', () => {
    const selection = new ItemActionSelection();
    expect(selection.forItem(item, actions)?.id).toBe('more-damaged-bleeding');
    expect(selection.step(item, actions, 1)).toBe(true);
    const afterStep = selection.forItem(item, actions);
    expect(afterStep).toBe(actions[0]);
    expect(selection.step(item, actions, -1)).toBe(true);
    expect(selection.forItem(item, actions)?.id).toBe('more-damaged-bleeding');
  });
});
