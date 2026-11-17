import { type RecipeDef, type Registry, repairTargetName } from '@skelly/engine/content';
import { compareCodeUnits } from '@skelly/engine/packs';
import { foldText, matchesFind, queryWords } from './inventoryFind.ts';

export interface CraftCatalogueState {
  query: string;
  category: string;
  tags: string[];
  makeable: boolean;
  allKnown: boolean;
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
  allKnown: false,
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
  repairTargetName(registry, recipe);

export const categoryPath = (registry: Registry, id: string): string[] => {
  const path: string[] = [];
  for (let next: string | undefined = id; next; next = registry.recipeCategories.get(next)!.parent) {
    path.unshift(next);
  }
  return path;
};

/**
 * Metadata narrowing precedes the caller's shared-planner feasibility check. An item repair recipe with no target
 * below its ceiling is hidden from the default list; a search reaches those hidden recipes. The all-known view
 * lists every known recipe, ignoring the category, tag, makeable and target filters; only the search applies.
 */
export const craftCatalogue = (
  registry: Registry,
  known: ReadonlySet<string>,
  state: CraftCatalogueState,
  { makeable, hasTarget }: { makeable: (recipe: RecipeDef) => boolean; hasTarget: (recipe: RecipeDef) => boolean },
) => {
  const searching = queryWords(state.query).length > 0;
  const all = state.allKnown;
  const recipes = [...known]
    .map((id) => registry.recipes.get(id)!)
    .filter((recipe) => all || !(recipe.activation || recipe.repair?.entity))
    .filter(
      (recipe) =>
        all || searching || recipe.kind !== 'repair' || recipe.repair?.block !== undefined || hasTarget(recipe),
    );
  const categories = new Set(recipes.flatMap((recipe) => categoryPath(registry, recipe.category)));
  const tags = new Set(recipes.flatMap((recipe) => recipe.tags));
  const words = queryWords(state.query);
  const narrowed = recipes.filter(
    (recipe) =>
      (all || !state.category || categoryPath(registry, recipe.category).includes(state.category)) &&
      (all || state.tags.every((tag) => recipe.tags.includes(tag))) &&
      matchesFind(words, [recipeCatalogueName(registry, recipe), ...recipe.searchTerms]),
  );
  const results = narrowed
    .filter((recipe) => all || !state.makeable || makeable(recipe))
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
