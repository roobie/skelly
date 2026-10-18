import type { GraphicsOptions } from '../core/graphics.ts';

type Policy = GraphicsOptions['renderScale'];

/** GPU cost, not presentation cadence: a busy simulation cannot make pixels cheaper. */
export class AdaptiveScale {
  private sum = 0;
  private samples = 0;
  private fixed = false;
  scale: number;

  private readonly policy: Policy;

  constructor(policy: Policy) {
    this.policy = policy;
    this.scale = this.initial();
  }

  get active(): boolean {
    return this.policy.adaptive.enabled && !this.fixed;
  }

  private initial(): number {
    const { adaptive, default: value } = this.policy;
    return adaptive.enabled ? Math.max(adaptive.min, Math.min(adaptive.max, value)) : value;
  }

  setChoice(value: number, explicit: boolean): void {
    if (this.fixed === explicit && (explicit ? this.scale === value : true)) {
      return;
    }
    this.fixed = explicit;
    this.scale = explicit ? value : this.initial();
    this.sum = 0;
    this.samples = 0;
  }

  sample(gpuMs: number, measuredScale: number): number {
    const { adaptive } = this.policy;
    // Delayed queries from a previous target size cannot steer the resized target.
    if (this.fixed || !adaptive.enabled || measuredScale !== this.scale || !Number.isFinite(gpuMs) || gpuMs < 0) {
      return this.scale;
    }
    this.sum += gpuMs;
    this.samples += 1;
    if (this.samples < adaptive.sampleWindow) {
      return this.scale;
    }
    const mean = this.sum / this.samples;
    this.sum = 0;
    this.samples = 0;
    if (mean > adaptive.targetRealMs + adaptive.hysteresisRealMs) {
      this.scale = Math.max(adaptive.min, this.scale - adaptive.step);
    } else if (mean < adaptive.targetRealMs - adaptive.hysteresisRealMs) {
      // Recover only if the predicted pixel cost of the next size also has headroom.
      const next = Math.min(adaptive.max, this.scale + adaptive.step);
      if (mean * (next / this.scale) ** 2 < adaptive.targetRealMs - adaptive.hysteresisRealMs) {
        this.scale = next;
      }
    }
    return this.scale;
  }
}
