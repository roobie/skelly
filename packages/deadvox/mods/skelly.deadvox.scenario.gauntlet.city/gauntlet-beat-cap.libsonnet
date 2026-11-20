// A building holds at most three beats whatever its slots draw: each slot counts its worst
// alternative, so neither weights nor aftermath odds can lift a building past the cap. Why:
// `packages/deadvox/docs/aftermath.md`, "How many beats".
local cap = 3;
function(content)
  local beats = { [piece.id]: std.get(piece, 'beats', 0) for piece in content.mapPieces };
  local pools = { [pool.id]: pool for pool in content.mapPools };
  local choices(slot) = if std.objectHas(slot, 'choices') then slot.choices else pools[slot.pool].choices;
  local worst = {
    [assembly.id]: std.foldl(function(sum, slot) sum + std.foldl(std.max, [
      if choice.ref.kind == 'assembly' then std.get(worst, choice.ref.id, 0) else std.get(beats, choice.ref.id, 0)
      for choice in choices(slot)
    ], 0), assembly.slots, 0)
    for assembly in content.mapAssemblies
  };
  local over = [id + ' can draw ' + worst[id] + ' beats' for id in std.objectFields(worst) if worst[id] > cap];
  assert over == [] : 'a building holds at most ' + cap + ' beats: ' + std.join('; ', over);
  content
