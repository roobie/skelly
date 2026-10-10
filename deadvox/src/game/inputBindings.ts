// biome-ignore-all lint/style/useNamingConvention: DOM code names retain their exact platform spelling.
// biome-ignore-all lint/style/noExcessiveClassesPerFile: preferences and their single DOM resolver share the enforced keyboard boundary.

export const INPUT_CONTEXTS = {
  title: false,
  menu: false,
  inventory: false,
  reading: false,
  spawn: true,
  'debug-panel': true,
  'review-map': true,
  build: true,
  noclip: true,
  play: false,
  interrupted: false,
} as const satisfies Record<string, boolean>;
export type InputContext = keyof typeof INPUT_CONTEXTS;
export const DEBUG_ONLY_CONTEXTS: ReadonlySet<InputContext> = new Set(
  (Object.keys(INPUT_CONTEXTS) as InputContext[]).filter((context) => INPUT_CONTEXTS[context]),
);
type PressKind = 'press' | 'held-state' | 'hold' | 'double-press' | 'tap-then-hold';
export type Modifier = 'shift' | 'alt' | 'ctrl' | 'meta';
export interface Chord {
  readonly code: string;
  readonly modifier?: Modifier;
}
export interface Binding {
  readonly id: string;
  readonly device?: 'keyboard' | 'pointer';
  readonly description: string;
  readonly contexts: readonly InputContext[];
  readonly commands: readonly { readonly id: string; readonly kind: PressKind }[];
  readonly defaults: readonly Chord[];
  readonly gate?: string;
  readonly debug?: boolean;
  readonly repeat?: boolean;
  readonly text?: boolean;
  readonly plainKey?: boolean;
  readonly holdMs?: number;
}
export const bindingIsDebugOnly = (binding: Binding): boolean =>
  binding.debug === true || binding.contexts.every((context) => DEBUG_ONLY_CONTEXTS.has(context));
export const contextsForRun = (binding: Binding, debugRun: boolean): readonly InputContext[] =>
  debugRun ? binding.contexts : binding.contexts.filter((context) => !DEBUG_ONLY_CONTEXTS.has(context));
const world: readonly InputContext[] = ['play', 'noclip'];
const moving: readonly InputContext[] = [...world, 'build'];
const movingWhileReading: readonly InputContext[] = [...moving, 'reading'];
const entered: readonly InputContext[] = [
  'menu',
  'inventory',
  'reading',
  'spawn',
  'debug-panel',
  ...moving,
  'interrupted',
];
const all: readonly InputContext[] = ['title', ...entered];
export const HUD_HINTS_HOLD_MS = 1000;
// biome-ignore lint/complexity/useMaxParams: compact declarations keep alternative keys and gesture metadata in one catalogue.
const row = (
  id: string,
  description: string,
  contexts: readonly InputContext[],
  codes: readonly string[],
  kind: PressKind = 'press',
  extra: Partial<Binding> = {},
): Binding => ({
  id,
  description,
  contexts,
  commands: [{ id, kind }],
  defaults: codes.map((code) => ({ code })),
  ...extra,
});
const debugRow = (
  id: string,
  description: string,
  code: string,
  contexts: readonly InputContext[] = entered,
): Binding => row(id, description, contexts, [code], 'press', { debug: true, gate: 'debug.gate' });
const debugModifiedRow = (id: string, description: string, code: string, modifier: Modifier): Binding => ({
  ...debugRow(id, description, code),
  defaults: [{ code, modifier }],
});
const INVENTORY_TAB_BINDINGS = [
  { action: 'ui.inventory-tab-items', description: 'Open / select Items tab', tab: 'items', code: 'KeyG' },
  { action: 'ui.inventory-tab-skills', description: 'Open / select Skills tab', tab: 'skills', code: 'KeyV' },
  { action: 'ui.inventory-tab-crafting', description: 'Open / select Crafting tab', tab: 'crafting', code: 'KeyB' },
  { action: 'ui.inventory-tab-actions', description: 'Open / select Actions tab', tab: 'actions', code: 'KeyH' },
] as const;
const INVENTORY_COMBO_BOX_BINDINGS: ReadonlySet<string> = new Set([
  'ui.inventory-toggle',
  ...INVENTORY_TAB_BINDINGS.map(({ action }) => action),
]);
export const inventoryTabForAction = (action: string) =>
  INVENTORY_TAB_BINDINGS.find((binding) => binding.action === action)?.tab;

