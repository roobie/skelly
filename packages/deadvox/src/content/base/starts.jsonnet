local day = (import 'dayCycle.json').dayCycle;
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
    recipe.id for recipe in (import 'recipes.libsonnet').recipes
    if std.objectHas(recipe, 'activation') && recipe.activation == 'sharpen'
  ],
  defaultForSite: true,
};
local layouts = std.flattenArrays([
  (import 'layouts.json').layouts,
  (import 'layouts-test-house.jsonnet').layouts,
  (import 'layouts-playtest.json').layouts,
  (import 'layouts-cabins.jsonnet').layouts,
  (import 'layouts-stairs.jsonnet').layouts,
  (import 'layouts-voice-size.jsonnet').layouts,
  (import 'layouts-water.jsonnet').layouts,
  (import 'tutorial.jsonnet').layouts,
  (import 'locks.jsonnet').layouts,
  (import 'hunting-cabins.json').layouts,
  (import 'crisis-hq.jsonnet').layouts,
  (import 'rural-medical.jsonnet').layouts,
  (import 'rural-police.jsonnet').layouts,
  (import 'rural-substation.jsonnet').layouts,
]);
local normalStarts = [common + {
  id: std.asciiLower(layout.id),
  site: layout.id,
} + (if std.objectHas(layout, 'startTimeGameTimeOfDay') then {
  startTimeGameTimeOfDay: layout.startTimeGameTimeOfDay,
} else {}) for layout in layouts] + [
  common + { id: 'gauntlet', site: 'gauntlet' },
  common + { id: 'city', site: 'city' },
  common + { id: 'forest', site: 'forest' },
  common + { id: 'weatheringtest', site: 'weatheringTest', debugOnly: true, startTimeGameTimeOfDay: day.noonGameTimeOfDay },
];
local pistolMagazine = import 'gungen/magazine_pistol_9.model.json';
local pistolItems = (import 'items-pistol.jsonnet').items;
local round = std.filter(function(item) item.id == 'cartridge_9x19', pistolItems)[0];
local pistolKit = [
  { id: 'backpack', item: 'hiking_backpack', destination: { kind: 'worn' } },
  { id: 'pistol', item: 'pistol_service', destination: { kind: 'hand', role: 'dominant' } },
  {
    id: 'magazine', item: 'magazine_pistol_9',
    cartridges: std.repeat([round.id], pistolMagazine.gun.capacity),
    destination: { kind: 'slot', parent: 'pistol', slot: 'magazine' },
  },
  { id: 'rounds', item: round.id, count: round.stack, destination: { kind: 'pocket', parent: 'backpack', pocket: 0 } },
];
{
  starts: normalStarts + [
    { [key]: start[key] for key in std.objectFields(start) if key != 'defaultForSite' } + {
      id: start.id + '_debug_pistol',
      debugOnly: true,
      kit: start.kit + pistolKit,
    }
    for start in normalStarts
  ],
}
