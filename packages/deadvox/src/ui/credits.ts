// The credits screen, drawn from the asset manifest (core/assets.ts). It shares the
// start and pause card: a Credits link swaps the controls for the credits, and Back
// swaps them back. Every source is listed, CC0 too, with its title, author, where it
// came from, its licence and what we changed.

import { html, render, type TemplateResult } from 'lit-html';
import { type AssetSource, LICENCES, type Manifest, type ScreenText } from '../../../engine/src/content.ts';
import { fillText } from '../../../engine/src/text.ts';
import { fillHint } from './keyCap.ts';

interface CreditsLink {
  readonly url: string;
  readonly host: string;
}

interface CreditsEntryViewModel {
  readonly title: string;
  /** Every distinct page the source came from; packs crediting one source may each link their own. */
  readonly links: readonly CreditsLink[];
  readonly author: string | null;
  readonly licenceName: string;
  readonly licenceUrl: string | null;
  readonly changes: string | null;
}

const entryViewModel = (source: AssetSource): CreditsEntryViewModel => {
  const licence = LICENCES[source.licence];
  return {
    title: source.title,
    links: source.url === null ? [] : [{ url: source.url, host: new URL(source.url).hostname }],
    author: source.author,
    licenceName: licence.name,
    licenceUrl: licence.url,
    changes: source.changes,
  };
};

export interface CreditsViewModel {
  readonly entries: readonly CreditsEntryViewModel[];
}

export const creditsViewModel = (manifest: Manifest): CreditsViewModel => {
  // Keyed by all an entry shows but its links, so entries that differ only there are one (`DESIGN.md`, "Assets and credits").
  const merged = new Map<string, CreditsEntryViewModel>();
  for (const entry of manifest.sources.map(entryViewModel)) {
    const { links, ...shown } = entry;
    const key = JSON.stringify(shown);
    const seen = merged.get(key);
    merged.set(
      key,
      seen
        ? {
            ...seen,
            links: [...seen.links, ...links.filter(({ url }) => !seen.links.some((link) => link.url === url))],
          }
        : entry,
    );
  }
  return { entries: [...merged.values()] };
};

type CreditsText = ScreenText['credits'];

const externalLink = (url: string, label: string): TemplateResult =>
  html`<a href=${url} target="_blank" rel="noopener">${label}</a>`;

const entryTemplate = ({ links, ...entry }: CreditsEntryViewModel, text: CreditsText): TemplateResult => html`
  <li>
    ${
      links.length === 1 ? externalLink(links[0]!.url, entry.title) : html`<strong>${entry.title}</strong>`
    }${entry.author === null ? '' : ` ${fillText(text.byAuthor, { author: entry.author })}`}${links.length === 1 ? `, ${fillText(text.fromHost, { host: links[0]!.host })}` : ''}
    ${links.length > 1 ? links.map(({ url }) => html`<br />${externalLink(url, url.slice('https://'.length))}`) : ''}
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
