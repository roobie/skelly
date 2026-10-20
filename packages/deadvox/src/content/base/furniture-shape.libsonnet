// Where a shaped piece collides. `solidFill` is low enough that any visibly solid part of a block stops the
// player and light, and high enough that a sliver of trim reaching into the next block does not.
{
  solidFill: 0.01,
  // Gives each solid shaped piece that is not a door the shared threshold unless it sets its own, so a new
  // piece collides by its drawn shape without restating the value.
  collide(pieces):: [
    piece + (
      if std.objectHas(piece, 'shape') && std.get(piece, 'solid', true) != false
         && !std.objectHas(piece, 'door') && !std.objectHas(piece, 'solidFill')
      then { solidFill: $.solidFill }
      else {}
    )
    for piece in pieces
  ],
  colliding(document):: document + { furniture: $.collide(document.furniture) },
}
