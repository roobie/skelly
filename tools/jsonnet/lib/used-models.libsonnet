local references(value) =
  if std.isArray(value) then std.flattenArrays([references(entry) for entry in value])
  else if std.isObject(value) then std.flattenArrays([
    if key == 'model' && std.isString(value[key]) then [value[key]]
    else if key == 'overTorso' then std.objectValues(value[key])
    else if key == 'models' then [id for id in value[key] if std.isString(id)]
    else references(value[key])
    for key in std.objectFields(value)
  ])
  else [];
function(index, consumers)
  local used = std.set(references(consumers));
  [model for model in index if std.setMember(model.id, used)]
