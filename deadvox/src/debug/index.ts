import { html, nothing, render, type TemplateResult } from 'lit-html';
import { dominantSide, offSide } from '../core/character.ts';
import { formatClock } from '../core/clock.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';
import type { ShadowState } from '../core/mood.ts';
import type { MeleeResult, ZombieAim } from '../core/zombies.ts';
import type { DebugHooks, DebugModule, DebugNoclipStep, DebugReadout, DebugRuntime } from '../game/debugInterface.ts';
import { inputBindings, labelForAction } from '../game/inputBindings.ts';
import type { SnapshotMeasurement } from '../game/playtestTools.ts';
import { HOT_CATEGORIES, HOT_KINDS } from '../render/hotCheck.ts';
import { DebugAimOverlay } from './aimOverlay.ts';
import { formatFacing, formatPosition, projectPositiveAxes } from './axisGizmo.ts';
import { BuildMode } from './build.ts';
import { type CamPose, camUrl, camWriteDue, parseCamParam } from './camUrl.ts';
import { setDebugFirearmsSkill } from './debugFirearmsSkill.ts';
import { equipDebugFirearms, equipDebugStartWeapons } from './debugLoadout.ts';
import {
  actionsByGroup,
  type GroupedAction,
  type GroupId,
  keysAtAGlance,
  readClosedGroups,
  writeClosedGroups,
} from './groups.ts';
import { LookControls } from './look.ts';
import { buildRevision, lookDump, lookDumpFilename } from './lookDump.ts';
import { describeLookedAt } from './lookedAt.ts';
import { type LookUrlState, lookUrl, parseLookParams } from './lookUrl.ts';
import { attachMouseDiag, formatMouseDiag } from './mouseDiag.ts';
import { stepNoclip } from './noclip.ts';
import { readShamblerCount, writeShamblerCount } from './shamblerCount.ts';
import { spawnShamblers, spawnZombieType } from './shamblerSpawning.ts';
import { rangeToNearestShotTargetMetres, type ShotTargetBox } from './shotTargetRange.ts';
import { SpawnMenu } from './spawnMenu.ts';

const COMPASS_DEBUG_LOADOUT = 'compass';

const snapshotMeasurementStatus = (result: SnapshotMeasurement): string => {
  const observedTick = result.observedTimerTickMs === null ? 'unknown' : `${result.observedTimerTickMs.toFixed(3)} ms`;
  let quantization: string;
  if (result.timerQuantum === null) {
    quantization = `true-time bounds unavailable (no known Firefox/Chromium quantum; observed minimum tick ${observedTick} is not an error bound)`;
  } else if (
    !result.timerQuantumCrossCheckPassed ||
    result.individualCaptureP95UpperBoundMs === null ||
    result.individualCaptureMaxUpperBoundMs === null
  ) {
    quantization = `true-time bounds unavailable (known ${result.timerQuantum.browser} browser-profile quantum r=${result.timerQuantum.quantumMs.toFixed(3)} ms failed the observed-tick cross-check at ${observedTick})`;
  } else {
    quantization = `known ${result.timerQuantum.browser} browser-profile quantum r=${result.timerQuantum.quantumMs.toFixed(3)} ms (observed minimum tick ${observedTick}; duration error <2r): true p95 <${result.individualCaptureP95UpperBoundMs.toFixed(3)} ms and max <${result.individualCaptureMaxUpperBoundMs.toFixed(3)} ms`;
  }

  return (
    `Snapshot: ${result.batchCount} batches × ${result.batchSize} captures/batch (${result.batchCount * result.batchSize} timed captures); ` +
    `batch-mean throughput p50 ${result.batchMeanP50Ms.toFixed(3)} ms/capture, p95 ${result.batchMeanP95Ms.toFixed(3)} ms/capture; ` +
    `individual tail n=${result.individualCaptureCount}: observed p95 ${result.individualCaptureP95Ms.toFixed(3)} ms, max ${result.individualCaptureMaxMs.toFixed(3)} ms; ` +
    `${quantization}; calibration ${result.calibrationBatchMs.toFixed(3)} ms; net state ${result.netStateUnchanged ? 'unchanged' : 'CHANGED'} across measurement`
  );
};

export interface Action extends GroupedAction {
  readonly id: string;
  readonly state?: () => boolean;
  /** Current value, appended to the label in the panel. */
  readonly detail?: () => string;
  readonly run: () => void;
}

interface ActionView {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly state: string;
  readonly run: () => void;
}

interface GroupView {
  readonly id: GroupId;
  readonly title: string;
  /** The group's keys, or its hint, for the header. */
  readonly keys: string;
  readonly open: boolean;
  readonly actions: readonly ActionView[];
  readonly toggle: () => void;
}

const ms = (value: number | null): string => {
  if (value === null) {
    return 'n/a';
  }
  if (!Number.isFinite(value)) {
    return '–';
  }
  return value.toFixed(1);
};

/** One line of the readout: the shadow settings, and what the sun's fade and the casters look like right now. */
export const shadowReadoutText = (
  state: ShadowState,
  sunStrength: number,
  casters: { sun: number; torch: number },
): string =>
  `shadows: sun ${state.sun ? `ON ×${sunStrength.toFixed(2)}` : 'OFF'} · flashlight ${state.torch ? 'ON' : 'OFF'} · ${state.distance} m · chunk casters ${casters.sun} / ${casters.torch}`;

const readoutTemplate = (readout: DebugReadout, shadowText = ''): TemplateResult => html`
  <span>${readout.fps.toFixed(0)} fps · frame ${ms(readout.frame.p50)} / ${ms(readout.frame.p95)} ms (p50 / p95, 2 s) · cpu ${ms(readout.work.p50)} / ${ms(readout.work.p95)} ms</span>
  <span>simulation ${ms(readout.simulationMs)} ms · render ${ms(readout.renderMs)} ms incl. post passes · mesh queue ${ms(readout.meshingQueueMs)} ms</span>
  <span>${shadowText}</span>
  <span>seed ${readout.seed}</span>
  <span>radius ${readout.radius} m · ${readout.movement}</span>
  <span>position ${formatPosition(readout.position)}</span>
  <span>chunks ${readout.chunks} · ${readout.pending} pending · ${readout.holes} holes · entities ${readout.entities}</span>
  <span>memory ≈ ${(readout.memoryBytes / (1024 * 1024)).toFixed(1)} MiB · ${readout.clock} · compression ×${readout.compression.toFixed(1)}</span>
  <span>snapshot ${readout.snapshotLastMs.toFixed(3)} ms last · ${readout.snapshotP95Ms.toFixed(3)} ms p95 / ${readout.snapshotCount}</span>
  <span>shamblers ${readout.zombies}</span>
  ${readout.revealedZombies.length > 0 ? html`<span class="debug-revealed-zombies">REVEALED: ${readout.revealedZombies.join(' · ')}</span>` : nothing}
`;

