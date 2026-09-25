// Keyboard and pointer-lock mouse look.

import type { MoveIntent } from './player.ts';

const SENSITIVITY = 0.0022;

export class Input {
  readonly held = new Set<string>();
  yaw = 0;
  pitch = 0;
  private readonly target: HTMLElement;

  constructor(target: HTMLElement) {
    this.target = target;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * SENSITIVITY;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - e.movementY * SENSITIVITY));
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  lock(): void {
    void this.target.requestPointerLock();
  }

  unlock(): void {
    if (this.locked) document.exitPointerLock();
  }

  intent(): MoveIntent {
    const on = (code: string) => (this.held.has(code) ? 1 : 0);
    return {
      forward: on('KeyW') - on('KeyS'),
      right: on('KeyD') - on('KeyA'),
      jump: this.held.has('Space'),
      sprint: this.held.has('ShiftLeft') || this.held.has('ShiftRight'),
    };
  }
}
