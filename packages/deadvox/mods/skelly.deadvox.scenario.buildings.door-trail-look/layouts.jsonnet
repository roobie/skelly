// The door-trail look's fixture site: a country road with two halls. The west hall stands on the flat, so its
// declared trail trods dirt from the road's edge to its door; the east hall stands on a hill, so its declared steps
// climb dressed stone to a door a full rise above the road. Both doors must read as reached from the road by their
// own declared way, not by luck of the terrain.
{
  layouts: [{
    id: 'doorTrailLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -28, z0: -14, x1: 16, z1: 16 },
    ground: 21,
    terrain: [{ kind: 'hill', centre: [1.5, 3.5], radii: [7, 7], rise: 3 }],
    tracks: [{ points: [[-25, -8], [13, -8]], width: 6, surface: 'asphalt' }],
    buildings: [
      { template: 'door_trail_hall', position: [-20, 21, 0], rotation: 0 },
      { template: 'door_steps_hall', position: [0, 24, 2], rotation: 0 },
    ],
    player: { position: [-9, 21.5, -9], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
