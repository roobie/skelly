import type { Scene } from 'three';
import { percentile } from '../bench/stats.ts';
import type { SolidAt } from '../core/raycast.ts';
import type { Engine } from '../game/engine.ts';
import {
  authoredProxyRadius,
  compareWalls,
  type WallComparison,
  type WallMode,
  type WallPoseSample,
  wallModeFromUrl,
  wallTuning,
} from './wallLeeway.ts';
import { WallLeewayOverlay } from './wallLeewayOverlay.ts';

const metres = (value: number): string =>
  Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} cm` : 'none in range';
const point = (value: readonly number[]): string => value.map((axis) => axis.toFixed(3)).join(', ');

const SHOWN = ['cells', 'refined'] as const;
/** The debug readout's own cadence; the overlay still rebuilds every frame. */
const READOUT_EVERY_MS = 250;

const modeLine = (shown: WallMode, selected: boolean, comparison: WallComparison): string => {
  const result = comparison.modes[shown];
  if (!result) {
    return `  ${shown.padEnd(7)} not run (wall.compare=0)`;
  }
  const {
    contact: { clearance, box },
    lowering,
  } = result;
  const state = lowering.resolved ? 'clears' : 'UNRESOLVED';
  const kind = box ? ` on ${box.unrefined ? `unrefined ${box.unrefined}` : box.kind}` : '';
  const degrees = ((lowering.radians * 180) / Math.PI).toFixed(1);
  return `${selected ? '▶' : ' '} ${shown.padEnd(7)} clearance ${metres(clearance)}${kind} · lower c ${lowering.coefficient.toFixed(3)} (${degrees}°) ${state}`;
};

/** Frames the cost readout summarises. */
const COST_FRAMES = 600;
const COST_SUMMARY_EVERY = 15;
const COST_PARTS = ['cells', 'refined', 'both', 'spike'] as const;
type CostPart = (typeof COST_PARTS)[number];

/** Rolling per-frame CPU cost of the spike: each detector, both as `compareWalls` runs them, and the whole frame hook. */
const costRecorder = () => {
  const samples: Record<CostPart, number[]> = { cells: [], refined: [], both: [], spike: [] };
  return {
    record(part: CostPart, ms: number): void {
      const list = samples[part];
      list.push(ms);
      if (list.length > COST_FRAMES) {
        list.shift();
      }
    },
    summary() {
      return Object.fromEntries(
        COST_PARTS.map((part) => [
          part,
          { p50: percentile(samples[part], 0.5), p95: percentile(samples[part], 0.95), frames: samples[part].length },
        ]),
      ) as Record<CostPart, { p50: number; p95: number; frames: number }>;
    },
  };
};

const costLines = (summary: ReturnType<ReturnType<typeof costRecorder>['summary']>, comparison: WallComparison) => [
  `cost ms p50/p95 over ${summary.spike.frames} frames: ${COST_PARTS.map(
    (part) => `${part} ${summary[part].p50.toFixed(3)}/${summary[part].p95.toFixed(3)}`,
  ).join(' · ')}`,
  `  ${SHOWN.flatMap((shown) => {
    const result = comparison.modes[shown];
    if (!result) {
      return [];
    }
    const { boxes, cost } = result;
    return [
      `${shown} ${boxes.length} boxes × ${cost.steps + 1} sweeps (gather ${cost.gatherRealMs.toFixed(3)} · solve ${cost.solveRealMs.toFixed(3)})`,
    ];
  }).join(' · ')}`,
];

/** One `wall=` session: the selected detector, both results, the overlay and its readout. */
export const createWallSpike = (engine: Pick<Engine, 'world' | 'registry' | 'entities' | 'scene'>, search: string) => {
  const initial = wallModeFromUrl(search);
  if (!initial) {
    return;
  }
  let mode: WallMode = initial;
  const tuning = wallTuning(search);
  const overlay = new WallLeewayOverlay(engine.scene as Scene);
  const readout = document.createElement('pre');
  readout.className = 'debug-wall-readout';
  readout.style.cssText =
    'position:fixed;right:0.375rem;top:2.5rem;margin:0;padding:0.375rem 0.5rem;background:rgba(0,0,0,0.72);color:#fff;font:12px/1.35 monospace;pointer-events:none;z-index:40;white-space:pre';
  document.body.append(readout);
  let last: WallComparison | undefined;
  const costs = costRecorder();
  let frame = 0;
  let shownCost = '';
  let readoutAt = Number.NEGATIVE_INFINITY;

  const describe = (sample: WallPoseSample, comparison: WallComparison, keyLabel: string): string => {
    const lines = [
      `WALL SPIKE · detector ${mode.toUpperCase()} · toggle: ${keyLabel}`,
      `proxy ${sample.pose.model.id}: radius ${(comparison.radius * 100).toFixed(1)} cm (anchors ${(
        authoredProxyRadius(sample.pose.model) * 100
      ).toFixed(1)} cm × ${tuning.radiusScale} + ${(tuning.radiusExtraMetres * 100).toFixed(1)} cm)`,
      `  reach ${(tuning.reachMetres * 100).toFixed(1)} cm · margin ${(tuning.marginMetres * 100).toFixed(1)} cm · lower ≤ ${tuning.maxLowerDegrees}° × c^${tuning.curveExponent} · ${tuning.steps} steps`,
      `  butt ${point(comparison.intended.butt)} · muzzle ${point(comparison.intended.muzzle)} m`,
      `  eye ${point(sample.eye.map((axis) => axis * sample.blockSize))} m · yaw ${sample.yaw.toFixed(3)} · pitch ${sample.pitch.toFixed(3)}`,
    ];
    lines.push(...SHOWN.map((shown) => modeLine(shown, shown === mode, comparison)));
    if (comparison.modes.cells && comparison.modes.refined) {
      // Clearance bottoms out at −radius once the axis is inside a box, so the lowering gap carries the comparison then.
      lines.push(
        `gap refined − cells: clearance ${metres(comparison.gap)} · lowering ${comparison.lowerGapDegrees.toFixed(1)}° less`,
      );
    }
    if (comparison.modes.refined) {
      lines.push(`unrefined here: ${comparison.unrefined.length > 0 ? comparison.unrefined.join('; ') : 'none'}`);
    }
    lines.push('known limit: open door leaves are ignored in both modes');
    return lines.join('\n');
  };

  return {
    get mode(): WallMode {
      return mode;
    },
    get last(): WallComparison | undefined {
      return last;
    },
    toggle(): void {
      mode = mode === 'cells' ? 'refined' : 'cells';
      readoutAt = Number.NEGATIVE_INFINITY;
    },
    /** Both detectors from the same sample, or only the selected one without the comparison; its lowering goes back to the animator. */
    sample(sample: WallPoseSample | undefined, solid: SolidAt, keyLabel: string): number {
      if (!sample) {
        last = undefined;
        overlay.update(undefined, mode, tuning);
        readout.textContent = 'WALL SPIKE · hold a long gun (?loadout=hunting)';
        readoutAt = Number.NEGATIVE_INFINITY;
        return 0;
      }
      const start = performance.now();
      const comparison = compareWalls(
        {
          world: engine.world,
          registry: engine.registry,
          entities: engine.entities,
          solid,
          blockSize: sample.blockSize,
        },
        sample,
        tuning,
        tuning.compare ? SHOWN : [mode],
      );
      const compared = performance.now();
      last = comparison;
      overlay.update(comparison, mode, tuning);
      if (compared - readoutAt >= READOUT_EVERY_MS) {
        readoutAt = compared;
        readout.textContent = `${describe(sample, comparison, keyLabel)}\n${shownCost}`;
      }
      costs.record('spike', performance.now() - start);
      costs.record('both', compared - start);
      for (const shown of SHOWN) {
        const cost = comparison.modes[shown]?.cost;
        if (cost) {
          costs.record(shown, cost.gatherRealMs + cost.solveRealMs);
        }
      }
      // Summarising sorts every window, so it runs outside the timed span and only every few frames.
      frame += 1;
      if (frame % COST_SUMMARY_EVERY === 0) {
        const summary = costs.summary();
        shownCost = costLines(summary, comparison).join('\n');
        readout.dataset.wallCost = JSON.stringify({
          ...summary,
          detail: Object.fromEntries(
            SHOWN.flatMap((shown) => {
              const result = comparison.modes[shown];
              return result
                ? [
                    [
                      shown,
                      {
                        boxes: result.boxes.length,
                        ...result.cost,
                        resolved: result.lowering.resolved,
                        coefficient: result.lowering.coefficient,
                      },
                    ],
                  ]
                : [];
            }),
          ),
        });
      }
      return comparison.modes[mode]!.lowering.radians;
    },
  };
};
