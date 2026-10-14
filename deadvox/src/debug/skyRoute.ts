import { getBuildRevision } from '../core/buildInfo.ts';
import type { Vec3 } from '../core/coords.ts';
import type { SkyRouteAttachment } from '../game/debugInterface.ts';
import type { Engine } from '../game/engine.ts';
import { forwardedActionHolds, keyboardInput } from '../game/inputBindings.ts';
import { createSkyRoutePanel } from '../ui/skyRoutePanel.ts';
import { collectSkyGeometry } from './skyRouteGeometry.ts';
import {
  SKY_ROUTE,
  type SkyRouteFrame,
  type SkyRouteJob,
  type SkyRoutePhase,
  skyRouteSummary,
} from './skyRouteMetrics.ts';
import { observeSkyRoute, skyRendererIdentity } from './skyRouteObserver.ts';

export function skyRouteUrl() {
  const url = new URL(location.href);
  url.search = '';
  const params = {
    site: 'playtest',
    seed: '1',
    radius: '48',
    debug: '1',
    at: `${SKY_ROUTE.start},${SKY_ROUTE.z},-90`,
    skyRoute: '1',
  };
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set('time', '13:00');
  return url.href;
}
function eligibleSkyFields(engine: Engine, metres: Vec3) {
  const blocks = metres.map((value) => value / engine.config.scale.blockSize);
  return engine
    .skylight!.inspect()
    .flatMap((field, index) =>
      blocks.every((value, axis) => value >= field.bounds.min[axis]! && value < field.bounds.max[axis]!)
        ? [{ index, complete: field.complete, current: field.current, resident: field.resident }]
        : [],
    );
}
export function attachSkyRoute({ engine, session, debug, active }: Parameters<SkyRouteAttachment>[0]) {
  if (!(engine.renderer && engine.skylight)) {
    return;
  }
  const panel = createSkyRoutePanel(skyRouteUrl());
  const holdRouteAction = forwardedActionHolds(keyboardInput);
  const routeMovementActions = ['movement.sprint', 'movement.forward', 'movement.back'];
  // The input owner's live context decides whether play (and so the route's forwarded movement) is allowed.
  const inputPermitsRoute = () => {
    const { context } = keyboardInput.context();
    return routeMovementActions.every(
      (action) => keyboardInput.registry.binding(action)?.contexts.includes(context) ?? false,
    );
  };
  const frames: SkyRouteFrame[] = [];
  const jobs: SkyRouteJob[] = [];
  let phase: SkyRoutePhase = 'cold';
  const observer = observeSkyRoute(engine, () => phase, jobs);
  const initialStats = { ...engine.skylight.stats };
  const hardware = skyRendererIdentity(engine.renderer);
  let previousRealMs: number | null = null;
  let startedRealMs: number | undefined;
  let ended = false;
  let rendered = engine.renderer.info.render.frame;
  let releaseMovement: (() => void) | undefined;
  let releaseSprint: (() => void) | undefined;
  const originalNoclip = debug.noclip;
  const { blockSize } = engine.config.scale;
  const position = () => session.body.pos.map((value) => value * blockSize) as Vec3;
  const restore = () => {
    releaseMovement?.();
    releaseSprint?.();
    if (debug.noclip !== originalNoclip) {
      debug.handleAction('debug.noclip-toggle');
    }
    observer.dispose();
  };
  const finish = (reason: string) => {
    ended = true;
    restore();
    let geometry: ReturnType<typeof collectSkyGeometry> | { error: string } | null = null;
    if (startedRealMs !== undefined) {
      try {
        geometry = collectSkyGeometry(engine, SKY_ROUTE, observer.sample);
      } catch (error) {
        geometry = { error: String(error) };
      }
    }
    // Worker replies may arrive later; preserve the censored evidence at the route boundary.
    const sampledJobs = jobs.map((job) => ({
      ...job,
      admissionRealMs: job.dispatchRealMs === null ? null : job.dispatchRealMs - job.requestedRealMs,
      afterDispatchExcludingWorkerRealMs:
        job.latencyRealMs === null || job.dispatchRealMs === null || job.workerRealMs === null
          ? null
          : job.latencyRealMs - (job.dispatchRealMs - job.requestedRealMs) - job.workerRealMs,
    }));
    const result = {
      status: reason,
      buildRevision: getBuildRevision(),
      previewOrigin: location.origin,
      route: SKY_ROUTE,
      scene: {
        site: engine.config.site,
        seed: engine.config.seed,
        radiusM: engine.config.radiusM,
        entityCount: [...engine.entities.all].length,
        fieldCount: engine.skylight!.inspect().length,
      },
      pagePath: location.pathname + location.search,
      hardware,
      attribution:
        'Lighting CPU service and owned GL submission, not GPU execution. Frame intervals include all scene and browser work. Forwarded input exercises the game owner, not native key delivery. Real-hardware evidence requires a completed route with useful jobs; no automatic gate verdict.',
      gpuLightingExecutionRealMs: null,
      initialStats,
      finalStats: { ...engine.skylight!.stats },
      ...skyRouteSummary(frames, sampledJobs),
      geometry,
      frames,
      jobs: sampledJobs,
    };
    panel.progress(`Sky route ${reason}. Escape releases the pointer to copy JSON.`);
    const { cold, warm } = result;
    const summary = `${[
      ['cold', cold],
      ['warm', warm],
    ]
      .map(([name, data]) => {
        const row = data as typeof cold;
        return `${name}: ${row.frameDenominator} frames / ${row.frameGapDenominator} intervals\nCPU service p99 ${row.serviceP99RealMs?.toFixed(3) ?? 'n/a'} ms; with GL submission ${row.lightingP99RealMs?.toFixed(3) ?? 'n/a'} ms\nlighting >2ms ${row.lightingOver2Count}; scene ${row.sceneFps?.toFixed(1) ?? 'n/a'} fps; >18ms ${row.framesOver18Count} (${row.framesOver18Percent?.toFixed(2) ?? 'n/a'}%)`;
      })
      .join(
        '\n\n',
      )}\nJobs ${result.completedJobDenominator}/${result.jobDenominator}; censored ${result.censoredJobDenominator}\nFallback resolved/censored: cold ${result.fallback.cold!.resolvedDenominator}/${result.fallback.cold!.censoredDenominator}, warm ${result.fallback.warm!.resolvedDenominator}/${result.fallback.warm!.censoredDenominator}\nRevalidation resolved/censored: cold ${result.revalidation.cold!.resolvedDenominator}/${result.revalidation.cold!.censoredDenominator}, warm ${result.revalidation.warm!.resolvedDenominator}/${result.revalidation.warm!.censoredDenominator}\nGPU lighting execution: not measured; BR owns verdict.`;
    panel.complete(summary, JSON.stringify(result, null, 2));
    // The evidence sink is the browser console, not game simulation output.
    // biome-ignore lint/suspicious/noConsole: debug route deliberately exports operator evidence.
    console.info('SKY_ROUTE_EVIDENCE', result);
  };
  const begin = () => {
    const [x, , z] = position();
    if (
      Math.abs(x - SKY_ROUTE.start) > blockSize ||
      Math.abs(z - SKY_ROUTE.z) > blockSize ||
      engine.config.site !== 'playtest' ||
      engine.config.seed !== 1
    ) {
      finish('wrong-start');
      return;
    }
    panel.started();
    if (!debug.noclip) {
      debug.handleAction('debug.noclip-toggle');
    }
    if (!debug.noclip) {
      throw new Error('Route could not enable the noclip owner');
    }
    releaseSprint = holdRouteAction('movement.sprint');
    releaseMovement = holdRouteAction('movement.forward');
    observer.reset();
    startedRealMs = performance.now();
    panel.progress('Sky route cold');
  };
  const advanceRoute = () => {
    const [x, , z] = position();
    if (Math.abs(z - SKY_ROUTE.z) > blockSize * 4) {
      finish('left-corridor');
      return;
    }
    if (performance.now() - startedRealMs! > Math.abs(SKY_ROUTE.end - SKY_ROUTE.start) * 4000) {
      finish('motion-budget-ended');
      return;
    }
    if (phase === 'cold' && x >= SKY_ROUTE.end) {
      releaseMovement?.();
      phase = 'warm';
      releaseMovement = holdRouteAction('movement.back');
      panel.progress('Sky route warm');
    } else if (phase === 'warm' && x <= SKY_ROUTE.start) {
      finish('complete');
    }
  };
  return {
    before: () => {
      if (ended) {
        return;
      }
      try {
        if (startedRealMs === undefined && active() && inputPermitsRoute()) {
          begin();
        }
      } catch (error) {
        finish(`input-error: ${String(error)}`);
      }
      if (ended || startedRealMs === undefined) {
        return;
      }
      if (!active()) {
        finish('interrupted');
        return;
      }
      return performance.now();
    },
    after: (startedFrameRealMs: number) => {
      if (ended) {
        return;
      }
      if (engine.renderer!.info.render.frame === rendered) {
        return;
      }
      rendered = engine.renderer!.info.render.frame;
      const frameRealMs = performance.now() - startedFrameRealMs;
      const metres = engine.camera.position.toArray() as Vec3;
      const eligible = eligibleSkyFields(engine, metres);
      const { cost } = observer;
      frames.push({
        phase,
        realMs: startedFrameRealMs,
        intervalRealMs: previousRealMs === null ? null : startedFrameRealMs - previousRealMs,
        frameRealMs,
        ...cost,
        lightingRealMs: cost.serviceRealMs + cost.textureRealMs + cost.uniformRealMs + cost.programRealMs,
        position: metres,
        estimate: observer.sample(metres),
        eligible,
        stats: { ...engine.skylight!.stats },
      });
      previousRealMs = startedFrameRealMs;
      observer.reset();
      try {
        advanceRoute();
      } catch (error) {
        finish(`input-error: ${String(error)}`);
      }
    },
  };
}
