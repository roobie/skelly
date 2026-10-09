// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { BindingRegistry, INPUT_BINDINGS, KeyboardInput } from '../src/game/inputBindings.ts';

it('keeps native text codes and defaults intact without emitting gameplay intents', () => {
  const keyboard = new KeyboardInput(
    new BindingRegistry([
      {
        id: 'fixture.walk',
        description: 'Fixture walking toggle',
        contexts: ['play'],
        defaults: [{ code: 'KeyZ' }],
        commands: [{ id: 'fixture.walk', kind: 'press' }],
      },
    ]),
  );
  keyboard.context = () => ({ context: 'play', debug: false });
  const commands: string[] = [];
  keyboard.command = ({ action, phase }) => {
    if (phase === 'down') {
      commands.push(action);
    }
  };
  const remove = keyboard.install();
  const search = document.createElement('input');
  const canvas = document.createElement('canvas');
  document.body.append(search, canvas);
  const observed: string[] = [];
  search.addEventListener('keydown', (domEvent) => observed.push((domEvent as KeyboardEvent).code));
  const event = (type: 'keydown' | 'keyup') =>
    new KeyboardEvent(type, { bubbles: true, cancelable: true, code: 'KeyZ' });
  try {
    const textDown = event('keydown');
    search.dispatchEvent(textDown);
    search.dispatchEvent(event('keyup'));
    expect(observed).toEqual(['KeyZ']);
    expect(textDown.code).toBe('KeyZ');
    expect(textDown.defaultPrevented).toBe(false);
    expect(commands).toEqual([]);
    const playDown = event('keydown');
    canvas.dispatchEvent(playDown);
    expect(playDown.defaultPrevented).toBe(true);
    expect(commands).toEqual(['fixture.walk']);
    canvas.dispatchEvent(event('keyup'));
  } finally {
    remove();
    search.remove();
    canvas.remove();
  }
});

it('gates native debug-checkbox activation but leaves text editing native', () => {
  const keyboard = new KeyboardInput(
    new BindingRegistry(
      [
        {
          id: 'debug.gate',
          description: 'Fixture debug gate',
          contexts: ['debug-panel'],
          defaults: [{ code: 'F2' }],
          commands: [{ id: 'debug.gate', kind: 'held-state' }],
          debug: true,
        },
      ],
      undefined,
    ),
  );
  keyboard.context = () => ({ context: 'debug-panel', debug: true });
  const remove = keyboard.install();
  const panel = document.createElement('section');
  panel.dataset.debugControls = '';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  const text = document.createElement('input');
  panel.append(checkbox, text);
  document.body.append(panel);
  const key = (target: EventTarget, code: string, type = 'keydown') => {
    const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, code });
    target.dispatchEvent(event);
    return event;
  };
  try {
    expect(key(checkbox, 'Space').defaultPrevented).toBe(true);
    key(checkbox, 'Space', 'keyup');
    expect(key(text, 'Space').defaultPrevented).toBe(false);
    key(text, 'Space', 'keyup');
    expect(key(panel, 'F2').defaultPrevented).toBe(true);
    expect(keyboard.held('debug.gate')).toBe(true);
    expect(key(checkbox, 'Space').defaultPrevented).toBe(false);
    key(checkbox, 'Space', 'keyup');
    key(panel, 'F2', 'keyup');
    expect(key(checkbox, 'Space').defaultPrevented).toBe(true);
  } finally {
    remove();
    panel.remove();
  }
});

it('routes inventory controls from a focused select but leaves picker navigation native', () => {
  const bindings = new BindingRegistry(INPUT_BINDINGS, undefined);
  const keyboard = new KeyboardInput(bindings);
  keyboard.context = () => ({ context: 'inventory', debug: false });
  const commands: string[] = [];
  keyboard.command = ({ action, phase }) => {
    if (phase === 'down') {
      commands.push(action);
    }
  };
  const remove = keyboard.install();
  const inventory = document.createElement('section');
  const select = document.createElement('select');
  inventory.append(select);
  document.body.append(inventory);
  select.focus();
  const key = (type: 'keydown' | 'keyup', code: string) =>
    new KeyboardEvent(type, { bubbles: true, cancelable: true, code });
  const press = (code: string) => {
    const down = key('keydown', code);
    select.dispatchEvent(down);
    select.dispatchEvent(key('keyup', code));
    return down;
  };
  try {
    expect(document.activeElement).toBe(select);
    const inventoryActions = [
      'ui.inventory-toggle',
      'ui.inventory-tab-items',
      'ui.inventory-tab-skills',
      'ui.inventory-tab-crafting',
    ];
    for (const action of inventoryActions) {
      const chord = bindings.chords(action)[0]!;
      const down = press(chord.code);
      expect(down.defaultPrevented).toBe(true);
      expect(commands.at(-1)).toBe(action);
    }

    commands.length = 0;
    const pickerActions = ['inventory.previous', 'inventory.next', 'inventory.best-pocket'];
    const pickerCodes = new Set(pickerActions.flatMap((action) => bindings.chords(action).map(({ code }) => code)));
    expect(pickerCodes.size).toBeGreaterThan(0);
    for (const code of pickerCodes) {
      expect(press(code).defaultPrevented).toBe(false);
    }
    expect(commands).toEqual([]);
    expect(document.activeElement).toBe(select);

    const textInput = document.createElement('input');
    textInput.type = 'text';
    inventory.append(textInput);
    textInput.focus();
    expect(document.activeElement).toBe(textInput);
    const tabCode = bindings.chords('ui.inventory-tab-items')[0]!.code;
    const textInputTab = key('keydown', tabCode);
    textInput.dispatchEvent(textInputTab);
    textInput.dispatchEvent(key('keyup', tabCode));
    expect(textInputTab.defaultPrevented).toBe(false);
    expect(commands).toEqual([]);
  } finally {
    remove();
    inventory.remove();
  }
});
