local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local parts = import 'housing-slots.jsonnet';
// The spare fits the empty slot and the pocketed part fits none, so both checks start from the spawn; the casing and
// winding craft the core that is the spare for either module's failed core, the bat deals the final blow to the worn
// modules, and the screwdriver and the fixture's top skills meet the serviced module's core service.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'housingslotslook',
    site: 'testHouseHousingSlots',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    recipes+: [recipe.id for recipe in parts.recipes],
    kit+: [
      { id: 'bat', item: 'baseball_bat', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
      { id: 'spare', item: 'fixture_housing_spare', condition: 1, destination: { kind: 'hand', role: 'off' } },
      { id: 'odd', item: 'fixture_housing_odd_part', destination: { kind: 'pocket', parent: 'jeans', pocket: 0 } },
      {
        id: 'casing', item: 'fixture_plant_core_casing', condition: 1,
        destination: { kind: 'pocket', parent: 'jeans', pocket: 1 },
      },
      {
        id: 'winding', item: 'fixture_plant_core_winding', condition: 1,
        destination: { kind: 'pocket', parent: 'jeans', pocket: 3 },
      },
      { id: 'screwdriver', item: 'screwdriver', condition: 1, destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 } },
    ],
  }],
}
