local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// The partition runs north-south at column 3, its one window run in the middle, plain wall above and below, so half
// a pressing crowd meets a piece and half meets bare terrain. Layout actors always spawn facing east
// (`packages/engine/src/core/actorSpawns.ts`, `spawnOnce`), so the crowd west of the partition looks straight at it,
// and the wall half reaches the press through the chasers' alert chain, not through the wall.
local partition(z) = if z >= 3 && z <= 6 then '...W............' else '...p............';
local room = [partition(z) for z in std.range(0, 8)];
// The template sits at [-12, 20.5, 14], so column 3 spans world x -10.5..-10 and rows 3-6 world z 15.5..17.5.
{
  templates: [{
    id: 'test_house_probe_crowd',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [16, 6, 9],
    palette: {
      '.': 'air', f: 'plank_floor', p: 'plank_wall',
      W: { furniture: 'clear_hinged_window', facing: 'w', fixed: true },
    },
    layers: [
      ['ffffffffffffffff', 'ffffffffffffffff', 'ffffffffffffffff',
       'ffffffffffffffff', 'ffffffffffffffff', 'ffffffffffffffff',
       'ffffffffffffffff', 'ffffffffffffffff', 'ffffffffffffffff'],
      room, room, room, room, room,
    ],
  }],
  layouts: [layout + {
    id: 'testHouseProbeCrowdLook',
    buildings: layout.buildings + [
      { template: 'test_house_probe_crowd', position: [-12, 20.5, 14], rotation: 0 },
    ],
    actors: [
      { type: 'shambler', position: [-11, 21, 15.75], chance: 1 },
      { type: 'shambler', position: [-11.25, 21, 16.5], chance: 1 },
      { type: 'shambler', position: [-11, 21, 17], chance: 1 },
      { type: 'shambler', position: [-11.25, 21, 15.9], chance: 1 },
      { type: 'shambler', position: [-11, 21, 14.5], chance: 1 },
      { type: 'shambler', position: [-11.25, 21, 14.9], chance: 1 },
      { type: 'shambler', position: [-11, 21, 18], chance: 1 },
      { type: 'shambler', position: [-11.25, 21, 18.3], chance: 1 },
    ],
    player: { position: [-8, 21, 16.25], bearing: 270 },
    showroom: layout.showroom + { slots: [] },
  }],
}
