local width = 24;
local depth = 22;
local ground = 5;
local roof = 13;
local shaft = function(x, z) x >= 16 && x <= 22 && z >= 13 && z <= 19;
local hatch = function(x, z) x >= 18 && x <= 20 && z >= 15 && z <= 16;
local cell = function(x, y, z)
  if y == 0 then '='
  else if y < ground then
    if shaft(x, z) then (if x == 19 && z >= 15 && z <= 16 then 'H' else '.') else '='
  else if y == ground then (if hatch(x, z) then 'T' else '=')
  else if x >= 4 && x <= 7 && z >= 14 && z <= 15 then 'V'
  else if x >= 15 && x <= 16 && y >= 8 && y <= 9 && z == 14 then 'N'
  else if z <= 13 then
    if y == roof then 'R'
    else if (z == 0 || z == 13) && x >= 11 && x <= 12 && y <= ground + 4 then 'D'
    else if x == 0 || x == width - 1 || z == 0 || z == 13 then '#'
    else '.'
  else '.';
{
  furniture: [
    {
      id: 'gauntlet_look_exhaust',
      name: 'Service exhaust',
      size: [4, 8, 2],
      color: '#707b7e',
      shape: [
        { position: [0.2, 0, 0.4], size: [1.2, 8, 1.2] },
        { position: [2.5, 0, 0.4], size: [1.2, 8, 1.2] },
        { position: [0, 0, 0], size: [4, 1, 2] },
      ],
    },
    {
      id: 'gauntlet_look_memo',
      name: 'Draft maintenance memo',
      size: [2, 2, 1],
      color: '#dfd6b9',
      solid: false,
      shape: [{ position: [0.1, 0.1, 0.8], size: [1.8, 1.8, 0.1] }],
      readable: {
        title: 'Draft — ventilation invoice',
        text: |||
          PROTOTYPE LOOK — NOT FINAL GAUNTLET LORE

          Accounts queried the extra ducting again. The low brick service building has paired exhausts on its rear apron, rather more ventilation than a stores room needs. The inspection hatch beside them has a ladder under the lid. Please use that access, not the office door.

          Street → service building → rear apron
                                       paired exhausts → hatch

          This sketch describes this prototype only. The final independent notes must describe the service block actually selected for the city.
        |||,
      },
    },
  ],
  templates: [{
    id: 'gauntlet_look_service',
    size: [width, roof + 1, depth],
    palette: {
      '.': 'air', '=': 'concrete', '#': 'brick', R: 'galvanized',
      D: { furniture: 'wood_door', facing: 'n' },
      H: { furniture: 'ladder', facing: 'w' },
      T: { furniture: 'roof_hatch', facing: 'w' },
      V: { furniture: 'gauntlet_look_exhaust' },
      N: { furniture: 'gauntlet_look_memo' },
    },
    layers: [
      [std.join('', [cell(x, y, z) for x in std.range(0, width - 1)]) for z in std.range(0, depth - 1)]
      for y in std.range(0, roof)
    ],
    access: {
      ground: 'ground', entrance: [12, ground + 1, 2],
      storeys: [{ id: 'ground', floor: ground + 1 }], stairs: [],
    },
  }],
  layouts: [{
    id: 'gauntlet_look',
    demo: true,
    bounds: { x0: 46, z0: 46, x1: 76, z1: 76 },
    ground: 21,
    startTimeGameTimeOfDay: '13:00',
    terrain: [],
    buildings: [{ template: 'gauntlet_look_service', position: [55, 21, 55], rotation: 0 }],
    player: { position: [62, 21.5, 67], bearing: 0 },
    shamblers: [], woodlands: [],
    tracks: [{ points: [[50, 53], [72, 53]], width: 4, surface: 'asphalt' }],
  }],
}
