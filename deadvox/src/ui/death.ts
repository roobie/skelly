// The death screen (SLICE-1.md, 1.6): what killed you, how long you lasted, and what
// you took from the houses. "New world" starts over in a fresh world, with the next seed.

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

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
};

export const showDeath = (root: HTMLElement, registry: Registry, summary: DeathSummary, newWorld: () => void): void => {
  const card = el('div');
  card.className = 'card';
  const looted = lootedText(registry, summary.looted);
  const button = el('button', 'New world');
  button.type = 'button';
  button.addEventListener('click', newWorld);
  card.append(
    el('h1', 'You died'),
    el('p', `Of ${summary.cause}, after ${formatSpan(summary.survived)}.`),
    el(
      'p',
      summary.searched === 0
        ? 'You searched nothing.'
        : `You searched ${summary.searched} ${summary.searched === 1 ? 'container' : 'containers'}${looted ? ` and took ${looted}` : ' and took nothing'}.`,
    ),
    button,
  );
  root.replaceChildren(card);
  root.hidden = false;
};
