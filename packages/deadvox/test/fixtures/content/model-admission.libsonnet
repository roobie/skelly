local admit = import 'tools/jsonnet/lib/used-models.libsonnet';
local row(id) = { id: id, file: 'assets/models/' + id + '.glb' };
local item = { id: 'fixture_item', name: 'Fixture', category: 'misc', weight: 1, size: [1, 1], model: 'fixture_used' };
local released = [row('fixture_used'), row('fixture_unused')];
{
  content: (import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
    items: [item],
    models: admit(released, { items: [item] }),
  }),
  missing: (import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
    items: [item { model: 'fixture_missing' }],
    models: admit(released, { items: [item { model: 'fixture_missing' }] }),
  }),
  contexts: [
    admit(released, consumer)
    for consumer in [
      { items: [item] },
      { graphics: [{ gore: { chunks: { models: ['fixture_used'] } } }] },
      { figures: [{ body: { model: 'fixture_used' } }] },
      { powerDevices: [{ model: 'fixture_used' }] },
      { items: [{ figureModels: [{ model: 'fixture_other', overTorso: { jacket: 'fixture_used' } }] }] },
      { items: [{ wearable: { viewModel: { model: 'fixture_used' } } }] },
    ]
  ],
}
