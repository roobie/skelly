import { html, render, type TemplateResult } from 'lit-html';
import type { Vec3 } from '../core/coords.ts';
import type { DebugHooks, DebugModule, DebugNoclipStep, DebugReadout, DebugRuntime } from '../game/debugInterface.ts';
import { BuildMode } from './build.ts';
import { stepNoclip } from './noclip.ts';
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

const panelTemplate = (
  open: boolean,
  actions: readonly ActionView[],
  spawnOpen: boolean,
  toggleOpen: () => void,
): TemplateResult => html`
  <div class="debug-marker" ?hidden=${open} @click=${toggleOpen}>DEBUG · Backquote</div>
  <section class="debug-panel" ?hidden=${!open}>
    <header class="debug-panel-header"><strong>Debug / authoring</strong><button type="button" @click=${toggleOpen}>Close (Backquote)</button></header>
    <div id="debug-readout" class="debug-readout"></div>
    <div class="debug-actions">
      ${actions.map(
        (action) => html`
        <button type="button" @click=${action.run}>
          ${action.label} (${action.key})${action.state ? ` · ${action.state}` : ''}
        </button>
      `,
      )}
    </div>
    <p>Noclip: P (Space rises, R descends). While building, 1–9 select blocks; wheel cycles. Panel: Backquote.</p>
  </section>
  <div id="hotbar" hidden></div>
  <div id="spawn" ?hidden=${!spawnOpen}></div>
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
  spawnShambler: () => void;
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
  { code: 'KeyV', key: 'V', label: 'Spawn shambler', run: spawnShambler },
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

export const attachDebugTools: DebugModule['attachDebugTools'] = (hooks: DebugHooks): DebugRuntime => {
  const host = document.createElement('div');
  host.id = 'debug-ui-root';
  document.body.append(host);
  let panelOpen = false;
  let readout = emptyReadout;
  let shellKey = '';
  let noclip = false;
  let danger = false;
  const build = new BuildMode(
    hooks.engine,
    document.createElement('div'),
    hooks.body,
    hooks.engine.config.scale.blockSize,
  );
  const spawnMenu = new SpawnMenu(document.createElement('div'), hooks.engine.registry, hooks.spawnItem);
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
    spawnShambler,
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
      label: action.label,
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
    const key = JSON.stringify([panelOpen, spawnMenu.isOpen, views.map((view) => [view.label, view.state])]);
    if (key !== shellKey) {
      shellKey = key;
      render(panelTemplate(panelOpen, views, spawnMenu.isOpen, togglePanel), host);
      build.setHotbar(host.querySelector<HTMLElement>('#hotbar')!);
      spawnMenu.setRoot(host.querySelector<HTMLElement>('#spawn')!);
    }
    const root = host.querySelector<HTMLElement>('#debug-readout');
    if (root) {
      render(readoutTemplate(readout), root);
    }
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
  function spawnShambler(): void {
    const type = hooks.engine.registry.zombies.get('shambler');
    const zombies = hooks.zombies();
    if (!(type && zombies)) {
      return;
    }
    const forward: Vec3 = [-Math.sin(hooks.input.yaw), 0, -Math.cos(hooks.input.yaw)];
    const size = hooks.engine.config.scale.blockSize;
    const pos: Vec3 = [
      hooks.body.pos[0] + (forward[0] * 6) / size,
      hooks.body.pos[1],
      hooks.body.pos[2] + (forward[2] * 6) / size,
    ];
    zombies.add(type, pos, [-forward[0], 0, -forward[2]]);
    hooks.showNotice('A shambler is approaching');
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
