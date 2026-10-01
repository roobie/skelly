import { html, nothing, render, type TemplateResult } from 'lit-html';
import { formatClock } from '../core/clock.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';
import type { MeleeResult, ZombieAim } from '../core/zombies.ts';
import type { DebugHooks, DebugModule, DebugNoclipStep, DebugReadout, DebugRuntime } from '../game/debugInterface.ts';
import { DebugAimOverlay } from './aimOverlay.ts';
import { BuildMode } from './build.ts';
import { LookControls } from './look.ts';
import { buildRevision, lookDump, lookDumpFilename } from './lookDump.ts';
import { describeLookedAt } from './lookedAt.ts';
import { type LookUrlState, lookUrl, parseLookParams } from './lookUrl.ts';
import { stepNoclip } from './noclip.ts';
import { readShamblerCount, writeShamblerCount } from './shamblerCount.ts';
import { spawnShamblers } from './shamblerSpawning.ts';
import { SpawnMenu } from './spawnMenu.ts';

export interface Action {
  readonly code: string;
  readonly key: string;
  readonly label: string;
  readonly state?: () => boolean;
  /** Current value, appended to the label in the panel. */
  readonly detail?: () => string;
  readonly run: () => void;
}

interface ActionView {
  readonly key: string;
  readonly label: string;
  readonly state: string;
  readonly run: () => void;
}

const readoutTemplate = (readout: DebugReadout): TemplateResult => html`
  <span>${readout.fps.toFixed(0)} fps</span>
  <span>seed ${readout.seed}</span>
  <span>radius ${readout.radius} m · ${readout.movement}</span>
  <span>position ${readout.position.map((v) => v.toFixed(1)).join(', ')}</span>
  <span>chunks ${readout.chunks} · ${readout.pending} pending · ${readout.holes} holes</span>
  <span>shamblers ${readout.zombies}</span>
`;

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
                ${sound.distanceMetres.toFixed(1)} m · ${sound.wallRuns} walls ·
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

const panelTemplate = ({
  open,
  actions,
  gameFrozen,
  spawnOpen,
  shamblerCount,
  spawnStatus,
  lastHitText,
  setShamblerCount,
  toggleOpen,
  dumpLook,
  download,
}: {
  open: boolean;
  actions: readonly ActionView[];
  gameFrozen: boolean;
  spawnOpen: boolean;
  shamblerCount: number;
  spawnStatus: string;
  lastHitText: string;
  setShamblerCount: (count: number) => void;
  toggleOpen: () => void;
  dumpLook: () => void;
  /** A file to save: the link below is clicked once while this is set. */
  download: { url: string; name: string } | undefined;
}): TemplateResult => html`
  <div id="debug-ui-root">
    <div class="debug-marker" ?hidden=${open} @click=${toggleOpen}>DEBUG · Backquote</div>
    <div class="debug-marker debug-frozen" ?hidden=${!gameFrozen}>FROZEN · M</div>
    <div id="debug-aim-readout" class="debug-aim-readout" aria-live="polite"></div>
    <div id="debug-look-readout" class="debug-aim-readout"></div>
    <section class="debug-panel" ?hidden=${!open}>
    <header class="debug-panel-header"><strong>Debug / authoring</strong><button type="button" @click=${toggleOpen}>Close (Backquote)</button></header>
    <div id="debug-readout" class="debug-readout"></div>
    <div class="debug-shambler-count" role="group" aria-label="Shambler spawn count">
      <span>Shambler count</span>
      <button type="button" aria-label="Decrease shambler count" ?disabled=${shamblerCount <= 1} @click=${() => setShamblerCount(shamblerCount - 1)}>−</button>
      <output aria-label="Current shambler spawn count" aria-live="polite">${shamblerCount}</output>
      <button type="button" aria-label="Increase shambler count" ?disabled=${shamblerCount >= 100} @click=${() => setShamblerCount(shamblerCount + 1)}>+</button>
    </div>
    <p id="shambler-spawn-status" aria-live="polite" ?hidden=${spawnStatus === ''}>${spawnStatus}</p>
    <p class="debug-last-hit" aria-live="polite" ?hidden=${lastHitText === ''}>${lastHitText}</p>
    <div class="debug-actions">
      ${actions.map(
        (action) => html`
        <button type="button" @click=${action.run}>
          ${action.label} (${action.key})${action.state ? ` · ${action.state}` : ''}
        </button>
      `,
      )}
      <button type="button" @click=${dumpLook}>Dump look settings (JSON)</button>
      <a id="debug-download" hidden href=${download?.url ?? ''} download=${download?.name ?? ''}></a>
    </div>
      <div id="debug-sound-log-root"></div>
      <p>Noclip: P (Space rises, R descends). While building, 1–9 select blocks; wheel cycles. Panel: Backquote.</p>
    </section>
    <div id="hotbar" hidden></div>
    <div id="spawn" ?hidden=${!spawnOpen}></div>
  </div>
`;