const f3OverlayTemplate = (readout: DebugReadout, visible: boolean, yaw: number, pitch: number): TemplateResult => html`
  <aside id="f3-debug-overlay" ?hidden=${!visible} aria-label="Performance debug overlay">
    ${readoutTemplate(readout)}
    <span>facing ${formatFacing(yaw, pitch)}</span>
  </aside>
`;

const axisGizmoTemplate = (visible: boolean, targetRange: string): TemplateResult => html`
  <canvas id="debug-axis-gizmo" width="144" height="144" ?hidden=${!visible} role="img" aria-label="World axes: positive X red, Y green, Z blue"></canvas>
  <span id="debug-target-range" ?hidden=${targetRange === ''} aria-label="Range to shot target">${targetRange}</span>
`;

function paintAxisGizmo(canvas: HTMLCanvasElement, quaternion: readonly [number, number, number, number]): void {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  context.setTransform(2, 0, 0, 2, 0, 0);
  context.clearRect(0, 0, 72, 72);
  context.beginPath();
  context.arc(36, 36, 31, 0, Math.PI * 2);
  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  context.fill();
  context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  context.lineWidth = 1;
  context.stroke();
  for (const axis of projectPositiveAxes(quaternion)) {
    const x = 36 + axis.x * 25;
    const y = 36 + axis.y * 25;
    context.beginPath();
    context.moveTo(36, 36);
    context.lineTo(x, y);
    context.strokeStyle = axis.color;
    context.lineWidth = 3;
    context.stroke();
    context.beginPath();
    context.arc(x, y, 3, 0, Math.PI * 2);
    context.fillStyle = axis.color;
    context.fill();
    context.font = 'bold 11px ui-monospace, monospace';
    context.textAlign = axis.x >= 0 ? 'left' : 'right';
    context.textBaseline = 'middle';
    context.fillText(`+${axis.label}`, x + (axis.x >= 0 ? 4 : -4), y + (axis.y >= 0 ? 7 : -6));
  }
  context.beginPath();
  context.arc(36, 36, 3, 0, Math.PI * 2);
  context.fillStyle = '#eee';
  context.fill();
}

const aimReadoutTemplate = (text: string): TemplateResult => html`${text || nothing}`;

const soundLogTemplate = (readout: DebugReadout): TemplateResult => html`
  <section class="debug-sound-log" aria-label="Recent sounds actually played">
    <strong>Recent sounds · newest first</strong>
    <ol>
      ${
        readout.sounds.length > 0
          ? [...readout.sounds].reverse().map(
              (sound) => html`
              <li data-sound-event=${sound.event}>
                <code>${sound.event}</code> · <code>${sound.file}</code>
                ${sound.sourceLabel ? html` · ${sound.sourceLabel}` : ''}<br />
                ${sound.distanceMetres.toFixed(1)} m · ${sound.occluded ? 'muffled' : 'clear'} ·
                LP ${sound.lowpassHz === null ? '—' : `${Math.round(sound.lowpassHz)} Hz`} ·
                gain ${sound.gain.toFixed(3)} ·
                ${sound.emittedAsNoise ? `noise ${sound.noiseRadiusMetres} m` : 'not noise'}
              </li>
            `,
            )
          : html`<li class="debug-sound-empty">No sounds played yet.</li>`
      }
    </ol>
  </section>
`;

const actionButton = (action: ActionView): TemplateResult => html`
  <button type="button" data-debug-action=${action.id} @click=${action.run}>
    ${action.label} (${action.key})${action.state ? ` · ${action.state}` : ''}
  </button>
`;

/** A collapsible group: the header shows the keys, so a closed group still says what it holds. */
const groupTemplate = (group: GroupView, extra: TemplateResult | typeof nothing): TemplateResult => html`
  <section class="debug-group" data-group=${group.id}>
    <button type="button" class="debug-group-header" aria-expanded=${group.open ? 'true' : 'false'} @click=${group.toggle}>
      <strong>${group.title}</strong><span class="debug-group-keys">${group.keys}</span>
    </button>
    ${
      group.open
        ? html`
      <div class="debug-group-body">
        ${group.actions.length > 0 ? html`<div class="debug-actions">${group.actions.map(actionButton)}</div>` : nothing}
        ${extra}
      </div>`
        : nothing
    }
  </section>
`;

