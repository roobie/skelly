local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local magic = import 'magic-grants.libsonnet';
local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// The low and high missile looks differ only by the spell's level, so a volley at each level meets the same targets.
// Each look names its own site and wall because two packs may not set one entry.
//
// Two brutes stand in the open, since they outlast a volley; a shambler stands hidden behind a wall taller than it,
// so a missile cast at it strikes the wall.
local course = ['b', 'b', 'b', 'b', 'b', 'b', 'b', 'b'];
local wall = {
  lootContext: { usage: ['Residential'], tier: 'Tier1' },
  size: [1, 6, 8],
  palette: { b: 'brick' },
  layers: [course, course, course, course, course, course],
};
local player = { position: [2, 21, 12], bearing: 90 };
{
  dependencies: kit.dependencies([
    'skelly.deadvox.actors', 'skelly.deadvox.scenario.test-house', 'skelly.deadvox.scenario.with-magic',
    'skelly.manufactured-blocks',
  ]),
  ranged: [
    { type: 'brute_shambler', position: [12, 21, 9], chance: 1 },
    { type: 'brute_shambler', position: [12, 21, 12], chance: 1 },
    { type: 'shambler', position: [14, 21, 16], chance: 1 },
  ],
  // A brute about a metre ahead of the player, nearer than a missile flies in one actor step, so a missile can strike
  // it in the step it launches.
  pointBlank: [{ type: 'brute_shambler', position: [3, 21, 12], chance: 1 }],
  look(name, level, targets=self.ranged):: {
    local site = 'testHouseMissile' + name + 'Look',
    local wallId = 'test_house_missile_wall_' + std.asciiLower(name),
    templates: [wall + { id: wallId }],
    layouts: [layout + {
      id: site,
      buildings+: [{ template: wallId, position: [12, 20.5, 14], rotation: 0 }],
      actors: targets,
      // An empty slot row lets the bearing apply, so the look opens facing the brutes.
      showroom: layout.showroom + { slots: [] },
      player: player,
    }],
    starts: [kit.fixture + {
      local grants = magic.grants(level),
      id: 'missile' + std.asciiLower(name) + 'look',
      site: site,
      startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
      kit+: grants.kit,
      abilities: grants.abilities,
      pools: grants.pools,
    }],
  },
  levels: magic.missileLevels,
}
