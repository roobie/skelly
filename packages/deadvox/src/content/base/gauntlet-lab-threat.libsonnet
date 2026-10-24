local row = function(type, chance, weight) { type: type, chance: chance, weight: weight };
// Per storey, weighted rows of what one marker cell holds; weight on a null-type row leaves the cell quiet.
// Special research adds runners and more crawlers to research's soldier and brute, so the last floor is the hardest
// without losing the character of the one above it.
local rows = {
  entry: [row(null, 0, 2), row('shambler', 0.6, 3)],
  administration: [row(null, 0, 1), row('shambler', 0.6, 2)],
  research: [row(null, 0, 2), row('shambler', 0.8, 2), row('military_shambler', 0.8, 1), row('brute_shambler', 0.8, 1), row('crawler', 0.8, 1)],
  special: [row(null, 0, 1), row('shambler', 0.8, 3), row('runner', 0.8, 3), row('crawler', 0.8, 3), row('military_shambler', 0.8, 1), row('brute_shambler', 0.8, 1)],
  // The sewer is the quieter trade for the street run, so its few cells stay sparse.
  sewer: [row(null, 0, 2), row('shambler', 0.6, 1)],
};
// Each storey holds as many acid zombies as its depth, as a fixed count rather than a chance; `docs/acid-zombie.md`, "Spawning".
// They take the last marker cells of the storey's hosts, clear of the pit the amalgam fills.
local acid = row('acid_zombie', 1, 1);
local acidCounts = { entry: 1, administration: 2, research: 3, special: 4 };
local acidCount = function(storey) std.get(acidCounts, storey, 0);
local markerId = function(r) if r.type == null then 'gauntlet_lab_marker_none' else 'gauntlet_lab_marker_%s_%d' % [r.type, std.round(r.chance * 100)];
local markerPiece = function(r) {
  id: markerId(r), size: [1, 1, 1], style: 'concrete_lab', lootContext: { usage: [], tier: 'Tier1' },
  palette: { '.': { role: 'opening', material: 'air' } } + (if r.type == null then {} else { Z: { spawn: r.type, chance: r.chance } }),
  layers: [[if r.type == null then '.' else 'Z']], ownership: { layers: [['R']] }, anchors: {}, ports: [],
};
local amalgam = row('amalgam', 1, 1);
local distinct = std.set([r for s in std.objectFields(rows) for r in rows[s]] + [amalgam, acid], function(r) markerId(r));
local slot = function(room, name, cell, choices) {
  id: room.id + '_threat_' + name, at: [room.at[0] + cell[0], room.at[1] + cell[1], room.at[2] + cell[2]],
  size: [1, 1, 1], turn: 0,
  choices: [{ ref: { kind: 'piece', id: markerId(r) }, weight: r.weight } for r in choices],
};
{
  mapPieces: [markerPiece(r) for r in distinct],
  // Threat slots at a host's own marker cells, each weighted by one row set; the host leaves those cells unclaimed.
  markerSlots: function(host, rowSet, at)
    assert std.length(at) >= acidCount(rowSet) : host + ' has fewer marker cells than acid zombies';
    [
      slot({ id: host, at: [0, 0, 0] }, i, at[i], if i >= std.length(at) - acidCount(rowSet) then [acid] else rows[rowSet])
      for i in std.range(0, std.length(at) - 1)
    ],
  // The amalgam's dedicated marker, only where a level explicitly places it: its body needs space built for it, so it
  // is never one weighted row among a storey's ordinary cells.
  amalgamSlot: function(host, at)
    slot({ id: host, at: [0, 0, 0] }, 'amalgam', at, [amalgam]),
}
