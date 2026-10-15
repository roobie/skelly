local chair = std.filter(function(f) f.id == 'chair', (import 'furniture.jsonnet').furniture)[0];
local tipped(id, axes, reverse) = {
  id: id, name: chair.name, color: chair.color,
  size: [chair.size[a] for a in axes],
  shape: [
    {
      position: [
        if i == reverse then chair.size[axes[i]] - box.position[axes[i]] - box.size[axes[i]]
        else box.position[axes[i]]
        for i in std.range(0, 2)
      ],
      size: [box.size[a] for a in axes],
    }
    for box in chair.shape
  ],
};
{
  furniture: [
    tipped('chair_on_back', [0, 2, 1], 1),
    tipped('chair_on_side', [1, 0, 2], 0),
  ],
  poses: [
    { id: 'pushed', weight: 3, palette: { c: { furniture: 'chair', facing: 'w' } },
      layers: [['..', '.c'], ['..', '.c']] },
    { id: 'turned', weight: 2, palette: { c: { furniture: 'chair', facing: 's' } },
      layers: [['c.', '..'], ['c.', '..']] },
    { id: 'back', weight: 2, palette: { c: { furniture: 'chair_on_back' } },
      layers: [['.c', '.c'], ['..', '..']] },
    { id: 'side', weight: 2, palette: { c: { furniture: 'chair_on_side' } },
      layers: [['..', 'cc'], ['..', '..']] },
  ],
  pieces(prefix, style, context): [
    {
      id: prefix + '_' + pose.id, style: style, lootContext: context,
      size: [2, 2, 2],
      palette: { '.': { role: 'opening', material: 'opening' } } + pose.palette,
      layers: pose.layers,
      ownership: { layers: [
        [std.join('', [if c == '.' then 'A' else 'S' for c in std.stringChars(row)]) for row in layer]
        for layer in pose.layers
      ] },
      anchors: {}, ports: [],
    }
    for pose in $.poses
  ],
  slot(id, prefix, at, poses=$.poses): {
    id: id, at: at, size: [2, 2, 2], turn: 0,
    choices: [{ ref: { kind: 'piece', id: prefix + '_' + pose.id }, weight: pose.weight } for pose in poses],
  },
}
