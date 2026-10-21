// Cells the furniture covers, as one char per cell of a pose of `size`.
local fill(size, char) = [[std.join('', [char for x in std.range(1, size[0])]) for z in std.range(1, size[2])] for y in std.range(1, size[1])];
{
  furniture: [],
  poses: [
    { id: 'pushed', weight: 3, palette: { c: { furniture: 'chair', facing: 'w' } },
      layers: [['..', '.c'], ['..', '.c']] },
    { id: 'turned', weight: 2, palette: { c: { furniture: 'chair', facing: 's' } },
      layers: [['c.', '..'], ['c.', '..']] },
    { id: 'back', weight: 2, palette: { c: { furniture: 'chair', tip: 'back' } },
      layers: [['.c', '.c'], ['..', '..']] },
    { id: 'side', weight: 2, palette: { c: { furniture: 'chair', tip: 'left' } },
      layers: [['..', 'cc'], ['..', '..']] },
  ],
  cratePoses: [
    { id: 'crate_overturned', weight: 1, size: [2, 2, 2], palette: { c: { furniture: 'crate', tip: 'top' } },
      layers: fill([2, 2, 2], 'c') },
  ],
  shelfPoses: [
    { id: 'shelf_fallen', weight: 1, size: [2, 1, 4], palette: { c: { furniture: 'shelf', tip: 'back' } },
      layers: fill([2, 1, 4], 'c') },
    { id: 'shelf_on_side', weight: 1, size: [4, 2, 1], palette: { c: { furniture: 'shelf', tip: 'left' } },
      layers: fill([4, 2, 1], 'c') },
  ],
  wardrobePoses: [
    { id: 'wardrobe_fallen', weight: 1, size: [2, 1, 4], palette: { c: { furniture: 'wardrobe', tip: 'back' } },
      layers: fill([2, 1, 4], 'c') },
    { id: 'wardrobe_on_side', weight: 1, size: [4, 2, 1], palette: { c: { furniture: 'wardrobe', tip: 'left' } },
      layers: fill([4, 2, 1], 'c') },
  ],
  pieces(prefix, style, context, poses=$.poses): [
    {
      id: prefix + '_' + pose.id, style: style, lootContext: context,
      size: std.get(pose, 'size', [2, 2, 2]),
      palette: { '.': { role: 'opening', material: 'opening' } } + pose.palette,
      layers: pose.layers,
      ownership: { layers: [
        [std.join('', [if c == '.' then 'A' else 'S' for c in std.stringChars(row)]) for row in layer]
        for layer in pose.layers
      ] },
      anchors: {}, ports: [],
    }
    for pose in poses
  ],
  slot(id, prefix, at, poses=$.poses, size=[2, 2, 2]): {
    id: id, at: at, size: size, turn: 0,
    choices: [{ ref: { kind: 'piece', id: prefix + '_' + pose.id }, weight: pose.weight } for pose in poses],
  },
}
