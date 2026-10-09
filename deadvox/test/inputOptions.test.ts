import { Window } from 'happy-dom';
import { afterAll, describe, expect, it } from 'vitest';
import {
  bindingIsDebugOnly,
  DEBUG_ONLY_CONTEXTS,
  INPUT_BINDINGS,
  type InputContext,
} from '../src/game/inputBindings.ts';

const dom = new Window();
for (const key of [
  'document',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'PointerEvent',
  'KeyboardEvent',
  'Document',
  'DocumentFragment',
] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom[key] });
}
Object.defineProperty(globalThis, 'window', { configurable: true, value: dom });
const { mountInputOptions } = await import('../src/ui/inputOptions.ts');

afterAll(() => dom.happyDOM.abort());

const rowFor = (root: HTMLElement, id: string): HTMLElement | undefined =>
  [...root.querySelectorAll<HTMLElement>('.input-binding-row')].find((row) => row.dataset.bindingId === id);
const contextLabels = (row: HTMLElement): string[] =>
  (row.querySelector('small')?.textContent ?? '').split(',').map((label) => label.trim());

describe('input options context visibility', () => {
  it('hides debug-only rows and context names in ordinary runs but keeps them in debug runs', () => {
    const ordinaryRoot = document.createElement('div');
    const debugRoot = document.createElement('div');
    document.body.append(ordinaryRoot, debugRoot);
    const debugOnly = INPUT_BINDINGS.filter(bindingIsDebugOnly);
    const shared = INPUT_BINDINGS.filter(
      (binding) =>
        !bindingIsDebugOnly(binding) &&
        binding.contexts.some((context) => DEBUG_ONLY_CONTEXTS.has(context)) &&
        binding.contexts.some((context) => !DEBUG_ONLY_CONTEXTS.has(context)),
    );
    expect(debugOnly.length).toBeGreaterThan(0);
    expect(shared.length).toBeGreaterThan(0);

    mountInputOptions(ordinaryRoot);
    const headings = [...ordinaryRoot.querySelectorAll('section h3')].map((heading) =>
      heading.textContent?.trim() ?? '',
    );
    expect(headings.every((heading) => !DEBUG_ONLY_CONTEXTS.has(heading as InputContext))).toBe(true);
    expect(debugOnly.every(({ id }) => rowFor(ordinaryRoot, id) === undefined)).toBe(true);
    for (const binding of shared) {
      const row = rowFor(ordinaryRoot, binding.id);
      expect(row).toBeDefined();
      const labels = contextLabels(row!);
      expect(labels.length).toBeGreaterThan(0);
      expect(labels.every((context) => !DEBUG_ONLY_CONTEXTS.has(context as InputContext))).toBe(true);
      expect(labels.every((context) => binding.contexts.includes(context as InputContext))).toBe(true);
    }

    mountInputOptions(debugRoot, true);
    expect(debugOnly.every(({ id }) => rowFor(debugRoot, id) !== undefined)).toBe(true);
    expect(
      INPUT_BINDINGS.every((binding) => {
        const row = rowFor(debugRoot, binding.id);
        return row && binding.contexts.every((context) => contextLabels(row).includes(context));
      }),
    ).toBe(true);
  });
});
