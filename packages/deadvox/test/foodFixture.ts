import type { ItemDef, Registry } from '../src/core/content.ts';
import { gameSeconds, simSeconds } from '../src/core/time.ts';

export const fixtureFood: ItemDef = {
  id: 'fixture_food',
  name: 'Fixture food',
  category: 'food',
  weight: 1,
  size: [1, 1],
  stack: 10,
  workInProgress: false,
  notLoot: false,
  economy: { usage: [], tiers: [] },
  food: {
    calories: 10,
    water: 2,
    consumeSimSeconds: simSeconds(1),
    rotsAfterGameHours: gameSeconds(20),
    goingOffFraction: 0.5,
    poisonHealth: 3,
  },
};

export const foodFixtureRegistry = (base: Registry): Registry => ({
  ...base,
  items: new Map(base.items)
    .set(fixtureFood.id, fixtureFood)
    .set('fixture_wrapped', {
      ...fixtureFood,
      id: 'fixture_wrapped',
      unpack: { item: fixtureFood.id, count: 2, simSeconds: simSeconds(1), qualities: {} },
    })
    .set('fixture_keeps', {
      ...fixtureFood,
      id: 'fixture_keeps',
      food: { calories: 2, water: 1, consumeSimSeconds: simSeconds(1) },
    })
    .set('fixture_sealed', {
      ...fixtureFood,
      id: 'fixture_sealed',
      food: undefined,
      unpack: { item: 'fixture_full', count: 1, simSeconds: simSeconds(1), qualities: {}, inPlace: true },
    })
    .set('fixture_empty', { ...fixtureFood, id: 'fixture_empty', food: undefined })
    .set('fixture_full', {
      ...fixtureFood,
      id: 'fixture_full',
      food: undefined,
      serving: { food: fixtureFood.id, empty: 'fixture_empty' },
    }),
});