export const INPUT_BINDINGS: readonly Binding[] = [
  row('stance.ready', 'Hold to ready a firearm or enter en-garde', world, ['Mouse2'], 'held-state', {
    device: 'pointer',
  }),
  row('aim.ads-toggle', 'Toggle sights while firearm is ready', world, ['Mouse1'], 'press', { device: 'pointer' }),
  row('movement.forward', 'Move forward', movingWhileReading, ['KeyW'], 'held-state'),
  row('movement.back', 'Move backward', movingWhileReading, ['KeyS'], 'held-state'),
  row('movement.left', 'Move left', movingWhileReading, ['KeyA'], 'held-state'),
  row('movement.right', 'Move right', movingWhileReading, ['KeyD'], 'held-state'),
  row('movement.sprint', 'Sprint', moving, ['ShiftLeft', 'ShiftRight'], 'held-state'),
  row('movement.walk-toggle', 'Walk / jog', moving, ['KeyZ']),
  row('player.crouch-toggle', 'Toggle crouch', ['play', 'build'], ['KeyC']),
  row('player.throw', 'Tap to toggle throwing stance; hold to drop a held item', ['play'], ['KeyT']),
  row('movement.jump', 'Jump', ['play', 'build'], ['Space'], 'held-state'),
  row('noclip.ascend', 'Ascend while flying', ['noclip'], ['Space'], 'held-state'),
  row('noclip.descend', 'Descend while flying', ['noclip'], ['KeyC'], 'held-state'),
  row('hand.use-off', 'Use off hand', world, ['Equal']),
  row('world.interact', 'Tap to interact or pocket a ground item; hold to wield it', world, ['KeyF']),
  row(
    'firearm.reload',
    'Hold to load or change to the fullest carried magazine; double-press to work the charging handle or rack; tap, then hold to remove the magazine; tap does nothing',
    world,
    ['KeyR'],
    'hold',
    {
      commands: [
        { id: 'firearm.load', kind: 'hold' },
        { id: 'firearm.rack', kind: 'double-press' },
        { id: 'firearm.remove', kind: 'tap-then-hold' },
      ],
    },
  ),
  row('ui.inventory-toggle', 'Open / close inventory', [...moving, 'inventory'], ['Tab']),
  ...INVENTORY_TAB_BINDINGS.map(({ action, description, code }) =>
    row(action, description, [...moving, 'inventory'], [code]),
  ),
  row('ui.main-menu-toggle', 'Main menu', entered, ['F9'], 'press', { text: true }),
  row('hud.toggle-interaction-hints', 'Hold to toggle interaction hints', entered, ['Backquote'], 'hold', {
    holdMs: HUD_HINTS_HOLD_MS,
  }),
  row('handling.stop', 'Stop handling or a long action', [...moving, 'inventory', 'interrupted'], ['KeyX']),
  row('craft.continue', 'Continue stopped crafting', ['play'], ['Enter']),
  row('compression.continue', 'Continue after an interruption', ['interrupted'], ['Enter']),
  ...Array.from({ length: 5 }, (_, i) =>
    row(
      `quickbar.use.${i + 1}`,
      `Quickbar ${i + 1}: tap to take or put away; hold to use`,
      world,
      [`Digit${i + 1}`],
      'hold',
    ),
  ),
  ...Array.from({ length: 5 }, (_, i) =>
    row(`quickbar.assign.${i + 1}`, `Assign quickbar ${i + 1}`, ['inventory'], [`Digit${i + 1}`]),
  ),
  row('inventory.previous', 'Select previous item', ['inventory'], ['ArrowUp', 'ArrowLeft'], 'press', { repeat: true }),
  row('inventory.next', 'Select next item', ['inventory'], ['ArrowDown', 'ArrowRight'], 'press', { repeat: true }),
  row('inventory.search', 'Search next container', ['inventory'], ['KeyS']),
  row('inventory.hands', 'Wield selected item', ['inventory'], ['KeyW']),
  row('inventory.wear', 'Wear or remove', ['inventory'], ['KeyY']),
  row('inventory.drop', 'Drop selected item', ['inventory'], ['KeyD']),
  row('inventory.rotate', 'Rotate selected or dragged item', ['inventory'], ['KeyR']),
  row('inventory.best-pocket', 'Move to best pocket', ['inventory'], ['Enter']),
  row('inventory.take-all-like', 'Take all like selected item', ['inventory'], ['KeyA']),
  row(
    'inventory.quick-action-gate',
    'Hold and click an item for its quick action',
    ['inventory'],
    ['KeyT'],
    'held-state',
    { plainKey: true },
  ),
  row('reading.close', 'Put away reading', ['reading'], ['Tab']),
  row('reading.line-up', 'Read previous line', ['reading'], ['ArrowUp'], 'press', { repeat: true }),
  row('reading.line-down', 'Read next line', ['reading'], ['ArrowDown'], 'press', { repeat: true }),
  row('reading.page-up', 'Read previous page', ['reading'], ['PageUp'], 'press', { repeat: true }),
  row('reading.page-down', 'Read next page', ['reading'], ['PageDown', 'Space'], 'press', { repeat: true }),
  row('reading.first', 'Read from beginning', ['reading'], ['Home'], 'press', { repeat: true }),
  row('reading.last', 'Read to end', ['reading'], ['End'], 'press', { repeat: true }),
  row('spawn.previous', 'Select previous spawn item', ['spawn'], ['ArrowUp'], 'press', { repeat: true, text: true }),
  row('spawn.next', 'Select next spawn item', ['spawn'], ['ArrowDown'], 'press', { repeat: true, text: true }),
  row('spawn.dismiss', 'Close spawn menu', ['spawn'], ['Tab'], 'press', { text: true }),
  row('spawn.confirm', 'Spawn selected item', ['spawn'], ['Enter'], 'press', { debug: true, text: true }),
  row('debug.gate', 'Hold for debug commands', [...all, 'review-map'], ['F2'], 'held-state', {
    debug: true,
    text: true,
  }),
  debugRow('debug.panel-toggle', 'Debug panel', 'Backquote', all),
  debugModifiedRow('debug.input-replay-export', 'Export input replay', 'Backquote', 'shift'),
  debugModifiedRow('debug.input-replay-import', 'Import input replay', 'KeyI', 'shift'),
  debugRow('debug.performance-toggle', 'Performance overlay', 'F4', all),
  debugRow('debug.build-toggle', 'Build tools', 'KeyB'),
  debugRow('debug.impact-laser', 'Impact laser', 'KeyC'),
  debugRow('debug.spawn-menu-toggle', 'Spawn item menu', 'KeyG'),
  debugRow('debug.god-toggle', 'God mode', 'KeyH'),
  debugRow('debug.noclip-toggle', 'Noclip', 'KeyP'),
  debugRow('debug.spectator-camera-toggle', 'Spectator camera', 'F6'),
  debugRow('debug.third-person-toggle', 'Third-person avatar view', 'Numpad0'),
  debugRow('debug.perception-labels-toggle', 'Perception labels', 'F7'),
  debugRow('debug.spawn-unaware-shambler', 'Spawn unaware shambler', 'Numpad3'),
  debugRow('debug.test-noise', 'Test noise', 'F8'),
  debugRow('debug.compression-test', 'Compression test', 'KeyT'),
  debugRow('debug.interruption-test', 'Emit interruption', 'KeyN'),
  debugRow('debug.danger-test', 'Danger test', 'KeyU'),
  debugRow('debug.hurt', 'Take damage', 'KeyK'),
  debugRow('debug.spawn-shamblers', 'Spawn shamblers', 'KeyV'),
  debugRow('debug.spawn-runner', 'Spawn runner', 'Numpad1'),
  debugRow('debug.spawn-crawler', 'Spawn crawler', 'Numpad2'),
  debugRow('debug.spawn-amalgam', 'Spawn amalgam', 'Numpad4'),
  debugRow('debug.melee-aim-toggle', 'Melee aim boxes', 'KeyY'),
  debugRow('debug.freeze-shamblers', 'Freeze shamblers', 'KeyO'),
  debugRow('debug.review-map-toggle', 'Review map', 'KeyM', ['play', 'noclip', 'review-map']),
  debugRow('debug.freeze-game', 'Freeze game', 'Numpad5'),
  debugRow('debug.tone-cycle', 'Tone mapping', 'KeyJ'),
  debugRow('debug.exposure-decrease', 'Exposure −', 'Minus'),
  debugRow('debug.exposure-increase', 'Exposure +', 'Equal'),
  debugRow('debug.linear-colours-toggle', 'sRGB block colours', 'KeyI'),
  debugRow('debug.patterns-toggle', 'Surface patterns', 'Semicolon'),
  debugRow('debug.ambient-occlusion-toggle', 'Wide ambient occlusion', 'KeyA'),
  debugRow('debug.post-toggle', 'Mood post-processing', 'KeyF'),
  debugRow('debug.bloom-toggle', 'Bloom', 'Quote'),
  debugRow('debug.bloom-clip-decrease', 'Bloom clip −', 'Delete'),
  debugRow('debug.bloom-clip-increase', 'Bloom clip +', 'Insert'),
  debugRow('debug.torch-decrease', 'Flashlight strength −', 'NumpadSubtract'),
  debugRow('debug.torch-increase', 'Flashlight strength +', 'NumpadAdd'),
  debugRow('debug.film-toggle', 'Film', 'Backslash'),
  debugRow('debug.sun-shadow-toggle', 'Sun shadows', 'Digit0'),
  debugRow('debug.torch-shadow-toggle', 'Flashlight shadows', 'Home'),
  debugRow('debug.shadow-distance-cycle', 'Sun shadow distance', 'PageUp'),
  debugRow('debug.crack-check-toggle', 'Crack check', 'End'),
  debugRow('debug.hot-pixel-check-toggle', 'Hot pixel check', 'PageDown'),
  debugRow('debug.fog-decrease', 'Fogginess −', 'KeyL'),
  debugRow('debug.fog-increase', 'Fogginess +', 'Slash'),
  debugRow('debug.grade-decrease', 'Grade −', 'BracketLeft'),
  debugRow('debug.grade-increase', 'Grade +', 'BracketRight'),
  debugRow('debug.skip-long', 'Skip to preceding hour tomorrow', 'Comma'),
  debugRow('debug.skip-hour', 'Skip one hour', 'Period'),
  ...Array.from({ length: 9 }, (_, i) =>
    debugRow(`debug.build-slot.${i + 1}`, `Select build slot ${i + 1}`, `Digit${i + 1}`, ['build']),
  ),
];
export const POINTER_ACTIONS = [
  {
    id: 'hand.use-dominant',
    description: 'Use dominant hand; hold to fire automatically when ready',
    label: 'Left click',
  },
  { id: 'hand.off-instant', description: 'Instant off-hand use', label: 'Mouse 5' },
  { id: 'stance.ready', description: 'Hold to ready a firearm or enter en-garde', label: 'Right mouse' },
  { id: 'aim.ads-toggle', description: 'Toggle sights while firearm is ready', label: 'Mouse 3' },
  { id: 'pointer.look', description: 'Look', label: 'Mouse' },
] as const;
export const NATIVE_INPUTS = [
  { code: 'Escape', description: 'Release pointer lock / cancel binding capture' },
  { code: 'F10', description: 'Browser menu bar' },
  { code: 'F5', description: 'Browser reload' },
  { code: 'F11', description: 'Browser fullscreen' },
  { code: 'F12', description: 'Browser developer tools' },
] as const;
export const NATIVE_EDITING =
  'Text entry, composition, selection, clipboard, focus traversal and ordinary form activation use native browser controls. Ctrl/Cmd/Meta and Alt browser shortcuts are fixed, not game bindings.';
