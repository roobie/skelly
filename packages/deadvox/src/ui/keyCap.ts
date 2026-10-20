import { html, type TemplateResult } from 'lit-html';
import { labelForAction } from '../game/inputBindings.ts';

/** Simulation-graph modules compose hints through this, so the fingerprint never follows lit-html. */
export const hintHtml = html;

/** A line of hint text: plain words with any bound key drawn through `keyCap`. */
export type HintText = string | TemplateResult;

/** The one way a bound key is shown to the player; its look is `.keycap` in `src/ui/style.css`. */
export const keyCap = (actionId: string): TemplateResult => html`<kbd class="keycap">${labelForAction(actionId)}</kbd>`;

/** Hint lines joined by newlines, or empty when there are none. */
export const hintLines = (lines: readonly HintText[]): TemplateResult | '' =>
  lines.length === 0 ? '' : html`${lines.map((line, i) => (i === 0 ? line : html`\n${line}`))}`;
