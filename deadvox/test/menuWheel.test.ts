import { Window } from 'happy-dom';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mountMenuPointer } from '../src/ui/menuPointer.ts';
import { wheelPixels } from '../src/ui/wheel.ts';

const dom = new Window();
for (const key of ['document', 'HTMLElement', 'Element', 'WheelEvent'] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom[key] });
}
Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: dom.getComputedStyle.bind(dom) });
document.body.innerHTML =
  '<canvas></canvas><div id="game-cursor"></div><div id="overlay" hidden></div><div id="outer"><div id="pane"><span id="item">Item</span></div></div>';
const canvas = document.querySelector('canvas')!;
const input = { locked: true, menuPointer: true, cursorX: 20, cursorY: 40, moveMenuCursor: () => undefined };
const pane = document.querySelector<HTMLElement>('#pane')!;
const outer = document.querySelector<HTMLElement>('#outer')!;
const item = document.querySelector<HTMLElement>('#item')!;
const overlay = document.querySelector<HTMLElement>('#overlay')!;
for (const element of [pane, outer]) {
  element.style.overflowY = 'auto';
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 100 });
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 600 });
}
Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => item });
mountMenuPointer({ input, canvas, cursor: document.querySelector<HTMLElement>('#game-cursor')! });
let gameplayWheels = 0;
canvas.addEventListener('wheel', () => {
  gameplayWheels += 1;
});
const wheel = (target: Element, deltaY = 1, deltaMode = 2) => {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, deltaMode });
  target.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  input.locked = true;
  input.menuPointer = true;
  overlay.hidden = true;
  pane.scrollTop = 0;
  outer.scrollTop = 0;
  gameplayWheels = 0;
});
afterAll(() => dom.happyDOM.abort());

describe('shared menu wheel routing', () => {
  it('uses the nearest pane under the locked cursor, but the actual event target when free', () => {
    expect(wheel(canvas).defaultPrevented).toBe(true);
    expect(pane.scrollTop).toBe(100);
    expect(outer.scrollTop).toBe(0);
    expect(gameplayWheels).toBe(0);
    input.locked = false;
    input.menuPointer = false;
    expect(wheel(item, -2, 1).defaultPrevented).toBe(true);
    expect(pane.scrollTop).toBe(68);
  });

  it('consumes wheel input in a pane that fits, preventing chaining to the page or game', () => {
    Object.defineProperty(pane, 'scrollHeight', { configurable: true, value: 100 });
    expect(wheel(canvas).defaultPrevented).toBe(true);
    expect(outer.scrollTop).toBe(0);
    expect(gameplayWheels).toBe(0);
    Object.defineProperty(pane, 'scrollHeight', { configurable: true, value: 600 });
  });

  it('leaves the existing build wheel and locked main-card wheel routes untouched', () => {
    input.menuPointer = false;
    expect(wheel(canvas).defaultPrevented).toBe(false);
    input.menuPointer = true;
    overlay.hidden = false;
    expect(wheel(canvas).defaultPrevented).toBe(false);
    expect(pane.scrollTop).toBe(0);
    expect(gameplayWheels).toBe(2);
  });

  it('converts line and page wheel units to pixels', () => {
    expect(wheelPixels(3, 1, 400)).toBe(48);
    expect(wheelPixels(1, 2, 400)).toBe(400);
    expect(wheelPixels(120, 0, 400)).toBe(120);
  });
});
