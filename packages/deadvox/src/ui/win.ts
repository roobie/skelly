import { html, render } from 'lit-html';
import type { ScenarioRunState } from '../core/scenarioRun.ts';

export type WinCheckpoint = 'saved' | 'pending' | 'failed' | 'unavailable';

export const showWin = (
  root: HTMLElement,
  {
    seed,
    run,
    checkpoint,
    checkpointMessages,
    newWorld,
    freshAttempt,
    exportRun,
  }: {
    seed: number;
    run: Readonly<ScenarioRunState>;
    checkpoint: WinCheckpoint;
    checkpointMessages: Readonly<Record<WinCheckpoint, string>>;
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
    <p>${checkpointMessages[checkpoint]}</p>
    <button type="button" @click=${exportRun}>Export attempt</button>
    <button type="button" @click=${newWorld}>New world</button>
    <button type="button" @click=${freshAttempt}>Fresh attempt on this seed</button>
  </div>`,
    root,
  );
  root.hidden = false;
};
