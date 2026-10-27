import { describe, expect, it } from 'vitest';
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();

import { CrouchProneInput, dispatchReplayStanceAction, type StanceReplayAction } from '../src/game/crouchProneInput.ts';
import { BindingRegistry, INPUT_BINDINGS } from '../src/game/inputBindings.ts';

const holdMs = BUNDLED_CONTENT.registry.senses.get('player')!.crouchProneHoldRealSeconds * 1000;

const fixture = () => {
  const actions: StanceReplayAction[] = [];
  return {
    actions,
    input: new CrouchProneInput({ holdRealMs: () => holdMs, action: (action) => actions.push(action) }),
  };
};

describe('crouch key tap and long press', () => {
  it('defers crouch until release and resolves a hold to prone for replay', () => {
    const { actions, input } = fixture();
    input.keyDown('player.crouch-toggle', 0);
    expect(actions).toEqual([]);
    input.keyUp('player.crouch-toggle', holdMs - 1);
    expect(actions).toEqual(['player.crouch-toggle']);

    input.keyDown('player.crouch-toggle', holdMs);
    input.update(holdMs * 2);
    expect(actions).toEqual(['player.crouch-toggle', 'player.prone-toggle']);
    input.keyUp('player.crouch-toggle', holdMs * 2 + 1);

    const replayed: StanceReplayAction[] = [];
    dispatchReplayStanceAction(actions[1]!, (action) => replayed.push(action));
    expect(replayed).toEqual(['player.prone-toggle']);
  });

  it('cancels a pending stance hold when refusal crosses its threshold', () => {
    const { actions, input } = fixture();
    input.keyDown('player.crouch-toggle', 0);
    input.update(holdMs, true);
    input.update(holdMs, false);
    input.keyUp('player.crouch-toggle', holdMs + 1);
    expect(actions).toEqual([]);
  });

  it('does not revive a pending stance hold after refusal recovers before its threshold', () => {
    const { actions, input } = fixture();
    input.keyDown('player.crouch-toggle', 0);
    input.update(holdMs / 2, true);
    input.update(holdMs, false);
    input.keyUp('player.crouch-toggle', holdMs + 1);
    expect(actions).toEqual([]);
  });

  it('keeps one default key for crouch and prone, so a rebind moves both', () => {
    const registry = new BindingRegistry(INPUT_BINDINGS, undefined);
    expect(registry.binding('player.prone-toggle')?.id).toBe('player.crouch-toggle');
    expect(registry.chords('player.prone-toggle')).toEqual(registry.chords('player.crouch-toggle'));
    expect(registry.rebind('player.crouch-toggle', [{ code: 'KeyY' }])).toBeUndefined();
    expect(registry.chords('player.prone-toggle')).toEqual([{ code: 'KeyY' }]);
  });
});
