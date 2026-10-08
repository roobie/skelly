// Pointer-lock mouse look; keyboard intents come from the shared semantic owner.

import { keyboardInput } from './inputBindings.ts';
import type { MoveIntent } from './player.ts';
import { ReloadInput } from './reloadInput.ts';

const SENSITIVITY = 0.0022;
export const LOOK_PITCH_LIMIT = 1.55;

export const adjustLookPitch = (pitch: number, delta: number): { pitch: number; applied: number } => {
  if (![pitch, delta].every(Number.isFinite)) {
    throw new Error('Invalid pitch adjustment');
  }
  const next = Math.max(-LOOK_PITCH_LIMIT, Math.min(LOOK_PITCH_LIMIT, pitch + delta));
  return { pitch: next, applied: next - pitch };
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
  readonly reload = new ReloadInput();
  yaw = 0;
  pitch = 0;
  walking = false;
  menuPointer = false;
  rightMouseHeld = false;
  aimingDownSights = false;
  private rightMousePressed = false;
  private rightMouseSuppressed = false;
  private aimingDownSightsAllowed: () => boolean = () => true;
  private dominantUsePressed = false;
  private dominantUseDown = false;
  private offUsePressed = false;
  private crouchTogglePressed = false;
  cursorX = globalThis.innerWidth / 2;
  cursorY = globalThis.innerHeight / 2;
  private readonly target: HTMLElement;
  private readonly dominantUseAllowed: () => boolean;
  private readonly cancelOnBlurAllowed: () => boolean;
  constructor(
    target: HTMLElement,
    dominantUseAllowed: () => boolean = () => true,
    cancelOnBlurAllowed: () => boolean = () => true,
  ) {
    this.target = target;
    this.dominantUseAllowed = dominantUseAllowed;
    this.cancelOnBlurAllowed = cancelOnBlurAllowed;
    target.addEventListener('mousedown', (event) => {
      const mouse = event as MouseEvent;
      if (mouse.button === 2) {
        this.rightMousePressed = true;
      }
      if (this.locked && !this.menuPointer) {
        keyboardInput.pressPointer(mouse.button, mouse);
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
      const mouse = event as MouseEvent;
      const { button } = mouse;
      keyboardInput.releasePointer(button, mouse.timeStamp);
      if (button === 2) {
        this.rightMouseSuppressed = false;
      }
      if (button === 0) {
        this.dominantUseDown = false;
      }
    });
    globalThis.addEventListener('blur', () => {
      if (this.cancelOnBlurAllowed()) {
        this.cancel();
      }
    });
    document.addEventListener('mousemove', (event) => {
      if (!(this.locked && !this.menuPointer)) {
        return;
      }
      this.yaw -= event.movementX * SENSITIVITY;
      this.pitch = adjustLookPitch(this.pitch, -event.movementY * SENSITIVITY).pitch;
    });
  }
  cancel(preservePointer = false): void {
    this.reload.cancel();
    this.rightMousePressed = false;
    this.rightMouseSuppressed = false;
    if (!preservePointer) {
      this.rightMouseHeld = false;
      this.aimingDownSights = false;
    }
    this.dominantUseDown = false;
    this.dominantUsePressed = false;
    this.offUsePressed = false;
    this.crouchTogglePressed = false;
  }
  setAimingDownSightsAllowed(allowed: () => boolean): void {
    this.aimingDownSightsAllowed = allowed;
  }
  toggleAimingDownSights(): void {
    if (this.rightMouseActionHeld && this.locked && !this.menuPointer && this.aimingDownSightsAllowed()) {
      this.aimingDownSights = !this.aimingDownSights;
    }
  }
  useOff(): void {
    if (this.locked && !this.menuPointer) {
      this.offUsePressed = true;
    }
  }
  get rightMouseActionHeld(): boolean {
    return this.rightMouseHeld && !this.rightMouseSuppressed;
  }

  consumeRightMousePressed(): boolean {
    const pressed = this.rightMousePressed;
    this.rightMousePressed = false;
    return pressed;
  }

  suppressRightMouseUntilRelease(): void {
    this.rightMouseSuppressed = this.rightMouseHeld;
  }

  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  get dominantUseHeld(): boolean {
    return this.dominantUseDown;
  }

  adjustPitch(delta: number): number {
    if (!Number.isFinite(delta)) {
      throw new Error('Invalid pitch adjustment');
    }
    const adjusted = adjustLookPitch(this.pitch, delta);
    this.pitch = adjusted.pitch;
    return adjusted.applied;
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
    // Firefox can return undefined; native permission refusal leaves the overlay available for another click.
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
    const on = (action: string) => (keyboardInput.held(action) ? 1 : 0);
    return {
      forward: on('movement.forward') - on('movement.back'),
      right: on('movement.right') - on('movement.left'),
      jump: keyboardInput.held('movement.jump') || keyboardInput.held('noclip.ascend'),
      sprint: keyboardInput.held('movement.sprint'),
      walk: this.walking,
      useDominant: this.dominantUsePressed,
      useDominantHeld: this.dominantUseDown,
      useOff: this.offUsePressed,
    };
  }
  consumeDominantUse(): void {
    this.dominantUsePressed = false;
  }
  consumeOffUse(): void {
    this.offUsePressed = false;
  }
  requestCrouchToggle(): void {
    this.crouchTogglePressed = true;
  }
  consumeCrouchToggle(): boolean {
    const pressed = this.crouchTogglePressed;
    this.crouchTogglePressed = false;
    return pressed;
  }
}
