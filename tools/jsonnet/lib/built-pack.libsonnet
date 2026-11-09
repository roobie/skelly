local built = import 'packages/skelly-assets/built/manifest.json';
local rows(id) = [model for model in built.models if model.pack == id];
local credit(row) = row.credits.author + '\n' + row.credits.licence;
local references(value) =
  if std.isString(value) then [value]
  else if std.isArray(value) then std.flattenArrays([references(entry) for entry in value])
  else if std.isObject(value) then std.flattenArrays([references(value[key]) for key in std.objectFields(value)])
  else [];
{
  consumed(id, consumers, release=built)::
    local declared = if std.objectHas(release.packs, id) then release.packs[id].files else [];
    local models = std.flattenArrays([consumer.models for consumer in consumers if std.objectHas(consumer, 'models')]);
    local sidecarNames = std.set([model.id + '.model.json' for model in models]);
    local wanted = std.set(references(consumers));
    local files = [
      path
      for path in declared
      if std.setMember(path, wanted) || std.setMember(std.split(path, '/')[std.length(std.split(path, '/')) - 1], sidecarNames)
    ];
    local selected = [row for row in release.models if row.pack == id && std.member(files, row.path)];
    {
      files: files,
      sources: [
        local matching = [row for row in selected if credit(row) == key];
        {
          title: 'skelly-assets built models',
          url: 'https://github.com/roobie/skelly-assets',
          author: matching[0].credits.author,
          licence: matching[0].credits.licence,
          download: null,
          files: std.sort([row.path for row in matching]),
          changes: null,
        }
        for key in std.set([credit(row) for row in selected])
      ],
    },
  // One actor figure row per built model with a body: its key and the declared files holding its body, clips and mesh.
  figures(id):: [
    { id: row.id, body: row.body, clips: row.clips, mesh: row.path }
    for row in rows(id)
    if std.objectHas(row, 'body')
  ],
}