const emptyReadout: DebugReadout = {
  fps: 0,
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
  isAimEnabled: () => boolean;
  toggleAim: () => void;
  isFrozen: () => boolean;
  toggleFrozen: () => void;
  isGameFrozen: () => boolean;
  toggleGameFrozen: () => void;
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
  isAimEnabled,
  toggleAim,
  isFrozen,
  toggleFrozen,
  isGameFrozen,
  toggleGameFrozen,
  look,
}: ActionContext): Action[] => [
  { code: 'KeyB', key: 'B', label: 'Build tools', state: () => build.on, run: () => build.toggle() },
  { code: 'KeyG', key: 'G', label: 'Spawn item menu', state: () => spawnMenu.isOpen, run: toggleSpawn },
  {
    code: 'KeyH',
    key: 'H',
    label: 'God mode',
    state: () => hooks.sim.godMode,
    run: () => {
      hooks.sim.godMode = !hooks.sim.godMode;
    },
  },
  { code: 'KeyP', key: 'P', label: 'Noclip', state: isNoclip, run: toggleNoclip },
  {
    code: 'KeyT',
    key: 'T',
    label: 'Compress / rest',
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
    code: 'KeyN',
    key: 'N',
    label: 'Emit noise',
    run: () => hooks.sim.emit({ kind: 'interrupt', reason: 'You hear something outside' }),
  },
  { code: 'KeyU', key: 'U', label: 'Danger test', state: isDanger, run: toggleDanger },
  { code: 'KeyK', key: 'K', label: 'Take 25 damage', run: () => hooks.sim.hurt(25, 'a debug key') },
  { code: 'KeyV', key: 'V', label: 'Spawn shamblers', run: () => spawnShambler(shamblerCount()) },
  { code: 'KeyY', key: 'Y', label: 'Melee aim boxes', state: isAimEnabled, run: toggleAim },
  { code: 'KeyO', key: 'O', label: 'Freeze shamblers', state: isFrozen, run: toggleFrozen },
  { code: 'KeyM', key: 'M', label: 'Freeze game', state: isGameFrozen, run: toggleGameFrozen },
  {
    code: 'KeyJ',
    key: 'J',
    label: 'Tone mapping',
    detail: () => look.toneMappingName,
    run: () => look.cycleToneMapping(),
  },
  {
    code: 'Minus',
    key: '-',
    label: 'Exposure −',
    detail: () => look.exposure.toFixed(1),
    run: () => look.stepExposure(-1),
  },
  {
    code: 'Equal',
    key: '=',
    label: 'Exposure +',
    detail: () => look.exposure.toFixed(1),
    run: () => look.stepExposure(1),
  },
  {
    code: 'KeyI',
    key: 'I',
    label: 'sRGB block colours',
    state: () => look.linearColors,
    run: () => look.toggleLinearColors(),
  },
  {
    code: 'Semicolon',
    key: ';',
    label: 'Surface patterns',
    state: () => look.patterns,
    run: () => look.togglePatterns(),
  },
  // The real clock only runs forward (saves pin it), so "an hour earlier" is 23 h on, tomorrow.
  {
    code: 'Comma',
    key: ',',
    label: 'Skip +23 h (−1 h tomorrow)',
    detail: () => formatClock(hooks.sim.calendar),
    run: () => hooks.skipGameHours(SKIP_LONG_HOURS),
  },
  {
    code: 'Period',
    key: '.',
    label: 'Skip +1 h',
    detail: () => formatClock(hooks.sim.calendar),
    run: () => hooks.skipGameHours(SKIP_SHORT_HOURS),
  },
];

export const SKIP_SHORT_HOURS = 1;
export const SKIP_LONG_HOURS = 23;

export const dispatchDebugAction = (actions: readonly Action[], code: string, repeat = false): boolean => {
  const action = actions.find((candidate) => candidate.code === code);
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
  inventory.add(inventory.create(DEBUG_START_LIGHT), { kind: 'hand', side: 'left' });
};

