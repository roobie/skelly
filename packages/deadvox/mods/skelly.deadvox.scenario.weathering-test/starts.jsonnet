local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [
    kit.fixture + { id: 'weatheringtest', site: 'weatheringTest', startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay },
  ],
}
