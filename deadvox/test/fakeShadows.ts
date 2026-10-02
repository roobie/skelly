import { clampShadowDistance, nextShadowDistance, type ShadowState } from '../src/core/mood.ts';

/** The state half of `Shadows`, which needs a WebGL renderer for the rest. */
export class FakeShadows {
  settings: ShadowState = { sun: true, torch: true, distance: 40 };

  restore(state: ShadowState): void {
    this.settings = { ...state, distance: clampShadowDistance(state.distance) };
  }

  setSun(on: boolean): void {
    this.settings = { ...this.settings, sun: on };
  }

  setTorch(on: boolean): void {
    this.settings = { ...this.settings, torch: on };
  }

  stepDistance(): void {
    this.settings = { ...this.settings, distance: nextShadowDistance(this.settings.distance) };
  }
}
