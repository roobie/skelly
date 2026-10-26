import type { Vec3 } from '../core/coords.ts';
import { type Body, bodyOverlapsTerrain } from '../core/physics.ts';
import type { SolidAt } from '../core/raycast.ts';
import { IDLE, type SessionControls } from './session.ts';

/** Actions that keep working while the camera is detached; every other command belongs to the avatar. */
const DETACHED_COMMAND_PREFIXES = ['debug.', 'noclip.', 'ui.main-menu-toggle', 'hud.toggle'] as const;

export type SpectatorTeleport = 'moved' | 'blocked';

/**
 * A free-flying view that leaves the avatar standing. The camera is a view, not an actor: `guard` hands the
 * session an inert player while it flies, so flying changes nothing in the simulation.
 */
export class SpectatorCamera {
  private flight: Body | undefined;
  private view: { readonly yaw: number; readonly pitch: number } | undefined;

  get enabled(): boolean {
    return this.flight !== undefined;
  }

  /** The flying body, at the camera's position; undefined unless detached. */
  get body(): Body | undefined {
    return this.flight;
  }

  /** Detaches at the avatar's eye, or returns the camera to the avatar. */
  toggle(avatar: Body, eye: Vec3, yaw: number, pitch: number): void {
    if (this.flight) {
      this.flight = undefined;
      this.view = undefined;
      return;
    }
    this.flight = { ...avatar, pos: [...eye], vel: [0, 0, 0], onGround: false };
    this.view = { yaw, pitch };
  }

  /** The avatar's facing: the live look while attached, the look it had at detach while the camera flies. */
  avatarYaw(liveYaw: number): number {
    return this.view?.yaw ?? liveYaw;
  }

  /** The avatar's vertical aim: the live look while attached, the look it had at detach while the camera flies. */
  avatarPitch(livePitch: number): number {
    return this.view?.pitch ?? livePitch;
  }

  allowsCommand(action: string): boolean {
    return !this.flight || DETACHED_COMMAND_PREFIXES.some((prefix) => action.startsWith(prefix));
  }

  /**
   * Moves the avatar's feet under the camera. A spot where the avatar's box would overlap solid terrain
   * refuses and leaves the avatar where it was; a spot in the air moves it and gravity does the rest.
   */
  teleport(avatar: Body, eyeHeight: number, isSolid: SolidAt): SpectatorTeleport | undefined {
    if (!this.flight) {
      return undefined;
    }
    const [x, y, z] = this.flight.pos;
    const feet: Vec3 = [x, y - eyeHeight, z];
    if (bodyOverlapsTerrain({ ...avatar, pos: feet }, isSolid)) {
      return 'blocked';
    }
    avatar.pos = feet;
    avatar.vel = [0, 0, 0];
    avatar.onGround = false;
    return 'moved';
  }

  /** The session's controls with every avatar-bound input silenced while detached; its look stays where it was. */
  guard(controls: SessionControls): SessionControls {
    const detached = () => this.flight !== undefined;
    return {
      ...controls,
      intent: () => (detached() ? IDLE : controls.intent()),
      consumeStanceToggle: () => {
        const toggled = controls.consumeStanceToggle?.();
        return detached() ? undefined : toggled;
      },
      useDominant: () => (detached() ? undefined : controls.useDominant?.()),
      useOff: () => (detached() ? undefined : controls.useOff?.()),
      heldDominantUse: (time, pressed, held) =>
        controls.heldDominantUse?.(time, pressed && !detached(), held && !detached()),
      readyHeld: () => !detached() && (controls.readyHeld?.() ?? false),
      blocking: () => !detached() && (controls.blocking?.() ?? false),
      automaticFireHeld: () => !detached() && (controls.automaticFireHeld?.() ?? false),
      yaw: () => this.avatarYaw(controls.yaw()),
      pitch: () => this.avatarPitch(controls.pitch()),
      descending: () => !detached() && controls.descending(),
    };
  }
}
