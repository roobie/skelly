// @vitest-environment happy-dom

import type { Binding, Chord, InputContext } from '@skelly/engine/input';
import { describe, expect, it } from 'vitest';
import { KeyTrace } from '../src/debug/keyTrace.ts';
import {
  BindingRegistry,
  bindingConflict,
  chordIssue,
  controlRowIssue,
  defaultKeySetIssues,
  REFUSED_MODIFIERS,
} from '../src/game/bindingRegistry.ts';
import { capturedChord, type InputCommand, KeyboardInput } from '../src/presentation/inputBindings.ts';
import { INPUT_BINDINGS } from '../src/product/controls.ts';

const fixture: readonly Binding[] = [
  {
    id: 'fixture.interact',
    description: 'Fixture interact',
    contexts: ['play'],
    commands: [{ id: 'fixture.interact', kind: 'press' }],
    defaults: [{ code: 'KeyF' }],
  },
  {
    id: 'fixture.move',
    description: 'Fixture move',
    contexts: ['play'],
    commands: [{ id: 'fixture.move', kind: 'held-state' }],
    defaults: [{ code: 'KeyW' }],
  },
  {
    id: 'fixture.sprint',
    description: 'Fixture sprint',
    contexts: ['play'],
    commands: [{ id: 'fixture.sprint', kind: 'held-state' }],
    defaults: [{ code: 'ShiftLeft' }],
  },
  {
    id: 'debug.gate',
    description: 'Fixture gate',
    contexts: ['play', 'inventory'],
    commands: [{ id: 'debug.gate', kind: 'held-state' }],
    defaults: [{ code: 'F3' }],
    debug: true,
  },
  {
    id: 'fixture.debug',
    description: 'Fixture debug',
    contexts: ['play', 'inventory'],
    commands: [{ id: 'fixture.debug', kind: 'press' }],
    defaults: [{ code: 'KeyF' }],
    gate: 'debug.gate',
    debug: true,
  },
  {
    id: 'fixture.inventory',
    description: 'Fixture inventory',
    contexts: ['inventory'],
    commands: [{ id: 'fixture.inventory', kind: 'press' }],
    defaults: [{ code: 'KeyF' }],
  },
  {
    id: 'fixture.quick',
    description: 'Fixture quick action',
    contexts: ['inventory'],
    commands: [{ id: 'fixture.quick', kind: 'held-state' }],
    defaults: [{ code: 'KeyT' }],
    plainKey: true,
  },
];
const event = (code: string, extra: Partial<KeyboardEvent & Chord> = {}) => ({
  code,
  shiftKey: extra.modifier === 'shift',
  altKey: extra.modifier === 'alt',
  ctrlKey: extra.modifier === 'ctrl',
  metaKey: extra.modifier === 'meta',
  repeat: false,
  isComposing: false,
  timeStamp: 0,
  ...extra,
});
/** The DOM modifier flags of a chord, for a native event. */
const keyInit = (chord: Chord) => ({
  code: chord.code,
  shiftKey: chord.modifier === 'shift',
  altKey: chord.modifier === 'alt',
  ctrlKey: chord.modifier === 'ctrl',
  metaKey: chord.modifier === 'meta',
});
const POINTER_CODE = /^Mouse(\d+)$/;
/** The mouse button a pointer chord names. */
const pointerButton = (chord: Chord): number => {
  const button = POINTER_CODE.exec(chord.code)?.[1];
  if (button === undefined) {
    throw new Error(`${chord.code} is not a pointer chord`);
  }
  return Number(button);
};
const NO_MODIFIERS = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};

