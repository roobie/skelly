import type { Character } from './character.ts';
import { coreMessage } from './coreText.ts';
import type { Inventory } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import type { ReadingActionHooks } from './longAction.ts';

/**
 * Reading keeps the source book in ordinary inventory ownership throughout the action.
 * Light is checked on every step so a compressed read stops the moment the page goes dark.
 */
export const bookReadingHooks = (
  inventory: Inventory,
  character: Character,
  lightRefusal: () => string | undefined,
): ReadingActionHooks => {
  const book = (uid: number): Item | undefined => {
    const item = inventory.itemByUid(uid);
    return item && defOf(inventory.registry, item.type).book ? item : undefined;
  };
  return {
    owns: (uid) => book(uid) !== undefined,
    validate: (uid) => {
      const item = book(uid);
      if (!item) {
        return coreMessage(inventory.registry, 'bookGone');
      }
      const location = inventory.locate(item);
      return location?.kind === 'hand' ? lightRefusal() : coreMessage(inventory.registry, 'bookNotHeld');
    },
    duration: (uid) => {
      const item = book(uid);
      const definition = item && defOf(inventory.registry, item.type).book;
      return definition ? definition.readingGameMinutes : undefined;
    },
    finish: (uid) => {
      const item = book(uid);
      if (!item) {
        // The long action shows a failed effect's message to the player.
        throw new Error(coreMessage(inventory.registry, 'bookGone'));
      }
      const definition = defOf(inventory.registry, item.type).book!;
      character.learnRecipes(definition.recipes);
    },
  };
};
