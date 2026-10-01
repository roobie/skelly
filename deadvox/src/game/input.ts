// Keyboard and pointer-lock mouse look.

import type { MoveIntent } from './player.ts';

const SENSITIVITY = 0.0022;

/** UI key bindings and browser-owned keys referenced by the help and browser contract. */
export const KEY_BINDINGS = {
  mainMenu: { code: 'F9', label: 'F9', virtualKeyCode: 120 },
  browserMenuBar: { code: 'F10', label: 'F10', virtualKeyCode: 121 },
} as const;

export const CONTROL_CODES = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprintLeft: 'ShiftLeft',
  sprintRight: 'ShiftRight',
  walkToggle: 'KeyZ',
  jump: 'Space',
  interact: 'KeyF',
  rest: 'KeyR',
  sleep: 'KeyL',
  inventory: 'Tab',
  cancel: 'KeyX',
  quickbar: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'],
  search: 'KeyS',
  rotate: 'KeyR',
  hands: 'KeyH',
  wear: 'KeyW',
  drop: 'KeyD',
  bestPocket: 'KeyE',
  takeAll: 'KeyA',
  use: 'KeyU',
  menu: KEY_BINDINGS.mainMenu.code,
  previous: 'ArrowUp',
  next: 'ArrowDown',
  continue: 'KeyC',
  spawnMenu: 'KeyG',
} as const;

/** One binding table feeds both routing helpers and the player-facing help card. */
export const PLAYER_CONTROL_BINDINGS = [
  {
    keys: 'WASD',
    codes: [CONTROL_CODES.forward, CONTROL_CODES.left, CONTROL_CODES.back, CONTROL_CODES.right],
    action: 'Move',
  },
  { keys: 'Shift', codes: [CONTROL_CODES.sprintLeft, CONTROL_CODES.sprintRight], action: 'Sprint' },
  { keys: 'Z', codes: [CONTROL_CODES.walkToggle], action: 'Walk / jog' },
  { keys: 'Space', codes: [CONTROL_CODES.jump], action: 'Jump' },
  { keys: 'Mouse', codes: ['mousemove'], action: 'Look' },
  { keys: 'F', codes: [CONTROL_CODES.interact], action: 'Interact with a door or furniture' },
  {
    keys: 'R',
    codes: [CONTROL_CODES.rest, CONTROL_CODES.rotate],
    action: 'Rest in play; rotate while dragging in inventory',
  },
  { keys: 'L', codes: [CONTROL_CODES.sleep], action: 'Sleep; better on a bed; press again to stop' },
  { keys: 'Tab', codes: [CONTROL_CODES.inventory], action: 'Open / close inventory' },
  { keys: '1–5', codes: CONTROL_CODES.quickbar, action: 'Quickbar: take into hands; again to use' },
  { keys: 'C', codes: [CONTROL_CODES.continue], action: 'Continue after an interruption' },
  { keys: 'X', codes: [CONTROL_CODES.cancel], action: 'Cancel handling; stop after an interruption' },
  { keys: 'E', codes: [CONTROL_CODES.bestPocket], action: 'Move to your best pocket', context: 'inventory' },
  { keys: 'H', codes: [CONTROL_CODES.hands], action: 'Move to hands', context: 'inventory' },
  { keys: 'W', codes: [CONTROL_CODES.wear], action: 'Wear or remove', context: 'inventory' },
  { keys: 'D', codes: [CONTROL_CODES.drop], action: 'Drop', context: 'inventory' },
  { keys: 'A', codes: [CONTROL_CODES.takeAll], action: 'Take all like this', context: 'inventory' },
  { keys: 'S', codes: [CONTROL_CODES.search], action: 'Search next container', context: 'inventory' },
  { keys: 'U', codes: [CONTROL_CODES.use], action: 'Use selected item', context: 'inventory' },
  {
    keys: '↑ / ↓ / ← / →',
    codes: [CONTROL_CODES.previous, CONTROL_CODES.next, 'ArrowLeft', 'ArrowRight'],
    action: 'Select previous / next item',
    context: 'inventory',
  },
  { keys: KEY_BINDINGS.mainMenu.label, codes: [CONTROL_CODES.menu], action: 'Main menu, HUD and audio settings' },
  { keys: 'Escape', codes: ['Escape'], action: 'Release the mouse (browser control)' },
] as const;

