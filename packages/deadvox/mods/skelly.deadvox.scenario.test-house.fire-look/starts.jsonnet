local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'firelook',
    site: 'testHouseFireLook',
    allSkills: 10,
    fires: [
      { cell: [-24, 43, 33], strength: 11 },
      { cell: [-24, 44, 33], strength: 11 },
      { cell: [-24, 45, 33], strength: 11 },
      { cell: [-24, 43, 35], strength: 11 },
    ],
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
