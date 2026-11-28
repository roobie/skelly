local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'furniturebatchlook',
    site: 'testHouseFurnitureBatchLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit: kit.fixture.kit + [
      { id: 'door_bar', item: 'door_bar', destination: { kind: 'hand', role: 'dominant' } },
    ],
  }],
}
