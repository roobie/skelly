local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Midnight, so the lamp is the only stimulus: through the bare window the yard's shambler is drawn to it once lit.
// The lamp starts unlit, because fitting a cover is timed work during which a lit bare lamp would already have drawn
// the shambler: the tester fits the cover first, then lights the lamp and watches. The hammer is in hand and the saw
// and the stock for every window cover lie at the player's feet inside the room. Piles are in blocks: the lamp on the
// crate's top, in line with the window's centre and the shambler; the rest in the player's own cell beside the window.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'litwindowlook',
    site: 'testHouseLitWindowLook',
    startTimeGameTimeOfDay: kit.day.midnightGameTimeOfDay,
    kit: kit.fixture.kit + [
      { id: 'hammer', item: 'hammer', destination: { kind: 'hand', role: 'dominant' } },
      { id: 'roomlamp', item: 'oil_lamp', destination: { kind: 'pile', pos: [-17, 44, 36] } },
      { id: 'saw', item: 'hand_saw', destination: { kind: 'pile', pos: [-18, 42, 37] } },
      { id: 'planks', item: 'wooden_plank', count: 8, destination: { kind: 'pile', pos: [-18, 42, 37] } },
      { id: 'nails', item: 'nails', count: 40, destination: { kind: 'pile', pos: [-18, 42, 37] } },
      { id: 'sheet', item: 'sheet_metal', destination: { kind: 'pile', pos: [-18, 42, 37] } },
      { id: 'rags', item: 'rag', count: 6, destination: { kind: 'pile', pos: [-18, 42, 37] } },
      { id: 'cord', item: 'nylon_cord', destination: { kind: 'pile', pos: [-18, 42, 37] } },
    ],
  }],
}
