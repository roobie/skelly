// biome-ignore-all lint/style/useNamingConvention: DOM code names retain their exact platform spelling.

import controlsFile from '../../../mods/skelly.controls/controls.json' with { type: 'json' };

import { type Binding, bindingIsDebugOnly, type Chord, INPUT_ACTIONS, type Modifier } from '../core/inputActions.ts';

const withDefaults = (defaults: ReadonlyMap<string, readonly Chord[]>): readonly Binding[] =>
  INPUT_ACTIONS.map((action) => ({ ...action, defaults: defaults.get(action.id) ?? [] }));
const BASE_DEFAULT_KEYS: BindingMap = new Map(
  (controlsFile as { controls: readonly { id: string; keys: readonly Chord[] }[] }).controls.map(({ id, keys }) => [
    id,
    keys,
  ]),
);
export const INPUT_BINDINGS: readonly Binding[] = withDefaults(BASE_DEFAULT_KEYS);
export const NATIVE_INPUTS = [
  { code: 'Escape', description: 'Release pointer lock / cancel binding capture' },
  { code: 'F10', description: 'Browser menu bar' },
  { code: 'F5', description: 'Browser reload' },
  { code: 'F11', description: 'Browser fullscreen' },
  { code: 'F12', description: 'Browser developer tools' },
] as const;
export const NATIVE_EDITING =
  'Text entry, composition, selection, clipboard, focus traversal and ordinary form activation use native browser controls. Ctrl/Cmd/Meta and Alt shortcuts are fixed, not game bindings; during play the game cancels them where the browser allows.';
export const REFUSED_MODIFIERS: readonly Modifier[] = ['ctrl', 'meta', 'alt'];
const modifierName: Readonly<Record<Modifier, string>> = { ctrl: 'Ctrl', meta: 'Cmd/Meta', alt: 'Alt', shift: 'Shift' };
export const modifierRefusal = (modifier: Modifier): string =>
  `${modifierName[modifier]} is browser-owned, not a game binding`;
export const modifierCodes: Readonly<Record<string, Modifier>> = {
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  AltLeft: 'alt',
  AltRight: 'alt',
  ControlLeft: 'ctrl',
  ControlRight: 'ctrl',
  MetaLeft: 'meta',
  MetaRight: 'meta',
};
export const modifiers: readonly Modifier[] = ['shift', 'alt', 'ctrl', 'meta'];
const otherCodes = new Set([
  'Space',
  'Tab',
  'Enter',
  'Backspace',
  'Minus',
  'Equal',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Semicolon',
  'Quote',
  'Backquote',
  'Comma',
  'Period',
  'Slash',
  'CapsLock',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Insert',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Pause',
  'PrintScreen',
  'NumLock',
  'NumpadAdd',
  'NumpadSubtract',
  'NumpadMultiply',
  'NumpadDivide',
  'NumpadDecimal',
  'NumpadEnter',
  ...Object.keys(modifierCodes),
  ...NATIVE_INPUTS.map(({ code }) => code),
]);
const physicalPattern = /^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/;
const pointerPattern = /^Mouse[0-4]$/;
const physicalCode = (code: string): boolean =>
  physicalPattern.test(code) || otherCodes.has(code) || pointerPattern.test(code);
export const chordIssue = (chord: Chord): string | undefined => {
  if (!physicalCode(chord.code)) {
    return 'Unknown physical key';
  }
  const native = NATIVE_INPUTS.find(({ code }) => code === chord.code);
  if (native) {
    return native.description;
  }
  const refused = REFUSED_MODIFIERS.find(
    (modifier) => chord.modifier === modifier || (modifier !== 'alt' && modifierCodes[chord.code] === modifier),
  );
  if (refused) {
    return modifierRefusal(refused);
  }
  if (chord.modifier && !modifiers.includes(chord.modifier)) {
    return 'Unknown modifier';
  }
  if (chord.modifier && modifierCodes[chord.code]) {
    return 'A modifier cannot modify itself';
  }
  return undefined;
};
export type BindingMap = ReadonlyMap<string, readonly Chord[]>;
const chordsFor = (binding: Binding, overrides: BindingMap): readonly Chord[] =>
  overrides.get(binding.id) ?? binding.defaults;
const sameChord = (a: Chord, b: Chord): boolean => a.code === b.code && a.modifier === b.modifier;
export const isHeld = (binding: Binding): boolean => binding.commands.some(({ kind }) => kind !== 'press');
const ownBindingIssue = (a: Binding, bindings: readonly Binding[], overrides: BindingMap): string | undefined => {
  const ac = chordsFor(a, overrides);
  if (a.plainKey && ac.some((chord) => chord.modifier || modifierCodes[chord.code])) {
    return `${a.description}: requires an unmodified, non-modifier key`;
  }
  if (ac.some((c, n) => ac.slice(n + 1).some((other) => sameChord(c, other)))) {
    return `${a.description}: duplicate alternative`;
  }
  if (a.gate) {
    const gate = bindings.find(({ id }) => id === a.gate);
    if (!gate) {
      return `${a.description}: missing gate`;
    }
    if (ac.some((c) => chordsFor(gate, overrides).some((g) => g.code === c.code))) {
      return `${a.description}: cannot share its gate key`;
    }
  }
  return undefined;
};
const gateKeyOverlap = (a: Binding, b: Binding): boolean =>
  a.id === b.gate || b.id === a.gate || a.id === 'debug.gate' || b.id === 'debug.gate';
