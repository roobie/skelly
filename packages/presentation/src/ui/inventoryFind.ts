// Free-text find on the inventory screen: which items a typed query matches.

/** Lower case with accents stripped, so "Café" and "cafe" meet. */
export const foldText = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The folded words of a query; none means no filter. */
const WHITESPACE = /\s+/u;
export const queryWords = (query: string): readonly string[] => foldText(query).split(WHITESPACE).filter(Boolean);

/**
 * Whether every query word is part of some searchable text (an item's names and keywords).
 * An empty query matches everything.
 */
export const matchesFind = (words: readonly string[], texts: readonly string[]): boolean => {
  const folded = texts.map(foldText);
  return words.every((word) => folded.some((text) => text.includes(word)));
};
