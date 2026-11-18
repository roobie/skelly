/** @typedef {'sv' | 'en'} PlaytestLanguage */

/**
 * @param {readonly string[]} languages
 * @param {string} search
 * @returns {PlaytestLanguage}
 */
const choosePlaytestLanguage = (languages, search) => {
  const override = new URLSearchParams(search).get('lang');
  if (override === 'sv' || override === 'en') {
    return override;
  }

  /** @param {string} prefix */
  const firstTagIndex = (prefix) => languages.findIndex((tag) => new RegExp(`^${prefix}(?:-|$)`, 'i').test(tag));
  const swedishIndex = firstTagIndex('sv');
  const englishIndex = firstTagIndex('en');
  return swedishIndex >= 0 && (englishIndex < 0 || swedishIndex < englishIndex) ? 'sv' : 'en';
};

/**
 * @param {readonly string[]} languages
 * @param {string} search
 * @returns {PlaytestLanguage}
 */
export const applyPlaytestLanguage = (languages, search) => choosePlaytestLanguage(languages, search);
