local threat = import 'gauntlet-lab-threat.libsonnet';
// One scale for every rebuilt level, so rooms keep their proportions from level to level.
local scale = 2;
local height = 8;
local short = [['FFFF', 'FFFF', '....', '....'], ['FFFF', 'FFFF', '....', '....']];
local tall = function(rows, n) [rows for _ in std.range(1, n)];
local kits = {
  console: { furniture: { F: 'gauntlet_look_console' }, layers: short },
  bench: { furniture: { F: 'gauntlet_look_bench' }, layers: short },
  desk: { furniture: { F: 'desk' }, layers: [['FFF.', 'FFF.', '....', '....'], ['FFF.', 'FFF.', '....', '....']] },
  fallen_shelf: { furniture: { F: { id: 'shelf', tip: 'back' } }, layers: [['FF..', 'FF..', 'FF..', 'FF..']] },
  cabinets: { furniture: { A: 'police_file_cabinet', B: 'police_file_cabinet' }, layers: tall(['AABB', '....', '....', '....'], 4) },
  arms: { furniture: { F: 'range_rack' }, layers: tall(['FF..', '....', '....', '....'], 4) },
  locker: { furniture: { F: 'hq_weapon_cabinet' }, layers: tall(['FFF.', 'FFF.', '....', '....'], 5) },
  generator: { furniture: { F: 'gauntlet_lab_generator' }, layers: tall(['FFFF', 'FFFF', 'FFFF', '....'], 3) },
  pump: { furniture: { F: 'gauntlet_look_pump' }, layers: tall(['FFFF', 'FFFF', 'FFFF', '....'], 4) },
  lift: { furniture: { F: 'gauntlet_lab_dead_lift' }, layers: tall(['FFFF', 'FFFF', '....', '....'], 5) },
  shelves: { furniture: { A: 'shelf', B: 'shelf' }, layers: tall(['AABB', '....', '....', '....'], 4) },
  archive: { furniture: { F: 'gauntlet_look_archive' }, layers: tall(['FFFF', 'FFFF', '....', '....'], 5) },
  kitchen: { furniture: { A: 'kitchen_cupboard', B: 'station_kitchen_sink' }, layers: tall(['AABB', '....', '....', '....'], 2) },
  fridge: { furniture: { F: 'gauntlet_lab_fridge' }, layers: tall(['FF..', 'FF..', '....', '....'], 4) },
  wc: { furniture: { A: 'station_toilet', B: 'station_washbasin' }, layers: tall(['AABB', 'AA..', '....', '....'], 2) },
  basins: { furniture: { A: 'station_washbasin', B: 'station_washbasin' }, layers: tall(['AABB', '....', '....', '....'], 2) },
  lockers: { furniture: { A: 'police_evidence_locker', B: 'police_evidence_locker' }, layers: tall(['AABB', '....', '....', '....'], 4) },
  body: { furniture: { F: 'gauntlet_lab_dead_researcher' }, layers: [['FFFF', 'FFFF', '....', '....']] },
  culture: { furniture: { F: 'gauntlet_look_culture' }, layers: tall(['FFFF', 'FFFF', '....', '....'], 4) },
  containment: { furniture: { F: 'gauntlet_look_containment_bay' }, layers: tall(['FFFF', 'FFFF', '....', '....'], 4) },
  breached: { furniture: { F: 'gauntlet_look_breached_bay' }, layers: tall(['FFFF', 'FFFF', '....', '....'], 5) },
  cold_store: { furniture: { F: 'gauntlet_look_cold_store' }, layers: tall(['FFFF', 'FFFF', '....', '....'], 5) },
  exam: { furniture: { F: 'gauntlet_look_exam' }, layers: short },
  spill: { furniture: { F: 'gauntlet_look_spill' }, layers: [['FFFF', 'FFFF', 'FFFF', '....']] },
  couch: { furniture: { F: 'medical_examination_couch', A: 'medical_folding_screen' }, layers: [['FF.A', 'FF..', 'FF..', 'FF..'], ['...A', '....', '....', '....']] },
  files: { furniture: { A: 'medical_card_file', B: 'medical_card_file' }, layers: tall(['A..B', '....', '....', '....'], 2) },
  sterilizer: { furniture: { A: 'medical_steam_sterilizer', B: 'police_file_cabinet' }, layers: tall(['A.BB', '....', '....', '....'], 2) + tall(['..BB', '....', '....', '....'], 2) },
  lounge: { furniture: { F: 'sofa', T: 'range_table' }, layers: tall(['FFFF', 'FFFF', 'TTTT', 'TTTT'], 2) },
};
local empty = ['....', '....', '....', '....'];
local platform = ['pppp', 'pppp', 'pppp', 'pppp'];
local soffit = ['====', '====', '====', '===='];
local slot = function(id, kind, ref, at, extent) { id: id, at: at, size: extent, turn: 0, choices: [{ ref: { kind: kind, id: ref }, weight: 1 }] };
local inBox = function(boxes, fx, fz) std.any([fx >= b.at[0] && fx < b.at[0] + b.size[0] && fz >= b.at[1] && fz < b.at[1] + b.size[1] for b in boxes]);
// The stair rises one block per step along x; the run's foot is open so the landing below keeps its body space.
local stairRun = [[std.join('', [if x < 2 + y then '.' else 'p' for x in std.range(0, 11)]) for _ in std.range(0, 1)] for y in std.range(0, height - 1)];
local stair = {
  id: 'gauntlet_lab_stair', size: [12, height, 2], style: 'concrete_lab', lootContext: { usage: ['Industrial'], tier: 'Tier1' },
  palette: { p: { role: 'interior_floor', material: 'floor' }, '.': { role: 'opening', material: 'air' } },
  layers: stairRun,
  ownership: { layers: [[std.join('', [if x < 2 + y then 'R' else 'S' for x in std.range(0, 11)]) for _ in std.range(0, 1)] for y in std.range(0, height - 1)] },
  anchors: {}, ports: [],
};
{
  scale: scale,
  stair: stair,
  // One rebuilt level from its plan and room table. A room's `lootUsage` gives its stocked furniture a context that fits its use. `through` boxes stay open on every layer above the floor for pieces that
  // pass through the level; `holes` open its floor over the ways that leave it; `voids` leave a piece from another level
  // the whole column, unclaimed on every layer. All are in blocks, as are `markers`.
  build:: function(level)
    local plan = level.plan;
    local rooms = level.rooms;
    local prefix = 'gauntlet_lab_' + level.id;
    local roomList = [rooms[id] for id in std.objectFields(rooms)];
    local byToken = { [token]: room for room in roomList for token in room.tokens };
    local dressing = std.flattenArrays([[
      d + { room: room, rise: room.floorRise + std.get(d, 'rise', 0) } for d in room.dressing
    ] for room in roomList]);
    // Digits mark bays; a room past the tenth names its own `bay` token.
    local bayTokens = std.stringChars('0123456789') + [room.bay for room in roomList if std.objectHas(room, 'bay')];
    local bayAt = function(c, x, z) if !std.member(bayTokens, c) then [] else [d for d in dressing if x >= d.at[0] && x < d.at[0] + 2 && z >= d.at[1] && z < d.at[1] + 2];
    local expand = function(cell) std.flattenArrays([
      [std.join('', [cell(plan[z][x], dx, dz, x, z) for x in std.range(0, std.length(plan[z]) - 1) for dx in std.range(0, scale - 1)]) for dz in std.range(0, scale - 1)]
      for z in std.range(0, std.length(plan) - 1)
    ]);
    local size = [std.length(plan[0]) * scale, height, std.length(plan) * scale];
    local through = function(dx, dz, x, z) inBox(level.through, x * scale + dx, z * scale + dz);
    local hole = function(dx, dz, x, z) inBox(level.holes, x * scale + dx, z * scale + dz);
    local voided = function(dx, dz, x, z) inBox(std.get(level, 'voids', []), x * scale + dx, z * scale + dz);
    local marker = function(y, dx, dz, x, z) std.member(level.markers, [x * scale + dx, y, z * scale + dz]);
    local card = level.card;
    // A card with a `container` is stock in that dressing bay's container, so finding it is a search rather than a sighting.
    local cardBay = if std.objectHas(card, 'container') then [d for d in dressing if d.id == card.container][0] else null;
    local isCard = function(x, z) cardBay == null && x == card.at[0] && z == card.at[1];
    local opening = function(room, c, dx, dz, x, z)
      local candidates = [o for o in room.openings if o.token == c && (if o.axis == 'x' then z >= o.at[1] && z < o.at[1] + std.get(o, 'depth', 1) else x == o.at[0])];
      if std.length(candidates) == 0 then null
      else local o = candidates[0];
        local along = if o.axis == 'x' then (x - o.at[0]) * scale + dx else (z - o.at[1]) * scale + dz;
        o + { clear: along >= std.get(o, 'offset', 0) && along < std.get(o, 'offset', 0) + o.width };
    local wallGlyph = function(room, y) if y == 1 then room.band else room.wall;
    local cell = function(c, y, dx, dz, x, z)
      if voided(dx, dz, x, z) then '.'
      else if c == '#' then '#'
      else local room = byToken[c];
        local bay = bayAt(c, x, z);
        local o = opening(room, c, dx, dz, x, z);
        if y == 0 then (if hole(dx, dz, x, z) then '.' else room.floor)
        else if through(dx, dz, x, z) then '.'
        else if std.length(bay) > 0 then '.'
        else if c == room.wall then wallGlyph(room, y)
        else if y <= room.floorRise then room.floor
        else if y >= height - room.ceilingDrop then room.wall
        else if c == '|' then (if y <= 5 then '|' else room.wall)
        else if o != null then (if !o.clear || y > std.get(o, 'height', 4) then wallGlyph(room, y) else if c == 'D' then 'D' else '.')
        else if isCard(x, z) && y == room.floorRise + 1 && dx == 0 && dz == 0 then 'K'
        else '.';
    local claims = function(y) expand(function(c, dx, dz, x, z)
      local glyph = cell(c, y, dx, dz, x, z);
      if voided(dx, dz, x, z) then '.'
      else if y == 0 then (if glyph == '.' then '.' else 'S')
      else if glyph != '.' && glyph != 'K' then 'S'
      else if isCard(x, z) then 'A'
      else if through(dx, dz, x, z) || std.length(bayAt(c, x, z)) > 0 || marker(y, dx, dz, x, z) then '.'
      else 'R');
    local palette = { '.': { role: 'opening', material: 'air' }, '#': { role: 'shell', material: 'rock' }, '|': { role: 'shell', material: 'wire' },
      D: { furniture: 'gauntlet_lab_bulkhead', facing: 's', lock: { id: level.lock, locked: true } },
      K: { groundLoot: { kind: 'fixed', items: [{ item: level.cardItem }] } },
    } + { [room.floor]: { role: 'interior_floor', material: room.finish.floor } for room in roomList }
      + { [room.wall]: { role: 'shell', material: room.finish.wall } for room in roomList }
      + { [room.band]: { role: 'shell', material: room.finish.base } for room in roomList };
    local shell = {
      id: prefix + '_shell', size: size, style: 'concrete_lab', lootContext: level.context, palette: palette,
      layers: [expand(function(c, dx, dz, x, z) cell(c, y, dx, dz, x, z)) for y in std.range(0, height - 1)],
      ownership: { layers: [claims(y) for y in std.range(0, height - 1)] }, anchors: {}, ports: [],
    };
    local bay = function(d)
      local kit = kits[d.kit];
      local layers = [
        if y < d.rise then platform
        else if y >= height - 1 - d.room.ceilingDrop then soffit
        else if y - d.rise < std.length(kit.layers) then kit.layers[y - d.rise]
        else if d.fixture != null && y == height - 2 - d.room.ceilingDrop then ['LL..', '....', '....', '....']
        else empty
        for y in std.range(0, height - 2)
      ];
      {
        id: prefix + '_bay_' + d.id, size: [4, height - 1, 4], style: 'concrete_lab', lootContext: level.context,
        palette: { '.': { role: 'opening', material: 'air' }, p: { role: 'interior_floor', material: d.room.finish.floor }, '=': { role: 'shell', material: d.room.finish.wall },
          L: { furniture: if d.fixture == 'broken' then 'gauntlet_lab_fixture_broken' else 'gauntlet_lab_fixture' },
        } + { [glyph]: { furniture: if std.type(kit.furniture[glyph]) == 'object' then kit.furniture[glyph].id else kit.furniture[glyph],
                     loot: std.get(d, 'loot', 'd41_empty') }
                     + (if std.objectHas(d, 'lootUsage') then { lootUsage: d.lootUsage } else if std.objectHas(d.room, 'lootUsage') then { lootUsage: d.room.lootUsage } else {})
                     + (if std.type(kit.furniture[glyph]) == 'object' then { tip: kit.furniture[glyph].tip } else {}) for glyph in std.objectFields(kit.furniture) },
        layers: layers,
        ownership: { layers: [[std.join('', [if c == '.' then 'A' else 'S' for c in std.stringChars(row)]) for row in layer] for layer in layers] },
        anchors: {}, ports: [],
      };
    local cardSeal = if cardBay == null then
      local y = level.base + 1 + byToken[plan[card.at[1]][card.at[0]]].floorRise;
      { key: [card.at[0] * scale, y, card.at[1] * scale], standing: [card.at[0] * scale, y, card.at[1] * scale + 1] }
    else
      local y = level.base + 1 + cardBay.rise;
      { key: [cardBay.at[0] * scale, y, cardBay.at[1] * scale], standing: [cardBay.at[0] * scale + 1, y, cardBay.at[1] * scale + 3], held: true };
    assert std.all([std.length(row) == std.length(plan[0]) for row in plan]) : level.id + ' plan rows must have equal width: ' + std.toString([[z, std.length(plan[z])] for z in std.range(0, std.length(plan) - 1) if std.length(plan[z]) != std.length(plan[0])]);
    {
      size: size,
      expand: expand,
      through: through,
      // Where the card is and where a player stands to take it, in the lab's blocks for a level based at `base`; a held card
      // also needs its container's stock.
      cardSeal: cardSeal,
      cardStock: if cardBay == null then [] else [{ at: cardSeal.key, items: [{ item: level.cardItem, key: true }] }],
      mapPieces: [shell] + [bay(d) for d in dressing],
      mapAssembly: {
        id: 'gauntlet_lab_level_' + level.id, size: size, lootContext: level.context + level.range,
        slots: [slot('shell', 'piece', shell.id, [0, 0, 0], size)]
          + [slot(d.id, 'piece', prefix + '_bay_' + d.id, [d.at[0] * scale, 1, d.at[1] * scale], [4, height - 1, 4]) for d in dressing]
          + threat.markerSlots(level.id, level.id, level.markers),
        joins: [], ports: [], anchors: {},
      },
    },
}
