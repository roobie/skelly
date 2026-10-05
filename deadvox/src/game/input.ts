// Keyboard and pointer-lock mouse look.

import type { MoveIntent } from './player.ts';
import { ReloadInput } from './reloadInput.ts';

const SENSITIVITY = 0.0022;
const MAC_PLATFORM = /Mac/i;

/** Cmd on macOS (best effort), Ctrl elsewhere; Shift alone stays free for splitting. */
export const quickMoveModifier = (
  event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>,
  platform = globalThis.navigator?.platform ?? '',
): boolean => (MAC_PLATFORM.test(platform) ? event.metaKey : event.ctrlKey);

/** UI key bindings and browser-owned keys referenced by the help and browser contract. */
export const KEY_BINDINGS = {
  mainMenu: { code: 'F9', label: 'F9', virtualKeyCode: 120 },
  performanceOverlay: { code: 'F4', label: 'F4', virtualKeyCode: 115 },
  browserMenuBar: { code: 'F10', label: 'F10', virtualKeyCode: 121 },
  useOff: { code: 'Equal' },
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
  reload: 'KeyR',
  descend: 'Backspace',
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

/** Rest has no keyboard binding; sleep alone retains its existing toggle. */
export const restKindForControl = (control: string): 'sleep' | undefined =>
  control === CONTROL_CODES.sleep ? 'sleep' : undefined;

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
  readonly reload = new ReloadInput();
  yaw = 0;
  pitch = 0;
  /** Toggled with Z: walk instead of jog. */
  walking = false;
  menuPointer = false;
  rightMouseHeld = false;
  private dominantUsePressed = false;
  private dominantUseDown = false;
  private offUsePressed = false;
  private offUseDown = false;
  cursorX = globalThis.innerWidth / 2;
  cursorY = globalThis.innerHeight / 2;
  private readonly target: HTMLElement;
  private readonly dominantUseAllowed: () => boolean;

  constructor(target: HTMLElement, dominantUseAllowed: () => boolean = () => true) {
    this.target = target;
    this.dominantUseAllowed = dominantUseAllowed;
    target.addEventListener('mousedown', (event) => {
      const mouse = event as MouseEvent;
      if (mouse.button === 2) {
        this.rightMouseHeld = true;
      }
      if (
        mouse.button === 0 &&
        !this.dominantUseDown &&
        this.locked &&
        !this.menuPointer &&
        this.dominantUseAllowed()
      ) {
        this.dominantUsePressed = true;
        this.dominantUseDown = true;
      }
    });
    globalThis.addEventListener('mouseup', (event) => {
      const { button } = event as MouseEvent;
      if (button === 2) {
        this.rightMouseHeld = false;
      }
      if (button === 0) {
        this.dominantUseDown = false;
      }
    });
    globalThis.addEventListener('keydown', (e) => {
      if (
        e.code === CONTROL_CODES.inventory ||
        (e.code === CONTROL_CODES.descend && this.locked && !this.menuPointer)
      ) {
        e.preventDefault(); // Backspace must not navigate back; menus retain text editing.
      }
      if (e.code === CONTROL_CODES.walkToggle && !e.repeat && !this.menuPointer) {
        this.walking = !this.walking;
      }
      if (e.code === KEY_BINDINGS.useOff.code && !this.offUseDown) {
        this.offUseDown = true;
        if (this.locked && !this.menuPointer) {
          this.offUsePressed = true;
        }
      }
      this.held.add(e.code);
    });
    globalThis.addEventListener('keyup', (e) => {
      if (e.code === CONTROL_CODES.reload) {
        this.reload.keyUp(e.timeStamp);
      }
      this.held.delete(e.code);
      if (e.code === KEY_BINDINGS.useOff.code) {
        this.offUseDown = false;
      }
    });
    globalThis.addEventListener('blur', () => {
      this.reload.cancel();
      this.held.clear();
      this.rightMouseHeld = false;
      this.dominantUseDown = false;
      this.dominantUsePressed = false;
      this.offUseDown = false;
      this.offUsePressed = false;
    });
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
    (this.target.requestPointerLock() as Promise<void> | undefined)?.catch((error: unknown) => {
      // biome-ignore lint/suspicious/noConsole: preserve native permission failures for browser diagnosis.
      console.warn('Pointer lock request failed', error);
    });
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
      useDominant: this.dominantUsePressed,
      useDominantHeld: this.dominantUseDown,
      useOff: this.offUsePressed,
    };
  }

  /** Called once after the player tick samples its intent. */
  consumeDominantUse(): void {
    this.dominantUsePressed = false;
  }

  /** Called once after the player tick samples the off-hand action. */
  consumeOffUse(): void {
    this.offUsePressed = false;
  }
}
