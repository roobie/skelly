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
local walk = path('rural_plot_walk', [22, 5, 34], [
  'dddddddddddddddddddddd',
  'dddddddddddddddddddddd',
] + ['dd,,,,,,,,,,,,,,,,,,,,' for _ in std.range(2, 15)] + [
  'dddddddddddddddddddddd',
  'dddddddddddddddddddddd',
] + [',,,,,,,,,,,,,,,,,,,,dd' for _ in std.range(18, 27)] + [
  ',,,,,,,,,,,,,,dddddddd',
  ',,,,,,,,,,,,,,dddddddd',
] + [',,,,,,,,,,,,,,,,,,,,,,' for _ in std.range(30, 33)]);
// The garage's drive joins the road frontage.
local drive = path('rural_plot_drive', [8, 5, 2], ['dddddddd', 'dddddddd']);
local slot(id, at, size, kind, ref) = {
  id: id, at: at, size: size, turn: 0, choices: [{ ref: { kind: kind, id: ref }, weight: 1 }],
};
// A plot without an outhouse sets the modernised house with its WC.
local plot(id, outhouse, garage) = {
  id: id,
  brief: 'rural_plot',
  eligibility: { settlementKinds: ['rural'] },
  lootContext: context,
  size: [if garage then 30 else 22, 11, 34],
  slots: [
    slot('house', [2, 0, 2], [18, 11, 14], 'assembly', if outhouse then 'rural_flat_roof_house' else 'rural_flat_roof_house_wc'),
    slot('walk', [0, 0, 0], [22, 5, 34], 'piece', 'rural_plot_walk'),
    slot('coop', [0, 0, 18], [4, 4, 4], 'piece', 'chicken_coop_site'),
    slot('well', [5, 0, 18], [4, 7, 4], 'piece', 'well'),
    slot('woodshed', [12, 0, 18], [8, 6, 5], 'piece', 'woodshed'),
  ] + (if outhouse then [slot('outhouse', [14, 0, 30], [4, 7, 4], 'assembly', 'outhouse')] else [])
  + (if garage then [
       slot('garage', [22, 0, 2], [8, 7, 12], 'piece', 'garage'),
       slot('drive', [22, 0, 0], [8, 5, 2], 'piece', 'rural_plot_drive'),
     ] else []),
  joins: [],
  // The house's rooms where its slot sets them, and the yard's. The toilet is the privy or the house's WC; the
  // privy's seat fills the floor behind its door, so the privy's toilet stands on the path at the door.
  anchors: {
    living_room: { kind: 'standing', at: [9, 1, 8] },
    bedroom: { kind: 'standing', at: [7, 1, 12] },
    kitchen: { kind: 'standing', at: [15, 1, 12] },
    woodshed: { kind: 'standing', at: [16, 1, 19] },
    toilet: { kind: 'standing', at: if outhouse then [16, 1, 29] else [11, 1, 11] },
  },
  ports: [],
  access: { ground: 'ground', entrance: [11, 1, 5], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
};
{
  mapPieces: [walk, drive],
  mapAssemblies: [
    plot('rural_plot_privy', outhouse=true, garage=false),
    plot('rural_plot_privy_garage', outhouse=true, garage=true),
    plot('rural_plot_wc', outhouse=false, garage=false),
    plot('rural_plot_wc_garage', outhouse=false, garage=true),
  ],
  // Most rural houses have an outhouse, since an indoor WC is mostly a town comfort in the setting.
  mapPools: [{
    id: 'rural_plots',
    choices: [
      { ref: { kind: 'assembly', id: 'rural_plot_privy' }, weight: 9 },
      { ref: { kind: 'assembly', id: 'rural_plot_privy_garage' }, weight: 9 },
      { ref: { kind: 'assembly', id: 'rural_plot_wc' }, weight: 1 },
      { ref: { kind: 'assembly', id: 'rural_plot_wc_garage' }, weight: 1 },
    ],
  }],
}
