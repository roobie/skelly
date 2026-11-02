import { html, render, type TemplateResult } from 'lit-html';
import { claimed } from '../core/capabilities.ts';
import type { Registry } from '../core/content.ts';
import { defOf } from '../core/items.ts';
import { countText } from '../core/numberText.ts';
import type { ScreenText } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';

export interface DeathSummary {
  cause: string;
  /** Seed of the world this survivor played. */
  worldSeed: number;
  /** Game seconds from the start to death. */
  survived: number;
  /** Items taken out of furniture, by type. */
  looted: ReadonlyMap<string, number>;
  /** Containers searched. */
  searched: number;
}

type DeathText = ScreenText['death'];

const deathText = (registry: Registry): DeathText => claimed(registry.ui, 'interface')!.screenText.death;

/** Hours and minutes, or minutes alone under an hour. */
const formatSpan = (seconds: number, text: DeathText): string => {
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0
    ? fillText(text.spanLong, { hrs: countText(h), mins: countText(m) })
    : fillText(text.spanShort, { mins: countText(m) });
};

/** The page's query with the next seed, keeping the other settings but not the start time. */
export const newWorldQuery = (search: string, seed: number): string => {
  const params = new URLSearchParams(search);
  params.set('seed', String(seed + 1));
  params.delete('time');
  return `?${params.toString()}`;
};

/** Looted item names, most taken first, with a count where more than one was taken. */
export const lootedText = (registry: Registry, looted: ReadonlyMap<string, number>): string =>
  [...looted]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, count]) => {
      const item = defOf(registry, type).name.toLowerCase();
      return count > 1 ? fillText(deathText(registry).lootCount, { count: countText(count), item }) : item;
    })
    .join(', ');

export interface DeathViewModel {
  readonly cause: string;
  readonly worldSeed: number;
  readonly span: string;
  /** Container count and looted item names. */
  readonly summary: string;
}

export const deathViewModel = (registry: Registry, summary: DeathSummary): DeathViewModel => {
  const looted = lootedText(registry, summary.looted);
  const text = deathText(registry);
  return {
    cause: summary.cause,
    worldSeed: summary.worldSeed,
    span: formatSpan(summary.survived, text),
    summary: fillText(text.summary, { searched: countText(summary.searched), loot: looted || text.noLoot }),
  };
};

const deathTemplate = (
  vm: DeathViewModel,
  text: DeathText,
  feedbackHref: string,
  newWorld: () => void,
): TemplateResult => html`
  <div class="card">
    <h1>${text.heading}</h1>
    <p>${fillText(text.cause, { cause: vm.cause, span: vm.span })}</p>
    <p>${fillText(text.seed, { seed: countText(vm.worldSeed) })}</p>
    <p>${vm.summary}</p>
    <p><a href=${feedbackHref} target="_blank" rel="noopener">${text.feedback}</a></p>
    <button type="button" @click=${newWorld}>${text.newWorld}</button>
  </div>
`;

export const showDeath = (root: HTMLElement, registry: Registry, summary: DeathSummary, newWorld: () => void): void => {
  const feedbackHref = root.ownerDocument.querySelector<HTMLAnchorElement>('#playtest-feedback')?.href;
  if (!feedbackHref) {
    throw new Error('Missing #playtest-feedback link');
  }
  render(deathTemplate(deathViewModel(registry, summary), deathText(registry), feedbackHref, newWorld), root);
  root.hidden = false;
};
