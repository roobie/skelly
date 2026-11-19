// The rural house look's fixture site: a country road with the curated flat-roof house beside the
// hand-drawn `small_house`, fronts to the road, so the look compares a briefed answer with the baseline
// it is judged against. The second house is held to its boarded entrance style, so both facades show.
{
  layouts: [{
    id: 'ruralHouseLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -28, z0: -14, x1: 16, z1: 12 },
    ground: 21,
    terrain: [],
    tracks: [{ points: [[-25, -5], [13, -5]], width: 6, surface: 'asphalt' }],
    buildings: [
      { template: 'rural_flat_roof_house', style: 'rural_render_boarded', position: [-23, 21, 0], rotation: 0 },
      { template: 'rural_flat_roof_house', position: [-11, 21, 0], rotation: 0 },
      { template: 'small_house', position: [1, 21, 0], rotation: 0 },
    ],
    player: { position: [-5, 21.5, -6], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
