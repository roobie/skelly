// The rural plot look's fixture site: every rural plot the pool can draw, side by side along a country road,
// so one walk compares the yards with an outhouse or the house's WC, with and without a garage. Each plot's
// twin over a cellar stands behind it along a second road, so the two read side by side from the back yards.
local kinds = [
  { id: 'rural_plot_privy', x: -32 },
  { id: 'rural_plot_wc', x: -19 },
  { id: 'rural_plot_privy_garage', x: -6 },
  { id: 'rural_plot_wc_garage', x: 11 },
];
local row(suffix, z) = [
  { template: kind.id + suffix, position: [kind.x, 21, z], rotation: 0 }
  for kind in kinds
];
{
  layouts: [{
    id: 'ruralPlotLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -36, z0: -14, x1: 30, z1: 48 },
    ground: 21,
    terrain: [],
    tracks: [
      { points: [[-33, -5], [27, -5]], width: 6, surface: 'asphalt' },
      { points: [[-33, 22], [27, 22]], width: 6, surface: 'asphalt' },
    ],
    buildings: row('', 0) + row('_cellar', 27),
    player: { position: [-5, 21.5, -6], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
