local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// One lit lamp in hand and the same lamp lit on the floor ahead, so the look compares the hand scene's light with
// the world's.
{
  start(id, site, time, floorLamp):: kit.fixture + {
    id: id,
    site: site,
    startTimeGameTimeOfDay: time,
    kit: kit.fixture.kit + [
      { id: 'heldlamp', item: 'oil_lamp', lit: true, destination: { kind: 'hand', role: 'dominant' } },
      { id: 'floorlamp', item: 'oil_lamp', lit: true, destination: { kind: 'pile', pos: floorLamp } },
    ],
  },
}
