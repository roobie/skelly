// Pointer-lock mouse look; keyboard intents come from the shared semantic owner.

import { FreeLook, type FreeLookTuning } from './freeLook.ts';
import { keyboardInput } from './inputBindings.ts';
import type { MoveIntent, StanceToggle } from './player.ts';
import { ReloadInput } from './reloadInput.ts';

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
  readonly reload = new ReloadInput();
  readonly freeLook = new FreeLook();
  private freeLookInput: { tuning: FreeLookTuning; ads: () => boolean } | undefined;
  yaw = 0;
  pitch = 0;
  walking = false;
  menuPointer = false;
  rightMouseHeld = false;
  aimingDownSights = false;
  private rightMousePressed = false;
  private rightMouseSuppressed = false;
  private aimingDownSightsAllowed: () => boolean = () => true;
  heldMenuPress: () => boolean = () => false;
  heldMenuRelease: () => void = () => undefined;
  private dominantUsePressed = false;
  private dominantUseDown = false;
  private offUsePressed = false;
  private stanceTogglePressed: StanceToggle | undefined;
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
    target.addEventListener('mousedown', (event) => {
      if (!this.viewerInputAllowed()) {
        return;
      }
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
        this.dominantUseAllowed() &&
        !this.heldMenuPress()
      ) {
        this.dominantUsePressed = true;
        this.dominantUseDown = true;
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
        this.rightMouseSuppressed = false;
      }
      if (button === 0) {
        this.heldMenuRelease();
        this.dominantUseDown = false;
      }
    });
    globalThis.addEventListener('blur', () => {
      if (this.cancelOnBlurAllowed()) {
        this.cancel();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked && this.cancelOnBlurAllowed()) {
        this.freeLook.clear();
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
      this.advanceFreeLook(0);
      if (this.freeLook.active && this.freeLookInput) {
        this.freeLook.turn(-event.movementX * sensitivity, -event.movementY * sensitivity, this.freeLookInput.tuning);
      } else {
        this.yaw -= event.movementX * sensitivity;
        this.pitch = adjustLookPitch(this.pitch, -event.movementY * sensitivity).pitch;
      }
    });
  }
  cancel(preservePointer = false): void {
    this.freeLook.clear();
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
    this.stanceTogglePressed = undefined;
  }
  setFreeLook(tuning: FreeLookTuning, ads: () => boolean): void {
    this.freeLookInput = { tuning, ads };
  }
  advanceFreeLook(dt: number): void {
    if (this.freeLookInput && this.viewerInputAllowed()) {
      this.freeLook.update(
        dt,
        this.locked && !this.menuPointer && keyboardInput.held('view.free-look'),
        this.freeLookInput.ads(),
        this.freeLookInput.tuning,
      );
    }
  }
  get freeLooking(): boolean {
    this.advanceFreeLook(0);
    return this.freeLook.active;
  }
  get viewYaw(): number {
    return this.yaw + this.freeLook.yaw;
  }
  get viewPitch(): number {
    return adjustLookPitch(this.pitch, this.freeLook.pitch).pitch;
  }
  setMouseLookOverride(override: (movementX: number, movementY: number) => boolean): void {
    this.mouseLookOverride = override;
  }
  setLookSensitivity(base: number, appliedPower: () => number): void {
    this.lookSensitivity = { base, appliedPower };
  }
  setAimingDownSightsAllowed(allowed: () => boolean): void {
    this.aimingDownSightsAllowed = allowed;
  }
  toggleAimingDownSights(replaying = false): void {
    if (
      this.rightMouseActionHeld &&
      (replaying || (this.locked && !this.menuPointer)) &&
      this.aimingDownSightsAllowed()
    ) {
      this.aimingDownSights = !this.aimingDownSights;
    }
  }
  startFreeLook(): void {
    this.aimingDownSights = false;
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
    requestInputLock(this.target);
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
      lean: on('player.lean-right') - on('player.lean-left'),
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
  requestStanceToggle(toggle: StanceToggle): void {
    this.stanceTogglePressed = toggle;
  }
  consumeStanceToggle(): StanceToggle | undefined {
    const pressed = this.stanceTogglePressed;
    this.stanceTogglePressed = undefined;
    return pressed;
  }
}