export const quickbarSlotForKey = (code: string): number | undefined => {
  const index = CONTROL_CODES.quickbar.indexOf(code as (typeof CONTROL_CODES.quickbar)[number]);
  return index < 0 ? undefined : index;
};

export const isMenuOpeningKey = (code: string, debug: boolean, menuOpen: boolean): boolean =>
  code === CONTROL_CODES.spawnMenu && debug && !menuOpen;

export const worldActionForKey = (code: string): 'interact' | 'cancel' | undefined => {
  if (code === CONTROL_CODES.interact) {
    return 'interact';
  }
  if (code === CONTROL_CODES.cancel) {
    return 'cancel';
  }
  return undefined;
};

export const nextMenuCursor = (
  position: { x: number; y: number },
  movement: { x: number; y: number },
  viewport: { width: number; height: number },
): { x: number; y: number } => ({
  x: Math.max(0, Math.min(viewport.width - 1, position.x + movement.x)),
  y: Math.max(0, Math.min(viewport.height - 1, position.y + movement.y)),
});

export class Input {
  readonly held = new Set<string>();
  yaw = 0;
  pitch = 0;
  /** Toggled with Z: walk instead of jog. */
  walking = false;
  menuPointer = false;
  cursorX = globalThis.innerWidth / 2;
  cursorY = globalThis.innerHeight / 2;
  private readonly target: HTMLElement;

  constructor(target: HTMLElement) {
    this.target = target;
    globalThis.addEventListener('keydown', (e) => {
      if (e.code === CONTROL_CODES.inventory) {
        e.preventDefault();
      }
      if (e.code === CONTROL_CODES.walkToggle && !e.repeat) {
        this.walking = !this.walking;
      }
      this.held.add(e.code);
    });
    globalThis.addEventListener('keyup', (e) => this.held.delete(e.code));
    globalThis.addEventListener('blur', () => this.held.clear());
    document.addEventListener('mousemove', (e) => {
      if (!(this.locked && !this.menuPointer)) {
        return;
      }
      this.yaw -= e.movementX * SENSITIVITY;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - e.movementY * SENSITIVITY));
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  moveMenuCursor(movementX: number, movementY: number): void {
    if (!(this.locked && this.menuPointer)) {
      return;
    }
    const cursor = nextMenuCursor(
      { x: this.cursorX, y: this.cursorY },
      { x: movementX, y: movementY },
      { width: globalThis.innerWidth, height: globalThis.innerHeight },
    );
    this.cursorX = cursor.x;
    this.cursorY = cursor.y;
  }

  lock(): void {
    // Rejects if the browser refuses (e.g. too soon after Esc); the overlay stays up and the player clicks again.
    // Firefox returns undefined instead of a promise, whatever the DOM types say.
    (this.target.requestPointerLock() as Promise<void> | undefined)?.catch(() => undefined);
  }

  unlock(): void {
    if (this.locked) {
      document.exitPointerLock();
    }
  }

  intent(): MoveIntent {
    const on = (code: string) => (this.held.has(code) ? 1 : 0);
    return {
      forward: on(CONTROL_CODES.forward) - on(CONTROL_CODES.back),
      right: on(CONTROL_CODES.right) - on(CONTROL_CODES.left),
      jump: this.held.has(CONTROL_CODES.jump),
      sprint: this.held.has(CONTROL_CODES.sprintLeft) || this.held.has(CONTROL_CODES.sprintRight),
      walk: this.walking,
    };
  }
}
