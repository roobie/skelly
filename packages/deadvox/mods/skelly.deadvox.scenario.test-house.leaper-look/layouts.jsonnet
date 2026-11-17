local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// Open ground east of the garden wall: the near leaper charges and pounces first, the far two follow, so each
// lands in view and the shotgun has time to cut a hind leg off one of them.
{
  layouts: [layout + {
    id: 'testHouseLeaperLook',
    actors: [
      { type: 'leaper', position: [12, 21, 14], chance: 1 },
      { type: 'leaper', position: [26, 21, 10], chance: 1 },
      { type: 'leaper', position: [26, 21, 18], chance: 1 },
    ],
    // An empty slot row lets the bearing apply, so the look opens facing the leapers.
    showroom: layout.showroom + { slots: [] },
    player: { position: [-2.75, 21, 14], bearing: 0 },
  }],
}
