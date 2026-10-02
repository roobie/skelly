// SPIKE: drives the cocking-cycle animation (`?cycle=1`). Moves the meshes of every part that declares
// `PartDef.motion` along that motion by re-writing their baked matrices each frame; no solid is rebuilt.

import type { Group, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { applyDir } from '../core/math.ts';
import type { Resolved } from '../core/resolve.ts';
import { buildTimeline, sweepMovingPart, type Timeline } from './cycle.ts';

/** Parts the x-ray toggle fades so the carrier is visible inside them. */
const XRAY_PARTS: ReadonlySet<string> = new Set(['receiver']);
const XRAY_OPACITY = 0.2;
const STEP_SECONDS = 0.01;
const STEP_KEYS: ReadonlyMap<string, number> = new Map([
  ['Comma', -1],
  ['Period', 1],
]);
const SPEEDS: readonly (readonly [number, string])[] = [
  [1, 'real time'],
  [0.25, '1/4'],
  [0.1, '1/10'],
  [0.03, '1/30'],
];

interface Mover {
  readonly meshes: readonly { readonly mesh: Mesh; readonly base: readonly number[] }[];
  /** World-space displacement of the part at full stroke, in model units. */
  readonly world: readonly [number, number, number];
}

export interface CycleView {
  /** Re-attach to a rebuilt scene (after every `redraw`). */
  bind: (solids: Group, resolved: Resolved) => void;
  /** Advance by wall-clock seconds. */
  frame: (seconds: number) => void;
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const createCycleView = (initialAt: number | undefined): CycleView => {
  const bar = el<HTMLElement>('cycle-bar');
  const playButton = el<HTMLButtonElement>('cycle-play');
  const scrub = el<HTMLInputElement>('cycle-scrub');
  const speedSelect = el<HTMLSelectElement>('cycle-speed');
  const xrayBox = el<HTMLInputElement>('cycle-xray');
  const readout = el<HTMLElement>('cycle-readout');
  bar.hidden = false;
  for (const [factor, label] of SPEEDS) {
    speedSelect.add(new Option(label, String(factor)));
  }

  let timeline: Timeline | undefined;
  let movers: Mover[] = [];
  let faded: Mesh[] = [];
  let strokeUnits = 0;
  let mmPerUnit = 11.5;
  let time = initialAt ?? 0;
  let playing = initialAt === undefined;

  const apply = () => {
    if (!timeline) {
      return;
    }
    const fraction = timeline.at(time);
    for (const mover of movers) {
      for (const { mesh, base } of mover.meshes) {
        mesh.matrix.fromArray(base as number[]);
        mesh.matrix.elements[12] = base[12]! + mover.world[0] * fraction;
        mesh.matrix.elements[13] = base[13]! + mover.world[1] * fraction;
        mesh.matrix.elements[14] = base[14]! + mover.world[2] * fraction;
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
    const phase = ((time % timeline.total) + timeline.total) % timeline.total;
    scrub.value = String(Math.round(phase * 1000));
    readout.textContent = `${phase.toFixed(3)} s · carrier ${(fraction * strokeUnits).toFixed(2)} u (${(fraction * strokeUnits * mmPerUnit).toFixed(0)} mm)`;
  };

  const setPlaying = (value: boolean) => {
    playing = value;
    playButton.textContent = value ? 'Pause' : 'Play';
  };
  playButton.addEventListener('click', () => {
    setPlaying(!playing);
    playButton.blur();
  });
  scrub.addEventListener('input', () => {
    setPlaying(false);
    time = Number(scrub.value) / 1000;
    apply();
  });
  const applyXray = () => {
    for (const mesh of faded) {
      const material = mesh.material as MeshStandardMaterial;
      material.transparent = xrayBox.checked;
      material.opacity = xrayBox.checked ? XRAY_OPACITY : 1;
      material.depthWrite = !xrayBox.checked;
      material.needsUpdate = true;
    }
  };
  xrayBox.addEventListener('change', applyXray);
  globalThis.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    const direction = STEP_KEYS.get(event.code);
    if (event.code === 'Space') {
      setPlaying(!playing);
    } else if (direction === undefined) {
      return;
    } else {
      setPlaying(false);
      time += direction * STEP_SECONDS * (event.shiftKey ? 5 : 1);
    }
    event.preventDefault();
    apply();
  });
  setPlaying(playing);

  return {
    bind: (solids, resolved) => {
      movers = [];
      faded = [];
      strokeUnits = 0;
      timeline = undefined;
      const moving = [...resolved.defs].filter(([id, def]) => def.motion && resolved.placed.has(id));
      const meshesOf = (part: string) => {
        const found: Mesh[] = [];
        solids.traverse((object: Object3D) => {
          if (object.userData.part === part && (object as Mesh).isMesh) {
            found.push(object as Mesh);
          }
        });
        return found;
      };
      for (const part of XRAY_PARTS) {
        faded.push(...meshesOf(part));
      }
      applyXray();
      if (moving.length === 0) {
        readout.textContent = 'No part of this assembly declares a motion.';
        return;
      }
      const notes: string[] = [];
      mmPerUnit = resolved.domain.units.metresPerUnit * 1000;
      for (const [id, def] of moving) {
        const motion = def.motion!;
        const sweep = sweepMovingPart(resolved, id, Math.hypot(...motion.rearmost) + 2.5);
        // The stroke is the part's declared stroke, cut short where it would run into another part.
        const stroke = Math.min(sweep.declared, sweep.clear);
        const dir = applyDir(resolved.placed.get(id)!, motion.axis);
        movers.push({
          meshes: meshesOf(id).map((mesh) => ({ mesh, base: mesh.matrix.toArray() })),
          world: [dir[0] * stroke, dir[1] * stroke, dir[2] * stroke],
        });
        strokeUnits = Math.max(strokeUnits, stroke);
        const [first] = sweep.clashes;
        notes.push(
          `${id}: stroke ${stroke.toFixed(2)} u = ${(stroke * mmPerUnit).toFixed(1)} mm` +
            (first ? `; first overlap at ${first.s.toFixed(2)} u (${first.pair})` : '; no overlap'),
        );
      }
      timeline = buildTimeline(strokeUnits * resolved.domain.units.metresPerUnit);
      scrub.max = String(Math.round(timeline.total * 1000));
      bar.title = notes.join('\n');
      el<HTMLElement>('cycle-notes').textContent = notes.join(' | ');
      apply();
    },
    frame: (seconds) => {
      if (playing && timeline) {
        time += seconds * Number(speedSelect.value);
        apply();
      }
    },
  };
};
