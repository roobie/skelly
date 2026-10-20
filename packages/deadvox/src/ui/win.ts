import { html, render } from 'lit-html';
import type { ScenarioRunState } from '../core/scenarioRun.ts';

const CHECKPOINT_TEXT = {
  saved: 'The completed attempt is saved.',
  pending: 'Saving the completed attempt…',
  failed: 'The win has not been acknowledged by storage. Use the save recovery controls to retry or export.',
  unavailable: 'Saving is unavailable; this completion is not durably saved.',
};

export const showWin = (
  root: HTMLElement,
  {
    seed,
    run,
    checkpoint,
    newWorld,
    freshAttempt,
    exportRun,
  }: {
    seed: number;
    run: Readonly<ScenarioRunState>;
    checkpoint: keyof typeof CHECKPOINT_TEXT;
    newWorld: () => void;
    freshAttempt: () => void;
    exportRun: () => void;
  },
): void => {
  render(
    html`<div class="card">
    <h1>You won</h1>
    <p>World seed: ${seed}</p>
    <p>Elapsed game hours: ${((run.completedAtGameTimestamp! - run.startedAtGameTimestamp) / 3600).toFixed(1)}</p>
    <p>${CHECKPOINT_TEXT[checkpoint]}</p>
    <button type="button" @click=${exportRun}>Export attempt</button>
    <button type="button" @click=${newWorld}>New world</button>
    <button type="button" @click=${freshAttempt}>Fresh attempt on this seed</button>
  </div>`,
    root,
  );
  root.hidden = false;
};
