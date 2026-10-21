// Eating takes longer than drinking; a rotting food spoils at its going-off fraction of life and poisons for its health cost.
local eats(calories, water) = { calories: calories, water: water, consumeSimSeconds: 3 };
local drinks(calories, water) = { calories: calories, water: water, consumeSimSeconds: 2 };
local canShellGrams = 100;
local beansGrams = 350;
local soupGrams = 330;

{
  items: [
    {
      id: 'opened_beans', name: 'Opened can of beans', category: 'food',
      model: 'opened_beans', weight: canShellGrams, size: [1, 2], serving: { food: 'beans', empty: 'empty_can' },
    },
    {
      id: 'opened_soup', name: 'Opened can of soup', category: 'food',
      model: 'opened_soup', weight: canShellGrams, size: [1, 2], serving: { food: 'soup', empty: 'empty_can' },
    },
    {
      id: 'empty_can', name: 'Empty can', category: 'tool',
      model: 'empty_can', weight: canShellGrams, size: [1, 2],
    },
    {
      id: 'canned_beans',
      name: 'Can of beans',
      category: 'food',
      model: 'canned_beans',
      weight: canShellGrams + beansGrams,
      size: [1, 2],
      description: 'Dented but sealed.',
      unpack: { item: 'opened_beans', count: 1, simSeconds: 15, qualities: { opening: 1 }, inPlace: true },
    },
    {
      id: 'beans',
      name: 'Beans',
      category: 'food',
      weight: beansGrams,
      size: [1, 2],
      food: eats(350, 100),
    },
    {
      id: 'canned_soup',
      name: 'Can of soup',
      category: 'food',
      model: 'canned_soup',
      weight: canShellGrams + soupGrams,
      size: [1, 2],
      unpack: { item: 'opened_soup', count: 1, simSeconds: 15, qualities: { opening: 1 }, inPlace: true },
    },
    {
      id: 'soup',
      name: 'Soup',
      category: 'food',
      weight: soupGrams,
      size: [1, 2],
      food: eats(200, 250),
    },
    {
      id: 'crackers',
      name: 'Box of crackers',
      category: 'food',
      model: 'crackers',
      size: [2, 2],
      food: eats(1100, 0),
    },
    {
      id: 'apple',
      name: 'Apple',
      category: 'food',
      weight: 180,
      size: [1, 1],
      food: eats(95, 150) { rotsAfterGameHours: 240, goingOffFraction: 0.5, poisonHealth: 15 },
    },
    {
      id: 'chocolate_bar',
      name: 'Chocolate bar',
      category: 'food',
      model: 'chocolate_bar',
      size: [2, 1],
      food: eats(530, 0),
    },
    {
      id: 'soda_can',
      name: 'Can of soda',
      category: 'drink',
      model: 'soda_can',
      size: [1, 2],
      food: drinks(140, 300),
    },
    {
      id: 'water_bottle',
      name: 'Bottle of water',
      category: 'drink',
      model: 'water_bottle',
      size: [1, 3],
      food: drinks(0, 1000),
    },
    {
      id: 'juice_carton',
      name: 'Carton of juice',
      category: 'drink',
      model: 'juice_carton',
      size: [1, 3],
      food: drinks(450, 900),
    },
  ],
}
