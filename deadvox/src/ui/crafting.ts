// Lit view of completed projections. Commands and preferences arrive as explicit callbacks.
import { html, nothing, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { activityProgress } from './activityProgress.ts';
import { comboBox } from './comboBox.ts';
import type { CraftRow, CraftStatus } from './craftReadout.ts';
import { factDetail } from './factDetail.ts';
import { keyCap } from './keyCap.ts';

const REPAIR_PREFIX = /^Repair: /;

export interface CraftPanelActions {
  start: (id: string) => void;
  prefer: (id: string, group: number, item: string) => void;
}
export const renderCrafting = (root: HTMLElement, rows: readonly CraftRow[], actions: CraftPanelActions): void => {
  render(
    html`<header><h2>${factDetail('Crafting', 'Starting a recipe requires both hands free.')}</h2></header>
    ${repeat(
      // Keyed by recipe so an open combo box stays with its own recipe when rows change.
      rows,
      (row) => row.id,
      (row) => html`<article class="craft-recipe" data-recipe=${row.id}>
      <h3>${row.name}</h3><div class="craft-time">${row.time} game time</div>
      ${row.components.map(
        (group) => html`<div class="craft-components">
        ${group.alternatives.map((a) => html`<div class=${a.found < a.needed ? 'craft-gap' : ''}>${a.name}: ${a.found} found / ${a.needed} needed</div>`)}
        ${
          group.alternatives.length > 1
            ? html`<div class="craft-use">Use ${comboBox({
                label: `${row.name} material group ${group.group + 1}`,
                options: [
                  { value: '', label: 'Cheapest available' },
                  ...group.alternatives.map((a) => ({ value: a.id, label: a.name })),
                ],
                value: group.preferred,
                choose: (item) => actions.prefer(row.id, group.group, item),
              })}</div>`
            : nothing
        }
      </div>`,
      )}
      ${row.qualities.map((q) => html`<div class=${q.best < q.required ? 'craft-gap' : ''}>${q.name}: best ${q.best} / needs ${q.required}</div>`)}
      ${row.skills.map((s) => html`<div class=${s.available < s.required ? 'craft-gap' : ''}>${s.name}: level ${s.available} / needs ${s.required}</div>`)}
      ${row.workstation ? html`<div>Station: ${row.workstation}</div>` : nothing}
      <button class="craft-start" type="button" ?disabled=${row.reason !== undefined} @click=${() => actions.start(row.id)}>${row.kind === 'repair' ? 'Repair' : 'Craft'} ${row.name.replace(REPAIR_PREFIX, '').toLowerCase()}</button>
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
): void => {
  root.hidden = status === undefined;
  render(
    status
      ? activityProgress({
          label: status.name,
          percent: status.percent,
          progressText: status.progress,
          detail: html`
            ${status.stopped ? html`<span>Stopped</span>` : nothing}
            ${status.reason ? html`<span class="craft-gap">${status.reason}</span>` : nothing}
          `,
          controls: html`
            ${
              status.stopped
                ? html`<button type="button" @click=${actions.continue}>Continue (${keyCap('craft.continue')})</button>`
                : nothing
            }
            <button type="button" @click=${actions.stop}>Stop (${keyCap('handling.stop')})</button>
          `,
        })
      : nothing,
    root,
  );
};
