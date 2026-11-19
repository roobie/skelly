// The village shop look's fixture site: a country road with the curated shop in both of its styles,
// fronts to the road, beside the hand-drawn `small_house` it is judged against. Naming each style
// places it, so the fit check proves both.
{
  layouts: [{
    id: 'villageShopLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -34, z0: -14, x1: 16, z1: 14 },
    ground: 21,
    terrain: [],
    tracks: [{ points: [[-31, -5], [13, -5]], width: 6, surface: 'asphalt' }],
    buildings: [
      { template: 'village_shop', style: 'village_shop_render', position: [-29, 21, 0], rotation: 0 },
      { template: 'village_shop', style: 'village_shop_brick', position: [-15, 21, 0], rotation: 0 },
      { template: 'small_house', position: [1, 21, 0], rotation: 0 },
    ],
    player: { position: [-10, 21.5, -6], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
