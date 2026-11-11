import { clampShadowDistance, defaultShadows, nextShadowDistance, type ShadowState } from '@skelly/engine/look';
import { SUN_SHADOW_FIXTURE } from './lookFixture.ts';

/** The state half of `Shadows`, which needs a WebGL renderer for the rest. */
export class FakeShadows {
  settings: ShadowState = defaultShadows(SUN_SHADOW_FIXTURE);

  restore(state: ShadowState): void {
    this.settings = { ...state, distance: clampShadowDistance(state.distance, SUN_SHADOW_FIXTURE) };
  }

  setSun(on: boolean): void {
    this.settings = { ...this.settings, sun: on };
  }

  setTorch(on: boolean): void {
    this.settings = { ...this.settings, torch: on };
  }

  setDistance(distance: number): void {
    this.restore({ ...this.settings, distance });
  }

  stepDistance(): void {
    this.setDistance(nextShadowDistance(this.settings.distance, SUN_SHADOW_FIXTURE));
  }
}
