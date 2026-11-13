import { describe, expect, it } from 'vitest';
import { defaultItemAction, ItemActionSelection } from '../src/game/itemActions.ts';
import type { ItemAction } from '../src/inventory.ts';

const sameTier: readonly ItemAction[] = [
  { id: 'damaged-nonbleeding', label: 'nonbleeding', priority: { bleeding: 0, damage: 90 } },
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

  it('applies a choice only to its item during its own use, even when that use throws', () => {
    const selection = new ItemActionSelection();
    const chosen = actions[0]!;
    expect(
      selection.choose(item, chosen, () => [selection.forItem(item, actions), selection.forItem({ uid: 8 }, actions)]),
    ).toEqual([chosen, defaultItemAction(actions)]);
    expect(selection.forItem(item, actions)).toBe(defaultItemAction(actions));
    expect(() =>
      selection.choose(item, chosen, () => {
        throw new Error('fixture use failed');
      }),
    ).toThrow();
    expect(selection.forItem(item, actions)).toBe(defaultItemAction(actions));
  });
});
