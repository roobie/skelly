import type { ReplayGeneratedColumn } from '@skelly/engine/input';
import type { RealTimestamp } from '@skelly/engine/sim';
import type { Vec3 } from '@skelly/engine/world';
import type { Engine } from './engine.ts';
import { LoadPhases } from './loadPhases.ts';

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

export interface LoadingCheck {
  /** Where lighting readiness is judged; the body's position by default. */
  readonly lightingPosition?: Vec3;
  /** Finishes GPU preparation once meshes and lighting are ready; true when the first frame may draw. */
  readonly prepareDraw?: () => boolean;
  /** Starts GPU program warm-up. Called on the first check, so compiling overlaps streaming rather than following it. */
  readonly warmUp?: () => void;
}

type LoadingEngine = Pick<Engine, 'streamer' | 'skylight' | 'config' | 'meshes'>;

export class WorldLoading {
  state: 'loading' | 'ready' | 'failed' = 'loading';
  error = '';
  /**
   * Whether the frame that last checked drew the whole view radius meshed, with no mesh or reveal change since the
   * frame before; false while loading.
   */
  viewSettled = false;
  readonly phases = new LoadPhases();
  private deadlineRealMs: number | undefined;
  private settleVersion: number | undefined;
  private warmUpStarted = false;

  private readonly engine: LoadingEngine;
  private readonly recordedColumns: readonly ReplayGeneratedColumn[] | undefined;
  private readonly realSecondsPerWorkUnit: number;

  constructor(
    engine: LoadingEngine,
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

  /** Checks once per play frame; after loading it keeps `viewSettled` current. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Loading readiness combines failure, lighting and deadline states.
  check(
    position: Vec3,
    nowRealMs: RealTimestamp,
    { lightingPosition = position, prepareDraw = () => true, warmUp }: LoadingCheck = {},
  ): void {
    this.phases.frame();
    if (this.state === 'ready') {
      this.settle(position);
    }
    if (this.state !== 'loading') {
      return;
    }
    const { streamer, skylight, config } = this.engine;
    if (streamer.failure) {
      this.fail(streamer.failure);
      return;
    }
    if (!this.warmUpStarted) {
      this.warmUpStarted = true;
      warmUp?.();
    }
    const lighting = skylight?.loadingReadiness(lightingPosition);
    const unmeshed = this.recordedColumns
      ? streamer.unmeshedRecordedColumns(position[0], position[2], this.recordedColumns, config.readyRadiusChunks)
      : streamer.unmeshedColumns(position[0], position[2], config.readyRadiusChunks);
    if (!this.recordedColumns) {
      this.phases.markWhen(
        'ready ring generated',
        () => streamer.ungeneratedColumns(position[0], position[2], config.readyRadiusChunks) === 0,
      );
    }
    this.phases.markWhen('ready ring meshed', () => unmeshed === 0);
    this.phases.markWhen('lighting ready', () => lighting?.ready ?? true);
    if (unmeshed === 0 && (lighting?.ready ?? true) && prepareDraw()) {
      this.state = 'ready';
      this.phases.mark('world ready');
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

  private settle(position: Vec3): void {
    const { streamer, meshes, config } = this.engine;
    // Not `streamer.pending`: it also counts the preload rings, which stay unmeshed by design.
    this.viewSettled =
      streamer.unmeshedColumns(position[0], position[2], config.radiusChunks) === 0 &&
      meshes.version === this.settleVersion;
    this.settleVersion = meshes.version;
    if (this.viewSettled) {
      this.phases.mark('view settled');
    }
  }
}
