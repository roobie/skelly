// Lit view of completed projections. Commands and preferences arrive as explicit callbacks.
import type { ScreenText } from '@skelly/engine/content';
import { countText, fillText, volumeText } from '@skelly/engine/text';
import { html, nothing, render } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { conditionMark } from './conditionMark.ts';
import type { CatalogueEntry, CataloguePage, CraftCatalogueState } from './craftCatalogue.ts';
import type { CraftRow } from './craftReadout.ts';
import { factDetail } from './factDetail.ts';
import { fillHint } from './keyCap.ts';

type CraftingText = ScreenText['crafting'];
export interface CraftPanelActions {
  start: (id: string) => void;
  prefer: (id: string, group: number, item: string) => void;
  source: (id: string, group: number, uid: number | undefined) => void;
  browse?: (change: Partial<CraftCatalogueState>) => void;
  openGroup?: (group: number) => void;
  closeGroup?: () => void;
  /** Turns the pinned world target's view by one step; it never selects another target. */
  turn?: (step: 1 | -1) => void;
  /** Chooses the option row the commitment strip commits; only an explicit press selects, never hover. */
  select?: (id: string) => void;
}
interface CraftOptions {
  rows: readonly CraftRow[];
  selected: string;
}
/** The pinned world piece: its review heading, and whether a model view sits beside the rows. */
export interface CraftWorldView {
  heading: string;
  depicted: boolean;
}
export interface CraftCatalogueView {
  state: CraftCatalogueState;
  results: CataloguePage<CatalogueEntry>;
  categories: CataloguePage<CatalogueEntry>;
  tags: CataloguePage<CatalogueEntry>;
  categoryName: string;
  activeTags: CatalogueEntry[];
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
const pageControls = (
  page: CataloguePage<CatalogueEntry>,
  text: CraftingText,
  change: (page: number) => void,
) => html`<nav class="craft-pages">
  <button type="button" ?disabled=${!page.previous} @click=${() => change(page.page - 1)}>${text.previousPage}</button>
  <span>${fillText(text.pagePosition, { first: countText(page.first), last: countText(page.last), total: countText(page.total) })}</span>
  <button type="button" ?disabled=${!page.next} @click=${() => change(page.page + 1)}>${text.nextPage}</button>
</nav>`;
const catalogueTemplate = (view: CraftCatalogueView, actions: CraftPanelActions, text: CraftingText) => {
  const { state } = view;
  const browse = (change: Partial<CraftCatalogueState>) => actions.browse!(change);
  return html`<aside class="craft-facets" ?hidden=${state.allKnown}>
    <h3>${text.categories}</h3>
    <button type="button" @click=${() => browse({ category: '', page: 0 })}>${text.all}</button>
    <div class="craft-active-category">${view.categoryName}</div>
    <input type="search" aria-label=${text.categoryFind} placeholder=${text.categoryFind} .value=${live(state.categoryQuery)}
      @input=${(event: Event) => browse({ categoryQuery: (event.target as HTMLInputElement).value, categoryPage: 0 })}>
    <div class="craft-category-options">${repeat(
      view.categories.entries,
      (entry) => entry.id,
      (entry) =>
        html`<button type="button" aria-pressed=${state.category === entry.id} @click=${() => browse({ category: entry.id, page: 0 })}>${entry.name}</button>`,
    )}</div>
    ${view.categories.total ? nothing : html`<p>${text.noMatches}</p>`}
    ${pageControls(view.categories, text, (categoryPage) => browse({ categoryPage }))}
    <h3>${text.tags}</h3>
    <div class="craft-active-tags">${view.activeTags.map((tag) => html`<button type="button" aria-label=${fillText(text.removeTag, { tag: tag.name })} @click=${() => browse({ tags: state.tags.filter((id) => id !== tag.id), page: 0 })}>${tag.name} ×</button>`)}</div>
    <input type="search" aria-label=${text.tagFind} placeholder=${text.tagFind} .value=${live(state.tagQuery)}
      @input=${(event: Event) => browse({ tagQuery: (event.target as HTMLInputElement).value, tagPage: 0 })}>
    <div class="craft-tag-options">${repeat(
      view.tags.entries,
      (entry) => entry.id,
      (entry) =>
        html`<button type="button" aria-pressed=${state.tags.includes(entry.id)} @click=${() => browse({ tags: state.tags.includes(entry.id) ? state.tags.filter((id) => id !== entry.id) : [...state.tags, entry.id], page: 0 })}>${entry.name}</button>`,
    )}</div>
    ${view.tags.total ? nothing : html`<p>${text.noMatches}</p>`}
    ${pageControls(view.tags, text, (tagPage) => browse({ tagPage }))}
  </aside><section class="craft-catalogue">
    <label>${text.find}<input class="craft-query" type="search" .value=${live(state.query)} @input=${(event: Event) => browse({ query: (event.target as HTMLInputElement).value, page: 0 })}></label>
    <button type="button" @click=${() => browse({ query: '', page: 0 })}>${text.clearFind}</button>
    <label><input type="checkbox" .checked=${state.makeable} ?disabled=${state.allKnown} @change=${(event: Event) => browse({ makeable: (event.target as HTMLInputElement).checked, page: 0 })}>${text.makeable}</label>
    <label><input class="craft-all-known" type="checkbox" .checked=${state.allKnown} @change=${(event: Event) => browse({ allKnown: (event.target as HTMLInputElement).checked, page: 0 })}>${text.allKnown}</label>
    <div class="craft-results">${repeat(
      view.results.entries,
      (entry) => entry.id,
      (entry) =>
        html`<button type="button" data-craft-result=${entry.id} aria-pressed=${state.selected === entry.id} @click=${() => browse({ selected: entry.id })}>${entry.name}</button>`,
    )}</div>
    ${view.results.total ? nothing : html`<p class="craft-empty">${text.noMatches}</p>`}
    ${pageControls(view.results, text, (page) => browse({ page }))}
  </section>`;
};
const targetTemplate = (world: CraftWorldView, actions: CraftPanelActions, text: CraftingText) =>
  html`<figure class="craft-target">
    ${world.depicted ? html`<canvas class="craft-target-canvas" aria-hidden="true"></canvas>` : nothing}
    <div class="craft-target-turn">
      <button type="button" data-craft-turn="-1" @click=${() => actions.turn?.(-1)}>${text.turnLeft}</button>
      <button type="button" data-craft-turn="1" @click=${() => actions.turn?.(1)}>${text.turnRight}</button>
    </div>
  </figure>`;
/** The Start button's verb for this review's kind; content owns each label. */
const startVerb = (text: CraftingText, kind: CraftRow['kind']) => {
  switch (kind) {
    case 'craft':
      return text.craft;
    case 'repair':
      return text.repair;
    case 'take_apart':
      return text.takeApart;
    case 'remove_part':
      return text.removePart;
    case 'fit_part':
      return text.fitPart;
    case 'continue':
      return text.continueWork;
    default:
      throw new Error('Unknown review kind');
  }
};
const commitLabel = (row: CraftRow, text: CraftingText) =>
  fillText(startVerb(text, row.kind), { item: row.itemName.toLowerCase() });
/** A piece's selectable services; the selected one drives the commitment strip, and a refused one keeps its reason. */
const optionRows = ({ rows, selected }: CraftOptions, actions: CraftPanelActions, text: CraftingText) =>
  html`<div class="craft-options">${repeat(
    rows,
    (row) => row.id,
    (row) => {
      // The part leads with its condition blip alone (`packages/deadvox/INTERFACE.md`, "Condition").
      const condition = row.part?.condition;
      const service = commitLabel(row, text);
      return html`<button type="button" class=${row.reason === undefined ? '' : 'craft-gap'} data-craft-option=${row.id} aria-pressed=${row.id === selected}
        @click=${() => actions.select?.(row.id)}>${condition ? fillHint(text.servicePart, { condition: conditionMark(condition), service }) : service}${row.reason === undefined ? nothing : html`<small>${row.reason}</small>`}</button>`;
    },
  )}</div>`;
/** The rows a review reads but never chooses: condition, progress, held inputs and yield. */
const readOnlyRows = (row: CraftRow, text: CraftingText) =>
  html`${row.condition === undefined ? nothing : html`<div class="craft-condition">${fillHint(text.repairCondition, { now: conditionMark(row.condition.now), after: conditionMark(row.condition.after) })}</div>`}
    ${row.progress === undefined ? nothing : html`<div class="craft-progress">${fillText(text.workDone, row.progress)}</div>`}
    ${(row.held ?? []).map((input) => html`<div class="craft-held">${fillText(text.savedInput, { item: input.name, count: countText(input.count) })}</div>`)}
    ${(row.yields ?? []).map((output) => html`<div class="craft-yield">${fillText(text.yieldRow, { item: output.name, count: countText(output.count) })}</div>`)}`;
const reviewTemplate = (
  row: CraftRow,
  actions: CraftPanelActions,
  {
    text,
    world,
    options,
    openGroup,
  }: {
    text: CraftingText;
    world?: CraftWorldView | undefined;
    options?: CraftOptions | undefined;
    openGroup?: number | undefined;
  },
) => {
  const groupNumber = openGroup;
  const open = row.components.find((group) => group.group === groupNumber);
  return html`<article class="craft-recipe" data-recipe=${row.id}>
    ${world ? nothing : html`<h3>${row.name}</h3>`}
    <div class="craft-review-scroll">
      <div class=${world ? 'craft-rows-pane craft-rows-world' : 'craft-rows-pane'}>${world ? targetTemplate(world, actions, text) : nothing}<div class="craft-requirements">
        ${options ? optionRows(options, actions, text) : nothing}
        ${readOnlyRows(row, text)}
        ${row.components.map((group) => {
          const chosen = group.alternatives.find((a) => a.id === group.selected);
          const label = chosen ? alternativeLabel(chosen, text) : text.noPlan;
          const gap = chosen && chosen.found < chosen.needed;
          return html`<div class="craft-components">
            ${
              group.alternatives.length > 1
                ? html`<button type="button" class=${gap ? 'craft-gap' : ''} data-craft-group=${group.group} aria-expanded=${group.group === groupNumber} @click=${() => actions.openGroup?.(group.group)}>${label}<small>${fillText(text.alternatives, { count: countText(group.alternatives.length - 1) })}</small></button>`
                : html`<div class=${gap ? 'craft-gap' : ''}>${alternativeLabel(group.alternatives[0]!, text)}</div>`
            }
          </div>`;
        })}
        ${row.qualities.map((q) => html`<div class=${q.best < q.required ? 'craft-gap' : ''}>${fillText(text.quality, { quality: q.name, best: countText(q.best), required: countText(q.required) })}</div>`)}
        ${row.skills.map((s) => html`<div class=${s.available < s.required ? 'craft-gap' : ''}>${fillText(text.skill, { skill: s.name, level: countText(s.available), required: countText(s.required) })}</div>`)}
        ${row.workstation ? html`<div>${fillText(text.station, { station: row.workstation })}</div>` : nothing}
      </div><aside class="craft-alternatives">
        ${
          open
            ? html`<button type="button" class="craft-close-alternatives" @click=${actions.closeGroup}>${text.closeAlternatives}</button>
          <button type="button" aria-pressed=${open.preferred === ''} @click=${() => actions.prefer(row.id, open.group, '')}>${text.cheapestAvailable}</button>
          ${open.alternatives.map((alternative) => html`<button type="button" aria-pressed=${open.preferred === alternative.id} @click=${() => actions.prefer(row.id, open.group, alternative.id)}>${alternativeLabel(alternative, text)}</button>`)}`
            : nothing
        }
      </aside></div>
      ${row.components
        .filter((group) => group.alternatives.some((a) => a.kind === 'liquid'))
        .map(
          (
            group,
          ) => html`<details class="craft-sources"><summary>${text.sources} · ${countText(group.group + 1)}</summary>
        ${group.draws.map((draw) => html`<div class="craft-liquid-draw">${draw}</div>`)}
        <label><input type="checkbox" .checked=${group.automatic} @change=${() => actions.source(row.id, group.group, undefined)}>${text.defaultSources}</label>
        ${group.vessels.map((vessel) => html`<label><input type="checkbox" .checked=${vessel.selected} @change=${() => actions.source(row.id, group.group, vessel.uid)}>${vessel.label}</label>`)}
      </details>`,
        )}
    </div>
    <footer class="craft-commitment"><div class="craft-time">${fillText(row.progress ? text.timeLeft : text.length, { span: row.length })}</div>
      <button class="craft-start" type="button" aria-disabled=${row.reason === undefined ? 'false' : 'true'} aria-describedby=${row.reason === undefined ? nothing : `craft-reason-${row.id}`}
        @click=${() => {
          if (row.reason === undefined) {
            actions.start(row.id);
          }
        }}>${commitLabel(row, text)}</button>
      ${row.reason === undefined ? nothing : html`<p id=${`craft-reason-${row.id}`} class="craft-gap craft-reason">${row.reason}</p>`}
    </footer>
  </article>`;
};
const layoutClass = (catalogue: CraftCatalogueView | undefined): string => {
  if (!catalogue) {
    return 'craft-layout craft-world';
  }
  return catalogue.state.allKnown ? 'craft-layout craft-unfaceted' : 'craft-layout';
};
export const renderCrafting = (
  root: HTMLElement,
  rows: readonly CraftRow[],
  actions: CraftPanelActions,
  {
    text,
    world,
    catalogue,
    selected,
    openGroup,
  }: {
    text: CraftingText;
    world?: CraftWorldView;
    catalogue?: CraftCatalogueView;
    /** Reviews the rows as options of one review that commits the selected one, as a piece's services are. */
    selected?: string;
    openGroup?: number;
  },
): void => {
  const chosen = selected === undefined ? undefined : (rows.find((row) => row.id === selected) ?? rows[0]);
  render(
    html`<header><h2>${world === undefined ? factDetail(text.heading, text.headingFact) : world.heading}</h2></header>
    <div class=${layoutClass(catalogue)}>
      ${catalogue ? catalogueTemplate(catalogue, actions, text) : nothing}
      <section class="craft-review">${
        chosen
          ? reviewTemplate(chosen, actions, { text, world, options: { rows, selected: chosen.id }, openGroup })
          : repeat(
              rows,
              (row) => row.id,
              (row) => reviewTemplate(row, actions, { text, world, openGroup }),
            )
      }</section>
    </div>`,
    root,
  );
};
