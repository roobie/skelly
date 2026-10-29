import type { Registry } from '../core/content.ts';
import type { RecipeCategoryDef } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';
import { craftingText } from './craftReadout.ts';
import { matchesFind, queryWords } from './inventoryFind.ts';

export interface RecipeBrowserQuery {
  category: string | undefined;
  text: string;
  tags: readonly string[];
  selected: string | undefined;
}

interface BrowserRow {
  id: string;
  name: string;
  category: string;
  tags: string[];
}
interface CategoryNode {
  id: string;
  label: string;
  children: CategoryNode[];
}

const byLabel = (a: { id: string; label: string }, b: { id: string; label: string }): number =>
  a.label.localeCompare(b.label) || a.id.localeCompare(b.id);

const categoryPath = (registry: Registry, id: string): string[] => {
  const path: string[] = [];
  let category = registry.recipeCategories.get(id);
  while (category) {
    path.push(category.id);
    category = category.parent === undefined ? undefined : registry.recipeCategories.get(category.parent);
  }
  return path;
};

/** Meta navigation: classification cannot be read from world geometry. No admission or commands. */
export const recipeBrowser = (
  registry: Registry,
  knownRecipes: ReadonlySet<string>,
  query: Readonly<RecipeBrowserQuery>,
): {
  rows: BrowserRow[];
  categories: CategoryNode[];
  tags: { id: string; label: string; searchTerms: string[] }[];
  selected: string | undefined;
} => {
  const visible = [...registry.recipes.values()].filter((recipe) => knownRecipes.has(recipe.id) && !recipe.activation);
  const usedCategories = new Set(visible.flatMap((recipe) => categoryPath(registry, recipe.category)));
  const usedTags = new Set(visible.flatMap((recipe) => recipe.tags));
  const children = new Map<string | undefined, RecipeCategoryDef[]>();
  for (const category of registry.recipeCategories.values()) {
    if (usedCategories.has(category.id)) {
      const siblings = children.get(category.parent) ?? [];
      siblings.push(category);
      children.set(category.parent, siblings);
    }
  }
  const tree = (parent: string | undefined): CategoryNode[] =>
    (children.get(parent) ?? [])
      .sort((a, b) => a.order - b.order || byLabel(a, b))
      .map(({ id, label }) => ({ id, label, children: tree(id) }));
  const words = queryWords(query.text);
  const rows = visible.flatMap((recipe): BrowserRow[] => {
    if (query.category !== undefined && !categoryPath(registry, recipe.category).includes(query.category)) {
      return [];
    }
    if (!query.tags.every((id) => recipe.tags.includes(id))) {
      return [];
    }
    const itemName = recipe.repair?.entity
      ? registry.furniture.get(recipe.repair.entity)!.name
      : registry.items.get(recipe.result.item)!.name;
    const name = recipe.kind === 'repair' ? fillText(craftingText(registry).repairName, { item: itemName }) : itemName;
    if (!matchesFind(words, [name, ...recipe.searchTerms])) {
      return [];
    }
    return [{ id: recipe.id, name, category: recipe.category, tags: [...recipe.tags] }];
  });
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return {
    rows,
    categories: tree(undefined),
    tags: [...registry.recipeTags.values()]
      .filter(({ id }) => usedTags.has(id))
      .sort(byLabel)
      .map(({ id, label, searchTerms }) => ({ id, label, searchTerms: [...searchTerms] })),
    selected: rows.some(({ id }) => id === query.selected) ? query.selected : undefined,
  };
};
