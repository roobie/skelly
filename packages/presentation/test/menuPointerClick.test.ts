import { Window } from 'happy-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { mountMenuPointer } from '../src/ui/menuPointer.ts';

const dom = new Window();
for (const key of ['document', 'HTMLElement', 'Element', 'MouseEvent'] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom[key] });
}
document.body.innerHTML =
  '<main id="view"><canvas></canvas></main><div id="game-cursor"></div><button id="control">Wood look</button><div id="elsewhere">Elsewhere</div>';
const view = document.querySelector<HTMLElement>('#view')!;
const canvas = document.querySelector('canvas')!;
const control = document.querySelector<HTMLButtonElement>('#control')!;
const elsewhere = document.querySelector<HTMLElement>('#elsewhere')!;
const input = { locked: true, menuPointer: true, cursorX: 20, cursorY: 40, moveMenuCursor: () => undefined };
Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => elsewhere });
mountMenuPointer({ input, canvas, cursor: document.querySelector<HTMLElement>('#game-cursor')! });

let forwarded = 0;
elsewhere.addEventListener('click', () => {
  forwarded += 1;
});

describe('menu pointer click forwarding', () => {
  beforeEach(() => {
    forwarded = 0;
    input.locked = true;
    input.menuPointer = true;
  });

  it('re-aims a press on the locked canvas at the drawn cursor', () => {
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(forwarded).toBe(1);
  });

  it('re-aims a press on the locked surface wrapper at the drawn cursor', () => {
    view.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(forwarded).toBe(1);
  });

  it('delivers a programmatic activation click to its own control', () => {
    let activated = 0;
    control.addEventListener('click', () => {
      activated += 1;
    });

    control.click();

    expect(activated).toBe(1);
    expect(forwarded).toBe(0);
  });
});
