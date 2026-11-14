// @vitest-environment happy-dom

import { html, render } from 'lit-html';
import { afterEach, expect, it, vi } from 'vitest';
import { comboBox } from '../src/ui/comboBox.ts';
import { firstFocusable } from '../src/ui/focus.ts';
import { mountMenuPointer } from '../src/ui/menuPointer.ts';

const canvas = document.createElement('canvas');
const cursor = document.createElement('div');
cursor.id = 'game-cursor';
document.body.append(canvas, cursor);
const input = { locked: true, menuPointer: true, cursorX: 20, cursorY: 40, moveMenuCursor: () => undefined };
let underCursor: Element | null = null;
Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => underCursor });
mountMenuPointer({ input, canvas, cursor });

const host = document.createElement('div');
document.body.append(host);
afterEach(() => {
  render(html``, host);
  (document.activeElement as HTMLElement | null)?.blur();
});

/** A real locked click lands on the canvas; the menu pointer forwards it to whatever is under the drawn cursor. */
const lockedClick = (under: Element) => {
  underCursor = under;
  canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};

it('focuses a button clicked through the drawn cursor, so Enter and Space then activate it', () => {
  render(html`<button id="fixture-button" type="button"><span id="fixture-label">fixture</span></button>`, host);
  const button = host.querySelector<HTMLElement>('#fixture-button')!;
  const clicked = vi.fn();
  button.addEventListener('click', clicked);

  lockedClick(host.querySelector('#fixture-label')!);

  expect(clicked).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(button);
});

it('keeps focus on the combo field when an option is clicked through the drawn cursor, and picks it', () => {
  const choose = vi.fn();
  const options = [
    { value: 'fixture-a', label: 'A' },
    { value: 'fixture-b', label: 'B' },
  ];
  render(html`${comboBox({ label: 'fixture', options, value: 'fixture-a', emptyLabel: 'none', choose })}`, host);
  const field = host.querySelector<HTMLInputElement>('[role="combobox"]')!;
  lockedClick(field);
  expect(document.activeElement).toBe(field);

  let focusedAtClick: Element | null = null;
  const record = (event: Event) => {
    if (event.target !== canvas) {
      focusedAtClick = document.activeElement;
    }
  };
  document.addEventListener('click', record, true);
  try {
    lockedClick(host.querySelectorAll('[role="option"]')[1]!);
  } finally {
    document.removeEventListener('click', record, true);
  }

  expect(focusedAtClick).toBe(field);
  expect(choose).toHaveBeenCalledExactlyOnceWith('fixture-b');
});

it('picks the first control that is enabled, shown and outside inert content', () => {
  render(
    html`<div style="display: none"><button>not shown</button></div><button disabled>disabled</button>
      <div inert><button>inert</button></div><p>text</p><button id="fixture-first">first</button><button>second</button>`,
    host,
  );

  expect(firstFocusable(host)).toBe(host.querySelector('#fixture-first'));
});
