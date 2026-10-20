import type { Vec3 } from '../core/coords.ts';
import { type StepOffsetState, updateStepOffset } from '../core/stepOffset.ts';

/** Render-only vertical compensation for grounded, one-step terrain snaps. */
export class StepOffset {
  private state: StepOffsetState = { offset: 0 };
  private readonly stepHeightMetres: number;

  constructor(stepHeightMetres: number) {
    this.stepHeightMetres = stepHeightMetres;
  }

  get currentOffset(): number {
    return this.state.offset;
  }

  clear(): void {
    this.state = { offset: 0 };
  }

  /** Returns a world-space Y offset; never alters the physical position. */
  update(position: Vec3, grounded: boolean, realDt: number, reset = false): number {
    this.state = updateStepOffset(this.state, {
      position,
      grounded,
      dt: realDt,
      stepHeightMetres: this.stepHeightMetres,
      reset,
    });
    return this.state.offset;
  }
}
