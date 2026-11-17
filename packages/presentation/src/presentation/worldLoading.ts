import type { ReplayGeneratedColumn } from '@skelly/engine/input';
import type { RealTimestamp } from '@skelly/engine/sim';
import type { Vec3 } from '@skelly/engine/world';
import type { Engine } from './engine.ts';

export interface LoadingFrameDraw {
  /** True when drawing the world also updates the skylight (a renderer's before-render hook). */
  readonly worldFeedsSkylight: boolean;
  readonly skylight: () => void;
  readonly world: () => void;
}

/** Skips world draws behind the opaque loading mask; see `packages/deadvox/TROUBLESHOOTING.md`, "Startup and save discovery". */
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
  private readonly realSecondsPerWorkUnit: number;

  constructor(
    engine: Pick<Engine, 'streamer' | 'skylight' | 'config'>,
    realSecondsPerWorkUnit: number,
    recordedColumns?: readonly ReplayGeneratedColumn[],
  ) {
    this.engine = engine;
    this.recordedColumns = recordedColumns;
    this.realSecondsPerWorkUnit = realSecondsPerWorkUnit;
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

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Loading readiness combines failure, lighting and deadline states.
  check(
    position: Vec3,
    nowRealMs: RealTimestamp,
    lightingPosition: Vec3 = position,
    prepareDraw: () => boolean = () => true,
  ): void {
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
    if (unmeshed === 0 && (lighting?.ready ?? true) && prepareDraw()) {
      this.state = 'ready';
      (streamer as { reportLoadReady?: (condition: string) => void }).reportLoadReady?.(
        this.recordedColumns
          ? `recorded columns meshed; lighting ${(lighting?.ready ?? true) ? 'ready' : 'pending'}`
          : `ready-radius columns meshed; lighting ${(lighting?.ready ?? true) ? 'ready' : 'pending'}`,
      );
      return;
    }
    const meshWork = this.recordedColumns
      ? this.recordedColumns.length * (1 + config.scale.maxCy - config.scale.minCy + 1)
      : streamer.loadingWorkUnits;
    // One deadline covers meshes, lighting and GPU preparation, scaled to the initial workload.
    this.deadlineRealMs ??=
      nowRealMs + Math.max(1, meshWork + (lighting?.workUnits ?? 0)) * this.realSecondsPerWorkUnit * 1000;
    if (nowRealMs >= this.deadlineRealMs) {
      this.fail(
        `World loading stalled (${unmeshed} unmeshed columns; lighting ${(lighting?.ready ?? true) ? 'ready' : 'pending'}). Reload to try again.`,
      );
    }
  }
}
