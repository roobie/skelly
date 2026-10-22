// Lit view of completed projections. Commands and preferences arrive as explicit callbacks.
import { html, nothing, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import type { ScreenText } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';
import { activityProgress } from './activityProgress.ts';
import { comboBox } from './comboBox.ts';
import type { CraftRow, CraftStatus } from './craftReadout.ts';
import { factDetail } from './factDetail.ts';
import { fillHint, keyCap } from './keyCap.ts';

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
      ${row.components.map(
        (group) => html`<div class="craft-components">
        ${group.alternatives.map((a) => html`<div class=${a.found < a.needed ? 'craft-gap' : ''}>${fillText(text.found, { item: a.name, found: a.found, needed: a.needed })}</div>`)}
        ${
          group.alternatives.length > 1
            ? html`<div class="craft-use">${fillHint(text.use, {
                choice: comboBox({
                  label: fillText(text.group, { recipe: row.name, group: group.group + 1 }),
                  options: [
                    { value: '', label: text.cheapestAvailable },
                    ...group.alternatives.map((a) => ({ value: a.id, label: a.name })),
                  ],
                  value: group.preferred,
                  emptyLabel: text.noMatches,
                  choose: (item) => actions.prefer(row.id, group.group, item),
                }),
              })}</div>`
            : nothing
        }
      </div>`,
      )}
      ${row.qualities.map((q) => html`<div class=${q.best < q.required ? 'craft-gap' : ''}>${fillText(text.quality, { quality: q.name, best: q.best, required: q.required })}</div>`)}
      ${row.skills.map((s) => html`<div class=${s.available < s.required ? 'craft-gap' : ''}>${fillText(text.skill, { skill: s.name, level: s.available, required: s.required })}</div>`)}
      ${row.workstation ? html`<div>${fillText(text.station, { station: row.workstation })}</div>` : nothing}
      <button class="craft-start" type="button" ?disabled=${row.reason !== undefined} @click=${() => actions.start(row.id)}>${fillText(row.kind === 'repair' ? text.repair : text.craft, { item: row.itemName.toLowerCase() })}</button>
      ${row.reason ? html`<p class="craft-gap craft-reason">${row.reason}</p>` : nothing}
    </article>`,
    )}
  `,
    root,
  );
};
export const renderCraftStatus = (
  root: HTMLElement,
  status: CraftStatus | undefined,
  actions: { continue: () => void; stop: () => void },
  text: CraftingText,
): void => {
  root.hidden = status === undefined;
  render(
    status
      ? activityProgress({
          label: status.name,
          percent: status.percent,
          progressText: status.progress,
          detail: html`
            ${status.stopped ? html`<span>${text.stopped}</span>` : nothing}
            ${status.reason ? html`<span class="craft-gap">${status.reason}</span>` : nothing}
          `,
          controls: html`
            ${
              status.stopped
                ? html`<button type="button" @click=${actions.continue}>${fillHint(text.continue, { key: keyCap('craft.continue') })}</button>`
                : nothing
            }
            <button type="button" @click=${actions.stop}>${fillHint(text.stop, { key: keyCap('handling.stop') })}</button>
          `,
        })
      : nothing,
    root,
  );
};
