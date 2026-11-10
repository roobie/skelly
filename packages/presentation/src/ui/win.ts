import type { ScreenText } from '@skelly/engine/content';
import type { ScenarioRunState } from '@skelly/engine/sim';
import { countText, decimalText, fillText } from '@skelly/engine/text';
import { html, render } from 'lit-html';

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
  const hrs = decimalText((run.completedAtGameTimestamp! - run.startedAtGameTimestamp) / 3600);
  render(
    html`<div class="card">
    <h1>${text.heading}</h1>
    <p>${fillText(text.seed, { seed: countText(seed) })}</p>
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
