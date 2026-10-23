// The credits screen, drawn from the asset manifest (core/assets.ts). It shares the
// start and pause card: a Credits link swaps the controls for the credits, and Back
// swaps them back. Every source is listed, CC0 too, with its title, author, where it
// came from, its licence and what we changed.

import { html, render, type TemplateResult } from 'lit-html';
import { type AssetSource, LICENCES, type Manifest } from '../core/assets.ts';
import type { ScreenText } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';
import { fillHint } from './keyCap.ts';

export interface CreditsEntryViewModel {
  readonly title: string;
  readonly url: string | null;
  readonly author: string | null;
  /** The hostname the source came from, when it has a link. */
  readonly host: string | null;
  readonly licenceName: string;
  readonly licenceUrl: string | null;
  readonly changes: string | null;
}

const entryViewModel = (source: AssetSource): CreditsEntryViewModel => {
  const licence = LICENCES[source.licence];
  return {
    title: source.title,
    url: source.url,
    author: source.author,
    host: source.url === null ? null : new URL(source.url).hostname,
    licenceName: licence.name,
    licenceUrl: licence.url,
    changes: source.changes,
  };
};

export interface CreditsViewModel {
  readonly entries: readonly CreditsEntryViewModel[];
}

export const creditsViewModel = (manifest: Manifest): CreditsViewModel => ({
  entries: manifest.sources.map(entryViewModel),
});

type CreditsText = ScreenText['credits'];

const entryTemplate = (entry: CreditsEntryViewModel, text: CreditsText): TemplateResult => html`
  <li>
    ${
      entry.url === null
        ? html`<strong>${entry.title}</strong>`
        : html`<a href=${entry.url} target="_blank" rel="noopener">${entry.title}</a>`
    }${entry.author === null ? '' : ` ${fillText(text.byAuthor, { author: entry.author })}`}${entry.host === null ? '' : `, ${fillText(text.fromHost, { host: entry.host })}`}
    <br />
    ${fillHint(text.licence, {
      licence:
        entry.licenceUrl === null
          ? entry.licenceName
          : html`<a href=${entry.licenceUrl} target="_blank" rel="noopener">${entry.licenceName}</a>`,
    })}${entry.changes === null ? '' : html`<br />${fillText(text.changes, { changes: entry.changes })}`}
  </li>
`;

const creditsTemplate = (vm: CreditsViewModel, text: CreditsText, onBack: (e: Event) => void): TemplateResult => html`
  <h1>${text.heading}</h1>
  ${vm.entries.length === 0 ? html`<p>${text.none}</p>` : html`<ul class="credits">${vm.entries.map((entry) => entryTemplate(entry, text))}</ul>`}
  <p><a href="#" rel="noopener" @click=${onBack}>${text.back}</a></p>
`;

export interface CreditsElements {
  /** What the card shows otherwise: the controls. */
  about: HTMLElement;
  /** Where the credits go. */
  box: HTMLElement;
  /** The link that shows them. */
  show: HTMLElement;
}

export const mountCredits = ({ about, box, show }: CreditsElements, manifest: Manifest, text: CreditsText): void => {
  const showCredits = (visible: boolean) => {
    about.hidden = visible;
    box.hidden = !visible;
  };
  render(
    creditsTemplate(creditsViewModel(manifest), text, (e) => {
      e.preventDefault();
      showCredits(false);
    }),
    box,
  );
  show.addEventListener('click', (e) => {
    e.preventDefault();
    showCredits(true);
  });
  // Reading the credits shouldn't start the game; only the rest of the overlay does.
  box.addEventListener('click', (e) => e.stopPropagation());
};
