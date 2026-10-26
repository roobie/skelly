import { html, type TemplateResult } from 'lit-html';
import type { DirectiveResult } from 'lit-html/directive.js';
import { fillParts } from '../core/textTemplate.ts';
import { labelForAction } from '../game/inputBindings.ts';

/** Simulation-graph modules compose hints through this, so the fingerprint never follows lit-html. */
export const hintHtml = html;

/** A line of hint text: plain words with any bound key drawn through `keyCap`. */
export type HintText = string | TemplateResult;

/** The one way a bound key is shown to the player; its look is `.keycap` in `src/ui/style.css`. */
export const keyCap = (actionId: string): TemplateResult => html`<kbd class="keycap">${labelForAction(actionId)}</kbd>`;

/** A directive filling a hint slot, such as the crafting combo box. Intersected with `object` because lit's `DirectiveResult` interface has no members, so a bare number would be assignable to it; a number must pass `src/core/numberText.ts` first. */
export type HintDirective = DirectiveResult & object;

/** A content text line with its `{slot}`s filled; a key cap or other markup can fill a slot. */
export const fillHint = (template: string, slots: Readonly<Record<string, HintText | HintDirective>>): TemplateResult =>
  html`${fillParts(template, slots)}`;

/** Hint lines joined by newlines, or empty when there are none. */
export const hintLines = (lines: readonly HintText[]): TemplateResult | '' =>
  lines.length === 0 ? '' : html`${lines.map((line, i) => (i === 0 ? line : html`\n${line}`))}`;