const pairBindingIssue = (a: Binding, b: Binding, overrides: BindingMap): string | undefined => {
  const contexts = a.contexts.filter((context) => b.contexts.includes(context));
  if (contexts.length === 0) {
    return;
  }
  const gateKeyConflict = gateKeyOverlap(a, b);
  const ungatedDebugOverlap = (a.debug && !a.gate) || (b.debug && !b.gate);
  if (a.gate !== b.gate && !gateKeyConflict && !ungatedDebugOverlap) {
    return;
  }
  const overlap = chordsFor(a, overrides).some((x) =>
    chordsFor(b, overrides).some(
      (y) =>
        sameChord(x, y) ||
        (gateKeyConflict && x.code === y.code) ||
        (isHeld(a) && modifierCodes[x.code] === y.modifier && y.modifier !== undefined) ||
        (isHeld(b) && modifierCodes[y.code] === x.modifier && x.modifier !== undefined),
    ),
  );
  return overlap ? `${a.description} conflicts with ${b.description}` : undefined;
};
export const bindingConflict = (
  bindings: readonly Binding[],
  overrides: BindingMap,
  debugRun = true,
): string | undefined => {
  for (let i = 0; i < bindings.length; i++) {
    const a = bindings[i]!;
    if (!debugRun && bindingIsDebugOnly(a)) {
      continue;
    }
    const issue = ownBindingIssue(a, bindings, overrides);
    if (issue) {
      return issue;
    }
    for (const b of bindings.slice(i + 1)) {
      if (!debugRun && bindingIsDebugOnly(b)) {
        continue;
      }
      const conflict = pairBindingIssue(a, b, overrides);
      if (conflict) {
        return conflict;
      }
    }
  }
  return undefined;
};
const ACTION_IDS: ReadonlySet<string> = new Set(INPUT_ACTIONS.map(({ id }) => id));
export const controlRowIssue = (id: string, keys: readonly Chord[]): string | undefined => {
  if (!ACTION_IDS.has(id)) {
    return `unknown action ${id}`;
  }
  for (const chord of keys) {
    const issue = chordIssue(chord);
    if (issue) {
      return `${chord.modifier ? `${chord.modifier}+` : ''}${chord.code}: ${issue}`;
    }
  }
  return undefined;
};
/** Issues of a whole default-key set: actions left without a key, and key conflicts through `bindingConflict`. */
export const defaultKeySetIssues = (defaults: BindingMap): string[] => {
  const issues = INPUT_ACTIONS.filter(({ id }) => !defaults.get(id)?.length).map(
    ({ id }) => `action ${id} has no default key`,
  );
  const conflict = bindingConflict(withDefaults(defaults), new Map());
  return conflict ? [...issues, conflict] : issues;
};
const STORAGE_KEY = 'skelly.input-bindings';
export interface PreferenceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}
export type KeyboardLayoutSource = () => Promise<ReadonlyMap<string, string>> | undefined;
const parseChords = (value: unknown, count: number): readonly Chord[] | undefined => {
  if (!Array.isArray(value) || value.length !== count) {
    return;
  }
  const result: Chord[] = [];
  for (const candidate of value) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate) ||
      typeof candidate.code !== 'string' ||
      Object.keys(candidate).some((key) => key !== 'code' && key !== 'modifier')
    ) {
      return;
    }
    if (candidate.modifier !== undefined && !modifiers.includes(candidate.modifier)) {
      return;
    }
    const chord: Chord = { code: candidate.code, ...(candidate.modifier ? { modifier: candidate.modifier } : {}) };
    if (chordIssue(chord)) {
      return;
    }
    result.push(chord);
  }
  return result;
};
const punctuation: Readonly<Record<string, string>> = {
  Equal: '=',
  Minus: '−',
  Backquote: '`',
  Quote: "'",
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Comma: ',',
  Period: '.',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};
