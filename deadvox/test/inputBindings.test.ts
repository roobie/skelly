import { describe, expect, it } from 'vitest';
import {
  type Binding,
  BindingRegistry,
  bindingConflict,
  capturedChord,
  chordIssue,
  INPUT_BINDINGS,
  type InputCommand,
  type InputContext,
  KeyboardInput,
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
    defaults: [{ code: 'F1' }],
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
    expect(restored.label('fixture.debug')).toBe('F1 + F');
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
  it('refuses browser modifiers without forbidding Alt or native text shortcuts', () => {
    for (const extra of [{ ctrlKey: true }, { metaKey: true }]) {
      expect(typeof capturedChord(event('KeyJ', extra))).toBe('string');
    }
    expect(capturedChord(event('ControlLeft', { ctrlKey: true }))).toEqual(expect.any(String));
    expect(capturedChord(event('KeyJ', { altKey: true }))).toEqual({ code: 'KeyJ', modifier: 'alt' });
    const keyboard = new KeyboardInput(new BindingRegistry(fixture, storage()));
    keyboard.context = () => ({ context: 'play', debug: true });
    const commands: InputCommand[] = [];
    keyboard.command = (command) => commands.push(command);
    expect(keyboard.press(event('KeyF', { ctrlKey: true }), true)).toBe(false);
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
    keyboard.press(event('F1'));
    expect(keyboard.press(event('F1', { repeat: true }))).toBe(true);
    expect(keyboard.held('debug.gate')).toBe(true);
    commands.length = 0;
    keyboard.press(event('KeyF'));
    keyboard.press(event('KeyF', { repeat: true }));
    expect(commands).toEqual([{ action: 'fixture.debug', phase: 'down', at: 0 }]);
    context = 'inventory';
    keyboard.sync();
    expect(keyboard.press(event('KeyF', { repeat: true }))).toBe(false);
    keyboard.release(event('KeyF'));
    keyboard.release(event('F1'));
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
    expect(keyboard.registry.label('fixture.debug')).toBe('F2 + F');
    expect(keyboard.press(event('F1'))).toBe(false);
    keyboard.release(event('F1'));
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
