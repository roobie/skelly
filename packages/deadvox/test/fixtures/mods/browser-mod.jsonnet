local zombies = import '../../../mods/skelly.deadvox.actors/enemies.jsonnet';
{
  id: 'browser-test-mod',
  version: '1',
  tier: 'product',
  product: false,
  dependencies: ['skelly.deadvox.actors'],
  overrides: [{ pack: 'skelly.deadvox.actors', entry: 'actors:' + zombies.actors[0].id }],
  items: [{
    id: 'mod_test_token',
    name: 'Mod token',
    category: 'misc',
    workInProgress: false,
    weight: 0.1,
    size: [1, 1],
  }],
  actors: [zombies.actors[0] + { speed+: { chaseMetresPerSimSecond: 3.75 } }],
}
