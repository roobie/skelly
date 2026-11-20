// The fixtures look's site: the fixture row on open ground, the player north of it facing the fronts.
{
  layouts: [{
    id: 'fixturesLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -32, z0: -16, x1: 32, z1: 12 },
    ground: 21,
    terrain: [],
    tracks: [],
    buildings: [{ template: 'fixtures_look_row', position: [-30, 21, 0], rotation: 0 }],
    player: { position: [0.5, 21.5, -8], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
