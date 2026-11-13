// The player's control state as the simulation and replay read and write it; pointer and key listeners feed it.

import { FreeLook, type FreeLookTuning } from './freeLook.ts';
import type { MoveIntent, StanceToggle } from './player.ts';
import { ReloadInput } from './reloadInput.ts';

/** What the input front end reports about pointer capture and held bindings. */
export interface PlayerControlPorts {
  /** The pointer is captured for play rather than the menu pointer. */
  playing: () => boolean;
  /** Live viewer input is admitted; false while a replay drives the controls. */
  viewerInputAllowed: () => boolean;
  /** Whether the semantic action's binding is held. */
  held: (action: string) => boolean;
}

export class PlayerControls {
  readonly reload = new ReloadInput();
  readonly freeLook = new FreeLook();
  private freeLookInput: { tuning: FreeLookTuning; ads: () => boolean } | undefined;
  yaw = 0;
  pitch = 0;
  walking = false;
  rightMouseHeld = false;
  aimingDownSights = false;
  private rightMousePressed = false;
  private rightMouseSuppressed = false;
  private aimingDownSightsAllowed: () => boolean = () => true;
  private dominantUsePressed = false;
  private dominantUseDown = false;
  private offUsePressed = false;
  private stanceTogglePressed: StanceToggle | undefined;
  private readonly ports: PlayerControlPorts;
  constructor(ports: PlayerControlPorts) {
    this.ports = ports;
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
  pressRightMouse(): void {
    this.rightMousePressed = true;
  }
  releaseRightMouse(): void {
    this.rightMouseSuppressed = false;
  }
  pressDominantUse(): void {
    this.dominantUsePressed = true;
    this.dominantUseDown = true;
  }
  releaseDominantUse(): void {
    this.dominantUseDown = false;
  }
  /** Turns by already-scaled pointer movement: the head while free looking, else the body. */
  look(movementX: number, movementY: number): void {
    this.advanceFreeLook(0);
    if (this.freeLook.active && this.freeLookInput) {
      this.freeLook.turn(-movementX, -movementY, this.freeLookInput.tuning);
    } else {
      this.yaw -= movementX;
      this.pitch = adjustLookPitch(this.pitch, -movementY).pitch;
    }
  }
  setFreeLook(tuning: FreeLookTuning, ads: () => boolean): void {
    this.freeLookInput = { tuning, ads };
  }
  advanceFreeLook(dt: number): void {
    if (this.freeLookInput && this.ports.viewerInputAllowed()) {
      this.freeLook.update(
        dt,
        this.ports.playing() && this.ports.held('view.free-look'),
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
  setAimingDownSightsAllowed(allowed: () => boolean): void {
    this.aimingDownSightsAllowed = allowed;
  }
  toggleAimingDownSights(replaying = false): void {
    if (this.rightMouseActionHeld && (replaying || this.ports.playing()) && this.aimingDownSightsAllowed()) {
      this.aimingDownSights = !this.aimingDownSights;
    }
  }
  startFreeLook(): void {
    this.aimingDownSights = false;
  }
  useOff(): void {
    if (this.ports.playing()) {
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
  intent(): MoveIntent {
    const on = (action: string) => (this.ports.held(action) ? 1 : 0);
    return {
      forward: on('movement.forward') - on('movement.back'),
      right: on('movement.right') - on('movement.left'),
      lean: on('player.lean-right') - on('player.lean-left'),
      jump: this.ports.held('movement.jump') || this.ports.held('noclip.ascend'),
      sprint: this.ports.held('movement.sprint'),
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

export const LOOK_PITCH_LIMIT = 1.55;

export const adjustLookPitch = (pitch: number, delta: number): { pitch: number; applied: number } => {
  if (![pitch, delta].every(Number.isFinite)) {
    throw new Error('Invalid pitch adjustment');
  }
  const next = Math.max(-LOOK_PITCH_LIMIT, Math.min(LOOK_PITCH_LIMIT, pitch + delta));
  return { pitch: next, applied: next - pitch };
};
