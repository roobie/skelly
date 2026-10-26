import type { Scene } from 'three';
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

const modeLine = (shown: WallMode, selected: boolean, comparison: WallComparison): string => {
  const {
    contact: { clearance, box },
    lowering,
  } = comparison.modes[shown];
  const state = lowering.resolved ? 'clears' : 'UNRESOLVED';
  const kind = box ? ` on ${box.unrefined ? `unrefined ${box.unrefined}` : box.kind}` : '';
  const degrees = ((lowering.radians * 180) / Math.PI).toFixed(1);
  return `${selected ? '▶' : ' '} ${shown.padEnd(7)} clearance ${metres(clearance)}${kind} · lower c ${lowering.coefficient.toFixed(3)} (${degrees}°) ${state}`;
};

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
    lines.push(...(['cells', 'refined'] as const).map((shown) => modeLine(shown, shown === mode, comparison)));
    // Clearance bottoms out at −radius once the axis is inside a box, so the lowering gap carries the comparison then.
    lines.push(
      `gap refined − cells: clearance ${metres(comparison.gap)} · lowering ${comparison.lowerGapDegrees.toFixed(1)}° less`,
    );
    lines.push(`unrefined here: ${comparison.unrefined.length > 0 ? comparison.unrefined.join('; ') : 'none'}`);
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
    },
    /** Both detectors from the same sample; the selected one's lowering goes back to the animator. */
    sample(sample: WallPoseSample | undefined, solid: SolidAt, keyLabel: string): number {
      if (!sample) {
        last = undefined;
        overlay.update(undefined, mode, tuning);
        readout.textContent = 'WALL SPIKE · hold a long gun (?loadout=hunting)';
        return 0;
      }
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
      );
      last = comparison;
      overlay.update(comparison, mode, tuning);
      readout.textContent = describe(sample, comparison, keyLabel);
      return comparison.modes[mode].lowering.radians;
    },
  };
};
