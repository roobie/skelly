import { describe, expect, it } from 'vitest';
import { FIGURE_VARIANTS } from '../src/core/actorModels.ts';
import { validateContent } from '../src/core/content.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();

describe('actor models', () => {
  it('lets content select every figure variant the renderer draws', () => {
    const [row] = registry.actors.values();
    const refused = Object.entries(FIGURE_VARIANTS).filter(
      ([figure, { bodyPlan }]) =>
        validateContent({
          source: 'body-plan.json',
          data: { actors: [{ ...row, model: bodyPlan, figure }] },
        }).some(({ path }) => path.endsWith('.model')),
    );
    expect(refused).toEqual([]);
  });
});
