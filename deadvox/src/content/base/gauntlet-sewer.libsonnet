local threat = import 'gauntlet-lab-threat.libsonnet';
local context = { usage: ['Industrial'], tier: 'Tier1' };
// Element cells: x across, z from the guard room's south wall (against the lab) to the mouth; layer `ground` is the street surface.
local width = 18;
local depth = 60;
local ground = 8;
local room = { depth: 14, roof: 7 };
local tunnel = { west: 6, east: 11, roof: 6 };
local door = { x0: 7, x1: 10, top: 5 };
local shaft = { x0: 8, x1: 10, z0: 57, z1: 58, ladder: 9 };
local rim = { x0: 7, x1: 11, z0: 56, z1: 59 };
local grate = { x0: 5, x1: 6, z0: 57, z1: 58 };
// Street-level body room over the rim and its east step, reserved so no street prop stands on the mouth.
local clearing = { x0: rim.x0, x1: rim.x1 + 1, z0: rim.z0, z1: rim.z1, height: 4 };
local markers = [[12, 1, 3], [8, 1, 30], [9, 1, 46]];
local within = function(v, lo, hi) v >= lo && v <= hi;
local inBox = function(x, z, box) within(x, box.x0, box.x1) && within(z, box.z0, box.z1);
// The east bay between the crates stays bare so the d483 key's container can stand there without a rebuild.
local thing = function(x, y, z)
  if within(x, 1, 2) && within(z, 4, 6) && within(y, 1, 5) then 'W'
  else if within(x, 14, 15) && (within(z, 2, 3) || within(z, 10, 11)) && within(y, 1, 2) then 'C'
  else null;
local air = function(x, y, z) if std.member(markers, [x, y, z]) then ['.', '.'] else ['.', 'R'];
local roomCell = function(x, y, z)
  if y == 0 then ['p', 'S']
  else if y == room.roof then ['=', 'S']
  else if y > room.roof then ['.', '.']
  else if x == 0 || x == width - 1 || z == 0 || z == room.depth - 1 then
    (if (z == 0 || z == room.depth - 1) && within(x, door.x0, door.x1) && y <= door.top then ['.', 'R'] else ['=', 'S'])
  else if thing(x, y, z) != null then [thing(x, y, z), 'S']
  else air(x, y, z);
local hole = function(x, z) inBox(x, z, shaft);
local shaftCell = function(x, y) if x == shaft.ladder && y < ground then ['J', 'S'] else ['.', 'R'];
local tunnelCell = function(x, y, z)
  if y > ground && inBox(x, z, clearing) then ['.', 'R']
  else if inBox(x, z, grate) && y == ground + 1 then ['g', 'S']
  else if inBox(x, z, rim) && y > tunnel.roof && y <= ground then
    (if hole(x, z) then shaftCell(x, y) else if y == ground then ['h', 'S'] else ['=', 'S'])
  else if !within(x, tunnel.west, tunnel.east) || y > tunnel.roof then ['.', '.']
  else if y == 0 then ['p', 'S']
  else if hole(x, z) then shaftCell(x, y)
  else if y == tunnel.roof || x == tunnel.west || x == tunnel.east || z == depth - 1 then ['=', 'S']
  else air(x, y, z);
local cell = function(x, y, z) if z < room.depth then roomCell(x, y, z) else tunnelCell(x, y, z);
local plane = function(part) [
  [std.join('', [cell(x, y, z)[part] for x in std.range(0, width - 1)]) for z in std.range(0, depth - 1)]
  for y in std.range(0, ground + clearing.height)
];
local body = {
  id: 'gauntlet_sewer_body', size: [width, ground + clearing.height + 1, depth], style: 'sewer_concrete', lootContext: context,
  palette: {
    p: { role: 'interior_floor', material: 'floor' }, '=': { role: 'shell', material: 'concrete' },
    '.': { role: 'opening', material: 'air' }, h: { role: 'trim', material: 'hazard' }, g: { role: 'trim', material: 'galvanized' },
    J: { furniture: 'ladder', facing: 'w' },
    W: { furniture: 'hq_weapon_cabinet', facing: 'e', loot: 'gauntlet_sewer_guard_arms' },
    C: { furniture: 'crate', loot: 'gauntlet_sewer_guard_ammunition' },
  },
  layers: plane(0), ownership: { layers: plane(1) }, anchors: {}, ports: [],
};
local mouth = { ladder: [shaft.ladder, 1, shaft.z0], upper: [rim.x1 + 1, ground + 1, shaft.z1], lower: [shaft.x0, 1, rim.z0] };
{
  door: door,
  depth: depth,
  mouth: mouth,
  // Where the port's threshold leads, in element cells: the guard room just inside its south doorway.
  outside: [(door.x0 + door.x1 + 1) / 2, 1, 2],
  mapStyles: [{ id: 'sewer_concrete', bindings: {
    concrete: { role: 'shell', block: 'concrete' }, floor: { role: 'interior_floor', block: 'concrete' },
    air: { role: 'opening', block: 'air' }, hazard: { role: 'trim', block: 'hazard_yellow' },
    galvanized: { role: 'trim', block: 'galvanized' },
  } }],
  mapPieces: [body],
  mapAssemblies: [{
    id: 'gauntlet_sewer', size: body.size, lootContext: context,
    slots: [{ id: 'body', at: [0, 0, 0], size: body.size, turn: 0, choices: [{ ref: { kind: 'piece', id: body.id }, weight: 1 }] }]
      + threat.markerSlots('sewer', 'sewer', markers),
    joins: [], ports: [], anchors: {},
    access: { ground: 'street', entrance: mouth.upper, storeys: [{ id: 'street', floor: ground + 1 }], stairs: [] },
  }],
  // Each guard-room container rolls its police table or stays empty; the empty weight sets the chance.
  loot: [
    { id: 'gauntlet_sewer_guard_arms', rolls: [1, 1], entries: [{ table: 'gauntlet_police_sidearms', weight: 1 }, { nothing: true, weight: 1 }] },
    { id: 'gauntlet_sewer_guard_ammunition', rolls: [1, 1], entries: [{ table: 'gauntlet_police_ammunition', weight: 1 }, { nothing: true, weight: 1 }] },
  ],
}
