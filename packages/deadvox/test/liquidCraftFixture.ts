export const STOCK = 'fixture_stock';
export const OTHER = 'fixture_other';
export const RESULT = 'fixture_result';
export const BURN_RESULT = 'fixture_burn_result';
export const VESSEL = 'fixture_vessel';
export const FULL = 'fixture_full';
export const RECIPE = 'fixture_craft';
export const SOLID_RECIPE = 'fixture_solid_craft';
export const QUALITY = 'fixture_quality';
export const liquidCraftData = () => ({
  liquids: [
    { id: STOCK, name: 'Fixture liquid', densityGramsPerMillilitre: 1 },
    { id: OTHER, name: 'Other liquid', densityGramsPerMillilitre: 1 },
  ],
  items: [
    { id: STOCK, name: 'Fixture solid', category: 'material', weight: 1, size: [1, 1], stack: 20 },
    { id: RESULT, name: 'Fixture result', category: 'material', weight: 1, size: [1, 1], stack: 20 },
    {
      id: BURN_RESULT,
      name: 'Fixture burn result',
      category: 'tool',
      weight: 1,
      size: [1, 1],
      stack: 20,
      light: { radius: 1, seenFrom: 1, color: '#ffffff', intensity: 1, burnTimeGameHours: 1 },
    },
    {
      id: VESSEL,
      name: 'Fixture vessel',
      category: 'tool',
      weight: 1,
      size: [1, 1],
      tool: { qualities: { [QUALITY]: 1 } },
      vessel: { capacityMicrolitres: 1000, accepts: [STOCK, OTHER], initialContents: { kind: 'empty' } },
    },
    {
      id: FULL,
      name: 'Fixture full vessel',
      category: 'tool',
      weight: 1,
      size: [1, 1],
      vessel: {
        capacityMicrolitres: 1000,
        accepts: [STOCK],
        initialContents: { kind: 'filled', liquid: STOCK, volumeMicrolitres: 1000 },
      },
    },
  ],
  recipes: [
    {
      id: RECIPE,
      result: { item: RESULT, count: 2 },
      timeGameMinutes: 1,
      skills: {},
      qualities: {},
      components: [[{ liquid: STOCK, volumeMicrolitres: 20 }], [{ item: STOCK, count: 1 }]],
    },
    {
      id: SOLID_RECIPE,
      result: { item: RESULT, count: 2 },
      timeGameMinutes: 1,
      skills: {},
      qualities: {},
      components: [[{ item: STOCK, count: 1 }]],
    },
  ],
});
