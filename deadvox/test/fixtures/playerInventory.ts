import { readFileSync } from 'node:fs';
import type { ContentSource } from '../../src/core/content.ts';

/** The core player inventory row, which every registry needs for the reach rule; taken from base content so no test restates its values. */
export const playerInventorySource = (): ContentSource => ({
  source: 'player-inventory-fixture.json',
  data: JSON.parse(readFileSync('src/content/base/inventory.json', 'utf8')) as unknown,
});
