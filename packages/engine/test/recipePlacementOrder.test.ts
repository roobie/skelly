import { describe, expect, it } from 'vitest';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';

/** A minimal recipe row; a `result` without `item` is a placement recipe. */
const recipe = (id: string, result: object, placementReviewOrder?: string): object => ({
  id,
  category: 'fixture_category',
  tags: [],
  searchTerms: [],
  result: { ...result, count: 1 },
  ...(placementReviewOrder === undefined ? {} : { placementReviewOrder }),
  timeGameMinutes: 1,
  skills: {},
  qualities: {},
  components: [[{ item: 'fixture_plank', count: 1 }]],
});

const sources = (rows: object[]): ContentSource[] => [
  {
    source: 'fixture-rows.json',
    data: {
      items: [
        {
          id: 'fixture_plank',
          name: 'Fixture plank',
          category: 'material',
          size: [1, 1],
          weight: 1,
          workInProgress: false,
        },
      ],
      boardings: [
        {
          id: 'fixture_boarding',
          name: 'Fixture boarding',
          fits: 'door',
          color: '#a08060',
          thicknessBlocks: 0.125,
          boards: [{ from: 0, height: 1 }],
        },
      ],
      recipeCategories: [{ id: 'fixture_category', label: 'Fixture', order: 0 }],
    },
  },
  { source: 'fixture-recipes.json', data: { recipes: rows } },
];

const orderIssues = (rows: object[]) => {
  const { issues } = buildRegistry(sources(rows));
  return issues.filter(({ message }) => message.includes('placementReviewOrder'));
};

describe('placement review order validation', () => {
  it('accepts a placement recipe that names its order', () => {
    const { issues, registry } = buildRegistry(
      sources([recipe('fixture_board_row', { boarding: 'fixture_boarding' }, 'review-first')]),
    );
    expect(issues).toEqual([]);
    expect(registry.recipes.get('fixture_board_row')?.placementReviewOrder).toBe('review-first');
  });

  it('refuses a placement recipe missing the field', () => {
    expect(orderIssues([recipe('fixture_board_row', { boarding: 'fixture_boarding' })])).toEqual([
      { source: 'fixture-recipes.json', path: 'recipes[0]', message: expect.stringContaining('placementReviewOrder') },
    ]);
  });

  it('refuses an item recipe that carries the field', () => {
    expect(orderIssues([recipe('fixture_plank_row', { item: 'fixture_plank' }, 'spot-first')])).toEqual([
      { source: 'fixture-recipes.json', path: 'recipes[0]', message: expect.stringContaining('placementReviewOrder') },
    ]);
  });
});
