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

it('routes inventory toggle and tab keys from a focused combo box unless they type into its filter', () => {
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
  const field = document.createElement('input');
  field.setAttribute('role', 'combobox');
  const textInput = document.createElement('input');
  inventory.append(field, textInput);
  document.body.append(inventory);
  // A KeyG code types "g"; named keys such as Tab and ArrowDown carry their code as their key.
  const keyOf = (code: string) => (code.startsWith('Key') ? code.slice('Key'.length).toLowerCase() : code);
  const press = (target: HTMLElement, code: string) => {
    const init = { bubbles: true, cancelable: true, code, key: keyOf(code) };
    const down = new KeyboardEvent('keydown', init);
    target.dispatchEvent(down);
    target.dispatchEvent(new KeyboardEvent('keyup', init));
    return down;
  };
  try {
    field.focus();
    const inventoryActions = [
      'ui.inventory-toggle',
      'ui.inventory-tab-items',
      'ui.inventory-tab-skills',
      'ui.inventory-tab-crafting',
      'ui.inventory-tab-actions',
    ];
    const routed = inventoryActions.map((action) => {
      const { code } = bindings.chords(action)[0]!;
      commands.length = 0;
      const down = press(field, code);
      return { action, typed: keyOf(code).length === 1, prevented: down.defaultPrevented, commands: [...commands] };
    });
    // Both kinds must be present, or the test would pass without exercising the rule.
    expect(routed.some(({ typed }) => typed)).toBe(true);
    expect(routed.some(({ typed }) => !typed)).toBe(true);
    for (const { action, typed, prevented, commands: sent } of routed) {
      expect({ action, prevented, sent }).toEqual(
        typed ? { action, prevented: false, sent: [] } : { action, prevented: true, sent: [action] },
      );
    }

    commands.length = 0;
    const listActions = ['inventory.previous', 'inventory.next', 'inventory.best-pocket'];
    const listCodes = new Set(listActions.flatMap((action) => bindings.chords(action).map(({ code }) => code)));
    expect(listCodes.size).toBeGreaterThan(0);
    for (const code of listCodes) {
      expect(press(field, code).defaultPrevented).toBe(false);
    }
    expect(commands).toEqual([]);

    textInput.focus();
    const toggleCode = bindings.chords('ui.inventory-toggle')[0]!.code;
    expect(press(textInput, toggleCode).defaultPrevented).toBe(false);
    expect(commands).toEqual([]);
  } finally {
    remove();
    inventory.remove();
  }
});
