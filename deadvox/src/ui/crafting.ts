// Lit view of completed projections. Commands and preferences arrive as explicit callbacks.
import { html, nothing, render } from 'lit-html';
import type { CraftRow, CraftStatus } from './craftReadout.ts';

export interface CraftPanelActions {
  start: (id: string) => void;
  prefer: (id: string, group: number, item: string) => void;
}
export const renderCrafting = (root: HTMLElement, rows: readonly CraftRow[], actions: CraftPanelActions): void => {
  render(
    html`<header><h2>Crafting</h2><p>Known recipes · clear both hands to start.</p></header>
    ${rows.map(
      (row) => html`<article class="craft-recipe" data-recipe=${row.id}>
      <h3>${row.name}</h3><div class="craft-time">${row.time} game time</div>
      ${row.components.map(
        (group) => html`<div class="craft-components">
        ${group.alternatives.map((a) => html`<div class=${a.found < a.needed ? 'craft-gap' : ''}>${a.name}: ${a.found} found / ${a.needed} needed</div>`)}
        ${
          group.alternatives.length > 1
            ? html`<label>Use <select aria-label=${`${row.name} material group ${group.group + 1}`} @change=${(event: Event) => actions.prefer(row.id, group.group, (event.target as HTMLSelectElement).value)}>
          <option value="" ?selected=${group.preferred === ''}>Cheapest available</option>
          ${group.alternatives.map((a) => html`<option value=${a.id} ?selected=${group.preferred === a.id}>${a.name}</option>`)}
        </select></label>`
            : nothing
        }
      </div>`,
      )}
      ${row.qualities.map((q) => html`<div class=${q.best < q.required ? 'craft-gap' : ''}>${q.name}: best ${q.best} / needs ${q.required}</div>`)}
      ${row.skills.map((s) => html`<div class=${s.available < s.required ? 'craft-gap' : ''}>${s.name}: level ${s.available} / needs ${s.required}</div>`)}
      ${row.workstation ? html`<div>Station: ${row.workstation}</div>` : nothing}
      <button class="craft-start" type="button" ?disabled=${row.reason !== undefined} @click=${() => actions.start(row.id)}>Craft ${row.name.toLowerCase()}</button>
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
      ? html`<strong>${status.name}</strong><div>${status.progress} · ${status.percent}% ${status.stopped ? '· stopped' : ''}</div>
    <progress max="100" value=${status.percent} aria-label="Craft progress"></progress>
    ${status.reason ? html`<div class="craft-gap">${status.reason}</div>` : nothing}
    ${status.stopped ? html`<button type="button" @click=${actions.continue}>Continue (C)</button>` : nothing}
    <button type="button" @click=${actions.stop}>Stop (X)</button>`
      : nothing,
    root,
  );
};
