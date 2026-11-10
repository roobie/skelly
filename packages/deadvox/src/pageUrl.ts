// The game page's one URL reader: the query names the content and the harness, the hash holds developer state.
// The homes and their reasons are in `docs/decisions/0006-url-mods-and-hash-state.md`, "Decision". Engine and
// presentation never read the URL; the entry passes them what this reads.

import { GRAPHICS_KNOBS } from '@skelly/engine/look';
import { type HashState, readHash, writeHash } from './hashState.ts';

/** The mod list and the switches that choose a harness. */
const HARNESS_QUERY = ['mods', 'bench', 'render', 'skyRoute', 'save-backend', 'save-test', 'debug-error'];

/**
 * World setup and player choices whose mod or option home does not exist yet, so the game still reads them from
 * the query; see `packages/deadvox/docs/url-mods.md`, "Where each parameter goes".
 */
const UNHOMED_QUERY = [
  'site',
  'storeys',
  'density',
  'time',
  'start',
  'tutorial',
  'weatheringProfile',
  ...Object.values(GRAPHICS_KNOBS).map(({ url }) => url),
];

const GAME_QUERY = new Set([...HARNESS_QUERY, ...UNHOMED_QUERY]);

export interface PageUrl {
  readonly query: URLSearchParams;
  readonly hash: HashState;
  /** The query parameter or hash setting the game entry refuses to start from. */
  readonly refused?: string;
}

/** Reads a page URL's query and hash. A bench page keeps its own query until it moves onto these homes. */
export const readPageUrl = (search: string, fragment: string): PageUrl => {
  const query = new URLSearchParams(search);
  const read = readHash(fragment);
  const hash = 'hash' in read ? read.hash : {};
  const unknown = query.has('bench') ? undefined : [...query.keys()].find((name) => !GAME_QUERY.has(name));
  const refused = unknown ?? ('refused' in read ? read.refused : undefined);
  return { query, hash, ...(refused === undefined ? {} : { refused }) };
};

let page: PageUrl | undefined;

/** This page's URL, read once. */
export const pageUrl = (): PageUrl => {
  page ??= readPageUrl(location.search, location.hash);
  return page;
};

/** The page's URL with `hash` as its hash and everything else kept. */
export const hrefWithHash = (href: string, hash: HashState): string => {
  const url = new URL(href);
  url.hash = writeHash(hash);
  return url.href;
};

/** Sets hash keys in place, without a history entry; an undefined value removes its key, and other keys stay. */
export const replaceHash = (changes: HashState): void => {
  const current = pageUrl();
  page = { ...current, hash: { ...current.hash, ...changes } };
  const next = hrefWithHash(location.href, page.hash);
  if (next !== location.href) {
    history.replaceState(history.state, '', next);
  }
};
