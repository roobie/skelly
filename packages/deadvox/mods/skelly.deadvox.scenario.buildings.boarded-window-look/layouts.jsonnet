// The boarded window look's site: the two townhouse fronts side by side on a street, the player on
// the far pavement facing the four windows between them.
{
  layouts: [{
    id: 'boardedWindowLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -24, z0: -24, x1: 24, z1: 20 },
    ground: 21,
    terrain: [],
    tracks: [{ points: [[-21, -5], [21, -5]], width: 6, surface: 'asphalt' }],
    buildings: [
      { template: 'boarded_window_look_glass', position: [-18, 21, 0], rotation: 0 },
      { template: 'boarded_window_look_boards', position: [0, 21, 0], rotation: 0 },
    ],
    player: { position: [-5, 21.5, -12], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
