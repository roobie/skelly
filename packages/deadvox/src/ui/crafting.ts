// Lit view of completed projections. Commands and preferences arrive as explicit callbacks.
import { html, nothing, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import type { ScreenText } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';
import type { CraftRow } from './craftReadout.ts';
import { craftRequirements } from './craftRequirements.ts';
import { factDetail } from './factDetail.ts';

type CraftingText = ScreenText['crafting'];

export interface CraftPanelActions {
  start: (id: string) => void;
  prefer: (id: string, group: number, item: string) => void;
}
export const renderCrafting = (
  root: HTMLElement,
  rows: readonly CraftRow[],
  actions: CraftPanelActions,
  text: CraftingText,
): void => {
  render(
    html`<header><h2>${factDetail(text.heading, text.headingFact)}</h2></header>
    ${repeat(
      // Keyed by recipe so an open combo box stays with its own recipe when rows change.
      rows,
      (row) => row.id,
      (row) => html`<article class="craft-recipe" data-recipe=${row.id}>
      <h3>${row.name}</h3><div class="craft-time">${fillText(text.length, { span: row.time })}</div>
      ${craftRequirements(row, actions.prefer, text)}
      <button class="craft-start" type="button" ?disabled=${row.reason !== undefined} @click=${() => actions.start(row.id)}>${fillText(row.kind === 'repair' ? text.repair : text.craft, { item: row.itemName.toLowerCase() })}</button>
      ${row.reason ? html`<p class="craft-gap craft-reason">${row.reason}</p>` : nothing}
    </article>`,
    )}
  `,
    root,
  );
};
