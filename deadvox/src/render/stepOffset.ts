import type { Vec3 } from '../core/coords.ts';

interface GroundSample {
  position: Vec3;
  grounded: boolean;
}

const TELEPORT_METRES = 1;
const STEP_SNAP_FRACTION = 0.8;
const STEP_EASE_SECONDS = 0.25;
const EPSILON = 1e-4;

/** Render-only vertical compensation for grounded, one-step terrain snaps. */
export class StepOffset {
  private previous: GroundSample | undefined;
  private offset = 0;
  private readonly stepHeightMetres: number;

  constructor(stepHeightMetres: number) {
    this.stepHeightMetres = stepHeightMetres;
  }

  get currentOffset(): number {
    return this.offset;
  }

  clear(): void {
    this.previous = undefined;
    this.offset = 0;
  }

  /** Returns a world-space Y offset; never alters the physical position. */
  update(position: Vec3, grounded: boolean, realDt: number, reset = false): number {
    if (reset) {
      this.clear();
      this.previous = { position: [...position], grounded };
      return 0;
    }

    const { previous } = this;
    if (previous) {
      const horizontal = Math.hypot(position[0] - previous.position[0], position[2] - previous.position[2]);
      const vertical = position[1] - previous.position[1];
      if (horizontal > TELEPORT_METRES || Math.abs(vertical) > this.stepHeightMetres + EPSILON) {
        this.offset = 0;
      } else if (!(grounded && previous.grounded)) {
        // Jumps and ordinary falls follow the physical trajectory exactly.
        this.offset = 0;
      } else if (Math.abs(vertical) >= this.stepHeightMetres * STEP_SNAP_FRACTION) {
        // Cancel a grounded step snap in the render pose, then ease the compensation away.
        this.offset = Math.max(-this.stepHeightMetres, Math.min(this.stepHeightMetres, this.offset - vertical));
      }
    }

    if (realDt > 0 && this.offset !== 0) {
      const change = (this.stepHeightMetres / STEP_EASE_SECONDS) * realDt;
      this.offset = Math.abs(this.offset) <= change + EPSILON ? 0 : this.offset - Math.sign(this.offset) * change;
    }
    this.previous = { position: [...position], grounded };
    return this.offset;
  }
}
