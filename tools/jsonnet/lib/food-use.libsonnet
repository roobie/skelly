// Eating takes longer than drinking. Shared so each food mod authors the same use times.
{
  eats(calories, water):: { calories: calories, water: water, consumeSimSeconds: 3 },
  drinks(calories, water):: { calories: calories, water: water, consumeSimSeconds: 2 },
}
