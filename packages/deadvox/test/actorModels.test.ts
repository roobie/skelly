// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through this package's Vite and TypeScript aliases.
import { acidTemplate } from '@mobgen/mob/acidTemplate.ts';
import { fusedMassTemplate } from '@mobgen/mob/fusedMassTemplate.ts';
import { templateFigure } from '@mobgen/mob/humanoidFigure.ts';
import { TEMPLATES } from '@mobgen/mob/templates.ts';
import { describe, expect, it } from 'vitest';
import { bodyPlanModel, FIGURE_VARIANTS } from '../src/core/actorModels.ts';
import { validateContent } from '../src/core/content.ts';
import { FUSED_MASS_FIGURE_SEED, fusedMassFigureForType, fusedMassTypeOf } from '../src/core/fusedMassFigure.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
// A seed every shipped humanoid template generates valid on the first try.
const FIXTURE_SEED = 1;

describe('actor models', () => {
  it('lets content select every ready mobgen zombie template the renderer draws', () => {
    const [row] = registry.actors.values();
    const refused = [...TEMPLATES, acidTemplate, fusedMassTemplate]
      .filter((template) => (template.status ?? 'ready') === 'ready')
      .filter((template) =>
        validateContent({
          source: 'body-plan.json',
          data: {
            actors: [
              {
                ...row,
                model: Object.values(FIGURE_VARIANTS).find((variant) => variant.model === template.name)?.bodyPlan,
                figure: Object.entries(FIGURE_VARIANTS).find(([, variant]) => variant.model === template.name)?.[0],
              },
            ],
          },
        }).some(({ path }) => path.endsWith('.model')),
      )
      .map(({ name }) => name);
    expect(refused).toEqual([]);
  });

  it('realizes the simulation figure of every model content can select', () => {
    const amalgam = fusedMassTypeOf(registry.actors)!;
    for (const model of Object.keys(FIGURE_VARIANTS)) {
      const realize = () =>
        model === 'fused-mass'
          ? fusedMassFigureForType(amalgam, FUSED_MASS_FIGURE_SEED)
          : templateFigure(bodyPlanModel(model), FIXTURE_SEED);
      expect(realize, model).not.toThrow();
    }
  });
});