const panelTemplate = ({
  open,
  groups,
  gameFrozen,
  spawnOpen,
  shamblerCount,
  spawnStatus,
  lastHitText,
  setShamblerCount,
  setTimeOfDay,
  snapshotStatus,
  revealZombies,
  toggleReveal,
  measureSnapshot,
  copySnapshotResult,
  exportMetrics,
  toggleOpen,
  dumpLook,
  download,
  axesVisible,
  toggleAxes,
  copyViewLink,
  copyStatus,
}: {
  open: boolean;
  groups: readonly GroupView[];
  gameFrozen: boolean;
  spawnOpen: boolean;
  shamblerCount: number;
  spawnStatus: string;
  lastHitText: string;
  setShamblerCount: (count: number) => void;
  setTimeOfDay: (hour: number, minute: number) => void;
  snapshotStatus: string;
  revealZombies: boolean;
  toggleReveal: () => void;
  measureSnapshot: () => void;
  copySnapshotResult: () => void;
  exportMetrics: () => void;
  toggleOpen: () => void;
  dumpLook: () => void;
  /** A file to save: the link below is clicked once while this is set. */
  download: { url: string; name: string } | undefined;
  axesVisible: boolean;
  toggleAxes: () => void;
  copyViewLink: () => void;
  copyStatus: string;
}): TemplateResult => {
  // What a group shows besides its action buttons; only these three have anything.
  const extras: Partial<Record<GroupId, TemplateResult>> = {
    shamblers: html`
      <div class="debug-shambler-count" role="group" aria-label="Shambler spawn count">
        <span>Shambler count</span>
        <button type="button" aria-label="Decrease shambler count" ?disabled=${shamblerCount <= 1} @click=${() => setShamblerCount(shamblerCount - 1)}>−</button>
        <output aria-label="Current shambler spawn count" aria-live="polite">${shamblerCount}</output>
        <button type="button" aria-label="Increase shambler count" ?disabled=${shamblerCount >= 100} @click=${() => setShamblerCount(shamblerCount + 1)}>+</button>
      </div>
      <p id="shambler-spawn-status" aria-live="polite" ?hidden=${spawnStatus === ''}>${spawnStatus}</p>
      <div class="debug-actions"><button id="reveal-zombies" type="button" aria-pressed=${revealZombies} @click=${toggleReveal}>Reveal zombies · ${revealZombies ? 'ON' : 'OFF'}</button></div>
    `,
    time: html`
      <label>Set time <input id="debug-time" type="time" value="19:30" /> <button id="set-debug-time" type="button" @click=${(
        event: Event,
      ) => {
        const root = (event.currentTarget as HTMLElement).parentElement;
        const value = root?.querySelector<HTMLInputElement>('#debug-time')?.value ?? '';
        const [hour, minute] = value.split(':').map(Number);
        if (
          hour !== undefined &&
          minute !== undefined &&
          Number.isInteger(hour) &&
          Number.isInteger(minute) &&
          hour >= 0 &&
          hour < 24 &&
          minute >= 0 &&
          minute < 60
        ) {
          setTimeOfDay(hour, minute);
        }
      }}>Apply</button></label>
    `,
    diagnostics: html`
      <div class="debug-actions"><button id="measure-snapshot" type="button" @click=${measureSnapshot}>Measure snapshot (50×)</button></div>
      <p class="debug-hot-legend">Hot-pixel check (PgDn) colour = material:
        ${Object.values(HOT_CATEGORIES).map((c) => html`<span style="color:${c.css}">${c.label}</span> `)}
        · brightness = kind: ${HOT_KINDS.join('; ')}.</p>
    `,
    share: html`<div class="debug-actions"><button type="button" @click=${dumpLook}>Dump look settings (JSON)</button><button id="export-metrics" type="button" @click=${exportMetrics}>Export metrics</button></div>`,
  };
  return html`
  <div id="debug-ui-root">
    <div class="debug-marker" ?hidden=${open} @click=${toggleOpen}>DEBUG · ${labelForAction('debug.panel-toggle')}</div>
    <div class="debug-marker debug-frozen" ?hidden=${!gameFrozen}>FROZEN · ${labelForAction('debug.freeze-game')}</div>
    <div id="debug-aim-readout" class="debug-aim-readout" aria-live="polite"></div>
    <div id="debug-look-readout" class="debug-aim-readout"></div>
    <div id="debug-mouse-readout" class="debug-aim-readout" style="left:6px;top:auto;bottom:6px;transform:none"></div>
    <section class="debug-panel" data-debug-controls ?hidden=${!open}>
    <header class="debug-panel-header"><strong>Debug / authoring</strong><button type="button" @click=${toggleOpen}>Close (${labelForAction('debug.panel-toggle')})</button></header>
    <p>F4 toggles the performance overlay.</p>
    <div class="debug-snapshot-result-row">
      <p id="snapshot-measurement-result" class="debug-snapshot-result" aria-live="polite" tabindex="0">${snapshotStatus || 'No snapshot measurement yet.'}</p>
      <button id="copy-snapshot-result" type="button" ?disabled=${snapshotStatus === ''} @click=${copySnapshotResult}>Copy</button>
    </div>
    <label class="debug-axis-toggle"><input type="checkbox" .checked=${axesVisible} @change=${toggleAxes} /> Show axis gizmo</label>
    <div class="debug-readout"><button id="copy-view-link" type="button" @click=${copyViewLink}>Copy view link</button><span aria-live="polite">${copyStatus}</span></div>
    <div id="debug-readout" class="debug-readout"></div>
    <p class="debug-last-hit" aria-live="polite" ?hidden=${lastHitText === ''}>${lastHitText}</p>
    ${groups.map((group) => groupTemplate(group, extras[group.id] ?? nothing))}
    <a id="debug-download" hidden href=${download?.url ?? ''} download=${download?.name ?? ''}></a>
    <div id="debug-sound-log-root"></div>
    <p>Keys are listed in each group's header. Noclip: ${labelForAction('noclip.ascend')} rises, ${labelForAction('noclip.descend')} descends. While building (${labelForAction('debug.build-toggle')}): ${Array.from({ length: 9 }, (_, i) => labelForAction(`debug.build-slot.${i + 1}`)).join(' / ')} select blocks; the wheel cycles them. Panel: ${labelForAction('debug.panel-toggle')}. The wheel scrolls this panel.</p>
    </section>
    <div id="debug-axis-gizmo-root"></div>
    <div id="hotbar" hidden></div>
    <div id="spawn" ?hidden=${!spawnOpen}></div>
    <div id="f3-overlay-root"></div>
  </div>
`;
};

const emptyReadout: DebugReadout = {
  fps: 0,
  frame: { p50: Number.NaN, p95: Number.NaN },
  work: { p50: Number.NaN, p95: Number.NaN },
  simulationMs: 0,
  renderMs: 0,
  meshingQueueMs: 0,
  entities: 0,
  memoryBytes: 0,
  clock: '19:30',
  compression: 1,
  snapshotLastMs: 0,
  snapshotP95Ms: 0,
  snapshotCount: 0,
  revealedZombies: [],
  seed: 0,
  radius: 0,
  movement: 'jogging',
  position: [0, 0, 0],
  chunks: 0,
  pending: 0,
  holes: 0,
  zombies: 0,
  sounds: [],
};

interface ActionContext {
  hooks: DebugHooks;
  build: Pick<BuildMode, 'on' | 'toggle'>;
  spawnMenu: Pick<SpawnMenu, 'isOpen'>;
  toggleSpawn: () => void;
  isNoclip: () => boolean;
  toggleNoclip: () => void;
  isDanger: () => boolean;
  toggleDanger: () => void;
  shamblerCount: () => number;
  spawnShambler: (count: number) => void;
  spawnZombie: (typeId: string, count: number) => void;
  isAimEnabled: () => boolean;
  toggleAim: () => void;
  isFrozen: () => boolean;
  toggleFrozen: () => void;
  isGameFrozen: () => boolean;
  toggleGameFrozen: () => void;
  impactLaser: DebugHooks['impactLaser'];
  look: LookControls;
}

