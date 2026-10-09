import { html, render, type TemplateResult } from 'lit-html';
import { formatClock } from '../core/clock.ts';
import type { RestAction } from '../core/longAction.ts';
import type { Simulation } from '../core/sim.ts';
import { labelForAction } from '../game/inputBindings.ts';

export interface WaitViewAction {
  readonly label: 'Waiting';
}

export interface RestViewModel {
  readonly visible: boolean;
  readonly label: string;
  readonly clock: string;
  readonly percent: number;
  readonly stopHint: string;
  readonly canStop: boolean;
  readonly prompt: string | undefined;
}

export const restViewModel = (
  action: RestAction | WaitViewAction | undefined,
  canStop: boolean,
  sim: Simulation,
  messagesVisible: boolean,
): RestViewModel => {
  if (!action) {
    return { visible: false, label: '', clock: '', percent: 0, stopHint: '', canStop: false, prompt: undefined };
  }
  let percent = 0;
  if ('startFatigue' in action) {
    percent =
      action.startFatigue > 0
        ? Math.min(100, Math.max(0, ((action.startFatigue - sim.needs.fatigue) / action.startFatigue) * 100))
        : 100;
  }
  return {
    visible: true,
    label: action.label,
    clock: formatClock(sim.calendar),
    percent,
    stopHint: canStop ? `${labelForAction('handling.stop')} to stop` : '',
    canStop,
    prompt: messagesVisible ? sim.compression.interruption : undefined,
  };
};

const restTemplate = (vm: RestViewModel): TemplateResult => html`
  <div class="rest-edge"></div>
  <div class="rest-card">
    <div class="rest-clock"><div class="rest-hand"></div></div>
    <h2>${vm.label}…</h2>
    <div class="hd-bar"><div class="hd-fill" style=${`width: ${vm.percent}%`}></div></div>
    <p class="rest-time">${vm.clock}</p>
    ${vm.stopHint ? html`<p class="hd-muted">${vm.stopHint}</p>` : ''}
    ${vm.prompt ? html`<p class="rest-prompt">${vm.prompt}.   ${labelForAction('compression.continue')}: continue${vm.canStop ? `   ${labelForAction('handling.stop')}: stop` : ''}</p>` : ''}
  </div>
`;

export const renderRest = ({
  root,
  action,
  canStop,
  sim,
  messagesVisible,
}: {
  root: HTMLElement;
  action: RestAction | WaitViewAction | undefined;
  canStop: boolean;
  sim: Simulation;
  messagesVisible: boolean;
}): void => {
  const vm = restViewModel(action, canStop, sim, messagesVisible);
  root.hidden = !vm.visible;
  if (vm.visible) {
    render(restTemplate(vm), root);
  }
};
