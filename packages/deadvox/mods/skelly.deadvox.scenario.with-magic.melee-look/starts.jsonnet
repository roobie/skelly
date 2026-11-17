local kit = import '../../../../tools/jsonnet/lib/start-kit.libsonnet';
// The bat strikes one crate to pieces, then the other once the pocketed ring is on.
{
  starts: [kit.fixture + {
    id: 'ringmeleelook',
    site: 'testHouseRingMeleeLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'bat', item: 'baseball_bat', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
      { id: 'ring', item: 'strength_ring', condition: 1, destination: { kind: 'pocket', parent: 'jeans', pocket: 0 } },
    ],
  }],
}
