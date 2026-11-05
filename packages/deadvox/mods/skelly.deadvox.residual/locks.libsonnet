local rows = import 'tools/jsonnet/lib/rows.libsonnet';

local shedWall = function(keyRow)
  ['........', keyRow, 'WWWDDWWW']
  + rows.repeat('W......W', 4)
  + ['WWWWWWWW'];

local lockedShed = {
  id: 'locked_shed',
  size: [8, 6, 8],
  palette: {
    '.': 'air',
    '#': 'planks',
    W: 'siding_blue',
    R: 'roof',
    D: { furniture: 'wood_door', facing: 'n', lock: { id: 'test_shed', locked: true } },
    K: { furniture: 'key_box', loot: 'shed_key_nearby' },
  },
  layers:
    [rows.repeat('########', 8)]
    + [shedWall(keyRow) for keyRow in ['..K.....', '........', '........', '........']]
    + [
      ['........', '........', 'RRRRRRRR'] + rows.repeat('RRRRRRRR', 5),
    ],
};

local content = {
  items: [{
    id: 'shed_key',
    name: 'Shed key',
    category: 'tool',
    size: [1, 1],
    key: { lock: 'test_shed' },
    model: 'shed_key',
    description: "A small key for the shed's door.",
  }],
  loot: [{
    id: 'shed_key_nearby',
    rolls: [1, 1],
    entries: [{ weight: 1, item: 'shed_key', count: [1, 1] }],
  }],
  templates: [lockedShed],
  layouts: [{
    id: 'lock_test',
    attemptPolicy: (import 'tools/jsonnet/lib/attempt-policy.libsonnet').persistent,
    demo: true,
    bounds: { x0: -16, z0: -16, x1: 16, z1: 16 },
    ground: 0,
    terrain: [],
    buildings: [{ template: 'locked_shed', position: [-2, 0, -1], rotation: 0 }],
    player: { position: [0, 0.5, -1.5], bearing: 180 },
    shamblers: [],
    woodlands: [],
    tracks: [],
  }],
};

assert std.length([entry.id for entry in content.loot if entry.id == lockedShed.palette.K.loot]) == 1 : 'K must reference a loot id';
assert lockedShed.size[1] == std.length(lockedShed.layers) : 'template layer count must match size';
content
