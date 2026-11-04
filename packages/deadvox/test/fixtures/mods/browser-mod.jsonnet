local zombies = import '../../../mods/skelly.deadvox.residual/enemies.jsonnet';
{
  id: 'browser-test-mod',
  version: '1',
  tier: 'product',
  product: false,
  dependencies: ['skelly.deadvox.residual'],
  overrides: [{ pack: 'skelly.deadvox.residual', entry: 'actors:' + zombies.actors[0].id }],
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
  actors: [zombies.actors[0] + { speed+: { chaseMetresPerSimSecond: 3.75 } }],
}
