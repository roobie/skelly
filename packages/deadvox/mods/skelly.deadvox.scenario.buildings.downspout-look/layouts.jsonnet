// The downspout look's site: the block on open ground, the player north of it facing both pipes.
{
  layouts: [{
    id: 'downspoutLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -16, z0: -16, x1: 16, z1: 12 },
    ground: 21,
    terrain: [],
    tracks: [],
    buildings: [{ template: 'downspout_look_block', position: [-4, 21, 0], rotation: 0 }],
    player: { position: [0.5, 21.5, -4], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
