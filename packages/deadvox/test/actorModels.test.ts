// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through this package's Vite and TypeScript aliases.
import { templateFigure } from '@mobgen/mob/humanoidFigure.ts';
import { TEMPLATES } from '@mobgen/mob/templates.ts';
import { describe, expect, it } from 'vitest';
import { bodyPlanModel, FIGURE_VARIANTS } from '../src/core/actorModels.ts';
import { validateContent } from '../src/core/content.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
// A seed every shipped humanoid template generates valid on the first try.
const FIXTURE_SEED = 1;

describe('actor models', () => {
  it('lets content select every ready mobgen zombie template the renderer draws', () => {
    const [row] = registry.actors.values();
    // The acid and the fused mass are built, not generated, so they join by their figure variants' models.
    const models = [
      ...TEMPLATES.filter((template) => (template.status ?? 'ready') === 'ready').map(({ name }) => name),
      FIGURE_VARIANTS.acid.model,
      FIGURE_VARIANTS['fused-mass'].model,
    ];
    const refused = models.filter((name) =>
      validateContent({
        source: 'body-plan.json',
        data: {
          actors: [
            {
              ...row,
              model: Object.values(FIGURE_VARIANTS).find((variant) => variant.model === name)?.bodyPlan,
              figure: Object.entries(FIGURE_VARIANTS).find(([, variant]) => variant.model === name)?.[0],
            },
          ],
        },
      }).some(({ path }) => path.endsWith('.model')),
    );
    expect(refused).toEqual([]);
  });

  it('realizes the simulation figure of every generated model content can select', () => {
    for (const [model, { bodyPlan }] of Object.entries(FIGURE_VARIANTS)) {
      if (bodyPlan === 'acid' || bodyPlan === 'fused-mass') {
        continue;
      }
      const realize = () => templateFigure(bodyPlanModel(model), FIXTURE_SEED);
      expect(realize, model).not.toThrow();
    }
  });
});
