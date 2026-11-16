import { expect, it } from 'vitest';
import construction from '../../mods/skelly.basic-recipes/basic-recipes-construction.json' with { type: 'json' };
import { baseRegistry } from './baseRegistry.ts';

it('starts know the authored timber construction and repair recipes without reading a book', () => {
  const registry = baseRegistry();
  const starts = [...registry.starts.values()];
  expect(starts.length).toBeGreaterThan(0);
  expect(construction.recipes.length).toBeGreaterThan(0);
  for (const recipe of construction.recipes) {
    expect(registry.recipes.has(recipe.id)).toBe(true);
    for (const start of starts) {
      expect(start.recipes, `${start.id} knows ${recipe.id}`).toContain(recipe.id);
    }
  }
});
