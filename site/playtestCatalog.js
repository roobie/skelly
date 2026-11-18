/** @typedef {import('./playtestLanguage.js').PlaytestLanguage} PlaytestLanguage */
/** @typedef {Record<string, string>} PlaytestText */
/** @typedef {(url: URL) => Promise<{ ok: boolean; json(): Promise<unknown> }>} CatalogFetcher */

/**
 * @param {CatalogFetcher} fetcher
 * @param {URL} url
 * @param {PlaytestLanguage} language
 * @returns {Promise<PlaytestText | null>}
 */
export const loadPlaytestText = async (fetcher, url, language) => {
  try {
    const response = await fetcher(url);
    if (!response.ok) {
      return null;
    }
    const catalog = /** @type {Partial<Record<PlaytestLanguage, unknown>> | null} */ (await response.json());
    const text = catalog?.[language];
    if (text && typeof text === 'object' && !Array.isArray(text)) {
      return /** @type {PlaytestText} */ (text);
    }
    return null;
  } catch {
    return null;
  }
};
