// The product's loot distribution policy; a theme pack's tables carry only what they drop.
{
  lootPolicy: [
    {
      id: 'deadvox_loot',
      capability: 'magazines',
      // A dropped magazine's load as shares of its capacity: an even chance of every count from empty to full.
      magazineLoad: [0, 1],
    },
  ],
}
