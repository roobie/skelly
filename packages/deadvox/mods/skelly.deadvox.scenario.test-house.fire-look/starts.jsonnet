local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'firelook',
    site: 'testHouseFireLook',
    allSkills: 10,
    fires: [
      { cell: [-10, 22, 16], strength: 11 },
      { cell: [-10, 23, 16], strength: 11 },
      { cell: [-10, 24, 16], strength: 11 },
    ],
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
