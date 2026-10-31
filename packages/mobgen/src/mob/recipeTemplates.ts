import { checkRecipe } from '../core/recipe.ts';
import { registerTemplate, type Template, templateByName } from '../core/template.ts';
// Side effect: registers the recipe operators the content's steps name.
import './recipeOps.ts';
// Side effect: registers the base templates recipes build on.
import './templates.ts';
import data from './recipeTemplates.json' with { type: 'json' };

/** `base` names the template whose body plan, params and rig the recipe builds on. */
type RecipeContent = Pick<Template, 'name' | 'description' | 'materials' | 'recipe' | 'status'> &
  Required<Pick<Template, 'base'>>;

const recipeTemplate = (content: RecipeContent): Template => {
  const baseTemplate = templateByName(content.base);
  const template: Template = {
    ...baseTemplate,
    ...content,
    materials: { ...baseTemplate.materials, ...content.materials },
  };
  // Fails at import time when a step names an unknown op, misses a param or a material.
  checkRecipe(template);
  return template;
};

export const RECIPE_TEMPLATES: readonly Template[] = (data as unknown as readonly RecipeContent[]).map(recipeTemplate);
for (const template of RECIPE_TEMPLATES) {
  registerTemplate(template);
}
