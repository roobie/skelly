local day = (import 'packages/mods/skelly.day-cycle/dayCycle.json').dayCycle;
// Importing this kit gives a start mod no runtime dependency, so its manifest declares these owners itself; listing
// them beside the kit keeps every start's dependencies in step with what the kit hands over.
local owners = [
  'skelly.basic-recipes', 'skelly.hand-tools', 'skelly.light-sources', 'skelly.medicine', 'skelly.melee',
  'skelly.packaged-foods', 'skelly.wearables',
];
local common = {
  seed: 1,
  storeys: 1,
  density: null,
  startTimeGameTimeOfDay: day.defaultStartGameTimeOfDay,
  kit: [
    { id: 'jeans', item: 'jeans', count: 1, condition: 0.7, destination: { kind: 'worn' } },
    { id: 'sneakers', item: 'sneakers', count: 1, condition: 0.8, destination: { kind: 'worn' } },
    { id: 'hoodie', item: 'hoodie', count: 1, condition: 0.8, destination: { kind: 'worn' } },
    { id: 'beans', item: 'canned_beans', destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 } },
    { id: 'matches', item: 'matches', destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 } },
    { id: 'bandages', item: 'bandage', count: 2, destination: { kind: 'pocket', parent: 'jeans', pocket: 2 } },
  ],
  wounds: [],
  skills: {},
  recipes: ['torch', 'candle', 'repair_kit', 'repair_crowbar', 'sawn_plank', 'door_bar', 'make_rope'] + [
    recipe.id
    for recipe in (import 'packages/mods/skelly.basic-recipes/basic-recipes-items.jsonnet').recipes
                  + (import 'packages/mods/skelly.melee/melee-items.jsonnet').recipes
    if std.objectHas(recipe, 'activation') && recipe.activation == 'sharpen'
  ],
  defaultForSite: true,
};
// Debug-only with every skill at the top level; see `docs/PROCESS.md`, "Reviews by eye and by play".
local look = { debugOnly: true, allSkills: 10 };
{
  day: day,
  common: common,
  // Every debug, review and test fixture start builds on this.
  fixture: common + look,
  // Turns a scenario's own start row into a fixture, so the look keeps its placement.
  look: look,
  // A fixture beside another start's site leaves that start the site's default and is reached only as a start mod.
  notSiteDefault: { defaultForSite:: true },
  // A start mod's manifest dependencies: its own packs plus the owners of every item and recipe the kit hands over.
  dependencies(packs):: std.set(packs + owners),
  fromLayouts(layouts):: [common + {
    id: std.asciiLower(layout.id),
    site: layout.id,
  } + (if std.objectHas(layout, 'startTimeGameTimeOfDay') then {
    startTimeGameTimeOfDay: layout.startTimeGameTimeOfDay,
  } else {}) for layout in layouts],
}
