import type { Registry, ScreenText } from '@skelly/engine/content';
import { claimed, defOf } from '@skelly/engine/inventory';
import { compareCodeUnits } from '@skelly/engine/packs';
import { countText, fillText } from '@skelly/engine/text';
import { html, render, type TemplateResult } from 'lit-html';

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

/** Looted item names, most taken first, with a count where more than one was taken. */
export const lootedText = (registry: Registry, looted: ReadonlyMap<string, number>): string =>
  [...looted]
    .sort((a, b) => b[1] - a[1] || compareCodeUnits(a[0], b[0]))
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

/** The death screen's one way on: a new world, or what the caller names, such as restarting practice. */
export interface DeathAgain {
  readonly act: () => void;
  readonly label?: string;
}

const deathTemplate = (
  vm: DeathViewModel,
  text: DeathText,
  feedbackHref: string,
  again: DeathAgain,
): TemplateResult => html`
  <div class="card">
    <h1>${text.heading}</h1>
    <p>${fillText(text.cause, { cause: vm.cause, span: vm.span })}</p>
    <p>${fillText(text.seed, { seed: countText(vm.worldSeed) })}</p>
    <p>${vm.summary}</p>
    <p><a href=${feedbackHref} target="_blank" rel="noopener">${text.feedback}</a></p>
    <button type="button" @click=${again.act}>${again.label ?? text.newWorld}</button>
  </div>
`;

export const showDeath = (root: HTMLElement, registry: Registry, summary: DeathSummary, again: DeathAgain): void => {
  const feedbackHref = root.ownerDocument.querySelector<HTMLAnchorElement>('#playtest-feedback')?.href;
  if (!feedbackHref) {
    throw new Error('Missing #playtest-feedback link');
  }
  render(deathTemplate(deathViewModel(registry, summary), deathText(registry), feedbackHref, again), root);
  root.hidden = false;
};
