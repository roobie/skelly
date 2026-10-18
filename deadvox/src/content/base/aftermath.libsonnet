local base = (import 'furniture.jsonnet').furniture;
local source(id) = std.filter(function(f) f.id == id, base)[0];
// A toppled piece keeps the source's properties except those that only an upright one has.
// `axes` permutes the size; `reverse` is the permuted axis whose shape boxes mirror.
local tipped(id, from, name, axes, reverse, drop) = {
  [field]: source(from)[field] for field in std.objectFields(source(from)) if !std.member(drop, field)
} + {
  id: id,
  name: name,
  size: [source(from).size[a] for a in axes],
} + (if std.objectHas(source(from), 'shape') && !std.member(drop, 'shape') then {
       shape: [
         {
           position: [
             if i == reverse then std.round((source(from).size[axes[i]] - box.position[axes[i]] - box.size[axes[i]]) * 1e6) / 1e6 + 0
             else box.position[axes[i]]
             for i in std.range(0, 2)
           ],
           size: [box.size[a] for a in axes],
         }
         for box in source(from).shape
       ],
     } else {});
local forward = [0, 2, 1];
local sideways = [1, 0, 2];
// Cells the furniture covers, as one char per cell of a pose of `size`.
local fill(size, char) = [[std.join('', [char for x in std.range(1, size[0])]) for z in std.range(1, size[2])] for y in std.range(1, size[1])];
{
  furniture: [
    tipped('chair_on_back', 'chair', 'Chair on its back', forward, 1, ['rest']),
    tipped('chair_on_side', 'chair', 'Chair on its side', sideways, 0, ['rest']),
    // Empty and decorative. Only y reverses, so the lid ends up on the floor; x and z stay in place.
    tipped('crate_overturned', 'crate', 'Overturned crate', [0, 1, 2], 1, ['container', 'loot']),
    tipped('shelf_fallen', 'shelf', 'Fallen shelf', forward, 1, []),
    tipped('shelf_on_side', 'shelf', 'Shelf on its side', sideways, 0, []),
    tipped('wardrobe_fallen', 'wardrobe', 'Fallen wardrobe', forward, 1, []),
    tipped('wardrobe_on_side', 'wardrobe', 'Wardrobe on its side', sideways, 0, []),
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
  cratePoses: [
    { id: 'crate_overturned', weight: 1, size: [2, 2, 2], palette: { c: { furniture: 'crate_overturned' } },
      layers: fill([2, 2, 2], 'c') },
  ],
  shelfPoses: [
    { id: 'shelf_fallen', weight: 1, size: [2, 1, 4], palette: { c: { furniture: 'shelf_fallen' } },
      layers: fill([2, 1, 4], 'c') },
    { id: 'shelf_on_side', weight: 1, size: [4, 2, 1], palette: { c: { furniture: 'shelf_on_side' } },
      layers: fill([4, 2, 1], 'c') },
  ],
  wardrobePoses: [
    { id: 'wardrobe_fallen', weight: 1, size: [2, 1, 4], palette: { c: { furniture: 'wardrobe_fallen' } },
      layers: fill([2, 1, 4], 'c') },
    { id: 'wardrobe_on_side', weight: 1, size: [4, 2, 1], palette: { c: { furniture: 'wardrobe_on_side' } },
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
