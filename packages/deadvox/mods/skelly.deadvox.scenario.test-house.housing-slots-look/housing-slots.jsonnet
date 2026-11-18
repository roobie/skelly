// Fixture parts and housings, so the check exercises slot rules rather than any production assembly's content.
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local itemPolicy = import 'tools/jsonnet/lib/item-policy.libsonnet';
local part(id, name) = { id: id, name: name, category: 'material', size: [1, 1], weight: 200 };
// Two plant modules on one bus, alike but for the core each starts with: the failed one has none, its authored
// critical failure, and the working one's seeded core stays above the minimum.
local module(id, name, core, critical) = {
  blueprint: {
    id: id,
    slots: [{ id: 'core', accepts: ['fixture_plant_core'] } + (if core then {
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
local modules = [
  module('fixture_plant_failed_module', 'Failed plant module', false, true),
  module('fixture_plant_working_module', 'Working plant module', true, false),
];
breach.breaking(itemPolicy.itemPack({
  items: [
    part('fixture_housing_part', 'Housed part'),
    part('fixture_housing_spare', 'Spare housed part'),
    part('fixture_housing_odd_part', 'Unfitting part'),
    part('fixture_plant_core', 'Module core'),
  ],
  // Either module alone covers an ordinary lamp, so the lamp shows which modules produce.
  powerDevices: [{ id: 'fixture_plant_module', kind: 'inexhaustible', priority: 0, outputWatts: 100 }],
  partBlueprints: [{
    id: 'fixture_housing',
    slots: [
      {
        id: 'first',
        accepts: ['fixture_housing_part', 'fixture_housing_spare'],
        initial: { item: 'fixture_housing_part', condition: [0.3, 0.9] },
      },
      { id: 'second', accepts: ['fixture_housing_part'], initial: { item: 'fixture_housing_part', condition: [0.3, 0.9] } },
      // Starts empty, so the spare has somewhere to fit without first removing a part.
      { id: 'open', accepts: ['fixture_housing_part', 'fixture_housing_spare'] },
    ],
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
  ] + [entry.furniture for entry in modules],
}))
