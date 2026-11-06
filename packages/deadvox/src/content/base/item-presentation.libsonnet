local metadata = import 'presentation/item-materials.json';
// Wear class by a material's first hyphen-separated word, so `steel-blued` and `steel` share one row.
local classes = {
  steel: 'metal', alu: 'metal', brass: 'metal', copper: 'metal', scrap: 'metal', paint: 'metal', metal: 'metal',
  bronze: 'metal', iron: 'metal', lead: 'metal', foil: 'metal', mithril: 'metal', orichalcum: 'metal',
  rust: 'metal', verdigris: 'metal', mirror: 'metal', enamel: 'metal',
  cloth: 'cloth', cord: 'cloth', leather: 'cloth', nylon: 'cloth', webbing: 'cloth', aramid: 'cloth', canvas: 'cloth',
  carpet: 'cloth', felt: 'cloth', fleece: 'cloth', hook: 'cloth', jute: 'cloth', knit: 'cloth', lace: 'cloth',
  lycra: 'cloth', mesh: 'cloth', neoprene: 'cloth', reflective: 'cloth', satin: 'cloth', silk: 'cloth', suede: 'cloth',
  velvet: 'cloth', wool: 'cloth', horsehair: 'cloth', straw: 'cloth',
  wood: 'wood', bark: 'wood', board: 'wood', cork: 'wood',
  rubber: 'polymer', plastic: 'polymer', polymer: 'polymer', tape: 'polymer', foam: 'polymer', latex: 'polymer',
  nitrile: 'polymer', silicone: 'polymer', uhmw: 'polymer', vinyl: 'polymer', lacquer: 'polymer', resin: 'polymer',
  circuit: 'polymer', lcd: 'polymer', screen: 'polymer', iridescent: 'polymer',
  glass: 'glass', lens: 'glass', crystal: 'glass', gem: 'glass', obsidian: 'glass',
  paper: 'paper', paperboard: 'paper', cardboard: 'paper',
  body: 'organic', bone: 'organic', chitin: 'organic', feather: 'organic', flesh: 'organic', fur: 'organic',
  gut: 'organic', hide: 'organic', jelly: 'organic', leaf: 'organic', mushroom: 'organic', pearl: 'organic',
  petal: 'organic', plant: 'organic', scale: 'organic', skin: 'organic', syrup: 'organic', water: 'organic',
  wax: 'wax', beeswax: 'wax',
  stone: 'mineral', brick: 'mineral', ceramic: 'mineral', chalk: 'mineral', clay: 'mineral', coal: 'mineral',
  jade: 'mineral', salt: 'mineral', void: 'mineral',
  fuel: 'fuel', glow: 'fuel',
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
  local word = if material == null then null else std.split(material, '-')[0];
  assert word != null && std.objectHas(classes, word) : 'Material needs an explicit wear class: ' + std.toString(material);
  classes[word];
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
