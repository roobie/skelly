// Lit view of completed projections. Commands and preferences arrive as explicit callbacks.
import { html, nothing, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { countText, volumeText } from '../core/numberText.ts';
import type { ScreenText } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';
import { comboBox } from './comboBox.ts';
import type { CraftRow } from './craftReadout.ts';
import { factDetail } from './factDetail.ts';
import { fillHint } from './keyCap.ts';

type CraftingText = ScreenText['crafting'];

export interface CraftPanelActions {
  start: (id: string) => void;
  prefer: (id: string, group: number, item: string) => void;
  source: (id: string, group: number, uid: number | undefined) => void;
}
const alternativeLabel = (
  alternative: CraftRow['components'][number]['alternatives'][number],
  text: CraftingText,
): string => {
  const liquid = alternative.kind === 'liquid';
  const amount = liquid ? (value: number) => volumeText(value / 1000) : countText;
  return fillText(liquid ? text.liquidFound : text.found, {
    item: alternative.name,
    found: amount(alternative.found),
    needed: amount(alternative.needed),
  });
};
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
        ${group.alternatives.map((a) => html`<div class=${a.found < a.needed ? 'craft-gap' : ''}>${alternativeLabel(a, text)}</div>`)}
        ${
          group.alternatives.length > 1
            ? html`<div class="craft-use">${fillHint(text.use, {
                choice: comboBox({
                  label: fillText(text.group, { recipe: row.name, group: countText(group.group + 1) }),
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
        ${group.draws.map((draw) => html`<div class="craft-liquid-draw">${draw}</div>`)}
        ${
          group.alternatives.some((alternative) => alternative.kind === 'liquid')
            ? html`<details class="craft-sources"><summary>${text.sources}</summary>
          <label><input type="checkbox" .checked=${group.automatic} @change=${() => actions.source(row.id, group.group, undefined)}>${text.defaultSources}</label>
          ${group.vessels.map((vessel) => html`<label><input type="checkbox" .checked=${vessel.selected} @change=${() => actions.source(row.id, group.group, vessel.uid)}>${vessel.label}</label>`)}
        </details>`
            : nothing
        }
      </div>`,
      )}
      ${row.qualities.map((q) => html`<div class=${q.best < q.required ? 'craft-gap' : ''}>${fillText(text.quality, { quality: q.name, best: countText(q.best), required: countText(q.required) })}</div>`)}
      ${row.skills.map((s) => html`<div class=${s.available < s.required ? 'craft-gap' : ''}>${fillText(text.skill, { skill: s.name, level: countText(s.available), required: countText(s.required) })}</div>`)}
      ${row.workstation ? html`<div>${fillText(text.station, { station: row.workstation })}</div>` : nothing}
      <button class="craft-start" type="button" aria-disabled=${row.reason === undefined ? 'false' : 'true'}
        aria-describedby=${row.reason === undefined ? nothing : `craft-reason-${row.id}`}
        @click=${() => {
          if (row.reason === undefined) {
            actions.start(row.id);
          }
        }}>${fillText(row.kind === 'repair' ? text.repair : text.craft, { item: row.itemName.toLowerCase() })}</button>
      ${row.reason === undefined ? nothing : html`<p id=${`craft-reason-${row.id}`} class="craft-gap craft-reason">${row.reason}</p>`}
    </article>`,
    )}
  `,
    root,
  );
};
