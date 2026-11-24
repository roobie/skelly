local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Midnight, so the lamp lit on the room's floor is the only stimulus: through the bare window the yard's shambler is
// drawn to it. The hammer is in hand and the stock for every window cover lies at the player's feet, so a cover is
// fitted and the shambler's attention is watched in one visit. The pile is in blocks, beside the spawn in the yard.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'litwindowlook',
    site: 'testHouseLitWindowLook',
    startTimeGameTimeOfDay: kit.day.midnightGameTimeOfDay,
    kit: kit.fixture.kit + [
      { id: 'hammer', item: 'hammer', destination: { kind: 'hand', role: 'dominant' } },
      { id: 'roomlamp', item: 'oil_lamp', lit: true, destination: { kind: 'pile', pos: [-16, 42, 36] } },
      { id: 'planks', item: 'wooden_plank', count: 8, destination: { kind: 'pile', pos: [-17, 42, 31] } },
      { id: 'nails', item: 'nails', count: 40, destination: { kind: 'pile', pos: [-17, 42, 31] } },
      { id: 'sheet', item: 'sheet_metal', destination: { kind: 'pile', pos: [-17, 42, 31] } },
      { id: 'rags', item: 'rag', count: 6, destination: { kind: 'pile', pos: [-17, 42, 31] } },
      { id: 'cord', item: 'nylon_cord', destination: { kind: 'pile', pos: [-17, 42, 31] } },
    ],
  }],
}
