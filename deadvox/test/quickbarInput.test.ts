import { describe, expect, it } from 'vitest';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { HUD_HINTS_HOLD_MS, INPUT_BINDINGS } from '../src/game/inputBindings.ts';
import { PressHoldInput } from '../src/game/pressHoldInput.ts';
import { QuickbarInput } from '../src/game/quickbarInput.ts';

const fixture = () => {
  const taps: number[] = [];
  const holds: number[] = [];
  return {
    taps,
    holds,
    input: new QuickbarInput({ tap: (slot) => taps.push(slot), hold: (slot) => holds.push(slot) }),
  };
};
describe('quickbar gesture admission', () => {
  it('dispatches a quick release as a tap only', () => {
    const { input, taps, holds } = fixture();
    input.keyDown(2, 10);
    input.keyUp(2, 10);
    expect(taps).toEqual([2]);
    expect(holds).toEqual([]);
  });
  it('dispatches a held slot once, even when release follows the hold update', () => {
    const { input, taps, holds } = fixture();
    input.keyDown(1, 0);
    input.update(Number.MAX_VALUE);
    input.keyUp(1, Number.MAX_VALUE);
    expect(taps).toEqual([]);
    expect(holds).toEqual([1]);
  });
  it('toggles interaction hints only after one second of the registry hold using simulated timestamps', () => {
    const action = 'hud.toggle-interaction-hints';
    const binding = INPUT_BINDINGS.find(({ id }) => id === action);
    expect(HUD_HINTS_HOLD_MS).toBe(1000);
    expect(binding?.holdMs).toBe(HUD_HINTS_HOLD_MS);
    const toggles: string[] = [];
    const input = new PressHoldInput<string>({
      holdRealMs: () => binding?.holdMs ?? 0,
      tap: () => undefined,
      hold: (heldAction) => toggles.push(heldAction),
    });
    input.keyDown(action, 20);
    input.update(20 + HUD_HINTS_HOLD_MS - 1);
    input.keyUp(action, 20 + HUD_HINTS_HOLD_MS - 1);
    expect(toggles).toEqual([]);
    input.keyDown(action, 50);
    input.update(50 + HUD_HINTS_HOLD_MS);
    input.update(50 + HUD_HINTS_HOLD_MS * 2);
    input.keyUp(action, 50 + HUD_HINTS_HOLD_MS * 2);
    expect(toggles).toEqual([action]);
  });
  it('classifies T release below the authored stance threshold as a tap and the boundary as a drop', () => {
    const holdMs = BUNDLED_CONTENT.registry.senses.get('player')!.light.throwStanceDropHoldRealSeconds * 1000;
    const actions: string[] = [];
    const input = new PressHoldInput<string>({
      holdRealMs: () => holdMs,
      tap: () => actions.push('stance-toggle'),
      hold: () => actions.push('drop'),
    });

    input.keyDown('player.throw', 0);
    input.update(holdMs - 1);
    input.keyUp('player.throw', holdMs - 1);
    expect(actions).toEqual(['stance-toggle']);

    input.keyDown('player.throw', holdMs + 10);
    input.update(holdMs * 2 + 10);
    input.keyUp('player.throw', holdMs * 2 + 10);
    expect(actions).toEqual(['stance-toggle', 'drop']);
  });

  it('cancels a held gesture without dispatching when input is lost', () => {
    const { input, taps, holds } = fixture();
    input.keyDown(0, 0);
    input.cancel();
    input.keyUp(0, Number.MAX_VALUE);
    expect(taps).toEqual([]);
    expect(holds).toEqual([]);
  });
});
