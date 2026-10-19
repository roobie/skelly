local rows = import 'tools/jsonnet/lib/rows.libsonnet';
local cabinets = import 'cabinet-shapes.libsonnet';
local supplyPaint = '#8d986d';
local lootContext = { usage: ['Residential'], tier: 'Tier1' };
local wall = ['WWWWWWWWWWWW', 'W..........W', 'W..........W', 'W..........W', 'W..........W', 'W..........W', 'W..........W', 'W..........W', 'WWWWWDDWWWWW'];
local cabinetWall = wall[:2] + ['WKK........W'] + wall[3:];
{
  furniture: [{
    id: 'tutorial_cabinet',
    name: 'Supply cabinet',
    size: [2, 3, 1],
    color: supplyPaint,
    shape: cabinets.supply(self.size, {
      shell: supplyPaint, frame: '#6b7553', door: '#9ea980', upper: '#aab491',
      metal: '#aab0a5', shadow: '#343b2f', wear: '#c1c7ac', badge: '#d2d7c6',
    }),
    container: { pockets: [{ name: 'Supplies', grid: [8, 8], handlingSimSeconds: 0.2 }] },
  }],
  templates: [{
    id: 'tutorial_station',
    lootContext: lootContext,
    size: [12, 7, 9],
    palette: {
      '.': 'air', '#': 'planks', W: 'siding_blue', R: 'roof',
      D: { furniture: 'wood_door', facing: 's' },
      K: { furniture: 'tutorial_cabinet' },
    },
    layers: [rows.repeat('############', 9)]
      + rows.repeat(cabinetWall, 3) + [wall] + [wall[:8] + ['WWWWWWWWWWWW']]
      + [rows.repeat('RRRRRRRRRRRR', 9)],
  }],
  layouts: [{
    id: 'tutorial',
    lootContext: lootContext,
    demo: true,
    bounds: { x0: -32, z0: -32, x1: 64, z1: 48 },
    ground: 0,
    startTimeGameTimeOfDay: '17:00',
    terrain: [],
    buildings: [{
      template: 'tutorial_station', position: [-3, 0, -4], rotation: 0,
      fixedLoot: [{ at: [1, 1, 2], items: [
        { item: 'canned_beans', count: 2 },
        { item: 'water_bottle', count: 2 },
        { item: 'flashlight', fitted: { battery: 'aa_battery' } },
        { item: 'bandage', count: 2 },
      ] }],
    }],
    player: { position: [0, 0.5, 8], bearing: 0 },
    shamblers: [{ type: 'shambler', position: [24, 0.5, 2] }],
    woodlands: [],
    tracks: [{ points: [[0, 12], [0, 1], [-8, 1], [-8, -12]], width: 3, surface: 'dirt' }],
    beats: [{ id: 'tutorial_exit', area: { x0: -10, z0: -15, x1: -6, z1: -11 } }],
  }],
}
