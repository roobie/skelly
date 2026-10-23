local zombies = import '../../../src/content/base/zombies.jsonnet';
{
  id: 'browser-test-mod',
  items: [{
    id: 'mod_test_token',
    name: 'Mod token',
    category: 'misc',
    economy: { usage: [], tiers: [] },
    workInProgress: false,
    notLoot: false,
    weight: 0.1,
    size: [1, 1],
  }],
  zombies: [zombies.zombies[0] + { speed+: { chaseMetresPerSimSecond: 3.75 } }],
}
