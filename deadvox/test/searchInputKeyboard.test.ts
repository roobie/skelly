// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { BindingRegistry, KeyboardInput } from '../src/game/inputBindings.ts';

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
  search.addEventListener('keydown', (event) => observed.push((event as KeyboardEvent).code));
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
          defaults: [{ code: 'F1' }],
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
    expect(key(panel, 'F1').defaultPrevented).toBe(true);
    expect(keyboard.held('debug.gate')).toBe(true);
    expect(key(checkbox, 'Space').defaultPrevented).toBe(false);
    key(checkbox, 'Space', 'keyup');
    key(panel, 'F1', 'keyup');
    expect(key(checkbox, 'Space').defaultPrevented).toBe(true);
  } finally {
    remove();
    panel.remove();
  }
});
