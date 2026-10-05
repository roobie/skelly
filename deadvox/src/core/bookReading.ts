import type { Character } from './character.ts';
import type { Inventory } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import type { ReadingActionHooks } from './longAction.ts';

/** Reading keeps the source book in ordinary inventory ownership throughout the action. */
export const bookReadingHooks = (inventory: Inventory, character: Character): ReadingActionHooks => {
  const book = (uid: number): Item | undefined => {
    const item = inventory.itemByUid(uid);
    return item && defOf(inventory.registry, item.type).book ? item : undefined;
  };
  return {
    owns: (uid) => book(uid) !== undefined,
    validate: (uid) => {
      const item = book(uid);
      if (!item) {
        return 'The book is missing';
      }
      const location = inventory.locate(item);
      return location?.kind === 'hand' ? undefined : 'Keep the book in your hands';
    },
    duration: (uid) => {
      const item = book(uid);
      const definition = item && defOf(inventory.registry, item.type).book;
      return definition ? definition.readingTime * 60 : undefined;
    },
    finish: (uid) => {
      const item = book(uid);
      if (!item) {
        throw new Error('The book is missing');
      }
      const definition = defOf(inventory.registry, item.type).book!;
      character.learnRecipes(definition.recipes);
    },
  };
};
