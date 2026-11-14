import type { RecipeDef, Registry } from '@skelly/engine/content';
import { compareCodeUnits } from '@skelly/engine/packs';
import { foldText, matchesFind, queryWords } from './inventoryFind.ts';

export interface CraftCatalogueState {
  query: string;
  category: string;
  tags: string[];
  makeable: boolean;
  page: number;
  selected: string | undefined;
  categoryQuery: string;
  categoryPage: number;
  tagQuery: string;
  tagPage: number;
}
export const initialCraftCatalogue = (): CraftCatalogueState => ({
  query: '',
  category: '',
  tags: [],
  makeable: false,
  page: 0,
  selected: undefined,
  categoryQuery: '',
  categoryPage: 0,
  tagQuery: '',
  tagPage: 0,
});
export interface CatalogueEntry {
  id: string;
  name: string;
}
export interface CataloguePage<T> {
  entries: T[];
  page: number;
  total: number;
  first: number;
  last: number;
  previous: boolean;
  next: boolean;
}
export const cataloguePage = <T>(entries: readonly T[], requested: number, size: number): CataloguePage<T> => {
  const page = Math.max(0, Math.min(requested, Math.max(0, Math.ceil(entries.length / size) - 1)));
  const start = page * size;
  return {
    entries: entries.slice(start, start + size),
    page,
    total: entries.length,
    first: entries.length > 0 ? start + 1 : 0,
    last: Math.min(start + size, entries.length),
    previous: page > 0,
    next: start + size < entries.length,
  };
};
export const recipeCatalogueName = (registry: Registry, recipe: RecipeDef): string =>
  recipe.repair?.entity
    ? registry.furniture.get(recipe.repair.entity)!.name
    : registry.items.get(recipe.result.item)!.name;

export const categoryPath = (registry: Registry, id: string): string[] => {
  const path: string[] = [];
  for (let next: string | undefined = id; next; next = registry.recipeCategories.get(next)!.parent) {
    path.unshift(next);
  }
  return path;
};

/** Metadata narrowing precedes the caller's shared-planner feasibility check. */
export const craftCatalogue = (
  registry: Registry,
  known: ReadonlySet<string>,
  state: CraftCatalogueState,
  makeable: (recipe: RecipeDef) => boolean,
) => {
  const recipes = [...known]
    .map((id) => registry.recipes.get(id)!)
    .filter((recipe) => !(recipe.activation || recipe.repair?.entity));
  const categories = new Set(recipes.flatMap((recipe) => categoryPath(registry, recipe.category)));
  const tags = new Set(recipes.flatMap((recipe) => recipe.tags));
  const words = queryWords(state.query);
  const narrowed = recipes.filter(
    (recipe) =>
      (!state.category || categoryPath(registry, recipe.category).includes(state.category)) &&
      state.tags.every((tag) => recipe.tags.includes(tag)) &&
      matchesFind(words, [recipeCatalogueName(registry, recipe), ...recipe.searchTerms]),
  );
  const results = narrowed
    .filter((recipe) => !state.makeable || makeable(recipe))
    .map((recipe) => ({ id: recipe.id, name: recipeCatalogueName(registry, recipe) }));
  results.sort((a, b) => compareCodeUnits(foldText(a.name), foldText(b.name)) || compareCodeUnits(a.id, b.id));
  const categoryChoices = [...categories]
    .map((id) => ({
      id,
      name: categoryPath(registry, id)
        .map((part) => registry.recipeCategories.get(part)!.label)
        .join(' / '),
    }))
    .filter(({ name }) => matchesFind(queryWords(state.categoryQuery), [name]))
    .sort(
      (a, b) =>
        registry.recipeCategories.get(a.id)!.order - registry.recipeCategories.get(b.id)!.order ||
        compareCodeUnits(a.name, b.name),
    );
  const tagChoices = [...tags]
    .map((id) => ({ id, name: registry.recipeTags.get(id)!.label }))
    .filter(({ id, name }) =>
      matchesFind(queryWords(state.tagQuery), [name, ...registry.recipeTags.get(id)!.searchTerms]),
    )
    .sort((a, b) => compareCodeUnits(a.name, b.name));
  return { results, categories: categoryChoices, tags: tagChoices };
};
