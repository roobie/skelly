local width = 72;
local depth = 64;
local paint = function(row, x, count, marker)
  std.substr(row, 0, x) + std.repeat(marker, count) + std.substr(row, x + count, width - x - count);
local prop = function(marker, x, z) { marker: marker, at: [x, 0, z] };
local kinds = [
  { id: 'intake', name: 'Intake / sample triage', props: [prop('Q', 2, 3), prop('Q', 11, 8)] },
  { id: 'records', name: 'Records / sealed archives', props: [prop('L', 2, 3), prop('L', 11, 8)] },
  { id: 'clinic', name: 'Examination / isolation', props: [prop('M', 2, 3), prop('Q', 11, 8)] },
  { id: 'cold_store', name: 'Cold specimen store', props: [prop('O', 2, 3), prop('O', 11, 8)] },
  { id: 'workshop', name: 'Instrument repair', props: [prop('Q', 2, 3), prop('U', 11, 8)] },
  { id: 'utilities', name: 'Pressure / circulation plant', props: [prop('U', 2, 3), prop('U', 11, 8)] },
  { id: 'observation', name: 'Observation / control', props: [prop('C', 2, 3), prop('P', 11, 8)] },
  { id: 'culture', name: 'Culture growth', props: [prop('G', 2, 3), prop('Q', 11, 8)] },
  { id: 'security', name: 'Security / monitoring', props: [prop('C', 2, 3), prop('L', 11, 8)] },
  { id: 'containment', name: 'Containment cells', props: [prop('P', 2, 3), prop('P', 11, 8)] },
  { id: 'assay', name: 'Anomalous material assay', props: [prop('G', 2, 3), prop('P', 11, 8)] },
  { id: 'decon', name: 'Decontamination / waste', props: [prop('U', 2, 3), prop('S', 11, 8)] },
  { id: 'breach', name: 'Breached experiment', props: [prop('F', 2, 3), prop('S', 11, 8)] },
  { id: 'quarantine', name: 'Failed quarantine', props: [prop('F', 2, 3), prop('F', 11, 8), prop('S', 7, 8)] },
  { id: 'objective', name: 'Nuclear control / inactive prototype', props: [prop('C', 2, 3), prop('F', 11, 8), { marker: 'B', at: [3, 2, 3] }] },
];
local storeys = [
  { id: 'intake', name: 'Intake and support', color: '#d7d5c0', rooms: ['intake', 'records', 'clinic', 'cold_store', 'workshop', 'utilities', 'observation', 'culture', 'security'] },
  { id: 'research', name: 'Research and observation', color: '#c7b16d', rooms: ['culture', 'assay', 'observation', 'clinic', 'security', 'cold_store', 'workshop', 'containment', 'decon'] },
  { id: 'containment', name: 'Restricted containment', color: '#c78b42', rooms: ['containment', 'assay', 'cold_store', 'observation', 'culture', 'decon', 'breach', 'security', 'containment'] },
  { id: 'failure', name: 'Containment failure', color: '#b96448', rooms: ['breach', 'quarantine', 'containment', 'decon', 'assay', 'breach', 'quarantine', 'utilities', 'observation'] },
  { id: 'bottom', name: 'Critical depth / nuclear control', color: '#b84b43', rooms: ['quarantine', 'breach', 'quarantine', 'breach', 'objective', 'breach', 'quarantine', 'decon', 'quarantine'] },
];
local links = [
  { from: 'intake', to: 'research', at: [[12, 10], [59, 48]] },
  { from: 'research', to: 'containment', at: [[59, 10], [12, 48]] },
  { from: 'containment', to: 'failure', at: [[35, 10], [35, 48]] },
  { from: 'failure', to: 'bottom', at: [[12, 29], [59, 29]] },
];
local pitch = 8;
local ground = std.length(storeys) * pitch;
local surfaceOffset = 24;
local floor = function(index) ground - (index + 1) * pitch + 1;
local entry = { hatch: [surfaceOffset + 18, ground, surfaceOffset + 15], ladder: [surfaceOffset + 19, floor(0), surfaceOffset + 15] };
local floorOf = { [storeys[i].id]: floor(i) for i in std.range(0, std.length(storeys) - 1) };
local descents = [
  { top: floorOf[link.from] - 1, bottom: floorOf[link.to], x: at[0], z: at[1] }
  for link in links for at in link.at
];
local roomBoxes = [
  { x: 4 + col * 23, z: 4 + row * 19, index: row * 3 + col }
  for row in std.range(0, 2) for col in std.range(0, 2)
];
local kindById = { [kinds[i].id]: kinds[i] + { marker: std.char(97 + i) } for i in std.range(0, std.length(kinds) - 1) };
local props = {
  Q: { id: 'gauntlet_look_bench', size: [4, 2, 2] },
  C: { id: 'gauntlet_look_console', size: [4, 2, 2] },
  P: { id: 'gauntlet_look_containment_bay', size: [4, 4, 2] },
  F: { id: 'gauntlet_look_breached_bay', size: [4, 5, 2] },
  S: { id: 'gauntlet_look_spill', size: [4, 1, 3] },
  B: { id: 'gauntlet_look_button', size: [1, 1, 1] },
  L: { id: 'gauntlet_look_archive', size: [4, 5, 2] },
  M: { id: 'gauntlet_look_exam', size: [4, 2, 2] },
  O: { id: 'gauntlet_look_cold_store', size: [4, 5, 2] },
  U: { id: 'gauntlet_look_pump', size: [4, 4, 3] },
  G: { id: 'gauntlet_look_culture', size: [4, 4, 2] },
};
local roomPlacements = [
  { marker: kindById[s.rooms[box.index]].marker, at: [box.x + 2, floor(i) + 2, box.z], size: [2, 2, 1] }
  for i in std.range(0, std.length(storeys) - 1) for s in [storeys[i]] for box in roomBoxes
] + [
  { marker: p.marker, at: [box.x + p.at[0], floor(i) + p.at[1], box.z + p.at[2]], size: props[p.marker].size }
  for i in std.range(0, std.length(storeys) - 1) for s in [storeys[i]] for box in roomBoxes for p in kindById[s.rooms[box.index]].props
] + [
  { marker: std.toString(i), at: [39, floor(i) + 2, 23], size: [2, 2, 1] }
  for i in std.range(0, std.length(storeys) - 1)
];
local partitionRows = [
  std.join('', [
    local col = std.floor((x - 4) / 23);
    local roomRow = std.floor((z - 4) / 19);
    local rx = x - (4 + col * 23);
    local rz = z - (4 + roomRow * 19);
    local inRoom = col >= 0 && col < 3 && roomRow >= 0 && roomRow < 3 && rx >= 0 && rx <= 17 && rz >= 0 && rz <= 13;
    local wall = inRoom && ((rx == 0 || rx == 17) && !(rz >= 5 && rz <= 8) || (rz == 0 || rz == 13) && !(rx >= 7 && rx <= 10));
    if x == 0 || x == width - 1 || z == 0 || z == depth - 1 || wall then '=' else '.'
    for x in std.range(0, width - 1)
  ]) for z in std.range(0, depth - 1)
];
// Row painting preserves priority without repeating sparse occupancy and partition work for every cell.
local rows = [
  local pieces = std.filter(function(p) y >= p.at[1] && y < p.at[1] + p.size[1], roomPlacements);
  local shafts = std.filter(function(d) y >= d.bottom && y <= d.top, descents);
  local openings = std.filter(function(d) y == d.top, descents);
  [
    local rowPieces = std.sort(std.filter(function(p) z >= p.at[2] && z < p.at[2] + p.size[2], pieces), function(p) p.at[0]);
    assert std.all([rowPieces[i].at[0] + rowPieces[i].size[0] <= rowPieces[i + 1].at[0] for i in std.range(0, std.length(rowPieces) - 2)]) : 'overlapping lab furniture';
    local base = if y % pitch == 0 then std.repeat('=', width) else partitionRows[z];
    local furnished = if y % pitch == 0 then base else std.foldl(
      function(row, p) paint(row, p.at[0], p.size[0], p.marker), rowPieces, base);
    local entryClear = if y % pitch != 0 && y >= floor(0) && z >= entry.ladder[2] - 2 && z <= entry.ladder[2] + 4 then
      local clear = paint(furnished, entry.ladder[0] - 3, 7, '.');
      if z >= entry.ladder[2] && z <= entry.ladder[2] + 1 then paint(clear, entry.ladder[0], 1, 'H') else clear
      else furnished;
    local opened = std.foldl(function(row, d) paint(row, d.x - 1, 3, '.'),
      std.filter(function(d) z >= d.z && z <= d.z + 1, openings), entryClear);
    std.foldl(function(row, d) paint(row, d.x, 1, 'J'),
      std.filter(function(d) z >= d.z && z <= d.z + 1, shafts), opened)
    for z in std.range(0, depth - 1)
  ] for y in std.range(0, ground - 1)
];
local placard = function(id, title, text, color) {
  id: id, name: title, size: [2, 2, 1], color: color, solid: false,
  shape: [{ position: [0.1, 0.1, 0], size: [1.8, 1.8, 0.1] }],
  readable: { title: title, text: text },
};
local cabinetShape = [
  { position: [0, 0, 0], size: [4, 0.3, 2] },
  { position: [0, 0.3, 0], size: [0.3, 4.7, 2] },
  { position: [3.7, 0.3, 0], size: [0.3, 4.7, 2] },
  { position: [0.3, 4.7, 0], size: [3.4, 0.3, 2] },
];
{
  width: width, depth: depth, ground: ground, surfaceOffset: surfaceOffset, entry: entry,
  anchors: {
    storeys: [{ id: s.id, standing: [35, floor(i), 29] } for i in std.range(0, std.length(storeys) - 1) for s in [storeys[i]]],
    descents: [{ ladder: [d.x, d.bottom, d.z], upper: [d.x - 1, d.top + 1, d.z + 1], lower: [d.x - 1, d.bottom, d.z + 1] } for d in descents],
    objective: [
      [box.x + p.at[0], floor(i) + p.at[1], box.z + p.at[2]]
      for i in std.range(0, std.length(storeys) - 1) for s in [storeys[i]] for box in roomBoxes
      for p in kindById[s.rooms[box.index]].props if p.marker == 'B'
    ][0],
  },
  rows: rows,
  palette: { J: { furniture: 'ladder', facing: 'w' } } + {
    [marker]: { furniture: props[marker].id } for marker in std.objectFields(props)
  } + {
    [kindById[kind.id].marker]: { furniture: 'gauntlet_look_room_' + kind.id } for kind in kinds
  } + {
    [std.toString(i)]: { furniture: 'gauntlet_look_level_' + storeys[i].id } for i in std.range(0, std.length(storeys) - 1)
  },
  furniture: [
    { id: 'gauntlet_look_archive', name: 'Prototype archive shelves', size: [4, 5, 2], color: '#a0a6a0', shape: cabinetShape + [{ position: [0.3, 2.3, 0], size: [3.4, 0.3, 2] }] },
    { id: 'gauntlet_look_cold_store', name: 'Prototype cold specimen bank', size: [4, 5, 2], color: '#90b0b5', shape: [{ position: [0, 0, 0], size: [4, 5, 2] }] },
    { id: 'gauntlet_look_exam', name: 'Prototype examination slab', size: [4, 2, 2], color: '#c7cfc7', shape: [{ position: [0, 1.5, 0], size: [4, 0.5, 2] }, { position: [0.5, 0, 0.5], size: [3, 1.5, 1] }] },
    { id: 'gauntlet_look_pump', name: 'Prototype pressure plant', size: [4, 4, 3], color: '#738981', shape: [{ position: [0, 0, 0], size: [4, 0.4, 3] }, { position: [0.3, 0.4, 0.3], size: [1.2, 3.6, 2.4] }, { position: [2.5, 0.4, 0.3], size: [1.2, 3.6, 2.4] }] },
    { id: 'gauntlet_look_culture', name: 'Prototype culture apparatus', size: [4, 4, 2], color: '#91a978', shape: [{ position: [0, 0, 0], size: [4, 0.4, 2] }, { position: [0.2, 0.4, 0.2], size: [0.6, 3.6, 1.6] }, { position: [1.7, 0.4, 0.2], size: [0.6, 3.6, 1.6] }, { position: [3.2, 0.4, 0.2], size: [0.6, 3.6, 1.6] }] },
  ] + [
    placard('gauntlet_look_room_' + kind.id, 'Prototype — ' + kind.name,
      'Room-kind sketch: ' + kind.name + '. Equipment, specimens and damage are inert set dressing. No powered machinery, hazards or enemies are supplied by this look.', '#c5cbbf')
    for kind in kinds
  ] + [
    local downward = std.filter(function(link) link.from == s.id, links);
    local route = if std.length(downward) == 0 then 'Bottom storey. The inactive red objective button is in the central nuclear-control room.'
      else 'Two descents to ' + storeys[i + 1].name + ': ' + std.join(' and ', [
        storeys[i].rooms[std.floor((at[1] - 4) / 19) * 3 + std.floor((at[0] - 4) / 23)]
        for at in downward[0].at
      ]) + '. They land in different wings; the next pair is offset, not a continuous shaft.';
    placard('gauntlet_look_level_' + s.id, 'Prototype — ' + s.name,
      route + '\n\nCirculation loops around and between the rooms. Rooms have open thresholds on each side. Danger is suggested by deeper containment failures only; the final lab must earn it through play.\n\nNorth row: ' + std.join(' / ', [kindById[s.rooms[n]].name for n in std.range(0, 2)]) + '\nMiddle row: ' + std.join(' / ', [kindById[s.rooms[n]].name for n in std.range(3, 5)]) + '\nSouth row: ' + std.join(' / ', [kindById[s.rooms[n]].name for n in std.range(6, 8)]), s.color)
    for i in std.range(0, std.length(storeys) - 1) for s in [storeys[i]]
  ],
}
