// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { BindingRegistry, INPUT_BINDINGS, KeyboardInput } from '../src/game/inputBindings.ts';

const dispatch = (target: EventTarget, code: string, modifiers: KeyboardEventInit = {}, cancelable = true) => {
  const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS, undefined));
  keyboard.context = () => ({ context: 'play', debug: false });
  const remove = keyboard.install();
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable, ...modifiers });
  target.dispatchEvent(event);
  remove();
  return event.defaultPrevented;
};

describe('Chrome DevTools shortcuts', () => {
  it('cancels cancelable DevTools shortcuts while the game has focus', () => {
    for (const code of ['KeyC', 'KeyI', 'KeyJ']) {
      expect(dispatch(globalThis, code, { ctrlKey: true, shiftKey: true })).toBe(true);
    }
    expect(dispatch(globalThis, 'F12')).toBe(true);
    expect(dispatch(globalThis, 'KeyC', { metaKey: true, shiftKey: true })).toBe(true);
    for (const code of ['KeyI', 'KeyJ']) {
      expect(dispatch(globalThis, code, { metaKey: true, altKey: true })).toBe(true);
    }
  });

  it('leaves editable fields and non-cancelable browser shortcuts alone', () => {
    const input = document.createElement('input');
    document.body.append(input);
    expect(dispatch(input, 'KeyI', { ctrlKey: true, shiftKey: true })).toBe(false);
    expect(dispatch(globalThis, 'KeyI', { ctrlKey: true, shiftKey: true }, false)).toBe(false);
    expect(dispatch(globalThis, 'KeyK', { ctrlKey: true, shiftKey: true })).toBe(false);
  });
});