export const attachDebugTools: DebugModule['attachDebugTools'] = (hooks: DebugHooks): DebugRuntime => {
  equipDebugStartLight({
    inventory: hooks.inventory,
    debugMode: hooks.engine.config.debug,
    newGame: hooks.newGame,
  });
  const host = document.body;
  const aimOverlay = new DebugAimOverlay(hooks.engine.scene, hooks.engine.config.scale.blockSize);
  let aimReadout: HTMLElement | null = null;
  let lookReadout: HTMLElement | null = null;
  let download: { url: string; name: string } | undefined;
  /** The aim readout is showing a shambler, which the looked-at readout then yields to. */
  let zombieAimShown = false;
  let panelOpen = false;
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
  const look = new LookControls(hooks.engine.renderer, hooks.engine.meshes);
  const initialLook = parseLookParams(new URLSearchParams(location.search));
  look.restore(initialLook);
  /** The whole simulation is stopped (M); play.ts reads it each frame and combines it with the pause menu. */
  let gameFrozen = initialLook.freeze;
  const lookState = (): LookUrlState => ({
    tone: look.toneKey,
    exposure: look.exposure,
    srgb: look.linearColors,
    patterns: look.patterns,
    freeze: gameFrozen,
  });
  /** Keeps the address bar reproducing the current look: replaces the entry, never adds one or reloads. */
  function syncLookUrl(): void {
    const next = lookUrl(location.href, lookState());
    if (next !== location.href) {
      history.replaceState(history.state, '', next);
    }
  }
  const actions = createDebugActions({
    hooks,
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
  });
  function viewState(action: Action): string {
    if (!action.state) {
      return '';
    }
    return action.state() ? 'ON' : 'OFF';
  }
  function actionViews(): ActionView[] {
    return actions.map((action) => ({
      key: action.key,
      label:
        (action.code === 'KeyV' ? `Spawn ${shamblerCount} shamblers` : action.label) +
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
  function drawShell(): void {
    const views = actionViews();
    const key = JSON.stringify([
      panelOpen,
      spawnMenu.isOpen,
      shamblerCount,
      spawnStatus,
      views.map((view) => [view.label, view.state]),
    ]);
    if (key !== shellKey) {
      shellKey = key;
      render(
        panelTemplate({
          open: panelOpen,
          actions: views,
          gameFrozen,
          spawnOpen: spawnMenu.isOpen,
          shamblerCount,
          spawnStatus,
          lastHitText: performance.now() < lastHitUntil ? lastHitText : '',
          setShamblerCount: changeShamblerCount,
          toggleOpen: togglePanel,
          dumpLook,
          download,
        }),
        host,
      );
      build.setHotbar(host.querySelector<HTMLElement>('#hotbar')!);
      spawnMenu.setRoot(host.querySelector<HTMLElement>('#spawn')!);
      aimReadout = host.querySelector<HTMLElement>('#debug-aim-readout');
      lookReadout = host.querySelector<HTMLElement>('#debug-look-readout');
    }
    const root = host.querySelector<HTMLElement>('#debug-readout');
    if (root) {
      render(readoutTemplate(readout), root);
    }
    const soundRoot = host.querySelector<HTMLElement>('#debug-sound-log-root');
    if (soundRoot) {
      render(soundLogTemplate(readout), soundRoot);
    }
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
      gameTime: formatClock(hooks.sim.calendar),
      site: config.site,
      seed: config.seed,
      viewRadiusM: config.radiusM,
      blockSizeM: metres,
      positionM: hooks.body.pos.map((v) => v * metres) as Vec3,
      yawRad: hooks.input.yaw,
      pitchRad: hooks.input.pitch,
      buildRevision: buildRevision(),
      url: lookUrl(location.href, lookState()),
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
  function handleKey(e: KeyboardEvent): boolean {
    if (e.code === 'Backquote') {
      if (!e.repeat) {
        togglePanel();
      }
      return true;
    }
    if (spawnMenu.isOpen) {
      if (e.code === 'KeyG' && !(e.target instanceof HTMLInputElement) && !e.repeat) {
        toggleSpawn();
      }
      return true;
    }
    if (!dispatchDebugAction(actions, e.code, e.repeat)) {
      return panelOpen;
    }
    if (!e.repeat) {
      syncLookUrl();
      shellKey = '';
      drawShell();
    }
    return true;
  }
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
                  isSolid: engine.isSolid,
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
    dangerReason: () => (danger ? 'Something is close' : undefined),
    handleKey,
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
      drawShell();
    },
  };
  drawShell();
  return runtime;
};
