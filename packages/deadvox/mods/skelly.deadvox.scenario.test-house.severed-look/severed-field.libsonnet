local kit = import 'tools/jsonnet/lib/authored-site-kit.libsonnet';
local severed = import 'tools/jsonnet/lib/severed-parts.libsonnet';
// Every part the release cuts lies on a crate top on the open ground east of the garden wall: one row per zombie type,
// running east, so a type's parts lie side by side and the types compare row to row. A crate top holds one pile, so a
// type's parts are split over a few crates. Showroom props stand only on authored blocks, so a deck lies under them.
local perCrate = 5;
local columnGap = 2;
local rowGap = 1.5;
local margin = 1;
local first = [6, 21, 6];
local types = std.set([part.type for part in severed.parts]);
local partsOf(type) = [part for part in severed.parts if part.type == type];
local columns = std.foldl(std.max, [std.ceil(std.length(partsOf(type)) / perCrate) for type in types], 0);
local centre = std.floor(std.length(types) / 2);
local blocks(metres) = std.ceil(metres * 2);
local deckSize = [blocks(columnGap * columns + 2 * margin), 1, blocks(rowGap * std.length(types) + 2 * margin)];
local deck = {
  id: 'test_house_severed_deck', size: deckSize,
  palette: { d: 'dressed_stone' },
  layers: [[std.repeat('d', deckSize[0]) for z in std.range(1, deckSize[2])]],
  lootContext: { usage: ['Residential'], tier: 'Tier1' },
};
{
  deck: deck + { ownership: kit.piece(deck).ownership },
  deckPosition: [first[0] - margin, first[1] - 0.5, first[2] - margin],
  centre: centre,
  crates: std.flattenArrays([
    local row = std.find(type, types)[0];
    local parts = partsOf(type);
    [
      {
        row: row,
        position: [first[0] + columnGap * column, first[1], first[2] + rowGap * row],
        items: [{ item: part.model.id, placement: 'surface' } for part in parts[column * perCrate:(column + 1) * perCrate]],
      }
      for column in std.range(0, std.ceil(std.length(parts) / perCrate) - 1)
    ]
    for type in types
  ]),
  // West of the field, level with the centre row.
  spawn: [first[0] - 4, first[1], first[2] + rowGap * centre + 0.5],
}
