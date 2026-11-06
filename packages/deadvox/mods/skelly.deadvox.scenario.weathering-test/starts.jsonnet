local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [
    kit.common + { id: 'weatheringtest', site: 'weatheringTest', debugOnly: true, startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay },
  ],
}
