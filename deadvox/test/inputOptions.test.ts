import { Window } from 'happy-dom';
import { afterAll, describe, expect, it } from 'vitest';
import {
  BindingRegistry,
  bindingConflict,
  bindingIsDebugOnly,
  DEBUG_ONLY_CONTEXTS,
  INPUT_BINDINGS,
  type InputContext,
  inputBindings,
  keyboardInput,
} from '../src/game/inputBindings.ts';

const contextWordSeparator = /[^a-z0-9-]+/;
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
const memoryStorage = () => {
  let saved: string | null = null;
  return {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
    removeItem: () => {
      saved = null;
    },
  };
};
const debugKeyCollision = () => {
  const debugGate = INPUT_BINDINGS.find(
    (binding) => bindingIsDebugOnly(binding) && INPUT_BINDINGS.some((candidate) => candidate.gate === binding.id),
  );
  if (!debugGate) {
    return;
  }
  const [debugChord] = debugGate.defaults;
  if (!debugChord) {
    return;
  }
  const ordinary = INPUT_BINDINGS.filter((binding) => !bindingIsDebugOnly(binding)).find((binding) => {
    const [ordinaryChord] = binding.defaults;
    if (
      !ordinaryChord ||
      (ordinaryChord.code === debugChord.code && ordinaryChord.modifier === debugChord.modifier) ||
      !binding.contexts.some((context) => debugGate.contexts.includes(context))
    ) {
      return false;
    }
    const chords = [debugChord, ...binding.defaults.slice(1)];
    const candidate = new Map([[binding.id, chords]]);
    const issue = bindingConflict(INPUT_BINDINGS, candidate);
    return (
      issue?.includes(binding.description) &&
      issue.includes(debugGate.description) &&
      bindingConflict(INPUT_BINDINGS, candidate, false) === undefined
    );
  });
  return ordinary ? { ordinary, debug: debugGate } : undefined;
};

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
    const headings = [...ordinaryRoot.querySelectorAll('section h3')].map(
      (heading) => heading.textContent?.trim() ?? '',
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

  it('does not name debug-only contexts in an ordinary-run rebind conflict', () => {
    const pair = INPUT_BINDINGS.flatMap((first, index) =>
      INPUT_BINDINGS.slice(index + 1).map((second) => ({ first, second })),
    ).find(({ first, second }) => {
      const shared = first.contexts.filter((context) => second.contexts.includes(context));
      const [firstChord] = first.defaults;
      const [secondChord] = second.defaults;
      return (
        !(bindingIsDebugOnly(first) || bindingIsDebugOnly(second)) &&
        first.gate === second.gate &&
        shared.some((context) => !DEBUG_ONLY_CONTEXTS.has(context)) &&
        firstChord !== undefined &&
        secondChord !== undefined &&
        (firstChord.code !== secondChord.code || firstChord.modifier !== secondChord.modifier)
      );
    });
    expect(pair).toBeDefined();
    const root = document.createElement('div');
    document.body.append(root);
    mountInputOptions(root);
    const button = rowFor(root, pair!.first.id)?.querySelector<HTMLButtonElement>(
      'button[data-binding-alternative="0"]',
    );
    expect(button).toBeDefined();
    button!.click();
    try {
      keyboardInput.capture?.(pair!.second.defaults[0]!);
      expect(inputBindings.chords(pair!.first.id)[0]).toEqual(pair!.first.defaults[0]);
      const status = root.querySelector('.input-binding-status')?.textContent?.trim() ?? '';
      const words = status.toLowerCase().split(contextWordSeparator);
      expect(status).not.toBe('');
      expect([...DEBUG_ONLY_CONTEXTS].every((context) => !words.includes(context))).toBe(true);
    } finally {
      keyboardInput.capture = undefined;
    }
  });

  it('allows an ordinary binding to take a debug-only key without naming the debug control', () => {
    const pair = debugKeyCollision();
    expect(pair).toBeDefined();
    const root = document.createElement('div');
    document.body.append(root);
    mountInputOptions(root);
    const button = rowFor(root, pair!.ordinary.id)?.querySelector<HTMLButtonElement>(
      'button[data-binding-alternative="0"]',
    );
    expect(button).toBeDefined();
    button!.click();
    try {
      keyboardInput.capture?.(pair!.debug.defaults[0]!);
      expect(inputBindings.chords(pair!.ordinary.id)[0]).toEqual(pair!.debug.defaults[0]);
      const status = root.querySelector('.input-binding-status')?.textContent?.trim() ?? '';
      expect(status).not.toBe('');
      expect(status).not.toContain(pair!.debug.description);
    } finally {
      keyboardInput.capture = undefined;
      inputBindings.reset();
    }
  });

  it('reports an ordinary binding that takes a debug-only key when a debug run loads preferences', () => {
    const pair = debugKeyCollision();
    expect(pair).toBeDefined();
    const storage = memoryStorage();
    const ordinaryRun = new BindingRegistry(INPUT_BINDINGS, storage);
    const chords = [pair!.debug.defaults[0]!, ...pair!.ordinary.defaults.slice(1)];
    expect(ordinaryRun.rebind(pair!.ordinary.id, chords, false)).toBeUndefined();
    const debugRun = new BindingRegistry(INPUT_BINDINGS, storage);
    debugRun.setDebugRun();
    expect(
      debugRun.diagnostics.some(
        (diagnostic) => diagnostic.includes(pair!.ordinary.description) && diagnostic.includes(pair!.debug.description),
      ),
    ).toBe(true);
    expect(debugRun.chords(pair!.ordinary.id)[0]).toEqual(pair!.ordinary.defaults[0]);
    expect(debugRun.chords(pair!.debug.id)[0]).toEqual(pair!.debug.defaults[0]);
    expect(debugRun.rebind(pair!.ordinary.id, chords, true)).toEqual(expect.any(String));
  });

  it('keeps a saved ordinary binding after an unrelated debug-run rebind', () => {
    const pair = debugKeyCollision();
    expect(pair).toBeDefined();
    const storage = memoryStorage();
    const ordinaryRun = new BindingRegistry(INPUT_BINDINGS, storage);
    const chords = [pair!.debug.defaults[0]!, ...pair!.ordinary.defaults.slice(1)];
    expect(ordinaryRun.rebind(pair!.ordinary.id, chords, false)).toBeUndefined();

    const debugRun = new BindingRegistry(INPUT_BINDINGS, storage);
    debugRun.setDebugRun();
    const unrelated = INPUT_BINDINGS.find(
      (binding) => !bindingIsDebugOnly(binding) && binding.id !== pair!.ordinary.id && binding.id !== pair!.debug.id,
    );
    expect(unrelated).toBeDefined();
    expect(debugRun.rebind(unrelated!.id, unrelated!.defaults, true)).toBeUndefined();

    const resumedOrdinaryRun = new BindingRegistry(INPUT_BINDINGS, storage);
    expect(resumedOrdinaryRun.chords(pair!.ordinary.id)[0]).toEqual(pair!.debug.defaults[0]);

    const replacementDebugRun = new BindingRegistry(INPUT_BINDINGS, storage);
    replacementDebugRun.setDebugRun();
    expect(replacementDebugRun.rebind(pair!.ordinary.id, pair!.ordinary.defaults, true)).toBeUndefined();
    const replacedOrdinaryRun = new BindingRegistry(INPUT_BINDINGS, storage);
    expect(replacedOrdinaryRun.chords(pair!.ordinary.id)[0]).toEqual(pair!.ordinary.defaults[0]);
  });
});
