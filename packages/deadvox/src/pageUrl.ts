// The game page's one URL reader: the query names the content and the harness, the hash holds developer state.
// The homes and their reasons are in `docs/decisions/0006-url-mods-and-hash-state.md`, "Decision". Engine and
// presentation never read the URL; the entry passes them what this reads.

import { type HashState, readHash, writeHash } from './hashState.ts';

/** The mod list, the run's start mod and the switches that choose a harness. */
const GAME_QUERY = new Set([
  'mods',
  'start-mod',
  'bench',
  'render',
  'skyRoute',
  'save-backend',
  'save-test',
  'debug-error',
]);

/** The first query parameter the game does not read; a repeated `start-mod` or one beside the mods panel is refused. */
const unreadQuery = (query: URLSearchParams): string | undefined => {
  const unknown = [...query.keys()].find((name) => !GAME_QUERY.has(name));
  if (unknown !== undefined || !query.has('start-mod')) {
    return unknown;
  }
  return query.getAll('start-mod').length > 1 || query.get('mods') === '1' ? 'start-mod' : undefined;
};

export interface PageUrl {
  readonly query: URLSearchParams;
  readonly hash: HashState;
  /** The query parameter or hash setting the game entry refuses to start from. */
  readonly refused?: string;
}

/** Reads a page URL's query and hash. */
export const readPageUrl = (search: string, fragment: string): PageUrl => {
  const query = new URLSearchParams(search);
  const read = readHash(fragment);
  const hash = 'hash' in read ? read.hash : {};
  const unknown = unreadQuery(query);
  const refused = unknown ?? ('refused' in read ? read.refused : undefined);
  return { query, hash, ...(refused === undefined ? {} : { refused }) };
};

let page: PageUrl | undefined;

/** This page's URL, read once and then kept by `replacePageUrl`. */
export const pageUrl = (): PageUrl => {
  page ??= readPageUrl(location.search, location.hash);
  return page;
};

/** `href` with `query` and `hash` in place of its own; ':' and ',' stay readable in the query. */
export const pageHref = (href: string, query: URLSearchParams, hash: HashState): string => {
  const url = new URL(href);
  url.search = query.toString().replace(/%3A/g, ':').replace(/%2C/g, ',');
  url.hash = writeHash(hash);
  return url.href;
};

/**
 * Puts `query` and `hash` in the address bar without a history entry. A replaced address fires no `hashchange`, so
 * the page does not reload for its own write-back.
 */
export const replacePageUrl = (query: URLSearchParams, hash: HashState): void => {
  const next = pageHref(location.href, query, hash);
  if (next !== location.href) {
    history.replaceState(history.state, '', next);
  }
  page = { ...pageUrl(), query: new URLSearchParams(query), hash };
};
