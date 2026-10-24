local row = function(type, chance, weight) { type: type, chance: chance, weight: weight };
local quiet = row(null, 0, 1);
// Per storey, weighted rows of what one marker cell holds; weight on a null-type row leaves the cell quiet.
local rows = {
  entry: [row(null, 0, 2), row('shambler', 0.6, 3)],
  administration: [row(null, 0, 1), row('shambler', 0.6, 2)],
  containment: [row(null, 0, 1), row('shambler', 0.8, 5)],
  failure: [row(null, 0, 1), row('shambler', 0.8, 4), row('runner', 0.8, 3), row('crawler', 0.8, 3)],
  bottom: [row(null, 0, 1), row('shambler', 0.8, 3), row('runner', 0.8, 4), row('crawler', 0.8, 4)],
  // The sewer is the quieter trade for the street run, so its few cells stay sparse.
  sewer: [row(null, 0, 2), row('shambler', 0.6, 1)],
};
// Live marker cells per room kind, of the three every room punches out of its shell; breach and quarantine rooms are the densest.
// The amalgam's body needs a whole empty room, so it has its own centre cell, live only in the holding room; every room on the plain shell punches that cell.
local centreRows = { bottom: [row('amalgam', 1, 1)] };
// Each storey holds as many acid zombies as its depth, as a fixed count rather than a chance; `docs/acid-zombie.md`, "Spawning".
// They take the last marker cells of the storey's hosts, clear of the holding room, which the amalgam fills.
local acid = row('acid_zombie', 1, 1);
local acidCounts = { entry: 1, administration: 2, containment: 3, failure: 4, bottom: 5 };
local acidCount = function(storey) std.get(acidCounts, storey, 0);
local kinds = {
  intake: 1, records: 1, clinic: 1, cold_store: 1, workshop: 1, utilities: 1, observation: 1, culture: 1,
  security: 1, assay: 1, decon: 1, holding: 0, containment: 2, objective: 2, breach: 3, quarantine: 3,
};
local suffixes = ['_incoming_east', '_outgoing_east', '_incoming', '_outgoing'];
local kindOf = function(ref)
  local strip = function(id, rest)
    if std.length(rest) == 0 then id
    else if std.endsWith(id, rest[0]) then std.substr(id, 0, std.length(id) - std.length(rest[0]))
    else strip(id, rest[1:]);
  strip(ref, suffixes);
// Standing cells inside a room's 18 x 14 footprint that stay clear of its equipment and doorways.
local cells = [[12, 1, 6], [4, 1, 8], [13, 1, 5]];
local centre = [9, 1, 7];
local markerId = function(r) if r.type == null then 'gauntlet_lab_marker_none' else 'gauntlet_lab_marker_%s_%d' % [r.type, std.round(r.chance * 100)];
local markerPiece = function(r) {
  id: markerId(r), size: [1, 1, 1], style: 'concrete_lab', lootContext: { usage: [], tier: 'Tier1' },
  palette: { '.': { role: 'opening', material: 'air' } } + (if r.type == null then {} else { Z: { spawn: r.type, chance: r.chance } }),
  layers: [[if r.type == null then '.' else 'Z']], ownership: { layers: [['R']] }, anchors: {}, ports: [],
};
local distinct = std.set([r for s in std.objectFields(rows) for r in rows[s]] + centreRows.bottom + [acid], function(r) markerId(r));
// Every lab room slot offers one room, so its first choice names the kind.
local kindAt = function(room) kindOf(std.strReplace(room.choices[0].ref.id, 'gauntlet_lab_', ''));
local slot = function(room, name, cell, choices) {
  id: room.id + '_threat_' + name, at: [room.at[0] + cell[0], room.at[1] + cell[1], room.at[2] + cell[2]],
  size: [1, 1, 1], turn: 0,
  choices: [{ ref: { kind: 'piece', id: markerId(r) }, weight: r.weight } for r in choices],
};
{
  cells: cells,
  centre: centre,
  mapPieces: [markerPiece(r) for r in distinct],
  // Threat slots for the rooms of one storey, each cell weighted by that storey's rows.
  slots: function(storey, roomSlots)
    local hosts = [room for room in roomSlots if kindAt(room) != 'holding'];
    local acidRooms = std.set([room.id for room in hosts[std.length(hosts) - acidCount(storey):]]);
    assert std.length(hosts) >= acidCount(storey) : storey + ' has fewer rooms than acid zombies';
    [
      slot(room, i, cells[i],
           if i == std.length(cells) - 1 && std.member(acidRooms, room.id) then [acid]
           else if i < kinds[kindAt(room)] then rows[storey] else [quiet])
      for room in roomSlots
      for i in std.range(0, std.length(cells) - 1)
    ] + [
      slot(room, 'centre', centre, if kindAt(room) == 'holding' then centreRows[storey] else [quiet])
      for room in roomSlots
      if kindAt(room) == std.strReplace(room.choices[0].ref.id, 'gauntlet_lab_', '')
    ],
  // Threat slots at a host's own marker cells, each weighted by one row set; the host leaves those cells unclaimed.
  markerSlots: function(host, rowSet, at)
    assert std.length(at) >= acidCount(rowSet) : host + ' has fewer marker cells than acid zombies';
    [
      slot({ id: host, at: [0, 0, 0] }, i, at[i], if i >= std.length(at) - acidCount(rowSet) then [acid] else rows[rowSet])
      for i in std.range(0, std.length(at) - 1)
    ],
}
