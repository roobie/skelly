// The condition look's site: one street of houses drawn twice along the north pavement, the west
// half pristine with every aftermath tag at 0 and the east half run-down with every tag well up, so
// the two halves show how far aftermath odds move a street. The player stands on the far pavement
// at the seam. Why the odds exist: `packages/deadvox/docs/aftermath.md`, "Aftermath odds".
local tags = ['boarded', 'broken', 'dilapidated', 'messy'];
local odds(multiplier) = { [tag]: multiplier for tag in tags };
local street = ['gauntlet_city_2', 'gauntlet_city_villa', 'gauntlet_city_3'];
local half(x0, multiplier) = [
  { template: street[i], position: [x0 + 18 * i, 21, 0], rotation: 0, aftermathOdds: odds(multiplier) }
  for i in std.range(0, std.length(street) - 1)
];
{
  layouts: [{
    id: 'conditionLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -64, z0: -24, x1: 64, z1: 24 },
    ground: 21,
    terrain: [],
    tracks: [{ points: [[-60, -5], [60, -5]], width: 6, surface: 'asphalt' }],
    buildings: half(-57, 0) + half(3, 6),
    player: { position: [0, 21.5, -12], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
