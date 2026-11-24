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
    // Face the central pillar and its crosshead from the cellar door, clear of the plant route.
    player: { position: [1.75, 17.5, 5.75], bearing: 45 },
    actors: [],
    woodlands: [],
  }],
}
