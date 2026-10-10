import { describe, expect, it } from 'vitest';
import {
  type Binding,
  BindingRegistry,
  bindingConflict,
  type Chord,
  capturedChord,
  chordIssue,
  INPUT_BINDINGS,
  type InputCommand,
  type InputContext,
  KeyboardInput,
  REFUSED_MODIFIERS,
} from '../src/game/inputBindings.ts';

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
const event = (code: string, extra: Partial<KeyboardEvent> = {}) => ({
  code,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  isComposing: false,
  timeStamp: 0,
  ...extra,
});
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

    expect(keyboard.press(event('KeyW'))).toBe(true);
    expect(keyboard.held('movement.forward')).toBe(true);
    context = 'play';
    keyboard.sync();
    expect(keyboard.held('movement.forward')).toBe(true);
    keyboard.release(event('KeyW'));
    expect(commands.map(({ action, phase }) => [action, phase])).toEqual([
      ['movement.forward', 'down'],
      ['movement.forward', 'up'],
    ]);
  });
  it('rebinds the ADS pointer action to another mouse button or a key', () => {
    const bindings = new BindingRegistry(INPUT_BINDINGS, storage());
    const keyboard = new KeyboardInput(bindings);
    keyboard.context = () => ({ context: 'play', debug: false });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);

    expect(bindings.rebind('aim.ads-toggle', [{ code: 'Mouse4' }])).toBeUndefined();
    expect(bindings.label('aim.ads-toggle')).toBe('Mouse 5');
    expect(
      keyboard.pressPointer(1, { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, timeStamp: 1 }),
    ).toBe(false);
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
    expect(
      keyboard.pressPointer(2, { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, timeStamp: 1 }),
    ).toBe(true);
    expect(keyboard.held('stance.ready')).toBe(true);
    keyboard.releasePointer(2, 2);
    expect(commands.map(({ action, phase }) => [action, phase])).toEqual([
      ['stance.ready', 'down'],
      ['stance.ready', 'up'],
    ]);
  });
  it('keeps ready and ADS held when F2 enables debug controls', () => {
    const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS, storage()));
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

    expect(
      keyboard.pressPointer(2, { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, timeStamp: 1 }),
    ).toBe(true);
    expect(
      keyboard.pressPointer(1, { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, timeStamp: 2 }),
    ).toBe(true);
    keyboard.releasePointer(1, 3);
    expect([ready, ads]).toEqual([true, true]);
    expect(keyboard.press(event('F2'))).toBe(true);
    expect([ready, ads, keyboard.held('stance.ready')]).toEqual([true, true, true]);
  });
  it('keeps both continue paths in their separate owners', () => {
    const bindings = new BindingRegistry(INPUT_BINDINGS, storage());
    const craft = bindings.binding('craft.continue')!;
    const interruption = bindings.binding('compression.continue')!;
    expect(craft.contexts).toEqual(['play']);
    expect(interruption.contexts).toEqual(['interrupted']);
  });
  it('routes G/V/B/H to the inventory tabs in play and inventory contexts', () => {
    const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS, storage()));
    let context: InputContext = 'play';
    keyboard.context = () => ({ context, debug: false });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);
    const tabs = [
      { code: 'KeyG', action: 'ui.inventory-tab-items' },
      { code: 'KeyV', action: 'ui.inventory-tab-skills' },
      { code: 'KeyB', action: 'ui.inventory-tab-crafting' },
      { code: 'KeyH', action: 'ui.inventory-tab-actions' },
    ];

    for (const tab of tabs) {
      expect(keyboard.press(event(tab.code))).toBe(true);
      expect(commands.at(-1)?.action).toBe(tab.action);
      keyboard.release(event(tab.code));
    }
    context = 'inventory';
    keyboard.sync();
    for (const tab of tabs) {
      expect(keyboard.press(event(tab.code))).toBe(true);
      expect(commands.at(-1)?.action).toBe(tab.action);
      keyboard.release(event(tab.code));
    }
    for (const [index, tab] of tabs.entries()) {
      const registry = new BindingRegistry(INPUT_BINDINGS, storage());
      expect(registry.binding(tab.action)?.contexts).toEqual(expect.arrayContaining(['play', 'inventory']));
      expect(registry.rebind(tab.action, [{ code: `Numpad${4 + index}` }])).toBeUndefined();
    }
    const wield = new BindingRegistry(INPUT_BINDINGS, storage()).binding('inventory.hands');
    expect(wield?.defaults[0]?.code).toBe('KeyW');
    expect(wield?.contexts).toEqual(['inventory']);
  });
  it('keeps debug behind F2 and allows rebinding the Backquote interaction-hints hold', () => {
    const bindings = new BindingRegistry(INPUT_BINDINGS, storage());
    expect(bindings.binding('debug.gate')?.defaults[0]?.code).toBe('F2');
    expect(bindings.binding('hud.toggle-interaction-hints')?.defaults[0]?.code).toBe('Backquote');
    expect(bindings.rebind('hud.toggle-interaction-hints', [{ code: 'KeyJ' }])).toBeUndefined();
    expect(bindings.label('hud.toggle-interaction-hints')).toBe('J');
  });
  it('gates third-person controls behind F2 and exposes orbit as a held action on the free Digit6 key', () => {
    const binding = new BindingRegistry(INPUT_BINDINGS, storage());
    expect(binding.binding('debug.third-person-orbit')).toMatchObject({
      defaults: [{ code: 'Digit6' }],
      gate: 'debug.gate',
      debug: true,
      commands: [{ id: 'debug.third-person-orbit', kind: 'held-state' }],
    });
    expect(binding.binding('debug.third-person-toggle')?.defaults[0]?.code).toBe('Numpad0');
    expect(binding.binding('debug.third-person-toggle')).toMatchObject({
      defaults: [{ code: 'Numpad0' }],
      gate: 'debug.gate',
      debug: true,
    });

    const keyboard = new KeyboardInput(binding);
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);
    keyboard.context = () => ({ context: 'play', debug: false });
    expect(keyboard.press(event('Numpad0'))).toBe(false);
    keyboard.release(event('Numpad0'));
    expect(commands).toEqual([]);

    keyboard.context = () => ({ context: 'play', debug: true });
    expect(keyboard.press(event('F2'))).toBe(true);
    expect(keyboard.held('debug.gate')).toBe(true);
    expect(keyboard.press(event('Numpad0'))).toBe(true);
    keyboard.release(event('Numpad0'));
    expect(keyboard.press(event('Numpad0'))).toBe(true);
    expect(commands.filter(({ action }) => action === 'debug.third-person-toggle').map(({ phase }) => phase)).toEqual([
      'down',
      'up',
      'down',
    ]);
    expect(keyboard.press(event('Digit6'))).toBe(true);
    expect(keyboard.held('debug.third-person-orbit')).toBe(true);
    keyboard.release(event('Digit6'));
    expect(keyboard.held('debug.third-person-orbit')).toBe(false);
    expect(commands.filter(({ action }) => action === 'debug.third-person-orbit').map(({ phase }) => phase)).toEqual([
      'down',
      'up',
    ]);
  });
  it('gates the review map behind F2+M and moves game freeze off M', () => {
    const bindings = new BindingRegistry(INPUT_BINDINGS, storage());
    expect(bindings.binding('debug.review-map-toggle')?.defaults[0]?.code).toBe('KeyM');
    expect(bindings.binding('debug.review-map-toggle')?.gate).toBe('debug.gate');
    expect(bindings.binding('debug.freeze-game')?.defaults[0]?.code).not.toBe('KeyM');
  });
  it('lets the review-map toggle close the map without exposing other debug bindings', () => {
    const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS, storage()));
    keyboard.context = () => ({ context: 'review-map', debug: true });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);

    expect(keyboard.press(event('F2'))).toBe(true);
    expect(keyboard.held('debug.gate')).toBe(true);
    expect(keyboard.press(event('KeyM'))).toBe(true);
    expect(commands.map(({ action, phase }) => [action, phase])).toEqual([
      ['debug.gate', 'down'],
      ['debug.review-map-toggle', 'down'],
    ]);
    expect(INPUT_BINDINGS.filter(({ contexts }) => contexts.includes('review-map')).map(({ id }) => id)).toEqual([
      'debug.gate',
      'debug.review-map-toggle',
    ]);
  });
  it('keeps noclip flight ungated and concurrent with ordinary movement', () => {
    const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS, storage()));
    let context: InputContext = 'noclip';
    keyboard.context = () => ({ context, debug: true });
    expect(keyboard.registry.binding('noclip.ascend')?.gate).toBeUndefined();
    expect(keyboard.registry.binding('noclip.descend')?.gate).toBeUndefined();
    expect(keyboard.press(event('Space'))).toBe(true);
    expect(keyboard.press(event('KeyW'))).toBe(true);
    expect(keyboard.press(event('KeyC'))).toBe(true);
    expect(keyboard.held('noclip.ascend')).toBe(true);
    expect(keyboard.held('movement.forward')).toBe(true);
    expect(keyboard.held('noclip.descend')).toBe(true);
    keyboard.release(event('Space'));
    keyboard.release(event('KeyW'));
    keyboard.release(event('KeyC'));

    context = 'play';
    keyboard.sync();
    expect(keyboard.press(event('Space'))).toBe(true);
    expect(keyboard.held('movement.jump')).toBe(true);
    expect(keyboard.held('noclip.ascend')).toBe(false);
    keyboard.release(event('Space'));
    keyboard.press(event('KeyC'));
    expect(keyboard.held('noclip.descend')).toBe(false);
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
      'deadvox.input-bindings',
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
    expect(capturedChord(event('AltLeft', { altKey: true }))).toEqual(expect.any(String));
    const keyboard = new KeyboardInput(new BindingRegistry(fixture, storage()));
    keyboard.context = () => ({ context: 'play', debug: true });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);
    expect(keyboard.press(event('KeyF', { ctrlKey: true }), true)).toBe(false);
    expect(keyboard.press(event('KeyF', { altKey: true }), true)).toBe(false);
    expect(commands).toEqual([]);
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
