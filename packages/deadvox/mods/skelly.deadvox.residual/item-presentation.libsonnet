local metadata = import 'presentation/item-materials.json';
local prefixes = {
  steel: 'metal', alu: 'metal', brass: 'metal', copper: 'metal', scrap: 'metal', paint: 'metal',
  cloth: 'cloth', cord: 'cloth', wood: 'wood', rubber: 'polymer', plastic: 'polymer', polymer: 'polymer',
  glass: 'glass', paperboard: 'paper', body: 'organic', wax: 'wax', tape: 'polymer', stone: 'mineral', fuel: 'fuel',
};
local overrides = {
  broken_clock: ['polymer', 'metal', 'paper', 'glass'],
  broken_toaster: ['metal', 'polymer', 'metal'],
  circuit_board: ['polymer', 'metal', 'polymer', 'metal'],
  cloth_bundle: ['cloth', 'cloth'],
  cracked_phone: ['polymer', 'glass', 'metal'],
  electrical_repair_kit: ['polymer', 'metal', 'polymer', 'metal'],
  glass_bulb: ['glass', 'metal', 'metal'],
  glass_lens: ['glass', 'glass'],
  glass_shards: ['glass'],
  lamp_oil_bottle: ['glass', 'metal', 'paper', 'fuel'],
  riot_helmet_view: ['glass', 'polymer'],
  rubber_strip: ['polymer', 'polymer'],
  sewing_kit: ['polymer', 'cloth', 'metal', 'polymer'],
  stab_vest: ['cloth', 'cloth'],
  table_fan: ['metal', 'polymer', 'metal'],
  wood_offcut: ['wood', 'wood'],
  folded_note: ['paper', 'paper'], paper_sheet: ['paper', 'paper'], notebook: ['paper', 'paper'],
  glowstick: ['polymer', 'polymer'],
  apple: ['organic', 'wood', 'organic'], beans: ['organic', 'organic'], soup: ['organic', 'organic'],
  bandage: ['cloth', 'paper'], baseball_cap: ['cloth', 'polymer'], hoodie: ['cloth', 'polymer'],
  jacket: ['cloth', 'polymer'], jeans: ['cloth'], rubber_boots: ['polymer', 'polymer'],
  school_backpack: ['cloth', 'polymer'], school_backpack_worn: ['cloth', 'polymer', 'polymer'], school_backpack_worn_jacket: ['cloth', 'polymer', 'polymer'],
  fanny_pack: ['cloth', 'polymer'], fanny_pack_worn: ['cloth', 'polymer'], fanny_pack_worn_jacket: ['cloth', 'polymer'],
  utility_vest: ['cloth', 'polymer'], utility_vest_worn: ['cloth', 'cloth'], utility_vest_worn_jacket: ['cloth', 'cloth'],
  stab_vest_worn: ['cloth', 'polymer'], stab_vest_worn_jacket: ['cloth', 'polymer'],
  worn_hoodie_body: ['cloth', 'polymer'], worn_hoodie_fore: ['cloth', 'polymer'], worn_hoodie_upper: ['cloth'],
};
local classify(material) =
  local matches = [prefixes[p] for p in std.objectFields(prefixes) if material != null && std.startsWith(material, p)];
  assert std.length(matches) == 1 : 'Material needs an explicit wear class: ' + std.toString(material);
  matches[0];
local fillModels = ['lamp_oil_bottle', 'lighter', 'oil_lamp'];
local decorate(model) =
  local asset = metadata[model.file];
  local filename = std.strReplace(std.strReplace(model.file, 'assets/models/', ''), '.glb', '');
  local materials = if std.objectHas(overrides, filename) then overrides[filename] else [classify(m) for m in asset.materials];
  assert std.length(materials) == std.length(asset.materials) : 'Wear classes must cover every material: ' + model.id;
  model + { itemPresentation: {
    materials: materials,
    wear: 'core',
    supply: if std.member(fillModels, model.id) then {
      kind: 'fill', piece: if std.member(['lighter', 'oil_lamp'], model.id) then 'fuel_fill:fuel_fill' else 'fuel-fill', axis: 'y',
      bands: [{ from: 0, scale: 0 }, { from: 0.01, scale: 0.2 }, { from: 0.35, scale: 0.5 }, { from: 0.7, scale: 1 }],
    } else { kind: 'none' },
  } };
{
  pack(pack): pack + { models: [decorate(model) for model in pack.models] },
}
