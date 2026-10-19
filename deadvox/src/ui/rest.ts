import { html, render, type TemplateResult } from 'lit-html';
import { calendarAt, formatClock } from '../core/clock.ts';
import type { RestAction, RestKind } from '../core/longAction.ts';
import type { Simulation } from '../core/sim.ts';
import { activityProgress } from './activityProgress.ts';
import { type HintText, keyCap } from './keyCap.ts';

export interface WaitViewAction {
  readonly label: 'Waiting';
}

export interface RestViewModel {
  readonly visible: boolean;
  readonly label: string;
  readonly clock: string;
  readonly percent: number;
  readonly stopHint: HintText;
  readonly canStop: boolean;
  readonly prompt: string | undefined;
}

export interface RestViewOptions {
  readonly messagesVisible: boolean;
  /** What the card calls each kind of rest; from the core ui content. */
  readonly restLabels: Readonly<Record<RestKind, string>>;
}

export const restViewModel = (
  action: RestAction | WaitViewAction | undefined,
  canStop: boolean,
  sim: Simulation,
  { messagesVisible, restLabels }: RestViewOptions,
): RestViewModel => {
  if (!action) {
    return { visible: false, label: '', clock: '', percent: 0, stopHint: '', canStop: false, prompt: undefined };
  }
  let percent = 0;
  let label: string = 'startFatigue' in action ? restLabels[action.kind] : action.label;
  if ('startFatigue' in action && action.sleepOnset !== undefined) {
    percent = Math.min(100, (action.sleepOnset.elapsedGameSeconds / action.sleepOnset.durationGameSeconds) * 100);
    label = 'Falling asleep';
  } else if ('startFatigue' in action && action.wakeAt !== undefined) {
    // An alarm sleep runs to its wake time, not to rested, so progress tracks the time slept.
    const { job } = sim.actions;
    const slept = job?.jobType === 'sleep' ? job.elapsed : 0;
    const remaining = Math.max(0, action.wakeAt - sim.time);
    percent = slept + remaining > 0 ? (slept / (slept + remaining)) * 100 : 100;
    label = `${label} until ${formatClock(calendarAt(sim.clock, action.wakeAt))}`;
  } else if ('startFatigue' in action) {
    percent =
      action.startFatigue > 0
        ? Math.min(100, Math.max(0, ((action.startFatigue - sim.needs.fatigue) / action.startFatigue) * 100))
        : 100;
  }
  return {
    visible: true,
    label,
    clock: formatClock(sim.calendar),
    percent,
    stopHint: canStop ? html`Stop (${keyCap('handling.stop')})` : '',
    canStop,
    prompt: messagesVisible ? sim.compression.interruption : undefined,
  };
};

const restTemplate = (vm: RestViewModel): TemplateResult => html`
  <div class="rest-edge"></div>
  ${activityProgress({
    label: vm.label,
    percent: vm.percent,
    progressText: vm.clock,
    detail: html`
      ${vm.stopHint ? html`<p class="hd-muted">${vm.stopHint}</p>` : ''}
      ${vm.prompt ? html`<p class="rest-prompt">${vm.prompt}.   ${keyCap('compression.continue')}: continue${vm.canStop ? html`   ${keyCap('handling.stop')}: stop` : ''}</p>` : ''}
    `,
  })}
`;

export const renderRest = ({
  root,
  action,
  canStop,
  sim,
  messagesVisible,
  restLabels,
}: {
  root: HTMLElement;
  action: RestAction | WaitViewAction | undefined;
  canStop: boolean;
  sim: Simulation;
  messagesVisible: boolean;
  restLabels: Readonly<Record<RestKind, string>>;
}): void => {
  const vm = restViewModel(action, canStop, sim, { messagesVisible, restLabels });
  root.hidden = !vm.visible;
  if (vm.visible) {
    render(restTemplate(vm), root);
  }
};
