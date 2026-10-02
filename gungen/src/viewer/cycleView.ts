// Presentation-only action-cycle controls. Timelines and motion profiles stay in the gun domain module.

import type { Group, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { applyDir } from '../core/math.ts';
import type { Resolved } from '../core/resolve.ts';
import { type CycleTimeline, cycleMotion, sweepMovingPart } from '../gun/cycle.ts';

const SPEEDS = [1, 0.25, 0.1, 0.03] as const;
const XRAY_OPACITY = 0.2;
const STEP_SECONDS = 0.01;
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface Mover {
  readonly meshes: readonly { readonly mesh: Mesh; readonly base: readonly number[] }[];
  readonly world: readonly [number, number, number];
}

export interface CycleView {
  bind: (solids: Group, resolved: Resolved) => void;
  frame: (elapsedSeconds: number) => void;
}

export const createCycleView = (): CycleView => {
  const panel = el<HTMLElement>('cycle-controls');
  const modeSelect = el<HTMLSelectElement>('cycle-mode');
  const playButton = el<HTMLButtonElement>('cycle-play');
  const scrub = el<HTMLInputElement>('cycle-scrub');
  const speedSelect = el<HTMLSelectElement>('cycle-speed');
  const emptyLabel = el<HTMLElement>('cycle-empty-label');
  const emptyBox = el<HTMLInputElement>('cycle-empty');
  const xrayBox = el<HTMLInputElement>('cycle-xray');
  const readout = el<HTMLElement>('cycle-readout');
  const notes = el<HTMLElement>('cycle-notes');
  for (const speed of SPEEDS) {
    speedSelect.add(new Option(speed === 1 ? 'Real time' : `${speed * 100}% speed`, String(speed)));
  }

  let timeline: CycleTimeline | undefined;
  let movers: Mover[] = [];
  let faded: Mesh[] = [];
  let boundSolids: Group | undefined;
  let boundResolved: Resolved | undefined;
  let strokeUnits = 0;
  let millimetresPerUnit = 11.5;
  let timeSeconds = 0;
  let playing = false;

  const setPlaying = (value: boolean) => {
    playing = value;
    playButton.textContent = value ? 'Pause' : 'Play';
  };

  const meshesOf = (group: Group, partId: string): Mesh[] => {
    const found: Mesh[] = [];
    group.traverse((object: Object3D) => {
      if (object.userData.part === partId && (object as Mesh).isMesh) {
        found.push(object as Mesh);
      }
    });
    return found;
  };

  const phaseTime = (): number => {
    if (!timeline) {
      return 0;
    }
    if (modeSelect.value === 'fire' && emptyBox.checked && timeline.holdOpenOnEmpty) {
      return Math.max(0, Math.min(timeSeconds, timeline.durationSeconds));
    }
    return ((timeSeconds % timeline.durationSeconds) + timeline.durationSeconds) % timeline.durationSeconds;
  };

  const apply = () => {
    if (!timeline) {
      return;
    }
    const phase = phaseTime();
    const fraction = timeline.at(phase, emptyBox.checked);
    for (const mover of movers) {
      for (const { mesh, base } of mover.meshes) {
        mesh.matrix.fromArray(base as number[]);
        mesh.matrix.elements[12] = base[12]! + mover.world[0] * fraction;
        mesh.matrix.elements[13] = base[13]! + mover.world[1] * fraction;
        mesh.matrix.elements[14] = base[14]! + mover.world[2] * fraction;
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
    scrub.max = String(Math.max(1, Math.round(timeline.durationSeconds * 1000)));
    scrub.value = String(Math.round(phase * 1000));
    const ejection =
      timeline.mode === 'fire'
        ? ` · case exits at ${(timeline.ejectAt * 100).toFixed(0)}% toward [${timeline.ejectDirection.map((value) => value.toFixed(2)).join(', ')}]`
        : ' · hand cycle has no case ejection';
    readout.textContent = `${phase.toFixed(3)} s · carrier ${(fraction * strokeUnits).toFixed(2)} u (${(fraction * strokeUnits * millimetresPerUnit).toFixed(0)} mm)${ejection}`;
  };

  const applyXray = () => {
    for (const mesh of faded) {
      const material = mesh.material as MeshStandardMaterial;
      material.transparent = xrayBox.checked;
      material.opacity = xrayBox.checked ? XRAY_OPACITY : 1;
      material.depthWrite = !xrayBox.checked;
      material.needsUpdate = true;
    }
  };

  const bind = (solids: Group, resolved: Resolved) => {
    boundSolids = solids;
    boundResolved = resolved;
    setPlaying(false);
    timeline = undefined;
    movers = [];
    faded = [];
    strokeUnits = 0;
    const carrier = resolved.assembly.parts['bolt-carrier'];
    const action = carrier?.params?.pattern;
    if (action !== 'ak' && action !== 'ar') {
      panel.hidden = true;
      return;
    }
    const def = resolved.defs.get('bolt-carrier');
    const placed = resolved.placed.get('bolt-carrier');
    if (!(carrier && def?.motion && placed)) {
      panel.hidden = true;
      return;
    }

    const cycle = cycleMotion(action, def.motion, resolved.domain.units.metresPerUnit);
    timeline = modeSelect.value === 'hand' ? cycle.hand : cycle.fire;
    millimetresPerUnit = resolved.domain.units.metresPerUnit * 1000;
    ({ strokeUnits } = cycle);
    const worldAxis = applyDir(placed, def.motion.axis);
    movers.push({
      meshes: meshesOf(solids, 'bolt-carrier').map((mesh) => ({ mesh, base: mesh.matrix.toArray() })),
      world: [worldAxis[0] * strokeUnits, worldAxis[1] * strokeUnits, worldAxis[2] * strokeUnits],
    });

    const sweep = sweepMovingPart(resolved, 'bolt-carrier', cycle.strokeUnits + 2.5);
    const [first] = sweep.clashes;
    const direction = cycle.ejectDirection.map((value) => value.toFixed(2)).join(', ');
    notes.textContent = `Estimated ${action.toUpperCase()} cycle; ${sweep.clear >= sweep.declared ? 'full declared stroke clears' : `stroke clearance ${sweep.clear.toFixed(2)} of ${sweep.declared.toFixed(2)} u`}${first ? ` · first overlap ${first.pair} at ${first.at.toFixed(2)} u` : ''} · eject direction [${direction}]`;
    emptyLabel.hidden = !cycle.holdOpenOnEmpty || modeSelect.value === 'hand';
    emptyBox.checked = false;
    panel.hidden = false;
    faded = meshesOf(solids, 'receiver');
    applyXray();
    timeSeconds = 0;
    apply();
  };

  playButton.addEventListener('click', () => {
    setPlaying(!playing);
    playButton.blur();
  });
  modeSelect.addEventListener('change', () => {
    if (boundSolids && boundResolved) {
      bind(boundSolids, boundResolved);
    }
  });
  scrub.addEventListener('input', () => {
    setPlaying(false);
    timeSeconds = Number(scrub.value) / 1000;
    apply();
  });
  emptyBox.addEventListener('change', apply);
  xrayBox.addEventListener('change', applyXray);
  globalThis.addEventListener('keydown', (event) => {
    if (
      panel.hidden ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (event.code === 'Space') {
      setPlaying(!playing);
    } else if (event.code === 'Comma' || event.code === 'Period') {
      setPlaying(false);
      timeSeconds += (event.code === 'Comma' ? -1 : 1) * STEP_SECONDS * (event.shiftKey ? 5 : 1);
    } else {
      return;
    }
    event.preventDefault();
    apply();
  });

  return {
    bind,
    frame: (elapsedSeconds) => {
      if (!(playing && timeline)) {
        return;
      }
      timeSeconds += elapsedSeconds * Number(speedSelect.value);
      if (
        modeSelect.value === 'fire' &&
        emptyBox.checked &&
        timeline.holdOpenOnEmpty &&
        timeSeconds >= timeline.durationSeconds
      ) {
        timeSeconds = timeline.durationSeconds;
        setPlaying(false);
      }
      apply();
    },
  };
};