describe('keyboard registry', () => {
  it.each([
    { from: 'inventory', to: 'interrupted', action: 'inventory.best-pocket', next: 'compression.continue' },
    { from: 'interrupted', to: 'inventory', action: 'compression.continue', next: 'inventory.best-pocket' },
  ] as const)(
    'consumes native button activation from a held key after transfer into $to',
    ({ from, to, action, next }) => {
      const bindings = new BindingRegistry(INPUT_BINDINGS, storage());
      const chord = bindings.chords(action)[0]!;
      // The key held across the transfer must also be the new owner's, whatever the defaults are.
      expect(bindings.rebind(next, [chord])).toBeUndefined();
      const key = keyInit(chord);
      const keyboard = new KeyboardInput(bindings);
      let context: InputContext = from;
      keyboard.context = () => ({ context, debug: false });
      const commands: InputCommand[] = [];
      keyboard.command = (command) => {
        commands.push(command);
        if (command.action === action && command.phase === 'down') {
          context = to;
        }
      };
      const remove = keyboard.install();
      const button = document.createElement('button');
      document.body.append(button);
      button.focus();
      try {
        button.dispatchEvent(new KeyboardEvent('keydown', { ...key, bubbles: true, cancelable: true }));
        const repeated = new KeyboardEvent('keydown', { ...key, repeat: true, bubbles: true, cancelable: true });
        button.dispatchEvent(repeated);
        expect(repeated.defaultPrevented).toBe(true);
        expect(commands.filter(({ phase }) => phase === 'down').map((command) => command.action)).toEqual([action]);
        button.dispatchEvent(new KeyboardEvent('keyup', { ...key, bubbles: true }));
        button.dispatchEvent(new KeyboardEvent('keydown', { ...key, bubbles: true, cancelable: true }));
        expect(commands.at(-1)?.action).toBe(next);
      } finally {
        remove();
        button.remove();
      }
    },
  );
  it('accepts a physical Shift down with a false Shift flag so strafe remains available', () => {
    const keyboard = new KeyboardInput(
      new BindingRegistry(
        [
          ...fixture,
          {
            id: 'fixture.strafe',
            description: 'Fixture strafe',
            contexts: ['play'],
            commands: [{ id: 'fixture.strafe', kind: 'held-state' }],
            defaults: [{ code: 'KeyD' }],
          },
        ],
        storage(),
      ),
    );
    keyboard.context = () => ({ context: 'play', debug: false });
    keyboard.press(event('KeyW'));
    keyboard.press(event('ShiftLeft', { shiftKey: true }));
    keyboard.release(event('ShiftLeft', { shiftKey: true }));
    keyboard.press(event('KeyW', { repeat: true }));
    const sprintAccepted = keyboard.press(event('ShiftLeft', { shiftKey: false }));
    keyboard.press(event('KeyW', { repeat: true, shiftKey: true }));
    const strafeAccepted = keyboard.press(event('KeyD', { shiftKey: true }));
    expect({
      sprintAccepted,
      strafeAccepted,
      forward: keyboard.held('fixture.move'),
      sprint: keyboard.held('fixture.sprint'),
      strafe: keyboard.held('fixture.strafe'),
    }).toEqual({ sprintAccepted: true, strafeAccepted: true, forward: true, sprint: true, strafe: true });
  });
  it('does not revive a held Shift with a false flag through the menu', () => {
    const keyboard = new KeyboardInput(new BindingRegistry(fixture, storage()));
    let context: InputContext = 'play';
    keyboard.context = () => ({ context, debug: false });
    expect(keyboard.press(event('ShiftLeft', { shiftKey: true }))).toBe(true);
    context = 'menu';
    keyboard.sync();
    expect(keyboard.held('fixture.sprint')).toBe(false);
    expect(keyboard.press(event('ShiftLeft', { repeat: true, shiftKey: false }))).toBe(false);
    context = 'play';
    keyboard.sync();
    expect(keyboard.press(event('ShiftLeft', { repeat: true, shiftKey: false }))).toBe(false);
    expect(keyboard.held('fixture.sprint')).toBe(false);
    keyboard.release(event('ShiftLeft'));
    expect(keyboard.press(event('ShiftLeft', { shiftKey: true }))).toBe(true);
    expect(keyboard.held('fixture.sprint')).toBe(true);
  });
  it('redacts movement codes from the debug trace while text entry has focus', () => {
    const bindings = new BindingRegistry(
      [
        {
          id: 'movement.fixture',
          description: 'Fixture movement',
          contexts: ['play'],
          commands: [{ id: 'movement.fixture', kind: 'held-state' }],
          defaults: [{ code: 'KeyW' }],
        },
      ],
      storage(),
    );
    const keyboard = new KeyboardInput(bindings);
    keyboard.context = () => ({ context: 'play', debug: true });
    const trace = new KeyTrace();
    keyboard.trace = trace.record;
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    try {
      expect(keyboard.press(event('KeyW'), true)).toBe(false);
      keyboard.release(event('KeyW'));
      const { entries } = JSON.parse(trace.export());
      expect(entries.find((entry: { kind: string }) => entry.kind === 'down')).toMatchObject({
        focus: 'editable',
        accepted: false,
        reason: 'editing',
      });
      for (const entry of entries) {
        expect(entry).not.toHaveProperty('code');
        expect(entry.down).toEqual([]);
        expect(entry.blocked).toEqual([]);
        expect(entry.active).toEqual([]);
      }
    } finally {
      field.remove();
    }
  });
  it('records the modifier refusal for a movement down in the debug key trace', () => {
    const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS, storage()));
    keyboard.context = () => ({ context: 'play', debug: true });
    const trace = new KeyTrace();
    keyboard.trace = trace.record;
    const left = keyboard.registry.chords('movement.left')[0]!;
    expect(left.modifier).toBeUndefined();
    expect(keyboard.press(new KeyboardEvent('keydown', { code: left.code, shiftKey: true }))).toBe(false);
    expect(JSON.parse(trace.export()).entries.at(-1)).toMatchObject({
      kind: 'down',
      code: left.code,
      context: 'play',
      shiftKey: true,
      accepted: false,
      reason: 'modifiers',
      active: [],
    });
  });
  it('declares conflict-free defaults with valid physical keys and unique semantic commands', () => {
    expect(INPUT_BINDINGS.length).toBeGreaterThan(0);
    expect(bindingConflict(INPUT_BINDINGS, new Map())).toBeUndefined();
    expect(
      INPUT_BINDINGS.filter((binding) => binding.debug && !['debug.gate', 'spawn.confirm'].includes(binding.id)).every(
        (binding) => binding.gate === 'debug.gate',
      ),
    ).toBe(true);
    expect(INPUT_BINDINGS.find(({ id }) => id === 'spawn.confirm')?.debug).toBe(true);
    expect(INPUT_BINDINGS.find(({ id }) => id === 'spawn.confirm')?.gate).toBeUndefined();
    const commands = INPUT_BINDINGS.flatMap((binding) => binding.commands.map(({ id }) => id));
    expect(new Set(commands).size).toBe(commands.length);
    for (const binding of INPUT_BINDINGS) {
      expect(binding.contexts.length).toBeGreaterThan(0);
      expect(binding.defaults.length).toBeGreaterThan(0);
      for (const chord of binding.defaults) {
        expect(chordIssue(chord)).toBeUndefined();
      }
    }
  });
  it('dispatches the crouch action in play but not in menus or text entry', () => {
    const bindings = new BindingRegistry(INPUT_BINDINGS, storage());
    expect(bindings.rebind('player.crouch-toggle', [{ code: 'KeyY' }])).toBeUndefined();
    const keyboard = new KeyboardInput(bindings);
    let context: InputContext = 'play';
    keyboard.context = () => ({ context, debug: false });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);

    expect(keyboard.press(event('KeyY'))).toBe(true);
    expect(commands).toEqual([{ action: 'player.crouch-toggle', phase: 'down', at: 0 }]);
    keyboard.release(event('KeyY'));
    commands.length = 0;
    expect(keyboard.press(event('KeyY'), true)).toBe(false);
    expect(commands).toEqual([]);
    let captured: Chord | string | undefined;
    keyboard.capture = (chord) => {
      captured = chord;
    };
    expect(keyboard.press(event('KeyY'))).toBe(true);
    expect(captured).toEqual({ code: 'KeyY' });
    expect(commands).toEqual([]);
    keyboard.release(event('KeyY'));
    keyboard.capture = undefined;

    context = 'menu';
    keyboard.sync();
    expect(keyboard.press(event('KeyY'))).toBe(false);
    context = 'noclip';
    keyboard.sync();
    expect(keyboard.press(event('KeyY'))).toBe(false);
    expect(commands).toEqual([]);
  });
  it('passes held movement through the reading-to-play context change', () => {
    const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS, storage()));
    let context: InputContext = 'reading';
    keyboard.context = () => ({ context, debug: false });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);
    const forward = keyboard.registry.chords('movement.forward')[0]!;

    expect(keyboard.press(event(forward.code, forward))).toBe(true);
    expect(keyboard.held('movement.forward')).toBe(true);
    context = 'play';
    keyboard.sync();
    expect(keyboard.held('movement.forward')).toBe(true);
    keyboard.release(event(forward.code, forward));
    expect(commands.map(({ action, phase }) => [action, phase])).toEqual([
      ['movement.forward', 'down'],
      ['movement.forward', 'up'],
    ]);
  });
  it.each([
    ['window blur', (keyboard: KeyboardInput) => keyboard.windowBlurred()],
    [
      'hidden document',
      (keyboard: KeyboardInput) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        try {
          keyboard.visibilityChanged();
        } finally {
          Reflect.deleteProperty(document, 'hidden');
        }
      },
    ],
  ])('accepts the first press of a key held when focus was lost to a %s', (_name, loseFocus) => {
    const keyboard = new KeyboardInput(new BindingRegistry(fixture, storage()));
    keyboard.context = () => ({ context: 'play', debug: false });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);

    expect(keyboard.press(event('KeyW'))).toBe(true);
    loseFocus(keyboard);
    expect(keyboard.held('fixture.move')).toBe(false);
    commands.length = 0;
    // The keyup went to another window, so the next press arrives with no release before it.
    expect(keyboard.press(event('KeyW'))).toBe(true);
    expect(commands).toEqual([{ action: 'fixture.move', phase: 'down', at: 0 }]);
  });
  it('captures a modifier chord, and a lone modifier on its release', () => {
    const keyboard = new KeyboardInput(new BindingRegistry(fixture, storage()));
    keyboard.context = () => ({ context: 'menu', debug: false });
    const captured: (Chord | string | undefined)[] = [];
    keyboard.capture = (chord) => captured.push(chord);

    keyboard.press(event('ShiftLeft', { shiftKey: true }));
    keyboard.press(event('ShiftLeft', { shiftKey: true, repeat: true }));
    keyboard.press(event('KeyK', { modifier: 'shift' }));
    keyboard.release(event('KeyK', { modifier: 'shift' }));
    keyboard.release(event('ShiftLeft'));
    expect(captured).toEqual([{ code: 'KeyK', modifier: 'shift' }]);

    captured.length = 0;
    keyboard.press(event('ShiftLeft', { shiftKey: true }));
    expect(captured).toEqual([]);
    keyboard.release(event('ShiftLeft'));
    expect(captured).toEqual([{ code: 'ShiftLeft' }]);
    keyboard.capture = undefined;
  });
  it('rebinds the ADS pointer action to another mouse button or a key', () => {
    const bindings = new BindingRegistry(INPUT_BINDINGS, storage());
    const keyboard = new KeyboardInput(bindings);
    keyboard.context = () => ({ context: 'play', debug: false });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);

    const shipped = pointerButton(bindings.chords('aim.ads-toggle')[0]!);
    expect(bindings.rebind('aim.ads-toggle', [{ code: 'Mouse4' }])).toBeUndefined();
    expect(bindings.label('aim.ads-toggle')).toBe('Mouse 5');
    expect(keyboard.pressPointer(shipped, { ...NO_MODIFIERS, timeStamp: 1 })).toBe(false);
    expect(
      keyboard.pressPointer(4, { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, timeStamp: 2 }),
    ).toBe(true);
    expect(commands).toEqual([{ action: 'aim.ads-toggle', phase: 'down', at: 2 }]);
    keyboard.releasePointer(4, 3);
    commands.length = 0;

    expect(bindings.rebind('aim.ads-toggle', [{ code: 'KeyY' }])).toBeUndefined();
    expect(keyboard.press(event('KeyY'))).toBe(true);
    expect(commands).toEqual([{ action: 'aim.ads-toggle', phase: 'down', at: 0 }]);
  });
  it('routes ready stance through a rebindable held pointer action', () => {
    const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS, storage()));
    keyboard.context = () => ({ context: 'play', debug: false });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);
    const ready = pointerButton(keyboard.registry.chords('stance.ready')[0]!);
    expect(keyboard.pressPointer(ready, { ...NO_MODIFIERS, timeStamp: 1 })).toBe(true);
    expect(keyboard.held('stance.ready')).toBe(true);
    keyboard.releasePointer(ready, 2);
    expect(commands.map(({ action, phase }) => [action, phase])).toEqual([
      ['stance.ready', 'down'],
      ['stance.ready', 'up'],
    ]);
  });
  it('keeps ready and ADS held when debug controls enable', () => {
    const bindings = new BindingRegistry(INPUT_BINDINGS, storage());
    const gate = bindings.chords('debug.gate')[0]!;
    const keyboard = new KeyboardInput(bindings);
    keyboard.context = () => ({ context: 'play', debug: true });
    let ready = false;
    let ads = false;
    keyboard.command = ({ action, phase }) => {
      if (action === 'stance.ready') {
        ready = phase === 'down';
        if (!ready) {
          ads = false;
        }
      }
      if (action === 'aim.ads-toggle' && phase === 'down' && ready) {
        ads = !ads;
      }
    };
    keyboard.cancelled = (preservePointer) => {
      if (!preservePointer) {
        ready = false;
        ads = false;
      }
    };

    const readyButton = pointerButton(bindings.chords('stance.ready')[0]!);
    const adsButton = pointerButton(bindings.chords('aim.ads-toggle')[0]!);
    expect(keyboard.pressPointer(readyButton, { ...NO_MODIFIERS, timeStamp: 1 })).toBe(true);
    expect(keyboard.pressPointer(adsButton, { ...NO_MODIFIERS, timeStamp: 2 })).toBe(true);
    keyboard.releasePointer(adsButton, 3);
    expect([ready, ads]).toEqual([true, true]);
    expect(keyboard.press(event(gate.code, gate))).toBe(true);
    expect([ready, ads, keyboard.held('stance.ready')]).toEqual([true, true, true]);
  });
  it('keeps both continue paths in their separate owners', () => {
    const bindings = new BindingRegistry(INPUT_BINDINGS, storage());
    const craft = bindings.binding('craft.continue')!;
    const interruption = bindings.binding('compression.continue')!;
    expect(craft.contexts.filter((context) => interruption.contexts.includes(context))).toEqual([]);
  });
  it('gives the reload and throw keys to the carry actions while carrying', () => {
    const bindings = new BindingRegistry(INPUT_BINDINGS, storage());
    const keyboard = new KeyboardInput(bindings);
    let context: InputContext = 'carrying';
    keyboard.context = () => ({ context, debug: false });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);
    const press = (action: string) => {
      const { code } = bindings.chords(action)[0]!;
      keyboard.press(event(code));
      keyboard.release(event(code));
    };

    press('firearm.reload');
    press('player.throw');
    expect(
      commands
        .filter(({ phase }) => phase === 'down')
        .map(({ action }) => action)
        .sort(),
    ).toEqual(['carry.tip', 'carry.turn']);
    commands.length = 0;
    context = 'play';
    keyboard.sync();
    press('carry.turn');
    press('carry.tip');
    expect(commands.map(({ action }) => action)).not.toContain('carry.turn');
    expect(commands.map(({ action }) => action)).not.toContain('carry.tip');
  });
  it('takes default keys from content and lets a stored rebind win by action id', () => {
    const fromContent = new BindingRegistry(INPUT_BINDINGS, storage()).chords('world.interact');
    expect(fromContent.length).toBeGreaterThan(0);
    const chosen = { code: 'Digit9' };
    expect(fromContent).not.toContainEqual(chosen);
    const stored = storage();
    stored.setItem('skelly.input-bindings', JSON.stringify({ 'world.interact': [chosen] }));
    const rebound = new BindingRegistry(INPUT_BINDINGS, stored);
    expect(rebound.chords('world.interact')).toEqual([chosen]);
    expect(rebound.chords('movement.forward')).toEqual(
      new BindingRegistry(INPUT_BINDINGS, storage()).chords('movement.forward'),
    );
  });
  it('routes the inventory tab chords in play and inventory contexts', () => {
    const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS, storage()));
    let context: InputContext = 'play';
    keyboard.context = () => ({ context, debug: false });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);
    const registry = new BindingRegistry(INPUT_BINDINGS, storage());
    const tabs = [
      'ui.inventory-tab-items',
      'ui.inventory-tab-skills',
      'ui.inventory-tab-crafting',
      'ui.inventory-tab-actions',
    ].map((action) => ({ action, chord: registry.chords(action)[0]! }));

    for (const tab of tabs) {
      expect(keyboard.press(event(tab.chord.code, tab.chord))).toBe(true);
      expect(commands.at(-1)?.action).toBe(tab.action);
      keyboard.release(event(tab.chord.code, tab.chord));
    }
    context = 'inventory';
    keyboard.sync();
    for (const tab of tabs) {
      expect(keyboard.press(event(tab.chord.code, tab.chord))).toBe(true);
      expect(commands.at(-1)?.action).toBe(tab.action);
      keyboard.release(event(tab.chord.code, tab.chord));
    }
    for (const [index, tab] of tabs.entries()) {
      const rebindRegistry = new BindingRegistry(INPUT_BINDINGS, storage());
      expect(rebindRegistry.binding(tab.action)?.contexts).toEqual(expect.arrayContaining(['play', 'inventory']));
      expect(rebindRegistry.rebind(tab.action, [{ code: `Numpad${4 + index}` }])).toBeUndefined();
    }
    expect(registry.binding('inventory.hands')?.contexts).toEqual(['inventory']);
  });
  it('routes a fixture-owned shared ordinary and gated debug chord without a clash', () => {
    const bindings = new BindingRegistry(fixture, storage());
    const ordinary = bindings.chords('fixture.interact')[0]!;
    const gate = bindings.chords('debug.gate')[0]!;
    const debug = bindings.chords('fixture.debug')[0]!;
    const keyboard = new KeyboardInput(bindings);
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);
    keyboard.context = () => ({ context: 'play', debug: true });
    const downs = () => commands.filter(({ phase }) => phase === 'down').map(({ action }) => action);

    expect(keyboard.press(event(ordinary.code, ordinary))).toBe(true);
    keyboard.release(event(ordinary.code, ordinary));
    expect(downs()).toContain('fixture.interact');
    expect(downs()).not.toContain('fixture.debug');

    commands.length = 0;
    expect(keyboard.press(event(gate.code, gate))).toBe(true);
    expect(keyboard.press(event(debug.code, debug))).toBe(true);
    expect(downs()).toContain('fixture.debug');
    expect(downs()).not.toContain('fixture.interact');
  });
  it('lets the review-map toggle close the map without exposing other debug bindings', () => {
    const bindings = new BindingRegistry(INPUT_BINDINGS, storage());
    const gate = bindings.chords('debug.gate')[0]!;
    const reviewMap = bindings.chords('debug.review-map-toggle')[0]!;
    const keyboard = new KeyboardInput(bindings);
    keyboard.context = () => ({ context: 'review-map', debug: true });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);

    expect(keyboard.press(event(gate.code, gate))).toBe(true);
    expect(keyboard.held('debug.gate')).toBe(true);
    expect(keyboard.press(event(reviewMap.code, reviewMap))).toBe(true);
    expect(commands.map(({ action, phase }) => [action, phase])).toEqual([
      ['debug.gate', 'down'],
      ['debug.review-map-toggle', 'down'],
    ]);
    const reachable = INPUT_BINDINGS.filter(({ contexts }) => contexts.includes('review-map'));
    expect(reachable.filter(({ debug, id }) => debug && id !== 'debug.gate').map(({ id }) => id)).toEqual([
      'debug.review-map-toggle',
    ]);
  });
  it('keeps noclip flight ungated and concurrent with ordinary movement', () => {
    const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS, storage()));
    let context: InputContext = 'noclip';
    keyboard.context = () => ({ context, debug: true });
    expect(keyboard.registry.binding('noclip.ascend')?.gate).toBeUndefined();
    expect(keyboard.registry.binding('noclip.descend')?.gate).toBeUndefined();
    const [ascend, forward, descend, jump] = [
      'noclip.ascend',
      'movement.forward',
      'noclip.descend',
      'movement.jump',
    ].map((action) => keyboard.registry.chords(action)[0]!) as [Chord, Chord, Chord, Chord];
    expect(keyboard.press(event(ascend.code, ascend))).toBe(true);
    expect(keyboard.press(event(forward.code, forward))).toBe(true);
    expect(keyboard.press(event(descend.code, descend))).toBe(true);
    expect(keyboard.held('noclip.ascend')).toBe(true);
    expect(keyboard.held('movement.forward')).toBe(true);
    expect(keyboard.held('noclip.descend')).toBe(true);
    keyboard.release(event(ascend.code, ascend));
    keyboard.release(event(forward.code, forward));
    keyboard.release(event(descend.code, descend));

    context = 'play';
    keyboard.sync();
    expect(keyboard.press(event(jump.code, jump))).toBe(true);
    expect(keyboard.held('movement.jump')).toBe(true);
    expect(keyboard.held('noclip.ascend')).toBe(false);
    keyboard.release(event(jump.code, jump));
    keyboard.press(event(ascend.code, ascend));
    keyboard.press(event(descend.code, descend));
    expect(keyboard.held('noclip.ascend')).toBe(false);
    expect(keyboard.held('noclip.descend')).toBe(false);
  });
  it('admits Alt held keys and alternate bindings without admitting Alt chords or hiding held-gate conflicts', () => {
    const alternatives = INPUT_BINDINGS.map((binding) =>
      binding.id === 'view.free-look' ? { ...binding, defaults: [{ code: 'AltLeft' }, { code: 'AltRight' }] } : binding,
    );
    const bindings = new BindingRegistry(alternatives, storage());
    expect(bindings.rebind('view.free-look', [{ code: 'AltLeft' }, { code: 'AltRight' }])).toBeUndefined();
    const keyboard = new KeyboardInput(bindings);
    keyboard.context = () => ({ context: 'play', debug: false });
    expect(keyboard.press(event('AltRight', { altKey: true }))).toBe(true);
    expect(keyboard.held('view.free-look')).toBe(true);
    const forward = bindings.chords('movement.forward')[0]!;
    expect(forward.modifier).toBeUndefined();
    expect(keyboard.press(event(forward.code, { altKey: true }))).toBe(true);
    expect(keyboard.held('movement.forward')).toBe(true);
    keyboard.release(event('AltRight'));
    keyboard.release(event(forward.code));
    expect(bindings.rebind('movement.sprint', [{ code: 'AltRight' }])).toBeDefined();
    expect(bindings.rebind('view.free-look', [{ code: 'KeyJ' }, { code: 'AltRight' }])).toBeUndefined();
    expect(keyboard.press(event('KeyJ'))).toBe(true);
    expect(keyboard.held('view.free-look')).toBe(true);
    keyboard.release(event('KeyJ'));
    expect(chordIssue({ code: 'KeyJ', modifier: 'alt' })).toBeDefined();
    const defaults = new Map(INPUT_BINDINGS.map((binding) => [binding.id, binding.defaults]));
    defaults.set('view.free-look', [{ code: 'AltRight' }]);
    expect(defaultKeySetIssues(defaults)).toEqual([]);
    expect(controlRowIssue('view.free-look', [{ code: 'AltLeft' }])).toBeUndefined();
    expect(controlRowIssue('view.free-look', [{ code: 'KeyJ', modifier: 'alt' }])).toBeDefined();

    const gate: Binding = { ...fixture[3]!, defaults: [{ code: 'AltLeft' }] };
    const gated: Binding = { ...fixture[4]!, defaults: [{ code: 'KeyJ' }] };
    const held: Binding = { ...fixture[1]!, defaults: [{ code: 'KeyJ' }, { code: 'AltLeft' }] };
    expect(bindingConflict([gate, gated, held], new Map())).toBeDefined();
  });
  it('rejects browser-owned modifiers for every game binding', () => {
    const bindings = new BindingRegistry(INPUT_BINDINGS, storage());
    for (const binding of INPUT_BINDINGS) {
      for (const modifier of REFUSED_MODIFIERS) {
        expect(bindings.rebind(binding.id, [{ code: 'KeyJ', modifier }])).toEqual(expect.any(String));
      }
    }
  });
  it('rejects an ungated debug action sharing a game action chord', () => {
    const game: Binding = {
      id: 'fixture.game',
      description: 'Fixture game action',
      contexts: ['play'],
      commands: [{ id: 'fixture.game', kind: 'press' }],
      defaults: [{ code: 'KeyJ' }],
    };
    const debug: Binding = {
      id: 'fixture.ungated-debug',
      description: 'Fixture ungated debug action',
      contexts: ['play'],
      commands: [{ id: 'fixture.ungated-debug', kind: 'press' }],
      defaults: [{ code: 'KeyJ' }],
      debug: true,
    };
    expect(bindingConflict([game, debug], new Map())).toEqual(expect.any(String));
  });
  it('persists accepted rebinds, refuses overlapping modifiers atomically, drops invalid preferences and resets labels', () => {
    const prefs = storage();
    const bindings = new BindingRegistry(fixture, prefs);
    expect(bindings.rebind('fixture.interact', [{ code: 'KeyW' }])).toContain('Fixture move');
    expect(bindings.rebind('fixture.interact', [{ code: 'KeyJ', modifier: 'shift' }])).toContain('Fixture sprint');
    expect(bindings.label('fixture.interact')).toBe('F');
    expect(bindings.rebind('fixture.interact', [{ code: 'KeyJ' }])).toBeUndefined();
    const restored = new BindingRegistry(fixture, prefs);
    expect(restored.label('fixture.interact')).toBe('J');
    expect(restored.rebind('debug.gate', [{ code: 'KeyF' }])).toBeDefined();
    expect(restored.rebind('fixture.debug', [{ code: 'KeyJ' }])).toBeUndefined();
    restored.setLayout(new Map([['KeyJ', 'Fixture key']]));
    const chordLabel = restored.alternativeLabel('fixture.debug', 0);
    expect(chordLabel.indexOf(restored.label('debug.gate'))).toBeLessThan(chordLabel.indexOf('Fixture key'));
    expect(restored.rebind('fixture.quick', [{ code: 'ShiftLeft' }])).toBeDefined();
    expect(restored.rebind('fixture.quick', [{ code: 'KeyJ', modifier: 'alt' }])).toBeDefined();
    expect(restored.label('fixture.quick')).toBe('T');
    prefs.setItem(
      'skelly.input-bindings',
      JSON.stringify({
        unknown: [{ code: 'KeyJ' }],
        'fixture.interact': [{ code: 'Unidentified' }],
        'fixture.move': [{ code: 'KeyF' }],
        'fixture.inventory': [{ code: 'KeyJ' }],
        'fixture.quick': [{ code: 'ShiftLeft' }],
      }),
    );
    const validated = new BindingRegistry(fixture, prefs);
    expect(validated.label('fixture.interact')).toBe('F');
    expect(validated.label('fixture.move')).toBe('W');
    expect(validated.label('fixture.inventory')).toBe('J');
    expect(validated.label('fixture.quick')).toBe('T');
    expect(validated.diagnostics).toHaveLength(3);
    validated.reset();
    expect(new BindingRegistry(fixture, prefs).label('fixture.inventory')).toBe('F');
    validated.setLayout(new Map([['KeyF', 'φ']]));
    expect(validated.label('fixture.inventory')).toBe('φ');
  });
  it('refuses browser modifiers for bindings and rebinding capture', () => {
    for (const extra of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(typeof capturedChord(event('KeyJ', extra))).toBe('string');
    }
    expect(capturedChord(event('ControlLeft', { ctrlKey: true }))).toEqual(expect.any(String));
    expect(capturedChord(event('AltLeft', { altKey: true }))).toEqual({ code: 'AltLeft' });
    const keyboard = new KeyboardInput(new BindingRegistry(fixture, storage()));
    keyboard.context = () => ({ context: 'play', debug: true });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);
    expect(keyboard.press(event('KeyF', { ctrlKey: true }), true)).toBe(false);
    expect(keyboard.press(event('KeyF', { altKey: true }), true)).toBe(false);
    expect(commands).toEqual([]);
  });
  it('cancels Chrome DevTools shortcuts except in editable targets or while reporting binding refusal', () => {
    const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS, storage()));
    keyboard.context = () => ({ context: 'play', debug: false });
    const remove = keyboard.install();
    const dispatch = (target: EventTarget, code: string, modifiers: KeyboardEventInit = {}, cancelable = true) => {
      const key = new KeyboardEvent('keydown', { code, bubbles: true, cancelable, ...modifiers });
      target.dispatchEvent(key);
      return key;
    };

    try {
      for (const code of ['KeyC', 'KeyI', 'KeyJ']) {
        expect(dispatch(globalThis, code, { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
      }
      expect(dispatch(globalThis, 'F12').defaultPrevented).toBe(true);
      expect(dispatch(globalThis, 'KeyC', { metaKey: true, shiftKey: true }).defaultPrevented).toBe(true);
      for (const code of ['KeyI', 'KeyJ']) {
        expect(dispatch(globalThis, code, { metaKey: true, altKey: true }).defaultPrevented).toBe(true);
      }

      const input = document.createElement('input');
      document.body.append(input);
      expect(dispatch(input, 'KeyI', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
      expect(dispatch(globalThis, 'KeyI', { ctrlKey: true, shiftKey: true }, false).defaultPrevented).toBe(false);
      expect(dispatch(globalThis, 'KeyK', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);

      let refusal: Chord | string | undefined;
      keyboard.capture = (value) => {
        refusal = value;
      };
      expect(dispatch(globalThis, 'KeyI', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
      expect(refusal).toEqual(expect.any(String));
    } finally {
      remove();
    }
  });
  it.each(['mousemove', 'keydown', 'focus'] as const)('reconciles lost Alt and movement on %s', (type) => {
    const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS, storage()));
    keyboard.context = () => ({ context: 'play', debug: false });
    const forward = keyInit(keyboard.registry.chords('movement.forward')[0]!);
    const freeLook = keyboard.registry.chords('view.free-look')[0]!.code;
    // Another key the player can press: the first shipped key bound to neither action.
    const other = INPUT_BINDINGS.flatMap(({ defaults }) => defaults).find(
      ({ code, modifier }) => !modifier && code !== forward.code && code !== freeLook && !code.startsWith('Mouse'),
    )!.code;
    const remove = keyboard.install();
    try {
      globalThis.dispatchEvent(new KeyboardEvent('keydown', forward));
      globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: freeLook, altKey: false }));
      expect(keyboard.held('movement.forward')).toBe(true);
      expect(keyboard.held('view.free-look')).toBe(true);
      globalThis.dispatchEvent(new MouseEvent('mousemove', { altKey: true }));
      expect(keyboard.held('movement.forward')).toBe(true);
      expect(keyboard.held('view.free-look')).toBe(true);
      // The releases and blur never reach this owner; recovery must use independent browser evidence.
      const evidence = {
        keydown: new KeyboardEvent('keydown', { code: other, altKey: false }),
        focus: new Event('focus'),
        mousemove: new MouseEvent('mousemove', { altKey: false }),
      }[type];
      globalThis.dispatchEvent(evidence);
      expect(keyboard.held('view.free-look')).toBe(false);
      expect(keyboard.held('movement.forward')).toBe(false);
      globalThis.dispatchEvent(new KeyboardEvent('keydown', forward));
      globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: freeLook, altKey: true }));
      expect(keyboard.held('movement.forward')).toBe(true);
      expect(keyboard.held('view.free-look')).toBe(true);
    } finally {
      remove();
    }
  });
  it.each(['focus', 'visibility', 'pointer-lock'] as const)('clears held keys on sampled %s loss', (lost) => {
    const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS, storage()));
    keyboard.context = () => ({ context: 'play', debug: false });
    let focused = true;
    let hidden = false;
    let locked = true;
    const properties = ['hasFocus', 'hidden', 'pointerLockElement'] as const;
    const originals = properties.map((name) => Object.getOwnPropertyDescriptor(document, name));
    Object.defineProperties(document, {
      hasFocus: { configurable: true, value: () => focused },
      hidden: { configurable: true, get: () => hidden },
      pointerLockElement: { configurable: true, get: () => (locked ? document.body : null) },
    });
    const forward = keyboard.registry.chords('movement.forward')[0]!;
    const freeLook = keyboard.registry.chords('view.free-look')[0]!;
    try {
      keyboard.press(event(forward.code, forward));
      keyboard.press(event(freeLook.code, { altKey: true }));
      keyboard.reconcileFocus();
      expect(keyboard.held('movement.forward')).toBe(true);
      expect(keyboard.held('view.free-look')).toBe(true);
      focused = lost !== 'focus';
      hidden = lost === 'visibility';
      locked = lost !== 'pointer-lock';
      keyboard.reconcileFocus();
      expect(keyboard.held('view.free-look')).toBe(false);
      expect(keyboard.held('movement.forward')).toBe(false);
      focused = true;
      hidden = false;
      locked = true;
      keyboard.press(event(forward.code, forward));
      expect(keyboard.held('movement.forward')).toBe(true);
    } finally {
      for (const [index, name] of properties.entries()) {
        const original = originals[index];
        if (original) {
          Object.defineProperty(document, name, original);
        } else {
          Reflect.deleteProperty(document, name);
        }
      }
    }
  });
  it('cancels browser chords only while playing with pointer lock and outside text fields', () => {
    const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS, storage()));
    let context: InputContext = 'play';
    keyboard.context = () => ({ context, debug: false });
    const remove = keyboard.install();
    let locked: Element | null = document.body;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
    const freeLook = keyboard.registry.chords('view.free-look')[0]!.code;
    const prevented = (target: EventTarget, code: string, modifiers: KeyboardEventInit) => {
      const key = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...modifiers });
      target.dispatchEvent(key);
      return key.defaultPrevented;
    };

    try {
      expect(prevented(globalThis, 'KeyU', { ctrlKey: true })).toBe(true);
      expect(prevented(globalThis, 'KeyS', { metaKey: true })).toBe(true);
      expect(prevented(globalThis, 'ArrowLeft', { altKey: true })).toBe(true);
      expect(prevented(globalThis, 'ControlLeft', { ctrlKey: true })).toBe(false);
      expect(prevented(globalThis, freeLook, { altKey: true })).toBe(true);
      expect(keyboard.held('view.free-look')).toBe(true);
      const altUp = new KeyboardEvent('keyup', { code: freeLook, bubbles: true, cancelable: true });
      globalThis.dispatchEvent(altUp);
      expect(altUp.defaultPrevented).toBe(true);
      expect(keyboard.held('view.free-look')).toBe(false);
      prevented(globalThis, freeLook, { altKey: true });
      locked = null;
      document.dispatchEvent(new Event('pointerlockchange'));
      expect(keyboard.held('view.free-look')).toBe(false);
      locked = document.body;
      expect(prevented(globalThis, freeLook, { altKey: true })).toBe(true);
      expect(keyboard.held('view.free-look')).toBe(true);
      keyboard.release(event(freeLook));

      const input = document.createElement('input');
      document.body.append(input);
      expect(prevented(input, 'KeyU', { ctrlKey: true })).toBe(false);
      context = 'menu';
      expect(prevented(globalThis, 'KeyU', { ctrlKey: true })).toBe(false);
      context = 'play';
      locked = null;
      expect(prevented(globalThis, 'KeyU', { ctrlKey: true })).toBe(false);
    } finally {
      remove();
      Reflect.deleteProperty(document, 'pointerLockElement');
    }
  });
  it('routes a gate chord exclusively, suppresses repeats, and requires release after an owner transition', () => {
    const keyboard = new KeyboardInput(new BindingRegistry(fixture, storage()));
    let context: InputContext = 'play';
    keyboard.context = () => ({ context, debug: true });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);
    keyboard.press(event('KeyF'));
    expect(commands.at(-1)?.action).toBe('fixture.interact');
    keyboard.release(event('KeyF'));
    keyboard.press(event('ShiftLeft', { shiftKey: true }));
    keyboard.press(event('KeyW', { shiftKey: true }));
    expect(keyboard.held('fixture.move')).toBe(true);
    keyboard.release(event('KeyW'));
    keyboard.release(event('ShiftLeft'));
    keyboard.press(event('F3'));
    expect(keyboard.press(event('F3', { repeat: true }))).toBe(true);
    expect(keyboard.held('debug.gate')).toBe(true);
    commands.length = 0;
    keyboard.press(event('KeyF'));
    keyboard.press(event('KeyF', { repeat: true }));
    expect(commands).toEqual([{ action: 'fixture.debug', phase: 'down', at: 0 }]);
    context = 'inventory';
    keyboard.sync();
    expect(keyboard.press(event('KeyF', { repeat: true }))).toBe(false);
    keyboard.release(event('KeyF'));
    keyboard.release(event('F3'));
    commands.length = 0;
    keyboard.press(event('KeyF'));
    expect(commands[0]?.action).toBe('fixture.inventory');
    keyboard.cancel();
    expect(keyboard.held('fixture.inventory')).toBe(false);
    keyboard.release(event('KeyF'));
    commands.length = 0;
    keyboard.press(event('KeyF'), true);
    expect(commands).toEqual([]);
    keyboard.release(event('KeyF'));
    expect(keyboard.registry.rebind('debug.gate', [{ code: 'F2' }])).toBeUndefined();
    expect(keyboard.registry.rebind('fixture.debug', [{ code: 'KeyJ' }])).toBeUndefined();
    keyboard.registry.setLayout(new Map([['KeyJ', 'Fixture key']]));
    const chordLabel = keyboard.registry.alternativeLabel('fixture.debug', 0);
    expect(chordLabel.indexOf(keyboard.registry.label('debug.gate'))).toBeLessThan(chordLabel.indexOf('Fixture key'));
    expect(keyboard.registry.rebind('fixture.debug', [{ code: 'KeyF' }])).toBeUndefined();
    expect(keyboard.press(event('F3'))).toBe(false);
    keyboard.release(event('F3'));
    expect(keyboard.press(event('F2'))).toBe(true);
    commands.length = 0;
    keyboard.press(event('KeyF'));
    expect(commands).toEqual([{ action: 'fixture.debug', phase: 'down', at: 0 }]);
    keyboard.release(event('KeyF'));
    keyboard.release(event('F2'));
    commands.length = 0;
    keyboard.context = () => ({ context: 'inventory', debug: false });
    expect(keyboard.press(event('F2'))).toBe(false);
    expect(commands).toEqual([]);
  });
});
