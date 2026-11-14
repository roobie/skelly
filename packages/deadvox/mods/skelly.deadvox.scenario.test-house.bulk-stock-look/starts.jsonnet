local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The held rag makes the stock-only refusal available immediately.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'bulkstocklook',
    site: 'testHouseBulkStock',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit: kit.fixture.kit + [{ id: 'refused_stock', item: 'rag', destination: { kind: 'hand', role: 'dominant' } }],
  }],
}
