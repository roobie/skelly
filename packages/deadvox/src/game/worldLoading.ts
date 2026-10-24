import type { Vec3 } from '../core/coords.ts';
import type { RealTimestamp } from '../core/time.ts';
import type { Engine } from './engine.ts';
import type { ReplayGeneratedColumn } from './inputReplay.ts';

// Scale the deadline to chunk-sized work so large views do not inherit a small view's failure budget.
const REAL_MS_PER_WORK_UNIT = 500;

export interface LoadingFrameDraw {
  /** True when drawing the world also updates the skylight (a renderer's before-render hook). */
  readonly worldFeedsSkylight: boolean;
  readonly skylight: () => void;
  readonly world: () => void;
}

/** Skips world draws behind the opaque loading mask; see `TROUBLESHOOTING.md`, "Startup and save discovery". */
export const finishLoadingFrame = (
  loading: Pick<WorldLoading, 'ready'>,
  check: () => void,
  draw: LoadingFrameDraw,
): void => {
  if (!(draw.worldFeedsSkylight && loading.ready)) {
    draw.skylight();
  }
  check();
  if (loading.ready) {
    draw.world();
  }
};

export class WorldLoading {
  state: 'loading' | 'ready' | 'failed' = 'loading';
  error = '';
  private deadlineRealMs: number | undefined;

  private readonly engine: Pick<Engine, 'streamer' | 'skylight' | 'config'>;
  private readonly recordedColumns: readonly ReplayGeneratedColumn[] | undefined;

  constructor(
    engine: Pick<Engine, 'streamer' | 'skylight' | 'config'>,
    recordedColumns?: readonly ReplayGeneratedColumn[],
  ) {
    this.engine = engine;
    this.recordedColumns = recordedColumns;
  }

  get ready(): boolean {
    return this.state === 'ready';
  }

  fail(error: unknown): void {
    if (!this.ready) {
      this.state = 'failed';
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  check(position: Vec3, nowRealMs: RealTimestamp, lightingPosition: Vec3 = position): void {
    if (this.state !== 'loading') {
      return;
    }
    const { streamer, skylight, config } = this.engine;
    if (streamer.failure) {
      this.fail(streamer.failure);
      return;
    }
    const lighting = skylight?.loadingReadiness(lightingPosition);
    const unmeshed = this.recordedColumns
      ? streamer.unmeshedRecordedColumns(position[0], position[2], this.recordedColumns, config.readyRadiusChunks)
      : streamer.unmeshedColumns(position[0], position[2], config.readyRadiusChunks);
    if (unmeshed === 0 && (lighting?.ready ?? true)) {
      this.state = 'ready';
      return;
    }
    const meshWork = this.recordedColumns
      ? this.recordedColumns.length * (1 + config.scale.maxCy - config.scale.minCy + 1)
      : streamer.loadingWorkUnits;
    this.deadlineRealMs ??= nowRealMs + Math.max(1, meshWork + (lighting?.workUnits ?? 0)) * REAL_MS_PER_WORK_UNIT;
    if (nowRealMs >= this.deadlineRealMs) {
      this.fail(
        `World loading stalled (${unmeshed} unmeshed columns; lighting ${(lighting?.ready ?? true) ? 'ready' : 'pending'}). Reload to try again.`,
      );
    }
  }
}
