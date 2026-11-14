import {
  type Binding,
  BindingRegistry,
  type Chord,
  chordIssue,
  INPUT_ACTIONS,
  INVENTORY_TAB_BINDINGS,
  type InputContext,
  isHeld,
  type KeyboardLayoutSource,
  type Modifier,
  modifierCodes,
  modifierRefusal,
  modifiers,
  type PreferenceStorage,
  REFUSED_MODIFIERS,
} from '@skelly/engine/input';

const INVENTORY_CONTROL_BINDINGS: ReadonlySet<string> = new Set([
  'inventory.control-previous',
  'inventory.control-next',
  'inventory.control-activate',
  'ui.inventory-toggle',
]);
const INVENTORY_FIND_ARROW_BINDINGS: ReadonlySet<string> = new Set(['inventory.previous', 'inventory.next']);
const INVENTORY_COMBO_BOX_BINDINGS: ReadonlySet<string> = new Set([
  'ui.inventory-toggle',
  ...INVENTORY_TAB_BINDINGS.map(({ action }) => action),
]);
const INVENTORY_CHECKBOX_BINDINGS: ReadonlySet<string> = new Set(
  INPUT_ACTIONS.filter((action) => action.contexts.includes('inventory')).map(({ id }) => id),
);
// Escape is left out so a tap still frees the pointer and the browser's own fullscreen exit stays.
export const BROWSER_CHORD_LOCK_CODES: string[] = ['KeyW', 'KeyT', 'KeyN', 'Tab'];
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
export interface KeyboardState {
  readonly context: InputContext;
  readonly debug: boolean;
}
export interface KeyTraceEntry {
  readonly kind: 'down' | 'up' | 'context' | 'cancel' | 'focus' | 'blur' | 'visibility' | 'pointer-lock';
  readonly at: number;
  readonly context: InputContext;
  readonly focus: 'editable' | 'other';
  readonly hidden: boolean;
  readonly pointerLocked: boolean;
  readonly down: readonly string[];
  readonly blocked: readonly string[];
  readonly active: readonly { code: string; action: string }[];
  readonly reason?: string;
  readonly code?: string;
  readonly repeat?: boolean;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  readonly isComposing?: boolean;
  readonly isTrusted?: boolean;
  readonly accepted?: boolean;
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
    (modifier) =>
      (modifier !== 'alt' && modifierCodes[event.code] === modifier) ||
      (event[flags[modifier]] && modifierCodes[event.code] !== modifier),
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
const chromeDevtoolsShortcut = (
  event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'shiftKey' | 'metaKey' | 'altKey'>,
): boolean =>
  event.code === 'F12' ||
  (event.ctrlKey && event.shiftKey && ['KeyC', 'KeyI', 'KeyJ'].includes(event.code)) ||
  (event.metaKey && event.altKey && ['KeyI', 'KeyJ'].includes(event.code)) ||
  (event.metaKey && event.shiftKey && event.code === 'KeyC');
const nativeActivation = (event: Pick<KeyboardEvent, 'code'>): boolean =>
  event.code === 'Enter' || event.code === 'Space';
/** What a key does in the game's combo box (`src/ui/comboBox.ts`). Like a native list control's keys, these are fixed. */
export type ComboBoxKey = 'next' | 'previous' | 'collapse' | 'choose' | 'close';
export const comboBoxKey = (event: Event): ComboBoxKey | undefined => {
  if (!(event instanceof KeyboardEvent) || event.defaultPrevented) {
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
/** Which way an arrow key steps an open action menu. Like a native list control's keys, these are fixed. */
const CHOICE_STEPS: ReadonlyMap<string, number> = new Map([
  ['ArrowDown', 1],
  ['ArrowRight', 1],
  ['ArrowUp', -1],
  ['ArrowLeft', -1],
]);
/** Whether a key leaves the inventory find field without changing its filter (`src/ui/inventoryScreen.ts`). */
export const blursFindField = (event: Event): boolean =>
  event instanceof KeyboardEvent && (event.key === 'Escape' || event.key === 'Enter');
const typesCharacter = (event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean =>
  event.key.length === 1 && !(event.ctrlKey || event.metaKey || event.altKey);
const pageControl = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  Boolean(
    target.closest('button,a[href],input,select,textarea,summary,label,[role="button"],[contenteditable="true"]'),
  );
const focusedInventoryBindings = (event: KeyboardEvent): ReadonlySet<string> | undefined => {
  if (!(event.target instanceof HTMLElement)) {
    return undefined;
  }
  if (event.target.matches('input[type="checkbox"][data-put-target]')) {
    return INVENTORY_CHECKBOX_BINDINGS;
  }
  if (typesCharacter(event)) {
    return undefined;
  }
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Backspace', 'Delete'].includes(event.code)) {
    return INVENTORY_CONTROL_BINDINGS;
  }
  if (event.target.matches('[data-inventory-find]')) {
    // Vertical arrows can select an item; horizontal arrows still belong to native caret editing.
    return event.code === 'ArrowUp' || event.code === 'ArrowDown' ? INVENTORY_FIND_ARROW_BINDINGS : undefined;
  }
  return event.target.matches('[role="combobox"]') ? INVENTORY_COMBO_BOX_BINDINGS : undefined;
};
const editable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  !target.closest('[hidden]') &&
  (target.isContentEditable || Boolean(target.closest('input,textarea,select,[contenteditable="true"]')));
export type InputCancellationReason =
  | 'manual'
  | 'context-change'
  | 'window-blur'
  | 'document-hidden'
  | 'pointer-lock-lost'
  | 'modifier-state-lost';

export const shouldCancelInputForViewerFocus = (reason: InputCancellationReason, replaying: boolean): boolean =>
  !(
    replaying &&
    (reason === 'window-blur' ||
      reason === 'document-hidden' ||
      reason === 'pointer-lock-lost' ||
      reason === 'modifier-state-lost')
  );

export class KeyboardInput {
  private readonly down = new Set<string>();
  private readonly blocked = new Set<string>();
  private readonly active = new Map<string, string>();
  /** A modifier pressed during binding capture: it may start a chord, so it is captured alone only on its release. */
  private captureModifier: KeyEvent | undefined;
  private state: KeyboardState = { context: 'title', debug: false };
  private removeListeners: (() => void) | undefined;
  trace: ((entry: KeyTraceEntry) => void) | undefined;
  context: () => KeyboardState = () => this.state;
  command: (command: InputCommand) => void = () => undefined;
  cancelled: (preservePointer?: boolean, reason?: InputCancellationReason) => void = () => undefined;
  escape: () => void = () => undefined;
  /** Steps an open action menu; false when none is open, so the key keeps its binding. */
  choiceStep: (direction: number) => boolean = () => false;
  capture: ((chord: Chord | string | undefined) => void) | undefined;
  /** What a mouse press lands on; a locked menu pointer replaces the canvas with the element under its cursor. */
  pointerTarget: (event: MouseEvent) => EventTarget | null = (event) => event.target;
  readonly registry: BindingRegistry;
  constructor(registry: BindingRegistry) {
    this.registry = registry;
    registry.subscribe((bindingsChanged) => {
      if (bindingsChanged) {
        this.cancel();
      }
    });
  }
  private traceCode(code: string): boolean {
    return (
      code.startsWith('Shift') ||
      code.startsWith('Alt') ||
      (!code.startsWith('Mouse') &&
        this.registry.bindings.some(
          (binding) =>
            binding.id.startsWith('movement.') && this.registry.chords(binding.id).some((chord) => chord.code === code),
        ))
    );
  }
  private recordTrace(kind: KeyTraceEntry['kind'], detail: Partial<KeyTraceEntry> = {}): void {
    if (!(this.trace && this.state.debug)) {
      return;
    }
    const focus: KeyTraceEntry['focus'] = editable(document.activeElement) ? 'editable' : 'other';
    const entry = {
      kind,
      at: performance.now(),
      context: this.state.context,
      focus,
      hidden: document.hidden,
      pointerLocked: Boolean(document.pointerLockElement),
      down: [...this.down].filter((code) => this.traceCode(code)),
      blocked: [...this.blocked].filter((code) => this.traceCode(code)),
      active: [...this.active].filter(([code]) => this.traceCode(code)).map(([code, action]) => ({ code, action })),
      ...detail,
    };
    if (entry.focus === 'editable') {
      const { code: _code, ...redacted } = entry;
      this.trace({ ...redacted, down: [], blocked: [], active: [] });
    } else {
      this.trace(entry);
    }
  }
  private traceDown(event: KeyEvent, accepted: boolean, reason: string): boolean {
    if (this.trace && this.state.debug && this.traceCode(event.code)) {
      this.recordTrace('down', { ...this.traceEvent(event), accepted, reason });
    }
    return accepted;
  }
  private traceEvent(event: KeyEvent): Partial<KeyTraceEntry> {
    return {
      at: event.timeStamp,
      code: event.code,
      repeat: event.repeat,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      isComposing: event.isComposing,
      isTrusted: 'isTrusted' in event && event.isTrusted === true,
    };
  }
  private unmatchedDown(event: KeyEvent, text: boolean, allowWhileEditing?: ReadonlySet<string>): boolean {
    if (this.trace && this.state.debug) {
      this.traceDown(event, false, this.unmatchedReason(event, text, allowWhileEditing));
    }
    return false;
  }
  private unmatchedReason(event: KeyEvent, text: boolean, allowWhileEditing?: ReadonlySet<string>): string {
    let candidates = this.registry.bindings.filter((binding) =>
      this.registry.chords(binding.id).some((chord) => chord.code === event.code),
    );
    const stages: readonly [string, (binding: Binding) => boolean][] = [
      ['unbound', () => true],
      ['context', (binding) => binding.contexts.includes(this.state.context)],
      ['debug-only', (binding) => !binding.debug || this.state.debug],
      ['editing', (binding) => !text || Boolean(binding.text || allowWhileEditing?.has(binding.id))],
      [
        'gate',
        (binding) =>
          binding.gate
            ? this.held(binding.gate)
            : !this.held('debug.gate') || binding.id === 'debug.gate' || binding.id === 'ui.main-menu-toggle',
      ],
    ];
    for (const [reason, predicate] of stages) {
      candidates = candidates.filter(predicate);
      if (candidates.length === 0) {
        return reason;
      }
    }
    return 'modifiers';
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
      this.recordTrace('context');
    }
  }
  cancel(keepGate = false, preservePointer = false, reason: InputCancellationReason = 'manual'): void {
    this.captureModifier = undefined;
    for (const code of this.down) {
      if ((keepGate && this.active.get(code) === 'debug.gate') || (preservePointer && code.startsWith('Mouse'))) {
        continue;
      }
      this.blocked.add(code);
      this.active.delete(code);
    }
    this.recordTrace('cancel', { reason });
    this.cancelled(preservePointer, reason);
  }
  pressForwarded(event: ForwardedKey): boolean {
    return this.press(new KeyboardEvent('keydown', event));
  }
  releaseForwarded(event: ForwardedKey): void {
    this.release(new KeyboardEvent('keyup', event));
  }
  release(event: KeyEvent): void {
    if (this.captureModifier?.code === event.code) {
      const modifier = this.captureModifier;
      this.captureModifier = undefined;
      this.capture?.(capturedChord(modifier));
    }
    this.down.delete(event.code);
    this.blocked.delete(event.code);
    const action = this.active.get(event.code);
    this.active.delete(event.code);
    if (action) {
      this.command({ action, phase: 'up', at: event.timeStamp });
    }
    if (this.trace && this.traceCode(event.code)) {
      this.recordTrace('up', this.traceEvent(event));
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
    const lone = capturedChord(event);
    if (!event.repeat && typeof lone !== 'string' && modifierCodes[event.code]) {
      this.captureModifier = event;
    } else if (!event.repeat) {
      this.captureModifier = undefined;
      this.capture?.(lone);
    }
    return !REFUSED_MODIFIERS.some(
      (modifier) =>
        (modifier !== 'alt' && modifierCodes[event.code] === modifier) ||
        (event[flags[modifier]] && modifierCodes[event.code] !== modifier),
    );
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
  private refusedDown(event: KeyEvent, text: boolean, browserModifier: boolean): boolean {
    const blocked = this.blocked.has(event.code);
    // A rejected held edge must not click a button that acquired focus during the transfer.
    const blockNativeActivation = blocked && !browserModifier && !text && nativeActivation(event);
    return this.traceDown(event, blockNativeActivation, blocked ? 'blocked' : 'browser-modifier');
  }
  press(event: KeyEvent, text = false, allowWhileEditing?: ReadonlySet<string>): boolean {
    this.sync();
    this.down.add(event.code);
    if (event.isComposing) {
      return this.traceDown(event, false, 'composing');
    }
    if (this.capture) {
      return this.traceDown(event, this.capturePress(event), 'binding-capture');
    }
    if (browserEscape(event)) {
      this.escape();
      return false;
    }
    const step = CHOICE_STEPS.get(event.code);
    if (!text && step !== undefined && this.choiceStep(step)) {
      return this.traceDown(event, true, 'accepted');
    }
    const browserModifier = REFUSED_MODIFIERS.some((modifier) => {
      if (modifier === 'alt') {
        const owned = [...this.active].some(
          ([code, action]) => modifierCodes[code] === modifier && isHeld(this.registry.binding(action)!),
        );
        return event.altKey && modifierCodes[event.code] !== 'alt' && !owned;
      }
      return event[flags[modifier]];
    });
    if (this.blocked.has(event.code) || browserModifier) {
      return this.refusedDown(event, text, browserModifier);
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
                modifierCodes[chord.code] === modifier ||
                Boolean(event[flags[modifier]]) ===
                  (chord.modifier === modifier || ownedHeldModifier || Boolean(gateModifier))
              );
            }),
        ),
    );
    const [selectedBinding] = matches;
    if (!selectedBinding) {
      return this.unmatchedDown(event, text, allowWhileEditing);
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
    return this.traceDown(event, true, 'accepted');
  }
  private playingBrowserChord(event: KeyboardEvent): boolean {
    return (
      event.cancelable &&
      (this.context().context === 'play' || this.context().context === 'carrying') &&
      Boolean(document.pointerLockElement) &&
      ((!modifierCodes[event.code] && (event.ctrlKey || event.metaKey || event.altKey)) ||
        modifierCodes[event.code] === 'alt') &&
      !editable(event.target) &&
      !this.capture
    );
  }
  /**
   * Focus left the document, so a held key's release may go elsewhere. Held state is forgotten rather than
   * blocked: a block lasts until a release this document may never see, refusing the key's next press.
   */
  private focusLost(reason: InputCancellationReason): void {
    this.cancel(false, false, reason);
    this.down.clear();
    this.blocked.clear();
    this.active.clear();
  }
  private reconcileModifiers(event: {
    readonly code?: string;
    readonly altKey: boolean;
    readonly getModifierState?: (key: string) => boolean;
  }): void {
    // A modifier's own edge can carry inconsistent flags. Only another input can contradict a missing release.
    if (modifierCodes[event.code ?? ''] === 'alt') {
      return;
    }
    const alt = event.getModifierState?.('Alt') ?? event.altKey;
    if (!alt && [...this.down].some((code) => modifierCodes[code] === 'alt')) {
      // Browser chrome may have swallowed movement releases as well; none of that ownership is safe to retain.
      this.focusLost('modifier-state-lost');
    }
  }
  reconcileFocus(): void {
    if (this.down.size === 0) {
      return;
    }
    if (document.hidden) {
      this.focusLost('document-hidden');
    } else if (!document.hasFocus()) {
      this.focusLost('window-blur');
    } else if (
      (this.context().context === 'play' || this.context().context === 'carrying') &&
      !document.pointerLockElement
    ) {
      this.focusLost('pointer-lock-lost');
    }
  }
  windowBlurred(): void {
    this.recordTrace('blur');
    this.focusLost('window-blur');
  }
  visibilityChanged(): void {
    this.recordTrace('visibility');
    if (document.hidden) {
      this.focusLost('document-hidden');
    }
  }
  install(): () => void {
    if (this.removeListeners) {
      return this.removeListeners;
    }
    const debugControl = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement &&
      Boolean(target.closest('button,a,[role="button"],input[type="checkbox"]')?.closest('[data-debug-controls]'));
    const keyDown = (event: KeyboardEvent) => {
      if (this.playingBrowserChord(event)) {
        event.preventDefault();
      }
      this.reconcileModifiers(event);
      // DevTools shortcuts are cancelled outside play too, where the browser exposes a cancelable event.
      if (event.cancelable && chromeDevtoolsShortcut(event) && !editable(event.target) && !this.capture) {
        this.traceDown(event, false, 'browser-shortcut');
        event.preventDefault();
        return;
      }
      if (debugControl(event.target) && nativeActivation(event) && !this.capture && !this.held('debug.gate')) {
        this.traceDown(event, false, 'native-control');
        event.preventDefault();
        return;
      }
      const text = editable(event.target);
      const allowed = this.context().context === 'inventory' ? focusedInventoryBindings(event) : undefined;
      if (this.press(event, text, allowed)) {
        event.preventDefault();
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (this.playingBrowserChord(event) || (this.capture && modifierCodes[event.code] === 'alt')) {
        event.preventDefault();
      }
      this.reconcileModifiers(event);
      this.release(event);
    };
    const pointerModifiers = (event: MouseEvent) => this.reconcileModifiers(event);
    // A press on a control (Cancel, Reset, another binding) operates that control rather than being captured.
    const pointerCapture = (event: MouseEvent) => {
      if (this.capture && !pageControl(this.pointerTarget(event))) {
        this.pressPointer(event.button, event);
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const blur = () => this.windowBlurred();
    const windowFocus = () => {
      this.recordTrace('focus');
      // Chrome excursions can deliver the focus return without delivering the blur or releases.
      if (this.down.size > 0) {
        this.focusLost('window-blur');
      }
    };
    const visibility = () => this.visibilityChanged();
    const lock = () => {
      this.recordTrace('pointer-lock');
      if (!document.pointerLockElement) {
        this.focusLost('pointer-lock-lost');
      }
    };
    const focus = (event: FocusEvent) => {
      this.recordTrace('focus', { focus: editable(event.target) ? 'editable' : 'other' });
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
    for (const type of ['mousemove', 'mousedown', 'mouseup', 'wheel'] as const) {
      globalThis.addEventListener(type, pointerModifiers, true);
    }
    globalThis.addEventListener('keydown', keyDown, true);
    globalThis.addEventListener('keyup', keyUp, true);
    globalThis.addEventListener('mousedown', pointerCapture, true);
    globalThis.addEventListener('blur', blur);
    globalThis.addEventListener('focus', windowFocus);
    globalThis.addEventListener('click', click, true);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('pointerlockchange', lock);
    document.addEventListener('focusin', focus);
    this.removeListeners = () => {
      for (const type of ['mousemove', 'mousedown', 'mouseup', 'wheel'] as const) {
        globalThis.removeEventListener(type, pointerModifiers, true);
      }
      globalThis.removeEventListener('keydown', keyDown, true);
      globalThis.removeEventListener('keyup', keyUp, true);
      globalThis.removeEventListener('mousedown', pointerCapture, true);
      globalThis.removeEventListener('blur', blur);
      globalThis.removeEventListener('focus', windowFocus);
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
export function forwardedActionHolds(input: KeyboardInput) {
  const held = new Map<string, number>();
  const event = (code: string): Parameters<KeyboardInput['pressForwarded']>[0] => ({
    code,
    isComposing: false,
    repeat: false,
    shiftKey: [...held.keys()].some((key) => modifierCodes[key] === 'shift'),
    ctrlKey: [...held.keys()].some((key) => modifierCodes[key] === 'ctrl'),
    altKey: [...held.keys()].some((key) => modifierCodes[key] === 'alt'),
    metaKey: [...held.keys()].some((key) => modifierCodes[key] === 'meta'),
  });
  const up = (code: string) => {
    const count = held.get(code)!;
    if (count > 1) {
      held.set(code, count - 1);
      return;
    }
    held.delete(code);
    input.releaseForwarded(event(code));
  };
  return (action: string) => {
    const [chord] = input.registry.chords(action);
    if (!chord) {
      throw new Error(`Forwarded action has no binding: ${action}`);
    }
    const modifierCode = Object.entries(modifierCodes).find(([, modifier]) => modifier === chord.modifier)?.[0];
    const codes = modifierCode ? [modifierCode, chord.code] : [chord.code];
    const acquired: string[] = [];
    const release = () => {
      for (const code of acquired.toReversed()) {
        up(code);
      }
    };
    for (const code of codes) {
      const count = held.get(code) ?? 0;
      held.set(code, count + 1);
      acquired.push(code);
      const accepted = count > 0 || input.pressForwarded(event(code));
      if (code === chord.code && !accepted) {
        release();
        throw new Error(`Forwarded action was refused: ${action}`);
      }
    }
    return release;
  };
}

const browserKeyboardLayout: KeyboardLayoutSource = () =>
  (
    globalThis.navigator as Navigator & { keyboard?: { getLayoutMap: () => Promise<ReadonlyMap<string, string>> } }
  )?.keyboard?.getLayoutMap();
/** A page's keyboard over the given default keys, keeping the player's preferences in browser storage. */
export const createKeyboardInput = (defaults: readonly Binding[]): KeyboardInput =>
  new KeyboardInput(new BindingRegistry(defaults, browserStorage(), browserKeyboardLayout));
