// `metadata` is the calling mod's generated item material file, so a mod classifies only its own models.
// `overrides` name wear classes per model file and `supplies` a model's supply; both belong to that mod.
local prefixes = {
  steel: 'metal', alu: 'metal', brass: 'metal', copper: 'metal', scrap: 'metal', paint: 'metal',
  cloth: 'cloth', cord: 'cloth', wood: 'wood', rubber: 'polymer', plastic: 'polymer', polymer: 'polymer',
  glass: 'glass', paperboard: 'paper', 'paper-': 'paper', body: 'organic', wax: 'wax', tape: 'polymer', stone: 'mineral', fuel: 'fuel',
};
local classify(material) =
  local matches = [prefixes[p] for p in std.objectFields(prefixes) if material != null && std.startsWith(material, p)];
  assert std.length(matches) == 1 : 'Material needs an explicit wear class: ' + std.toString(material);
  matches[0];
function(metadata, overrides={}, supplies={}) {
  local decorate(model) =
    local asset = metadata[model.file];
    local filename = std.strReplace(std.strReplace(model.file, 'assets/models/', ''), '.glb', '');
    local materials = if std.objectHas(overrides, filename) then overrides[filename] else [classify(m) for m in asset.materials];
    assert std.length(materials) == std.length(asset.materials) : 'Wear classes must cover every material: ' + model.id;
    model + { itemPresentation: {
      materials: materials,
      wear: 'core',
      supply: if std.objectHas(supplies, model.id) then supplies[model.id] else { kind: 'none' },
    } },
  pack(pack): pack + { models: [decorate(model) for model in pack.models] },
}
