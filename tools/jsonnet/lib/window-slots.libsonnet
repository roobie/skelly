// Window bays: a slot that hangs one shared window in a wall, its glass whole or gone, or boarded
// over from the street. A building defines only the pieces that place the window in its wall, since
// a piece carries the building's style and loot context, while the window itself stays shared. Why:
// `packages/deadvox/docs/building-pathway.md`, "Shared pieces".
local furniture = (import 'packages/mods/skelly.structures/windows.jsonnet').furniture;
local boarded = { boarding: { type: 'wood_window_boarding', side: 'front' } };
local panes = {
  casement: [
    { id: 'clear', furniture: 'clear_casement_window' },
    { id: 'broken', furniture: 'broken_casement_window' },
    boarded { id: 'boarded', furniture: 'broken_casement_window' },
  ],
  hinged: [
    { id: 'clear', furniture: 'clear_hinged_window' },
    { id: 'broken', furniture: 'broken_hinged_window' },
    boarded { id: 'boarded', furniture: 'broken_hinged_window' },
  ],
};
// How often a bay draws each pane, unless the building sets its own odds.
local defaultWeights = { clear: 3, broken: 2, boarded: 1 };
local sizeOf(id) = std.filter(function(window) window.id == id, furniture)[0].size;
local across(face) = face == 'e' || face == 'w';
local cells(size, mark) = [
  [std.repeat(mark, size[0]) for _ in std.range(1, size[2])]
  for _ in std.range(1, size[1])
];
// `prefix` names the building's window pieces, `base` carries their style and loot context, `faces`
// lists the wall sides the building's bays face, and `kind` picks the window. `weights` sets the
// building's odds by pane id over the defaults; a weight of 0 leaves that pane out.
function(prefix, base, faces, kind='casement', weights={}) {
  assert std.all([std.objectHas(defaultWeights, id) for id in std.objectFields(weights)]) :
         prefix + ': window weights name only ' + std.join(', ', std.objectFields(defaultWeights)),
  local odds = defaultWeights + weights,
  local drawn = [pane { weight: odds[pane.id] } for pane in panes[kind] if odds[pane.id] > 0],
  assert std.length(drawn) > 0 : prefix + ': window weights leave no pane to draw',
  local window = sizeOf(panes[kind][0].furniture),
  local size(face) = if across(face) then [window[2], window[1], window[0]] else window,
  local pieceId(face, pane) = prefix + '_' + face + '_' + pane.id,
  mapPieces: [
    base + {
      id: pieceId(face, pane), size: size(face),
      palette: {
        W: { furniture: pane.furniture, facing: face, fixed: true }
           + (if std.objectHas(pane, 'boarding') then { boarding: pane.boarding } else {}),
      },
      layers: cells(size(face), 'W'), ownership: { layers: cells(size(face), 'S') },
      anchors: {}, ports: [],
    }
    for face in faces
    for pane in drawn
  ],
  // A bay in the wall facing `face`, whose lowest corner is `at`.
  slot(id, at, face): {
    id: id, at: at, size: size(face), turn: 0,
    choices: [{ ref: { kind: 'piece', id: pieceId(face, pane) }, weight: pane.weight } for pane in drawn],
  },
}
