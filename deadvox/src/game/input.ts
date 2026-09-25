// Keyboard and pointer-lock mouse look.

import type { MoveIntent } from './player.ts';

const SENSITIVITY = 0.0022;

export class Input {
  readonly held = new Set<string>();
  yaw = 0;
  pitch = 0;
  /** Toggled with Z: walk instead of jog. */
  walking = false;
  private readonly target: HTMLElement;

  constructor(target: HTMLElement) {
    this.target = target;
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
    globalThis.addEventListener('blur', () => this.held.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) {
        return;
      }
      this.yaw -= e.movementX * SENSITIVITY;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - e.movementY * SENSITIVITY));
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  lock(): void {
    // Rejects if the browser refuses (e.g. too soon after Esc); the overlay stays up and the player clicks again.
    this.target.requestPointerLock().catch(() => undefined);
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
    };
  }
}
