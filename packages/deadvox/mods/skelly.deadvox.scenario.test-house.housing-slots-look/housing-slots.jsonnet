// Fixture parts and housings, so the check exercises slot rules rather than any production assembly's content.
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local itemPolicy = import 'tools/jsonnet/lib/item-policy.libsonnet';
local part(id, name) = { id: id, name: name, category: 'material', size: [1, 1], weight: 200 };
// A slot whose remove and fit are instant, needing no tool or skill.
local instant = { service: { timeGameMinutes: 0 } };
// Two plant modules on one bus, alike but for the core each starts with: the failed one has none, its authored
// critical failure, and the working one's seeded core stays above the minimum.
local module(id, name, core, critical) = {
  blueprint: {
    id: id,
    slots: [{ id: 'core', name: 'Core socket', accepts: ['fixture_plant_core'] } + instant + (if core then {
      initial: { item: 'fixture_plant_core', condition: [0.8, 1] },
    } else {})],
  },
  furniture: {
    id: id, name: name, size: [2, 2, 2], color: '#5d6b73', material: 'steel',
    takeApart: { parts: id },
    power: {
      device: 'fixture_plant_module', fuelLitres: 0, enabled: true,
      requires: [{ slot: 'core', parts: ['fixture_plant_core'], minimum: 0.5 } + (if critical then {
        critical: true,
      } else {})],
    },
  },
};
// Healthy parts in housings the layout stands worn: tall enough to strike above the kerbs that block one of them,
// and switched off, so the failed-versus-working check reads the lamp as before. The frame fills a whole pile, so a
// ruin needs a floor cell beside the footprint for the core.
local ruinModule(id, name) = module(id, name, true, false) + {
  blueprint+: {
    slots+: [{
      id: 'frame', name: 'Frame seat', accepts: ['fixture_plant_frame'], initial: { item: 'fixture_plant_frame', condition: [0.8, 1] },
    } + instant],
  },
  furniture+: { size: [1, 2, 1], power+: { enabled: false } },
};
// Restored by service: the seed fails one of its two critical cores, each a timed job needing a tool and a skill the
// kit covers; the cover is an instant job that nothing requires, so serving it never stops the module.
local cores = [{ id: 'core_left', name: 'Left core socket' }, { id: 'core_right', name: 'Right core socket' }];
local serviceModule = module('fixture_plant_service_module', 'Serviced plant module', true, true) + {
  blueprint+: {
    slots: [core {
      accepts: ['fixture_plant_core'],
      initial: { item: 'fixture_plant_core', condition: [0.8, 1] },
      service: { timeGameMinutes: 20, qualities: { screwing: 1 }, skills: { crafting: 1 } },
    } for core in cores] + [{
      id: 'cover', name: 'Cover seat', accepts: ['fixture_plant_cover'], initial: { item: 'fixture_plant_cover', condition: [0.8, 1] },
    } + instant],
    failure: { among: [core.id for core in cores] },
  },
  furniture+: {
    power+: {
      requires: [{ slot: core.id, parts: ['fixture_plant_core'], minimum: 0.5, critical: true } for core in cores],
    },
  },
};
local modules = [
  module('fixture_plant_failed_module', 'Failed plant module', false, true),
  module('fixture_plant_working_module', 'Working plant module', true, false),
  ruinModule('fixture_plant_open_ruin_module', 'Open damaged module'),
  ruinModule('fixture_plant_blocked_ruin_module', 'Blocked damaged module'),
  serviceModule,
];
breach.breaking(itemPolicy.itemPack({
  items: [
    part('fixture_housing_part', 'Housed part'),
    part('fixture_housing_spare', 'Spare housed part'),
    part('fixture_housing_odd_part', 'Unfitting part'),
    part('fixture_plant_core', 'Module core'),
    part('fixture_plant_core_casing', 'Core casing'),
    part('fixture_plant_core_winding', 'Core winding'),
    part('fixture_plant_frame', 'Module frame') + { size: [12, 6] },
    part('fixture_plant_cover', 'Module cover'),
  ],
  // The spare core is crafted rather than handed over, so restoring a module obtains its spare through crafting.
  recipeCategories: [{ id: 'fixture_plant_parts', label: 'Fixture plant parts', order: 0 }],
  recipes: [{
    id: 'fixture_plant_core', category: 'fixture_plant_parts', tags: [], searchTerms: [],
    result: { item: 'fixture_plant_core', count: 1 },
    timeGameMinutes: 5, skills: {}, qualities: {},
    components: [[{ item: 'fixture_plant_core_casing', count: 1 }], [{ item: 'fixture_plant_core_winding', count: 1 }]],
  }],
  // Either module alone covers an ordinary lamp, so the lamp shows which modules produce.
  powerDevices: [{ id: 'fixture_plant_module', kind: 'inexhaustible', priority: 0, outputWatts: 100 }],
  partBlueprints: [{
    id: 'fixture_housing',
    slots: [slot + instant for slot in [
      {
        id: 'first',
        name: 'First socket',
        accepts: ['fixture_housing_part', 'fixture_housing_spare'],
        initial: { item: 'fixture_housing_part', condition: [0.3, 0.9] },
      },
      {
        id: 'second',
        name: 'Second socket',
        accepts: ['fixture_housing_part'],
        initial: { item: 'fixture_housing_part', condition: [0.3, 0.9] },
      },
      // Starts empty, so the spare has somewhere to fit without first removing a part.
      { id: 'open', name: 'Open socket', accepts: ['fixture_housing_part', 'fixture_housing_spare'] },
    ]],
  }] + [entry.blueprint for entry in modules],
  furniture: [
    {
      id: 'fixture_housing', name: 'Fixture housing', size: [2, 2, 2], color: '#6f7a80', material: 'steel',
      takeApart: { parts: 'fixture_housing' },
    },
    // One cell, so its single stocked item leaves no room for a removed part.
    {
      id: 'fixture_full_bin', name: 'Full bin', size: [1, 1, 1], color: '#8a6a4a', material: 'steel',
      container: { pockets: [{ grid: [1, 1], handlingSimSeconds: 1.0 }] },
    },
    // Kerbs fill every floor cell beside the blocked module, so its core has nowhere to land beside the frame.
    { id: 'fixture_ruin_kerb', name: 'Kerb block', size: [1, 1, 1], color: '#7a7a72', material: 'steel' },
  ] + [entry.furniture for entry in modules],
}))
