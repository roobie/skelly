// Keyboard and pointer-lock mouse look.

import type { MoveIntent } from './player.ts';

const SENSITIVITY = 0.0022;

/** UI key bindings and browser-owned keys referenced by the help and browser contract. */
export const KEY_BINDINGS = {
  mainMenu: { code: 'F9', label: 'F9', virtualKeyCode: 120 },
  browserMenuBar: { code: 'F10', label: 'F10', virtualKeyCode: 121 },
} as const;

export const isMenuOpeningKey = (code: string, debug: boolean, menuOpen: boolean): boolean =>
  code === 'KeyG' && debug && !menuOpen;

export const worldActionForKey = (code: string): 'interact' | 'cancel' | undefined => {
  if (code === 'KeyF') {
    return 'interact';
  }
  if (code === 'KeyX') {
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
  rightMouseHeld = false;
  private primaryActionPressed = false;
  private primaryActionDown = false;
  cursorX = globalThis.innerWidth / 2;
  cursorY = globalThis.innerHeight / 2;
  private readonly target: HTMLElement;

  constructor(target: HTMLElement) {
    this.target = target;
    target.addEventListener('mousedown', (event) => {
      const mouse = event as MouseEvent;
      if (mouse.button === 2) {
        this.rightMouseHeld = true;
      }
      if (mouse.button === 0 && !this.primaryActionDown) {
        this.primaryActionPressed = true;
        this.primaryActionDown = true;
      }
    });
    globalThis.addEventListener('mouseup', (event) => {
      const button = (event as MouseEvent).button;
      if (button === 2) {
        this.rightMouseHeld = false;
      }
      if (button === 0) {
        this.primaryActionDown = false;
      }
    });
    globalThis.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
      }
      if (e.code === 'KeyZ' && !e.repeat) {
        this.walking = !this.walking;
      }
      this.held.add(e.code);
    });
    globalThis.addEventListener('keyup', (e) => this.held.delete(e.code));
    globalThis.addEventListener('blur', () => {
      this.held.clear();
      this.rightMouseHeld = false;
      this.primaryActionDown = false;
      this.primaryActionPressed = false;
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
      forward: on('KeyW') - on('KeyS'),
      right: on('KeyD') - on('KeyA'),
      jump: this.held.has('Space'),
      sprint: this.held.has('ShiftLeft') || this.held.has('ShiftRight'),
      walk: this.walking,
      primaryAction: this.primaryActionPressed,
    };
  }

  /** Called once after the player tick samples its intent. */
  consumePrimaryAction(): void {
    this.primaryActionPressed = false;
  }
}
