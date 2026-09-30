import { html, render, type TemplateResult } from 'lit-html';
import type { Inventory } from '../core/inventory.ts';
import type { DebugHooks, DebugModule, DebugNoclipStep, DebugReadout, DebugRuntime } from '../game/debugInterface.ts';
import { BuildMode } from './build.ts';
import { stepNoclip } from './noclip.ts';
import { readShamblerCount, writeShamblerCount } from './shamblerCount.ts';
import { spawnShamblers } from './shamblerSpawning.ts';
import { SpawnMenu } from './spawnMenu.ts';

export interface Action {
  readonly code: string;
  readonly key: string;
  readonly label: string;
  readonly state?: () => boolean;
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
  spawnOpen,
  shamblerCount,
  spawnStatus,
  setShamblerCount,
  toggleOpen,
}: {
  open: boolean;
  actions: readonly ActionView[];
  spawnOpen: boolean;
  shamblerCount: number;
  spawnStatus: string;
  setShamblerCount: (count: number) => void;
  toggleOpen: () => void;
}): TemplateResult => html`
  <div id="debug-ui-root">
    <div class="debug-marker" ?hidden=${open} @click=${toggleOpen}>DEBUG · Backquote</div>
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
    <div class="debug-actions">
      ${actions.map(
        (action) => html`
        <button type="button" @click=${action.run}>
          ${action.label} (${action.key})${action.state ? ` · ${action.state}` : ''}
        </button>
      `,
      )}
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
];

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

const DEBUG_START_WEAPON = 'baseball_bat';

export const equipDebugStartWeapon = ({
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
  const bat = inventory.create(DEBUG_START_WEAPON);
  inventory.add(bat, { kind: 'hand', side: 'right' });
};

export const attachDebugTools: DebugModule['attachDebugTools'] = (hooks: DebugHooks): DebugRuntime => {
  equipDebugStartWeapon({
    inventory: hooks.inventory,
    debugMode: hooks.engine.config.debug,
    newGame: hooks.newGame,
  });
  const host = document.body;
  let panelOpen = false;
  let readout = emptyReadout;
  let shellKey = '';
  let noclip = false;
  let danger = false;
  const build = new BuildMode(hooks.engine, hooks.body, hooks.engine.config.scale.blockSize);
  const spawnMenu = new SpawnMenu(hooks.engine.registry, hooks.spawnItem);
  let shamblerCount = readShamblerCount();
  let spawnStatus = '';
  const actions = createDebugActions({
    hooks,
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
      label: action.code === 'KeyV' ? `Spawn ${shamblerCount} shamblers` : action.label,
      state: viewState(action),
      run: () => {
        action.run();
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
          spawnOpen: spawnMenu.isOpen,
          shamblerCount,
          spawnStatus,
          setShamblerCount: changeShamblerCount,
          toggleOpen: togglePanel,
        }),
        host,
      );
      build.setHotbar(host.querySelector<HTMLElement>('#hotbar')!);
      spawnMenu.setRoot(host.querySelector<HTMLElement>('#spawn')!);
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
      shellKey = '';
      drawShell();
    }
    return true;
  }
  const runtime: DebugRuntime = {
    get menuOpen() {
      return panelOpen || spawnMenu.isOpen;
    },
    get buildOn() {
      return build.on;
    },
    get noclip() {
      return noclip;
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
