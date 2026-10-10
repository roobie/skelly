import { describe, expect, it } from 'vitest';
import { defaultItemAction, type ItemAction, ItemActionSelection } from '../src/game/itemActions.ts';

const sameTier: readonly ItemAction[] = [
  { id: 'damaged-nonbleeding', label: 'nonbleeding', priority: { bleeding: -1, damage: 90 } },
  { id: 'less-damaged-bleeding', label: 'bleeding', priority: { bleeding: 1, damage: 10 } },
  { id: 'more-damaged-bleeding', label: 'bleeding and damaged', priority: { bleeding: 1, damage: 20 } },
];
const actions: readonly ItemAction[] = [
  ...sameTier,
  { id: 'worse-bleeding', label: 'worse bleeding', priority: { bleeding: 2, damage: 5 } },
];

const item = { uid: 7 };

describe('selected item actions', () => {
  it('defaults to the worst bleeding before damage, then the more damaged region', () => {
    expect(defaultItemAction(actions)?.id).toBe('worse-bleeding');
    expect(defaultItemAction(sameTier)?.id).toBe('more-damaged-bleeding');
  });

  it('cycles and wraps without changing the default policy', () => {
    const selection = new ItemActionSelection();
    expect(selection.forItem(item, actions)?.id).toBe('worse-bleeding');
    expect(selection.step(item, actions, 1)).toBe(true);
    const afterStep = selection.forItem(item, actions);
    expect(afterStep).toBe(actions[0]);
    expect(selection.step(item, actions, -1)).toBe(true);
    expect(selection.forItem(item, actions)?.id).toBe('worse-bleeding');
  });
});
