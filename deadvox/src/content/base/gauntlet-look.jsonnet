local width = 24;
local depth = 22;
local ground = 24;
local upperFloor = ground - 7;
local middleFloor = upperFloor - 8;
local bottomFloor = middleFloor - 8;
local roof = ground + 8;
local metal = '#707b7e';
local shaft = function(x, z) x >= 16 && x <= 22 && z >= 13 && z <= 19;
local room = function(x, z) x >= 4 && x <= 19 && z >= 4 && z <= 12;
local westOpening = function(x, z) x >= 6 && x <= 8 && z >= 6 && z <= 7;
local eastOpening = function(x, z) x >= 14 && x <= 16 && z >= 8 && z <= 9;
local inside = function(x, z, x0, x1, z0, z1) x >= x0 && x <= x1 && z >= z0 && z <= z1;
local lab = function(x, y, z)
  if y == upperFloor - 1 then (if westOpening(x, z) then '.' else '=')
  else if y == middleFloor - 1 then (if eastOpening(x, z) then '.' else '=')
  else if y >= upperFloor then
    if x == 19 && z >= 15 && z <= 16 then 'H'
    else if y <= upperFloor + 1 && (inside(x, z, 12, 15, 5, 6) || inside(x, z, 6, 9, 10, 11)) then 'Q'
    else if y >= upperFloor + 2 && y <= upperFloor + 3 && inside(x, z, 15, 16, 4, 4) then 'A'
    else if shaft(x, z) || room(x, z) then '.' else '='
  else if y >= middleFloor then
    if x == 7 && z >= 6 && z <= 7 then 'J'
    else if y <= middleFloor + 3 && inside(x, z, 12, 15, 5, 6) then 'P'
    else if y >= middleFloor + 2 && y <= middleFloor + 3 && inside(x, z, 15, 16, 4, 4) then 'E'
    else if room(x, z) then '.' else '='
  else if x == 15 && z >= 8 && z <= 9 then 'K'
  else if y <= bottomFloor + 1 && inside(x, z, 6, 9, 5, 6) then 'C'
  else if y == bottomFloor + 2 && x == 7 && z == 5 then 'B'
  else if y <= bottomFloor + 4 && inside(x, z, 12, 15, 5, 6) then 'F'
  else if y == bottomFloor && inside(x, z, 6, 9, 8, 10) then 'S'
  else if y >= bottomFloor + 2 && y <= bottomFloor + 3 && inside(x, z, 15, 16, 4, 4) then 'I'
  else if room(x, z) then '.' else '=';
local hatch = function(x, z) x >= 18 && x <= 20 && z >= 15 && z <= 16;
local utility = function(id, definitions)
  local matches = std.filter(function(f) f.id == id, definitions);
  assert std.length(matches) == 1 : 'Utility template needs one furniture definition: ' + id;
  local def = matches[0];
  {
    id: id + '_placement',
    size: [def.size[0], def.size[1] + 1, def.size[2]],
    palette: { '=': 'concrete', P: { furniture: id } },
    layers: [
      [std.repeat(if y == 0 then '=' else 'P', def.size[0]) for _ in std.range(1, def.size[2])]
      for y in std.range(0, def.size[1])
    ],
  };
