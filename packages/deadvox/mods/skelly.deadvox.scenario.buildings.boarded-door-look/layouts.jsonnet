// The boarded door look's site: the townhouse front on a street, the player on the pavement facing its door.
{
  layouts: [{
    id: 'boardedDoorLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -16, z0: -12, x1: 16, z1: 20 },
    ground: 21,
    terrain: [],
    tracks: [{ points: [[-13, -5], [13, -5]], width: 6, surface: 'asphalt' }],
    buildings: [{ template: 'boarded_door_look_house', position: [-9, 21, 0], rotation: 0 }],
    player: { position: [-5, 21.5, -2], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
