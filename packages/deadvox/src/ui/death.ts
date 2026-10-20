import { html, render, type TemplateResult } from 'lit-html';
import type { Registry } from '../core/content.ts';
import { defOf } from '../core/items.ts';

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

/** "17 h 26 min", "40 min". */
const formatSpan = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
};

/** The page's query with the next seed, keeping the other settings but not the start time. */
export const newWorldQuery = (search: string, seed: number): string => {
  const params = new URLSearchParams(search);
  params.set('seed', String(seed + 1));
  params.delete('time');
  return `?${params.toString()}`;
};

/** "3 × can of beans, flashlight". */
export const lootedText = (registry: Registry, looted: ReadonlyMap<string, number>): string =>
  [...looted]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, count]) => `${count > 1 ? `${count} × ` : ''}${defOf(registry, type).name.toLowerCase()}`)
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
  return {
    cause: summary.cause,
    worldSeed: summary.worldSeed,
    span: formatSpan(summary.survived),
    summary: `Containers searched: ${summary.searched} · Loot: ${looted || 'none'}`,
  };
};

const deathTemplate = (vm: DeathViewModel, feedbackHref: string, newWorld: () => void): TemplateResult => html`
  <div class="card">
    <h1>You died</h1>
    <p>Cause: ${vm.cause} · Survived: ${vm.span}</p>
    <p>World seed: ${vm.worldSeed}</p>
    <p>${vm.summary}</p>
    <p><a href=${feedbackHref} target="_blank" rel="noopener">Send feedback</a></p>
    <button type="button" @click=${newWorld}>New world</button>
  </div>
`;

export const showDeath = (root: HTMLElement, registry: Registry, summary: DeathSummary, newWorld: () => void): void => {
  const feedbackHref = root.ownerDocument.querySelector<HTMLAnchorElement>('#playtest-feedback')?.href;
  if (!feedbackHref) {
    throw new Error('Missing #playtest-feedback link');
  }
  render(deathTemplate(deathViewModel(registry, summary), feedbackHref, newWorld), root);
  root.hidden = false;
};
