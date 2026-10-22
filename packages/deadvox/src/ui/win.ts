import { html, render } from 'lit-html';
import type { ScenarioRunState } from '../core/scenarioRun.ts';
import type { ScreenText } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';

export type WinCheckpoint = 'saved' | 'pending' | 'failed' | 'unavailable';

export const showWin = (
  root: HTMLElement,
  {
    seed,
    run,
    checkpoint,
    checkpointMessages,
    text,
    newWorld,
    freshAttempt,
    exportRun,
  }: {
    seed: number;
    run: Readonly<ScenarioRunState>;
    checkpoint: WinCheckpoint;
    checkpointMessages: Readonly<Record<WinCheckpoint, string>>;
    text: ScreenText['win'];
    newWorld: () => void;
    freshAttempt: () => void;
    exportRun: () => void;
  },
): void => {
  const hrs = ((run.completedAtGameTimestamp! - run.startedAtGameTimestamp) / 3600).toFixed(1);
  render(
    html`<div class="card">
    <h1>${text.heading}</h1>
    <p>${fillText(text.seed, { seed })}</p>
    <p>${fillText(text.played, { hrs })}</p>
    <p>${checkpointMessages[checkpoint]}</p>
    <button type="button" @click=${exportRun}>${text.export}</button>
    <button type="button" @click=${newWorld}>${text.newWorld}</button>
    <button type="button" @click=${freshAttempt}>${text.freshAttempt}</button>
  </div>`,
    root,
  );
  root.hidden = false;
};
