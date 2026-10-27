import type { SessionControls } from './session.ts';

export type DebugGunPoseMode = 'relaxed' | 'hip' | 'ads';

export class DebugGunPose {
  private latched: DebugGunPoseMode | undefined;

  private readonly enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  get mode(): DebugGunPoseMode | 'live' {
    return this.latched ?? 'live';
  }

  get active(): boolean {
    return this.latched !== undefined;
  }

  toggle(mode: DebugGunPoseMode): void {
    if (this.enabled) {
      this.latched = this.latched === mode ? undefined : mode;
    }
  }

  readyHeld(live: boolean): boolean {
    return this.latched === undefined ? live : this.latched !== 'relaxed';
  }

  aimingDownSights(live: boolean): boolean {
    return this.latched === undefined ? live : this.latched === 'ads';
  }

  guard(controls: SessionControls): SessionControls {
    return { ...controls, readyHeld: () => this.readyHeld(controls.readyHeld?.() ?? false) };
  }
}