export const createDebugActions = ({
  hooks,
  build,
  spawnMenu,
  toggleSpawn,
  isNoclip,
  toggleNoclip,
  isDanger,
  toggleDanger,
  shamblerCount,
  spawnShambler,
  spawnZombie,
  isAimEnabled,
  toggleAim,
  isFrozen,
  toggleFrozen,
  isGameFrozen,
  toggleGameFrozen,
  impactLaser,
  look,
}: ActionContext): Action[] =>
  (
    [
      {
        id: 'debug.build-toggle',
        label: 'Build tools',
        group: 'tools',
        state: () => build.on,
        run: () => build.toggle(),
      },
      {
        id: 'debug.impact-laser',
        label: 'Impact laser',
        group: 'tools',
        state: impactLaser.enabled,
        run: impactLaser.toggle,
      },
      {
        id: 'debug.spawn-menu-toggle',
        label: 'Spawn item menu',
        group: 'tools',
        state: () => spawnMenu.isOpen,
        run: toggleSpawn,
      },
      {
        id: 'debug.god-toggle',
        label: 'God mode',
        group: 'survival',
        state: () => hooks.sim.godMode,
        run: () => {
          hooks.sim.godMode = !hooks.sim.godMode;
        },
      },
      { id: 'debug.noclip-toggle', label: 'Noclip', group: 'tools', state: isNoclip, run: toggleNoclip },
      {
        id: 'debug.compression-test',
        label: 'Compress / rest',
        group: 'survival',
        state: () => hooks.sim.compression.active,
        run: () => {
          if (hooks.sim.compression.active) {
            hooks.sim.compression.stop();
          } else {
            hooks.compress();
          }
        },
      },
      {
        id: 'debug.interruption-test',
        label: 'Emit noise',
        group: 'survival',
        run: () => hooks.sim.emit({ kind: 'interrupt', reason: 'You hear something outside' }),
      },
      { id: 'debug.danger-test', label: 'Danger test', group: 'survival', state: isDanger, run: toggleDanger },
      {
        id: 'debug.hurt',
        label: 'Take 25 damage',
        group: 'survival',
        run: () => hooks.sim.hurt(25, 'a debug key'),
      },
      {
        id: 'debug.spawn-shamblers',
        label: 'Spawn shamblers',
        group: 'shamblers',
        run: () => spawnShambler(shamblerCount()),
      },
      {
        id: 'debug.spawn-runner',
        label: 'Spawn runner',
        group: 'shamblers',
        run: () => spawnZombie('runner', 1),
      },
      {
        id: 'debug.spawn-crawler',
        label: 'Spawn crawler',
        group: 'shamblers',
        run: () => spawnZombie('crawler', 1),
      },
      {
        id: 'debug.melee-aim-toggle',
        label: 'Melee aim boxes',
        group: 'shamblers',
        state: isAimEnabled,
        run: toggleAim,
      },
      {
        id: 'debug.freeze-shamblers',
        label: 'Freeze shamblers',
        group: 'shamblers',
        state: isFrozen,
        run: toggleFrozen,
      },
      {
        id: 'debug.freeze-game',
        label: 'Freeze game',
        group: 'time',
        param: 'freeze=1',
        state: isGameFrozen,
        run: toggleGameFrozen,
      },
      {
        id: 'debug.tone-cycle',
        label: 'Tone mapping',
        group: 'look',
        param: 'tone=auto/neutral/aces/agx/none',
        detail: () => look.toneMappingName,
        run: () => look.cycleToneMapping(),
      },
      {
        id: 'debug.exposure-decrease',
        label: 'Exposure −',
        group: 'look',
        param: 'exposure=0.2..3',
        detail: () => look.exposure.toFixed(1),
        run: () => look.stepExposure(-1),
      },
      {
        id: 'debug.exposure-increase',
        label: 'Exposure +',
        group: 'look',
        param: 'exposure=0.2..3',
        detail: () => look.exposure.toFixed(1),
        run: () => look.stepExposure(1),
      },
      {
        id: 'debug.linear-colours-toggle',
        label: 'sRGB block colours',
        group: 'look',
        param: 'srgb=0',
        state: () => look.linearColors,
        run: () => look.toggleLinearColors(),
      },
      {
        id: 'debug.patterns-toggle',
        label: 'Surface patterns',
        group: 'look',
        param: 'patterns=0',
        state: () => look.patterns,
        run: () => look.togglePatterns(),
      },
      {
        id: 'debug.ambient-occlusion-toggle',
        label: 'Wide ambient occlusion',
        group: 'lighting',
        param: 'vao=0',
        state: () => look.occlusion,
        run: () => look.toggleOcclusion(),
      },
      {
        id: 'debug.post-toggle',
        label: 'Mood post-processing (all)',
        group: 'post',
        param: 'post=0',
        state: () => look.moodState.post,
        run: () => look.togglePost(),
      },
      {
        id: 'debug.bloom-toggle',
        label: 'Bloom',
        group: 'post',
        param: 'bloom=0',
        state: () => look.moodState.bloom,
        run: () => look.toggleBloom(),
      },
      // Bloom starts where the picture reaches this post-exposure value (core/mood.ts BLOOM_CLIP_BY_TONE); higher blooms less.
      // Insert / Delete are the navigation-cluster keys nothing binds (CONTROLS.md); arrows would steal inventory navigation.
      {
        id: 'debug.bloom-clip-decrease',
        label: 'Bloom clip −',
        group: 'post',
        param: 'bloomclip=1..8',
        detail: () => bloomClipDetail(look),
        run: () => look.stepBloomClip(-1),
      },
      {
        id: 'debug.bloom-clip-increase',
        label: 'Bloom clip +',
        group: 'post',
        param: 'bloomclip=1..8',
        detail: () => bloomClipDetail(look),
        run: () => look.stepBloomClip(1),
      },
      // The flashlight's intensity multiplier, in steps of x1.25. The numpad's own - and + are free in play and debug.
      {
        id: 'debug.torch-decrease',
        label: 'Flashlight strength −',
        group: 'lighting',
        param: 'torch=0.1..16',
        detail: () => `×${look.torch}`,
        run: () => look.stepTorch(-1),
      },
      {
        id: 'debug.torch-increase',
        label: 'Flashlight strength +',
        group: 'lighting',
        param: 'torch=0.1..16',
        detail: () => `×${look.torch}`,
        run: () => look.stepTorch(1),
      },
      {
        id: 'debug.film-toggle',
        label: 'Film (vignette, grain)',
        group: 'post',
        param: 'film=0',
        state: () => look.moodState.film,
        run: () => look.toggleFilm(),
      },
      // Shadows (render/shadows.ts). Every letter is taken or planned (CONTROLS.md), so these use 0 and the navigation
      // cluster, which nothing else binds. Toggling a light's shadows rebuilds shader programs once: expect a hitch.
      {
        id: 'debug.sun-shadow-toggle',
        label: 'Sun shadows',
        group: 'lighting',
        param: 'sunshadow=0',
        state: () => look.shadowState.sun,
        run: () => look.toggleSunShadows(),
      },
      {
        id: 'debug.torch-shadow-toggle',
        label: 'Flashlight shadows',
        group: 'lighting',
        param: 'torchshadow=0',
        state: () => look.shadowState.torch,
        run: () => look.toggleTorchShadows(),
      },
      {
        id: 'debug.shadow-distance-cycle',
        label: 'Sun shadow distance',
        group: 'lighting',
        param: 'shadowdist=16..96',
        detail: () => `${look.shadowState.distance} m`,
        run: () => look.stepShadowDistance(),
      },
      // Diagnostics for a stray bright pixel (see render/hotCheck.ts and Mood.render): End paints the background
      // magenta without touching the fog on geometry; PageDown paints NaN / negative / over-bright fragments in a per-material colour.
      {
        id: 'debug.crack-check-toggle',
        label: 'Crack check (magenta background)',
        group: 'diagnostics',
        param: 'crackcheck=1',
        state: () => look.crackCheck,
        run: () => look.toggleCrackCheck(),
      },
      {
        id: 'debug.hot-pixel-check-toggle',
        label: 'Hot-pixel check (coloured)',
        group: 'diagnostics',
        param: 'hotcheck=1',
        state: () => look.hotCheck,
        run: () => look.toggleHotCheck(),
      },
      // Fogginess is weather, not mood; a weather system will drive it. 0 is clear (no height fog either).
      {
        id: 'debug.fog-decrease',
        label: 'Fogginess −',
        group: 'atmosphere',
        param: 'fog=0..1',
        detail: () => look.fogginess.toFixed(1),
        run: () => look.stepFogginess(-1),
      },
      {
        id: 'debug.fog-increase',
        label: 'Fogginess +',
        group: 'atmosphere',
        param: 'fog=0..1',
        detail: () => look.fogginess.toFixed(1),
        run: () => look.stepFogginess(1),
      },
      {
        id: 'debug.grade-decrease',
        label: 'Grade −',
        group: 'post',
        param: 'grade=0..1',
        detail: () => look.moodState.grade.toFixed(1),
        run: () => look.stepGrade(-1),
      },
      {
        id: 'debug.grade-increase',
        label: 'Grade +',
        group: 'post',
        param: 'grade=0..1',
        detail: () => look.moodState.grade.toFixed(1),
        run: () => look.stepGrade(1),
      },
      // The real clock only runs forward (saves pin it), so "an hour earlier" is 23 h on, tomorrow.
      {
        id: 'debug.skip-long',
        label: 'Skip +23 h (−1 h tomorrow)',
        group: 'time',
        detail: () => formatClock(hooks.sim.calendar),
        run: () => hooks.skipGameHours(SKIP_LONG_HOURS),
      },
      {
        id: 'debug.skip-hour',
        label: 'Skip +1 h',
        group: 'time',
        detail: () => formatClock(hooks.sim.calendar),
        run: () => hooks.skipGameHours(SKIP_SHORT_HOURS),
      },
    ] satisfies Omit<Action, 'key'>[]
  ).map((action) => ({
    ...action,
    get key() {
      return labelForAction(action.id);
    },
  }));

