local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'firelook',
    site: 'testHouseFireLook',
    allSkills: 10,
    kit+: [
      { id: 'fire_planks', item: 'wooden_plank', count: 18, destination: { kind: 'pile', pos: [-8, 42, 34] } },
      { id: 'fire_nails', item: 'nails', count: 100, destination: { kind: 'pile', pos: [-8, 42, 34] } },
      { id: 'fire_hammer', item: 'hammer', destination: { kind: 'pile', pos: [-8, 42, 34] } },
      { id: 'fire_saw', item: 'hand_saw', destination: { kind: 'pile', pos: [-8, 42, 34] } },
    ],
    fires: [
      { cell: [-8, 43, 28], strength: 11 },
      { cell: [-10, 42, 31], strength: 11 },
      { cell: [-24, 43, 33], strength: 11 },
      { cell: [-24, 44, 33], strength: 11 },
      { cell: [-24, 45, 33], strength: 11 },
      { cell: [-24, 43, 35], strength: 11 },
    ],
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
