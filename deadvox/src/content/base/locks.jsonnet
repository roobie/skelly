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
    weight: 10,
    size: [1, 1],
    key: { lock: 'test_shed' },
    description: "A small key for the shed's door.",
  }],
  furniture: [{
    id: 'key_box',
    name: 'Key box',
    size: [1, 1, 1],
    color: '#666666',
    container: { pockets: [{ name: 'Inside', grid: [2, 1], handlingSimSeconds: 0.2 }] },
  }],
  loot: [{
    id: 'shed_key_nearby',
    rolls: [1, 1],
    entries: [{ weight: 1, item: 'shed_key', count: [1, 1] }],
  }],
  templates: [lockedShed],
  layouts: [{
    id: 'lock_test',
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

assert lockedShed.palette.K.furniture == 'key_box' : 'K must reference the key_box furniture id';
assert lockedShed.size[1] == std.length(lockedShed.layers) : 'template layer count must match size';
content
