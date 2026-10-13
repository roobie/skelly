local lab = import 'gauntlet-lab.libsonnet';
local width = lab.width;
local depth = lab.depth;
local ground = lab.ground;
local surfaceOffset = lab.surfaceOffset;
local roof = ground + 8;
local metal = '#707b7e';

local hatch = function(x, z)
  local hx = lab.entry.hatch[0] - surfaceOffset;
  local hz = lab.entry.hatch[2] - surfaceOffset;
  x >= hx && x <= hx + 2 && z >= hz && z <= hz + 1;
local surface = function(x, y, z)
  if y == ground then (if hatch(x, z) then 'T' else '=')
  else if x >= 4 && x <= 7 && z >= 14 && z <= 15 then 'V'
  else if x >= 15 && x <= 16 && y >= ground + 3 && y <= ground + 4 && z == 14 then 'N'
  else if x >= 9 && x <= 12 && y <= ground + 2 && z >= 18 && z <= 19 then 'Q'
  else if z <= 13 then
    if y == roof then 'R'
    else if (z == 0 || z == 13) && x >= 11 && x <= 12 && y <= ground + 4 then 'D'
    else if x == 0 || x == 23 || z == 0 || z == 13 then '#'
    else '.'
  else '.';
local utilities = [
  { marker: 'W', at: [30, ground + 1, 50], size: [2, 4, 2] },
  { marker: 'X', at: [52, ground + 1, 26], size: [4, 3, 2] },
  { marker: 'Y', at: [16, ground + 1, 30], size: [3, 5, 3] },
];
local cell = function(x, y, z)
  if y < ground then lab.cell(x, y, z)
  else if y == ground then surface(x - surfaceOffset, y, z - surfaceOffset)
  else
    local matches = std.filter(function(p) x >= p.at[0] && x < p.at[0] + p.size[0] && y >= p.at[1] && y < p.at[1] + p.size[1] && z >= p.at[2] && z < p.at[2] + p.size[2], utilities);
    if std.length(matches) > 0 then matches[0].marker
    else if x >= surfaceOffset && x < surfaceOffset + 24 && z >= surfaceOffset && z < surfaceOffset + 22 then surface(x - surfaceOffset, y, z - surfaceOffset)
    else '.';
{
  furniture: lab.furniture + [
    {
      id: 'gauntlet_look_exhaust',
      name: 'Service exhaust',
      size: [4, 8, 2],
      color: metal,
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
    {
      id: 'gauntlet_look_bollard', name: 'Utility bollard', size: [2, 4, 2], color: metal,
      shape: [
        { position: [0.4, 0, 0.4], size: [1.2, 3.8, 1.2] },
        { position: [0.2, 3.6, 0.2], size: [1.6, 0.4, 1.6] },
      ],
    },
    {
      id: 'gauntlet_look_cabinet', name: 'Utility cabinet', size: [4, 3, 2], color: metal,
      shape: [
        { position: [0, 0, 0], size: [4, 0.4, 2] },
        { position: [0.1, 0.4, 0.1], size: [3.8, 2.6, 1.8] },
      ],
    },
    {
      id: 'gauntlet_look_riser', name: 'Service duct riser', size: [3, 5, 3], color: metal,
      shape: [
        { position: [0.4, 0, 0.4], size: [1, 5, 1] },
        { position: [0.4, 4, 0.4], size: [2.6, 1, 1] },
        { position: [0, 0, 0], size: [2, 0.4, 2] },
      ],
    },
    {
      id: 'gauntlet_look_bench', name: 'Prototype workbench', size: [4, 2, 2], color: '#acb4b1',
      shape: [
        { position: [0, 1.6, 0], size: [4, 0.4, 2] },
        { position: [0.2, 0, 0.2], size: [0.3, 1.6, 1.6] },
        { position: [3.5, 0, 0.2], size: [0.3, 1.6, 1.6] },
      ],
    },
    {
      id: 'gauntlet_look_console', name: 'Prototype objective console', size: [4, 2, 2], color: '#7c868c',
      shape: [
        { position: [0, 0, 0], size: [4, 1.2, 2] },
        { position: [0, 1.2, 0], size: [4, 0.8, 0.3] },
        { position: [0, 1.2, 0.3], size: [4, 0.2, 1.7] },
      ],
    },
    {
      id: 'gauntlet_look_containment_bay', name: 'Prototype containment bay', size: [4, 4, 2], color: '#b29a61',
      shape: [
        { position: [0, 0, 0], size: [4, 0.3, 2] },
        { position: [0, 3.7, 0], size: [4, 0.3, 2] },
        { position: [0, 0.3, 0], size: [0.3, 3.4, 2] },
        { position: [3.7, 0.3, 0], size: [0.3, 3.4, 2] },
        { position: [1.8, 0.3, 0.8], size: [0.4, 2.8, 0.4] },
      ],
    },
    {
      id: 'gauntlet_look_breached_bay', name: 'Prototype breached containment bay', size: [4, 5, 2], color: '#9b5550',
      shape: [
        { position: [0, 0, 0], size: [4, 0.3, 2] },
        { position: [0, 4.7, 0], size: [4, 0.3, 2] },
        { position: [0, 0.3, 0], size: [0.3, 4.4, 2] },
        { position: [3.7, 0.3, 1.7], size: [0.3, 4.4, 0.3] },
        { position: [0.3, 0.3, 0.5], size: [2.2, 0.25, 0.3] },
      ],
    },
    {
      id: 'gauntlet_look_spill', name: 'Prototype spill mark — no active hazard', size: [4, 1, 3], color: '#742e30', solid: false,
      shape: [
        { position: [0.4, 0, 0.1], size: [2.9, 0.05, 1.7] },
        { position: [1.2, 0, 1.5], size: [2.6, 0.05, 1.2] },
      ],
    },
    {
      id: 'gauntlet_look_button', name: 'Prototype nuclear objective button', size: [1, 1, 1], color: '#c94b3d',
      shape: [{ position: [0.2, 0, 0.2], size: [0.6, 0.3, 0.6] }],
      readable: {
        title: 'Prototype console — inactive',
        text: 'This is a visual placeholder for the nuclear objective button. This look has no goal command and cannot record a win.',
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
      W: { furniture: 'gauntlet_look_bollard' },
      X: { furniture: 'gauntlet_look_cabinet' },
      Y: { furniture: 'gauntlet_look_riser' },
      T: { furniture: 'roof_hatch', facing: 'w' },
      V: { furniture: 'gauntlet_look_exhaust' },
      N: { furniture: 'gauntlet_look_memo' },
      Q: { furniture: 'gauntlet_look_bench' },
    } + lab.palette,
    layers: [
      [std.join('', [cell(x, y, z) for x in std.range(0, width - 1)]) for z in std.range(0, depth - 1)]
      for y in std.range(0, roof)
    ],
    access: {
      ground: 'ground', entrance: [surfaceOffset + 12, ground + 1, surfaceOffset + 2],
      storeys: [{ id: 'ground', floor: ground + 1 }], stairs: [],
    },
  }],
  layouts: [{
    id: 'gauntlet_look',
    demo: true,
    bounds: { x0: 40, z0: 40, x1: 82, z1: 78 },
    ground: 21,
    startTimeGameTimeOfDay: '13:00',
    terrain: [],
    buildings: [
      {
        template: 'gauntlet_look_service', position: [43, 21, 43], rotation: 0,
        fixedLoot: [{ at: [surfaceOffset + 9, ground + 1, surfaceOffset + 18], items: [{ item: 'flashlight', placement: 'surface' }] }],
      },

    ],
    player: { position: [62, 21.5, 67], bearing: 0 },
    shamblers: [], woodlands: [],
    tracks: [{ points: [[50, 53], [72, 53]], width: 4, surface: 'asphalt' }],
  }],
}
