{
  layouts: [{
    id: 'ruralCellarSupportLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -6, z0: -6, x1: 15, z1: 15 },
    ground: 21,
    terrain: [],
    tracks: [],
    buildings: [{ template: 'rural_flat_roof_house_wc_cellar', position: [0, 21, 0], rotation: 0 }],
    // Start beside the posts inside the cellar, where the beams and clear route to the plant are visible.
    player: { position: [1.75, 17.5, 5.75], bearing: 30 },
    actors: [],
    woodlands: [],
  }],
}
