import { describe, expect, it } from 'vitest';
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();

import { BindingRegistry, INPUT_BINDINGS } from '../src/game/inputBindings.ts';
import { PressHoldInput } from '../src/game/pressHoldInput.ts';

const holdMs = BUNDLED_CONTENT.registry.senses.get('player')!.crouchProneHoldRealSeconds * 1000;

const fixture = () => {
  const actions: string[] = [];
  const input = new PressHoldInput<string>({
    holdRealMs: () => holdMs,
    tap: () => actions.push('crouch'),
    hold: () => actions.push('prone'),
  });
  return { actions, input };
};

describe('crouch key tap and long press', () => {
  it('toggles crouch on a tap and never lies down', () => {
    const { actions, input } = fixture();
    input.keyDown('player.crouch-toggle', 0);
    input.update(holdMs - 1);
    input.keyUp('player.crouch-toggle', holdMs - 1);
    expect(actions).toEqual(['crouch']);
  });

  it('lies down on a long press without toggling crouch first', () => {
    const { actions, input } = fixture();
    input.keyDown('player.crouch-toggle', 0);
    input.update(holdMs);
    expect(actions).toEqual(['prone']);
    input.keyUp('player.crouch-toggle', holdMs);
    expect(actions).toEqual(['prone']);
  });

  it('keeps one default key for crouch and prone, so a rebind moves both', () => {
    const registry = new BindingRegistry(INPUT_BINDINGS, undefined);
    expect(registry.binding('player.prone-toggle')?.id).toBe('player.crouch-toggle');
    expect(registry.chords('player.prone-toggle')).toEqual(registry.chords('player.crouch-toggle'));
    expect(registry.rebind('player.crouch-toggle', [{ code: 'KeyY' }])).toBeUndefined();
    expect(registry.chords('player.prone-toggle')).toEqual([{ code: 'KeyY' }]);
  });
});