local cell = function(x, y, z)
  if y == 0 then '='
  else if y < ground then lab(x, y, z)
  else if y == ground then (if hatch(x, z) then 'T' else '=')
  else if x >= 4 && x <= 7 && z >= 14 && z <= 15 then 'V'
  else if x >= 15 && x <= 16 && y >= ground + 3 && y <= ground + 4 && z == 14 then 'N'
  else if x >= 9 && x <= 12 && y <= ground + 2 && z >= 18 && z <= 19 then 'Q'
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
      id: 'gauntlet_look_intake_notice', name: 'Prototype intake placard', size: [2, 2, 1], color: '#d7d5c0', solid: false,
      shape: [{ position: [0.1, 0.1, 0], size: [1.8, 1.8, 0.1] }],
      readable: { title: 'Prototype — intake level', text: 'Upper intake and work area. The next ladder is in the front-left floor opening. This is a spatial sketch, not the finished lab.' },
    },
    {
      id: 'gauntlet_look_containment_notice', name: 'Prototype containment placard', size: [2, 2, 1], color: '#c7a34b', solid: false,
      shape: [{ position: [0.1, 0.1, 0], size: [1.8, 1.8, 0.1] }],
      readable: { title: 'Prototype — containment level', text: 'Containment frame. The next ladder is in the front-right floor opening. The bays are set dressing only; there are no active hazards or enemies in this look.' },
    },
    {
      id: 'gauntlet_look_depth_notice', name: 'Prototype restricted-depth placard', size: [2, 2, 1], color: '#b86158', solid: false,
      shape: [{ position: [0.1, 0.1, 0], size: [1.8, 1.8, 0.1] }],
      readable: { title: 'Prototype — restricted bottom level', text: 'Restricted bottom level. Breached bay and spill are visual placeholders, not damage sources. The red button is on the console at the left. It remains inactive and cannot record a win.' },
    },
    {
      id: 'gauntlet_look_button', name: 'Prototype objective button', size: [1, 1, 1], color: '#c94b3d',
      shape: [{ position: [0.2, 0, 0.2], size: [0.6, 0.3, 0.6] }],
      readable: {
        title: 'Prototype console — inactive',
        text: 'This is a visual placeholder for the objective button. This look has no goal command and cannot record a win.',
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
      J: { furniture: 'ladder', facing: 'w' },
      K: { furniture: 'ladder', facing: 'w' },
      A: { furniture: 'gauntlet_look_intake_notice' },
      E: { furniture: 'gauntlet_look_containment_notice' },
      I: { furniture: 'gauntlet_look_depth_notice' },
      P: { furniture: 'gauntlet_look_containment_bay' },
      F: { furniture: 'gauntlet_look_breached_bay' },
      S: { furniture: 'gauntlet_look_spill' },
      T: { furniture: 'roof_hatch', facing: 'w' },
      V: { furniture: 'gauntlet_look_exhaust' },
      N: { furniture: 'gauntlet_look_memo' },
      Q: { furniture: 'gauntlet_look_bench' },
      C: { furniture: 'gauntlet_look_console' },
      B: { furniture: 'gauntlet_look_button' },
    },
    layers: [
      [std.join('', [cell(x, y, z) for x in std.range(0, width - 1)]) for z in std.range(0, depth - 1)]
      for y in std.range(0, roof)
    ],
    access: {
      ground: 'ground', entrance: [12, ground + 1, 2],
      storeys: [{ id: 'ground', floor: ground + 1 }], stairs: [],
    },
  }] + [utility(id, self.furniture) for id in ['gauntlet_look_bollard', 'gauntlet_look_cabinet', 'gauntlet_look_riser']],
  layouts: [{
    id: 'gauntlet_look',
    demo: true,
    bounds: { x0: 46, z0: 46, x1: 76, z1: 76 },
    ground: 21,
    startTimeGameTimeOfDay: '13:00',
    terrain: [],
    buildings: [
      {
        template: 'gauntlet_look_service', position: [55, 21, 55], rotation: 0,
        fixedLoot: [{ at: [9, ground + 1, 18], items: [{ item: 'flashlight', placement: 'surface' }] }],
      },
      { template: 'gauntlet_look_bollard_placement', position: [58, 21, 68], rotation: 0 },
      { template: 'gauntlet_look_cabinet_placement', position: [69, 21, 56], rotation: 0 },
      { template: 'gauntlet_look_riser_placement', position: [51, 21, 58], rotation: 0 },
    ],
    player: { position: [62, 21.5, 67], bearing: 0 },
    shamblers: [], woodlands: [],
    tracks: [{ points: [[50, 53], [72, 53]], width: 4, surface: 'asphalt' }],
  }],
}
