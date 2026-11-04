function(id, tier, content=[], guns=[], things=[], assets={ sources: [] }, json=[], dependencies=[], overrides=[], product=false, defaultStart=null)
{
  id: id,
  version: '1',
  tier: tier,
  product: product,
  [if defaultStart != null then 'defaultStart']: defaultStart,
  dependencies: dependencies,
  overrides: overrides,
  files: [{ path: name + '.json', kind: 'content' } for name in content] +
         [{ path: 'gungen/' + name + '.model.json', kind: 'json' } for name in guns] +
         [{ path: 'things/' + model.id + '.model.json', kind: 'json' } for model in things] +
         [{ path: path, kind: 'json' } for path in json] +
         [{ path: file, kind: 'asset' } for file in std.uniq(std.sort(std.flattenArrays([source.files for source in assets.sources])))],
}
