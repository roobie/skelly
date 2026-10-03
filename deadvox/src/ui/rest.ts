// The rest/sleep screen (SLICE-1.md, 1.8): shown while a long action runs, with a
// spinning clock, a progress bar, and an edge effect. The interruption prompt joins
// it once compression drops back to 1x and waits for Continue or Stop.

import { html, render, type TemplateResult } from 'lit-html';
import { formatClock } from '../core/clock.ts';
import type { Simulation } from '../core/sim.ts';
import type { RestAction, RestKind } from '../core/longAction.ts';

/** The key that toggles each kind off again (SLICE-1.md, 1.8 follow-up: a manual stop). */
const STOP_KEY: Readonly<Record<RestKind, string>> = { rest: 'R', sleep: 'L' };

export interface RestViewModel {
  readonly visible: boolean;
  readonly label: string;
  readonly clock: string;
  readonly percent: number;
  readonly stopHint: string;
  readonly prompt: string | undefined;
}

export const restViewModel = (action: RestAction | undefined, sim: Simulation): RestViewModel => {
  if (!action) {
    return { visible: false, label: '', clock: '', percent: 0, stopHint: '', prompt: undefined };
  }
  const percent =
    action.startFatigue > 0
      ? Math.min(100, Math.max(0, ((action.startFatigue - sim.needs.fatigue) / action.startFatigue) * 100))
      : 100;
  return {
    visible: true,
    label: action.label,
    clock: formatClock(sim.calendar),
    percent,
    stopHint: `${STOP_KEY[action.kind]} or X to stop`,
    prompt: sim.compression.interruption,
  };
};

const restTemplate = (vm: RestViewModel): TemplateResult => html`
  <div class="rest-edge"></div>
  <div class="rest-card">
    <div class="rest-clock"><div class="rest-hand"></div></div>
    <h2>${vm.label}…</h2>
    <div class="hd-bar"><div class="hd-fill" style=${`width: ${vm.percent}%`}></div></div>
    <p class="rest-time">${vm.clock}</p>
    <p class="hd-muted">${vm.stopHint}</p>
    ${vm.prompt ? html`<p class="rest-prompt">${vm.prompt}.   C: continue   X: stop</p>` : ''}
  </div>
`;

export const renderRest = (root: HTMLElement, action: RestAction | undefined, sim: Simulation): void => {
  const vm = restViewModel(action, sim);
  root.hidden = !vm.visible;
  if (vm.visible) {
    render(restTemplate(vm), root);
  }
};