const codeLabel = (code: string, layout?: ReadonlyMap<string, string>): string => {
  const mouseLabels: Readonly<Record<string, string>> = {
    Mouse0: 'Left mouse',
    Mouse1: 'Middle mouse',
    Mouse2: 'Right mouse',
    Mouse3: 'Mouse 4',
    Mouse4: 'Mouse 5',
  };
  const label = layout?.get(code) || punctuation[code] || mouseLabels[code];
  if (label) {
    return label;
  }
  if (code.startsWith('Key')) {
    return code.slice(3);
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  if (code.startsWith('Shift')) {
    return 'Shift';
  }
  if (code.startsWith('Alt')) {
    return 'Alt';
  }
  return code;
};
const preferenceObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export class BindingRegistry {
  readonly bindings: readonly Binding[];
  readonly diagnostics: string[] = [];
  revision = 0;
  private overrides = new Map<string, readonly Chord[]>();
  private readonly suspended = new Map<string, readonly Chord[]>();
  private readonly listeners = new Set<(bindingsChanged: boolean) => void>();
  private layout: ReadonlyMap<string, string> | undefined;
  private pointerLabels: Readonly<Record<string, string>> = {};
  private readonly storage: PreferenceStorage | undefined;
  private readonly keyboardLayout: KeyboardLayoutSource | undefined;
  private debugRun = false;
  constructor(bindings = INPUT_BINDINGS, storage?: PreferenceStorage, keyboardLayout?: KeyboardLayoutSource) {
    this.bindings = bindings;
    this.storage = storage;
    this.keyboardLayout = keyboardLayout;
    let stored: unknown;
    try {
      stored = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    } catch {
      this.diagnostics.push('Keyboard preferences could not be read');
    }
    if (preferenceObject(stored)) {
      for (const binding of bindings) {
        if (!Object.hasOwn(stored, binding.id)) {
          continue;
        }
        const chords = parseChords(stored[binding.id], binding.defaults.length);
        if (!chords) {
          this.diagnostics.push(`${binding.description}: invalid stored binding`);
          continue;
        }
        const candidate = new Map(this.overrides).set(binding.id, chords);
        const issue = bindingConflict(bindings, candidate, false);
        if (issue) {
          this.diagnostics.push(issue);
        } else {
          this.overrides = candidate;
        }
      }
    }
  }
  setDebugRun(): void {
    if (this.debugRun) {
      return;
    }
    this.debugRun = true;
    const accepted = new Map<string, readonly Chord[]>();
    for (const binding of this.bindings) {
      const chords = this.overrides.get(binding.id);
      if (!chords) {
        continue;
      }
      const candidate = new Map(accepted).set(binding.id, chords);
      const issue = bindingConflict(this.bindings, candidate);
      if (issue) {
        this.diagnostics.push(issue);
        this.suspended.set(binding.id, chords);
      } else {
        accepted.set(binding.id, chords);
      }
    }
    this.overrides = accepted;
    this.changed(true);
  }
  chords(id: string): readonly Chord[] {
    const binding = this.binding(id);
    return binding ? chordsFor(binding, this.overrides) : [];
  }
  binding(id: string): Binding | undefined {
    return this.bindings.find((binding) => binding.id === id || binding.commands.some((command) => command.id === id));
  }
  label(id: string): string {
    const binding = this.binding(id);
    if (!binding) {
      return this.pointerLabels[id] ?? id;
    }
    return [...new Set(this.chords(binding.id).map((_, index) => this.alternativeLabel(binding.id, index)))].join(
      ' / ',
    );
  }
  alternativeLabel(id: string, index: number): string {
    const binding = this.binding(id);
    const chord = this.chords(id)[index];
    if (!(binding && chord)) {
      return id;
    }
    const prefix = binding.gate ? `${this.label(binding.gate)} + ` : '';
    return `${prefix}${chord.modifier ? `${modifierName[chord.modifier]} + ` : ''}${codeLabel(chord.code, this.layout)}`;
  }
  rebind(id: string, chords: readonly Chord[], debugRun = true): string | undefined {
    const binding = this.binding(id);
    if (!binding) {
      return 'Unknown action';
    }
    const issue = chords.map(chordIssue).find(Boolean);
    if (issue) {
      return issue;
    }
    if (!parseChords(chords, binding.defaults.length)) {
      return 'Invalid binding alternatives';
    }
    const candidate = new Map(this.overrides).set(
      binding.id,
      chords.map((chord) => ({ ...chord })),
    );
    const conflict = bindingConflict(this.bindings, candidate, debugRun);
    if (conflict) {
      return conflict;
    }
    this.overrides = candidate;
    this.suspended.delete(binding.id);
    this.persist();
    this.changed(true);
    return undefined;
  }
  reset(): void {
    this.overrides.clear();
    this.suspended.clear();
    this.persist();
    this.changed(true);
  }
  subscribe(listener: (bindingsChanged: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  setLayout(layout: ReadonlyMap<string, string>): void {
    this.layout = layout;
    this.changed(false);
  }
  /** Names the fixed pointer input of each pointer action that has no binding. */
  setPointerLabels(labels: Readonly<Record<string, string>>): void {
    this.pointerLabels = labels;
    this.changed(false);
  }
  async loadLayout(): Promise<void> {
    try {
      const layout = this.keyboardLayout?.();
      if (layout) {
        this.setLayout(await layout);
      }
    } catch {
      /* Physical-code labels remain available without browser permission. */
    }
  }
  private changed(bindingsChanged: boolean): void {
    this.revision += 1;
    for (const listener of this.listeners) {
      listener(bindingsChanged);
    }
  }
  private persist(): void {
    try {
      const preferences = new Map(this.suspended);
      for (const [id, chords] of this.overrides) {
        preferences.set(id, chords);
      }
      if (preferences.size > 0) {
        this.storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(preferences)));
      } else {
        this.storage?.removeItem(STORAGE_KEY);
      }
    } catch {
      this.diagnostics.push('Keyboard preferences could not be saved; this session still uses them');
    }
  }
}
