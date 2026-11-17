local kit = import '../../../../tools/jsonnet/lib/start-kit.libsonnet';
// The ring starts pocketed, so the tester is refused the lift first, then puts the ring on and lifts.
{
  starts: [kit.fixture + {
    id: 'ringliftlook',
    site: 'testHouseRingLiftLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'ring', item: 'strength_ring', condition: 1, destination: { kind: 'pocket', parent: 'jeans', pocket: 0 } },
    ],
  }],
}
