// The credits screen, drawn from the asset manifest (core/assets.ts). It shares the
// start and pause card: a Credits link swaps the controls for the credits, and Back
// swaps them back. Every source is listed, CC0 too, with its title, author, where it
// came from, its licence and what we changed.

import { type AssetSource, LICENCES, type Manifest } from '../core/assets.ts';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
};

const link = (text: string, href: string): HTMLAnchorElement => {
  const a = el('a', text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
};

const entry = (source: AssetSource): HTMLLIElement => {
  const li = el('li');
  li.append(source.url === null ? el('strong', source.title) : link(source.title, source.url));
  if (source.author !== null) {
    li.append(` by ${source.author}`);
  }
  if (source.url !== null) {
    li.append(`, from ${new URL(source.url).hostname}`);
  }
  const licence = LICENCES[source.licence];
  li.append(el('br'), 'Licence: ', link(licence.name, licence.url));
  if (source.changes !== null) {
    li.append(el('br'), `Changes: ${source.changes}`);
  }
  return li;
};

export interface CreditsElements {
  /** What the card shows otherwise: the controls. */
  about: HTMLElement;
  /** Where the credits go. */
  box: HTMLElement;
  /** The link that shows them. */
  show: HTMLElement;
}

export const mountCredits = ({ about, box, show }: CreditsElements, manifest: Manifest): void => {
  const back = link('Back', '#');
  back.removeAttribute('target');
  box.replaceChildren(
    el('h1', 'Credits'),
    el('p', 'deadvox uses these assets. Thank you to the people who made them.'),
  );
  if (manifest.sources.length === 0) {
    box.append(el('p', 'No assets yet.'));
  } else {
    const list = el('ul');
    list.className = 'credits';
    list.append(...manifest.sources.map(entry));
    box.append(list);
  }
  const foot = el('p');
  foot.append(back);
  box.append(foot);

  const showCredits = (visible: boolean) => {
    about.hidden = visible;
    box.hidden = !visible;
  };
  show.addEventListener('click', (e) => {
    e.preventDefault();
    showCredits(true);
  });
  back.addEventListener('click', (e) => {
    e.preventDefault();
    showCredits(false);
  });
  // Reading the credits shouldn't start the game; only the rest of the overlay does.
  box.addEventListener('click', (e) => e.stopPropagation());
};
