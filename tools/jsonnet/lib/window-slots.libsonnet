// Window bays: a slot that hangs one shared window in a wall, its glass whole or gone. A building
// defines only the pieces that place the window in its wall, since a piece carries the building's
// style and loot context, while the window itself stays shared. Why:
// `packages/deadvox/docs/building-pathway.md`, "Shared pieces".
local furniture = (import 'packages/mods/skelly.structures/windows.jsonnet').furniture;
local panes = {
  casement: [
    { id: 'clear', furniture: 'clear_casement_window', weight: 3 },
    { id: 'broken', furniture: 'broken_casement_window', weight: 2 },
  ],
  hinged: [
    { id: 'clear', furniture: 'clear_hinged_window', weight: 3 },
    { id: 'broken', furniture: 'broken_hinged_window', weight: 2 },
  ],
};
local sizeOf(id) = std.filter(function(window) window.id == id, furniture)[0].size;
local across(face) = face == 'e' || face == 'w';
local cells(size, mark) = [
  [std.repeat(mark, size[0]) for _ in std.range(1, size[2])]
  for _ in std.range(1, size[1])
];
// `prefix` names the building's window pieces, `base` carries their style and loot context, `faces`
// lists the wall sides the building's bays face, and `kind` picks the window.
function(prefix, base, faces, kind='casement') {
  local window = sizeOf(panes[kind][0].furniture),
  local size(face) = if across(face) then [window[2], window[1], window[0]] else window,
  local pieceId(face, pane) = prefix + '_' + face + '_' + pane.id,
  mapPieces: [
    base + {
      id: pieceId(face, pane), size: size(face),
      palette: { W: { furniture: pane.furniture, facing: face, fixed: true } },
      layers: cells(size(face), 'W'), ownership: { layers: cells(size(face), 'S') },
      anchors: {}, ports: [],
    }
    for face in faces
    for pane in panes[kind]
  ],
  // A bay in the wall facing `face`, whose lowest corner is `at`.
  slot(id, at, face): {
    id: id, at: at, size: size(face), turn: 0,
    choices: [{ ref: { kind: 'piece', id: pieceId(face, pane) }, weight: pane.weight } for pane in panes[kind]],
  },
}
