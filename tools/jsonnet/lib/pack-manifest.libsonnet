function(id, tier, content=[], assets={ sources: [] }, json=[], dependencies=[], overrides=[], product=false, defaultStart=null, optIn=false)
  local built = if std.objectHasAll(assets, 'releasedFiles') then assets.releasedFiles else [];
  local isJson(path) = std.endsWith(path, '.json');
  {
    id: id,
    version: '1',
    tier: tier,
    product: product,
    [if defaultStart != null then 'defaultStart']: defaultStart,
    [if optIn then 'optIn']: true,
    dependencies: dependencies,
    overrides: overrides,
    files: [{ path: name + '.json', kind: 'content' } for name in content] +
           [{ path: path, kind: 'json' } for path in std.uniq(std.sort(json + std.filter(isJson, built)))] +
           [
             { path: file, kind: 'asset' }
             for file in std.uniq(std.sort(
               std.flattenArrays([source.files for source in assets.sources]) +
               std.filter(function(path) !isJson(path), built)
             ))
           ],
  }