export const REFUSED_MODIFIERS: readonly Modifier[] = ['ctrl', 'meta', 'alt'];
const modifierName: Readonly<Record<Modifier, string>> = { ctrl: 'Ctrl', meta: 'Cmd/Meta', alt: 'Alt', shift: 'Shift' };
const modifierRefusal = (modifier: Modifier): string =>
  `${modifierName[modifier]} is browser-owned, not a game binding`;
const modifierCodes: Readonly<Record<string, Modifier>> = {
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  AltLeft: 'alt',
  AltRight: 'alt',
  ControlLeft: 'ctrl',
  ControlRight: 'ctrl',
  MetaLeft: 'meta',
  MetaRight: 'meta',
};
const modifiers: readonly Modifier[] = ['shift', 'alt', 'ctrl', 'meta'];
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
  if (chord.code === 'KeyQ' || chord.code === 'KeyE') {
    return 'Reserved for lean';
  }
  const native = NATIVE_INPUTS.find(({ code }) => code === chord.code);
  if (native) {
    return native.description;
  }
  const refused = REFUSED_MODIFIERS.find(
    (modifier) => chord.modifier === modifier || modifierCodes[chord.code] === modifier,
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
const isHeld = (binding: Binding): boolean => binding.commands.some(({ kind }) => kind !== 'press');
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
const STORAGE_KEY = 'deadvox.input-bindings';
interface PreferenceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}
const browserStorage = (): PreferenceStorage | undefined => {
  if (typeof globalThis.window === 'undefined') {
    return;
  }
  try {
    return globalThis.window.localStorage;
  } catch {
    // Browser preferences must not veto play when storage access is denied.
    return undefined;
  }
};
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
  private readonly storage: PreferenceStorage | undefined;
  private debugRun = false;
  constructor(bindings = INPUT_BINDINGS, storage = browserStorage()) {
    this.bindings = bindings;
    this.storage = storage;
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
      return POINTER_ACTIONS.find((action) => action.id === id)?.label ?? id;
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
  async loadLayout(): Promise<void> {
    const keyboard = (
      globalThis.navigator as Navigator & { keyboard?: { getLayoutMap: () => Promise<ReadonlyMap<string, string>> } }
    )?.keyboard;
    try {
      if (keyboard) {
        this.setLayout(await keyboard.getLayoutMap());
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
export interface KeyboardState {
  readonly context: InputContext;
  readonly debug: boolean;
}
export interface InputCommand {
  readonly action: string;
  readonly phase: 'down' | 'up';
  readonly at: number;
}
type KeyEvent = Pick<
  KeyboardEvent,
  'code' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'repeat' | 'isComposing' | 'timeStamp'
>;
type ForwardedKey = Pick<
  KeyboardEvent,
  'code' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'repeat' | 'isComposing'
>;
const flags: Readonly<Record<Modifier, keyof Pick<KeyboardEvent, 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>>> = {
  shift: 'shiftKey',
  alt: 'altKey',
  ctrl: 'ctrlKey',
  meta: 'metaKey',
};
export const capturedChord = (event: KeyEvent): Chord | string => {
  const refused = REFUSED_MODIFIERS.find(
    (modifier) => event[flags[modifier]] || modifierCodes[event.code] === modifier,
  );
  if (refused) {
    return modifierRefusal(refused);
  }
  const active = modifiers.filter((modifier) => event[flags[modifier]] && modifierCodes[event.code] !== modifier);
  if (active.length > 1) {
    return 'Choose at most one modifier';
  }
  const chord: Chord = { code: event.code, ...(active[0] ? { modifier: active[0] } : {}) };
  return chordIssue(chord) ?? chord;
};
const browserEscape = (event: Pick<KeyboardEvent, 'code'>): boolean => event.code === 'Escape';
const nativeActivation = (event: Pick<KeyboardEvent, 'code'>): boolean =>
  event.code === 'Enter' || event.code === 'Space';
/** What a key does in the game's combo box (`src/ui/comboBox.ts`). Like a native list control's keys, these are fixed. */
export type ComboBoxKey = 'next' | 'previous' | 'collapse' | 'choose' | 'close';
export const comboBoxKey = (event: Event): ComboBoxKey | undefined => {
  if (!(event instanceof KeyboardEvent)) {
    return;
  }
  if (event.key === 'ArrowDown') {
    return 'next';
  }
  if (event.key === 'ArrowUp') {
    return event.altKey ? 'collapse' : 'previous';
  }
  if (event.key === 'Enter') {
    return 'choose';
  }
  return event.key === 'Escape' || event.key === 'Tab' ? 'close' : undefined;
};
const typesCharacter = (event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean =>
  event.key.length === 1 && !(event.ctrlKey || event.metaKey || event.altKey);
const editable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  !target.closest('[hidden]') &&
  (target.isContentEditable || Boolean(target.closest('input,textarea,select,[contenteditable="true"]')));
export type InputCancellationReason =
  | 'manual'
  | 'context-change'
  | 'window-blur'
  | 'document-hidden'
  | 'pointer-lock-lost';

export const shouldCancelInputForViewerFocus = (reason: InputCancellationReason, replaying: boolean): boolean =>
  !(replaying && (reason === 'window-blur' || reason === 'document-hidden' || reason === 'pointer-lock-lost'));

export class KeyboardInput {
  private readonly down = new Set<string>();
  private readonly blocked = new Set<string>();
  private readonly active = new Map<string, string>();
  private state: KeyboardState = { context: 'title', debug: false };
  private removeListeners: (() => void) | undefined;
  context: () => KeyboardState = () => this.state;
  command: (command: InputCommand) => void = () => undefined;
  cancelled: (preservePointer?: boolean, reason?: InputCancellationReason) => void = () => undefined;
  escape: () => void = () => undefined;
  capture: ((chord: Chord | string | undefined) => void) | undefined;
  readonly registry: BindingRegistry;
  constructor(registry: BindingRegistry) {
    this.registry = registry;
    registry.subscribe((bindingsChanged) => {
      if (bindingsChanged) {
        this.cancel();
      }
    });
  }
  held(action: string): boolean {
    return [...this.active.values()].includes(action);
  }
  sync(): void {
    const next = this.context();
    if (next.context !== this.state.context || next.debug !== this.state.debug) {
      const continuingMovement = [...this.active].filter(
        ([, action]) =>
          action.startsWith('movement.') && this.registry.binding(action)?.contexts.includes(next.context),
      );
      this.cancel(true, false, 'context-change');
      // Movement remains valid across the reading-to-play transition, so its initiating key must pass through.
      for (const [code, action] of continuingMovement) {
        this.blocked.delete(code);
        this.active.set(code, action);
      }
      this.state = next;
    }
  }
  cancel(keepGate = false, preservePointer = false, reason: InputCancellationReason = 'manual'): void {
    for (const code of this.down) {
      if ((keepGate && this.active.get(code) === 'debug.gate') || (preservePointer && code.startsWith('Mouse'))) {
        continue;
      }
      this.blocked.add(code);
      this.active.delete(code);
    }
    this.cancelled(preservePointer, reason);
  }
  pressForwarded(event: ForwardedKey): boolean {
    return this.press(new KeyboardEvent('keydown', event));
  }
  releaseForwarded(event: ForwardedKey): void {
    this.release(new KeyboardEvent('keyup', event));
  }
  release(event: KeyEvent): void {
    this.down.delete(event.code);
    this.blocked.delete(event.code);
    const action = this.active.get(event.code);
    this.active.delete(event.code);
    if (action) {
      this.command({ action, phase: 'up', at: event.timeStamp });
    }
    const modifier = modifierCodes[event.code];
    if (
      modifier &&
      [...this.active].some(([code, id]) =>
        this.registry.chords(id).some((chord) => chord.code === code && chord.modifier === modifier),
      )
    ) {
      this.cancel();
    }
  }
  private capturePress(event: KeyEvent): boolean {
    if (browserEscape(event)) {
      this.capture?.(undefined);
      return false;
    }
    if (!event.repeat) {
      this.capture?.(capturedChord(event));
    }
    return !REFUSED_MODIFIERS.some((modifier) => event[flags[modifier]] || modifierCodes[event.code] === modifier);
  }
  pressPointer(
    button: number,
    event: Pick<MouseEvent, 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'timeStamp'>,
  ): boolean {
    if (!Number.isInteger(button) || button < 0 || button > 4) {
      return false;
    }
    return this.press({ code: `Mouse${button}`, ...event, repeat: false, isComposing: false });
  }
  releasePointer(button: number, timeStamp: number): void {
    if (Number.isInteger(button) && button >= 0 && button <= 4) {
      this.release({
        code: `Mouse${button}`,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        repeat: false,
        isComposing: false,
        timeStamp,
      });
    }
  }
  press(event: KeyEvent, text = false, allowWhileEditing?: ReadonlySet<string>): boolean {
    this.sync();
    this.down.add(event.code);
    if (event.isComposing) {
      return false;
    }
    if (this.capture) {
      return this.capturePress(event);
    }
    if (browserEscape(event)) {
      this.escape();
      return false;
    }
    if (this.blocked.has(event.code) || REFUSED_MODIFIERS.some((modifier) => event[flags[modifier]])) {
      return false;
    }
    const gate = this.held('debug.gate');
    const matches = this.registry.bindings.filter(
      (binding) =>
        binding.contexts.includes(this.state.context) &&
        (!binding.debug || this.state.debug) &&
        (!text || binding.text || allowWhileEditing?.has(binding.id)) &&
        (binding.gate
          ? this.held(binding.gate)
          : !gate || binding.id === 'debug.gate' || binding.id === 'ui.main-menu-toggle') &&
        this.registry.chords(binding.id).some(
          (chord) =>
            chord.code === event.code &&
            modifiers.every((modifier) => {
              const ownedHeldModifier =
                !chord.modifier &&
                [...this.active].some(
                  ([code, action]) => modifierCodes[code] === modifier && isHeld(this.registry.binding(action)!),
                );
              const gateModifier =
                binding.gate &&
                [...this.active].some(
                  ([code, action]) =>
                    action === binding.gate &&
                    this.registry
                      .chords(action)
                      .some((gateChord) => gateChord.code === code && gateChord.modifier === modifier),
                );
              return (
                Boolean(event[flags[modifier]]) ===
                (chord.modifier === modifier ||
                  modifierCodes[chord.code] === modifier ||
                  ownedHeldModifier ||
                  Boolean(gateModifier))
              );
            }),
        ),
    );
    const [selectedBinding] = matches;
    if (!selectedBinding) {
      return false;
    }
    if (!event.repeat || selectedBinding.repeat) {
      if (!this.active.has(event.code)) {
        this.active.set(event.code, selectedBinding.id);
        if (selectedBinding.id === 'debug.gate') {
          this.cancel(true, true);
        }
      }
      this.command({ action: selectedBinding.id, phase: 'down', at: event.timeStamp });
      this.sync();
    }
    return true;
  }
  install(): () => void {
    if (this.removeListeners) {
      return this.removeListeners;
    }
    const debugControl = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement &&
      Boolean(target.closest('button,a,[role="button"],input[type="checkbox"]')?.closest('[data-debug-controls]'));
    const keyDown = (event: KeyboardEvent) => {
      if (debugControl(event.target) && nativeActivation(event) && !this.capture && !this.held('debug.gate')) {
        event.preventDefault();
        return;
      }
      const text = editable(event.target);
      // A focused combo box keeps the inventory closable and its tabs reachable, but a key that types
      // a character stays in its filter field.
      const comboBoxGameKey =
        text &&
        this.context().context === 'inventory' &&
        event.target instanceof HTMLElement &&
        event.target.matches('[role="combobox"]') &&
        !typesCharacter(event);
      if (this.press(event, text, comboBoxGameKey ? INVENTORY_COMBO_BOX_BINDINGS : undefined)) {
        event.preventDefault();
      }
    };
    const keyUp = (event: KeyboardEvent) => this.release(event);
    const pointerCapture = (event: MouseEvent) => {
      if (this.capture) {
        this.pressPointer(event.button, event);
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const blur = () => this.cancel(false, false, 'window-blur');
    const visibility = () => {
      if (document.hidden) {
        this.cancel(false, false, 'document-hidden');
      }
    };
    const lock = () => {
      if (!document.pointerLockElement) {
        this.cancel(false, false, 'pointer-lock-lost');
      }
    };
    const focus = (event: FocusEvent) => {
      if (editable(event.target)) {
        this.cancel(true);
      }
    };
    const click = (event: MouseEvent) => {
      if (event.isTrusted && event.detail === 0 && debugControl(event.target) && !this.held('debug.gate')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    globalThis.addEventListener('keydown', keyDown, true);
    globalThis.addEventListener('keyup', keyUp, true);
    globalThis.addEventListener('mousedown', pointerCapture, true);
    globalThis.addEventListener('blur', blur);
    globalThis.addEventListener('click', click, true);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('pointerlockchange', lock);
    document.addEventListener('focusin', focus);
    this.removeListeners = () => {
      globalThis.removeEventListener('keydown', keyDown, true);
      globalThis.removeEventListener('keyup', keyUp, true);
      globalThis.removeEventListener('mousedown', pointerCapture, true);
      globalThis.removeEventListener('blur', blur);
      globalThis.removeEventListener('click', click, true);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('pointerlockchange', lock);
      document.removeEventListener('focusin', focus);
      this.removeListeners = undefined;
      this.cancel();
    };
    return this.removeListeners;
  }
}
export const inputBindings = new BindingRegistry();
export const keyboardInput = new KeyboardInput(inputBindings);
export const labelForAction = (id: string): string => inputBindings.label(id);
