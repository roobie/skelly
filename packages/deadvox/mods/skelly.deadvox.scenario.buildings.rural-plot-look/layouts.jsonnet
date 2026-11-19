// The rural plot look's fixture site: every rural plot the pool can draw, side by side along a country road,
// so one walk compares the yards with and without an outhouse or a garage.
{
  layouts: [{
    id: 'ruralPlotLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -36, z0: -14, x1: 30, z1: 22 },
    ground: 21,
    terrain: [],
    tracks: [{ points: [[-33, -5], [27, -5]], width: 6, surface: 'asphalt' }],
    buildings: [
      { template: 'rural_plot_privy', position: [-32, 21, 0], rotation: 0 },
      { template: 'rural_plot_plain', position: [-19, 21, 0], rotation: 0 },
      { template: 'rural_plot_privy_garage', position: [-6, 21, 0], rotation: 0 },
      { template: 'rural_plot_plain_garage', position: [11, 21, 0], rotation: 0 },
    ],
    player: { position: [-5, 21.5, -6], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
