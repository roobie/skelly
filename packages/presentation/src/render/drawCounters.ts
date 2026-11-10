import { Vector2 } from 'three';

export interface DrawSubmission {
  readonly calls: number;
  readonly triangles: number;
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
}

interface CounterRenderer {
  readonly info: {
    autoReset: boolean;
    readonly render: { readonly calls: number; readonly triangles: number };
    reset: () => void;
  };
  getDrawingBufferSize: (target: Vector2) => Vector2;
}

export class DrawCounters {
  private readonly size = new Vector2();
  private autoReset = true;
  snapshot: DrawSubmission | null = null;

  private readonly renderer: CounterRenderer;

  constructor(renderer: CounterRenderer) {
    this.renderer = renderer;
  }

  begin(): void {
    const { info } = this.renderer;
    this.autoReset = info.autoReset;
    // Three's per-render reset would discard earlier scene, optic and post submissions.
    info.autoReset = false;
    info.reset();
    this.snapshot = null;
  }

  end(): void {
    const { info } = this.renderer;
    try {
      this.renderer.getDrawingBufferSize(this.size);
      this.snapshot = {
        calls: info.render.calls,
        triangles: info.render.triangles,
        drawingBufferWidth: this.size.x,
        drawingBufferHeight: this.size.y,
      };
    } finally {
      info.autoReset = this.autoReset;
    }
  }
}
