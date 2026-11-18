// Fixture parts and housings, so the check exercises slot rules rather than any production assembly's content.
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local itemPolicy = import 'tools/jsonnet/lib/item-policy.libsonnet';
local part(id, name) = { id: id, name: name, category: 'material', size: [1, 1], weight: 200 };
breach.breaking(itemPolicy.itemPack({
  items: [
    part('fixture_housing_part', 'Housed part'),
    part('fixture_housing_spare', 'Spare housed part'),
    part('fixture_housing_odd_part', 'Unfitting part'),
  ],
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
  }],
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
  ],
}))
