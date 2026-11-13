local eats = (import 'tools/jsonnet/lib/food-use.libsonnet').eats;

// A rotting food spoils at its going-off fraction of life and poisons for its health cost.
(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  items: [
    {
      id: 'apple',
      name: 'Apple',
      category: 'food',
      model: 'apple',
      size: [1, 1],
      food: eats(95, 150) { rotsAfterGameHours: 240, goingOffFraction: 0.5, poisonHealth: 15 },
    },
  ],
})
