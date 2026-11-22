// The rural flat-roof house on its plot: the house along the road, a well, the woodshed and the coop's site
// along the back walk, and in most plots an outhouse at the far end of the yard; the rest set the modernised
// house with an indoor WC. A trodden path runs from the
// road down the west side of the house and across the yard, so the walk reaches the porch and every
// outbuilding. Which plots have an outhouse or a garage is the pool's share; see
// `packages/deadvox/docs/building-pathway.md`, "Worked example: rural plot".
local context = { usage: ['Residential'], tier: 'Tier1' };
local style = 'rural_outbuilding';
local palette = {
  d: { role: 'support', material: 'path' },
  '_': { role: 'opening', material: 'opening' },
  ',': { role: 'opening', material: 'opening' },
};
local claim(mark) = std.get({ '_': 'R', ',': '.' }, mark, 'S');
// A path plan: 'd' is the trodden ground, walked over at any height a body stands, ',' is the yard's own ground.
local path(id, size, plan) = {
  local layers = [plan] + [[std.strReplace(row, 'd', '_') for row in plan] for _ in std.range(1, size[1] - 1)],
  id: id, size: size, style: style, lootContext: context, palette: palette, layers: layers,
  ownership: { layers: [[std.join('', std.map(claim, std.stringChars(row))) for row in layer] for layer in layers] },
  anchors: {}, ports: [],
};
// A house over a cellar is deeper by its area stair, so its yard lies `back` rows further from the road.
local walkPlan(id, back) = path(id, [22, 5, 34 + back], [
  'dddddddddddddddddddddd',
  'dddddddddddddddddddddd',
] + ['dd,,,,,,,,,,,,,,,,,,,,' for _ in std.range(2, 15 + back)] + [
  'dddddddddddddddddddddd',
  'dddddddddddddddddddddd',
] + [',,,,,,,,,,,,,,,,,,,,dd' for _ in std.range(18, 27)] + [
  ',,,,,,,,,,,,,,dddddddd',
  ',,,,,,,,,,,,,,dddddddd',
] + [',,,,,,,,,,,,,,,,,,,,,,' for _ in std.range(30, 33)]);
local walk = walkPlan('rural_plot_walk', 0);
local cellarWalk = walkPlan('rural_plot_walk_cellar', 2);
// The garage's drive joins the road frontage.
local drive = path('rural_plot_drive', [8, 5, 2], ['dddddddd', 'dddddddd']);
local slot(id, at, size, kind, ref) = {
  id: id, at: at, size: size, turn: 0, choices: [{ ref: { kind: kind, id: ref }, weight: 1 }],
};
// A plot without an outhouse sets the modernised house with its WC. A plot over a cellar sets the house over one,
// raised so its ground storey stays at the road's level, with the yard behind the house's area stair.
local plot(id, outhouse, garage, cellar) =
  local paths = if cellar then cellarWalk else walk;
  local back = paths.size[2] - walk.size[2];
  local lift = if cellar then 8 else 0;
  local at(x, y, z) = [x, y + lift, z];
  local yard(x, y, z) = at(x, y, z + back);
  local house = (if outhouse then 'rural_flat_roof_house' else 'rural_flat_roof_house_wc') + (if cellar then '_cellar' else '');
  {
    id: id,
    brief: 'rural_plot',
    eligibility: { settlementKinds: ['rural'] },
    lootContext: context,
    size: [if garage then 30 else 22, 11 + lift, paths.size[2]],
    slots: [
      slot('house', [2, 0, 2], [18, 11 + lift, 14 + back], 'assembly', house),
      slot('walk', at(0, 0, 0), paths.size, 'piece', paths.id),
      slot('coop', yard(0, 0, 18), [4, 4, 4], 'piece', 'chicken_coop_site'),
      slot('well', yard(5, 0, 18), [4, 7, 4], 'piece', 'well'),
      slot('woodshed', yard(12, 0, 18), [8, 6, 5], 'piece', 'woodshed'),
    ] + (if outhouse then [slot('outhouse', yard(14, 0, 30), [4, 7, 4], 'assembly', 'outhouse')] else [])
    + (if garage then [
         slot('garage', at(22, 0, 2), [8, 7, 12], 'assembly', 'rural_garage'),
         slot('drive', at(22, 0, 0), [8, 5, 2], 'piece', 'rural_plot_drive'),
       ] else []),
    joins: [],
    // The house's rooms where its slot sets them, and the yard's. The toilet is the privy or the house's WC; the
    // privy's seat fills the floor behind its door, so the privy's toilet stands on the path at the door.
    anchors: {
      living_room: { kind: 'standing', at: at(9, 1, 8) },
      bedroom: { kind: 'standing', at: at(7, 1, 12) },
      kitchen: { kind: 'standing', at: at(15, 1, 12) },
      woodshed: { kind: 'standing', at: yard(16, 1, 19) },
      toilet: { kind: 'standing', at: if outhouse then yard(16, 1, 29) else at(11, 1, 11) },
    } + (if cellar then { cellar: { kind: 'standing', at: [8, 1, 10] } } else {}),
    ports: [],
    access: {
      ground: 'ground',
      entrance: at(11, 1, 5),
      storeys: (if cellar then [{ id: 'cellar', floor: 1 }] else []) + [{ id: 'ground', floor: 1 + lift }],
      stairs: [],
    },
  };
local plots = [
  { id: 'rural_plot_privy', outhouse: true, garage: false, weight: 9 },
  { id: 'rural_plot_privy_garage', outhouse: true, garage: true, weight: 9 },
  { id: 'rural_plot_wc', outhouse: false, garage: false, weight: 1 },
  { id: 'rural_plot_wc_garage', outhouse: false, garage: true, weight: 1 },
];
local cellars = [false, true];
local plotId(row, cellar) = row.id + (if cellar then '_cellar' else '');
{
  mapPieces: [walk, cellarWalk, drive],
  mapAssemblies: [plot(plotId(row, cellar), row.outhouse, row.garage, cellar) for row in plots for cellar in cellars],
  // Most rural houses have an outhouse, since an indoor WC is mostly a town comfort in the setting. A third of
  // every kind stand over a cellar, so a cellar is a find in most villages without changing the yard's mix.
  mapPools: [{
    id: 'rural_plots',
    choices: [
      { ref: { kind: 'assembly', id: plotId(row, cellar) }, weight: row.weight * (if cellar then 1 else 2) }
      for row in plots
      for cellar in cellars
    ],
  }],
}
