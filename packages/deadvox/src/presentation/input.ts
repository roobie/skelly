// Pointer-lock mouse listeners writing the player's controls; keyboard intents come from the shared semantic owner.

import { PlayerControls } from '../game/playerControls.ts';
import { keyboardInput } from './inputBindings.ts';

export const nextMenuCursor = (
  position: { x: number; y: number },
  movement: { x: number; y: number },
  viewport: { width: number; height: number },
): { x: number; y: number } => ({
  x: Math.max(0, Math.min(viewport.width - 1, position.x + movement.x)),
  y: Math.max(0, Math.min(viewport.height - 1, position.y + movement.y)),
});
const pendingLocks = new WeakMap<HTMLElement, Promise<void>>();

export function requestInputLock(target: HTMLElement): Promise<void> {
  const pending = pendingLocks.get(target);
  if (pending) {
    return pending;
  }
  if (document.pointerLockElement === target) {
    return Promise.resolve();
  }
  const request = Promise.resolve(target.requestPointerLock())
    .catch((error: unknown) => {
      // biome-ignore lint/suspicious/noConsole: preserve native permission failures for browser diagnosis.
      console.warn('Pointer lock request failed', error);
    })
    .finally(() => pendingLocks.delete(target));
  pendingLocks.set(target, request);
  return request;
}

export class Input {
  readonly controls: PlayerControls;
  menuPointer = false;
  cursorX = globalThis.innerWidth / 2;
  cursorY = globalThis.innerHeight / 2;
  private readonly target: HTMLElement;
  private readonly dominantUseAllowed: () => boolean;
  private readonly cancelOnBlurAllowed: () => boolean;
  private readonly viewerInputAllowed: () => boolean;
  private mouseLookOverride: ((movementX: number, movementY: number) => boolean) | undefined;
  private lookSensitivity: { base: number; appliedPower: () => number } | undefined;
  constructor(
    target: HTMLElement,
    dominantUseAllowed: () => boolean = () => true,
    cancelOnBlurAllowed: () => boolean = () => true,
    viewerInputAllowed: () => boolean = () => true,
  ) {
    this.target = target;
    this.dominantUseAllowed = dominantUseAllowed;
    this.cancelOnBlurAllowed = cancelOnBlurAllowed;
    this.viewerInputAllowed = viewerInputAllowed;
    const controls = new PlayerControls({
      playing: () => this.locked && !this.menuPointer,
      viewerInputAllowed: () => this.viewerInputAllowed(),
      held: (action) => keyboardInput.held(action),
    });
    this.controls = controls;
    target.addEventListener('mousedown', (event) => {
      if (!this.viewerInputAllowed()) {
        return;
      }
      const mouse = event as MouseEvent;
      if (mouse.button === 2) {
        controls.pressRightMouse();
      }
      if (this.locked && !this.menuPointer) {
        keyboardInput.pressPointer(mouse.button, mouse);
      }
      if (
        mouse.button === 0 &&
        !controls.dominantUseHeld &&
        this.locked &&
        !this.menuPointer &&
        this.dominantUseAllowed()
      ) {
        controls.pressDominantUse();
      }
    });
    globalThis.addEventListener('mouseup', (event) => {
      if (!this.viewerInputAllowed()) {
        return;
      }
      const mouse = event as MouseEvent;
      const { button } = mouse;
      keyboardInput.releasePointer(button, mouse.timeStamp);
      if (button === 2) {
        controls.releaseRightMouse();
      }
      if (button === 0) {
        controls.releaseDominantUse();
      }
    });
    globalThis.addEventListener('blur', () => {
      if (this.cancelOnBlurAllowed()) {
        controls.cancel();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked && this.cancelOnBlurAllowed()) {
        controls.freeLook.clear();
      }
    });
    document.addEventListener('mousemove', (event) => {
      if (!(this.viewerInputAllowed() && this.locked && !this.menuPointer)) {
        return;
      }
      if (this.mouseLookOverride?.(event.movementX, event.movementY)) {
        return;
      }
      const { lookSensitivity } = this;
      if (!lookSensitivity) {
        throw new Error('Missing look sensitivity');
      }
      const sensitivity = lookSensitivity.base / lookSensitivity.appliedPower();
      if (!(Number.isFinite(sensitivity) && sensitivity > 0)) {
        throw new Error('Invalid look sensitivity');
      }
      controls.look(event.movementX * sensitivity, event.movementY * sensitivity);
    });
  }
  setMouseLookOverride(override: (movementX: number, movementY: number) => boolean): void {
    this.mouseLookOverride = override;
  }
  setLookSensitivity(base: number, appliedPower: () => number): void {
    this.lookSensitivity = { base, appliedPower };
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
  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }
  lock(): void {
    requestInputLock(this.target);
  }
  unlock(): void {
    if (this.locked) {
      document.exitPointerLock();
    }
  }
}
