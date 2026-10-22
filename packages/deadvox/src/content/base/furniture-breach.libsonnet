// How hard a piece of furniture is to break (`packages/deadvox/DESIGN.md`, "Block entities"). Every piece yields to
// enough strength; these kinds give a piece that sets no breach of its own a value its kind implies. A door leaf
// authors its own, because flimsy and burglary-safe leaves must not yield alike. Ladders and scenario goals are kept
// out of reach of every zombie and weapon by strength, not by a flag.
{
  light: { minimumStrength: 3.5, durability: 60 },
  sturdy: { minimumStrength: 9, durability: 300 },
  kept: { minimumStrength: 40, durability: 4000 },
  local leaf(piece) = std.objectHas(piece, 'door') && !(std.objectHas(piece, 'shape') && std.objectHas(piece, 'container')),
  kindOf(piece)::
    if std.objectHas(piece, 'climbable') || std.objectHas(piece, 'scenarioGoal') then $.kept
    else if std.objectHas(piece, 'vehicle') then $.sturdy
    else $.light,
  breakable(pieces):: [
    assert std.objectHas(piece, 'breach') || !leaf(piece) : 'door leaf "%s" needs its own breach' % piece.id;
    piece + (if std.objectHas(piece, 'breach') then {} else { breach: $.kindOf(piece) })
    for piece in pieces
  ],
  breaking(document):: document + { furniture: $.breakable(document.furniture) },
}
