local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Case landings by ear: the pistol in hand, its magazine and a box's worth of rounds pocketed, because a start
// hands over no loaded weapon until #1570.
{
  starts: [kit.fixture + {
    id: 'caselandinglook',
    site: 'testHouseCaseLandingLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'pistol', item: 'pistol_service', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
      { id: 'magazine', item: 'magazine_pistol_9', destination: { kind: 'pocket', parent: 'jeans', pocket: 0 } },
      {
        id: 'rounds', item: 'cartridge_9x19', count: 50,
        destination: { kind: 'pocket', parent: 'jeans', pocket: 1 },
      },
    ],
  }],
}
