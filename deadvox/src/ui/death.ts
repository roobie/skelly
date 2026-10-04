import { html, render, type TemplateResult } from 'lit-html';
import type { Registry } from '../core/content.ts';
import { defOf } from '../core/items.ts';

export interface DeathSummary {
  cause: string;
  /** Game seconds from the start to death. */
  survived: number;
  /** Items taken out of furniture, by type. */
  looted: ReadonlyMap<string, number>;
  /** Containers searched. */
  searched: number;
}

/** "17 h 26 min", "40 min". */
export const formatSpan = (seconds: number): string => {
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
  readonly span: string;
  /** "You searched 3 containers and took can of beans." / "You searched nothing." */
  readonly summary: string;
}

export const deathViewModel = (registry: Registry, summary: DeathSummary): DeathViewModel => {
  const looted = lootedText(registry, summary.looted);
  return {
    cause: summary.cause,
    span: formatSpan(summary.survived),
    summary:
      summary.searched === 0
        ? 'You searched nothing.'
        : `You searched ${summary.searched} ${summary.searched === 1 ? 'container' : 'containers'}${looted ? ` and took ${looted}` : ' and took nothing'}.`,
  };
};

const deathTemplate = (vm: DeathViewModel, newWorld: () => void): TemplateResult => html`
  <div class="card">
    <h1>You died</h1>
    <p>Of ${vm.cause}, after ${vm.span}.</p>
    <p>${vm.summary}</p>
    <button type="button" @click=${newWorld}>New world</button>
  </div>
`;

export const showDeath = (root: HTMLElement, registry: Registry, summary: DeathSummary, newWorld: () => void): void => {
  render(deathTemplate(deathViewModel(registry, summary), newWorld), root);
  root.hidden = false;
};