/** The effective bloom clip, marked while it follows the tone mapper rather than an override. */
const bloomClipDetail = (look: LookControls): string =>
  `${look.bloomClip.toFixed(1)}${look.bloomClipIsDefault ? ' (tone mapper)' : ''}`;

export const SKIP_SHORT_HOURS = 1;
export const SKIP_LONG_HOURS = 23;

export const dispatchDebugAction = (actions: readonly Action[], id: string, repeat = false): boolean => {
  const action = actions.find((candidate) => candidate.id === id);
  if (!action) {
    return false;
  }
  if (!repeat) {
    action.run();
  }
  return true;
};

export const formatMeleeResult = (result: MeleeResult): string => {
  if (result.region === undefined || result.healthBefore === undefined || result.healthAfter === undefined) {
    return 'nothing · no region hit';
  }
  const outcome = result.outcome === 'severed' ? `severed ${result.part ?? 'part'}` : result.outcome;
  return `${result.region} ${result.damage} damage (${result.healthBefore}→${result.healthAfter}) · ${outcome}`;
};

export const copyTextOrSelect = async (
  text: string,
  clipboard: { writeText: (value: string) => Promise<void> } | undefined,
  selectFallback: () => void,
): Promise<boolean> => {
  try {
    if (!clipboard) {
      throw new Error('Clipboard API unavailable');
    }
    await clipboard.writeText(text);
    return true;
  } catch {
    selectFallback();
    return false;
  }
};

const DEBUG_START_LIGHT = 'flashlight';

/** A fresh debug game starts with a switched-off flashlight in the left hand, which leaves the right free. */
export const equipDebugStartLight = ({
  inventory,
  debugMode,
  newGame,
}: {
  inventory: Inventory;
  debugMode: boolean;
  newGame: boolean;
}): void => {
  if (!(debugMode && newGame) || inventory.hands.left || inventory.hands.right) {
    return;
  }
  inventory.add(inventory.create(DEBUG_START_LIGHT), { kind: 'hand', side: offSide(inventory.character) });
};

