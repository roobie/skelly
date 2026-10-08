import { describe, expect, it } from 'vitest';
import { applyToHeldItem, PlayerTickActions } from '../src/game/playerTickActions.ts';

describe('PlayerTickActions', () => {
  it('does not throw a different item drawn into the recorded hand', () => {
    const hands: { left: { uid: number } | undefined; right: { uid: number } | undefined } = {
      left: { uid: 41 },
      right: undefined,
    };
    const events: string[] = [];
    const actions = new PlayerTickActions();
    actions.enqueue(() => {
      hands.left = { uid: 42 };
      events.push('draw:42');
    });
    actions.enqueue(() => {
      applyToHeldItem(hands, 'left', 41, (item) => events.push(`throw:${item.uid}`));
    });

    actions.applyAtNextTick();

    expect(events).toEqual(['draw:42']);
    expect(hands.left?.uid).toBe(42);
  });
  it('applies a deferred throw before a same-sample drop selects the remaining hand', () => {
    const actions = new PlayerTickActions();
    const hands: { left: string | undefined; right: string | undefined } = {
      left: 'off-hand item',
      right: 'main-hand item',
    };
    const events: string[] = [];

    actions.enqueue(() => {
      const item = hands.left ?? hands.right;
      if (!item) {
        throw new Error('No held item to throw');
      }
      hands.left = undefined;
      events.push(`throw:${item}`);
    });
    actions.enqueue(() => {
      const side = hands.left ? 'left' : 'right';
      const item = hands[side];
      if (!item) {
        return;
      }
      hands[side] = undefined;
      events.push(`drop:${item}`);
    });

    expect(events).toEqual([]);
    expect(hands).toEqual({ left: 'off-hand item', right: 'main-hand item' });

    actions.applyAtNextTick();

    expect(events).toEqual(['throw:off-hand item', 'drop:main-hand item']);
    expect(hands).toEqual({ left: undefined, right: undefined });
  });
});
