import { html, render, type TemplateResult } from 'lit-html';
import type { ScreenText } from '../engine/content.ts';
import { calendarAt, formatClock, type RestAction, type RestKind, type Simulation } from '../engine/sim.ts';
import { fillText } from '../engine/text.ts';
import { activityProgress } from './activityProgress.ts';
import { fillHint, type HintText, type KeyLabels, keyCap } from './keyCap.ts';

export interface WaitViewAction {
  readonly label: string;
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
  readonly text: Pick<ScreenText, 'rest' | 'prompt'>;
  readonly keys: KeyLabels;
}

export const restViewModel = (
  action: RestAction | WaitViewAction | undefined,
  canStop: boolean,
  sim: Simulation,
  { messagesVisible, restLabels, text, keys }: RestViewOptions,
): RestViewModel => {
  if (!action) {
    return { visible: false, label: '', clock: '', percent: 0, stopHint: '', canStop: false, prompt: undefined };
  }
  let percent = 0;
  let label: string = 'startFatigue' in action ? restLabels[action.kind] : action.label;
  if ('startFatigue' in action && action.sleepOnset !== undefined) {
    percent = Math.min(100, (action.sleepOnset.elapsedGameSeconds / action.sleepOnset.durationGameSeconds) * 100);
    label = text.rest.fallingAsleep;
  } else if ('startFatigue' in action && action.wakeAt !== undefined) {
    // An alarm sleep runs to its wake time, not to rested, so progress tracks the time slept.
    const { job } = sim.actions;
    const slept = job?.jobType === 'sleep' ? job.elapsed : 0;
    const remaining = Math.max(0, action.wakeAt - sim.time);
    percent = slept + remaining > 0 ? (slept / (slept + remaining)) * 100 : 100;
    label = fillText(text.rest.until, { rest: label, clock: formatClock(calendarAt(sim.clock, action.wakeAt)) });
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
    stopHint: canStop ? fillHint(text.rest.stop, { key: keyCap(keys, 'handling.stop') }) : '',
    canStop,
    prompt: messagesVisible ? sim.compression.interruption : undefined,
  };
};

/** The interruption, then its continue key and, when the action can stop, its stop key. */
export const interruptionPrompt = (
  text: ScreenText['prompt'],
  reason: string,
  canStop: boolean,
  keys: KeyLabels,
): TemplateResult =>
  html`${fillText(text.interruption, { reason })}   ${fillHint(text.continue, { key: keyCap(keys, 'compression.continue') })}${canStop ? html`   ${fillHint(text.stop, { key: keyCap(keys, 'handling.stop') })}` : ''}`;

const restTemplate = (vm: RestViewModel, text: ScreenText['prompt'], keys: KeyLabels): TemplateResult => html`
  <div class="rest-edge"></div>
  ${activityProgress({
    label: vm.label,
    percent: vm.percent,
    progressText: vm.clock,
    detail: html`
      ${vm.stopHint ? html`<p class="hd-muted">${vm.stopHint}</p>` : ''}
      ${vm.prompt ? html`<p class="rest-prompt">${interruptionPrompt(text, vm.prompt, vm.canStop, keys)}</p>` : ''}
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
  text,
  keys,
}: {
  root: HTMLElement;
  action: RestAction | WaitViewAction | undefined;
  canStop: boolean;
  sim: Simulation;
  messagesVisible: boolean;
  restLabels: Readonly<Record<RestKind, string>>;
  text: Pick<ScreenText, 'rest' | 'prompt'>;
  keys: KeyLabels;
}): void => {
  const vm = restViewModel(action, canStop, sim, { messagesVisible, restLabels, text, keys });
  root.hidden = !vm.visible;
  if (vm.visible) {
    render(restTemplate(vm, text.prompt, keys), root);
  }
};
