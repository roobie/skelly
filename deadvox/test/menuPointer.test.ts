import { Window } from 'happy-dom';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { mountMenuPointer } from '../src/ui/menuPointer.ts';

const dom = new Window();
for (const key of ['document', 'Element', 'HTMLElement', 'Event', 'MouseEvent'] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom[key] });
}
document.body.innerHTML = '<canvas></canvas><select><option>First</option></select><button>Continue</button><div id="cursor"></div>';
const canvas = document.querySelector('canvas')!;
const select = document.querySelector('select')!;
const button = document.querySelector('button')!;
const input = { locked: true, menuPointer: true, cursorX: 10, cursorY: 10, moveMenuCursor: () => undefined };
Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => select });
mountMenuPointer({ input, canvas, cursor: document.querySelector<HTMLElement>('#cursor')! });

afterAll(() => dom.happyDOM.abort());

describe('locked menu pointer click forwarding', () => {
  it('opens a native select with showPicker without synthesizing its click, while forwarding buttons', () => {
    const focus = vi.spyOn(select, 'focus');
    const showPicker = vi.fn();
    Object.defineProperty(select, 'showPicker', { configurable: true, value: showPicker });
    const selectClick = vi.fn();
    select.addEventListener('click', selectClick);
    const selectClickOnCanvas = new MouseEvent('click', { bubbles: true, cancelable: true });

    canvas.dispatchEvent(selectClickOnCanvas);

    expect(selectClickOnCanvas.defaultPrevented).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
    expect(showPicker).toHaveBeenCalledOnce();
    expect(selectClick).not.toHaveBeenCalled();

    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => button });
    const buttonClick = vi.fn();
    button.addEventListener('click', buttonClick);
    const buttonClickOnCanvas = new MouseEvent('click', { bubbles: true, cancelable: true });

    canvas.dispatchEvent(buttonClickOnCanvas);

    expect(buttonClickOnCanvas.defaultPrevented).toBe(true);
    expect(buttonClick).toHaveBeenCalledOnce();
  });
});
