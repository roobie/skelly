local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'actorbreachlook',
    site: 'testHouseActorBreachLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