export const attachDebugTools: DebugModule['attachDebugTools'] = (hooks: DebugHooks): DebugRuntime => {
  setDebugFirearmsSkill(hooks.character, location.search, hooks.engine.config.debug, hooks.newGame);
  if (!equipDebugFirearms(hooks.inventory, hooks.engine.config.debug, hooks.newGame, location.search)) {
    equipDebugStartLight({
      inventory: hooks.inventory,
      debugMode: hooks.engine.config.debug,
      newGame: hooks.newGame,
    });
    equipDebugStartWeapons({
      inventory: hooks.inventory,
      debugMode: hooks.engine.config.debug,
      newGame: hooks.newGame,
    });
    if (
      hooks.newGame &&
      new URLSearchParams(location.search).get('loadout') === COMPASS_DEBUG_LOADOUT &&
      !hooks.inventory.hands[dominantSide(hooks.inventory.character)]
    ) {
      hooks.inventory.add(hooks.inventory.create('compass'), {
        kind: 'hand',
        side: dominantSide(hooks.inventory.character),
      });
    }
  }
  const host = document.body;
  let mouseReadout: HTMLElement | null = null;
  let mouseText = formatMouseDiag(undefined);
  attachMouseDiag((text) => {
    mouseText = text;
    if (mouseReadout) {
      render(aimReadoutTemplate(text), mouseReadout);
    }
  });
  const aimOverlay = new DebugAimOverlay(hooks.engine.scene, hooks.engine.config.scale.blockSize);
  let aimReadout: HTMLElement | null = null;
  let lookReadout: HTMLElement | null = null;
  let download: { url: string; name: string } | undefined;
  /** The aim readout is showing a shambler, which the looked-at readout then yields to. */
  let zombieAimShown = false;
  let panelOpen = false;
  let f3Open = false;
  let axesVisible = true;
  let targetRangeText = '';
  let copyStatus = '';
  let cameraQuaternion: readonly [number, number, number, number] = [0, 0, 0, 1];
  let axisAnimation: number | undefined;
  let revealZombies = false;
  let snapshotStatus = '';
  let aimEnabled = true;
  let lastHitText = '';
  let lastHitUntil = 0;
  let readout = emptyReadout;
  let shellKey = '';
  let noclip = false;
  let danger = false;
  const build = new BuildMode(hooks.engine, hooks.body, hooks.engine.config.scale.blockSize);
  const spawnMenu = new SpawnMenu(hooks.engine.registry, hooks.spawnItem);
  let shamblerCount = readShamblerCount();
  let spawnStatus = '';
  /** Groups the operator collapsed; remembered per browser. */
  const closedGroups = readClosedGroups();
  const { shadows } = hooks.engine;
  const look = new LookControls(hooks.engine.renderer, hooks.engine.meshes, hooks.engine.mood, {
    weather: hooks.weather,
    ...(shadows ? { shadows } : {}),
    flashlight: hooks.flashlight,
  });
  const initialLook = parseLookParams(new URLSearchParams(location.search));
  look.restore(initialLook);
  // `?cam=` puts the player at a saved view instead of the spawn or a save's position (the body moves; saves
  // only ever record the body, never this URL). Mid-air the player falls, unless `freeze=1` or noclip holds
  // them. Roll is ignored: it only comes from damage feedback.
  const startPose = parseCamParam(new URLSearchParams(location.search));
  if (startPose) {
    const { body, input } = hooks;
    startPose.position.forEach((metres, axis) => {
      body.pos[axis] = metres / hooks.engine.config.scale.blockSize;
    });
    body.vel = [0, 0, 0];
    body.onGround = false;
    input.yaw = startPose.yaw;
    input.pitch = startPose.pitch;
  }
  /** The whole simulation is stopped (M); play.ts reads it each frame and combines it with the pause menu. */
  let gameFrozen = initialLook.freeze;
  const lookState = (): LookUrlState => ({
    tone: look.toneKey,
    exposure: look.exposure,
    srgb: look.linearColors,
    patterns: look.patterns,
    vao: look.occlusion,
    freeze: gameFrozen,
    fogginess: look.fogginess,
    torch: look.torch,
    shadows: look.shadowState,
    crackCheck: look.crackCheck,
    hotCheck: look.hotCheck,
    ...look.moodState,
  });
  /** Keeps the address bar reproducing the current look: replaces the entry, never adds one or reloads. */
  function syncLookUrl(): void {
    const next = lookUrl(location.href, lookState());
    if (next !== location.href) {
      history.replaceState(history.state, '', next);
    }
    syncCamUrl(true);
  }
  const metresPerBlock = hooks.engine.config.scale.blockSize;
  /** Reused each call: the pose is read a few times a second, so no per-call allocation worth noticing. */
  const camNow: CamPose = { position: [0, 0, 0], yaw: 0, pitch: 0, roll: 0 };
  let camWritten: CamPose | undefined;
  let camWrittenAt = Number.NEGATIVE_INFINITY;
  /** Writes `cam` (the feet pose, camUrl.ts) when it moved and the interval passed, or at once when `force`. */
  function syncCamUrl(force = false): void {
    const { body, input, roll } = hooks;
    for (let i = 0; i < 3; i++) {
      camNow.position[i] = body.pos[i]! * metresPerBlock;
    }
    camNow.yaw = input.yaw;
    camNow.pitch = input.pitch;
    camNow.roll = roll();
    const now = performance.now();
    if (!camWriteDue(camWritten, camNow, now - camWrittenAt, force)) {
      return;
    }
    camWritten = { ...camNow, position: [...camNow.position] as Vec3 };
    camWrittenAt = now;
    const next = camUrl(location.href, camNow);
    if (next !== location.href) {
      history.replaceState(history.state, '', next);
    }
  }
  // Pausing (the pointer lock is lost) is when the operator reaches for the address bar.
  document.addEventListener('pointerlockchange', () => syncCamUrl(true));
  // MenuPointer routes the wheel to the pane under the cursor, including this panel.
  const actions = createDebugActions({
    hooks,
    impactLaser: hooks.impactLaser,
    look,
    build,
    spawnMenu,
    toggleSpawn,
    isNoclip: () => noclip,
    toggleNoclip: () => {
      noclip = !noclip;
    },
    isDanger: () => danger,
    toggleDanger: () => {
      danger = !danger;
    },
    shamblerCount: () => shamblerCount,
    isAimEnabled: () => aimEnabled,
    toggleAim: () => {
      aimEnabled = !aimEnabled;
      if (!aimEnabled) {
        aimOverlay.update(undefined);
        if (aimReadout) {
          render(aimReadoutTemplate(''), aimReadout);
        }
      }
    },
    isFrozen: () => hooks.zombies()?.isFrozen ?? false,
    toggleFrozen: () => {
      const zombies = hooks.zombies();
      zombies?.setFrozen(!zombies.isFrozen);
    },
    isGameFrozen: () => gameFrozen,
    toggleGameFrozen: () => {
      gameFrozen = !gameFrozen;
    },
    spawnShambler: (count) => {
      const zombies = hooks.zombies();
      const placed = zombies ? spawnShamblers(hooks.engine, hooks.body, zombies, count) : 0;
      spawnStatus = `Placed ${placed} of ${count}`;
      if (placed > 0) {
        hooks.showNotice(placed === 1 ? 'A shambler is approaching' : `${placed} shamblers are approaching`);
      }
    },
    spawnZombie: (typeId, count) => {
      const zombies = hooks.zombies();
      const placed = zombies ? spawnZombieType(hooks.engine, hooks.body, zombies, typeId, count) : 0;
      spawnStatus = `Placed ${placed} of ${count}`;
      if (placed > 0) {
        const name = hooks.engine.registry.zombies.get(typeId)?.name ?? typeId;
        hooks.showNotice(placed === 1 ? `A ${name.toLowerCase()} is approaching` : `${placed} ${name.toLowerCase()}s are approaching`);
      }
    },
  });
  function viewState(action: Action): string {
    if (!action.state) {
      return '';
    }
    return action.state() ? 'ON' : 'OFF';
  }
  function actionViews(): ActionView[] {
    return actions.map((action) => ({
      id: action.id,
      key: action.key,
      label:
        (action.id === 'debug.spawn-shamblers' ? `Spawn ${shamblerCount} shamblers` : action.label) +
        (action.detail ? `: ${action.detail()}` : ''),
      state: viewState(action),
      run: () => {
        action.run();
        syncLookUrl();
        shellKey = '';
        drawShell();
      },
    }));
  }
  function toggleGroup(id: GroupId): void {
    if (!closedGroups.delete(id)) {
      closedGroups.add(id);
    }
    writeClosedGroups(closedGroups);
    shellKey = '';
    drawShell();
  }
  /** The panel's groups, built from the action table: the views are in table order, so are the groups' buttons. */
  function groupViews(): GroupView[] {
    const all = actionViews();
    const views = new Map(actions.map((action, i) => [action, all[i]!] as const));
    return actionsByGroup(actions).map(({ def, actions: inGroup }) => ({
      id: def.id,
      title: def.title,
      keys: keysAtAGlance(def, inGroup),
      open: !closedGroups.has(def.id),
      actions: inGroup.map((action) => views.get(action)!),
      toggle: () => toggleGroup(def.id),
    }));
  }
  function updateAxisGizmo(): void {
    axisAnimation = undefined;
    if (!axesVisible) {
      return;
    }
    const camera = hooks.engine.camera.quaternion;
    cameraQuaternion = [camera.x, camera.y, camera.z, camera.w];
    const canvas = host.querySelector<HTMLCanvasElement>('#debug-axis-gizmo');
    if (canvas && !canvas.hidden) {
      paintAxisGizmo(canvas, cameraQuaternion);
    }
    axisAnimation = requestAnimationFrame(updateAxisGizmo);
  }
  function drawAxisGizmo(): void {
    const root = host.querySelector<HTMLElement>('#debug-axis-gizmo-root');
    if (root) {
      render(axisGizmoTemplate(axesVisible, targetRangeText), root);
      const canvas = root.querySelector<HTMLCanvasElement>('#debug-axis-gizmo');
      if (canvas && axesVisible) {
        paintAxisGizmo(canvas, cameraQuaternion);
      }
    }
    if (axesVisible && axisAnimation === undefined) {
      axisAnimation = requestAnimationFrame(updateAxisGizmo);
    } else if (!axesVisible && axisAnimation !== undefined) {
      cancelAnimationFrame(axisAnimation);
      axisAnimation = undefined;
    }
  }
  let nextShotTargetRangeUpdate = Number.NEGATIVE_INFINITY;
  function updateShotTargetRange(now: number): void {
    if (now < nextShotTargetRangeUpdate) {
      return;
    }
    nextShotTargetRangeUpdate = now + 400;
    function* shotTargets(): IterableIterator<ShotTargetBox> {
      for (const entity of hooks.engine.entities.all) {
        const shotTarget = hooks.engine.registry.furniture.get(entity.type)?.shotTarget === true;
        if (shotTarget) {
          yield { pos: entity.pos, size: entity.size, shotTarget };
        }
      }
    }
    const range = rangeToNearestShotTargetMetres(
      hooks.body.pos,
      hooks.body.height,
      hooks.engine.config.scale.blockSize,
      shotTargets(),
    );
    targetRangeText = range === undefined ? '' : `Target range: ${range.toFixed(1)} m`;
  }
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Shell rendering keeps UI wiring and readout refresh together.
  function drawShell(): void {
    const groups = groupViews();
    const key = JSON.stringify([
      panelOpen,
      f3Open,
      revealZombies,
      snapshotStatus,
      spawnMenu.isOpen,
      shamblerCount,
      spawnStatus,
      axesVisible,
      copyStatus,
      groups.map((group) => [group.id, group.open, group.actions.map((view) => [view.label, view.state])]),
    ]);
    if (key !== shellKey) {
      shellKey = key;
      render(
        panelTemplate({
          open: panelOpen,
          groups,
          gameFrozen,
          spawnOpen: spawnMenu.isOpen,
          shamblerCount,
          spawnStatus,
          lastHitText: performance.now() < lastHitUntil ? lastHitText : '',
          setShamblerCount: changeShamblerCount,
          setTimeOfDay: hooks.setTimeOfDay,
          snapshotStatus,
          revealZombies,
          toggleReveal: () => {
            revealZombies = !revealZombies;
            hooks.revealZombies(revealZombies);
            shellKey = '';
            drawShell();
          },
          measureSnapshot: () => {
            snapshotStatus = snapshotMeasurementStatus(hooks.measureSnapshot());
            shellKey = '';
            drawShell();
          },
          copySnapshotResult: async () => {
            const resultLine = host.querySelector<HTMLElement>('#snapshot-measurement-result');
            if (!resultLine || snapshotStatus === '') {
              return;
            }
            const text = snapshotStatus;
            await copyTextOrSelect(text, globalThis.navigator.clipboard, () => {
              resultLine.focus();
              const selection = globalThis.getSelection();
              selection?.removeAllRanges();
              selection?.selectAllChildren(resultLine);
            });
          },
          exportMetrics: hooks.exportMetrics,
          toggleOpen: togglePanel,
          dumpLook,
          download,
          axesVisible,
          toggleAxes: () => {
            axesVisible = !axesVisible;
            shellKey = '';
            drawShell();
          },
          copyViewLink,
          copyStatus,
        }),
        host,
      );
      host.querySelector<HTMLElement>('#debug-ui-root')!.dataset.rendering = hooks.engine.renderer
        ? 'available'
        : 'unavailable';
      build.setHotbar(host.querySelector<HTMLElement>('#hotbar')!);
      spawnMenu.setRoot(host.querySelector<HTMLElement>('#spawn')!);
      aimReadout = host.querySelector<HTMLElement>('#debug-aim-readout');
      lookReadout = host.querySelector<HTMLElement>('#debug-look-readout');
      mouseReadout = host.querySelector<HTMLElement>('#debug-mouse-readout');
      if (mouseReadout) {
        render(aimReadoutTemplate(mouseText), mouseReadout);
      }
    }
    const root = host.querySelector<HTMLElement>('#debug-readout');
    if (root) {
      const shadowText = shadows
        ? shadowReadoutText(look.shadowState, shadows.sunStrength, shadows.casters)
        : '3D rendering unavailable (render-free mode)';
      render(readoutTemplate(readout, shadowText), root);
    }
    drawAxisGizmo();
    const soundRoot = host.querySelector<HTMLElement>('#debug-sound-log-root');
    if (soundRoot) {
      render(soundLogTemplate(readout), soundRoot);
    }
    const f3Root = host.querySelector<HTMLElement>('#f3-overlay-root');
    if (f3Root) {
      render(f3OverlayTemplate(readout, f3Open, hooks.input.yaw, hooks.input.pitch), f3Root);
    }
  }
  async function copyViewLink(): Promise<void> {
    syncCamUrl(true);
    try {
      await navigator.clipboard.writeText(location.href);
      copyStatus = 'View link copied';
    } catch {
      copyStatus = 'Clipboard unavailable';
    }
    shellKey = '';
    drawShell();
  }
  function dumpLook(): void {
    const { config } = hooks.engine;
    const metres = config.scale.blockSize;
    const now = new Date();
    const dump = lookDump({
      toneMapping: look.toneMappingName,
      exposure: look.exposure,
      srgbBlockColours: look.linearColors,
      surfacePatterns: look.patterns,
      wideOcclusion: look.occlusion,
      mood: look.moodState,
      bloomClip: look.bloomClip,
      fogginess: look.fogginess,
      torch: look.torch,
      shadows: look.shadowState,
      performance: { fps: readout.fps, frame: readout.frame, work: readout.work },
      gameTime: formatClock(hooks.sim.calendar),
      site: config.site,
      seed: config.seed,
      viewRadiusM: config.radiusM,
      blockSizeM: metres,
      positionM: hooks.body.pos.map((v) => v * metres) as Vec3,
      yawRad: hooks.input.yaw,
      pitchRad: hooks.input.pitch,
      buildRevision: buildRevision(),
      rollRad: hooks.roll(),
      url: camUrl(lookUrl(location.href, lookState()), {
        position: hooks.body.pos.map((v) => v * metres) as Vec3,
        yaw: hooks.input.yaw,
        pitch: hooks.input.pitch,
        roll: hooks.roll(),
      }),
      now,
    });
    // Blob link rendered by the panel template, clicked, then dropped again.
    download = {
      url: URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })),
      name: lookDumpFilename(now),
    };
    shellKey = '';
    drawShell();
    host.querySelector<HTMLAnchorElement>('#debug-download')?.click();
    URL.revokeObjectURL(download.url);
    download = undefined;
    shellKey = '';
    drawShell();
  }
  function changeShamblerCount(count: number): void {
    shamblerCount = writeShamblerCount(count);
    spawnStatus = '';
    shellKey = '';
    drawShell();
  }
  function togglePanel(): void {
    panelOpen = !panelOpen;
    drawShell();
  }
  function toggleSpawn(): void {
    if (spawnMenu.isOpen) {
      spawnMenu.close();
    } else {
      panelOpen = false;
      spawnMenu.open();
    }
    drawShell();
  }
  function handleAction(action: string): boolean {
    if (action === 'debug.performance-toggle') {
      f3Open = !f3Open;
      drawShell();
      return true;
    }
    if (action === 'debug.panel-toggle') {
      togglePanel();
      return true;
    }
    if (action.startsWith('spawn.')) {
      spawnMenu.handleAction(action);
      drawShell();
      return true;
    }
    if (action.startsWith('debug.build-slot.')) {
      return build.selectSlot(Number(action.slice('debug.build-slot.'.length)) - 1);
    }
    if (!dispatchDebugAction(actions, action)) {
      return false;
    }
    syncLookUrl();
    shellKey = '';
    drawShell();
    return true;
  }
  inputBindings.subscribe(() => {
    shellKey = '';
    drawShell();
  });
  const runtime: DebugRuntime = {
    get aimEnabled() {
      return aimEnabled;
    },
    updateAim(aim: ZombieAim | undefined) {
      zombieAimShown = aimEnabled && aim !== undefined;
      aimOverlay.update(aimEnabled ? aim : undefined);
      if (aimReadout) {
        render(
          aimReadoutTemplate(
            aimEnabled && aim
              ? `${aim.region} ${aim.health}/${aim.maxHealth} · ${aim.distanceMetres.toFixed(2)} m / reach ${aim.reachMetres.toFixed(2)} m`
              : '',
          ),
          aimReadout,
        );
      }
      if (lastHitText && performance.now() >= lastHitUntil) {
        lastHitText = '';
        shellKey = '';
        drawShell();
      }
    },
    updateLookedAt(eye: Vec3, dir: Vec3, active: boolean) {
      if (lookReadout) {
        const { engine } = hooks;
        const text =
          active && !zombieAimShown
            ? describeLookedAt(
                {
                  world: engine.world,
                  registry: engine.registry,
                  entities: engine.entities,
                  isSolid: engine.isOpaque,
                  blockSize: engine.config.scale.blockSize,
                },
                eye,
                dir,
              )
            : '';
        render(aimReadoutTemplate(text), lookReadout);
      }
    },
    recordMeleeResult(result: MeleeResult) {
      lastHitText = formatMeleeResult(result);
      lastHitUntil = performance.now() + 3000;
      shellKey = '';
      drawShell();
    },
    get menuOpen() {
      return panelOpen || spawnMenu.isOpen;
    },
    get buildOn() {
      return build.on;
    },
    get noclip() {
      return noclip;
    },
    get frozen() {
      return gameFrozen;
    },
    get spawnOpen() {
      return spawnMenu.isOpen;
    },
    get revealZombies() {
      return revealZombies;
    },
    dangerReason: () => (danger ? 'Something is close' : undefined),
    handleAction,
    closeMenus() {
      panelOpen = false;
      spawnMenu.close();
      drawShell();
    },
    target: (eye, dir, active) => build.target(eye, dir, active),
    click: (button, eye, dir) => build.click(button, eye, dir),
    wheel: (delta) => build.wheel(delta),
    stepNoclip: (step: DebugNoclipStep) => stepNoclip(step),
    update(next: DebugReadout) {
      readout = next;
      syncCamUrl();
      updateShotTargetRange(performance.now());
      drawShell();
    },
  };
  drawShell();
  return runtime;
};
