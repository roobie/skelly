local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'vehiclefinishes',
    site: 'testHouseFinishes',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
