// What every ecosystem's release lookup shares: bounded fetching and the earliest of several times.

const FETCH_CONCURRENCY = 16;
const NOT_FOUND = 404;

/**
 * @typedef {{ name: string, version: string }} Entry
 * @typedef {Entry & { released: Date | undefined }} DatedEntry
 * @typedef {{
 *   label: string,
 *   isManifest: (path: string) => boolean,
 *   entries: (text: string) => Map<string, Entry>,
 *   dated: (entries: Entry[]) => Promise<DatedEntry[]>,
 * }} Ecosystem
 */

/**
 * The response for `url`, or `undefined` when the registry does not know it.
 * @param {string} url
 * @param {Record<string, string>} [headers]
 */
export async function fetchResponse(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!(response.ok || response.status === NOT_FOUND)) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response.ok ? response : undefined;
}

/**
 * The JSON body for `url`, or `undefined` when the registry does not know it.
 * @param {string} url
 * @param {Record<string, string>} [headers]
 */
export async function fetchJson(url, headers = {}) {
  return (await fetchResponse(url, headers))?.json();
}

/**
 * `lookup` applied to each key, with at most FETCH_CONCURRENCY lookups in flight.
 * @template K, V
 * @param {Iterable<K>} keys
 * @param {(key: K) => Promise<V>} lookup
 */
export async function mapBounded(keys, lookup) {
  const queue = [...keys];
  /** @type {Map<K, V>} */
  const results = new Map();
  const worker = async () => {
    for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
      // biome-ignore lint/performance/noAwaitInLoops: each worker fetches in turn so FETCH_CONCURRENCY bounds the registry load.
      results.set(key, await lookup(key));
    }
  };
  await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker));
  return results;
}

/**
 * The earliest of `times`, or `undefined` when there are none.
 * @param {string[]} times
 */
export function earliest(times) {
  const dates = times.map((time) => new Date(time));
  return dates.length === 0 ? undefined : new Date(Math.min(...dates.map(Number)));
}
