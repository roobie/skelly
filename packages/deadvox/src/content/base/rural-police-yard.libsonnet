local context = { usage: [], tier: 'Tier1' };
local palette = { '.': { ground: true }, f: 'chain_link' };
local front = ['ffffffff..........ffffffffffffff......ffffffffffffffff'];
local back = ['ffffffffffffffffffffffffffffffffffffffffffffffffffffff'];
local side = ['fffffffffffffffffffffffffffffffffffffffff'];
{
  templates: [
    {
      id: 'rural_police_front_fence', size: [54, 4, 1], lootContext: context,
      palette: palette,
      layers: [['......................................................'], front, front, front],
    },
    {
      id: 'rural_police_back_fence', size: [54, 4, 1], lootContext: context,
      palette: palette,
      layers: [['......................................................'], back, back, back],
    },
    {
      id: 'rural_police_side_fence', size: [41, 4, 1], lootContext: context,
      palette: palette,
      layers: [['.........................................'], side, side, side],
    },
  ],
  buildings: [
    { template: 'rural_police_front_fence', position: [48, 21, 50], rotation: 0 },
    { template: 'rural_police_back_fence', position: [48, 21, 71], rotation: 0 },
    { template: 'rural_police_side_fence', position: [48, 21, 50.5], rotation: 90 },
    { template: 'rural_police_side_fence', position: [74.5, 21, 50.5], rotation: 90 },
  ],
}
