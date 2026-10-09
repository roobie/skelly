// @vitest-environment happy-dom
import { html, render } from 'lit-html';
import { afterEach, expect, it, vi } from 'vitest';
import { type ComboBoxOption, comboBox } from '../src/ui/comboBox.ts';
import { renderCrafting } from '../src/ui/crafting.ts';
import type { CraftRow } from '../src/ui/craftReadout.ts';

const OPTIONS: readonly ComboBoxOption[] = [
  { value: '', label: 'Cheapest available' },
  { value: 'rag', label: 'Rag' },
  { value: 'cloth_strip', label: 'Cloth strip' },
  { value: 'duct_tape', label: 'Duct tape' },
];

const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) {
    host.remove();
  }
});

const host = (): HTMLElement => {
  const element = document.createElement('div');
  document.body.append(element);
  hosts.push(element);
  return element;
};

/** Mounts a combo box whose owner renders the chosen value back, as crafting and the debug panel do. */
const mount = (initial = '') => {
  const root = host();
  let value = initial;
  const choose = vi.fn<(next: string) => void>();
  const draw = () => render(html`${comboBox({ label: 'Material', options: OPTIONS, value, choose })}`, root);
  choose.mockImplementation((next) => {
    value = next;
    draw();
  });
  draw();
  const field = root.querySelector<HTMLInputElement>('[role="combobox"]')!;
  const list = root.querySelector<HTMLElement>('[role="listbox"]')!;
  const options = () => [...list.querySelectorAll<HTMLElement>('[role="option"]')];
  return {
    field,
    list,
    choose,
    draw,
    shown: () => (list.hidden ? [] : options().map((option) => option.textContent)),
    option: (label: string) => options().find((option) => option.textContent === label)!,
    active: () => {
      const id = field.getAttribute('aria-activedescendant');
      return id ? root.querySelector(`#${id}`)?.textContent : undefined;
    },
    key: (key: string) => field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })),
    type: (text: string) => {
      field.value = text;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    },
  };
};

it('filters as the player types, keeps the filter through owner redraws, and chooses the highlight with Enter', () => {
  const box = mount();
  box.field.focus();

  box.type('ST');
  box.draw();

  expect(box.field.value).toBe('ST');
  expect(box.shown()).toEqual(['Cheapest available', 'Cloth strip']);
  box.key('ArrowDown');
  expect(box.active()).toBe('Cloth strip');
  box.key('Enter');
  expect(box.choose).toHaveBeenCalledExactlyOnceWith('cloth_strip');
  expect(box.list.hidden).toBe(true);
  expect(box.field.value).toBe('Cloth strip');
  expect(document.activeElement).not.toBe(box.field);
});

it('opens on Down at the chosen option and closes on Escape without choosing', () => {
  const box = mount('duct_tape');
  box.field.focus();

  box.key('ArrowDown');
  expect(box.field.getAttribute('aria-expanded')).toBe('true');
  expect(box.shown()).toEqual(OPTIONS.map(({ label }) => label));
  expect(box.active()).toBe('Duct tape');
  box.type('zz');
  expect(box.shown()).toEqual([]);
  expect(box.list.textContent).toContain('No matches');
  box.key('Escape');

  expect(box.list.hidden).toBe(true);
  expect(box.field.getAttribute('aria-expanded')).toBe('false');
  expect(box.field.value).toBe('Duct tape');
  expect(box.choose).not.toHaveBeenCalled();
  expect(document.activeElement).not.toBe(box.field);
});

it('opens on a click, ignores a press on its own option, chooses that option, and closes on a press outside', () => {
  const box = mount();
  const outside = host();
  box.field.focus();
  box.field.click();
  expect(box.list.hidden).toBe(false);

  outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(box.list.hidden).toBe(true);
  expect(box.choose).not.toHaveBeenCalled();

  box.field.click();
  // The drawn cursor forwards a press and then a click to the option under it.
  box.option('Rag').dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(box.list.hidden).toBe(false);
  box.option('Rag').click();
  expect(box.choose).toHaveBeenCalledExactlyOnceWith('rag');
  expect(box.list.hidden).toBe(true);
});

it('hangs the list below the field, or flips it above when it fits there better, within the viewport', () => {
  const box = mount();
  const rect = (top: number) => ({ top, bottom: top + 24, left: 40, right: 200, width: 160, height: 24 }) as DOMRect;
  Object.defineProperty(box.list, 'scrollHeight', { configurable: true, value: 300 });
  const fieldBox = vi.spyOn(box.field, 'getBoundingClientRect');

  fieldBox.mockReturnValue(rect(40));
  box.field.click();
  expect(box.list.style.top).toBe('64px');
  expect(box.list.style.bottom).toBe('auto');
  expect(Number.parseFloat(box.list.style.maxHeight)).toBeLessThanOrEqual(innerHeight - 64);
  box.key('Escape');

  fieldBox.mockReturnValue(rect(innerHeight - 64));
  box.field.click();
  expect(box.list.style.top).toBe('auto');
  expect(box.list.style.bottom).toBe('64px');
  expect(Number.parseFloat(box.list.style.maxHeight)).toBeLessThanOrEqual(innerHeight - 64);
});

it('sends a crafting material choice to the recipe preference', () => {
  const root = host();
  const row: CraftRow = {
    id: 'bandage',
    name: 'Bandage',
    kind: 'craft',
    time: '5 min',
    reason: undefined,
    components: [
      {
        group: 0,
        preferred: '',
        alternatives: [
          { id: 'rag', name: 'Rag', needed: 1, found: 1 },
          { id: 'cloth_strip', name: 'Cloth strip', needed: 1, found: 2 },
        ],
      },
    ],
    qualities: [],
    skills: [],
    workstation: null,
  };
  const prefer = vi.fn();
  renderCrafting(root, [row], { start: vi.fn(), prefer });
  const field = root.querySelector<HTMLInputElement>('[role="combobox"]')!;
  expect(field.getAttribute('aria-label')).toBe('Bandage material group 1');

  field.click();
  [...root.querySelectorAll<HTMLElement>('[role="option"]')]
    .find((option) => option.textContent === 'Cloth strip')!
    .click();

  expect(prefer).toHaveBeenCalledExactlyOnceWith('bandage', 0, 'cloth_strip');
});
