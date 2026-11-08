// The files skelly-assets builds for a pack, read from its pinned manifest, so a pack declares what it ships without
// copying the list.
local built = import 'packages/skelly-assets/built/manifest.json';
local rows(id) = [model for model in built.models if model.pack == id];
local credit(row) = row.credits.author + '\n' + row.credits.licence;
{
  files(id):: if std.objectHas(built.packs, id) then built.packs[id].files else [],
  // One credit source per author and licence among the pack's built models.
  sources(id):: [
    local matching = [row for row in rows(id) if credit(row) == key];
    {
      title: 'skelly-assets built models',
      url: 'https://github.com/roobie/skelly-assets',
      author: matching[0].credits.author,
      licence: matching[0].credits.licence,
      download: null,
      files: std.sort([row.path for row in matching]),
      changes: null,
    }
    for key in std.set([credit(row) for row in rows(id)])
  ],
}
