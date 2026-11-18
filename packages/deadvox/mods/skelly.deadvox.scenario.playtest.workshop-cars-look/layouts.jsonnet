// The workshop cars look's fixture site: the playtest's own workshop hall alone on flat ground, with the start just
// inside the roller door between the saloon and the lift, so the look shows both cars as the playtest draws them.
// The hall is the playtest's template, not a copy, so a change to its cars shows here unchanged.
{
  layouts: [{
    id: 'workshopCarsLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -12, z0: -12, x1: 36, z1: 32 },
    ground: 21,
    terrain: [],
    tracks: [],
    buildings: [
      { template: 'workshop_hall', position: [0, 21, 0], rotation: 0, storeys: 1 },
    ],
    // Inside the roller door, facing in: the saloon stands to the right, the stripped 4×4 on the lift ahead.
    player: { position: [7.5, 21.5, 3.5], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
